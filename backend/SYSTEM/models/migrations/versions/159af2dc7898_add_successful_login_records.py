"""Create historical records for successful account sign-ins.

Revision ID: 159af2dc7898
Revises: 8cfa40e71d92
Create Date: 2026-10-11

Only the new record_login table is created; existing Auth and Portfolio rows
remain unchanged. The database supplies serial IDs and UTC-aware login times.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "159af2dc7898"
down_revision: Union[str, None] = "8cfa40e71d92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "record_login",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False, comment="Auto-incrementing primary key"),
        sa.Column(
            "user_id",
            sa.Integer(),
            nullable=False,
            comment="Account that successfully signed in; retained when the account is soft-deleted",
        ),
        sa.Column(
            "logintime",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            comment="UTC timestamp when the account successfully signed in",
        ),
        sa.CheckConstraint("id > 0", name="ck_record_login_id_positive"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["auth_user.id"], name="fk_record_login_user_id_auth_user", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_record_login_user_id_logintime_id",
        "record_login",
        ["user_id", sa.text("logintime DESC"), sa.text("id DESC")],
    )
    op.create_index(
        "ix_record_login_logintime_id",
        "record_login",
        [sa.text("logintime DESC"), sa.text("id DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_record_login_logintime_id", table_name="record_login")
    op.drop_index("ix_record_login_user_id_logintime_id", table_name="record_login")
    op.drop_table("record_login")
