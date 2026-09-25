from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from app.config import IMD_ORANGE_MM, IMD_RED_MM, IMD_YELLOW_MM
from app.flood_xgboost import FLOOD_MODEL
from app.ml_nowcast import MODEL
from app.open_meteo import fetch_glofas_discharge, fetch_model_forecast, scenario_weather


def imd_color(mm_24h: float, rate: float) -> str:
    if mm_24h >= IMD_RED_MM or rate >= 20:
        return "RED"
    if mm_24h >= IMD_ORANGE_MM or rate >= 12:
        return "ORANGE"
    if mm_24h >= IMD_YELLOW_MM or rate >= 7.5:
        return "YELLOW"
    return "GREEN"


def _source(id_: str, label: str, value: float, horizon: str, mode: str, model: str, disclaimer: str) -> dict:
    return {
        "id": id_,
        "label": label,
        "valueMm": round(float(value), 1),
        "horizon": horizon,
        "mode": mode,
        "modelName": model,
        "disclaimer": disclaimer,
    }


async def fuse_zone(zone: dict, scenario: str = "LIVE") -> dict[str, Any]:
    lat, lng = zone["center"]
    live = scenario == "LIVE"
    obs = nwp_gfs = nwp_ecmwf = nwp_icon = None
    glofas = None
    fetch_errors: list[str] = []

    if live:
        tasks = {
            "obs": fetch_model_forecast(lat, lng, None),
            "glofas": fetch_glofas_discharge(lat, lng),
        }
        keys = list(tasks.keys())
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        packed = dict(zip(keys, results))
        for key, val in packed.items():
            if isinstance(val, Exception):
                fetch_errors.append(f"{key}: {val.__class__.__name__}")
            elif key == "obs":
                obs = val
            elif key == "gfs":
                nwp_gfs = val
            elif key == "ecmwf":
                nwp_ecmwf = val
            elif key == "icon":
                nwp_icon = val
            elif key == "glofas":
                glofas = val

    if obs is None:
        if scenario == "LIVE":
            fetch_errors.append("observation_unavailable")
            obs = {
                "currentRateMmPerHour": 0.0,
                "last24hMm": 0.0,
                "last72hMm": 0.0,
                "forecastNext24hMm": 0.0,
                "forecastNext3hMm": 0.0,
                "hourlyForecast": [],
                "dailyHistory": [],
                "temperatureC": None,
                "humidityPercent": None,
                "windSpeedKmh": None,
                "stationElevationM": zone.get("elevation"),
                "generationTimeMs": None,
                "liveIsoTimestamp": None,
                "weatherDescription": "Live weather data unavailable",
                "isLive": False,
                "dataQuality": "unavailable",
            }
        else:
            obs = scenario_weather(zone, scenario)

    gfs24 = (nwp_gfs or obs).get("forecastNext24hMm", obs["forecastNext24hMm"])
    ecm24 = (nwp_ecmwf or obs).get("forecastNext24hMm", obs["forecastNext24hMm"])
    icon24 = (nwp_icon or obs).get("forecastNext24hMm", obs["forecastNext24hMm"])
    nwp_mean_24 = round((gfs24 + ecm24 + icon24) / 3.0, 1)
    nwp_3h = round(
        (
            (nwp_gfs or obs).get("forecastNext3hMm", 0)
            + (nwp_ecmwf or obs).get("forecastNext3hMm", 0)
            + (nwp_icon or obs).get("forecastNext3hMm", 0)
        )
        / 3.0,
        1,
    )

    # Use the live forecast field directly; satellite imagery is not connected.
    sat_rate = round(obs["currentRateMmPerHour"], 1)
    sat_24 = round((icon24 * 0.6 + obs["last24hMm"] * 0.4), 1)

    # Radar-style nowcast proxy: persistence of recent hourly rain (not IMD DWR).
    hourly = obs.get("hourlyForecast") or []
    recent = [h["precipitationMm"] for h in hourly[:3]] or [obs["currentRateMmPerHour"]]
    radar_rate = round(sum(recent) / len(recent), 1)

    mode_obs = "live" if obs.get("isLive") else ("simulated" if scenario not in ("LIVE",) else "unavailable")
    sat_mode = "live_proxy" if live and obs.get("isLive") else ("hindcast" if scenario == "HINDCAST" else ("simulated" if not live else "unavailable"))
    radar_mode = sat_mode
    nwp_mode = "live" if nwp_gfs or nwp_ecmwf else mode_obs

    sources = [
        _source(
            "observation",
            "Gauge / AWS-style observation",
            obs["last24hMm"],
            "past 24h accumulation",
            mode_obs,
            "Open-Meteo best_match (not IMD AWS)",
            "Live observations come from Open-Meteo stationed interpolation, not IMD rain gauges.",
        ),
        _source(
            "satellite",
            "Satellite precipitation blend",
            sat_24,
            "past 24h",
            sat_mode,
            "Open-Meteo best_match precipitation field",
            "Satellite imagery is not connected; this value uses the Open-Meteo forecast precipitation field.",
        ),
        _source(
            "radar",
            "0–3h nowcast (radar-style)",
            radar_rate,
            "mm/h now",
            radar_mode,
            "Hourly persistence nowcast",
            "IMD Doppler Weather Radar is not connected. This is a radar-style nowcast from recent hourly rain.",
        ),
        _source(
            "nwp",
            "Open-Meteo forecast",
            nwp_mean_24,
            "next 24h",
            nwp_mode,
            "Open-Meteo best_match forecast field",
            "One live forecast field is used for predictable response time; this is not IMD NCUM/WRF.",
        ),
    ]

    humidity = float(obs.get("humidityPercent") or 80)
    nowcast_3h = MODEL.predict_next_3h(
        {
            "obs_rate": obs["currentRateMmPerHour"],
            "sat_rate": sat_rate,
            "radar_nowcast": radar_rate,
            "nwp_3h": nwp_3h,
            "nwp_24h": nwp_mean_24,
            "humidity": humidity,
            "antecedent_72h": obs["last72hMm"],
            "hour": datetime.now().hour,
            "elevation": zone.get("elevation", 80),
            "impervious": zone.get("imperviousFraction", 0.3),
        }
    )
    nowcast_6h = round(nowcast_3h * 1.65, 1)
    peak_rate = round(max(obs["currentRateMmPerHour"], radar_rate, nowcast_3h / 3 * 1.2), 1)
    blended_24 = round(0.35 * obs["last24hMm"] + 0.2 * sat_24 + 0.45 * nwp_mean_24, 1)
    color = imd_color(max(blended_24, obs["last24hMm"] + nowcast_3h), peak_rate)

    disagreement = abs(gfs24 - ecm24) + abs(ecm24 - icon24)
    confidence = max(0.35, min(0.92, 0.88 - disagreement / 180.0))

    weather = {
        "currentRateMmPerHour": obs["currentRateMmPerHour"],
        "last24hMm": obs["last24hMm"],
        "last72hMm": obs["last72hMm"],
        "forecastNext24hMm": nwp_mean_24,
        "hourlyForecast": hourly,
        "dailyHistory": obs.get("dailyHistory") or [],
        "lastUpdated": datetime.now(timezone.utc).strftime("%H:%M:%S UTC"),
        "isLive": bool(obs.get("isLive")),
        "weatherDescription": obs.get("weatherDescription"),
        "temperatureC": obs.get("temperatureC"),
        "humidityPercent": obs.get("humidityPercent"),
        "windSpeedKmh": obs.get("windSpeedKmh"),
        "stationElevationM": obs.get("stationElevationM"),
        "generationTimeMs": obs.get("generationTimeMs"),
        "liveIsoTimestamp": obs.get("liveIsoTimestamp"),
        "blended24hMm": blended_24,
    }
    flood_risk = FLOOD_MODEL.predict(zone, weather)

    nowcast = {
        "next3hMm": nowcast_3h,
        "next6hMm": nowcast_6h,
        "peakRateMmPerHour": peak_rate,
        "imdColor": color,
        "leadTimeHours": 3 if color in ("ORANGE", "RED") else 6,
        "confidence": round(confidence, 2),
            "method": "ridge blend of Open-Meteo observation + forecast + rainfall persistence",
        "modelMetrics": MODEL.metrics,
        "nwpMembers": {
            "gfs24hMm": gfs24,
            "ecmwf24hMm": ecm24,
            "icon24hMm": icon24,
        },
    }

    return {
        "weather": weather,
        "sources": sources,
        "nowcast": nowcast,
        "floodRiskModel": flood_risk,
        "glofas": glofas,
        "fetchErrors": fetch_errors,
        "fusedAt": datetime.now(timezone.utc).isoformat(),
    }
