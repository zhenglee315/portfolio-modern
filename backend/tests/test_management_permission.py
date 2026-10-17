"""Verify real permission dependencies with isolated SQL, server sessions and production routes."""

from importlib import import_module
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from sqlalchemy import event, update
from sqlalchemy.exc import SQLAlchemyError
from redis.exceptions import RedisError
from test_auth_architecture import sign_in

RESOURCES = ("roles", "users", "sites")
FLAGS = {resource: f"is_manage_{resource}" for resource in RESOURCES}


def change(client, *statements):
    async def work():
        async with client.app.state.sessions.begin() as session:
            for statement in statements:
                await session.execute(statement)

    client.portal.call(work)


def expect_private(response):
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["vary"] == "Cookie"
    assert "password" not in response.text


@pytest.fixture
def protected(auth_client):
    client = auth_client
    engine = client.app.state.sessions.kw["bind"]

    async def tables():
        async with engine.begin() as connection:
            await connection.run_sync(client.app.state.models.BASE.metadata.create_all)

    client.portal.call(tables)
    client.app.include_router(import_module("APPs.Management.views_management").router)
    queries = []

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def trace(_connection, _cursor, statement, _parameters, _context, _many):
        queries.append(statement)

    client.app.state.permission_queries = queries
    yield client


@pytest.mark.parametrize("resource", RESOURCES)
def test_guest_and_spoofed_client_flags_cannot_read(protected, resource):
    response = protected.get(
        f"/management/{resource}",
        params={FLAGS[resource]: "true"},
        headers={FLAGS[resource]: "true", "role": "admin", "user_id": "1"},
    )
    assert response.status_code == 401, response.text
    assert response.json() == {"detail": "AUTH_REQUIRED"}
    expect_private(response)
    assert protected.app.state.permission_queries == []


@pytest.mark.parametrize("resource", RESOURCES)
def test_invalid_guest_query_never_bypasses_permission(protected, resource):
    response = protected.get(f"/management/{resource}?page=bad&filters=not-json")
    assert response.status_code == 401
    expect_private(response)


@pytest.mark.parametrize("resource", RESOURCES)
def test_active_authorized_account_reads_real_lists(protected, resource):
    sign_in(protected)
    protected.app.state.permission_queries.clear()
    response = protected.get(f"/management/{resource}")
    assert response.status_code == 200, response.text
    assert set(response.json()) == {"items", "total", "pages", "page", "size"}
    expect_private(response)
    queries = protected.app.state.permission_queries
    assert sum("auth_user.password" in sql and "auth_role.role" in sql for sql in queries) == 1


@pytest.mark.parametrize("resource", RESOURCES)
def test_other_management_and_all_content_flags_do_not_substitute(protected, resource):
    sign_in(protected)
    models = protected.app.state.models
    change(
        protected,
        update(models.AuthRole).where(models.AuthRole.id == 1).values(**{FLAGS[resource]: False}),
    )
    protected.app.state.permission_queries.clear()
    response = protected.get(f"/management/{resource}")
    assert response.status_code == 403, response.text
    assert response.json() == {"detail": "PERMISSION_DENIED"}
    expect_private(response)
    assert len(protected.app.state.permission_queries) == 1  # Authorization query only; no private projection.


@pytest.mark.parametrize("resource", RESOURCES)
@pytest.mark.parametrize("entity", ("AuthUser", "AuthRole"))
def test_disabling_account_or_role_revokes_existing_session(protected, resource, entity):
    sign_in(protected)
    models = protected.app.state.models
    change(
        protected,
        update(getattr(models, entity)).where(getattr(models, entity).id == 1).values(is_active=False),
    )
    response = protected.get(f"/management/{resource}")
    assert response.status_code == 401
    expect_private(response)
    assert protected.get("/authority/session").json() is None


@pytest.mark.parametrize("resource", RESOURCES)
def test_deleted_account_cannot_use_old_identity(protected, resource):
    sign_in(protected)
    # Move the server-side identity to a missing ID without supplying it through the API.
    store = protected.app.state.store

    async def missing():
        import json

        for key in list(store.data):
            record = store.data[key]
            # InMemoryStore values are raw serialized bytes.
            payload = json.loads(record)
            payload["id"] = 9999
            store.data[key] = json.dumps(payload).encode()

    protected.portal.call(missing)
    response = protected.get(f"/management/{resource}")
    assert response.status_code == 401
    expect_private(response)


@pytest.mark.parametrize("resource", RESOURCES)
def test_role_assignment_changes_apply_without_signing_in_again(protected, resource):
    sign_in(protected)
    models = protected.app.state.models
    change(
        protected,
        update(models.AuthUser).where(models.AuthUser.id == 1).values(role_id=2),
    )
    assert protected.get(f"/management/{resource}").status_code == 403
    change(
        protected,
        update(models.AuthUser).where(models.AuthUser.id == 1).values(role_id=1),
    )
    assert protected.get(f"/management/{resource}").status_code == 200


@pytest.mark.parametrize("resource", RESOURCES)
def test_matching_management_flag_is_sufficient_without_global_content_read(protected, resource):
    models = protected.app.state.models
    values = {name: False for name in ("is_create", "is_read", "is_update", "is_delete", *FLAGS.values())}
    values[FLAGS[resource]] = True
    change(
        protected,
        update(models.AuthRole).where(models.AuthRole.id == 1).values(**values, role="custom-operator"),
    )
    sign_in(protected)
    assert protected.get(f"/management/{resource}").status_code == 200
    for other in RESOURCES:
        if other != resource:
            assert protected.get(f"/management/{other}").status_code == 403


@pytest.mark.parametrize("resource", RESOURCES)
def test_database_failure_is_503_and_never_reads_projection(protected, monkeypatch, resource):
    sign_in(protected)
    modules = import_module("APPs.Auth.module")

    async def failure(*_args, **_kwargs):
        raise SQLAlchemyError("sensitive connection data")

    monkeypatch.setattr(modules.AuthSessionModule, "execute_orm", failure)
    response = protected.get(f"/management/{resource}")
    assert response.status_code == 503
    assert response.json() == {"detail": "AUTH_DATABASE_UNAVAILABLE"}
    expect_private(response)
    assert "sensitive" not in response.text


@pytest.mark.parametrize("resource", RESOURCES)
def test_session_read_failure_is_503(protected, monkeypatch, resource):
    sign_in(protected)

    async def failure(*_args, **_kwargs):
        raise RedisError("sensitive Redis details")

    monkeypatch.setattr(protected.app.state.store, "read", failure)
    response = protected.get(f"/management/{resource}")
    assert response.status_code == 503, response.text
    assert response.json() == {"detail": "AUTH_STORAGE_UNAVAILABLE"}
    expect_private(response)
    assert "sensitive" not in response.text


def test_default_and_unknown_configuration_fail_before_serving(protected):
    permission = import_module("APPs.Management.module.module_permission").ManagementPermission
    for params in (
        {},
        {"is_management_role": True},
        {"action": "read"},
        {"policy": object()},
        {"is_manage_roles": False},
        {"is_manage_roles": 1},
        {"is_manage_roles": "true"},
        {"is_manage_roles": None},
        {"denied_detail": "", "is_manage_roles": True},
    ):
        with pytest.raises((TypeError, ValueError)):
            permission(**params)


@pytest.mark.parametrize("value", (False, None, 1, "true"))
def test_only_exact_boolean_true_grants_access(protected, value):
    import asyncio

    module = import_module("APPs.Management.module.module_permission")
    rule = module.ManagementPermission(import_module("SYSTEM.models").AuthRole.is_manage_roles)
    with pytest.raises(HTTPException) as raised:
        asyncio.run(rule(SimpleNamespace(is_manage_roles=value)))
    assert raised.value.status_code == 403


def test_multiple_conditions_use_and_and_share_one_identity_read(protected):
    module = import_module("APPs.Management.module.module_permission")

    @protected.app.get(
        "/__permission__/combined",
        dependencies=[
            Depends(module.ManagementPermission(import_module("SYSTEM.models").AuthRole.is_manage_roles)),
            Depends(module.ManagementPermission(import_module("SYSTEM.models").AuthRole.is_manage_users)),
        ],
    )
    async def combined(
        actor: dict = Depends(module.ManagementPermission(import_module("SYSTEM.models").AuthRole.is_manage_sites)),
    ):
        return {"id": actor.id}

    sign_in(protected)
    protected.app.state.permission_queries.clear()
    response = protected.get("/__permission__/combined")
    assert response.status_code == 200
    assert response.json() == {"id": 1}
    assert len(protected.app.state.permission_queries) == 1
    models = protected.app.state.models
    change(
        protected,
        update(models.AuthRole).where(models.AuthRole.id == 1).values(is_manage_users=False),
    )
    assert protected.get("/__permission__/combined").status_code == 403


def test_one_rule_handles_concurrent_actors_without_state_leaking(protected):
    module = import_module("APPs.Management.module.module_permission")
    app = FastAPI()
    rule = module.ManagementPermission(import_module("SYSTEM.models").AuthRole.is_manage_roles)

    async def actor(request: Request):
        return SimpleNamespace(
            id=int(request.headers["actor"]),
            is_manage_roles=request.headers["allowed"] == "yes",
        )

    app.dependency_overrides[module._CURRENT_IDENTITY] = actor

    @app.get("/guard")
    async def endpoint(identity: dict = Depends(rule)):
        return {"id": identity.id}

    with TestClient(app) as client:

        def read(number):
            allowed = number % 2 == 0
            response = client.get(
                "/guard",
                headers={"actor": str(number), "allowed": "yes" if allowed else "no"},
            )
            assert response.status_code == (200 if allowed else 403)
            if allowed:
                assert response.json() == {"id": number}

        with ThreadPoolExecutor(max_workers=8) as executor:
            list(executor.map(read, range(32)))
    assert set(vars(rule)) == {"required", "denied_detail"}
    assert len(rule.required) == 1 and rule.denied_detail == "PERMISSION_DENIED"


@pytest.mark.parametrize("phase", ("autoload-read", "write", "remove"))
def test_production_session_middleware_storage_errors_preserve_cookie(protected, monkeypatch, phase):
    from starsessions import SessionAutoloadMiddleware

    middleware = import_module("SYSTEM.middleware.utils.middleware_session")
    probe = FastAPI()
    probe.include_router(import_module("APPs.Auth.views_auth").router)
    probe.include_router(import_module("APPs.Management.views_management").router)
    probe.add_middleware(SessionAutoloadMiddleware)
    probe.add_middleware(
        middleware.SessionMiddleware,
        store_factory=lambda: protected.app.state.store,
        cookie_https_only=False,
    )

    async def failure(*_args, **_kwargs):
        raise RedisError("sensitive Redis details")

    with TestClient(probe) as client:
        sign_in(client)
        cookies = dict(client.cookies)
        monkeypatch.setattr(
            protected.app.state.store,
            {"autoload-read": "read", "write": "write", "remove": "remove"}[phase],
            failure,
        )
        response = client.post("/authority/sign-out") if phase == "remove" else client.get("/management/users")
        assert response.status_code == 503, response.text
        assert response.json() == {"detail": "AUTH_STORAGE_UNAVAILABLE"}
        if phase == "remove":
            assert response.headers["cache-control"] == "no-store"
        else:
            expect_private(response)
        if phase != "remove":
            assert "set-cookie" not in response.headers
        assert dict(client.cookies) == cookies
