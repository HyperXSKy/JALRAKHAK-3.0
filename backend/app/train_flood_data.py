from __future__ import annotations

from typing import Any

import httpx
import numpy as np

from app.flood_xgboost import FLOOD_FEATURE_NAMES
from app.zone_catalog import ZONES

ARCHIVE_API = "https://archive-api.open-meteo.com/v1/archive"


def build_flood_dataset(start: str, end: str) -> tuple[np.ndarray, np.ndarray, list[str], int]:
    features: list[list[float]] = []
    labels: list[int] = []
    timestamps: list[str] = []
    zones_used = 0
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
        if len(rain) < 100:
            continue
        zones_used += 1
        for index in range(72, len(rain) - 24, 3):
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
            ])
            # Proxy event: unusually wet next 24h combined with local exposure.
            # This is deliberately broad enough for a usable training balance;
            # replace it with observed flood labels when those become available.
            threshold = max(25.0, 65.0 - zone["riverProximityKm"] * 15.0)
            labels.append(int(forecast24 >= threshold))
            timestamps.append(times[index])
    if not features or len(set(labels)) < 2:
        raise RuntimeError("Historical data did not produce both flood-risk classes")
    return np.asarray(features, dtype=np.float32), np.asarray(labels, dtype=np.int8), timestamps, zones_used