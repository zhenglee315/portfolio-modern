"""Exercise account and platform lists through isolated SQL-backed management routes."""

from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from importlib import import_module
from pathlib import Path
from types import ModuleType, SimpleNamespace
import sys
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import event
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

USER_FIELDS = {
    "id",
    "email",
    "role_id",
    "role",
    "is_active",
    "role_is_active",
    "site_id",
    "has_site",
    "login_count",
    "last_login",
    "createtime",
    "updatetime",
}
SITE_TEXT_FIELDS = (
    "brand_title",
    "brand_title_sub",
    "first_name",
    "family_name",
    "nick_name",
    "profile_content",
    "edu_code",
    "program",
    "intro_content",
    "footer_content",
    "chat_title",
    "chat_title_sub",
    "chat_content",
)
SITE_FIELDS = {
    "id",
    "user",
    "owner_email",
    "owner_is_active",
    "site_id",
    "has_site",
    "has_profile",
    "is_published",
    "is_default",
    "copyright_year",
    "linkedin",
    "github",
    "medium",
    "email",
    "chat_icon",
    "locale",
    "has_translation",
    *SITE_TEXT_FIELDS,
    "createtime",
    "updatetime",
}


@pytest.fixture
def management_client(monkeypatch, request):
    """Keep production query behavior while replacing runtime settings and storage."""
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))
    settings = ModuleType("SYSTEM.settings")
    settings.SEC_MANAGEMENT_ORIGINS = frozenset()
    settings.SEC_SECRET_KEY = "isolated-management-list-secret"
    settings.TIME_ZONE = "UTC"
    settings.CACHE_CONF = {}
    settings.DB_CONF = {}
    settings.SQLALCHEMY_ENGINE_CONF = {}
    monkeypatch.setitem(sys.modules, "SYSTEM.settings", settings)
    extension = ModuleType("SYSTEM.extension")
    extension.SYS_CONF = SimpleNamespace(get=lambda section, option=None, fallback=None: fallback)
    monkeypatch.setitem(sys.modules, "SYSTEM.extension", extension)

    views = import_module("APPs.Management.views_management")
    sql_tools = import_module("COMMON.tools.storage.sqlalchemy.tools_sqlalchemy_async")
    auth = import_module("SYSTEM.models.models_auth")
    portfolio = import_module("SYSTEM.models.models_portfolio")
    record = import_module("SYSTEM.models.models_record")
    base = import_module("SYSTEM.database.orm").BASE
    statements = []
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def capture_statement(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(sql_tools.CONN_MANAGER, "get_db", sessions)

    @asynccontextmanager
    async def lifespan(_app):
        tables = [
            auth.AuthRole.__table__,
            auth.AuthUser.__table__,
            portfolio.PortfolioLocale.__table__,
            portfolio.PortfolioSite.__table__,
            portfolio.PortfolioSiteLocale.__table__,
            portfolio.PortfolioCareer.__table__,
            portfolio.PortfolioCareerLocale.__table__,
            record.RecordLogin.__table__,
        ]
        async with engine.begin() as connection:
            await connection.run_sync(lambda conn: base.metadata.create_all(conn, tables=tables))
        if getattr(request, "param", None) != "empty":
            timestamp = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
            async with sessions.begin() as session:
                session.add_all(
                    [
                        auth.AuthRole(id=1, role="editor", is_active=True),
                        auth.AuthRole(id=2, role="viewer", is_active=True, is_default=True),
                        auth.AuthRole(id=3, role="archived", is_active=False),
                        portfolio.PortfolioLocale(code="en", name="English"),
                        portfolio.PortfolioLocale(code="zh-Hant", name="繁體中文"),
                        portfolio.PortfolioLocale(
                            code="zh-Hans",
                            name="简体中文",
                            is_active=getattr(request, "param", None) != "inactive_career_locale",
                        ),
                    ]
                )
            first = auth.AuthUser(user="alpha-editor", email="alice.secret@role.example.com", role_id=1)
            await first.set_password("12345678")
            people = [
                (1, "alpha-editor", "alice.secret@role.example.com", 1, True),
                (2, "beta-reader", "beta@example.com", 2, False),
                (3, "gamma-archived", "gamma@example.com", 3, True),
                (4, "delta-reader", "delta@example.com", 2, True),
                (5, "echo_editor", "rate%reviewer@role.example.com", 1, True),
                (6, "foxtrot-helper", "foxtrot@example.com", 3, False),
                (7, "zulu-viewer", "zulu@example.com", 2, True),
            ]
            calendar_updates = (
                {
                    1: datetime(2026, 1, 5, tzinfo=timezone.utc),
                    2: datetime(2026, 1, 5, 12, tzinfo=timezone.utc),
                    3: datetime(2026, 1, 5, 23, 59, 59, 999999, tzinfo=timezone.utc),
                    4: datetime(2026, 1, 6, tzinfo=timezone.utc),
                    5: datetime(2026, 1, 4, 23, 59, 59, 999999, tzinfo=timezone.utc),
                    6: datetime(2026, 1, 6, 12, tzinfo=timezone.utc),
                    7: timestamp,
                }
                if getattr(request, "param", None) == "calendar_dates"
                else {}
            )
            async with sessions.begin() as session:
                session.add_all(
                    auth.AuthUser(
                        id=user_id,
                        user=handle,
                        email=email,
                        role_id=role_id,
                        is_active=active,
                        password=first.password,
                        createtime=timestamp,
                        updatetime=calendar_updates.get(
                            user_id,
                            (
                                timestamp + timedelta(days=user_id)
                                if getattr(request, "param", None) == "account_updates"
                                else timestamp
                            ),
                        ),
                    )
                    for user_id, handle, email, role_id, active in people
                )
            async with sessions.begin() as session:
                session.add_all(
                    portfolio.PortfolioSite(
                        id=100 + user_id,
                        user_id=user_id,
                        is_published=published,
                        is_default=user_id == 1,
                        copyright_year=2026,
                        linkedin="",
                        github="",
                        medium="",
                        email=("contact@public.example.com" if user_id == 1 else f"public{user_id}@example.com"),
                        chat_icon="img/chat.svg",
                    )
                    for user_id, published in [
                        (1, True),
                        (2, False),
                        (4, True),
                        (5, False),
                        (6, True),
                    ]
                )
            translated = [
                (1, "en", "Alpha", "Content editor"),
                (1, "zh-Hant", "繁體品牌", "繁體內容"),
                (2, "en", "Beta", "Public reader"),
                (4, "zh-Hant", "缺英語", "僅繁體內容"),
                (5, "en", "Rate%reviewer", "Literal under_score"),
                (6, "en", "Echo", "Content editor"),
            ]
            async with sessions.begin() as session:
                for user_id, locale, title, profile in translated:
                    text = {name: f"field-{index}-probe" for index, name in enumerate(SITE_TEXT_FIELDS)}
                    text.update(brand_title=title, profile_content=profile)
                    if getattr(request, "param", None) == "profile_names":
                        names = {
                            1: (("Ada", "Lovelace", "") if locale == "en" else ("正", "李", "")),
                            2: ("", "", "Beta"),
                            5: ("\t小明\u3000", " 王\u00a0", ""),
                            6: ("\t", "\ufeff ", "\u3000"),
                        }
                        first_name, family_name, nick_name = names.get(user_id, ("", "", ""))
                        text.update(
                            first_name=first_name,
                            family_name=family_name,
                            nick_name=nick_name,
                        )
                    session.add(portfolio.PortfolioSiteLocale(site_id=100 + user_id, locale=locale, **text))
                for user_id, days in [
                    (1, [2, 3, 5]),
                    (2, [2]),
                    (4, [2, 4]),
                    (6, [2, 3]),
                ]:
                    session.add_all(
                        record.RecordLogin(
                            user_id=user_id,
                            logintime=datetime(2026, 1, day, tzinfo=timezone.utc),
                        )
                        for day in days
                    )
            if getattr(request, "param", None) in (
                "career_profiles",
                "inactive_career_locale",
            ):
                careers = [
                    (401, 1, 0, "work", ["en", "zh-Hant"]),
                    (402, 1, 1, "education", ["en"]),
                    (403, 2, 0, "education", ["en"]),
                    (404, 4, 0, "work", ["zh-Hant"]),
                    (405, 5, 0, "work", []),
                    (406, 6, 0, "work", ["zh-Hans"]),
                ]
                async with sessions.begin() as session:
                    for career_id, user_id, position, kind, locales in careers:
                        career = portfolio.PortfolioCareer(
                            id=career_id,
                            site_id=100 + user_id,
                            journey_position=position,
                            experience_order=position,
                            country_code="GBR",
                            latitude=51.5,
                            longitude=-0.1,
                            type=kind,
                            start_month=date(2024, 1, 1),
                        )
                        career.locales = [
                            portfolio.PortfolioCareerLocale(
                                locale=locale,
                                country_name="United Kingdom",
                                city="London",
                                organization_name="Example",
                                organization_code="EX",
                                organization_title="Engineer",
                                content="Career record",
                                skills=[],
                            )
                            for locale in locales
                        ]
                        session.add(career)
        try:
            yield
        finally:
            await engine.dispose()

    app = FastAPI(lifespan=lifespan)
    app.state.sql_statements = statements
    app.include_router(views.router)
    # Projection tests inject a permitted actor; permission tests exercise real identity storage.
    permission = import_module("APPs.Management.module.module_permission")

    async def projection_actor():
        return SimpleNamespace(id=999, is_manage_roles=True, is_manage_users=True, is_manage_sites=True)

    app.dependency_overrides[permission._CURRENT_IDENTITY] = projection_actor
    with TestClient(app) as client:
        yield client


def fetch(client, resource, **params):
    if isinstance(params.get("filters"), list):
        params["filters"] = json.dumps(params["filters"])
    if isinstance(params.get("search_fields"), list):
        params["search_fields"] = json.dumps(params["search_fields"])
    response = client.get(f"/management/{resource}", params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("resource", ["users", "sites"])
def test_person_cardinality_and_default_pagination(management_client, resource):
    data = fetch(management_client, resource)
    assert set(data) == {"items", "total", "pages", "page", "size"}
    assert (data["total"], data["pages"], data["page"], data["size"]) == (7, 2, 1, 6)
    assert [row["id"] for row in data["items"]] == [1, 2, 3, 4, 5, 6]
    assert [row["id"] for row in fetch(management_client, resource, page=2)["items"]] == [7]
    rows = fetch(management_client, resource, size=100, sort="id:asc")["items"]
    assert [row["id"] for row in rows] == list(range(1, 8))
    assert all(set(row) == (USER_FIELDS if resource == "users" else SITE_FIELDS) for row in rows)
    assert [row["site_id"] for row in rows] == [101, 102, None, 104, 105, 106, None]
    assert [row["has_site"] for row in rows] == [
        True,
        True,
        False,
        True,
        True,
        True,
        False,
    ]
    assert all(type(row["has_site"]) is bool for row in rows)


def test_user_login_aggregates_timestamps_and_independent_states(management_client):
    rows = fetch(management_client, "users", size=100, sort="id:asc")["items"]
    assert [row["login_count"] for row in rows] == [3, 1, 0, 2, 0, 2, 0]
    assert [row["last_login"] for row in rows] == [
        "2026-01-05T00:00:00Z",
        "2026-01-02T00:00:00Z",
        None,
        "2026-01-04T00:00:00Z",
        None,
        "2026-01-03T00:00:00Z",
        None,
    ]
    assert rows[1]["is_active"] is False and rows[1]["login_count"] == 1
    assert rows[2]["is_active"] is True and rows[2]["role_is_active"] is False
    for row in rows:
        assert row["createtime"] == row["updatetime"] == "2026-01-02T03:04:05Z"
        assert type(row["is_active"]) is bool and type(row["role_is_active"]) is bool
        assert "password" not in row


def test_site_missing_locale_and_missing_site_preserve_people(management_client):
    rows = fetch(management_client, "sites", size=100, sort="id:asc")["items"]
    assert all(row["locale"] == "en" for row in rows)
    assert [row["has_translation"] for row in rows] == [
        True,
        True,
        False,
        False,
        True,
        True,
        False,
    ]
    assert rows[0]["email"] == "contact@public.example.com"
    assert rows[3]["is_published"] is True and rows[3]["has_translation"] is False
    assert all(rows[3][field] is None for field in SITE_TEXT_FIELDS)
    no_site_fields = SITE_FIELDS - {
        "id",
        "user",
        "owner_email",
        "owner_is_active",
        "has_site",
        "has_profile",
        "locale",
        "has_translation",
        "createtime",
        "updatetime",
    }
    for position in [2, 6]:
        assert all(rows[position][field] is None for field in no_site_fields)
    traditional = fetch(management_client, "sites", locale="zh-Hant", size=100, sort="id:asc")["items"]
    assert [row["has_translation"] for row in traditional] == [
        True,
        False,
        False,
        True,
        False,
        False,
        False,
    ]
    assert traditional[0]["brand_title"] == "繁體品牌"
    assert traditional[3]["brand_title"] == "缺英語"
    simplified = fetch(management_client, "sites", locale="zh-Hans", size=100)
    assert simplified["total"] == 7
    assert all(row["has_translation"] is False and row["brand_title"] is None for row in simplified["items"])


def test_site_login_email_is_stored_identity_not_handle_or_contact_email(
    management_client,
):
    users = fetch(management_client, "users", size=100, sort="id:asc")["items"]
    sites = fetch(management_client, "sites", size=100, sort="id:asc")["items"]
    assert {row["id"]: row["owner_email"] for row in sites} == {row["id"]: row["email"] for row in users}
    assert sites[0]["owner_email"] == "alice.secret@role.example.com"
    assert sites[0]["owner_email"] != sites[0]["email"]
    assert sites[2]["has_site"] is False and sites[2]["owner_email"]
    for direction in ["asc", "desc"]:
        rows = fetch(management_client, "sites", size=100, sort=f"owner_email:{direction}")["items"]
        assert [row["owner_email"] for row in rows] == sorted(
            [row["owner_email"] for row in sites], reverse=direction == "desc"
        )
    matching = fetch(
        management_client,
        "sites",
        filters=[{"field": "owner_email", "operator": "contains", "value": "alice.secret"}],
    )["items"]
    assert [row["id"] for row in matching] == [1]
    contacts = fetch(
        management_client,
        "sites",
        filters=[{"field": "owner_email", "operator": "contains", "value": "contact@public"}],
    )["items"]
    assert contacts == []


@pytest.mark.parametrize(
    "resource,term,fields,ids",
    [
        ("users", "ZuLu", ["email"], [7]),
        ("users", "ViEwEr", ["email", "role"], [2, 4, 5, 7]),
        ("users", "ViEwEr", ["email"], [5]),
        ("users", "%", ["email"], [5]),
        ("users", "false", ["is_active"], [2, 6]),
        ("users", "0", ["login_count"], [3, 5, 7]),
        ("users", "2026.01.02", ["createtime"], [1, 2, 3, 4, 5, 6, 7]),
        ("users", "2026-01-02", ["createtime"], [1, 2, 3, 4, 5, 6, 7]),
        ("users", "' OR 1=1 --", ["email", "role"], []),
        ("sites", "_", ["user"], [5]),
        ("sites", "alice.secret", ["owner_email"], [1]),
        ("sites", "alice.secret", ["email"], []),
        ("sites", "10", ["site_id"], [1, 2, 4, 5, 6]),
    ],
)
def test_global_search_runs_before_count_and_page(management_client, resource, term, fields, ids):
    first = fetch(management_client, resource, size=2, search=term, search_fields=fields)
    assert first["total"] == len(ids)
    assert [row["id"] for row in first["items"]] == ids[:2]
    combined = [
        row["id"]
        for page in range(1, first["pages"] + 1)
        for row in fetch(
            management_client,
            resource,
            size=2,
            page=page,
            search=term,
            search_fields=fields,
        )["items"]
    ]
    assert combined == ids


def test_global_search_composes_with_column_predicates_and_empty_clears(
    management_client,
):
    active = [{"field": "is_active", "operator": "equals", "value": True}]
    page = fetch(
        management_client,
        "users",
        search="viewer",
        search_fields=["role"],
        filters=active,
    )
    assert [row["id"] for row in page["items"]] == [4, 7]
    cleared = fetch(management_client, "users", search="  ", search_fields=["role"], filters=active)
    assert cleared["total"] == 5
    assert (
        fetch(
            management_client,
            "sites",
            locale="zh-Hant",
            search="繁體",
            search_fields=["brand_title"],
        )["total"]
        == 1
    )
    assert (
        fetch(
            management_client,
            "sites",
            locale="en",
            search="繁體",
            search_fields=["brand_title"],
        )["total"]
        == 0
    )


@pytest.mark.parametrize(
    "query",
    [
        {"search": "x" * 201},
        {"search": "x", "search_fields": "not-json"},
        {"search": "x", "search_fields": '["password"]'},
        {"search": "x", "search_fields": '["email", "email"]'},
        {"search": "x", "search_fields": "[]"},
        {"search": "x", "search_fields": "[1]"},
        {"search": "x", "search_fields": "{}"},
        [("search", "a"), ("search", "b")],
        [
            ("search", "a"),
            ("search_fields", '["email"]'),
            ("search_fields", '["role"]'),
        ],
    ],
)
def test_invalid_global_search_cannot_reach_sql(management_client, query):
    response = management_client.get("/management/users", params=query)
    assert response.status_code == 400
    assert response.json()["detail"] == "INVALID_SEARCH"


@pytest.mark.parametrize("management_client", ["calendar_dates"], indirect=True)
@pytest.mark.parametrize("resource", ["users", "sites"])
def test_default_update_order_and_explicit_sort_override(management_client, resource):
    expected = [6, 4, 3, 2, 1, 5, 7]
    assert [row["id"] for row in fetch(management_client, resource, size=100)["items"]] == expected
    assert [
        row["id"] for page in range(1, 5) for row in fetch(management_client, resource, size=2, page=page)["items"]
    ] == expected
    assert [row["id"] for row in fetch(management_client, resource, size=100, sort="id:desc")["items"]] == list(
        range(7, 0, -1)
    )
    assert [
        row["id"] for row in fetch(management_client, resource, size=100, sort="updatetime:asc")["items"]
    ] == expected[::-1]


@pytest.mark.parametrize("management_client", ["account_updates"], indirect=True)
def test_platform_account_update_times_are_independent_of_site_and_translation(
    management_client,
):
    rows = fetch(management_client, "sites", size=100, sort="updatetime:asc")["items"]
    assert [row["id"] for row in rows] == list(range(1, 8))
    assert [row["updatetime"] for row in rows] == [f"2026-01-{day:02d}T03:04:05Z" for day in range(3, 10)]
    # Owners without a portfolio or selected translation still have a primary-account timestamp.
    assert rows[2]["has_site"] is False and rows[2]["updatetime"] is not None
    assert rows[3]["has_translation"] is False and rows[3]["updatetime"] is not None
    users = fetch(management_client, "users", size=100, sort="id:asc")["items"]
    assert {row["id"]: row["createtime"] for row in rows} == {row["id"]: row["createtime"] for row in users}
    assert {row["id"]: row["updatetime"] for row in rows} == {row["id"]: row["updatetime"] for row in users}
    traditional = fetch(management_client, "sites", locale="zh-Hant", size=100, sort="updatetime:desc")["items"]
    assert [row["id"] for row in traditional] == list(range(7, 0, -1))
    assert {row["id"]: row["updatetime"] for row in rows} == {row["id"]: row["updatetime"] for row in traditional}


@pytest.mark.parametrize(
    ("resource", "params", "ids"),
    [
        (
            "users",
            {
                "filters": [
                    {"field": "role", "operator": "contains", "value": "EDITOR"},
                    {
                        "field": "email",
                        "operator": "contains",
                        "value": "role.example.com",
                    },
                ]
            },
            [5, 1],
        ),
        (
            "users",
            {"filters": [{"field": "role", "operator": "contains", "value": "viewer"}]},
            [7, 4, 2],
        ),
        (
            "users",
            {"filters": [{"field": "role", "operator": "in", "value": ["ViEwEr"]}]},
            [7, 4, 2],
        ),
        (
            "users",
            {"filters": [{"field": "role", "operator": "not_in", "value": ["ViEwEr"]}]},
            [6, 5, 3, 1],
        ),
        (
            "users",
            {"filters": [{"field": "role", "operator": "in", "value": ["viewer", "editor"]}]},
            [7, 5, 4, 2, 1],
        ),
        ("users", {"filters": [{"field": "role", "operator": "in", "value": []}]}, []),
        (
            "users",
            {"filters": [{"field": "email", "operator": "contains", "value": "alice.secret"}]},
            [1],
        ),
        (
            "users",
            {"filters": [{"field": "email", "operator": "contains", "value": "%"}]},
            [5],
        ),
        (
            "users",
            {"filters": [{"field": "email", "operator": "contains", "value": "%"}]},
            [5],
        ),
        (
            "sites",
            {
                "filters": [
                    {
                        "field": "profile_content",
                        "operator": "contains",
                        "value": "EDITOR content",
                    }
                ]
            },
            [],
        ),
        (
            "sites",
            {
                "filters": [
                    {
                        "field": "profile_content",
                        "operator": "contains",
                        "value": "content editor",
                    }
                ]
            },
            [6, 1],
        ),
        (
            "sites",
            {
                "filters": [
                    {
                        "field": "email",
                        "operator": "contains",
                        "value": "contact@public",
                    }
                ]
            },
            [1],
        ),
        (
            "sites",
            {"filters": [{"field": "email", "operator": "contains", "value": "alice.secret"}]},
            [],
        ),
        (
            "sites",
            {
                "filters": [
                    {
                        "field": "profile_content",
                        "operator": "contains",
                        "value": "繁體",
                    }
                ]
            },
            [],
        ),
        (
            "sites",
            {
                "filters": [
                    {
                        "field": "profile_content",
                        "operator": "contains",
                        "value": "繁體",
                    }
                ],
                "locale": "zh-Hant",
            },
            [4, 1],
        ),
        (
            "sites",
            {"filters": [{"field": "brand_title", "operator": "contains", "value": "%"}]},
            [5],
        ),
        (
            "sites",
            {"filters": [{"field": "profile_content", "operator": "contains", "value": "_"}]},
            [5],
        ),
        (
            "users",
            {"filters": [{"field": "is_active", "operator": "equals", "value": False}]},
            [6, 2],
        ),
        (
            "users",
            {"filters": [{"field": "role_is_active", "operator": "equals", "value": False}]},
            [6, 3],
        ),
        (
            "users",
            {"filters": [{"field": "has_site", "operator": "equals", "value": False}]},
            [7, 3],
        ),
        (
            "users",
            {"filters": [{"field": "role_id", "operator": "equals", "value": 2}]},
            [7, 4, 2],
        ),
        (
            "users",
            {"filters": [{"field": "role_id", "operator": "equals", "value": 99}]},
            [],
        ),
        (
            "users",
            {"filters": [{"field": "role_id", "operator": "equals", "value": 2147483647}]},
            [],
        ),
        (
            "sites",
            {"filters": [{"field": "owner_is_active", "operator": "equals", "value": False}]},
            [6, 2],
        ),
        (
            "sites",
            {"filters": [{"field": "has_site", "operator": "equals", "value": False}]},
            [7, 3],
        ),
        (
            "sites",
            {"filters": [{"field": "has_translation", "operator": "equals", "value": False}]},
            [7, 4, 3],
        ),
        (
            "sites",
            {"filters": [{"field": "is_published", "operator": "equals", "value": False}]},
            [5, 2],
        ),
        (
            "sites",
            {"filters": [{"field": "is_default", "operator": "equals", "value": False}]},
            [6, 5, 4, 2],
        ),
        (
            "sites",
            {"filters": [{"field": "is_default", "operator": "equals", "value": True}]},
            [1],
        ),
        (
            "users",
            {
                "filters": [
                    {"field": "is_active", "operator": "equals", "value": True},
                    {"field": "role_is_active", "operator": "equals", "value": False},
                ]
            },
            [3],
        ),
        (
            "sites",
            {
                "filters": [
                    {"field": "has_translation", "operator": "equals", "value": False},
                    {"field": "has_site", "operator": "equals", "value": True},
                ]
            },
            [4],
        ),
        (
            "sites",
            {
                "filters": [
                    {"field": "is_published", "operator": "equals", "value": True},
                    {"field": "has_translation", "operator": "equals", "value": False},
                ]
            },
            [4],
        ),
    ],
)
def test_search_and_filters_apply_in_database_before_paging(management_client, resource, params, ids):
    data = fetch(management_client, resource, size=100, sort="id:desc", **params)
    assert data["total"] == len(ids)
    assert [row["id"] for row in data["items"]] == ids
    pages = [
        fetch(management_client, resource, size=1, page=page, sort="id:desc", **params)
        for page in range(1, len(ids) + 1)
    ]
    assert [page["items"][0]["id"] for page in pages] == ids
    assert all(page["total"] == page["pages"] == len(ids) for page in pages)


@pytest.mark.parametrize("field", SITE_TEXT_FIELDS)
def test_site_search_covers_every_localized_text_field(management_client, field):
    if field in {"brand_title", "profile_content"}:
        keyword = "Alpha" if field == "brand_title" else "under_score"
        ids = [1] if field == "brand_title" else [5]
    else:
        keyword = f"field-{SITE_TEXT_FIELDS.index(field)}-probe"
        ids = [6, 5, 2, 1]
    data = fetch(
        management_client,
        "sites",
        filters=[{"field": field, "operator": "contains", "value": keyword}],
        sort="id:desc",
    )
    assert [row["id"] for row in data["items"]] == ids


@pytest.mark.parametrize(
    ("resource", "sort", "ids"),
    [
        ("users", "is_active:desc,role:asc", [3, 1, 5, 4, 7, 6, 2]),
        ("users", "login_count:desc", [1, 4, 6, 2, 3, 5, 7]),
        ("users", "last_login:desc", [1, 4, 6, 2, 3, 5, 7]),
        ("users", "last_login:asc", [2, 6, 4, 1, 3, 5, 7]),
        ("users", "createtime:desc", [1, 2, 3, 4, 5, 6, 7]),
        ("users", "login_count:asc,id:desc", [7, 5, 3, 2, 6, 4, 1]),
        ("sites", "brand_title:asc", [1, 2, 6, 5, 3, 4, 7]),
        ("sites", "brand_title:desc", [5, 6, 2, 1, 3, 4, 7]),
        ("sites", "is_published:desc", [1, 4, 6, 2, 5, 3, 7]),
        ("sites", "has_site:desc,owner_is_active:desc", [1, 4, 5, 2, 6, 3, 7]),
        ("sites", "copyright_year:desc,id:desc", [6, 5, 4, 2, 1, 7, 3]),
    ],
)
def test_multicolumn_sort_is_stable_and_nulls_are_last(management_client, resource, sort, ids):
    assert [row["id"] for row in fetch(management_client, resource, size=100, sort=sort)["items"]] == ids
    paged = [
        row["id"]
        for page in range(1, 5)
        for row in fetch(management_client, resource, size=2, page=page, sort=sort)["items"]
    ]
    assert paged == ids


@pytest.mark.parametrize("resource", ["users", "sites"])
def test_empty_results_out_of_range_pages_and_size_limits(management_client, resource):
    assert fetch(
        management_client,
        resource,
        filters=[
            {
                "field": "email" if resource == "users" else "user",
                "operator": "contains",
                "value": "missing-everywhere",
            }
        ],
        page=2,
    ) == {
        "items": [],
        "total": 0,
        "pages": 0,
        "page": 2,
        "size": 6,
    }
    assert fetch(management_client, resource, page=3) == {
        "items": [],
        "total": 7,
        "pages": 2,
        "page": 3,
        "size": 6,
    }
    assert fetch(management_client, resource, size=1)["pages"] == 7
    assert fetch(management_client, resource, size=100)["pages"] == 1
    assert fetch(management_client, resource, filters=[])["total"] == 7


@pytest.mark.parametrize("management_client", ["empty"], indirect=True)
@pytest.mark.parametrize("resource", ["users", "sites"])
def test_empty_database(management_client, resource):
    assert fetch(management_client, resource, page=2) == {
        "items": [],
        "total": 0,
        "pages": 0,
        "page": 2,
        "size": 6,
    }


@pytest.mark.parametrize("resource", ["users", "sites"])
@pytest.mark.parametrize(
    ("params", "detail"),
    [
        ({"page": "0"}, "INVALID_PAGE"),
        ({"page": "1.5"}, "INVALID_PAGE"),
        ({"page": "9007199254740992"}, "INVALID_PAGE"),
        ({"size": "0"}, "INVALID_SIZE"),
        ({"size": "101"}, "INVALID_SIZE"),
        ({"size": "all"}, "INVALID_SIZE"),
        ({"q": "obsolete"}, "INVALID_QUERY"),
        ({"sort": "password:asc"}, "INVALID_SORT"),
        ({"sort": "id:asc;DROP TABLE auth_user"}, "INVALID_SORT"),
        ({"sort": "user:asc,user:desc"}, "INVALID_SORT"),
        ({"sort": "id:asc,user:asc,email:asc,has_site:asc"}, "INVALID_SORT"),
        ({"sort": "user:ASC"}, "INVALID_SORT"),
        ({"sort": ""}, "INVALID_SORT"),
        ({"q": "obsolete"}, "INVALID_QUERY"),
        ({"q": "obsolete"}, "INVALID_QUERY"),
    ],
)
def test_common_invalid_queries_return_400(management_client, resource, params, detail):
    response = management_client.get(f"/management/{resource}", params=params)
    assert response.status_code == 400
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize(
    ("resource", "params", "detail"),
    [
        ("users", {"q": "obsolete"}, "INVALID_QUERY"),
        ("users", {"q": "obsolete"}, "INVALID_QUERY"),
        ("users", {"q": "obsolete"}, "INVALID_QUERY"),
        ("users", {"q": "obsolete"}, "INVALID_QUERY"),
        ("users", {"q": "obsolete"}, "INVALID_QUERY"),
        ("users", {"q": "obsolete"}, "INVALID_QUERY"),
        ("users", {"q": "obsolete"}, "INVALID_QUERY"),
        ("sites", {"q": "obsolete"}, "INVALID_QUERY"),
        ("sites", {"q": "obsolete"}, "INVALID_QUERY"),
        ("sites", {"q": "obsolete"}, "INVALID_QUERY"),
        ("sites", {"q": "obsolete"}, "INVALID_QUERY"),
        ("sites", {"locale": "fr"}, "INVALID_LOCALE"),
        ("sites", {"locale": "EN"}, "INVALID_LOCALE"),
        ("sites", {"sort": "locale:asc"}, "INVALID_SORT"),
    ],
)
def test_resource_specific_invalid_queries_return_400(management_client, resource, params, detail):
    response = management_client.get(f"/management/{resource}", params=params)
    assert response.status_code == 400
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize(
    ("resource", "class_name"),
    [
        ("users", "ManagementUsersModule"),
        ("sites", "ManagementSitesModule"),
    ],
)
def test_storage_errors_do_not_expose_internal_details(management_client, monkeypatch, resource, class_name):
    module = import_module("APPs.Management.module")

    async def unavailable(*_args, **_kwargs):
        raise SQLAlchemyError("private management database connection details")

    monkeypatch.setattr(getattr(module, class_name), "paginate_orm", unavailable)
    response = management_client.get(f"/management/{resource}")
    assert response.status_code == 503
    assert response.json() == {"detail": "MANAGEMENT_DATABASE_UNAVAILABLE"}


@pytest.mark.parametrize(
    ("resource", "query_fields", "row_fields"),
    [
        (
            "users",
            {"page", "size", "sort", "filters", "search", "search_fields"},
            USER_FIELDS,
        ),
        (
            "sites",
            {"page", "size", "sort", "filters", "locale", "search", "search_fields"},
            SITE_FIELDS,
        ),
    ],
)
def test_openapi_declares_resource_queries_and_typed_object_rows(management_client, resource, query_fields, row_fields):
    spec = management_client.get("/openapi.json").json()
    operation = spec["paths"][f"/management/{resource}"]["get"]
    assert (
        next(parameter for parameter in operation["parameters"] if parameter["name"] == "sort")["schema"]["default"]
        == "updatetime:desc"
    )
    assert {parameter["name"] for parameter in operation["parameters"]} == query_fields
    assert {"200", "400", "503"} <= set(operation["responses"])
    envelope_ref = operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    envelope = spec["components"]["schemas"][envelope_ref.rsplit("/", 1)[1]]
    assert set(envelope["properties"]) == {"items", "total", "pages", "page", "size"}
    row_ref = envelope["properties"]["items"]["items"]["$ref"]
    row = spec["components"]["schemas"][row_ref.rsplit("/", 1)[1]]
    assert set(row["properties"]) == row_fields
    assert row["properties"]["has_site"]["type"] == "boolean"


def test_users_expose_stored_email_without_public_handle(management_client):
    users = fetch(management_client, "users", size=100, sort="id:asc")["items"]
    assert users[0]["email"] == "alice.secret@role.example.com"
    assert all("user" not in row and len(row) == 12 for row in users)
    sites = fetch(management_client, "sites", size=100, sort="id:asc")["items"]
    assert sites[0]["user"] == "alpha-editor"
    for params, detail in [
        ({"sort": "user:asc"}, "INVALID_SORT"),
        (
            {"filters": json.dumps([{"field": "user", "operator": "contains", "value": "alpha"}])},
            "INVALID_FILTERS",
        ),
    ]:
        response = management_client.get("/management/users", params=params)
        assert response.status_code == 400
        assert response.json()["detail"] == detail


@pytest.mark.parametrize("management_client", ["career_profiles"], indirect=True)
def test_profile_exists_is_localized_and_never_joins_multiple_careers_into_people(
    management_client,
):
    rows = fetch(management_client, "sites", size=100, sort="id:asc")["items"]
    assert len(rows) == 7
    assert [row["has_profile"] for row in rows] == [
        True,
        True,
        False,
        False,
        False,
        False,
        False,
    ]
    assert all(type(row["has_profile"]) is bool for row in rows)
    assert rows[1]["owner_is_active"] is False and rows[1]["is_published"] is False
    assert rows[4]["has_site"] and rows[4]["has_translation"] and not rows[4]["has_profile"]
    traditional = fetch(management_client, "sites", size=100, sort="id:asc", locale="zh-Hant")
    assert traditional["total"] == 7
    assert [row["id"] for row in traditional["items"] if row["has_profile"]] == [1, 4]
    simplified = fetch(management_client, "sites", size=100, locale="zh-Hans")
    assert [row["id"] for row in simplified["items"] if row["has_profile"]] == [6]


@pytest.mark.parametrize("management_client", ["inactive_career_locale"], indirect=True)
def test_management_profile_includes_careers_in_an_inactive_language(management_client):
    rows = fetch(management_client, "sites", size=100, locale="zh-Hans")["items"]
    assert [row["id"] for row in rows if row["has_profile"]] == [6]


@pytest.mark.parametrize("management_client", ["career_profiles"], indirect=True)
@pytest.mark.parametrize("present,ids", [(True, [1, 2]), (False, [3, 4, 5, 6, 7])])
def test_profile_filter_counts_the_same_exists_expression_before_pagination(management_client, present, ids):
    data = fetch(
        management_client,
        "sites",
        size=1,
        page=2,
        sort="id:asc",
        filters=[{"field": "has_profile", "operator": "equals", "value": present}],
    )
    assert (data["total"], data["pages"]) == (len(ids), len(ids))
    assert [row["id"] for row in data["items"]] == [ids[1]]
    assert data["items"][0]["has_profile"] is present


@pytest.mark.parametrize("management_client", ["career_profiles"], indirect=True)
def test_profile_sort_and_scoped_search_use_the_same_boolean(management_client):
    rows = fetch(management_client, "sites", size=100, sort="has_profile:asc,id:asc")["items"]
    assert [row["id"] for row in rows] == [3, 4, 5, 6, 7, 1, 2]
    data = fetch(
        management_client,
        "sites",
        size=100,
        sort="id:asc",
        search="TRUE",
        search_fields=["has_profile"],
    )
    assert [row["id"] for row in data["items"]] == [1, 2]


@pytest.mark.parametrize("management_client", ["career_profiles"], indirect=True)
def test_profile_presence_does_not_fetch_career_rows_or_add_per_person_queries(
    management_client,
):
    statements = management_client.app.state.sql_statements
    statements.clear()
    data = fetch(management_client, "sites", size=100)
    assert data["total"] == 7
    assert len(statements) == 2
    assert all("EXISTS (SELECT" in statement.upper() for statement in statements)
    assert not any("SELECT portfolio_career." in statement for statement in statements)
