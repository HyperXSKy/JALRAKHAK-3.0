from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any

import numpy as np
import xgboost as xgb

from app.config import MODEL_DIR

MODEL_PATH = MODEL_DIR / "hls_inundation_xgb.json"
METADATA_PATH = MODEL_DIR / "hls_inundation_xgb.metadata.json"
TERRAIN_PATH = MODEL_DIR / "hls_grid_terrain.json"


class HLSInundationModel:
    def __init__(self) -> None:
        self.model: xgb.Booster | None = None
        self.metadata: dict[str, Any] = {}
        self.cells: list[dict[str, Any]] = []

    def load(self) -> None:
        if self.model is not None:
            return
        missing = [path.name for path in (MODEL_PATH, METADATA_PATH, TERRAIN_PATH) if not path.exists()]
        if missing:
            raise FileNotFoundError(f"HLS model artifacts missing: {', '.join(missing)}")
        model = xgb.Booster()
        model.load_model(MODEL_PATH)
        self.metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        terrain = json.loads(TERRAIN_PATH.read_text(encoding="utf-8"))
        self.cells = terrain.get("cells", [])
        if not self.cells:
            raise ValueError("HLS terrain lookup contains no grid cells")
        self.model = model

    def nearest_cell(self, latitude: float, longitude: float) -> tuple[dict[str, Any], float]:
        self.load()
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError("Coordinates are outside valid bounds")

        nearest: dict[str, Any] | None = None
        nearest_distance_km = float("inf")
        for cell in self.cells:
            dy = (latitude - float(cell["latitude"])) * 111.32
            dx = (
                (longitude - float(cell["longitude"]))
                * 111.32
                * math.cos(math.radians(latitude))
            )
            distance = math.hypot(dx, dy)
            if distance < nearest_distance_km:
                nearest_distance_km = distance
                nearest = cell
        if nearest is None or nearest_distance_km > 1.5:
            raise ValueError("Coordinate is outside the HLS model's Guwahati grid coverage")
        return nearest, nearest_distance_km

    def predict(self, latitude: float, longitude: float, weather: dict[str, Any]) -> dict[str, Any]:
        nearest, nearest_distance_km = self.nearest_cell(latitude, longitude)
        now = datetime.now(timezone.utc)
        day_radians = 2 * math.pi * now.timetuple().tm_yday / 366.0
        values = {
            "latitude": latitude,
            "longitude": longitude,
            "elevation_m": float(nearest["elevationM"]),
            "slope_degrees": float(nearest["slopeDegrees"]),
            "rain_24h_mm": max(0.0, float(weather.get("last24hMm") or 0)),
            "rain_72h_mm": max(0.0, float(weather.get("last72hMm") or 0)),
            "rain_7d_mm": max(0.0, float(weather.get("last168hMm") or 0)),
            "humidity_24h_percent": float(
                weather.get("humidity24hPercent") or weather.get("humidityPercent") or 75
            ),
            "day_of_year_sin": math.sin(day_radians),
            "day_of_year_cos": math.cos(day_radians),
        }
        feature_names = self.metadata["features"]
        matrix = np.asarray([[values[name] for name in feature_names]], dtype=np.float32)
        data = xgb.DMatrix(matrix, feature_names=feature_names)
        score = min(1.0, max(0.0, float(self.model.predict(data)[0])))
        threshold = float(self.metadata["highFractionCutoff"])
        return {
            "estimatedHlsFraction": round(score, 4),
            "screenPositive": score >= threshold,
            "highFractionCutoff": round(threshold, 4),
            "nearestGridKm": round(nearest_distance_km, 3),
            "target": self.metadata["target"],
            "targetCaveat": self.metadata["targetCaveat"],
            "intendedUse": self.metadata["intendedUse"],
            "modelEvaluation": self.metadata["spatialHoldoutMetrics"],
            "scoreMeaning": "Regression estimate of the source HLS mean fraction; not a flood probability.",
            "operationalWarning": False,
        }

    def predict_grid(self, weather: dict[str, Any]) -> dict[str, Any]:
        self.load()
        now = datetime.now(timezone.utc)
        day_radians = 2 * math.pi * now.timetuple().tm_yday / 366.0
        rain_24h = max(0.0, float(weather.get("last24hMm") or 0))
        rain_72h = max(0.0, float(weather.get("last72hMm") or 0))
        rain_7d = max(0.0, float(weather.get("last168hMm") or 0))
        humidity = float(weather.get("humidity24hPercent") or weather.get("humidityPercent") or 75)
        feature_names = self.metadata["features"]
        rows = []
        for cell in self.cells:
            values = {
                "latitude": float(cell["latitude"]),
                "longitude": float(cell["longitude"]),
                "elevation_m": float(cell["elevationM"]),
                "slope_degrees": float(cell["slopeDegrees"]),
                "rain_24h_mm": rain_24h,
                "rain_72h_mm": rain_72h,
                "rain_7d_mm": rain_7d,
                "humidity_24h_percent": humidity,
                "day_of_year_sin": math.sin(day_radians),
                "day_of_year_cos": math.cos(day_radians),
            }
            rows.append([values[name] for name in feature_names])

        matrix = np.asarray(rows, dtype=np.float32)
        predictions = np.clip(
            self.model.predict(xgb.DMatrix(matrix, feature_names=feature_names)),
            0.0,
            1.0,
        )
        latitudes = sorted({float(cell["latitude"]) for cell in self.cells})
        longitudes = sorted({float(cell["longitude"]) for cell in self.cells})
        latitude_steps = [b - a for a, b in zip(latitudes, latitudes[1:]) if b > a]
        longitude_steps = [b - a for a, b in zip(longitudes, longitudes[1:]) if b > a]
        return {
            "cells": [
                {
                    "latitude": float(cell["latitude"]),
                    "longitude": float(cell["longitude"]),
                    "estimatedHlsFraction": round(float(predictions[index]), 4),
                }
                for index, cell in enumerate(self.cells)
            ],
            "cellSizeLatitudeDegrees": min(latitude_steps) if latitude_steps else 0,
            "cellSizeLongitudeDegrees": min(longitude_steps) if longitude_steps else 0,
            "coverage": {
                "south": min(latitudes),
                "north": max(latitudes),
                "west": min(longitudes),
                "east": max(longitudes),
            },
            "highFractionCutoff": float(self.metadata["highFractionCutoff"]),
            "target": self.metadata["target"],
            "targetCaveat": self.metadata["targetCaveat"],
            "source": "Local HLS spatial-label model",
            "operationalWarning": False,
        }


HLS_INUNDATION_MODEL = HLSInundationModel()