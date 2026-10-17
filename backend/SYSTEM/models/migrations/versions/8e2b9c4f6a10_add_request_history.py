"""Persist completed monitor requests with idempotent queue ingestion.

Revision ID: 8e2b9c4f6a10
Revises: 71bc8f24d903
"""

from alembic import op
import sqlalchemy as sa

revision = "8e2b9c4f6a10"
down_revision = "71bc8f24d903"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "record_request",
        sa.Column(
            "id",
            sa.BigInteger().with_variant(sa.Integer(), "sqlite"),
            primary_key=True,
            autoincrement=True,
        ),
        sa.Column("request_id", sa.String(32), nullable=False),
        sa.Column("run_id", sa.String(128), nullable=False),
        sa.Column("instance_id", sa.String(255), nullable=False),
        sa.Column("process_uid", sa.String(128), nullable=False),
        sa.Column("pid", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(16), nullable=False),
        sa.Column("path", sa.String(2048), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("country_code", sa.String(2), nullable=True),
        sa.Column("region", sa.String(128), nullable=True),
        sa.Column("city", sa.String(128), nullable=True),
        sa.Column("geo_status", sa.String(24), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("response_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_ms", sa.Float(), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("failed", sa.Boolean(), nullable=False),
        sa.Column(
            "stored_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("request_id", name="uq_record_request_request_id"),
        sa.CheckConstraint("id > 0", name="ck_record_request_id_positive"),
        sa.CheckConstraint("pid > 0", name="ck_record_request_pid_positive"),
        sa.CheckConstraint("duration_ms >= 0", name="ck_record_request_duration"),
        sa.CheckConstraint(
            "http_status IS NULL OR http_status BETWEEN 100 AND 599",
            name="ck_record_request_http_status",
        ),
        sa.CheckConstraint(
            "status IN ('completed', 'error', 'cancelled', 'disconnected')",
            name="ck_record_request_status",
        ),
        sa.CheckConstraint(
            "geo_status IN ('unknown', 'resolved', 'not_found', 'non_public', 'unavailable')",
            name="ck_record_request_geo_status",
        ),
    )
    op.create_index(
        "ix_record_request_entered_at_id",
        "record_request",
        [sa.text("entered_at DESC"), sa.text("id DESC")],
    )
    op.create_index(
        "ix_record_request_instance_entered_at",
        "record_request",
        ["instance_id", "entered_at"],
    )
    op.create_index(
        "ix_record_request_http_status_entered_at",
        "record_request",
        ["http_status", "entered_at"],
    )
    op.create_index(
        "ix_record_request_country_entered_at",
        "record_request",
        ["country_code", "entered_at"],
    )


def downgrade():
    op.drop_table("record_request")
