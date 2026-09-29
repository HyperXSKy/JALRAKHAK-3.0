from alembic import op
import sqlalchemy as sa


revision = "0003_spatial_zone_catalog"
down_revision = "0002_zone_features"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "monitoring_zones",
        sa.Column("zone_id", sa.String(length=120), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("region", sa.String(length=200), nullable=False),
        sa.Column("center_latitude", sa.Float(), nullable=False),
        sa.Column("center_longitude", sa.Float(), nullable=False),
        sa.Column("polygon_json", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
        op.execute("ALTER TABLE monitoring_zones ADD COLUMN center_geog geography(Point, 4326)")
        op.execute("ALTER TABLE monitoring_zones ADD COLUMN boundary_geom geometry(MultiPolygon, 4326)")
        op.execute("CREATE INDEX ix_monitoring_zones_center_geog ON monitoring_zones USING GIST (center_geog)")
        op.execute("CREATE INDEX ix_monitoring_zones_boundary_geom ON monitoring_zones USING GIST (boundary_geom)")


def downgrade() -> None:
    op.drop_table("monitoring_zones")