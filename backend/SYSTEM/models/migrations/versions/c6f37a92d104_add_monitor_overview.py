"""Add sampled availability and explicit monitoring coverage boundaries.

Revision ID: c6f37a92d104
Revises: 8e2b9c4f6a10
"""

from alembic import op
import sqlalchemy as sa

revision = "c6f37a92d104"
down_revision = "8e2b9c4f6a10"
branch_labels = None
depends_on = None


def upgrade():
    coverage = op.create_table(
        "record_monitor_coverage",
        sa.Column("source", sa.String(24), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("through_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Earlier rows are useful observations, but do not establish continuous collection.
    op.bulk_insert(coverage, [{"source": "traffic"}, {"source": "logins"}])
    op.create_table(
        "record_monitor_health",
        sa.Column("service_id", sa.String(64), primary_key=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("http_ok", sa.Boolean(), nullable=False),
        sa.Column("redis_ok", sa.Boolean(), nullable=False),
        sa.Column("database_ok", sa.Boolean(), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Float(), nullable=False),
        sa.CheckConstraint("duration_ms >= 0", name="ck_record_monitor_health_duration"),
        sa.CheckConstraint(
            "http_status IS NULL OR http_status BETWEEN 100 AND 599", name="ck_record_monitor_health_http_status"
        ),
    )


def downgrade():
    op.drop_table("record_monitor_health")
    op.drop_table("record_monitor_coverage")
