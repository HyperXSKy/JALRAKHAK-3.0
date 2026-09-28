from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import xgboost as xgb

from app.config import MODEL_DIR
from app.flood_xgboost import FLOOD_FEATURE_NAMES, FLOOD_METADATA_PATH, FLOOD_MODEL_PATH
from app.train_flood_data import build_flood_dataset


def train(start: str = "2021-01-01", end: str = "2025-12-31") -> dict:
    X, y, timestamps, zones, river_flow_thresholds = build_flood_dataset(start, end)
    order = np.argsort(np.array(timestamps))
    X, y = X[order], y[order]
    split = max(1, int(len(y) * 0.8))
    positive_count = max(1, int(np.sum(y[:split])))
    negative_count = max(1, int(len(y[:split]) - positive_count))
    scale_pos_weight = negative_count / positive_count
    model = xgb.XGBClassifier(
        n_estimators=250,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.9,
        objective="binary:logistic",
        eval_metric="logloss",
        tree_method="hist",
        random_state=26071,
        scale_pos_weight=scale_pos_weight,
    )
    model.fit(X[:split], y[:split], eval_set=[(X[split:], y[split:])], verbose=False)
    probabilities = model.predict_proba(X[split:])[:, 1]
    actual = y[split:]
    threshold_rows = []
    for decision_threshold in np.arange(0.10, 0.91, 0.05):
        predictions = probabilities >= decision_threshold
        positives = actual == 1
        true_positive = int(np.sum(predictions & positives))
        false_positive = int(np.sum(predictions & ~positives))
        false_negative = int(np.sum(~predictions & positives))
        precision = true_positive / max(1, true_positive + false_positive)
        recall = true_positive / max(1, true_positive + false_negative)
        f1 = 2 * precision * recall / max(1e-9, precision + recall)
        threshold_rows.append((f1, float(decision_threshold), precision, recall, predictions))
    _, decision_threshold, precision, recall, predictions = max(threshold_rows, key=lambda row: row[0])
    accuracy = float(np.mean(predictions == actual))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.save_model(FLOOD_MODEL_PATH)
    metadata = {
        "model": "XGBoost binary classifier",
        "dataSource": "Open-Meteo Archive hourly precipitation, GloFAS daily river discharge, and static zone terrain/soil/exposure data",
        "label": "rainfall_or_high_river_flow_proxy",
        "labelDefinition": "Positive when next-24h rainfall exceeds the zone threshold or next-day GloFAS discharge reaches that zone's historical 95th percentile; not an observed flood or bank-overflow label.",
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
            "decisionThreshold": decision_threshold,
            "scalePosWeight": round(scale_pos_weight, 2),
            "f1": round(2 * precision * recall / max(1e-9, precision + recall), 3),
        },
    }
    FLOOD_METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


if __name__ == "__main__":
    print(train())