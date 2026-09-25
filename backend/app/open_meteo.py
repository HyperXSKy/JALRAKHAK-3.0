from __future__ import annotations

import asyncio
import math
import time
from typing import Any

import httpx

from app.config import OPEN_METEO_BASE, OPEN_METEO_FLOOD, REQUEST_TIMEOUT_S

_UPSTREAM_LIMIT = asyncio.Semaphore(4)


def _sum_slice(values: list, start: int, end: int) -> float:
    chunk = values[max(0, start) : max(0, end)]
    return round(float(sum(v or 0 for v in chunk)), 1)


def _weather_description(code: int, rain_mm: float) -> str:
    if rain_mm >= 20:
        return "Extreme torrential downpour"
    if rain_mm >= 10:
        return "Heavy rainfall"
    if rain_mm >= 2.5:
        return "Moderate rain"
    if rain_mm > 0:
        return "Light intermittent rain"
    if code >= 95:
        return "Thunderstorm activity"
    if code >= 80:
        return "Localized showers"
    if code >= 51:
        return "Drizzle"
    if code >= 3:
        return "Overcast"
    return "Partly cloudy"


def parse_open_meteo(data: dict, label: str) -> dict[str, Any]:
    current_precip = round(float(data.get("current", {}).get("precipitation") or data.get("current", {}).get("rain") or 0), 1)
    hourly = data.get("hourly") or {}
    times: list[str] = hourly.get("time") or []
    precip: list[float] = hourly.get("precipitation") or []
    rain: list[float] = hourly.get("rain") or []
    prob: list[float] = hourly.get("precipitation_probability") or []
    temperatures: list[float] = hourly.get("temperature_2m") or []
    humidities: list[float] = hourly.get("relative_humidity_2m") or []
    winds: list[float] = hourly.get("wind_speed_10m") or []

    current_index = -1
    current_time = (data.get("current") or {}).get("time")
    if current_time:
        prefix = current_time[:13]
        current_index = next((i for i, t in enumerate(times) if t.startswith(prefix)), -1)
    if current_index < 0:
        current_index = min(len(times) - 1, 168) if times else 0

    last24 = _sum_slice(precip, current_index - 24, current_index)
    last72 = _sum_slice(precip, current_index - 72, current_index)
    next24 = _sum_slice(precip, current_index, current_index + 24)
    next3 = _sum_slice(precip, current_index, current_index + 3)
    next6 = _sum_slice(precip, current_index, current_index + 6)

    hourly_forecast = []
    for i in range(current_index, min(current_index + 24, len(times))):
        t = times[i]
        try:
            clock = t[11:16]
        except Exception:
            clock = f"+{i - current_index}h"
        hourly_forecast.append(
            {
                "time": clock,
                "iso": t,
                "precipitationMm": round(float(precip[i] or 0), 1),
                "rainMm": round(float(rain[i] or 0) if i < len(rain) else 0, 1),
                "probability": int(round(prob[i] or 0)) if i < len(prob) else 0,
            }
        )

    daily = data.get("daily") or {}
    daily_dates = daily.get("time") or []
    daily_precip = daily.get("precipitation_sum") or []
    daily_history = []
    for idx, date_str in enumerate(daily_dates):
        daily_history.append(
            {
                "date": date_str[5:] if len(date_str) >= 10 else date_str,
                "rainfallMm": round(float(daily_precip[idx] or 0), 1) if idx < len(daily_precip) else 0,
                "isForecast": idx >= 7,
            }
        )

    current = data.get("current") or {}
    temperature = current.get("temperature_2m")
    humidity = current.get("relative_humidity_2m")
    wind = current.get("wind_speed_10m")
    if temperature is None and current_index < len(temperatures):
        temperature = temperatures[current_index]
    if humidity is None and current_index < len(humidities):
        humidity = humidities[current_index]
    if wind is None and current_index < len(winds):
        wind = winds[current_index]
    return {
        "label": label,
        "currentRateMmPerHour": current_precip,
        "last24hMm": last24,
        "last72hMm": last72,
        "forecastNext24hMm": next24,
        "forecastNext3hMm": next3,
        "forecastNext6hMm": next6,
        "hourlyForecast": hourly_forecast,
        "dailyHistory": daily_history,
        "temperatureC": temperature,
        "humidityPercent": humidity,
        "windSpeedKmh": wind,
        "stationElevationM": data.get("elevation"),
        "generationTimeMs": data.get("generationtime_ms"),
        "liveIsoTimestamp": current.get("time"),
        "weatherDescription": _weather_description(int(current.get("weather_code") or 0), current_precip),
        "isLive": True,
    }


async def fetch_model_forecast(lat: float, lng: float, model: str | None = None) -> dict[str, Any]:
    params = {
        "latitude": f"{lat:.4f}",
        "longitude": f"{lng:.4f}",
        "current": "precipitation,rain,showers,weather_code,temperature_2m,relative_humidity_2m,wind_speed_10m",
        "hourly": "precipitation,rain,precipitation_probability,temperature_2m,relative_humidity_2m,wind_speed_10m",
        "daily": "precipitation_sum,precipitation_hours",
        "past_days": 7,
        "forecast_days": 7,
        "timezone": "auto",
    }
    if model:
        params["models"] = model
    t0 = time.perf_counter()
    async with _UPSTREAM_LIMIT:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
            res = await client.get(OPEN_METEO_BASE, params=params)
            res.raise_for_status()
            data = res.json()
    parsed = parse_open_meteo(data, model or "best_match")
    parsed["fetchMs"] = round((time.perf_counter() - t0) * 1000, 1)
    return parsed


async def fetch_glofas_discharge(lat: float, lng: float) -> dict[str, Any] | None:
    params = {
        "latitude": f"{lat:.4f}",
        "longitude": f"{lng:.4f}",
        "daily": "river_discharge,river_discharge_mean,river_discharge_median",
        "forecast_days": 5,
    }
    try:
        async with _UPSTREAM_LIMIT:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
                res = await client.get(OPEN_METEO_FLOOD, params=params)
                res.raise_for_status()
                data = res.json()
        daily = data.get("daily") or {}
        discharge = daily.get("river_discharge") or []
        return {
            "source": "GloFAS via Open-Meteo Flood API",
            "next5dM3s": [round(float(v or 0), 1) for v in discharge[:5]],
            "peakM3s": round(max((float(v or 0) for v in discharge[:5]), default=0), 1),
        }
    except Exception:
        return None


def scenario_weather(zone: dict, scenario: str) -> dict[str, Any]:
    slope = zone.get("slope", 10)
    river = zone.get("riverProximityKm", 1)
    steep = slope >= 30 or river <= 0.3
    if scenario == "CLOUDBURST":
        current, last24, last72, next24, desc = (38.5, 142.0, 210.0, 85.0, "Severe cloudburst") if steep else (18.2, 82.0, 125.0, 45.0, "Heavy convective cells")
    elif scenario == "MONSOON_SURGE":
        current, last24, last72, next24, desc = 12.8, 94.0, 245.0, 75.0, "Monsoon atmospheric river"
    elif scenario == "DRY_BASELINE":
        current, last24, last72, next24, desc = 0.0, 2.1, 5.4, 1.0, "Dry / clear drainage"
    else:
        current, last24, last72, next24, desc = 3.4, 28.0, 54.0, 18.0, "Regional hydrological fallback"

    hourly = []
    for i in range(24):
        variance = math.sin((i / 24) * math.pi) * (current * 0.8)
        precip = max(0.0, round(current * 0.6 + variance, 1))
        hourly.append({"time": f"+{i}h", "iso": None, "precipitationMm": precip, "rainMm": precip, "probability": min(100, int(60 + precip * 3))})

    daily = []
    for i in range(12):
        base = next24 / 2 if i >= 7 else last72 / 4
        daily.append({"date": f"D{i+1}", "rainfallMm": round(max(0.0, base * (0.6 + (i % 3) * 0.15)), 1), "isForecast": i >= 7})

    return {
        "label": scenario,
        "currentRateMmPerHour": current,
        "last24hMm": last24,
        "last72hMm": last72,
        "forecastNext24hMm": next24,
        "forecastNext3hMm": round(current * 2.4, 1),
        "forecastNext6hMm": round(current * 4.2, 1),
        "hourlyForecast": hourly,
        "dailyHistory": daily,
        "temperatureC": 27.0,
        "humidityPercent": 91 if scenario != "DRY_BASELINE" else 58,
        "windSpeedKmh": 18.0,
        "stationElevationM": zone.get("elevation"),
        "generationTimeMs": 0,
        "liveIsoTimestamp": None,
        "weatherDescription": desc,
        "isLive": False,
    }
