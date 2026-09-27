from __future__ import annotations

import math

import numpy as np

from app.config import MODEL_PATH

FEATURE_NAMES = [
    "obs_rate",
    "sat_rate",
    "radar_nowcast",
    "nwp_3h",
    "nwp_24h",
    "humidity",
    "antecedent_72h",
    "hour_sin",
    "hour_cos",
    "elevation_norm",
    "impervious",
]


def _features_from_row(row: dict) -> np.ndarray:
    hour = float(row.get("hour", 15.0))
    return np.array(
        [
            float(row["obs_rate"]),
            float(row["sat_rate"]),
            float(row["radar_nowcast"]),
            float(row["nwp_3h"]),
            float(row["nwp_24h"]),
            float(row["humidity"]),
            float(row["antecedent_72h"]),
            math.sin(2 * math.pi * hour / 24.0),
            math.cos(2 * math.pi * hour / 24.0),
            float(row["elevation"]) / 800.0,
            float(row["impervious"]),
        ],
        dtype=np.float64,
    )


def _expand(x: np.ndarray) -> np.ndarray:
    """Linear + selected interaction terms for a compact ridge model."""
    obs, sat, radar, nwp3, nwp24, hum, a72, hs, hc, elev, imp = x
    extra = np.array(
        [
            obs * sat,
            radar * nwp3,
            a72 * obs,
            hum / 100.0 * obs,
            imp * nwp24,
            1.0,
        ],
        dtype=np.float64,
    )
    return np.concatenate([x, extra])


class RidgeNowcast:
    def __init__(self) -> None:
        self.weights: np.ndarray | None = None
        self.mean: np.ndarray | None = None
        self.std: np.ndarray | None = None
        self.metrics: dict = {}

    def load_or_train(self) -> None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Historical nowcast model is missing at {MODEL_PATH}. "
                "Run: python backend/train_historical_nowcast.py"
            )
        data = np.load(MODEL_PATH)
        self.weights = data["weights"]
        self.mean = data["mean"]
        self.std = data["std"]
        self.metrics = {
            "r2": round(float(data["r2"]), 3),
            "mae_mm": round(float(data["mae"]), 2),
            "n": int(data["n"]),
            "method": "ridge_multsource_blend",
        }
        for key in ("data_source", "period_start", "period_end", "zones"):
            if key in data:
                value = data[key]
                self.metrics[key] = value.item() if value.shape == () else value.tolist()

    def predict_next_3h(self, features: dict) -> float:
        if self.weights is None:
            self.load_or_train()
        x = _expand(_features_from_row(features))
        z = (x - self.mean) / self.std
        y = float(z @ self.weights)
        return max(0.0, round(y, 1))


MODEL = RidgeNowcast()
