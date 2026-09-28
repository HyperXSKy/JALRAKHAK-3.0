from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weather_observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("zone_id", sa.String(length=120), nullable=False),
        sa.Column("zone_name", sa.String(length=200), nullable=False),
        sa.Column("scenario", sa.String(length=40), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_is_live", sa.Boolean(), nullable=False),
        sa.Column("weather_json", sa.JSON(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_weather_zone_observed",
        "weather_observations",
        ["zone_id", "observed_at"],
    )
    op.create_table(
        "risk_predictions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "observation_id",
            sa.Integer(),
            sa.ForeignKey("weather_observations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("composite_score", sa.Float(), nullable=False),
        sa.Column("flood_score", sa.Float(), nullable=False),
        sa.Column("model_probability", sa.Float()),
        sa.Column("model_level", sa.String(length=40)),
        sa.Column("assessment_json", sa.JSON(), nullable=False),
        sa.Column("model_json", sa.JSON(), nullable=False),
    )
    op.create_table(
        "training_labels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "observation_id",
            sa.Integer(),
            sa.ForeignKey("weather_observations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("flood_observed", sa.Boolean(), nullable=False),
        sa.Column("source", sa.String(length=500), nullable=False),
        sa.Column("event_observed_at", sa.DateTime(timezone=True)),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "model_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("model_name", sa.String(length=120), nullable=False),
        sa.Column("trained_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.String(length=40)),
        sa.Column("period_end", sa.String(length=40)),
        sa.Column("artifact_path", sa.String(length=500)),
        sa.Column("metrics_json", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("model_runs")
    op.drop_table("training_labels")
    op.drop_table("risk_predictions")
    op.drop_index("ix_weather_zone_observed", table_name="weather_observations")
    op.drop_table("weather_observations")