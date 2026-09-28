from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import xgboost as xgb

from app.config import MODEL_DIR

FLOOD_MODEL_PATH = MODEL_DIR / "flood_risk_xgboost.json"
FLOOD_METADATA_PATH = MODEL_DIR / "flood_risk_xgboost.metadata.json"

FLOOD_FEATURE_NAMES = [
    "current_rain_mm_h",
    "rain_24h_mm",
    "rain_72h_mm",
    "forecast_24h_mm",
    "humidity_percent",
    "slope_degrees",
    "elevation_m",
    "river_proximity_km",
    "soil_saturation_percent",
    "impervious_fraction",
    "catchment_area_km2",
    "river_discharge_m3s",
    "river_discharge_p95_ratio",
]


def flood_features(zone: dict, weather: dict) -> np.ndarray:
    return np.array(
        [[
            float(weather.get("currentRateMmPerHour") or 0),
            float(weather.get("last24hMm") or 0),
            float(weather.get("last72hMm") or 0),
            float(weather.get("forecastNext24hMm") or 0),
            float(weather.get("humidityPercent") or 75),
            float(zone.get("slope") or 0),
            float(zone.get("elevation") or 0),
            float(zone.get("riverProximityKm") or 0),
            float(zone.get("soilSaturationInitial") or 0),
            float(zone.get("imperviousFraction") or 0),
            float(zone.get("catchmentAreaKm2") or 0),
            float((weather.get("riverDischarge") or {}).get("currentM3s"))
            if (weather.get("riverDischarge") or {}).get("currentM3s") is not None
            else np.nan,
            float((weather.get("riverDischarge") or {}).get("highFlowRatio"))
            if (weather.get("riverDischarge") or {}).get("highFlowRatio") is not None
            else np.nan,
        ]],
        dtype=np.float32,
    )


class FloodRiskXGBoost:
    def __init__(self) -> None:
        self.model: xgb.Booster | None = None
        self.metadata: dict[str, Any] = {}

    def load(self) -> None:
        if not FLOOD_MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Flood model is missing at {FLOOD_MODEL_PATH}. "
                "Run: python backend/train_flood_xgboost.py"
            )
        model = xgb.Booster()
        model.load_model(FLOOD_MODEL_PATH)
        self.model = model
        if FLOOD_METADATA_PATH.exists():
            self.metadata = json.loads(FLOOD_METADATA_PATH.read_text(encoding="utf-8"))

    def add_river_context(self, zone: dict, weather: dict) -> None:
        if self.model is None or "riverFlowP95M3sByZone" not in self.metadata:
            self.load()
        thresholds = self.metadata.get("riverFlowP95M3sByZone", {})
        threshold = thresholds.get(zone.get("id"))
        telemetry = weather.get("riverDischarge") or {
            "source": "GloFAS via Open-Meteo Flood API",
            "latitude": None,
            "longitude": None,
            "currentDate": None,
            "currentM3s": None,
            "nextDayM3s": None,
            "peakM3s": None,
            "daily": [],
        }
        current_flow = telemetry.get("currentM3s")
        telemetry["highFlowThresholdM3s"] = threshold
        telemetry["highFlowRatio"] = (
            float(current_flow) / float(threshold)
            if current_flow is not None and threshold is not None and float(threshold) > 0
            else None
        )
        weather["riverDischarge"] = telemetry

    def predict(self, zone: dict, weather: dict) -> dict[str, Any]:
        feature_values = flood_features(zone, weather)
        if self.model is None or self.model.num_features() != feature_values.shape[1]:
            self.load()
        features = xgb.DMatrix(feature_values)
        probability = float(self.model.predict(features)[0])
        holdout = self.metadata.get("chronologicalHoldout", {})
        decision_threshold = float(holdout.get("decisionThreshold", 0.35))
        moderate_threshold = decision_threshold * 0.6
        return {
            "probability": round(probability, 3),
            "proxyProbability": round(probability, 3),
            "riskPercent": round(probability * 100, 1),
            "level": "Severe" if probability >= 0.95 else "High" if probability >= decision_threshold else "Moderate" if probability >= moderate_threshold else "Low",
            "decisionThreshold": round(decision_threshold, 3),
            "scoreMeaning": "Score for rainfall-triggered or GloFAS high-flow proxy labels; not a calibrated probability of an observed flood or bank overflow.",
            "observedEventProbability": False,
            "model": self.metadata,
        }


FLOOD_MODEL = FloodRiskXGBoost()