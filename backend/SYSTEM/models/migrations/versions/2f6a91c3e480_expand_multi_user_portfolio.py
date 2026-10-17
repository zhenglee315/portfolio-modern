"""Prepare public account handles and portfolio ownership for data backfill.

Revision ID: 2f6a91c3e480
Revises: 159af2dc7898
Create Date: 2026-10-11

Only new columns are added here. Existing content, keys and foreign keys remain
available until the backfill and final constraint revisions have completed.
"""

# ◆—< Pack >—————————————————————————————————◆ Alembic
from alembic import op

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
import sqlalchemy as sa

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Sequence, Union

revision: str = "2f6a91c3e480"
down_revision: Union[str, None] = "159af2dc7898"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OWNED_TABLES = (
    "portfolio_career",
    "portfolio_project",
    "portfolio_skill",
    "portfolio_skill_category",
    "portfolio_skill_locale",
    "portfolio_skill_category_locale",
    "portfolio_category_skill",
)


# ■—< MIGRATE >———————————————————————————————————————————————————————————————————————■ Expand
def upgrade() -> None:
    """
    Add nullable ownership fields without replacing any existing business data.

    :return: None after public identity and publication columns are available.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    op.add_column(
        "auth_user",
        sa.Column(
            "user",
            sa.String(32),
            nullable=True,
            comment="Unique public handle; independent of the login email",
        ),
    )
    op.add_column(
        "auth_role",
        sa.Column(
            "is_manage_sites",
            sa.Boolean(),
            nullable=True,
            server_default=sa.false(),
            comment="Allow managing portfolio publication and the website default",
        ),
    )
    for name, description in (
        ("is_published", "Whether this portfolio is publicly visible"),
        ("is_default", "Published portfolio shown without a user selector"),
    ):
        op.add_column(
            "portfolio_site",
            sa.Column(
                name,
                sa.Boolean(),
                nullable=True,
                server_default=sa.false(),
                comment=description,
            ),
        )
    for table in _OWNED_TABLES:
        op.add_column(
            table,
            sa.Column("site_id", sa.Integer(), nullable=True, comment="Portfolio owner site"),
        )


# ■—< MIGRATE >———————————————————————————————————————————————————————————————————————■ Restore
def downgrade() -> None:
    """
    Remove the preparatory fields after the final constraint revision is undone.

    :return: None; original content columns and IDs remain intact.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    for table in reversed(_OWNED_TABLES):
        op.drop_column(table, "site_id")
    op.drop_column("portfolio_site", "is_default")
    op.drop_column("portfolio_site", "is_published")
    op.drop_column("auth_role", "is_manage_sites")
    op.drop_column("auth_user", "user")
