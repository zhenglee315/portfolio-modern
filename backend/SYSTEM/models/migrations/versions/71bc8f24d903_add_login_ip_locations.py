"""Preserve successful login events while adding nullable IP/location snapshots.

Revision ID: 71bc8f24d903
Revises: 6d4f8a21c903
Create Date: 2026-10-15

Historical IPs cannot be reconstructed: existing events retain null location
columns and geo_status='unknown'. Login timestamps, owners and indexes survive.

                                                                                               ♂ ZhengLee 2026.10.15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "71bc8f24d903"
down_revision: Union[str, None] = "6d4f8a21c903"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add optional snapshots and a bounded status without fabricating historical locations.

    :return: None; PostgreSQL alters in place and SQLite preserves rows through batch migration.

                                                                                               ♂ ZhengLee 2026.10.15
    """
    with op.batch_alter_table("record_login") as batch:
        batch.add_column(
            sa.Column(
                "ip_address",
                sa.String(45),
                nullable=True,
                comment="Normalized request IPv4/IPv6; null when unknown",
            )
        )
        batch.add_column(
            sa.Column(
                "country_code",
                sa.String(2),
                nullable=True,
                comment="IP-derived two-letter country code at login time",
            )
        )
        batch.add_column(
            sa.Column(
                "region",
                sa.String(128),
                nullable=True,
                comment="Approximate IP-derived region name at login time",
            )
        )
        batch.add_column(
            sa.Column(
                "city",
                sa.String(128),
                nullable=True,
                comment="Approximate IP-derived city name at login time",
            )
        )
        batch.add_column(
            sa.Column(
                "geo_status",
                sa.String(24),
                nullable=False,
                server_default="unknown",
                comment="GeoIP enrichment result; unknown retains historical events without source IP",
            )
        )
        batch.create_check_constraint(
            "ck_record_login_geo_status",
            "geo_status IN ('unknown', 'resolved', 'not_found', 'non_public', 'unavailable')",
        )


def downgrade() -> None:
    """
    Remove enrichment columns while preserving original login events and their indexes.

    :return: None; IP/location snapshots are lost, so roll back application code first.

                                                                                               ♂ ZhengLee 2026.10.15
    """
    with op.batch_alter_table("record_login") as batch:
        batch.drop_constraint("ck_record_login_geo_status", type_="check")
        for name in ("geo_status", "city", "region", "country_code", "ip_address"):
            batch.drop_column(name)
