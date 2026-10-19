"""Verify public Site, Journey, Experiences and Projects isolation across portfolio owners."""

from contextlib import asynccontextmanager
from datetime import date
from importlib import import_module
from pathlib import Path
from types import ModuleType, SimpleNamespace
import sys
import os
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import event, update, text
from sqlalchemy.schema import CreateSchema, DropSchema
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from starsessions import load_session
from starsessions.stores import InMemoryStore
from SYSTEM.constants import EnumSess


@pytest.fixture
def portfolio_client(monkeypatch):
    """Serve real portfolio routes with two owners whose position values and public slugs overlap."""
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))
    settings = ModuleType("SYSTEM.settings")
    settings.SEC_MANAGEMENT_ORIGINS = frozenset()
    settings.SEC_SECRET_KEY = "isolated-test-secret"
    settings.TIME_ZONE = "UTC"
    settings.CACHE_CONF = {}
    settings.DB_CONF = {}
    settings.SQLALCHEMY_ENGINE_CONF = {}
    settings.SEC_CORS = {}
    settings.SEC_SESSION_CONF = {}
    monkeypatch.setitem(sys.modules, "SYSTEM.settings", settings)
    extension = ModuleType("SYSTEM.extension")
    extension.SYS_CONF = SimpleNamespace(get=lambda section, option=None, fallback=None: fallback)
    monkeypatch.setitem(sys.modules, "SYSTEM.extension", extension)

    views = import_module("APPs.Portfolio.views_portfolio")
    tools = import_module("COMMON.tools.storage.sqlalchemy.tools_sqlalchemy_async")
    models = import_module("SYSTEM.models")
    middleware = import_module("SYSTEM.middleware.utils.middleware_session")
    postgres = os.environ.get("PROFILE_CONTENT_TEST_POSTGRES_URL")
    schema = "profile_contract_" + uuid4().hex
    engine = (
        create_async_engine(postgres, connect_args={"server_settings": {"search_path": schema}})
        if postgres
        else create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    )

    @event.listens_for(engine.sync_engine, "connect")
    def foreign_keys(connection, _record):
        if not postgres:
            connection.execute("PRAGMA foreign_keys=ON")

    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(tools.CONN_MANAGER, "get_db", sessions)
    store = InMemoryStore()

    @asynccontextmanager
    async def lifespan(_app):
        async with engine.begin() as connection:
            if postgres:
                await connection.execute(CreateSchema(schema))
            await connection.run_sync(models.BASE.metadata.create_all)
        first = models.AuthUser(id=1, user="owner-one", email="login-one@example.com", role_id=1)
        await first.set_password("12345678")
        async with sessions.begin() as session:
            session.add(models.AuthRole(id=1, role="editor", is_default=True))
        async with sessions.begin() as session:
            session.add_all(
                (
                    first,
                    models.AuthUser(
                        id=2,
                        user="owner-two",
                        email="login-two@example.com",
                        role_id=1,
                        password=first.password,
                    ),
                )
            )
            session.add_all(
                models.PortfolioLocale(code=locale, name=locale, is_active=True)
                for locale in ("en", "zh-Hant", "zh-Hans")
            )
        async with sessions.begin() as session:
            session.add_all(
                models.PortfolioSite(
                    id=site_id,
                    user_id=site_id,
                    is_published=True,
                    is_default=site_id == 1,
                    copyright_year=2026,
                    chat_icon="assets/cow.svg",
                    email=f"public-{site_id}@example.com",
                )
                for site_id in (1, 2)
            )
        async with sessions.begin() as session:
            for site_id, locales in ((1, ("en", "zh-Hant")), (2, ("en",))):
                for locale in locales:
                    session.add(
                        models.PortfolioSiteLocale(
                            site_id=site_id,
                            locale=locale,
                            brand_title=f"SITE-{site_id}",
                            brand_title_sub=f"Brand {site_id}",
                            first_name=f"Owner {site_id}",
                            family_name=locale,
                            nick_name=f"Owner{site_id}",
                            profile_content=f"{locale} owner {site_id} introduction",
                            edu_code="UNI",
                            program="Engineering",
                            intro_content=f"Intro {site_id}",
                            footer_content=f"Footer {site_id}",
                            chat_title=f"Contact {site_id}",
                            chat_title_sub="Available",
                            chat_content=f"Chat {site_id}",
                        )
                    )
            for site_id, count, offset in ((1, 8, 0), (2, 3, 100)):
                for position in range(count):
                    session.add(
                        models.PortfolioCareer(
                            id=offset + position + 1,
                            site_id=site_id,
                            journey_position=position,
                            experience_order=float(count - position),
                            country_code="GBR",
                            latitude=51.5,
                            longitude=-0.1,
                            type="work",
                            start_month=date(2024, 1, 1),
                            expected=False,
                        )
                    )
            for site_id, count, offset in ((1, 8, 0), (2, 2, 100)):
                for position in range(count):
                    session.add(
                        models.PortfolioProject(
                            id=offset + position + 1,
                            site_id=site_id,
                            position=position,
                            start_month=date(2024, 1, 1),
                            expected=False,
                        )
                    )
            # Public string IDs, label keys and positions are valid independently in each site.
            for site_id in (1, 2):
                session.add(models.PortfolioSkill(site_id=site_id, id="shared-skill", label_key="skill.shared"))
                session.add(
                    models.PortfolioSkillCategory(
                        site_id=site_id,
                        id="shared-category",
                        label_key="category.shared",
                        position=0,
                    )
                )
        async with sessions.begin() as session:
            for site_id, count, offset in ((1, 8, 0), (2, 3, 100)):
                for position in range(count):
                    for locale in ("en", "zh-Hant"):
                        session.add(
                            models.PortfolioCareerLocale(
                                career_id=offset + position + 1,
                                locale=locale,
                                country_name="United Kingdom",
                                city="London",
                                organization_name=f"{locale} Site {site_id} Career {position}",
                                organization_code=f"C{site_id}",
                                organization_title=f"Role {position}",
                                content=f"Site {site_id} experience",
                                skills=[f"Skill {site_id}"],
                            )
                        )
            for site_id, count, offset in ((1, 8, 0), (2, 2, 100)):
                for position in range(count):
                    for locale in ("en", "zh-Hant"):
                        session.add(
                            models.PortfolioProjectLocale(
                                project_id=offset + position + 1,
                                locale=locale,
                                organization_name=f"{locale} Site {site_id} Project {position}",
                                organization_code=f"P{site_id}",
                                organization_title="Developer",
                                project_name=f"Project {site_id}-{position}",
                                project_title="Software",
                                intro=f"Site {site_id} project",
                                skills=[f"Skill {site_id}"],
                                detail_kind="null",
                            )
                        )
        if postgres:
            async with sessions.begin() as session:
                for table in ("auth_role", "auth_user", "portfolio_site", "portfolio_career", "portfolio_project"):
                    await session.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{table}','id'), COALESCE((SELECT max(id) FROM {table}), 1), true)"
                        )
                    )
        try:
            yield
        finally:
            if postgres:
                async with engine.begin() as connection:
                    await connection.execute(DropSchema(schema, cascade=True))
            await engine.dispose()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(
        middleware.SessionMiddleware,
        store_factory=lambda: store,
        cookie_https_only=False,
    )
    app.include_router(views.router)

    @app.post("/__test__/other-account-session")
    async def other_account_session(request: Request):
        await load_session(request)
        request.session.update(
            {
                "id": 2,
                "email": "login-two@example.com",
                "user": "owner-two",
                "role": "editor",
            }
        )
        from APPs.Auth.module import AuthModule

        async with sessions() as session:
            account = await session.get(models.AuthUser, 2)
            request.session[EnumSess.AUTH_IDENTITY] = AuthModule.session_identity(account.id, account.password)
        return {"id": 2}

    app.state.sessions = sessions
    app.state.models = models
    with TestClient(app) as client:
        yield client


def test_site_resolves_owner_without_using_authenticated_account(portfolio_client):
    """Public selectors control the Site DTO even when another owner is signed in."""
    client = portfolio_client
    assert client.post("/__test__/other-account-session").status_code == 200
    default = client.get("/portfolio/site").json()
    assert (default["site_id"], default["user"]) == (1, "owner-one")
    assert default["profile"]["firstName"] == "Owner 1"
    other = client.get("/portfolio/site", params={"user": "owner-two"}).json()
    assert (other["site_id"], other["user"]) == (2, "owner-two")
    assert other["profile"]["firstName"] == "Owner 2"
    assert other["social"]["email"] == "public-2@example.com"
    assert "login-two@example.com" not in str(other)
    assert client.get("/portfolio/site", params={"site_id": 2}).json() == other


def test_site_locale_and_missing_owner_do_not_fall_back(portfolio_client):
    """Missing translations and owners return 404; unsupported locale syntax returns 400."""
    client = portfolio_client
    translated = client.get("/portfolio/site", params={"user": "owner-one", "locale": "zh-Hant"})
    assert translated.status_code == 200
    assert translated.json()["profile"]["content"] == "zh-Hant owner 1 introduction"
    assert client.get("/portfolio/site", params={"user": "owner-two", "locale": "zh-Hant"}).status_code == 404
    assert client.get("/portfolio/site", params={"locale": "zh-Hans"}).status_code == 404
    assert client.get("/portfolio/site", params={"locale": "fr"}).status_code == 400
    assert client.get("/portfolio/site", params={"user": "missing-owner"}).status_code == 404


def test_journey_and_experience_counts_are_scoped_to_same_career_owner(
    portfolio_client,
):
    """Overlapping position values do not mix IDs, locale text or pagination counts."""
    client = portfolio_client
    for site_id, expected_ids in (
        (1, list(range(1, 9))),
        (2, list(range(101, 104))),
    ):
        journey = client.get("/portfolio/journey", params={"site_id": site_id, "locale": "zh-Hant"}).json()
        assert [item["id"] for item in journey] == expected_ids
        assert all(item["organizationName"].startswith(f"zh-Hant Site {site_id} Career") for item in journey)
        first = client.get("/portfolio/experiences", params={"site_id": site_id, "locale": "zh-Hant"}).json()
        assert first["total"] == len(expected_ids)
        assert first["pages"] == (2 if site_id == 1 else 1)
        assert [item["id"] for item in first["items"]] == expected_ids[:6]
        assert all(item["skills"] == [f"Skill {site_id}"] for item in first["items"])
        second = client.get(
            "/portfolio/experiences",
            params={"site_id": site_id, "locale": "zh-Hant", "page": 2},
        ).json()
        assert second["total"] == len(expected_ids)
        assert [item["id"] for item in second["items"]] == expected_ids[6:]


def test_projects_rows_and_pagination_are_scoped_to_each_site(portfolio_client):
    """A second site's matching project positions cannot enter another owner's pages or totals."""
    client = portfolio_client
    for site_id, expected_ids in (
        (1, list(range(1, 9))),
        (2, [101, 102]),
    ):
        first = client.get("/portfolio/projects", params={"site_id": site_id, "locale": "zh-Hant"}).json()
        assert first["total"] == len(expected_ids)
        assert first["pages"] == (2 if site_id == 1 else 1)
        assert [item["id"] for item in first["items"]] == expected_ids[:6]
        assert all(item["organizationName"].startswith(f"zh-Hant Site {site_id} Project") for item in first["items"])
        assert all(item["skills"] == [f"Skill {site_id}"] for item in first["items"])
        second = client.get(
            "/portfolio/projects",
            params={"site_id": site_id, "locale": "zh-Hant", "page": 2},
        ).json()
        assert second["total"] == len(expected_ids)
        assert [item["id"] for item in second["items"]] == expected_ids[6:]


def test_shared_career_fields_preserve_optional_period_contract(portfolio_client):
    """Journey and Experiences retain actual end days, localized detail and their distinct expected flags."""
    client = portfolio_client

    async def add_period_detail():
        models = client.app.state.models
        async with client.app.state.sessions.begin() as session:
            await session.execute(
                update(models.PortfolioCareer)
                .where(models.PortfolioCareer.id == 1)
                .values(
                    expected=True,
                    end_month=date(2024, 2, 1),
                    end_day=29,
                    detail_start_month=date(2023, 1, 1),
                    detail_end_month=date(2023, 3, 1),
                    detail_end_day=30,
                )
            )
            await session.execute(
                update(models.PortfolioCareerLocale)
                .where(
                    models.PortfolioCareerLocale.career_id == 1,
                    models.PortfolioCareerLocale.locale == "en",
                )
                .values(detail_content="Supplementary career detail")
            )

    client.portal.call(add_period_detail)
    journey = client.get("/portfolio/journey", params={"site_id": 1}).json()
    experiences = client.get("/portfolio/experiences", params={"site_id": 1}).json()["items"]
    expected_detail = {
        "startMonth": "2023-01",
        "endMonth": "2023-03",
        "endDay": 30,
        "content": "Supplementary career detail",
    }
    for first in (journey[0], experiences[0]):
        assert first["id"] == 1
        assert first["endMonth"] == "2024-02"
        assert first["endDay"] == 29
        assert first["expected"] is True
        assert first["detail"] == expected_detail
    assert journey[1]["expected"] is False
    assert "expected" not in experiences[1]
    assert "endDay" not in journey[1] and "endDay" not in experiences[1]
    assert journey[1]["detail"] is None and experiences[1]["detail"] is None


def test_switching_default_does_not_change_requests_pinned_to_site(portfolio_client):
    """Every omitted selector follows the current default while pinned resources keep one identity."""
    client = portfolio_client

    async def switch_default():
        model = client.app.state.models.PortfolioSite
        async with client.app.state.sessions.begin() as session:
            await session.execute(update(model).where(model.id == 1).values(is_default=False))
            await session.execute(update(model).where(model.id == 2).values(is_default=True))

    client.portal.call(switch_default)
    assert client.get("/portfolio/site").json()["site_id"] == 2
    assert [item["id"] for item in client.get("/portfolio/journey").json()] == [
        101,
        102,
        103,
    ]
    assert client.get("/portfolio/experiences").json()["total"] == 3
    assert client.get("/portfolio/projects").json()["total"] == 2
    assert client.get("/portfolio/site", params={"site_id": 1}).json()["site_id"] == 1
    assert client.get("/portfolio/experiences", params={"site_id": 1}).json()["total"] == 8
    assert client.get("/portfolio/projects", params={"site_id": 1}).json()["total"] == 8


def test_missing_default_returns_404_without_selecting_first_site(portfolio_client):
    """Published rows alone are insufficient to nominate an implicit homepage."""
    client = portfolio_client

    async def clear_default():
        model = client.app.state.models.PortfolioSite
        async with client.app.state.sessions.begin() as session:
            await session.execute(update(model).values(is_default=False))

    client.portal.call(clear_default)
    for path in ("site", "journey", "experiences", "projects"):
        assert client.get("/portfolio/" + path).status_code == 404
    assert client.get("/portfolio/site", params={"user": "owner-one"}).status_code == 200


def test_only_site_lookup_advertises_public_user_selector(portfolio_client):
    """Content endpoints expose site_id only, while Site owns public account resolution."""
    paths = portfolio_client.get("/openapi.json").json()["paths"]
    site = paths["/portfolio/site"]["get"]
    assert {"user", "site_id"} <= {parameter["name"] for parameter in site["parameters"]}
    for name in ("journey", "experiences", "projects", "skill-categories", "skills"):
        operation = paths[f"/portfolio/{name}"]["get"]
        parameters = {parameter["name"] for parameter in operation["parameters"]}
        assert "site_id" in parameters and "user" not in parameters
        assert "supplying `user` returns 400 `INVALID_SITE_SELECTOR`" in operation["description"]
