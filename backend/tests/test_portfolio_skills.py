"""Exercise the public skill routes against an isolated in-memory SQLite database."""

from contextlib import asynccontextmanager
from importlib import import_module
from pathlib import Path
from types import ModuleType
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest.fixture
def skill_client(monkeypatch):
    """Serve real routes and ORM queries with only the six skill tables populated."""
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))

    # The real settings require a private deployment config; these routes use
    # only the session factory patched below and never open that configured DB.
    settings = ModuleType("SYSTEM.settings")
    settings.CACHE_CONF = {}
    settings.DB_CONF = {}
    settings.SQLALCHEMY_ENGINE_CONF = {}
    monkeypatch.setitem(sys.modules, "SYSTEM.settings", settings)

    views = import_module("APPs.Portfolio.views_portfolio")
    sql_tools = import_module("COMMON.tools.storage.sqlalchemy.tools_sqlalchemy_async")
    models = import_module("SYSTEM.models.models_portfolio")
    base = import_module("SYSTEM.database.orm").BASE

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(sql_tools.CONN_MANAGER, "get_db", sessions)

    @asynccontextmanager
    async def lifespan(_app):
        tables = [
            models.PortfolioLocale.__table__,
            models.PortfolioSkill.__table__,
            models.PortfolioSkillLocale.__table__,
            models.PortfolioSkillCategory.__table__,
            models.PortfolioSkillCategoryLocale.__table__,
            models.PortfolioCategorySkill.__table__,
        ]
        async with engine.begin() as connection:
            await connection.run_sync(lambda sync_connection: base.metadata.create_all(sync_connection, tables=tables))

        languages = {
            "en": ("English", "English category", "English skill"),
            "zh-Hans": ("简体中文", "简体分类", "简体技能"),
            "zh-Hant": ("繁體中文", "繁體分類", "繁體技能"),
        }
        categories = ["category-a", "category-b", "category-c", "category-d"]
        memberships = {
            "category-a": [f"skill-{index}" for index in range(8)],
            "category-b": ["skill-0", "skill-8"],
            "category-c": [],
            "category-d": ["skill-9"],
        }

        async with sessions.begin() as session:
            session.add_all(
                models.PortfolioLocale(code=code, name=name, is_active=True) for code, (name, _, _) in languages.items()
            )
            session.add_all(
                models.PortfolioSkillCategory(id=category, label_key=f"category.{category}", position=position)
                for position, category in enumerate(categories)
            )
            session.add_all(
                models.PortfolioSkill(id=f"skill-{index}", label_key=f"skill.{index}") for index in range(10)
            )

        async with sessions.begin() as session:
            session.add_all(
                models.PortfolioSkillCategoryLocale(
                    category_id=category,
                    locale=code,
                    label=f"{prefix} {category}",
                )
                for category in categories
                for code, (_, prefix, _) in languages.items()
            )
            session.add_all(
                models.PortfolioSkillLocale(
                    skill_id=f"skill-{index}",
                    locale=code,
                    label=f"{prefix} {index}",
                )
                for index in range(10)
                for code, (_, _, prefix) in languages.items()
            )
            session.add_all(
                models.PortfolioCategorySkill(category_id=category, skill_id=skill, position=position)
                for category, skills in memberships.items()
                for position, skill in enumerate(skills)
            )

        try:
            yield
        finally:
            await engine.dispose()

    app = FastAPI(lifespan=lifespan)
    app.include_router(views.router)
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize(
    ("locale", "category_label", "skill_label"),
    [
        ("en", "English category", "English skill"),
        ("zh-Hans", "简体分类", "简体技能"),
        ("zh-Hant", "繁體分類", "繁體技能"),
    ],
)
def test_categories_and_skills_use_requested_language(skill_client, locale, category_label, skill_label):
    response = skill_client.get("/portfolio/skill-categories", params={"locale": locale, "limit": 1})
    assert response.status_code == 200
    data = response.json()
    assert data["items"][0]["label"] == f"{category_label} category-a"
    assert data["included"]["skills"][0] == {"id": "skill-0", "label": f"{skill_label} 0"}

    response = skill_client.get(
        "/portfolio/skills",
        params={"locale": locale, "ownerType": "category", "ownerId": "category-a", "limit": 1},
    )
    assert response.status_code == 200
    assert response.json()["items"] == [{"id": "skill-0", "label": f"{skill_label} 0"}]


def test_category_preview_is_six_and_included_skills_are_deduplicated(skill_client):
    response = skill_client.get("/portfolio/skill-categories", params={"limit": 2})
    assert response.status_code == 200
    data = response.json()
    first, second = data["items"]
    assert [item["id"] for item in data["items"]] == ["category-a", "category-b"]
    assert first["skillIds"] == [f"skill-{index}" for index in range(6)]
    assert first["skillsPage"]["limit"] == 6
    assert first["skillsPage"]["total"] == 8
    assert first["skillsPage"]["hasMore"] is True
    assert first["skillsPage"]["nextCursor"]
    assert second["skillIds"] == ["skill-0", "skill-8"]
    assert second["skillsPage"] == {"limit": 6, "total": 2, "hasMore": False, "nextCursor": None}
    assert [skill["id"] for skill in data["included"]["skills"]] == [
        "skill-0",
        "skill-1",
        "skill-2",
        "skill-3",
        "skill-4",
        "skill-5",
        "skill-8",
    ]
    assert set(data) == {"items", "page", "included"}

    continuation = skill_client.get(
        "/portfolio/skills",
        params={
            "ownerType": "category",
            "ownerId": "category-a",
            "cursor": first["skillsPage"]["nextCursor"],
        },
    )
    assert continuation.status_code == 200
    assert [item["id"] for item in continuation.json()["items"]] == ["skill-6", "skill-7"]
    assert continuation.json()["page"] == {"limit": 12, "total": 8, "hasMore": False, "nextCursor": None}


def test_category_cursor_pages_and_empty_category(skill_client):
    first = skill_client.get("/portfolio/skill-categories", params={"limit": 2}).json()
    assert first["page"]["total"] == 4
    assert first["page"]["hasMore"] is True
    assert first["page"]["nextCursor"]

    second_response = skill_client.get(
        "/portfolio/skill-categories", params={"limit": 2, "cursor": first["page"]["nextCursor"]}
    )
    assert second_response.status_code == 200
    second = second_response.json()
    assert [item["id"] for item in second["items"]] == ["category-c", "category-d"]
    assert second["page"] == {"limit": 2, "total": 4, "hasMore": False, "nextCursor": None}
    assert second["items"][0]["skillIds"] == []
    assert second["items"][0]["skillsPage"] == {"limit": 6, "total": 0, "hasMore": False, "nextCursor": None}
    assert second["included"]["skills"] == [{"id": "skill-9", "label": "English skill 9"}]


def test_skills_cursor_pages_keep_membership_order(skill_client):
    cursor = None
    ids = []
    for _ in range(4):
        params = {"ownerType": "category", "ownerId": "category-a", "limit": 3}
        if cursor:
            params["cursor"] = cursor
        response = skill_client.get("/portfolio/skills", params=params)
        assert response.status_code == 200
        data = response.json()
        assert set(data) == {"items", "page"}
        assert data["page"]["total"] == 8
        ids.extend(item["id"] for item in data["items"])
        cursor = data["page"]["nextCursor"]
        if not data["page"]["hasMore"]:
            break
    assert ids == [f"skill-{index}" for index in range(8)]
    assert cursor is None


def test_cursor_is_scoped_to_its_collection_category_and_locale(skill_client):
    categories = skill_client.get("/portfolio/skill-categories", params={"limit": 1}).json()
    category_cursor = categories["page"]["nextCursor"]
    skill_cursor = categories["items"][0]["skillsPage"]["nextCursor"]
    assert category_cursor and skill_cursor

    invalid_requests = [
        ("/portfolio/skill-categories", {"locale": "zh-Hans", "cursor": category_cursor}),
        ("/portfolio/skill-categories", {"cursor": skill_cursor}),
        ("/portfolio/skill-categories", {"cursor": "%%%"}),
        ("/portfolio/skills", {"ownerType": "category", "ownerId": "category-b", "cursor": skill_cursor}),
        (
            "/portfolio/skills",
            {"ownerType": "category", "ownerId": "category-a", "locale": "zh-Hant", "cursor": skill_cursor},
        ),
        ("/portfolio/skills", {"ownerType": "category", "ownerId": "category-a", "cursor": category_cursor}),
    ]
    for path, params in invalid_requests:
        response = skill_client.get(path, params=params)
        assert response.status_code == 400
        assert response.json() == {"detail": "INVALID_CURSOR"}


@pytest.mark.parametrize("limit", ["0", "51", "all", "not-a-number"])
@pytest.mark.parametrize("path", ["/portfolio/skill-categories", "/portfolio/skills"])
def test_invalid_limit_returns_400(skill_client, path, limit):
    params = {"limit": limit}
    if path.endswith("/skills"):
        params.update(ownerType="category", ownerId="category-a")
    response = skill_client.get(path, params=params)
    assert response.status_code == 400
    assert response.json() == {"detail": "INVALID_LIMIT"}


def test_owner_validation_and_missing_category(skill_client):
    unsupported = skill_client.get("/portfolio/skills", params={"ownerType": "project", "ownerId": "category-a"})
    assert unsupported.status_code == 400
    assert unsupported.json() == {"detail": "INVALID_OWNER"}

    empty = skill_client.get("/portfolio/skills", params={"ownerId": " "})
    assert empty.status_code == 400
    assert empty.json() == {"detail": "INVALID_OWNER_ID"}

    missing_id = skill_client.get("/portfolio/skills")
    assert missing_id.status_code == 422

    unknown = skill_client.get("/portfolio/skills", params={"ownerId": "unknown"})
    assert unknown.status_code == 404
    assert unknown.json() == {"detail": "NOT_FOUND"}


def test_skill_routes_and_camel_case_query_aliases_appear_in_openapi(skill_client):
    paths = skill_client.get("/openapi.json").json()["paths"]
    assert "/portfolio/skill-categories" in paths
    assert "/portfolio/skills" in paths
    for path in ("/portfolio/skill-categories", "/portfolio/skills"):
        names = {parameter["name"] for parameter in paths[path]["get"]["parameters"]}
        assert {"locale", "limit", "cursor", "is_caching"} <= names
        assert "owner_type" not in names
        assert "owner_id" not in names
    names = {parameter["name"] for parameter in paths["/portfolio/skills"]["get"]["parameters"]}
    assert {"ownerType", "ownerId"} <= names
