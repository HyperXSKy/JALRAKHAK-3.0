from __future__ import annotations

import os
from pathlib import Path

import httpx
import numpy as np

from app.config import MODEL_DIR, MODEL_PATH
from app.ml_nowcast import _expand, _features_from_row
from app.zone_catalog import ZONES

ARCHIVE_API = "https://archive-api.open-meteo.com/v1/archive"


def fetch_zone_history(zone: dict, start: str, end: str) -> list[dict]:
    response = httpx.get(
        ARCHIVE_API,
        params={
            "latitude": zone["center"][0],
            "longitude": zone["center"][1],
            "start_date": start,
            "end_date": end,
            "hourly": "precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m",
            "timezone": "UTC",
        },
        timeout=60.0,
    )
    response.raise_for_status()
    hourly = response.json().get("hourly") or {}
    times = hourly.get("time") or []
    precipitation = hourly.get("precipitation") or []
    humidity = hourly.get("relative_humidity_2m") or []
    rows = []
    for index, timestamp in enumerate(times):
        if index >= len(precipitation) or precipitation[index] is None:
            continue
        rows.append(
            {
                "time": timestamp,
                "precipitation": float(precipitation[index]),
                "humidity": float(humidity[index]) if index < len(humidity) and humidity[index] is not None else 75.0,
            }
        )
    return rows


def build_dataset(start: str, end: str) -> tuple[np.ndarray, np.ndarray, list[str], int]:
    features: list[np.ndarray] = []
    targets: list[float] = []
    timestamps: list[str] = []
    zones_used = 0

    for zone in ZONES:
        history = fetch_zone_history(zone, start, end)
        if len(history) < 100:
            continue
        zones_used += 1
        rainfall = np.array([row["precipitation"] for row in history], dtype=np.float64)
        for index in range(72, len(history) - 3, 3):
            current = history[index]
            row = {
                "obs_rate": rainfall[index],
                "sat_rate": rainfall[index],
                "radar_nowcast": float(rainfall[index - 2 : index + 1].mean()),
                "nwp_3h": float(rainfall[index - 6 : index].mean() * 3),
                "nwp_24h": float(rainfall[index - 24 : index].sum()),
                "humidity": current["humidity"],
                "antecedent_72h": float(rainfall[index - 72 : index].sum()),
                "hour": int(current["time"][11:13]),
                "elevation": zone.get("elevation", 80),
                "impervious": zone.get("imperviousFraction", 0.3),
            }
            features.append(_expand(_features_from_row(row)))
            targets.append(float(rainfall[index : index + 3].sum()))
            timestamps.append(current["time"])

    if not features:
        raise RuntimeError("Open-Meteo Archive returned no historical rows")
    return np.vstack(features), np.array(targets, dtype=np.float64), timestamps, zones_used


def train(start: str, end: str) -> dict:
    X, y, timestamps, zones_used = build_dataset(start, end)
    chronological_order = np.argsort(np.array(timestamps))
    X = X[chronological_order]
    y = y[chronological_order]
    split = max(1, int(len(y) * 0.8))
    mean = X[:split].mean(axis=0)
    std = X[:split].std(axis=0)
    std[std < 1e-6] = 1.0
    train_z = (X[:split] - mean) / std
    test_z = (X[split:] - mean) / std
    lam = 12.0
    weights = np.linalg.solve(train_z.T @ train_z + lam * np.eye(train_z.shape[1]), train_z.T @ y[:split])
    predictions = test_z @ weights
    actual = y[split:]
    ss_res = float(np.sum((actual - predictions) ** 2))
    ss_tot = float(np.sum((actual - actual.mean()) ** 2))
    r2 = 1.0 - ss_res / max(ss_tot, 1e-9)
    mae = float(np.mean(np.abs(actual - predictions)))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    np.savez(
        MODEL_PATH,
        weights=weights,
        mean=mean,
        std=std,
        r2=r2,
        mae=mae,
        n=len(y),
        data_source="Open-Meteo Archive hourly precipitation",
        period_start=start,
        period_end=end,
        zones=zones_used,
    )
    return {
        "path": str(Path(MODEL_PATH)),
        "n": len(y),
        "zones": zones_used,
        "r2": round(r2, 3),
        "mae_mm": round(mae, 2),
        "data_source": "Open-Meteo Archive hourly precipitation",
        "period_start": start,
        "period_end": end,
    }


if __name__ == "__main__":
    print(train(os.getenv("NOWCAST_HISTORY_START", "2021-01-01"), os.getenv("NOWCAST_HISTORY_END", "2025-12-31")))