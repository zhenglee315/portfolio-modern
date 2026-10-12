"""Enforce public identity, publication and per-site portfolio keys.

Revision ID: 6d4f8a21c903
Revises: 4c7e2b90d615
Create Date: 2026-10-11

Existing numeric and public string IDs are preserved. Only ownership-related
keys and indexes are replaced; existing content checks remain untouched.
"""

# ◆—< Pack >—————————————————————————————————◆ Alembic
from alembic import op

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
import sqlalchemy as sa

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Sequence, Union

revision: str = "6d4f8a21c903"
down_revision: Union[str, None] = "4c7e2b90d615"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PARENT_TABLES = ("portfolio_career", "portfolio_project", "portfolio_skill", "portfolio_skill_category")
_OWNED_TABLES = _PARENT_TABLES + (
    "portfolio_skill_locale",
    "portfolio_skill_category_locale",
    "portfolio_category_skill",
)
_COMPOSITE_LINKS = (
    ("portfolio_skill_locale", "skill_id", "portfolio_skill", "fk_portfolio_skill_locale_site_skill"),
    (
        "portfolio_skill_category_locale",
        "category_id",
        "portfolio_skill_category",
        "fk_portfolio_skill_category_locale_site_category",
    ),
    (
        "portfolio_category_skill",
        "category_id",
        "portfolio_skill_category",
        "fk_portfolio_category_skill_site_category",
    ),
    ("portfolio_category_skill", "skill_id", "portfolio_skill", "fk_portfolio_category_skill_site_skill"),
)
_SCOPED_UNIQUES = (
    ("portfolio_career", ("journey_position",), "uq_portfolio_career_journey_position"),
    ("portfolio_project", ("position",), "uq_portfolio_project_position"),
    ("portfolio_skill", ("label_key",), "uq_portfolio_skill_label_key"),
    ("portfolio_skill_category", ("label_key",), "uq_portfolio_skill_category_label_key"),
    ("portfolio_skill_category", ("position",), "uq_portfolio_skill_category_position"),
    ("portfolio_skill_locale", ("skill_id", "locale"), "uq_portfolio_skill_locale"),
    ("portfolio_skill_category_locale", ("category_id", "locale"), "uq_portfolio_skill_category_locale"),
    ("portfolio_category_skill", ("category_id", "skill_id"), "uq_portfolio_category_skill"),
    ("portfolio_category_skill", ("category_id", "position"), "uq_portfolio_category_skill_position"),
)
_SCOPED_INDEXES = (
    ("portfolio_career", ("experience_order", "id"), "ix_portfolio_career_experience_order"),
    ("portfolio_skill_locale", ("locale", "skill_id"), "ix_portfolio_skill_locale_locale_skill_id"),
    (
        "portfolio_skill_category_locale",
        ("locale", "category_id"),
        "ix_portfolio_skill_category_locale_locale_category_id",
    ),
    ("portfolio_category_skill", ("skill_id",), "ix_portfolio_category_skill_skill_id"),
)
_RESERVED_USERS = (
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


# —< Keys >————————————————————————————————————————————● Existing Constraint
def _drop_matching_constraint(table: str, columns: tuple[str, ...], kind: str) -> None:
    """
    Replace one ownership-related key regardless of its historical generated name.

    :param table: Table containing the existing key.
    :param columns: Exact ordered columns identifying the legacy constraint.
    :param kind: Alembic constraint type, either unique or foreignkey.
    :return: None after the matching key has been removed.
    :raises ValueError: The legacy schema does not contain exactly one matching key.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    inspector = sa.inspect(op.get_bind())
    constraints = inspector.get_unique_constraints(table) if kind == "unique" else inspector.get_foreign_keys(table)
    field = "column_names" if kind == "unique" else "constrained_columns"
    matches = [constraint["name"] for constraint in constraints if tuple(constraint[field]) == columns]
    if len(matches) != 1:
        raise ValueError(f"Expected one {kind} constraint on {table}{columns}; found {len(matches)}.")
    op.drop_constraint(matches[0], table, type_=kind)


# —< Keys >————————————————————————————————————————————● Existing Index
def _drop_existing_index(table: str, name: str) -> None:
    """
    Remove a named index only when an earlier deployed schema already has it.

    :param table: Table containing the index.
    :param name: Historical index name being replaced.
    :return: None; unrelated indexes remain intact.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    if any(index["name"] == name for index in sa.inspect(op.get_bind()).get_indexes(table)):
        op.drop_index(name, table_name=table)


# ■—< MIGRATE >———————————————————————————————————————————————————————————————————————■ Constraints
def upgrade() -> None:
    """
    Require complete ownership and isolate all skill keys inside each portfolio.

    :return: None after per-site uniqueness, composite references and publication checks are enforced.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    op.alter_column("auth_user", "user", existing_type=sa.String(32), nullable=False)
    op.create_unique_constraint("uq_auth_user_user", "auth_user", ["user"])
    user = sa.column("user")
    op.create_check_constraint(
        "ck_auth_user_user_format", "auth_user", user.regexp_match(r"\A[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]\Z")
    )
    op.create_check_constraint("ck_auth_user_user_reserved", "auth_user", ~user.in_(_RESERVED_USERS))
    op.alter_column("auth_role", "is_manage_sites", existing_type=sa.Boolean(), nullable=False)
    op.drop_constraint("ck_auth_role_default_no_management", "auth_role", type_="check")
    op.create_check_constraint(
        "ck_auth_role_default_no_management",
        "auth_role",
        "NOT is_default OR NOT (is_manage_roles OR is_manage_users OR is_manage_sites)",
    )
    for name in ("is_published", "is_default"):
        op.alter_column("portfolio_site", name, existing_type=sa.Boolean(), nullable=False)
    _drop_existing_index("portfolio_site", "ix_portfolio_site_user_id")
    op.create_unique_constraint("uq_portfolio_site_user_id", "portfolio_site", ["user_id"])
    op.create_check_constraint(
        "ck_portfolio_site_default_published", "portfolio_site", "NOT is_default OR is_published"
    )
    op.create_index(
        "uq_portfolio_site_one_default",
        "portfolio_site",
        ["is_default"],
        unique=True,
        postgresql_where=sa.text("is_default IS TRUE"),
    )
    for table in _OWNED_TABLES:
        op.alter_column(table, "site_id", existing_type=sa.Integer(), nullable=False)
    for table in _PARENT_TABLES:
        op.create_foreign_key(
            f"fk_{table}_site_id_portfolio_site", table, "portfolio_site", ["site_id"], ["id"], ondelete="CASCADE"
        )

    # Remove child references before replacing the global string primary keys.
    for child, key, _parent, _name in _COMPOSITE_LINKS:
        _drop_matching_constraint(child, (key,), "foreignkey")
    for table, columns, name in _SCOPED_UNIQUES:
        _drop_matching_constraint(table, columns, "unique")
        op.create_unique_constraint(name, table, ["site_id", *columns])
    for table in ("portfolio_skill", "portfolio_skill_category"):
        primary_key = sa.inspect(op.get_bind()).get_pk_constraint(table)["name"]
        op.drop_constraint(primary_key, table, type_="primary")
        op.create_primary_key(primary_key, table, ["site_id", "id"])
    for child, key, parent, name in _COMPOSITE_LINKS:
        op.create_foreign_key(name, child, parent, ["site_id", key], ["site_id", "id"], ondelete="CASCADE")
    for table, columns, name in _SCOPED_INDEXES:
        _drop_existing_index(table, name)
        op.create_index(name, table, ["site_id", *columns])


# ■—< MIGRATE >———————————————————————————————————————————————————————————————————————■ Restore
def downgrade() -> None:
    """
    Restore global legacy keys only when all retained IDs and order values fit.

    :return: None after the original global ownership-independent keys are restored.
    :raises ValueError: Multiple portfolios reuse a legacy ID, label or ordering value.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    connection = op.get_bind()
    # All checks precede mutations; a failed downgrade leaves the completed schema intact.
    for table, columns in (
        *((table, columns) for table, columns, _name in _SCOPED_UNIQUES),
        ("portfolio_skill", ("id",)),
        ("portfolio_skill_category", ("id",)),
    ):
        target = sa.table(table, *(sa.column(column) for column in columns))
        duplicate = (
            sa.select(*(target.c[column] for column in columns))
            .group_by(*(target.c[column] for column in columns))
            .having(sa.func.count() > 1)
            .limit(1)
        )
        if connection.execute(duplicate).first() is not None:
            raise ValueError(f"Cannot restore global keys: {table}{columns} are reused across portfolios.")

    for table, columns, name in _SCOPED_INDEXES:
        op.drop_index(name, table_name=table)
        # Only career ordering had an explicit index in the original migration.
        if table == "portfolio_career":
            op.create_index(name, table, list(columns))
    for child, _key, _parent, name in _COMPOSITE_LINKS:
        op.drop_constraint(name, child, type_="foreignkey")
    for table in ("portfolio_skill", "portfolio_skill_category"):
        primary_key = sa.inspect(connection).get_pk_constraint(table)["name"]
        op.drop_constraint(primary_key, table, type_="primary")
        op.create_primary_key(primary_key, table, ["id"])
    for table, columns, name in _SCOPED_UNIQUES:
        op.drop_constraint(name, table, type_="unique")
        legacy_name = f"{table}_label_key_key" if columns == ("label_key",) else name
        op.create_unique_constraint(legacy_name, table, list(columns))
    for child, key, parent, _name in _COMPOSITE_LINKS:
        op.create_foreign_key(f"{child}_{key}_fkey", child, parent, [key], ["id"], ondelete="CASCADE")
    for table in _PARENT_TABLES:
        op.drop_constraint(f"fk_{table}_site_id_portfolio_site", table, type_="foreignkey")
    for table in _OWNED_TABLES:
        op.alter_column(table, "site_id", existing_type=sa.Integer(), nullable=True)

    op.drop_index("uq_portfolio_site_one_default", table_name="portfolio_site")
    op.drop_constraint("ck_portfolio_site_default_published", "portfolio_site", type_="check")
    op.drop_constraint("uq_portfolio_site_user_id", "portfolio_site", type_="unique")
    op.create_index("ix_portfolio_site_user_id", "portfolio_site", ["user_id"])
    for name in ("is_published", "is_default"):
        op.alter_column("portfolio_site", name, existing_type=sa.Boolean(), nullable=True)
    op.drop_constraint("ck_auth_role_default_no_management", "auth_role", type_="check")
    op.create_check_constraint(
        "ck_auth_role_default_no_management",
        "auth_role",
        "NOT is_default OR NOT (is_manage_roles OR is_manage_users)",
    )
    op.alter_column("auth_role", "is_manage_sites", existing_type=sa.Boolean(), nullable=True)
    op.drop_constraint("ck_auth_user_user_reserved", "auth_user", type_="check")
    op.drop_constraint("ck_auth_user_user_format", "auth_user", type_="check")
    op.drop_constraint("uq_auth_user_user", "auth_user", type_="unique")
    op.alter_column("auth_user", "user", existing_type=sa.String(32), nullable=True)
