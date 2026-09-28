from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON, String, URL, create_engine, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship

from app.config import DATA_DIR

DATABASE_PATH = DATA_DIR / "jalrakshak.sqlite3"
BACKEND_DIR = Path(__file__).resolve().parents[1]


class Base(DeclarativeBase):
    pass


class WeatherObservation(Base):
    __tablename__ = "weather_observations"
    __table_args__ = (Index("ix_weather_zone_observed", "zone_id", "observed_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_id: Mapped[str] = mapped_column(String(120), nullable=False)
    zone_name: Mapped[str] = mapped_column(String(200), nullable=False)
    scenario: Mapped[str] = mapped_column(String(40), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_is_live: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    weather_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    zone_features_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    prediction: Mapped[RiskPrediction] = relationship(back_populates="observation", uselist=False)
    labels: Mapped[list[TrainingLabel]] = relationship(back_populates="observation")


class RiskPrediction(Base):
    __tablename__ = "risk_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    observation_id: Mapped[int] = mapped_column(
        ForeignKey("weather_observations.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    composite_score: Mapped[float] = mapped_column(Float, nullable=False)
    flood_score: Mapped[float] = mapped_column(Float, nullable=False)
    model_probability: Mapped[float | None] = mapped_column(Float)
    model_level: Mapped[str | None] = mapped_column(String(40))
    assessment_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    model_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    observation: Mapped[WeatherObservation] = relationship(back_populates="prediction")


class TrainingLabel(Base):
    __tablename__ = "training_labels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    observation_id: Mapped[int] = mapped_column(
        ForeignKey("weather_observations.id", ondelete="CASCADE"), nullable=False
    )
    flood_observed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    source: Mapped[str] = mapped_column(String(500), nullable=False)
    event_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    observation: Mapped[WeatherObservation] = relationship(back_populates="labels")


class ModelRun(Base):
    __tablename__ = "model_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    trained_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    period_start: Mapped[str | None] = mapped_column(String(40))
    period_end: Mapped[str | None] = mapped_column(String(40))
    artifact_path: Mapped[str | None] = mapped_column(String(500))
    metrics_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


def _make_engine():
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        engine_url = database_url
    else:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        engine_url = URL.create("sqlite", database=str(DATABASE_PATH))
    connect_args = {"check_same_thread": False} if str(engine_url).startswith("sqlite") else {}
    return create_engine(engine_url, connect_args=connect_args, pool_pre_ping=True)


engine = _make_engine()


def initialize_database() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    legacy_tables = {"weather_observations", "risk_predictions", "training_labels", "model_runs"}
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        existing_tables = set(inspect(connection).get_table_names())
        if legacy_tables.issubset(existing_tables) and "alembic_version" not in existing_tables:
            command.stamp(config, "0001_initial")
        command.upgrade(config, "head")


def check_database() -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def record_assessments(zones: list[dict[str, Any]], scenario: str, observed_at: str) -> None:
    timestamp = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
    with Session(engine) as session:
        for zone in zones:
            weather = zone["weather"]
            assessment = zone["assessment"]
            fusion = zone.get("fusion", {})
            model = fusion.get("floodRiskModel", {})
            observation = WeatherObservation(
                zone_id=zone["id"],
                zone_name=zone["name"],
                scenario=scenario,
                observed_at=timestamp,
                source_is_live=bool(weather.get("isLive")),
                weather_json=weather,
                zone_features_json={
                    key: zone.get(key)
                    for key in (
                        "slope",
                        "elevation",
                        "riverProximityKm",
                        "soilSaturationInitial",
                        "imperviousFraction",
                        "catchmentAreaKm2",
                    )
                },
            )
            observation.prediction = RiskPrediction(
                composite_score=float(assessment.get("compositeScore", 0)),
                flood_score=float(assessment.get("floodScore", 0)),
                model_probability=(
                    float(model["probability"]) if model.get("probability") is not None else None
                ),
                model_level=model.get("level"),
                assessment_json=assessment,
                model_json=model,
            )
            session.add(observation)
        session.commit()


def get_assessment_history(zone_id: str | None, limit: int) -> list[dict[str, Any]]:
    statement = (
        select(WeatherObservation, RiskPrediction)
        .join(RiskPrediction)
        .order_by(WeatherObservation.observed_at.desc(), WeatherObservation.id.desc())
        .limit(limit)
    )
    if zone_id:
        statement = statement.where(WeatherObservation.zone_id == zone_id)
    with Session(engine) as session:
        rows = session.execute(statement).all()
    return [
        {
            "id": observation.id,
            "zoneId": observation.zone_id,
            "zoneName": observation.zone_name,
            "scenario": observation.scenario,
            "observedAt": observation.observed_at.isoformat(),
            "isLive": observation.source_is_live,
            "weather": observation.weather_json,
            "zoneFeatures": observation.zone_features_json,
            "assessment": prediction.assessment_json,
            "model": prediction.model_json,
        }
        for observation, prediction in rows
    ]


def get_model_runs(limit: int) -> list[dict[str, Any]]:
    with Session(engine) as session:
        runs = session.scalars(select(ModelRun).order_by(ModelRun.trained_at.desc()).limit(limit)).all()
    return [
        {
            "id": run.id,
            "model": run.model_name,
            "trainedAt": run.trained_at.isoformat(),
            "samples": run.sample_count,
            "periodStart": run.period_start,
            "periodEnd": run.period_end,
            "artifactPath": Path(run.artifact_path).name if run.artifact_path else None,
            "metrics": run.metrics_json,
        }
        for run in runs
    ]


def record_training_label(
    observation_id: int,
    flood_observed: bool,
    source: str,
    event_observed_at: datetime | None,
) -> bool:
    with Session(engine) as session:
        observation = session.get(WeatherObservation, observation_id)
        if observation is None:
            return False
        if observation.scenario != "LIVE" or not observation.source_is_live:
            raise ValueError("Training labels require an observation from a live data source")
        session.add(TrainingLabel(
            observation_id=observation_id,
            flood_observed=flood_observed,
            source=source,
            event_observed_at=event_observed_at,
        ))
        session.commit()
    return True


def get_training_labels(limit: int) -> list[dict[str, Any]]:
    statement = (
        select(TrainingLabel, WeatherObservation)
        .join(WeatherObservation)
        .order_by(TrainingLabel.recorded_at.desc(), TrainingLabel.id.desc())
        .limit(limit)
    )
    with Session(engine) as session:
        rows = session.execute(statement).all()
    return [
        {
            "id": label.id,
            "observationId": observation.id,
            "zoneId": observation.zone_id,
            "observedAt": observation.observed_at.isoformat(),
            "eventObservedAt": label.event_observed_at.isoformat() if label.event_observed_at else None,
            "floodObserved": label.flood_observed,
            "source": label.source,
            "weather": observation.weather_json,
            "zoneFeatures": observation.zone_features_json,
        }
        for label, observation in rows
    ]


def record_model_run(metadata: dict[str, Any], artifact_path: Path) -> None:
    with Session(engine) as session:
        session.add(ModelRun(
            model_name=str(metadata.get("model", "unknown")),
            sample_count=int(metadata.get("samples", 0)),
            period_start=metadata.get("periodStart"),
            period_end=metadata.get("periodEnd"),
            artifact_path=str(artifact_path),
            metrics_json={
                "chronologicalHoldout": metadata.get("chronologicalHoldout", {}),
                "validation": metadata.get("validation", {}),
                "label": metadata.get("label"),
                "dataSource": metadata.get("dataSource"),
            },
        ))
        session.commit()