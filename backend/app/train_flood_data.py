from __future__ import annotations

from typing import Any

import httpx
import numpy as np

from app.flood_xgboost import FLOOD_FEATURE_NAMES
from app.zone_catalog import ZONES

ARCHIVE_API = "https://archive-api.open-meteo.com/v1/archive"
FLOOD_API = "https://flood-api.open-meteo.com/v1/flood"
GLOFAS_REANALYSIS_END = "2022-07-31"


def fetch_historical_discharge(zone: dict, start: str, end: str) -> dict[str, float]:
    discharge_start = max(start, "1984-01-01")
    discharge_end = min(end, GLOFAS_REANALYSIS_END)
    if discharge_start > discharge_end:
        return {}

    response = httpx.get(
        FLOOD_API,
        params={
            "latitude": zone["center"][0],
            "longitude": zone["center"][1],
            "daily": "river_discharge",
            "start_date": discharge_start,
            "end_date": discharge_end,
        },
        timeout=60.0,
    )
    response.raise_for_status()
    daily = response.json().get("daily") or {}
    dates = daily.get("time") or []
    values = daily.get("river_discharge") or []
    return {
        date: float(value)
        for date, value in zip(dates, values)
        if value is not None
    }


def build_flood_dataset(
    start: str, end: str
) -> tuple[np.ndarray, np.ndarray, list[str], int, dict[str, float]]:
    features: list[list[float]] = []
    labels: list[int] = []
    timestamps: list[str] = []
    zones_used = 0
    river_flow_thresholds: dict[str, float] = {}
    for zone in ZONES:
        response = httpx.get(
            ARCHIVE_API,
            params={
                "latitude": zone["center"][0],
                "longitude": zone["center"][1],
                "start_date": start,
                "end_date": end,
                "hourly": "precipitation,relative_humidity_2m",
                "timezone": "UTC",
            },
            timeout=60.0,
        )
        response.raise_for_status()
        hourly = response.json().get("hourly") or {}
        times = hourly.get("time") or []
        rain = np.array([float(value or 0) for value in hourly.get("precipitation") or []], dtype=np.float32)
        humidity = hourly.get("relative_humidity_2m") or []
        discharge_by_date = fetch_historical_discharge(zone, start, end)
        if len(rain) < 100 or len(discharge_by_date) < 100:
            continue
        flow_threshold = float(np.percentile(list(discharge_by_date.values()), 95))
        if flow_threshold <= 0:
            continue
        zones_used += 1
        river_flow_thresholds[zone["id"]] = round(flow_threshold, 2)
        for index in range(72, len(rain) - 24, 3):
            current_discharge = discharge_by_date.get(times[index][:10])
            next_day_discharge = discharge_by_date.get(times[index + 24][:10])
            if current_discharge is None or next_day_discharge is None:
                continue
            rain24 = float(rain[index - 24 : index].sum())
            rain72 = float(rain[index - 72 : index].sum())
            forecast24 = float(rain[index : index + 24].sum())
            current_humidity = float(humidity[index] or 75) if index < len(humidity) else 75.0
            features.append([
                float(rain[index]),
                rain24,
                rain72,
                float(rain[index - 6 : index].mean() * 24),
                current_humidity,
                float(zone["slope"]),
                float(zone["elevation"]),
                float(zone["riverProximityKm"]),
                float(zone["soilSaturationInitial"]),
                float(zone.get("imperviousFraction", 0.3)),
                float(zone["catchmentAreaKm2"]),
                current_discharge,
                current_discharge / flow_threshold,
            ])
            rain_threshold = max(25.0, 65.0 - zone["riverProximityKm"] * 15.0)
            labels.append(int(forecast24 >= rain_threshold or next_day_discharge >= flow_threshold))
            timestamps.append(times[index])
    if not features or len(set(labels)) < 2:
        raise RuntimeError(
            "Historical data did not produce both flood-risk classes with GloFAS coverage; "
            "river-discharge training is limited to dates through 2022-07-31."
        )
    return (
        np.asarray(features, dtype=np.float32),
        np.asarray(labels, dtype=np.int8),
        timestamps,
        zones_used,
        river_flow_thresholds,
    )