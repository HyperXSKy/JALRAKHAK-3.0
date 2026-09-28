from alembic import op
import sqlalchemy as sa


revision = "0002_zone_features"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("weather_observations", sa.Column("zone_features_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("weather_observations", "zone_features_json")