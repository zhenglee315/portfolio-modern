"""Populate public handles and attach legacy content to its existing portfolio.

Revision ID: 4c7e2b90d615
Revises: 2f6a91c3e480
Create Date: 2026-10-11

An ambiguous legacy owner is rejected instead of assigning another user's data.
Run online; allocation and ambiguity checks require the current database rows.
"""

# ◆—< Pack >—————————————————————————————————◆ Alembic
from alembic import op

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
import sqlalchemy as sa

# ◆—< Pack >—————————————————————————————————◆ Python
import re
from typing import Sequence, Union

revision: str = "4c7e2b90d615"
down_revision: Union[str, None] = "2f6a91c3e480"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Freeze identity rules here; migrations must not depend on the current runtime validator.
_RESERVED_USERS = frozenset(
    (
        "admin",
        "dashboard",
        "login",
        "register",
        "authority",
        "portfolio",
        "api",
        "assets",
        "en",
        "zh-hans",
        "zh-hant",
        "system",
    )
)
_PARENT_TABLES = (
    "portfolio_career",
    "portfolio_project",
    "portfolio_skill",
    "portfolio_skill_category",
)


# —< Identity >————————————————————————————————————————● Handle
def _public_user(email: str, occupied: set[str]) -> str:
    """
    Allocate a valid public handle from an existing email prefix.

    :param email: Existing login email; only its local part supplies the initial handle.
    :param occupied: Already assigned handles, including earlier accounts in this revision.
    :return: A non-reserved, unique lowercase handle with at most 32 characters.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    base = re.sub(r"[^a-z0-9_-]+", "-", email.partition("@")[0].lower()).strip("-_")[:32].rstrip("-_")
    if len(base) < 3 or base in _RESERVED_USERS:
        base = ("user-" + base if base else "user")[:32].rstrip("-_")
    candidate = base
    number = 2
    while candidate in occupied:
        suffix = f"-{number}"
        candidate = base[: 32 - len(suffix)].rstrip("-_") + suffix
        number += 1
    occupied.add(candidate)
    return candidate


# ■—< MIGRATE >———————————————————————————————————————————————————————————————————————■ Backfill
def upgrade() -> None:
    """
    Preserve business fields while filling handles, ownership and publication.

    :return: None after every legacy child row has an explicit portfolio owner.
    :raises ValueError: Legacy content cannot be assigned to exactly one existing site.
    :raises RuntimeError: Offline SQL output cannot inspect or allocate legacy data.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    if op.get_context().as_sql:
        raise RuntimeError("Public handle and portfolio ownership backfill requires an online migration.")
    connection = op.get_bind()
    account = sa.table(
        "auth_user",
        sa.column("id", sa.Integer()),
        sa.column("email"),
        sa.column("user"),
    )
    rows = connection.execute(sa.select(account.c.id, account.c.email, account.c.user).order_by(account.c.id)).all()
    occupied = {row.user for row in rows if row.user is not None}
    for row in rows:
        if row.user is None:
            connection.execute(
                account.update().where(account.c.id == row.id).values(user=_public_user(row.email, occupied))
            )

    role = sa.table("auth_role", sa.column("role"), sa.column("is_manage_sites"))
    connection.execute(role.update().values(is_manage_sites=role.c.role == "admin"))
    site = sa.table(
        "portfolio_site",
        sa.column("id", sa.Integer()),
        sa.column("is_published"),
        sa.column("is_default"),
    )
    sites = connection.execute(sa.select(site.c.id).order_by(site.c.id)).scalars().all()
    has_unassigned = False
    for name in _PARENT_TABLES:
        parent = sa.table(name, sa.column("site_id", sa.Integer()))
        if connection.scalar(sa.select(sa.func.count()).select_from(parent).where(parent.c.site_id.is_(None))):
            has_unassigned = True
    if has_unassigned and len(sites) != 1:
        raise ValueError("Legacy portfolio ownership is ambiguous; populate parent site_id values before retrying.")
    if has_unassigned:
        for name in _PARENT_TABLES:
            parent = sa.table(name, sa.column("site_id", sa.Integer()))
            connection.execute(parent.update().where(parent.c.site_id.is_(None)).values(site_id=sites[0]))

    # Composite owners are inherited from their actual parents, never from an arbitrary site.
    for child_name, child_key, parent_name in (
        ("portfolio_skill_locale", "skill_id", "portfolio_skill"),
        ("portfolio_skill_category_locale", "category_id", "portfolio_skill_category"),
        ("portfolio_category_skill", "category_id", "portfolio_skill_category"),
    ):
        child = sa.table(child_name, sa.column(child_key), sa.column("site_id", sa.Integer()))
        parent = sa.table(parent_name, sa.column("id"), sa.column("site_id", sa.Integer()))
        owner = sa.select(parent.c.site_id).where(parent.c.id == child.c[child_key]).scalar_subquery()
        connection.execute(child.update().where(child.c.site_id.is_(None)).values(site_id=owner))

    # The existing single portfolio keeps its public homepage; other sites remain private drafts.
    if len(sites) == 1:
        connection.execute(site.update().where(site.c.id == sites[0]).values(is_published=True, is_default=True))
    connection.execute(site.update().where(site.c.is_published.is_(None)).values(is_published=False))
    connection.execute(site.update().where(site.c.is_default.is_(None)).values(is_default=False))


# ■—< MIGRATE >———————————————————————————————————————————————————————————————————————■ Restore
def downgrade() -> None:
    """
    Retain filled values while returning to the nullable preparatory schema.

    :return: None; dropping the preparatory revision removes the new fields.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    pass
