"""Separate monitoring access from site management and enable all existing roles.

Revision ID: d7a24e91b630
Revises: c6f37a92d104

Existing roles, including the registration default, receive monitoring access as
requested. New roles default to false. Monitoring does not grant management rights.

Author: ZhengLee 2026.10.18
"""

from alembic import op
import sqlalchemy as sa

revision = "d7a24e91b630"
down_revision = "c6f37a92d104"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "auth_role",
        sa.Column("is_monitor", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Enable current roles explicitly; the server default remains false for future roles.
    op.execute(sa.text("UPDATE auth_role SET is_monitor = true"))


def downgrade():
    op.drop_column("auth_role", "is_monitor")
