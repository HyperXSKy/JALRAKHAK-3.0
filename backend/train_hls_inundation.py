from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import time
import zlib
from bisect import bisect_left
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import xgboost as xgb
from PIL import Image

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
LABEL_DIR = DATA_DIR / "drive_spatial_labels"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "hls_inundation_xgb.json"
METADATA_PATH = MODEL_DIR / "hls_inundation_xgb.metadata.json"
TERRAIN_PATH = MODEL_DIR / "hls_grid_terrain.json"
CACHE_PATH = DATA_DIR / "hls_training_cache.json"
OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
TERRARIUM_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{x}/{y}.png"
DEM_ZOOM = 12
FEATURE_NAMES = [
    "latitude",
    "longitude",
    "elevation_m",
    "slope_degrees",
    "rain_24h_mm",
    "rain_72h_mm",
    "rain_7d_mm",
    "humidity_24h_percent",
    "day_of_year_sin",
    "day_of_year_cos",
]


def _read_rows(path: Path):
    with path.open("r", newline="", encoding="utf-8-sig") as source:
        yield from csv.DictReader(source)


def load_observations() -> tuple[list[dict[str, Any]], dict[str, dict[str, float]], dict[str, int]]:
    batch_paths = sorted(LABEL_DIR.glob("*_batch_*.csv"))
    test_path = LABEL_DIR / "guwahati_hls_spatial_labels_TEST_2023.csv"
    if not batch_paths or not test_path.exists():
        raise FileNotFoundError(
            f"Expected HLS batch CSVs and TEST_2023 CSV under {LABEL_DIR}"
        )

    cells: dict[str, dict[str, float]] = {}
    for row in _read_rows(batch_paths[0]):
        cells.setdefault(
            row["grid_id"],
            {"latitude": float(row["grid_lat"]), "longitude": float(row["grid_lon"])},
        )

    test_keys: set[tuple[str, str]] = set()
    for row in _read_rows(test_path):
        try:
            value = float(row["mean"])
            if math.isfinite(value) and 0.0 <= value <= 1.0:
                test_keys.add((row["grid_id"], row["date"]))
        except (TypeError, ValueError):
            continue

    observations: dict[tuple[str, str], dict[str, Any]] = {}
    missing_labels = 0
    duplicates = 0
    conflicts = 0
    for path in batch_paths:
        for row in _read_rows(path):
            try:
                target = float(row["mean"])
                if not math.isfinite(target) or not 0.0 <= target <= 1.0:
                    missing_labels += 1
                    continue
                key = (row["grid_id"], row["date"])
                observation = {
                    "grid_id": row["grid_id"],
                    "date": row["date"],
                    "target": target,
                }
                previous = observations.get(key)
                if previous:
                    duplicates += 1
                    conflicts += int(not math.isclose(previous["target"], observation["target"], abs_tol=1e-9))
                    continue
                observations[key] = observation
            except (KeyError, TypeError, ValueError):
                missing_labels += 1

    if conflicts:
        raise ValueError(f"Found {conflicts} conflicting HLS labels for identical grid/date keys")

    exact_test_duplicates = sum(key in observations for key in test_keys)
    observations = {key: row for key, row in observations.items() if key not in test_keys}
    for row in observations.values():
        if row["grid_id"] not in cells:
            raise ValueError(f"Missing coordinates for grid cell {row['grid_id']}")

    stats = {
        "batchFiles": len(batch_paths),
        "uniqueLabeledRowsBeforeTestExclusion": len(observations) + exact_test_duplicates,
        "providedTestLabeledRows": len(test_keys),
        "providedTestRowsDuplicatedInBatchesAndExcluded": exact_test_duplicates,
        "duplicateBatchRows": duplicates,
        "conflictingDuplicateLabels": conflicts,
        "rowsWithoutValidFraction": missing_labels,
        "trainingRows": len(observations),
        "positiveRows": sum(row["target"] > 0 for row in observations.values()),
        "fractionalTargetRows": sum(0 < row["target"] < 1 for row in observations.values()),
        "fullPositiveTargetRows": sum(row["target"] == 1 for row in observations.values()),
        "meanTargetFraction": round(
            sum(row["target"] for row in observations.values()) / max(1, len(observations)), 6
        ),
        "gridCells": len(cells),
    }
    return list(observations.values()), cells, stats


def _grid_fingerprint(cells: dict[str, dict[str, float]]) -> str:
    serialized = "\n".join(
        f"{key},{value['latitude']:.6f},{value['longitude']:.6f}"
        for key, value in sorted(cells.items())
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def load_elevations(cells: dict[str, dict[str, float]], cache: dict[str, Any]) -> dict[str, float]:
    fingerprint = _grid_fingerprint(cells)
    cached = cache.get("elevation")
    if cached and cached.get("gridFingerprint") == fingerprint:
        return {key: float(value) for key, value in cached["values"].items()}

    world_tiles = 2**DEM_ZOOM
    locations_by_tile: dict[tuple[int, int], list[tuple[str, int, int]]] = {}
    for grid_id, cell in cells.items():
        latitude_radians = math.radians(cell["latitude"])
        pixel_x_float = (cell["longitude"] + 180.0) / 360.0 * world_tiles * 256
        mercator_y = math.log(math.tan(latitude_radians) + 1 / math.cos(latitude_radians))
        pixel_y_float = (1.0 - mercator_y / math.pi) / 2.0 * world_tiles * 256
        pixel_x, pixel_y = int(pixel_x_float), int(pixel_y_float)
        tile_key = (pixel_x // 256, pixel_y // 256)
        locations_by_tile.setdefault(tile_key, []).append(
            (grid_id, pixel_x % 256, pixel_y % 256)
        )

    elevations: dict[str, float] = {}
    tile_dir = DATA_DIR / "dem_tiles" / str(DEM_ZOOM)
    with httpx.Client(timeout=45.0, follow_redirects=True) as client:
        for index, ((tile_x, tile_y), locations) in enumerate(sorted(locations_by_tile.items()), start=1):
            tile_path = tile_dir / str(tile_x) / f"{tile_y}.png"
            if tile_path.exists():
                image_bytes = tile_path.read_bytes()
            else:
                response = client.get(
                    TERRARIUM_TILE_URL.format(zoom=DEM_ZOOM, x=tile_x, y=tile_y)
                )
                response.raise_for_status()
                image_bytes = response.content
                tile_path.parent.mkdir(parents=True, exist_ok=True)
                tile_path.write_bytes(image_bytes)
            with Image.open(io.BytesIO(image_bytes)) as source_image:
                image = source_image.convert("RGB")
                for grid_id, pixel_x, pixel_y in locations:
                    red, green, blue = image.getpixel((pixel_x, pixel_y))
                    elevations[grid_id] = red * 256.0 + green + blue / 256.0 - 32768.0
            print(f"Terrain tiles: {index}/{len(locations_by_tile)}", flush=True)

    if len(elevations) != len(cells):
        raise RuntimeError("Terrain tiles did not cover every HLS grid cell")
    cache["elevation"] = {"gridFingerprint": fingerprint, "values": elevations}
    return elevations


def load_weather(
    cells: dict[str, dict[str, float]],
    observations: list[dict[str, Any]],
    cache: dict[str, Any],
) -> dict[str, dict[str, float]]:
    dates = sorted({row["date"] for row in observations})
    start = (date.fromisoformat(dates[0]) - timedelta(days=7)).isoformat()
    end = dates[-1]
    center_lat = sum(cell["latitude"] for cell in cells.values()) / len(cells)
    center_lon = sum(cell["longitude"] for cell in cells.values()) / len(cells)
    cache_key = f"{start}|{end}|{center_lat:.4f}|{center_lon:.4f}"
    cached = cache.get("weather")
    if cached and cached.get("key") == cache_key:
        return cached["values"]

    with httpx.Client(timeout=60.0) as client:
        response = client.get(
            OPEN_METEO_ARCHIVE,
            params={
                "latitude": f"{center_lat:.4f}",
                "longitude": f"{center_lon:.4f}",
                "start_date": start,
                "end_date": end,
                "hourly": "precipitation,relative_humidity_2m",
                "timezone": "UTC",
            },
        )
        response.raise_for_status()
        hourly = response.json().get("hourly") or {}

    times = hourly.get("time") or []
    precipitation = hourly.get("precipitation") or []
    humidity = hourly.get("relative_humidity_2m") or []
    if not times or len(times) != len(precipitation):
        raise RuntimeError("Historical weather API returned incomplete hourly rainfall")

    values: dict[str, dict[str, float]] = {}
    for observation_date in dates:
        cutoff = bisect_left(times, f"{observation_date}T12:00")
        if cutoff < 168:
            raise RuntimeError(f"Insufficient 7-day weather history before {observation_date}")

        def rain_sum(hours: int) -> float:
            return round(sum(float(value or 0) for value in precipitation[cutoff - hours : cutoff]), 2)

        humidity_values = [
            float(value) for value in humidity[cutoff - 24 : cutoff] if value is not None
        ]
        values[observation_date] = {
            "rain_24h_mm": rain_sum(24),
            "rain_72h_mm": rain_sum(72),
            "rain_7d_mm": rain_sum(168),
            "humidity_24h_percent": (
                sum(humidity_values) / len(humidity_values) if humidity_values else 75.0
            ),
        }

    cache["weather"] = {"key": cache_key, "values": values}
    return values


def derive_slopes(
    cells: dict[str, dict[str, float]], elevations: dict[str, float]
) -> dict[str, float]:
    latitudes = sorted({round(cell["latitude"], 6) for cell in cells.values()})
    longitudes = sorted({round(cell["longitude"], 6) for cell in cells.values()})
    lat_index = {value: index for index, value in enumerate(latitudes)}
    lon_index = {value: index for index, value in enumerate(longitudes)}
    grid: dict[tuple[int, int], float] = {}
    cell_indices: dict[str, tuple[int, int]] = {}
    for grid_id, cell in cells.items():
        index = (lat_index[round(cell["latitude"], 6)], lon_index[round(cell["longitude"], 6)])
        cell_indices[grid_id] = index
        grid[index] = elevations[grid_id]

    slopes: dict[str, float] = {}
    earth_radius_m = 6_371_000.0
    for grid_id, (row, column) in cell_indices.items():
        latitude = math.radians(cells[grid_id]["latitude"])
        neighbors = {
            "north": (row + 1, column),
            "south": (row - 1, column),
            "east": (row, column + 1),
            "west": (row, column - 1),
        }
        north, south = grid.get(neighbors["north"]), grid.get(neighbors["south"])
        east, west = grid.get(neighbors["east"]), grid.get(neighbors["west"])
        north_distance = (
            math.radians(latitudes[row + 1] - latitudes[row]) * earth_radius_m
            if row + 1 < len(latitudes)
            else 0.0
        )
        south_distance = (
            math.radians(latitudes[row] - latitudes[row - 1]) * earth_radius_m
            if row > 0
            else 0.0
        )
        east_distance = (
            math.radians(longitudes[column + 1] - longitudes[column])
            * earth_radius_m
            * max(0.1, math.cos(latitude))
            if column + 1 < len(longitudes)
            else 0.0
        )
        west_distance = (
            math.radians(longitudes[column] - longitudes[column - 1])
            * earth_radius_m
            * max(0.1, math.cos(latitude))
            if column > 0
            else 0.0
        )
        if north is not None and south is not None:
            dz_dy = (north - south) / max(north_distance + south_distance, 1.0)
        elif north is not None:
            dz_dy = (north - elevations[grid_id]) / max(north_distance, 1.0)
        elif south is not None:
            dz_dy = (elevations[grid_id] - south) / max(south_distance, 1.0)
        else:
            dz_dy = 0.0
        if east is not None and west is not None:
            dz_dx = (east - west) / max(east_distance + west_distance, 1.0)
        elif east is not None:
            dz_dx = (east - elevations[grid_id]) / max(east_distance, 1.0)
        elif west is not None:
            dz_dx = (elevations[grid_id] - west) / max(west_distance, 1.0)
        else:
            dz_dx = 0.0
        slopes[grid_id] = math.degrees(math.atan(math.hypot(dz_dx, dz_dy)))
    return slopes


def build_matrix(
    observations: list[dict[str, Any]],
    cells: dict[str, dict[str, float]],
    elevations: dict[str, float],
    slopes: dict[str, float],
    weather: dict[str, dict[str, float]],
) -> tuple[np.ndarray, np.ndarray, list[str], list[str]]:
    features: list[list[float]] = []
    targets: list[float] = []
    grid_ids: list[str] = []
    dates: list[str] = []
    for row in observations:
        cell = cells[row["grid_id"]]
        day = date.fromisoformat(row["date"])
        radians = 2 * math.pi * day.timetuple().tm_yday / 366.0
        met = weather[row["date"]]
        features.append([
            cell["latitude"],
            cell["longitude"],
            elevations[row["grid_id"]],
            slopes[row["grid_id"]],
            met["rain_24h_mm"],
            met["rain_72h_mm"],
            met["rain_7d_mm"],
            met["humidity_24h_percent"],
            math.sin(radians),
            math.cos(radians),
        ])
        targets.append(float(row["target"]))
        grid_ids.append(row["grid_id"])
        dates.append(row["date"])
    matrix = np.asarray(features, dtype=np.float32)
    labels = np.asarray(targets, dtype=np.float32)
    if not np.isfinite(matrix).all():
        raise ValueError("Training features contain non-finite values")
    return matrix, labels, grid_ids, dates


def high_fraction_metrics(
    actual: np.ndarray, predictions: np.ndarray, cutoff: float
) -> dict[str, float | int]:
    predictions = np.clip(predictions, 0.0, 1.0)
    positives = actual >= 0.5
    predicted_positives = predictions >= cutoff
    true_positive = int(np.sum(predicted_positives & positives))
    false_positive = int(np.sum(predicted_positives & ~positives))
    false_negative = int(np.sum(~predicted_positives & positives))
    precision = true_positive / max(1, true_positive + false_positive)
    recall = true_positive / max(1, true_positive + false_negative)
    f1 = 2 * precision * recall / max(1e-12, precision + recall)
    f2 = 5 * precision * recall / max(1e-12, 4 * precision + recall)
    return {
        "cutoff": round(cutoff, 4),
        "actualFractionCutoff": 0.5,
        "highFractionRows": int(np.sum(positives)),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "f2": round(f2, 4),
        "truePositive": true_positive,
        "falsePositive": false_positive,
        "falseNegative": false_negative,
    }


def regression_metrics(
    actual: np.ndarray, predictions: np.ndarray, high_fraction_cutoff: float
) -> dict[str, float | int | dict[str, float | int]]:
    predictions = np.clip(predictions, 0.0, 1.0)
    residual = predictions - actual
    total_sum_squares = float(np.sum((actual - actual.mean()) ** 2))
    baseline = np.full_like(actual, float(actual.mean()))
    return {
        "rows": int(len(actual)),
        "meanObservedFraction": round(float(actual.mean()), 5),
        "meanPredictedFraction": round(float(predictions.mean()), 5),
        "mae": round(float(np.mean(np.abs(residual))), 5),
        "rmse": round(float(np.sqrt(np.mean(residual**2))), 5),
        "r2": round(1.0 - float(np.sum(residual**2)) / max(total_sum_squares, 1e-12), 5),
        "meanBaselineMae": round(float(np.mean(np.abs(baseline - actual))), 5),
        "highFractionScreen": high_fraction_metrics(actual, predictions, high_fraction_cutoff),
    }


def select_high_fraction_cutoff(actual: np.ndarray, predictions: np.ndarray) -> float:
    candidates = np.unique(np.concatenate((np.arange(0.01, 0.501, 0.01), predictions)))
    scored = [
        (high_fraction_metrics(actual, predictions, float(cutoff))["f2"], float(cutoff))
        for cutoff in candidates
        if cutoff > 0
    ]
    return max(scored, key=lambda item: (item[0], item[1]))[1]


def _save_json(path: Path, content: dict[str, Any]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(content, indent=2), encoding="utf-8")
    temporary.replace(path)


def train() -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    cache = json.loads(CACHE_PATH.read_text(encoding="utf-8")) if CACHE_PATH.exists() else {}
    observations, cells, data_stats = load_observations()
    elevations = load_elevations(cells, cache)
    weather = load_weather(cells, observations, cache)
    slopes = derive_slopes(cells, elevations)
    matrix, labels, grid_ids, dates = build_matrix(
        observations, cells, elevations, slopes, weather
    )
    _save_json(CACHE_PATH, cache)

    cell_latitudes = [cell["latitude"] for cell in cells.values()]
    cell_longitudes = [cell["longitude"] for cell in cells.values()]
    latitude_origin = min(cell_latitudes)
    longitude_origin = min(cell_longitudes)

    def spatial_block(grid_id: str) -> tuple[int, int]:
        cell = cells[grid_id]
        return (
            int((cell["latitude"] - latitude_origin) / 0.025),
            int((cell["longitude"] - longitude_origin) / 0.025),
        )

    blocks = sorted({spatial_block(grid_id) for grid_id in grid_ids})
    holdout_block_count = max(1, round(len(blocks) * 0.2))
    holdout_blocks = set(
        sorted(
            blocks,
            key=lambda block: hashlib.sha256(f"{block[0]}:{block[1]}".encode("ascii")).digest(),
        )[:holdout_block_count]
    )
    spatial_holdout = np.asarray(
        [spatial_block(grid_id) in holdout_blocks for grid_id in grid_ids], dtype=bool
    )
    development = ~spatial_holdout
    development_dates = sorted({dates[index] for index in np.flatnonzero(development)})
    if len(development_dates) < 10:
        raise RuntimeError("Insufficient distinct dates for a chronological validation split")
    validation_start = development_dates[int(len(development_dates) * 0.8)]
    training_mask = development & np.asarray([value < validation_start for value in dates])
    validation_mask = development & np.asarray([value >= validation_start for value in dates])
    holdout_mask = spatial_holdout
    for label, mask in (("training", training_mask), ("validation", validation_mask), ("spatial holdout", holdout_mask)):
        if len(np.unique(labels[mask])) < 2:
            raise RuntimeError(f"{label} split does not contain target variation")

    candidate_specs = [
        {
            "name": "square_d4",
            "max_depth": 4,
            "eta": 0.03,
            "subsample": 0.9,
            "colsample_bytree": 0.9,
            "min_child_weight": 12,
            "lambda": 15.0,
            "objective": "reg:squarederror",
        },
        {
            "name": "square_d5_current",
            "max_depth": 5,
            "eta": 0.04,
            "subsample": 0.85,
            "colsample_bytree": 0.9,
            "min_child_weight": 8,
            "lambda": 8.0,
            "objective": "reg:squarederror",
        },
        {
            "name": "huber_d4",
            "max_depth": 4,
            "eta": 0.03,
            "subsample": 0.9,
            "colsample_bytree": 0.9,
            "min_child_weight": 10,
            "lambda": 12.0,
            "objective": "reg:pseudohubererror",
        },
        {
            "name": "huber_d5",
            "max_depth": 5,
            "eta": 0.025,
            "subsample": 0.85,
            "colsample_bytree": 0.9,
            "min_child_weight": 12,
            "lambda": 15.0,
            "objective": "reg:pseudohubererror",
        },
    ]
    shared_params = {
        "eval_metric": "rmse",
        "tree_method": "hist",
        "nthread": 4,
        "seed": 26071,
        "verbosity": 0,
    }
    training_data = xgb.DMatrix(
        matrix[training_mask], label=labels[training_mask], feature_names=FEATURE_NAMES
    )
    validation_data = xgb.DMatrix(
        matrix[validation_mask], label=labels[validation_mask], feature_names=FEATURE_NAMES
    )
    candidates: list[tuple[dict[str, Any], xgb.Booster, np.ndarray, dict[str, Any]]] = []
    candidate_metrics: list[dict[str, Any]] = []
    for spec in candidate_specs:
        model_params = {**shared_params, **{key: value for key, value in spec.items() if key != "name"}}
        candidate_model = xgb.train(
            model_params,
            training_data,
            num_boost_round=900,
            evals=[(validation_data, "validation")],
            early_stopping_rounds=50,
            verbose_eval=False,
        )
        predictions = np.clip(
            candidate_model.predict(
                validation_data,
                iteration_range=(0, candidate_model.best_iteration + 1),
            ),
            0.0,
            1.0,
        )
        metrics = regression_metrics(labels[validation_mask], predictions, 0.5)
        record = {
            "name": spec["name"],
            "bestIteration": int(candidate_model.best_iteration),
            "mae": metrics["mae"],
            "rmse": metrics["rmse"],
            "r2": metrics["r2"],
            "validationSelectionScore": round(float(metrics["mae"]) + float(metrics["rmse"]), 5),
        }
        candidate_metrics.append(record)
        candidates.append((spec, candidate_model, predictions, metrics))
        print(f"Tuning {spec['name']}: validation MAE={metrics['mae']}", flush=True)

    selected_spec, initial_model, validation_predictions, _ = min(
        candidates,
        key=lambda candidate: (
            float(candidate[3]["mae"]) + float(candidate[3]["rmse"]),
            -candidate[3]["highFractionScreen"]["f2"],
        ),
    )
    high_fraction_cutoff = select_high_fraction_cutoff(
        labels[validation_mask], validation_predictions
    )
    validation_metrics = regression_metrics(
        labels[validation_mask], validation_predictions, high_fraction_cutoff
    )

    best_iteration = int(initial_model.best_iteration or 0)
    final_estimators = max(1, best_iteration + 1)
    development_data = xgb.DMatrix(
        matrix[development], label=labels[development], feature_names=FEATURE_NAMES
    )
    holdout_data = xgb.DMatrix(
        matrix[holdout_mask], label=labels[holdout_mask], feature_names=FEATURE_NAMES
    )
    selected_params = {
        **shared_params,
        **{key: value for key, value in selected_spec.items() if key != "name"},
    }
    final_model = xgb.train(
        selected_params,
        development_data,
        num_boost_round=final_estimators,
        verbose_eval=False,
    )
    holdout_predictions = np.clip(final_model.predict(holdout_data), 0.0, 1.0)
    holdout_metrics = regression_metrics(
        labels[holdout_mask], holdout_predictions, high_fraction_cutoff
    )
    final_model.save_model(MODEL_PATH)

    all_dates = sorted(set(dates))
    metadata = {
        "model": "XGBoost HLS positive-fraction regressor",
        "selectedCandidate": selected_spec["name"],
        "selectedParameters": selected_params,
        "validationTuningCandidates": candidate_metrics,
        "externalBaselineReference": {
            "source": "User-provided Drive checkpoint JSON; underlying model/config unavailable for direct scoring.",
            "metrics": {
                "mae": 0.140028,
                "rmse": 0.202381,
                "r2": -0.138399,
                "precision": 0.194497,
                "recall": 0.727588,
                "f1": 0.306943,
            },
            "comparisonCaveat": "Baseline split, target transform, features, and threshold could not be verified; these metrics are reference-only and not a controlled comparison.",
        },
        "target": "Continuous HLS CSV mean in [0, 1], retained without binarization",
        "targetCaveat": "The source files do not document the semantic meaning of mean. The model predicts that source fraction, not confirmed inundated area or flood-event probability.",
        "intendedUse": "Experimental Guwahati spatial inundation/water-signal screening; not an operational warning without independent event labels and local validation.",
        "dataSource": "Shared Guwahati HLS spatial-label CSV batches; rainfall from Open-Meteo Archive and terrain from SRTM-derived Terrarium DEM tiles.",
        "period": {"start": all_dates[0], "end": all_dates[-1], "uniqueDates": len(all_dates)},
        "dataQuality": data_stats,
        "features": FEATURE_NAMES,
        "terrainSource": "SRTM-derived Terrarium elevation tiles from AWS elevation-tiles-prod at zoom 12; slope derived from neighboring HLS grid elevations.",
        "rainfallSource": "Open-Meteo Archive at the Guwahati grid centroid, hourly rainfall accumulated before 12:00 UTC on each label date.",
        "split": {
            "method": "Geographic blocks approximately 2.5 km wide; 20% of blocks held out; model/cutoff selected on later dates from remaining blocks.",
            "validationStart": validation_start,
            "spatialHoldoutCellCount": len({grid_ids[index] for index in np.flatnonzero(holdout_mask)}),
            "developmentCellCount": len({grid_ids[index] for index in np.flatnonzero(development)}),
            "trainRows": int(np.sum(training_mask)),
            "validationRows": int(np.sum(validation_mask)),
            "spatialHoldoutRows": int(np.sum(holdout_mask)),
            "finalEstimators": final_estimators,
        },
        "highFractionCutoff": round(high_fraction_cutoff, 4),
        "candidateSelection": "Minimum validation MAE + RMSE; early stopping uses validation RMSE to avoid a low-tree MAE-only underfit.",
        "cutoffDefinition": "Validation-tuned screen for source HLS fractions >= 0.5; not a calibrated probability or warning threshold.",
        "validationMetrics": validation_metrics,
        "spatialHoldoutMetrics": holdout_metrics,
        "featureImportanceGain": dict(
            sorted(
                {
                    name: round(float(value), 6)
                    for name, value in final_model.get_score(importance_type="gain").items()
                }.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        ),
    }
    terrain = {
        "source": metadata["terrainSource"],
        "cells": [
            {
                "gridId": grid_id,
                "latitude": cells[grid_id]["latitude"],
                "longitude": cells[grid_id]["longitude"],
                "elevationM": elevations[grid_id],
                "slopeDegrees": round(slopes[grid_id], 4),
            }
            for grid_id in sorted(cells)
        ],
    }
    _save_json(METADATA_PATH, metadata)
    _save_json(TERRAIN_PATH, terrain)
    print(json.dumps(metadata, indent=2))
    return metadata


if __name__ == "__main__":
    train()