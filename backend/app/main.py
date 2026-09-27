from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.flood_xgboost import FLOOD_MODEL
from app.fusion import fuse_zone
from app.hls_inundation_model import HLS_INUNDATION_MODEL, METADATA_PATH as HLS_METADATA_PATH
from app.open_meteo import fetch_model_forecast
from app.risk import calculate_zone_risk, generate_alert
from app.zone_catalog import ZONES, get_zone

Scenario = Literal["LIVE", "CLOUDBURST", "MONSOON_SURGE", "DRY_BASELINE"]

app = FastAPI(
    title="JALRAKSHAK API",
    version="3.0.0",
    description="Integrated heavy-rainfall early warning and inundation risk service for SIH26071.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

_dashboard_cache: dict[str, tuple[float, dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 90.0


async def _build_dashboard(scenario: Scenario) -> dict[str, Any]:
    fused_results = await asyncio.gather(
        *(fuse_zone(zone, scenario) for zone in ZONES),
        return_exceptions=True,
    )
    zones: list[dict[str, Any]] = []
    alerts: list[dict[str, Any]] = []
    failures = 0

    for zone, fused in zip(ZONES, fused_results):
        if isinstance(fused, Exception):
            failures += 1
            fused = await fuse_zone(zone, "DRY_BASELINE")
            fused["fetchErrors"] = ["zone_fusion_failed"]

        weather = fused["weather"]
        assessment = calculate_zone_risk(zone, weather)
        alert = generate_alert(zone, assessment, fused.get("nowcast"))
        zones.append({
            **zone,
            "weather": weather,
            "assessment": assessment,
            "fusion": {
                "sources": fused.get("sources", []),
                "nowcast": fused.get("nowcast", {}),
                "floodRiskModel": fused.get("floodRiskModel", {}),
                "glofas": fused.get("glofas"),
                "fetchErrors": fused.get("fetchErrors", []),
                "fusedAt": fused.get("fusedAt"),
            },
        })
        if alert:
            alerts.append(alert)

    zones.sort(key=lambda item: item["assessment"]["compositeScore"], reverse=True)
    alerts.sort(key=lambda item: item["compositeScore"], reverse=True)
    return {
        "zones": zones,
        "alerts": alerts,
        "scenario": scenario,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "provider": "Open-Meteo + GloFAS + local ridge nowcast",
        "partialFailures": failures,
    }


async def get_dashboard(scenario: Scenario) -> dict[str, Any]:
    key = scenario.upper()
    cached = _dashboard_cache.get(key)
    now = time.monotonic()
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return {**cached[1], "cache": "hit"}

    payload = await _build_dashboard(scenario)
    _dashboard_cache[key] = (now, payload)
    return {**payload, "cache": "miss"}


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "JALRAKSHAK"}


@app.get("/api/zones")
async def zones() -> dict[str, Any]:
    return {"zones": ZONES}


@app.get("/api/dashboard")
async def dashboard(
    scenario: Scenario = Query("LIVE", description="Live or judge-demo scenario"),
) -> dict[str, Any]:
    return await get_dashboard(scenario)


@app.get("/api/zones/{zone_id}")
async def zone_dashboard(zone_id: str, scenario: Scenario = Query("LIVE")) -> dict[str, Any]:
    zone = get_zone(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Monitoring zone not found")
    fused = await fuse_zone(zone, scenario)
    assessment = calculate_zone_risk(zone, fused["weather"])
    return {
        **zone,
        "weather": fused["weather"],
        "assessment": assessment,
        "fusion": fused,
        "alert": generate_alert(zone, assessment, fused.get("nowcast")),
    }


@app.get("/api/weather/point")
async def point_weather(lat: float, lng: float) -> dict[str, Any]:
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=422, detail="Coordinates are outside valid bounds")
    return await fetch_model_forecast(lat, lng)


@app.get("/api/models/hls-inundation")
async def hls_model_metadata() -> dict[str, Any]:
    if not HLS_METADATA_PATH.exists():
        raise HTTPException(status_code=503, detail="Train the HLS model before using this endpoint")
    return json.loads(HLS_METADATA_PATH.read_text(encoding="utf-8"))


@app.get("/api/inundation/hls-screen")
async def hls_inundation_screen(lat: float, lng: float) -> dict[str, Any]:
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=422, detail="Coordinates are outside valid bounds")
    try:
        HLS_INUNDATION_MODEL.load()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    try:
        HLS_INUNDATION_MODEL.nearest_cell(lat, lng)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    try:
        weather = await fetch_model_forecast(lat, lng)
        screening = HLS_INUNDATION_MODEL.predict(lat, lng, weather)
        nearest_zone = min(
            ZONES,
            key=lambda zone: (zone["center"][0] - lat) ** 2
            + ((zone["center"][1] - lng) * 0.89) ** 2,
        )
        flood_proxy = FLOOD_MODEL.predict(nearest_zone, weather)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {
        **screening,
        "location": {"latitude": lat, "longitude": lng},
        "floodRiskModel": {
            **flood_proxy,
            "nearestZoneName": nearest_zone["name"],
        },
        "weather": {
            **weather,
            "lastUpdated": time.strftime("%H:%M:%S UTC", time.gmtime()),
            "dataQuality": "live",
        },
        "weatherInputs": {
            "last24hMm": weather["last24hMm"],
            "last72hMm": weather["last72hMm"],
            "last168hMm": weather.get("last168hMm"),
            "humidity24hPercent": weather.get("humidity24hPercent"),
            "source": "Open-Meteo point forecast / interpolated observations",
        },
    }