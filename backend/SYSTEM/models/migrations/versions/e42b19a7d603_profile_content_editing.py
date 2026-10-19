"""Normalize owner content edits while preserving the six public response contracts.

Revision ID: e42b19a7d603
Revises: d7a24e91b630
Author: ZhengLee 2026.10.18
"""

from alembic import op
import sqlalchemy as sa
from uuid import uuid5, NAMESPACE_URL

revision = "e42b19a7d603"
down_revision = "d7a24e91b630"
branch_labels = None
depends_on = None


def backfill_skills(connection):
    """Resolve existing catalog labels, then preserve unmatched labels as shared skill records.

    Translated labels are never guessed across different languages. Repeated exact
    labels resolve to one owner identity; category membership remains independent.
    Legacy JSON stays as a rollback backup, not the authoritative post-migration data.
    """
    metadata = sa.MetaData()
    names = (
        "portfolio_skill",
        "portfolio_skill_locale",
        "portfolio_career",
        "portfolio_career_locale",
        "portfolio_project",
        "portfolio_project_locale",
        "portfolio_career_skill",
        "portfolio_project_skill",
    )
    tables = {name: sa.Table(name, metadata, autoload_with=connection) for name in names}
    skills, labels = tables["portfolio_skill"], tables["portfolio_skill_locale"]
    known = {}
    for row in connection.execute(
        sa.select(labels.c.site_id, labels.c.locale, labels.c.label, labels.c.skill_id).order_by(labels.c.skill_id)
    ).mappings():
        known.setdefault((row["site_id"], row["locale"], row["label"]), row["skill_id"])
    generated = set()
    for entity in ("career", "project"):
        parent = tables[f"portfolio_{entity}"]
        text = tables[f"portfolio_{entity}_locale"]
        links = tables[f"portfolio_{entity}_skill"]
        column = text.c[f"{entity}_id"]
        memberships = {}
        query = (
            sa.select(parent.c.site_id, parent.c.id, text.c.locale, text.c.skills)
            .join(text, column == parent.c.id)
            .order_by(parent.c.site_id, parent.c.id, text.c.locale)
        )
        for row in connection.execute(query).mappings():
            site_id, locale = row["site_id"], row["locale"]
            ids = memberships.setdefault((site_id, row["id"]), [])
            for label in row["skills"] or []:
                key = (site_id, locale, label)
                skill_id = known.get(key)
                if skill_id is None:
                    skill_id = "legacy-" + uuid5(NAMESPACE_URL, f"portfolio:{site_id}:skill:{label}").hex
                    if (site_id, skill_id) not in generated:
                        connection.execute(
                            skills.insert().values(site_id=site_id, id=skill_id, label_key=f"profile.{skill_id}")
                        )
                        generated.add((site_id, skill_id))
                    connection.execute(
                        labels.insert().values(site_id=site_id, skill_id=skill_id, locale=locale, label=label)
                    )
                    known[key] = skill_id
                if skill_id not in ids:
                    ids.append(skill_id)
        for (site_id, identity), ids in memberships.items():
            if ids:
                connection.execute(
                    links.insert(),
                    [
                        dict(site_id=site_id, **{f"{entity}_id": identity}, skill_id=skill_id, position=i)
                        for i, skill_id in enumerate(ids)
                    ],
                )
        connection.execute(parent.update().values(skills_normalized=True))


def upgrade():
    op.add_column("portfolio_site", sa.Column("revision", sa.Integer(), nullable=False, server_default="0"))
    for name in ("portfolio_career", "portfolio_project", "portfolio_skill_category"):
        op.add_column(name, sa.Column("visible", sa.Boolean(), nullable=False, server_default=sa.true()))
    for name in ("portfolio_career", "portfolio_project"):
        op.add_column(name, sa.Column("skills_normalized", sa.Boolean(), nullable=False, server_default=sa.false()))
        op.create_unique_constraint(f"uq_{name}_site_id", name, ["site_id", "id"])
    op.add_column("portfolio_project", sa.Column("experience_id", sa.BigInteger(), nullable=True))
    op.add_column("portfolio_project", sa.Column("end_day", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_portfolio_project_career_site",
        "portfolio_project",
        "portfolio_career",
        ["site_id", "experience_id"],
        ["site_id", "id"],
    )
    op.create_check_constraint(
        "ck_portfolio_project_end_day",
        "portfolio_project",
        "end_day IS NULL OR (end_month IS NOT NULL AND end_day BETWEEN 1 AND EXTRACT(DAY FROM (end_month + INTERVAL '1 month - 1 day')))",
    )
    for entity in ("career", "project"):
        op.create_table(
            f"portfolio_{entity}_skill",
            sa.Column("site_id", sa.Integer(), nullable=False),
            sa.Column(f"{entity}_id", sa.BigInteger(), nullable=False),
            sa.Column("skill_id", sa.String(128), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint("site_id", f"{entity}_id", "skill_id"),
            sa.ForeignKeyConstraint(
                ["site_id", f"{entity}_id"],
                [f"portfolio_{entity}.site_id", f"portfolio_{entity}.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["site_id", "skill_id"], ["portfolio_skill.site_id", "portfolio_skill.id"], ondelete="CASCADE"
            ),
            sa.UniqueConstraint("site_id", f"{entity}_id", "position", name=f"uq_portfolio_{entity}_skill_position"),
            sa.CheckConstraint("position >= 0", name=f"ck_portfolio_{entity}_skill_position"),
        )
    backfill_skills(op.get_bind())


def downgrade():
    # Reconstruct label arrays from current shared identities before removing the relations.
    connection = op.get_bind()
    for entity in ("career", "project"):
        connection.execute(sa.text(f"""UPDATE portfolio_{entity}_locale AS t SET skills = COALESCE((
            SELECT json_agg(l.label ORDER BY r.position) FROM portfolio_{entity}_skill r
            JOIN portfolio_skill_locale l ON l.site_id=r.site_id AND l.skill_id=r.skill_id AND l.locale=t.locale
            WHERE r.{entity}_id=t.{entity}_id), '[]'::json)"""))
        op.drop_table(f"portfolio_{entity}_skill")
    op.drop_constraint("ck_portfolio_project_end_day", "portfolio_project", type_="check")
    op.drop_constraint("fk_portfolio_project_career_site", "portfolio_project", type_="foreignkey")
    op.drop_column("portfolio_project", "experience_id")
    op.drop_column("portfolio_project", "end_day")
    for name in ("portfolio_career", "portfolio_project"):
        op.drop_constraint(f"uq_{name}_site_id", name, type_="unique")
        op.drop_column(name, "skills_normalized")
    for name in ("portfolio_career", "portfolio_project", "portfolio_skill_category"):
        op.drop_column(name, "visible")
    op.drop_column("portfolio_site", "revision")
