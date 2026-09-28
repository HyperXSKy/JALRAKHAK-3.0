from __future__ import annotations

import asyncio
import os
import json
import smtplib
import ssl
import time
from email.message import EmailMessage
from typing import Any, Literal
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.flood_xgboost import FLOOD_MODEL
from app.fusion import fuse_zone
from app.hls_inundation_model import HLS_INUNDATION_MODEL, METADATA_PATH as HLS_METADATA_PATH
from app.open_meteo import fetch_glofas_discharge, fetch_model_forecast
from app.risk import calculate_zone_risk, generate_alert
from app.zone_catalog import ZONES, get_zone

Scenario = Literal["LIVE", "CLOUDBURST", "MONSOON_SURGE", "DRY_BASELINE"]
ALERT_WEBHOOK_URL = os.getenv("ALERT_WEBHOOK_URL", "").strip()
ALERT_WEBHOOK_TOKEN = os.getenv("ALERT_WEBHOOK_TOKEN", "").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = os.getenv("SMTP_PORT", "587").strip()
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_SECURITY = os.getenv("SMTP_SECURITY", "starttls").strip().lower()
ALERT_EMAIL_FROM = os.getenv("ALERT_EMAIL_FROM", "").strip()
ALERT_EMAIL_TO = os.getenv("ALERT_EMAIL_TO", "").strip()
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "").strip()
ALERT_SMS_TO = os.getenv("ALERT_SMS_TO", "").strip()


class AlertDeliveryRequest(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    zoneName: str = Field(min_length=1, max_length=200)
    region: str = Field(min_length=1, max_length=200)
    level: Literal["High", "Severe"]
    hazardType: str = Field(min_length=1, max_length=80)
    headline: str = Field(min_length=1, max_length=500)
    recommendation: str = Field(min_length=1, max_length=2000)
    timestamp: str = Field(min_length=1, max_length=80)
    compositeScore: int = Field(ge=0, le=100)
    channel: Literal["webhook", "email", "sms"] = "webhook"

app = FastAPI(
    title="JALRAKSHAK API",
    version="3.0.0",
    description="Integrated heavy-rainfall early warning and inundation risk service for SIH26071.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST"],
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


@app.get("/api/alerts/delivery-status")
async def alert_delivery_status() -> dict[str, Any]:
    try:
        parsed_webhook = urlparse(ALERT_WEBHOOK_URL)
        webhook_configured = parsed_webhook.scheme.lower() == "https" and bool(parsed_webhook.hostname)
    except ValueError:
        webhook_configured = False
    try:
        int(SMTP_PORT)
        email_configured = bool(SMTP_HOST and ALERT_EMAIL_FROM and ALERT_EMAIL_TO)
    except ValueError:
        email_configured = False
    sms_configured = bool(
        TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER and ALERT_SMS_TO
    )
    channels = {
        "webhook": webhook_configured,
        "email": email_configured,
        "sms": sms_configured,
    }
    return {
        "configured": any(channels.values()),
        "channels": channels,
    }


@app.post("/api/alerts/deliver")
async def deliver_alert(alert: AlertDeliveryRequest) -> dict[str, Any]:
    message = (
        f"{alert.level.upper()} FLOOD EARLY WARNING | {alert.zoneName}, {alert.region} | "
        f"{alert.hazardType.replace('_', ' ')} | Score {alert.compositeScore}/100. "
        f"{alert.recommendation}"
    )
    channel = alert.channel

    if channel == "webhook":
        webhook_url = urlparse(ALERT_WEBHOOK_URL)
        if webhook_url.scheme.lower() != "https" or not webhook_url.hostname:
            raise HTTPException(status_code=503, detail="A valid HTTPS ALERT_WEBHOOK_URL is not configured.")
        payload = {
            "event": "jalrakshak.early_warning",
            "text": message,
            "content": message,
            "alert": alert.model_dump(),
        }
        headers = {"Authorization": f"Bearer {ALERT_WEBHOOK_TOKEN}"} if ALERT_WEBHOOK_TOKEN else {}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(ALERT_WEBHOOK_URL, json=payload, headers=headers)
                response.raise_for_status()
        except httpx.HTTPError as error:
            raise HTTPException(status_code=502, detail="The configured alert webhook rejected delivery.") from error
        return {"delivered": True, "channel": channel, "statusCode": response.status_code, "alertId": alert.id}

    if channel == "email":
        if not (SMTP_HOST and ALERT_EMAIL_FROM and ALERT_EMAIL_TO):
            raise HTTPException(status_code=503, detail="SMTP and alert email settings are not configured.")
        email = EmailMessage()
        email["Subject"] = f"{alert.level.upper()} flood warning: {alert.zoneName}"
        email["From"] = ALERT_EMAIL_FROM
        email["To"] = ALERT_EMAIL_TO
        email.set_content(message)

        def send_email() -> None:
            port = int(SMTP_PORT)
            if SMTP_SECURITY == "ssl":
                with smtplib.SMTP_SSL(SMTP_HOST, port, timeout=10, context=ssl.create_default_context()) as client:
                    if SMTP_USERNAME:
                        client.login(SMTP_USERNAME, SMTP_PASSWORD)
                    client.send_message(email)
                return
            with smtplib.SMTP(SMTP_HOST, port, timeout=10) as client:
                if SMTP_SECURITY == "starttls":
                    client.starttls(context=ssl.create_default_context())
                if SMTP_USERNAME:
                    client.login(SMTP_USERNAME, SMTP_PASSWORD)
                client.send_message(email)

        try:
            await asyncio.to_thread(send_email)
        except (OSError, smtplib.SMTPException, ValueError) as error:
            raise HTTPException(status_code=502, detail="SMTP alert delivery failed.") from error
        return {"delivered": True, "channel": channel, "alertId": alert.id}

    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER and ALERT_SMS_TO):
        raise HTTPException(status_code=503, detail="Twilio SMS settings are not configured.")
    twilio_url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                twilio_url,
                data={"From": TWILIO_FROM_NUMBER, "To": ALERT_SMS_TO, "Body": message},
                auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            )
            response.raise_for_status()
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="Twilio SMS delivery failed.") from error
    return {"delivered": True, "channel": channel, "statusCode": response.status_code, "alertId": alert.id}


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
    weather, river_discharge = await asyncio.gather(
        fetch_model_forecast(lat, lng),
        fetch_glofas_discharge(lat, lng),
    )
    nearest_zone = min(
        ZONES,
        key=lambda zone: (zone["center"][0] - lat) ** 2
        + ((zone["center"][1] - lng) * 0.89) ** 2,
    )
    weather["riverDischarge"] = river_discharge
    FLOOD_MODEL.add_river_context(nearest_zone, weather)
    return {
        **weather,
        "lastUpdated": time.strftime("%H:%M:%S UTC", time.gmtime()),
        "dataQuality": "live",
    }


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
        weather, river_discharge = await asyncio.gather(
            fetch_model_forecast(lat, lng),
            fetch_glofas_discharge(lat, lng),
        )
        weather["riverDischarge"] = river_discharge
        nearest_zone = min(
            ZONES,
            key=lambda zone: (zone["center"][0] - lat) ** 2
            + ((zone["center"][1] - lng) * 0.89) ** 2,
        )
        FLOOD_MODEL.add_river_context(nearest_zone, weather)
        screening = HLS_INUNDATION_MODEL.predict(lat, lng, weather)
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