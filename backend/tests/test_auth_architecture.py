"""Exercise public handles, authorization sessions and registration against isolated storage."""

from contextlib import asynccontextmanager
from importlib import import_module
from pathlib import Path
from time import monotonic
from types import ModuleType, SimpleNamespace
import json
import sys

from fastapi import Body, FastAPI, Request
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import event, func, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from starsessions.stores import InMemoryStore
from redis.exceptions import RedisError


class MemoryAuthCache:
    """Replace the shared Redis tool interface without connecting to configured caches."""

    def __init__(self):
        self.values = {}
        self.deadlines = {}

    def read(self, key):
        if self.deadlines.get(key, float("inf")) <= monotonic():
            self.values.pop(key, None)
            self.deadlines.pop(key, None)
        return self.values.get(key)

    async def mget(self, keys, *, deserialize=False):
        assert deserialize is False
        return [self.read(key) for key in keys]

    async def ttl(self, key):
        if self.read(key) is None:
            return -2
        return max(0, int(self.deadlines[key] - monotonic())) if key in self.deadlines else -1

    async def incr_with_expiry(self, key, expiry):
        current = self.read(key)
        if current is None:
            self.deadlines[key] = monotonic() + expiry
        self.values[key] = (current or 0) + 1
        return self.values[key], await self.ttl(key)

    async def transaction(self, keys, callback, *, serialize=False, deserialize=False):
        assert serialize is False and deserialize is False
        proposal = callback({key: self.read(key) for key in keys})
        assert set(proposal.writes) | set(proposal.deletes) <= set(keys)
        for key in proposal.deletes:
            self.values.pop(key, None)
            self.deadlines.pop(key, None)
        for key, value in proposal.writes.items():
            self.values[key] = value.value
            if value.ex is not None:
                self.deadlines[key] = monotonic() + value.ex
            elif not value.keepttl:
                self.deadlines.pop(key, None)
        return proposal.result


@pytest.fixture
def auth_client(monkeypatch):
    """Run actual Auth routes, ORM statements and session middleware with local test stores."""
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

    views = import_module("APPs.Auth.views_auth")
    modules = import_module("APPs.Auth.module")
    management = import_module("APPs.Portfolio.module.module_portfolio_manage")
    sql_tools = import_module("COMMON.tools.storage.sqlalchemy.tools_sqlalchemy_async")
    models = import_module("SYSTEM.models")
    middleware = import_module("SYSTEM.middleware.utils.middleware_session")
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(sql_tools.CONN_MANAGER, "get_db", sessions)
    cache = MemoryAuthCache()
    monkeypatch.setattr(modules.AuthModule, "_cache", lambda self: cache)
    store = InMemoryStore()
    invalidations = []
    real_cache_invalidation = management.PortfolioManagementModule.invalidate_cache

    async def invalidate_cache():
        invalidations.append(True)

    monkeypatch.setattr(
        management.PortfolioManagementModule,
        "invalidate_cache",
        staticmethod(invalidate_cache),
    )

    @asynccontextmanager
    async def lifespan(_app):
        tables = [
            models.AuthRole.__table__,
            models.AuthUser.__table__,
            models.RecordLogin.__table__,
            models.PortfolioSite.__table__,
        ]
        async with engine.begin() as connection:
            await connection.run_sync(lambda sync: models.BASE.metadata.create_all(sync, tables=tables))
        account = models.AuthUser(id=1, user="owner-one", email="owner@example.com", role_id=1)
        await account.set_password("12345678")
        async with sessions.begin() as session:
            session.add_all(
                (
                    models.AuthRole(
                        id=1,
                        role="admin",
                        is_create=True,
                        is_read=True,
                        is_update=True,
                        is_delete=True,
                        is_monitor=True,
                        is_manage_roles=True,
                        is_manage_users=True,
                        is_manage_sites=True,
                    ),
                    models.AuthRole(
                        id=2,
                        role="editor",
                        is_default=True,
                        is_create=True,
                        is_read=True,
                        is_update=True,
                        is_delete=True,
                    ),
                )
            )
        async with sessions.begin() as session:
            session.add(account)
        try:
            yield
        finally:
            await engine.dispose()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(
        middleware.SessionMiddleware,
        store_factory=lambda: store,
        cookie_https_only=False,
    )
    app.include_router(views.router)

    @app.get("/__test__/owned/{site_id}")
    async def owned_site(request: Request, site_id: int, permission: str = "is_update"):
        return await management.PortfolioManagementModule().owned_site(request, site_id, permission)

    @app.post("/__test__/published/{site_id}")
    async def set_published(request: Request, site_id: int, is_published: bool = Body(..., embed=True)):
        await management.PortfolioManagementModule().set_published(request, site_id, is_published)
        return {"is_published": is_published}

    @app.post("/__test__/default/{site_id}")
    async def set_default(request: Request, site_id: int):
        await management.PortfolioManagementModule().set_default(request, site_id)
        return {"site_id": site_id}

    app.state.sessions = sessions
    app.state.models = models
    app.state.cache = cache
    app.state.store = store
    app.state.invalidations = invalidations
    app.state.management = management.PortfolioManagementModule
    app.state.real_cache_invalidation = real_cache_invalidation
    with TestClient(app) as client:
        yield client


def sign_in(client):
    response = client.post(
        "/authority/sign-in",
        json={"email": "owner@example.com", "password": "12345678"},
    )
    assert response.status_code == 200
    return response.json()


def verified_registration(client, email):
    response = client.post("/authority/confirm-email", json={"email": email})
    assert response.status_code == 202
    assert response.json() == {"expires_in": 300, "retry_after": 60}
    assert client.app.state.cache.read("verify_" + email) == "123"
    response = client.post("/authority/verify-email", json={"email": email, "code": "123"})
    assert response.status_code == 200
    assert response.json() == {"email": email, "verified": True}


def test_sign_in_session_and_sign_out_keep_identity_private(auth_client):
    """Persist the public handle and all permissions, then invalidate the old cookie."""
    client = auth_client
    identity = sign_in(client)
    assert identity["user"] == "owner-one"
    assert identity["is_manage_sites"] is True
    assert set(identity) == {
        "id",
        "email",
        "user",
        "role",
        "is_create",
        "is_read",
        "is_update",
        "is_delete",
        "is_monitor",
        "is_manage_roles",
        "is_manage_users",
        "is_manage_sites",
    }
    cookie = client.cookies["session"]
    stored = json.loads(client.app.state.store.data[cookie])
    assert "password" not in stored
    assert "12345678" not in json.dumps(stored)
    assert "$argon2" not in json.dumps(stored)
    restored = client.get("/authority/session")
    assert restored.json() == identity
    assert restored.headers["cache-control"] == "no-store"
    assert client.cookies["session"] == cookie

    async def login_count():
        async with client.app.state.sessions() as session:
            return await session.scalar(select(func.count()).select_from(client.app.state.models.RecordLogin))

    assert client.portal.call(login_count) == 1
    assert client.post("/authority/sign-out").json() == {"signed_out": True}
    assert cookie not in client.app.state.store.data
    assert client.get("/authority/session").json() is None
    assert client.get("/authority/session", headers={"Cookie": "session=" + cookie}).json() is None
    assert client.post("/authority/sign-out").json() == {"signed_out": True}
    assert client.portal.call(login_count) == 1


@pytest.mark.parametrize("stored_monitor", (None, False, True))
@pytest.mark.parametrize("current_monitor", (False, True))
def test_existing_session_refreshes_monitor_permission_without_signing_in_again(
    auth_client, stored_monitor, current_monitor
):
    """Old and stale sessions use current monitor rights without replacing the login cookie.

    Author: ZhengLee 2026.10.18
    """
    client = auth_client
    sign_in(client)
    cookie = client.cookies["session"]
    stored = json.loads(client.app.state.store.data[cookie])
    if stored_monitor is None:
        stored.pop("is_monitor", None)
    else:
        stored["is_monitor"] = stored_monitor
    client.app.state.store.data[cookie] = json.dumps(stored).encode()

    async def change_permission():
        async with client.app.state.sessions.begin() as session:
            await session.execute(
                update(client.app.state.models.AuthRole)
                .where(client.app.state.models.AuthRole.id == 1)
                .values(is_monitor=current_monitor)
            )

    client.portal.call(change_permission)
    response = client.get("/authority/session")
    assert response.status_code == 200
    assert response.json()["is_monitor"] is current_monitor
    assert client.cookies["session"] == cookie
    assert json.loads(client.app.state.store.data[cookie])["is_monitor"] is current_monitor


def test_session_refreshes_handle_and_site_permission_from_database(auth_client):
    """Do not retain an old public identity or revoked role flag from SESSION."""
    client = auth_client
    sign_in(client)
    cookie = client.cookies["session"]

    async def change_identity():
        models = client.app.state.models
        async with client.app.state.sessions.begin() as session:
            await session.execute(update(models.AuthUser).where(models.AuthUser.id == 1).values(user="owner-renamed"))
            await session.execute(update(models.AuthRole).where(models.AuthRole.id == 1).values(is_manage_sites=False))

    client.portal.call(change_identity)
    response = client.get("/authority/session")
    assert response.json()["user"] == "owner-renamed"
    assert response.json()["is_manage_sites"] is False
    assert client.cookies["session"] == cookie


@pytest.mark.parametrize("disabled", ("account", "role"))
def test_disabled_identity_cannot_restore_or_sign_in(auth_client, disabled):
    """Both soft deletion and role suspension revoke authentication without new login records."""
    client = auth_client
    sign_in(client)

    async def disable():
        models = client.app.state.models
        model = models.AuthUser if disabled == "account" else models.AuthRole
        async with client.app.state.sessions.begin() as session:
            await session.execute(update(model).where(model.id == 1).values(is_active=False))

    client.portal.call(disable)
    assert client.get("/authority/session").json() is None
    response = client.post(
        "/authority/sign-in",
        json={"email": "owner@example.com", "password": "12345678"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "INVALID_CREDENTIALS"}

    async def login_count():
        async with client.app.state.sessions() as session:
            return await session.scalar(select(func.count()).select_from(client.app.state.models.RecordLogin))

    assert client.portal.call(login_count) == 1


@pytest.mark.parametrize("enabled", [False, True])
def test_registration_inherits_independent_default_role_monitor_access(auth_client, enabled):
    """A registration default may grant read-only monitoring without management rights."""

    async def configure():
        models = auth_client.app.state.models
        async with auth_client.app.state.sessions.begin() as session:
            await session.execute(update(models.AuthRole).where(models.AuthRole.id == 2).values(is_monitor=enabled))

    auth_client.portal.call(configure)
    email = "monitor-registration@example.test"
    verified_registration(auth_client, email)
    response = auth_client.post("/authority/register", json={"email": email, "password": "12345678"})
    assert response.status_code == 201, response.text
    assert response.json()["is_monitor"] is enabled
    assert all(response.json()[field] is False for field in ("is_manage_sites", "is_manage_users", "is_manage_roles"))
    assert auth_client.get("/authority/session").json()["is_monitor"] is enabled


def test_legacy_registration_allocates_distinct_public_handles(auth_client):
    """Existing email/password requests remain compatible when local parts collide."""
    client = auth_client
    for email, expected in (
        ("shared@first.example", "shared"),
        ("shared@second.example", "shared-2"),
    ):
        verified_registration(client, email)
        response = client.post("/authority/register", json={"email": email, "password": "12345678"})
        assert response.status_code == 201
        identity = response.json()
        assert identity["user"] == expected
        assert identity["role"] == "editor"
        assert identity["is_manage_sites"] is False
        assert identity["is_manage_users"] is False
        assert identity["is_manage_roles"] is False
        assert client.get("/authority/session").json() == identity
        assert client.app.state.cache.read("verify_" + email) is None
        assert client.get("/authority/register", params={"email": email}).json()["available"] is False
        assert client.post("/authority/sign-out").status_code == 200

    async def account_and_site_counts():
        models = client.app.state.models
        async with client.app.state.sessions() as session:
            return (
                await session.scalar(select(func.count()).select_from(models.AuthUser)),
                await session.scalar(select(func.count()).select_from(models.PortfolioSite)),
            )

    assert client.portal.call(account_and_site_counts) == (3, 0)


def test_explicit_handle_conflict_releases_proof_for_retry(auth_client):
    """A requested handle collision does not consume the verified registration challenge."""
    client = auth_client
    email = "new-owner@example.com"
    verified_registration(client, email)
    response = client.post(
        "/authority/register",
        json={"email": email, "password": "12345678", "user": "owner-one"},
    )
    assert response.status_code == 409
    assert response.json() == {"detail": "USER_ALREADY_EXISTS"}
    response = client.post(
        "/authority/register",
        json={"email": email, "password": "12345678", "user": "custom-owner"},
    )
    assert response.status_code == 201
    assert response.json()["user"] == "custom-owner"


def test_reserved_handle_validation_does_not_echo_credentials(auth_client):
    """Reject reserved routes before registration and keep supplied secrets out of validation responses."""
    password = "TestSecretOnly123!"
    response = auth_client.post(
        "/authority/register",
        json={"email": "new@example.com", "password": password, "user": "dashboard"},
    )
    assert response.status_code == 422
    assert password not in response.text
    assert "input" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_no_default_role_cannot_create_account_or_consume_proof(auth_client):
    """An unavailable registration role can be restored and retried using the original proof."""
    client = auth_client
    email = "waiting@example.com"
    verified_registration(client, email)

    async def set_role_active(enabled):
        async with client.app.state.sessions.begin() as session:
            await session.execute(
                update(client.app.state.models.AuthRole)
                .where(client.app.state.models.AuthRole.id == 2)
                .values(is_active=enabled)
            )

    client.portal.call(set_role_active, False)
    response = client.post("/authority/register", json={"email": email, "password": "12345678"})
    assert response.status_code == 503
    assert response.json() == {"detail": "REGISTRATION_UNAVAILABLE"}
    client.portal.call(set_role_active, True)
    assert client.post("/authority/register", json={"email": email, "password": "12345678"}).status_code == 201


def test_default_role_site_management_is_rejected_by_database(auth_client):
    """The database blocks a registration default from receiving site management authority."""
    client = auth_client

    async def promote_default():
        async with client.app.state.sessions.begin() as session:
            await session.execute(
                update(client.app.state.models.AuthRole)
                .where(client.app.state.models.AuthRole.id == 2)
                .values(is_manage_sites=True)
            )

    with pytest.raises(IntegrityError):
        client.portal.call(promote_default)


def test_login_record_failure_does_not_leave_authenticated_session(auth_client, monkeypatch):
    """An audit-write failure returns 503 and removes the identity prepared by sign-in."""
    client = auth_client
    module = import_module("APPs.Auth.module")
    original = module.AuthSignInModule.execute_orm

    async def fail_record(self, statement):
        if getattr(getattr(statement, "table", None), "name", None) == "record_login":
            raise SQLAlchemyError("isolated audit write failure")
        return await original(self, statement)

    monkeypatch.setattr(module.AuthSignInModule, "execute_orm", fail_record)
    response = client.post(
        "/authority/sign-in",
        json={"email": "owner@example.com", "password": "12345678"},
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "AUTH_DATABASE_UNAVAILABLE"}
    assert client.get("/authority/session").json() is None
    assert not client.app.state.store.data


def populate_management_sites(client):
    """Create an administrator homepage, another public portfolio and a separate draft."""

    async def populate():
        models = client.app.state.models
        async with client.app.state.sessions.begin() as session:
            password = await session.scalar(select(models.AuthUser.password).where(models.AuthUser.id == 1))
            session.add_all(
                models.AuthUser(
                    id=account_id,
                    user=user,
                    email=email,
                    password=password,
                    role_id=2,
                )
                for account_id, user, email in (
                    (2, "owner-two", "other@example.com"),
                    (3, "draft-owner", "draft@example.com"),
                )
            )
        async with client.app.state.sessions.begin() as session:
            session.add_all(
                models.PortfolioSite(
                    id=site_id,
                    user_id=site_id,
                    copyright_year=2026,
                    chat_icon="assets/cow.svg",
                    is_published=site_id != 3,
                    is_default=site_id == 1,
                )
                for site_id in (1, 2, 3)
            )

    client.portal.call(populate)


def publication_state(client):
    """Read committed publication state through a fresh session."""

    async def state():
        model = client.app.state.models.PortfolioSite
        async with client.app.state.sessions() as session:
            return (
                await session.execute(select(model.id, model.is_published, model.is_default).order_by(model.id))
            ).all()

    return client.portal.call(state)


def test_management_scope_requires_identity_and_owner_or_site_manager(auth_client):
    """CRUD checks enforce both an enabled identity and portfolio ownership."""
    client = auth_client
    populate_management_sites(client)
    assert client.get("/__test__/owned/2").status_code == 401
    assert client.post("/__test__/default/2").status_code == 401
    sign_in(client)
    assert client.get("/__test__/owned/2").status_code == 200
    assert client.get("/__test__/owned/999").status_code == 404
    client.post("/authority/sign-out")
    assert (
        client.post(
            "/authority/sign-in",
            json={"email": "other@example.com", "password": "12345678"},
        ).status_code
        == 200
    )
    assert client.get("/__test__/owned/2").status_code == 200
    assert client.get("/__test__/owned/1").status_code == 403
    assert client.post("/__test__/default/2").status_code == 403

    async def revoke_update():
        model = client.app.state.models.AuthRole
        async with client.app.state.sessions.begin() as session:
            await session.execute(update(model).where(model.id == 2).values(is_update=False))

    client.portal.call(revoke_update)
    assert client.get("/__test__/owned/2").status_code == 403


def test_default_switch_rejects_drafts_and_commits_one_homepage(auth_client):
    """Draft rejection preserves the previous homepage; a valid switch changes both flags together."""
    client = auth_client
    populate_management_sites(client)
    sign_in(client)
    initial = publication_state(client)
    assert client.post("/__test__/default/3").status_code == 404
    assert publication_state(client) == initial
    assert not client.app.state.invalidations
    assert client.post("/__test__/default/2").status_code == 200
    assert publication_state(client) == [
        (1, True, False),
        (2, True, True),
        (3, False, False),
    ]
    assert len(client.app.state.invalidations) == 1


def test_default_switch_rolls_back_all_flags_after_database_failure(auth_client, monkeypatch):
    """Failure when selecting the new homepage must restore the previously cleared default."""
    client = auth_client
    populate_management_sites(client)
    sign_in(client)
    initial = publication_state(client)
    tools = import_module("COMMON.tools.storage.sqlalchemy.tools_sqlalchemy_async")
    original = tools.SqlAlchemyExecAsync.execute_orm

    async def reject_new_default(self, statement):
        if getattr(statement, "is_update", False) and statement.table.name == "portfolio_site":
            if statement.compile().params.get("is_default") is True:
                raise SQLAlchemyError("isolated final update failure")
        return await original(self, statement)

    monkeypatch.setattr(tools.SqlAlchemyExecAsync, "execute_orm", reject_new_default)
    assert client.post("/__test__/default/2").status_code == 503
    assert publication_state(client) == initial
    assert not client.app.state.invalidations


def test_publication_refuses_default_unpublish_and_allows_owned_site(auth_client):
    """The homepage remains published while an editor can unpublish their own portfolio."""
    client = auth_client
    populate_management_sites(client)
    sign_in(client)
    response = client.post("/__test__/published/1", json={"is_published": False})
    assert response.status_code == 409
    assert response.json() == {"detail": "DEFAULT_SITE_MUST_BE_PUBLISHED"}
    assert publication_state(client) == [
        (1, True, True),
        (2, True, False),
        (3, False, False),
    ]
    assert not client.app.state.invalidations
    client.post("/authority/sign-out")
    assert (
        client.post(
            "/authority/sign-in",
            json={"email": "other@example.com", "password": "12345678"},
        ).status_code
        == 200
    )
    assert client.post("/__test__/published/1", json={"is_published": False}).status_code == 403
    assert client.post("/__test__/published/2", json={"is_published": False}).status_code == 200
    assert publication_state(client) == [
        (1, True, True),
        (2, False, False),
        (3, False, False),
    ]
    assert len(client.app.state.invalidations) == 1


def test_inactive_account_cannot_become_homepage(auth_client):
    """Publication alone does not expose a soft-deleted owner's portfolio as the default."""
    client = auth_client
    populate_management_sites(client)
    sign_in(client)

    async def deactivate_owner():
        model = client.app.state.models.AuthUser
        async with client.app.state.sessions.begin() as session:
            await session.execute(update(model).where(model.id == 2).values(is_active=False))

    client.portal.call(deactivate_owner)
    assert client.post("/__test__/default/2").status_code == 404
    assert publication_state(client) == [
        (1, True, True),
        (2, True, False),
        (3, False, False),
    ]


def test_owned_site_database_failure_returns_service_unavailable(auth_client, monkeypatch):
    """Storage failure during ownership lookup is a controlled 503 rather than an uncaught exception."""
    client = auth_client
    populate_management_sites(client)
    sign_in(client)

    async def unavailable(self, statement):
        raise SQLAlchemyError("isolated ownership query failure")

    monkeypatch.setattr(client.app.state.management, "execute_orm", unavailable)
    response = client.get("/__test__/owned/2")
    assert response.status_code == 503
    assert response.json() == {"detail": "PORTFOLIO_DATABASE_UNAVAILABLE"}


def test_cache_failure_reports_committed_publication_state(auth_client, monkeypatch):
    """A cache outage reports 503 after a committed publish change without reverting visibility state."""
    client = auth_client
    populate_management_sites(client)
    sign_in(client)
    module = import_module("APPs.Portfolio.module.module_portfolio_manage")

    class UnavailableCache:
        def __init__(self, *, key):
            self.key = key

        async def delete_pattern(self, pattern):
            raise RedisError("isolated cache outage")

    monkeypatch.setattr(module, "RedisAsync", UnavailableCache)
    monkeypatch.setattr(module.FastAPICache, "get_prefix", classmethod(lambda cls: "isolated-cache"))
    monkeypatch.setattr(
        client.app.state.management,
        "invalidate_cache",
        staticmethod(client.app.state.real_cache_invalidation),
    )
    response = client.post("/__test__/published/2", json={"is_published": False})
    assert response.status_code == 503
    assert response.json() == {"detail": "PORTFOLIO_CACHE_UNAVAILABLE"}
    assert publication_state(client) == [
        (1, True, True),
        (2, False, False),
        (3, False, False),
    ]
