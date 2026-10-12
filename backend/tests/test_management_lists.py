"""Exercise account and platform lists through isolated SQL-backed management routes."""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from importlib import import_module
from pathlib import Path
from types import ModuleType, SimpleNamespace
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import event
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

USER_FIELDS = {
    "id",
    "user",
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
    "owner_is_active",
    "site_id",
    "has_site",
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
    "updatetime",
}


@pytest.fixture
def management_client(monkeypatch, request):
    """Keep production query behavior while replacing runtime settings and storage."""
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))
    settings = ModuleType("SYSTEM.settings")
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
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

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
                        portfolio.PortfolioLocale(code="zh-Hans", name="简体中文"),
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
                        updatetime=(
                            timestamp + timedelta(days=user_id)
                            if getattr(request, "param", None) == "account_updates"
                            else timestamp
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
                        email="contact@public.example.com" if user_id == 1 else f"public{user_id}@example.com",
                        chat_icon="img/chat.svg",
                    )
                    for user_id, published in [(1, True), (2, False), (4, True), (5, False), (6, True)]
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
                    session.add(portfolio.PortfolioSiteLocale(site_id=100 + user_id, locale=locale, **text))
                for user_id, days in [(1, [2, 3, 5]), (2, [2]), (4, [2, 4]), (6, [2, 3])]:
                    session.add_all(
                        record.RecordLogin(user_id=user_id, logintime=datetime(2026, 1, day, tzinfo=timezone.utc))
                        for day in days
                    )
        try:
            yield
        finally:
            await engine.dispose()

    app = FastAPI(lifespan=lifespan)
    app.include_router(views.router)
    with TestClient(app) as client:
        yield client


def fetch(client, resource, **params):
    response = client.get(f"/management/{resource}", params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("resource", ["users", "sites"])
def test_person_cardinality_and_default_pagination(management_client, resource):
    data = fetch(management_client, resource)
    assert set(data) == {"items", "total", "pages", "page", "size"}
    assert (data["total"], data["pages"], data["page"], data["size"]) == (7, 2, 1, 6)
    assert [row["id"] for row in data["items"]] == [7, 6, 5, 4, 3, 2]
    assert [row["id"] for row in fetch(management_client, resource, page=2)["items"]] == [1]
    rows = fetch(management_client, resource, size=100, sort="id:asc")["items"]
    assert [row["id"] for row in rows] == list(range(1, 8))
    assert all(set(row) == (USER_FIELDS if resource == "users" else SITE_FIELDS) for row in rows)
    assert [row["site_id"] for row in rows] == [101, 102, None, 104, 105, 106, None]
    assert [row["has_site"] for row in rows] == [True, True, False, True, True, True, False]
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
    assert [row["has_translation"] for row in rows] == [True, True, False, False, True, True, False]
    assert rows[0]["email"] == "contact@public.example.com"
    assert rows[3]["is_published"] is True and rows[3]["has_translation"] is False
    assert all(rows[3][field] is None for field in SITE_TEXT_FIELDS)
    no_site_fields = SITE_FIELDS - {
        "id",
        "user",
        "owner_is_active",
        "has_site",
        "locale",
        "has_translation",
        "updatetime",
    }
    for position in [2, 6]:
        assert all(rows[position][field] is None for field in no_site_fields)
    traditional = fetch(management_client, "sites", locale="zh-Hant", size=100, sort="id:asc")["items"]
    assert [row["has_translation"] for row in traditional] == [True, False, False, True, False, False, False]
    assert traditional[0]["brand_title"] == "繁體品牌"
    assert traditional[3]["brand_title"] == "缺英語"
    simplified = fetch(management_client, "sites", locale="zh-Hans", size=100)
    assert simplified["total"] == 7
    assert all(row["has_translation"] is False and row["brand_title"] is None for row in simplified["items"])


@pytest.mark.parametrize("management_client", ["account_updates"], indirect=True)
def test_platform_account_update_times_are_independent_of_site_and_translation(management_client):
    rows = fetch(management_client, "sites", size=100, sort="updatetime:asc")["items"]
    assert [row["id"] for row in rows] == list(range(1, 8))
    assert [row["updatetime"] for row in rows] == [f"2026-01-{day:02d}T03:04:05Z" for day in range(3, 10)]
    # Owners without a portfolio or selected translation still have a primary-account timestamp.
    assert rows[2]["has_site"] is False and rows[2]["updatetime"] is not None
    assert rows[3]["has_translation"] is False and rows[3]["updatetime"] is not None
    users = fetch(management_client, "users", size=100, sort="id:asc")["items"]
    assert {row["id"]: row["updatetime"] for row in rows} == {row["id"]: row["updatetime"] for row in users}
    traditional = fetch(management_client, "sites", locale="zh-Hant", size=100, sort="updatetime:desc")["items"]
    assert [row["id"] for row in traditional] == list(range(7, 0, -1))
    assert {row["id"]: row["updatetime"] for row in rows} == {row["id"]: row["updatetime"] for row in traditional}


@pytest.mark.parametrize(
    ("resource", "params", "ids"),
    [
        ("users", {"search": "EDITOR role.example.com"}, [5, 1]),
        ("users", {"search": "viewer"}, [7, 5, 4, 2]),
        ("users", {"search": "alice.secret"}, [1]),
        ("users", {"search": "%"}, [5]),
        ("users", {"search": "_"}, [5]),
        ("users", {"is_active": "false"}, [6, 2]),
        ("users", {"role_is_active": "false"}, [6, 3]),
        ("users", {"has_site": "false"}, [7, 3]),
        ("users", {"role_id": "2"}, [7, 4, 2]),
        ("users", {"is_active": "true", "role_is_active": "false"}, [3]),
        ("users", {"role_id": "99"}, []),
        ("users", {"role_id": "2147483647"}, []),
        ("sites", {"search": "EDITOR content"}, [6, 1]),
        ("sites", {"search": "contact@public"}, [1]),
        ("sites", {"search": "alice.secret"}, []),
        ("sites", {"search": "繁體"}, []),
        ("sites", {"search": "繁體", "locale": "zh-Hant"}, [4, 1]),
        ("sites", {"search": "%"}, [5]),
        ("sites", {"search": "_"}, [5]),
        ("sites", {"owner_is_active": "false"}, [6, 2]),
        ("sites", {"has_site": "false"}, [7, 3]),
        ("sites", {"has_translation": "false"}, [7, 4, 3]),
        ("sites", {"has_translation": "false", "has_site": "true"}, [4]),
        ("sites", {"is_published": "false"}, [5, 2]),
        ("sites", {"is_default": "false"}, [6, 5, 4, 2]),
        ("sites", {"is_default": "true"}, [1]),
        ("sites", {"is_published": "true", "has_translation": "false"}, [4]),
    ],
)
def test_search_and_filters_apply_in_database_before_paging(management_client, resource, params, ids):
    data = fetch(management_client, resource, size=100, **params)
    assert data["total"] == len(ids)
    assert [row["id"] for row in data["items"]] == ids
    pages = [fetch(management_client, resource, size=1, page=page, **params) for page in range(1, len(ids) + 1)]
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
    data = fetch(management_client, "sites", search=keyword)
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
    assert fetch(management_client, resource, search="missing-everywhere", page=2) == {
        "items": [],
        "total": 0,
        "pages": 0,
        "page": 2,
        "size": 6,
    }
    assert fetch(management_client, resource, page=3) == {"items": [], "total": 7, "pages": 2, "page": 3, "size": 6}
    assert fetch(management_client, resource, size=1)["pages"] == 7
    assert fetch(management_client, resource, size=100)["pages"] == 1
    assert fetch(management_client, resource, search="  ")["total"] == 7


@pytest.mark.parametrize("management_client", ["empty"], indirect=True)
@pytest.mark.parametrize("resource", ["users", "sites"])
def test_empty_database(management_client, resource):
    assert fetch(management_client, resource, page=2) == {"items": [], "total": 0, "pages": 0, "page": 2, "size": 6}


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
        ({"has_site": "1"}, "INVALID_HAS_SITE"),
        ({"sort": "password:asc"}, "INVALID_SORT"),
        ({"sort": "id:asc;DROP TABLE auth_user"}, "INVALID_SORT"),
        ({"sort": "user:asc,user:desc"}, "INVALID_SORT"),
        ({"sort": "id:asc,user:asc,email:asc,has_site:asc"}, "INVALID_SORT"),
        ({"sort": "user:ASC"}, "INVALID_SORT"),
        ({"sort": ""}, "INVALID_SORT"),
        ({"search": "x" * 201}, "INVALID_SEARCH"),
        ({"search": " ".join(["word"] * 11)}, "INVALID_SEARCH"),
    ],
)
def test_common_invalid_queries_return_400(management_client, resource, params, detail):
    response = management_client.get(f"/management/{resource}", params=params)
    assert response.status_code == 400
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize(
    ("resource", "params", "detail"),
    [
        ("users", {"is_active": "yes"}, "INVALID_IS_ACTIVE"),
        ("users", {"role_is_active": "1"}, "INVALID_ROLE_IS_ACTIVE"),
        ("users", {"role_id": "0"}, "INVALID_ROLE_ID"),
        ("users", {"role_id": "-1"}, "INVALID_ROLE_ID"),
        ("users", {"role_id": "1.5"}, "INVALID_ROLE_ID"),
        ("users", {"role_id": "editor"}, "INVALID_ROLE_ID"),
        ("users", {"role_id": "2147483648"}, "INVALID_ROLE_ID"),
        ("sites", {"owner_is_active": "1"}, "INVALID_OWNER_IS_ACTIVE"),
        ("sites", {"is_published": "yes"}, "INVALID_IS_PUBLISHED"),
        ("sites", {"is_default": "0"}, "INVALID_IS_DEFAULT"),
        ("sites", {"has_translation": "no"}, "INVALID_HAS_TRANSLATION"),
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
    module = import_module("APPs.Management.module.module_management")

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
            {"page", "size", "search", "sort", "is_active", "role_is_active", "has_site", "role_id"},
            USER_FIELDS,
        ),
        (
            "sites",
            {
                "page",
                "size",
                "search",
                "sort",
                "locale",
                "owner_is_active",
                "has_site",
                "is_published",
                "is_default",
                "has_translation",
            },
            SITE_FIELDS,
        ),
    ],
)
def test_openapi_declares_resource_queries_and_typed_object_rows(management_client, resource, query_fields, row_fields):
    spec = management_client.get("/openapi.json").json()
    operation = spec["paths"][f"/management/{resource}"]["get"]
    assert {parameter["name"] for parameter in operation["parameters"]} == query_fields
    assert {"200", "400", "503"} <= set(operation["responses"])
    envelope_ref = operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    envelope = spec["components"]["schemas"][envelope_ref.rsplit("/", 1)[1]]
    assert set(envelope["properties"]) == {"items", "total", "pages", "page", "size"}
    row_ref = envelope["properties"]["items"]["items"]["$ref"]
    row = spec["components"]["schemas"][row_ref.rsplit("/", 1)[1]]
    assert set(row["properties"]) == row_fields
    assert row["properties"]["has_site"]["type"] == "boolean"
