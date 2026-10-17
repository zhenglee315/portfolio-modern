"""Exercise management role queries through real routes and an isolated SQLite database."""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
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


@pytest.fixture
def role_client(monkeypatch, request):
    """Retain the production parser/module/response while replacing only settings and storage."""
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))
    settings = ModuleType("SYSTEM.settings")
    settings.SEC_MANAGEMENT_ORIGINS = frozenset()
    settings.SEC_SECRET_KEY = "isolated-test-secret"
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
    models = import_module("SYSTEM.models.models_auth")
    base = import_module("SYSTEM.database.orm").BASE
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(sql_tools.CONN_MANAGER, "get_db", sessions)

    @asynccontextmanager
    async def lifespan(_app):
        tables = [models.AuthRole.__table__, models.AuthUser.__table__]
        async with engine.begin() as connection:
            await connection.run_sync(lambda conn: base.metadata.create_all(conn, tables=tables))
        if getattr(request, "param", None) != "empty":
            timestamp = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
            records = [
                (1, "viewer", None, True),
                (2, "editor", "Content review", True),
                (3, "admin", "Platform owner", True),
                (4, "archived", "Content review", False),
                (5, "editor_ops", "Operations", True),
                (6, "rate%reviewer", "Content review", True),
                (7, "content", "Editor helper", True),
                (8, "auditor", "Operations", False),
            ]
            async with sessions.begin() as session:
                session.add_all(
                    models.AuthRole(
                        id=role_id,
                        role=name,
                        description=description,
                        is_active=active,
                        is_default=role_id == 1,
                        is_read=True,
                        is_manage_roles=role_id == 3,
                        is_manage_users=role_id == 3,
                        is_manage_sites=role_id == 3,
                        createtime=timestamp,
                        updatetime=(
                            timestamp + timedelta(days={1: 2, 2: 5, 3: 5, 4: 1, 8: 7}.get(role_id, 0))
                            if getattr(request, "param", None) == "role_updates"
                            else timestamp
                        ),
                    )
                    for role_id, name, description, active in records
                )
            account = models.AuthUser(id=1, user="account-one", email="one@example.com", role_id=2)
            await account.set_password("12345678")
            async with sessions.begin() as session:
                session.add_all(
                    [
                        account,
                        models.AuthUser(
                            id=2,
                            user="account-two",
                            email="two@example.com",
                            role_id=2,
                            password=account.password,
                            is_active=False,
                        ),
                        models.AuthUser(
                            id=3,
                            user="account-three",
                            email="three@example.com",
                            role_id=3,
                            password=account.password,
                        ),
                    ]
                )
        try:
            yield
        finally:
            await engine.dispose()

    app = FastAPI(lifespan=lifespan)
    app.include_router(views.router)
    # Projection tests inject a permitted actor; permission tests exercise real identity storage.
    permission = import_module("APPs.Management.module.module_permission")

    async def projection_actor():
        return SimpleNamespace(id=999, is_manage_roles=True, is_manage_users=True, is_manage_sites=True)

    app.dependency_overrides[permission._CURRENT_IDENTITY] = projection_actor
    with TestClient(app) as client:
        yield client


def fetch(client, **params):
    if isinstance(params.get("filters"), list):
        params["filters"] = json.dumps(params["filters"])
    response = client.get("/management/roles", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_role_rows_counts_and_default_pagination(role_client):
    data = fetch(role_client)
    assert set(data) == {"items", "total", "pages", "page", "size"}
    assert (data["total"], data["pages"], data["page"], data["size"]) == (8, 2, 1, 6)
    assert [row["id"] for row in data["items"]] == [1, 2, 3, 4, 5, 6]
    rows = fetch(role_client, size=100, sort="id:asc")["items"]
    assert [row["user_count"] for row in rows] == [0, 2, 1, 0, 0, 0, 0, 0]
    expected = {
        "id",
        "role",
        "description",
        "is_create",
        "is_read",
        "is_update",
        "is_delete",
        "is_manage_sites",
        "is_manage_users",
        "is_manage_roles",
        "is_default",
        "is_active",
        "createtime",
        "updatetime",
        "user_count",
    }
    for row in rows:
        assert set(row) == expected
        assert all(type(row[field]) is bool for field in expected if field.startswith("is_"))
        assert row["createtime"] == row["updatetime"] == "2026-01-02T03:04:05Z"
    assert rows[0]["description"] is None


@pytest.mark.parametrize(
    ("params", "ids"),
    [
        (
            {"filters": [{"field": "role", "operator": "contains", "value": "EDITOR"}]},
            [5, 2],
        ),
        ({"filters": [{"field": "role", "operator": "contains", "value": "%"}]}, [6]),
        ({"filters": [{"field": "role", "operator": "contains", "value": "_"}]}, [5]),
        (
            {"filters": [{"field": "description", "operator": "contains", "value": "review"}]},
            [6, 4, 2],
        ),
        ({"filters": []}, [8, 7, 6, 5, 4, 3, 2, 1]),
        (
            {"filters": [{"field": "is_active", "operator": "equals", "value": False}]},
            [8, 4],
        ),
        (
            {"filters": [{"field": "is_default", "operator": "equals", "value": True}]},
            [1],
        ),
        (
            {"filters": [{"field": "is_default", "operator": "equals", "value": False}]},
            [8, 7, 6, 5, 4, 3, 2],
        ),
        (
            {
                "filters": [
                    {"field": "description", "operator": "contains", "value": "review"},
                    {"field": "is_active", "operator": "equals", "value": False},
                    {"field": "is_default", "operator": "equals", "value": False},
                ]
            },
            [4],
        ),
    ],
)
def test_search_and_boolean_filters_apply_before_pagination(role_client, params, ids):
    data = fetch(role_client, size=100, sort="id:desc", **params)
    assert data["total"] == len(ids)
    assert [row["id"] for row in data["items"]] == ids


@pytest.mark.parametrize(
    ("sort", "ids"),
    [
        ("is_active:desc,user_count:desc,role:asc", [2, 3, 7, 5, 6, 1, 4, 8]),
        ("user_count:desc", [2, 3, 1, 4, 5, 6, 7, 8]),
        ("user_count:asc,id:desc", [8, 7, 6, 5, 4, 1, 3, 2]),
        ("createtime:desc", [1, 2, 3, 4, 5, 6, 7, 8]),
        ("description:asc", [2, 4, 6, 7, 5, 8, 3, 1]),
        ("description:desc", [3, 5, 8, 7, 2, 4, 6, 1]),
    ],
)
def test_multicolumn_sort_nulls_and_stable_ties(role_client, sort, ids):
    assert [row["id"] for row in fetch(role_client, size=100, sort=sort)["items"]] == ids
    paged = [row["id"] for page in range(1, 5) for row in fetch(role_client, size=2, page=page, sort=sort)["items"]]
    assert paged == ids


@pytest.mark.parametrize("role_client", ["role_updates"], indirect=True)
def test_default_update_order_is_stable_and_explicit_sort_overrides_it(role_client):
    expected = [8, 2, 3, 1, 4, 5, 6, 7]
    assert [row["id"] for row in fetch(role_client, size=100)["items"]] == expected
    assert [row["id"] for page in range(1, 5) for row in fetch(role_client, size=2, page=page)["items"]] == expected
    assert [row["id"] for row in fetch(role_client, size=100, sort="id:desc")["items"]] == list(range(8, 0, -1))
    assert [row["id"] for row in fetch(role_client, size=100, sort="updatetime:asc")["items"]] == [
        5,
        6,
        7,
        4,
        1,
        2,
        3,
        8,
    ]


def test_matching_totals_and_out_of_range_pages(role_client):
    data = fetch(
        role_client,
        filters=[{"field": "description", "operator": "contains", "value": "review"}],
        size=2,
        page=2,
        sort="id:desc",
    )
    assert (data["total"], data["pages"], data["page"], data["size"]) == (3, 2, 2, 2)
    assert [row["id"] for row in data["items"]] == [2]
    assert fetch(role_client, page=3) == {
        "items": [],
        "total": 8,
        "pages": 2,
        "page": 3,
        "size": 6,
    }
    assert fetch(
        role_client,
        filters=[{"field": "role", "operator": "contains", "value": "missing"}],
    ) == {
        "items": [],
        "total": 0,
        "pages": 0,
        "page": 1,
        "size": 6,
    }
    assert fetch(role_client, size=1)["pages"] == 8


@pytest.mark.parametrize("role_client", ["empty"], indirect=True)
def test_empty_database(role_client):
    assert fetch(role_client, page=2) == {
        "items": [],
        "total": 0,
        "pages": 0,
        "page": 2,
        "size": 6,
    }


@pytest.mark.parametrize(
    ("params", "detail"),
    [
        ({"page": "0"}, "INVALID_PAGE"),
        ({"page": "-1"}, "INVALID_PAGE"),
        ({"page": "all"}, "INVALID_PAGE"),
        ({"page": "1.5"}, "INVALID_PAGE"),
        ({"page": "9007199254740992"}, "INVALID_PAGE"),
        ({"size": "0"}, "INVALID_SIZE"),
        ({"size": "101"}, "INVALID_SIZE"),
        ({"size": "all"}, "INVALID_SIZE"),
        ({"q": "obsolete"}, "INVALID_QUERY"),
        ({"q": "obsolete"}, "INVALID_QUERY"),
        ({"sort": "password:asc"}, "INVALID_SORT"),
        ({"sort": "role:asc;DROP TABLE auth_role"}, "INVALID_SORT"),
        ({"sort": "role:asc,role:desc"}, "INVALID_SORT"),
        ({"sort": "role:asc,id:asc,is_active:asc,is_default:asc"}, "INVALID_SORT"),
        ({"sort": ""}, "INVALID_SORT"),
        ({"sort": "role"}, "INVALID_SORT"),
        ({"sort": "role:ASC"}, "INVALID_SORT"),
        ({"q": "obsolete"}, "INVALID_QUERY"),
        ({"q": "obsolete"}, "INVALID_QUERY"),
    ],
)
def test_invalid_queries_return_400(role_client, params, detail):
    response = role_client.get("/management/roles", params=params)
    assert response.status_code == 400
    assert response.json() == {"detail": detail}


def test_database_errors_do_not_expose_internal_details(role_client, monkeypatch):
    module = import_module("APPs.Management.module")

    async def unavailable(*_args, **_kwargs):
        raise SQLAlchemyError("private database connection details")

    monkeypatch.setattr(module.ManagementRolesModule, "paginate_orm", unavailable)
    response = role_client.get("/management/roles")
    assert response.status_code == 503
    assert response.json() == {"detail": "MANAGEMENT_DATABASE_UNAVAILABLE"}


def test_openapi_declares_query_and_typed_envelope(role_client):
    spec = role_client.get("/openapi.json").json()
    operation = spec["paths"]["/management/roles"]["get"]
    assert (
        next(parameter for parameter in operation["parameters"] if parameter["name"] == "sort")["schema"]["default"]
        == "updatetime:desc"
    )
    assert {parameter["name"] for parameter in operation["parameters"]} == {
        "page",
        "size",
        "filters",
        "sort",
        "search",
        "search_fields",
    }
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/RespManagementRoles"
    }
    schemas = spec["components"]["schemas"]
    assert schemas["RespManagementRoles"]["properties"]["items"]["items"] == {
        "$ref": "#/components/schemas/RespManagementRole"
    }
    assert schemas["RespManagementRole"]["properties"]["is_active"]["type"] == "boolean"


def test_global_role_search_matches_any_selected_column_and_preserves_filter(
    role_client,
):
    response = role_client.get(
        "/management/roles",
        params={
            "search": "EdItOr",
            "search_fields": json.dumps(["role", "description"]),
            "size": 2,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert [row["id"] for row in body["items"]] == [2, 5]
    response = role_client.get(
        "/management/roles",
        params={
            "search": "EdItOr",
            "search_fields": json.dumps(["role", "description"]),
            "page": 2,
            "size": 2,
        },
    )
    assert [row["id"] for row in response.json()["items"]] == [7]
    response = role_client.get(
        "/management/roles",
        params={"search": "%", "search_fields": json.dumps(["role"])},
    )
    assert [row["id"] for row in response.json()["items"]] == [6]
