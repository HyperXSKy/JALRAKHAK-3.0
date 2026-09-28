from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import xgboost as xgb

from app.config import MODEL_DIR
from app.database import initialize_database, record_model_run
from app.flood_xgboost import FLOOD_FEATURE_NAMES, FLOOD_METADATA_PATH, FLOOD_MODEL_PATH
from app.train_flood_data import build_flood_dataset


def train(start: str = "2021-01-01", end: str = "2025-12-31") -> dict:
    X, y, timestamps, zones, river_flow_thresholds = build_flood_dataset(start, end)
    order = np.argsort(np.array(timestamps))
    X, y = X[order], y[order]
    sorted_timestamps = np.asarray(timestamps)[order]
    unique_timestamps = np.unique(sorted_timestamps)
    train_end = int(np.searchsorted(sorted_timestamps, unique_timestamps[int(len(unique_timestamps) * 0.7)]))
    validation_end = int(np.searchsorted(sorted_timestamps, unique_timestamps[int(len(unique_timestamps) * 0.85)]))
    model = xgb.XGBClassifier(
        n_estimators=800,
        max_depth=4,
        learning_rate=0.03,
        min_child_weight=5,
        reg_lambda=8.0,
        subsample=0.8,
        colsample_bytree=0.85,
        objective="binary:logistic",
        eval_metric="logloss",
        tree_method="hist",
        random_state=26071,
        max_delta_step=1,
        early_stopping_rounds=40,
    )
    model.fit(
        X[:train_end],
        y[:train_end],
        eval_set=[(X[train_end:validation_end], y[train_end:validation_end])],
        verbose=False,
    )
    validation_probabilities = model.predict_proba(X[train_end:validation_end])[:, 1]
    validation_actual = y[train_end:validation_end]
    threshold_rows = []
    for decision_threshold in np.arange(0.05, 0.96, 0.025):
        predictions = validation_probabilities >= decision_threshold
        if int(np.sum(predictions)) < 30:
            continue
        positives = validation_actual == 1
        true_positive = int(np.sum(predictions & positives))
        false_positive = int(np.sum(predictions & ~positives))
        false_negative = int(np.sum(~predictions & positives))
        precision = true_positive / max(1, true_positive + false_positive)
        recall = true_positive / max(1, true_positive + false_negative)
        f_beta = 1.25 * precision * recall / max(1e-9, 0.25 * precision + recall)
        threshold_rows.append((f_beta, precision, recall, float(decision_threshold)))
    if not threshold_rows:
        raise RuntimeError("Validation data did not produce enough positive predictions to tune a threshold")
    _, validation_precision, validation_recall, decision_threshold = max(
        threshold_rows, key=lambda row: (row[0], row[1], row[2])
    )

    actual = y[validation_end:]
    probabilities = model.predict_proba(X[validation_end:])[:, 1]
    predictions = probabilities >= decision_threshold
    true_positive = int(np.sum(predictions & (actual == 1)))
    false_positive = int(np.sum(predictions & (actual == 0)))
    false_negative = int(np.sum(~predictions & (actual == 1)))
    precision = true_positive / max(1, true_positive + false_positive)
    recall = true_positive / max(1, true_positive + false_negative)
    f1 = 2 * precision * recall / max(1e-9, precision + recall)
    f_beta = 1.25 * precision * recall / max(1e-9, 0.25 * precision + recall)
    accuracy = float(np.mean(predictions == actual))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.save_model(FLOOD_MODEL_PATH)
    metadata = {
        "model": "XGBoost flood-risk classifier",
        "dataSource": "Open-Meteo Archive hourly precipitation, GloFAS daily river discharge, and static zone terrain/soil/exposure data",
        "label": "rainfall_or_high_river_flow_hazard",
        "labelDefinition": "Positive when next-24h rainfall exceeds the zone threshold or next-day GloFAS discharge reaches that zone's historical 95th percentile; this is a hydrometeorological hazard label, not a direct observation of inundation.",
        "periodStart": min(timestamps)[:10],
        "periodEnd": max(timestamps)[:10],
        "samples": int(len(y)),
        "zones": zones,
        "features": FLOOD_FEATURE_NAMES,
        "riverFlowP95M3sByZone": river_flow_thresholds,
        "chronologicalHoldout": {
            "accuracy": round(accuracy, 3),
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "positiveEvents": int(np.sum(actual)),
            "predictedPositiveEvents": int(np.sum(predictions)),
            "falsePositives": false_positive,
            "decisionThreshold": decision_threshold,
            "f1": round(f1, 3),
            "f0_5": round(f_beta, 3),
        },
        "validation": {
            "rows": int(validation_end - train_end),
            "precision": round(validation_precision, 3),
            "recall": round(validation_recall, 3),
            "decisionThreshold": decision_threshold,
            "thresholdObjective": "F0.5 to favor precision; minimum 30 predicted positives",
        },
        "split": {
            "method": "Chronological 70% train, 15% validation, 15% untouched holdout; all zones for a timestamp stay together",
            "trainRows": int(train_end),
            "validationRows": int(validation_end - train_end),
            "holdoutRows": int(len(y) - validation_end),
            "uniqueTimestamps": int(len(unique_timestamps)),
            "bestIteration": int(model.best_iteration),
        },
        "classWeighting": "None; preserves natural class prevalence for probability estimates",
    }
    FLOOD_METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    initialize_database()
    record_model_run(metadata, FLOOD_MODEL_PATH)
    return metadata


if __name__ == "__main__":
    print(train())