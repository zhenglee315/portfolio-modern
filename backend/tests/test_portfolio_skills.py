"""Exercise the public skill routes against an isolated in-memory SQLite database."""

from contextlib import asynccontextmanager
from importlib import import_module
from pathlib import Path
from types import ModuleType, SimpleNamespace
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest.fixture
def skill_client(monkeypatch, request):
    """Serve real routes and ORM queries with only the six skill tables populated."""
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))

    # Isolate import-time settings and extension wiring while retaining the real
    # route, model, constants, and query code against the session factory below.
    settings = ModuleType("SYSTEM.settings")
    settings.CACHE_CONF = {}
    settings.DB_CONF = {}
    settings.SQLALCHEMY_ENGINE_CONF = {}
    monkeypatch.setitem(sys.modules, "SYSTEM.settings", settings)
    extension = ModuleType("SYSTEM.extension")
    extension.SYS_CONF = SimpleNamespace(get=lambda section, option=None, fallback=None: fallback)
    monkeypatch.setitem(sys.modules, "SYSTEM.extension", extension)

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
        categories = (
            [] if getattr(request, "param", None) == "empty" else [f"category-{letter}" for letter in "abcdefghi"]
        )
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
                if category in categories
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
    """Return localized labels inside the shared numbered response."""
    response = skill_client.get("/portfolio/skill-categories", params={"locale": locale})
    assert response.status_code == 200
    data = response.json()
    assert data["items"][0]["label"] == f"{category_label} category-a"
    assert data["items"][0]["skills"]["items"][0] == {"id": "skill-0", "label": f"{skill_label} 0"}
    response = skill_client.get("/portfolio/skills", params={"locale": locale, "ownerId": "category-a"})
    assert response.status_code == 200
    assert response.json()["items"][0] == {"id": "skill-0", "label": f"{skill_label} 0"}


def test_category_preview_and_continuation_share_numbered_response(skill_client):
    """Embed one six-item skill page and continue on page two without skipping skills."""
    data = skill_client.get("/portfolio/skill-categories").json()
    assert set(data) == {"items", "total", "pages", "page", "size"}
    assert {key: data[key] for key in ("total", "pages", "page", "size")} == {
        "total": 9,
        "pages": 2,
        "page": 1,
        "size": 6,
    }
    first, second = data["items"][:2]
    assert set(first) == {"id", "label", "skills"}
    preview = first["skills"]
    assert set(preview) == set(data)
    assert [item["id"] for item in preview["items"]] == [f"skill-{index}" for index in range(6)]
    assert {key: preview[key] for key in ("total", "pages", "page", "size")} == {
        "total": 8,
        "pages": 2,
        "page": 1,
        "size": 6,
    }
    assert [item["id"] for item in second["skills"]["items"]] == ["skill-0", "skill-8"]
    continuation = skill_client.get("/portfolio/skills", params={"ownerId": first["id"], "page": 2, "size": 6})
    assert continuation.status_code == 200
    assert [item["id"] for item in continuation.json()["items"]] == ["skill-6", "skill-7"]
    assert continuation.json() == {
        "items": [{"id": "skill-6", "label": "English skill 6"}, {"id": "skill-7", "label": "English skill 7"}],
        "total": 8,
        "pages": 2,
        "page": 2,
        "size": 6,
    }


def test_category_pages_and_empty_previews(skill_client):
    """Keep saved ordering, return short final pages, and preserve totals beyond the end."""
    first = skill_client.get("/portfolio/skill-categories").json()
    second = skill_client.get("/portfolio/skill-categories", params={"page": 2}).json()
    assert [row["id"] for row in first["items"] + second["items"]] == [f"category-{c}" for c in "abcdefghi"]
    assert second["page"] == 2 and second["pages"] == 2 and second["total"] == 9
    empty = first["items"][2]["skills"]
    assert empty == {"items": [], "total": 0, "pages": 0, "page": 1, "size": 6}
    beyond = skill_client.get("/portfolio/skill-categories", params={"page": 3}).json()
    assert beyond == {"items": [], "total": 9, "pages": 2, "page": 3, "size": 6}


@pytest.mark.parametrize("skill_client", ["empty"], indirect=True)
@pytest.mark.parametrize("page", [1, 3])
def test_empty_category_collection_uses_zero_pages(skill_client, page):
    """Return a stable empty common response even when a later page is requested."""
    response = skill_client.get("/portfolio/skill-categories", params={"page": page})
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "pages": 0, "page": page, "size": 6}


def test_skill_pages_keep_membership_order_and_empty_results(skill_client):
    """Read all skill pages in membership order and support empty and beyond-end pages."""
    ids = []
    for page in (1, 2):
        response = skill_client.get("/portfolio/skills", params={"ownerId": "category-a", "page": page})
        assert response.status_code == 200
        data = response.json()
        assert set(data) == {"items", "total", "pages", "page", "size"}
        assert data["page"] == page and data["total"] == 8 and data["pages"] == 2
        ids.extend(item["id"] for item in data["items"])
    assert ids == [f"skill-{index}" for index in range(8)]
    assert skill_client.get("/portfolio/skills", params={"ownerId": "category-c"}).json() == {
        "items": [],
        "total": 0,
        "pages": 0,
        "page": 1,
        "size": 6,
    }
    assert skill_client.get("/portfolio/skills", params={"ownerId": "category-a", "page": 3}).json() == {
        "items": [],
        "total": 8,
        "pages": 2,
        "page": 3,
        "size": 6,
    }


@pytest.mark.parametrize("path", ["/portfolio/skill-categories", "/portfolio/skills"])
@pytest.mark.parametrize(
    ("query", "detail"),
    [
        ({"page": "0"}, "INVALID_PAGE"),
        ({"page": "9007199254740992"}, "INVALID_PAGE"),
        ({"page": "all"}, "INVALID_PAGE"),
        ({"page": "1.5"}, "INVALID_PAGE"),
        ({"page": "1.0"}, "INVALID_PAGE"),
        ({"page": "1e0"}, "INVALID_PAGE"),
        ({"size": "0"}, "INVALID_SIZE"),
        ({"size": "12"}, "INVALID_SIZE"),
        ({"size": "6.0"}, "INVALID_SIZE"),
        ({"size": "all"}, "INVALID_SIZE"),
    ],
)
def test_invalid_numbered_pagination_returns_400(skill_client, path, query, detail):
    """Use the common numbered parser and report invalid page or size consistently."""
    params = dict(query)
    if path.endswith("/skills"):
        params["ownerId"] = "category-a"
    response = skill_client.get(path, params=params)
    assert response.status_code == 400
    assert response.json() == {"detail": detail}


def test_owner_and_locale_validation(skill_client):
    """Preserve owner and language errors while replacing cursor pagination."""
    for params, status, detail in [
        ({"ownerType": "project", "ownerId": "category-a"}, 400, "INVALID_OWNER"),
        ({"ownerId": " "}, 400, "INVALID_OWNER_ID"),
        ({"ownerId": "unknown"}, 404, "NOT_FOUND"),
        ({"ownerId": "category-a", "locale": "xx"}, 400, "INVALID_LOCALE"),
    ]:
        response = skill_client.get("/portfolio/skills", params=params)
        assert response.status_code == status
        assert response.json() == {"detail": detail}
    assert skill_client.get("/portfolio/skills").status_code == 422


def test_all_response_models_inherit_the_common_page(skill_client):
    """Declare the same five required fields for all four public paginated resources."""
    common = import_module("COMMON.schema.resp").RespRecords
    models = import_module("APPs.Portfolio.schema.resp.resp_portfolio")
    for name in (
        "RespPortfolioExperiences",
        "RespPortfolioProjects",
        "RespPortfolioSkillCategories",
        "RespPortfolioSkills",
    ):
        model = getattr(models, name)
        assert issubclass(model, common)
        assert set(model.model_fields) == {"items", "total", "pages", "page", "size"}
    assert common.from_records([], total=0, page=1, size=6).model_dump() == {
        "items": [],
        "total": 0,
        "pages": 0,
        "page": 1,
        "size": 6,
    }
    with pytest.raises(ValueError):
        common.from_records([], total=0, page=1, size=0)
    with pytest.raises(ValueError):
        common(items=None, total=0, pages=0, page=1, size=6)


def test_skill_routes_document_numbered_query_and_nested_pages(skill_client):
    """Publish page/size and typed nested skills without cursor or included fields."""
    spec = skill_client.get("/openapi.json").json()
    for path in ("/portfolio/skill-categories", "/portfolio/skills"):
        names = {parameter["name"] for parameter in spec["paths"][path]["get"]["parameters"]}
        assert {"locale", "page", "size", "is_caching"} <= names
        assert not {"limit", "cursor", "owner_type", "owner_id"} & names
    names = {parameter["name"] for parameter in spec["paths"]["/portfolio/skills"]["get"]["parameters"]}
    assert {"ownerType", "ownerId"} <= names
    schema = spec["components"]["schemas"]["RespPortfolioSkillCategories"]
    assert set(schema["required"]) == {"items", "total", "pages", "page", "size"}
