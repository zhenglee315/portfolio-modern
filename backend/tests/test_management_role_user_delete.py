"""Verify Role/User deletion with real constraints, isolated storage and real-cookie session revocation."""

import asyncio
import os
from unittest import IsolatedAsyncioTestCase, skipUnless
from unittest.mock import patch
from fastapi import FastAPI, HTTPException, Request
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, update, func
from sqlalchemy.exc import IntegrityError
from starsessions import load_session
from starsessions.stores import InMemoryStore

import test_management_site_update as platform_fixture
from APPs.Auth.module.module_auth import AuthModule
from APPs.Auth.views_auth import router as auth_router
from APPs.Management.views_management import router
from APPs.Management.module.module_management import ManagementRolesModule, ManagementUsersModule
from APPs.Management.module.module_management_state import ManagementWriteState
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from SYSTEM.constants import AUTH_SESSION_IDENTITY_KEY
from SYSTEM.middleware.utils.middleware_session import SessionMiddleware
from SYSTEM.models import (
    AuthRole,
    AuthUser,
    PortfolioSite,
    PortfolioSiteLocale,
    PortfolioLocale,
    RecordLogin,
    PortfolioCareer,
    PortfolioCareerLocale,
    PortfolioProject,
    PortfolioProjectLocale,
    PortfolioSkill,
    PortfolioSkillLocale,
    PortfolioSkillCategory,
    PortfolioSkillCategoryLocale,
    PortfolioCategorySkill,
)


class RoleUserDeleteTests(IsolatedAsyncioTestCase):
    """Use disposable databases; no configured application data, Redis or SMTP is contacted.

    ♂ ZhengLee 2026.10.16
    """

    postgres_url = None
    asyncTearDown = platform_fixture.PlatformPatchTests.asyncTearDown
    snapshot = platform_fixture.PlatformPatchTests.snapshot
    seed_inactive_language_content = platform_fixture.PlatformPatchTests.seed_inactive_language_content

    async def asyncSetUp(self):
        await platform_fixture.PlatformPatchTests.asyncSetUp(self)
        async with self.sessions.begin() as session:
            await session.execute(
                update(AuthRole)
                .where(AuthRole.id == 1)
                .values({AuthRole.is_manage_roles: True, AuthRole.is_manage_users: True})
            )
            session.add_all(
                [
                    AuthRole(id=3, role="registration", is_default=True),
                    AuthRole(id=4, role="unused"),
                    AuthRole(id=5, role="unused-inactive", is_active=False),
                    AuthUser(
                        id=6,
                        user="backup-manager",
                        email="backup@example.com",
                        role_id=1,
                        password="$argon2id$v=19$m=65536,t=3,p=4$" + "a" * 22 + "$" + "b" * 43,
                    ),
                    RecordLogin(user_id=3, ip_address="192.0.2.3"),
                    RecordLogin(user_id=5),
                ]
            )

    @staticmethod
    def role_target(role_id=4, role="unused"):
        return {"role_id": role_id, "expected_role": role}

    @staticmethod
    def user_target(account_id=3, site_id=12, email=None):
        return {
            "account_id": account_id,
            "expected_email": email or f"person{account_id}@example.com",
            "expected_site_id": site_id,
        }

    async def single(self, resource, target):
        body = target.copy()
        target_id = body.pop("role_id" if resource == "roles" else "account_id")
        return await self.client.request("DELETE", f"/management/{resource}/{target_id}", json=body)

    async def batch(self, resource, targets):
        return await self.client.post(f"/management/{resource}/bulk-delete", json={"targets": targets})

    async def test_role_single_and_batch_preserve_all_users_and_portfolios(self):
        before = await self.snapshot()
        response = await self.single("roles", self.role_target())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"deleted_count": 1, "deleted": [{"role_id": 4}]})
        self.assertEqual((await self.batch("roles", [self.role_target(5, "unused-inactive")])).status_code, 200)
        self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()

    async def test_role_batch_is_atomic_when_one_target_is_used_or_default(self):
        for target, code in (
            (self.role_target(2, "viewer"), "ROLE_IN_USE"),
            (self.role_target(3, "registration"), "DEFAULT_ROLE_REQUIRED"),
        ):
            with self.subTest(target=target):
                response = await self.batch("roles", [self.role_target(), target])
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(response.json()["detail"], code)
                async with self.sessions() as session:
                    self.assertIsNotNone(await session.get(AuthRole, 4))

    async def test_role_with_only_inactive_accounts_is_still_in_use(self):
        async with self.sessions.begin() as session:
            await session.execute(
                update(AuthUser).where(AuthUser.role_id == 2, AuthUser.id != 5).values({AuthUser.role_id: 3})
            )
        response = await self.single("roles", self.role_target(2, "viewer"))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "ROLE_IN_USE")

    async def test_role_identity_and_batch_types_are_strict(self):
        for targets, status in (
            ([self.role_target(4, "renamed")], 404),
            ([self.role_target(99, "unknown")], 404),
            ([], 422),
            ([self.role_target()] * 2, 422),
            ([self.role_target()] * 101, 422),
            ([self.role_target(True)], 422),
            ([self.role_target("4")], 422),
            ([{**self.role_target(), "expected_role": None}], 422),
            ([{**self.role_target(), "is_active": False}], 422),
        ):
            with self.subTest(targets=targets):
                response = await self.batch("roles", targets)
                self.assertEqual(response.status_code, status, response.text)

    async def test_user_delete_cascades_owned_site_and_history_only(self):
        response = await self.single("users", self.user_target())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"deleted_count": 1, "deleted": [{"account_id": 3, "site_id": 12}]})
        async with self.sessions() as session:
            self.assertIsNone(await session.get(AuthUser, 3))
            self.assertIsNone(await session.get(PortfolioSite, 12))
            self.assertIsNotNone(await session.get(AuthUser, 2))
            self.assertIsNotNone(await session.get(PortfolioSite, 11))
            self.assertEqual(
                await session.scalar(select(func.count()).select_from(RecordLogin).where(RecordLogin.user_id == 3)), 0
            )
            self.assertEqual(
                await session.scalar(select(func.count()).select_from(RecordLogin).where(RecordLogin.user_id == 5)), 1
            )
            self.assertEqual(await session.scalar(select(func.count()).select_from(AuthRole)), 5)
            self.assertEqual(await session.scalar(select(func.count()).select_from(PortfolioLocale)), 3)
        for path in ("/management/users", "/management/sites"):
            response = await self.client.get(path + "?size=100")
            self.assertNotIn(3, [row["id"] for row in response.json()["items"]])
        self.assertEqual((await self.client.get("/portfolio/site?user=person3")).status_code, 404)
        self.invalidate_cache.assert_awaited_once()

    async def test_user_full_content_including_disabled_language_cascades(self):
        await self.seed_inactive_language_content()
        async with self.sessions.begin() as session:
            await session.execute(
                update(PortfolioSite).where(PortfolioSite.id == 11).values({PortfolioSite.is_default: False})
            )
        response = await self.single("users", self.user_target(2, 11))
        self.assertEqual(response.status_code, 200, response.text)
        async with self.sessions() as session:
            for model in (
                PortfolioCareer,
                PortfolioCareerLocale,
                PortfolioProject,
                PortfolioProjectLocale,
                PortfolioSkill,
                PortfolioSkillLocale,
                PortfolioSkillCategory,
                PortfolioSkillCategoryLocale,
                PortfolioCategorySkill,
            ):
                self.assertEqual(await session.scalar(select(func.count()).select_from(model)), 0, model.__name__)
            self.assertEqual(
                await session.scalar(
                    select(func.count()).select_from(PortfolioSiteLocale).where(PortfolioSiteLocale.site_id == 11)
                ),
                0,
            )
            self.assertEqual(await session.scalar(select(func.count()).select_from(PortfolioLocale)), 3)

    async def test_user_batch_supports_no_site_and_inactive_targets(self):
        response = await self.batch("users", [self.user_target(), self.user_target(4, None), self.user_target(5, 13)])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["deleted_count"], 3)
        async with self.sessions() as session:
            self.assertEqual((await session.scalars(select(AuthUser.id).order_by(AuthUser.id))).all(), [1, 2, 6])
            self.assertEqual((await session.scalars(select(PortfolioSite.id))).all(), [11])
        self.invalidate_cache.assert_awaited_once()

    async def test_user_default_and_last_manager_protect_whole_batch(self):
        before = await self.snapshot()
        response = await self.batch("users", [self.user_target(), self.user_target(2, 11)])
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "DEFAULT_SITE_DELETE_FORBIDDEN")
        response = await self.batch(
            "users", [self.user_target(), self.user_target(1, None), self.user_target(6, None, "backup@example.com")]
        )
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"], "LAST_ROLE_MANAGER_REQUIRED")
        self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()

    async def test_inactive_backup_does_not_allow_deleting_last_effective_manager(self):
        async with self.sessions.begin() as session:
            await session.execute(update(AuthUser).where(AuthUser.id == 6).values({AuthUser.is_active: False}))
        response = await self.single("users", self.user_target(1, None))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "LAST_ROLE_MANAGER_REQUIRED")

    async def test_self_delete_is_allowed_when_another_effective_manager_survives(self):
        response = await self.single("users", self.user_target(1, None))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((await self.client.get("/management/users")).status_code, 401)
        async with self.sessions() as session:
            self.assertIsNotNone(await session.get(AuthUser, 6))

    async def test_user_requires_original_optional_site_and_exact_identity(self):
        before = await self.snapshot()
        for change, status in (
            ({"expected_email": "person2@example.com"}, 404),
            ({"expected_site_id": 11}, 409),
            ({"expected_site_id": None}, 409),
        ):
            with self.subTest(change=change):
                response = await self.batch("users", [self.user_target(4, None), {**self.user_target(), **change}])
                self.assertEqual(response.status_code, status, response.text)
                self.assertEqual(before, await self.snapshot())
        async with self.sessions.begin() as session:
            session.add(PortfolioSite(id=14, user_id=4, copyright_year=2026, chat_icon="cow-engineer.svg"))
        self.assertEqual((await self.single("users", self.user_target(4, None))).status_code, 409)

    async def test_user_rejects_coercion_duplicate_ids_and_omitted_site_snapshot(self):
        for targets in (
            [],
            [self.user_target()] * 2,
            [self.user_target()] * 101,
            [{**self.user_target(), "account_id": True}],
            [{**self.user_target(), "expected_site_id": "12"}],
            [{key: value for key, value in self.user_target().items() if key != "expected_site_id"}],
            [{**self.user_target(), "expected_email": "bad"}],
            [{**self.user_target(), "password": "forbidden"}],
        ):
            with self.subTest(targets=targets):
                response = await self.batch("users", targets)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertNotIn("person3@example.com", response.text)

    async def test_permissions_are_exact_and_refreshed_under_the_lock(self):
        async with self.sessions.begin() as session:
            await session.execute(
                update(AuthRole)
                .where(AuthRole.id == 1)
                .values({AuthRole.is_manage_users: False, AuthRole.is_delete: True})
            )
        self.assertEqual((await self.single("users", self.user_target())).status_code, 403)
        self.assertEqual((await self.single("roles", self.role_target())).status_code, 200)
        async with self.sessions.begin() as session:
            await session.execute(update(AuthRole).where(AuthRole.id == 1).values({AuthRole.is_manage_users: True}))
        original = ManagementWriteState.begin

        async def revoke(state, actor_id, permission):
            await state.transaction.execute_orm(update(AuthRole).where(AuthRole.id == 1).values({permission: False}))
            await original(state, actor_id, permission)

        with patch.object(ManagementWriteState, "begin", revoke):
            self.assertEqual((await self.single("users", self.user_target())).status_code, 403)
            self.assertEqual((await self.single("roles", self.role_target(5, "unused-inactive"))).status_code, 403)

    async def test_both_resources_share_transport_and_private_error_policy(self):
        for resource, path_id in (("roles", 4), ("users", 3)):
            for method, path in (
                ("DELETE", f"/management/{resource}/{path_id}"),
                ("POST", f"/management/{resource}/bulk-delete"),
            ):
                for body, headers, status in (
                    ("{}", {"Origin": "https://untrusted.example", "Content-Type": "application/json"}, 403),
                    ('{"x":1,"x":2}', {"Content-Type": "application/json"}, 400),
                    ("{}", {"Content-Type": "text/plain"}, 415),
                    (" " * 65537, {"Content-Type": "application/json"}, 413),
                ):
                    with self.subTest(path=path, status=status):
                        response = await self.client.request(method, path, content=body, headers=headers)
                        self.assertEqual(response.status_code, status, response.text)
                        self.assertIn("no-store", response.headers["cache-control"])
                target = self.role_target() if resource == "roles" else self.user_target()
                self.assertEqual(
                    (
                        await self.client.post(
                            f"/management/{resource}/bulk-delete?locale=en", json={"targets": [target]}
                        )
                    ).status_code,
                    400,
                )

    async def test_fk_or_storage_failure_after_root_delete_rolls_back_every_owned_row(self):
        before = await self.snapshot()
        original = SqlAlchemyExecAsync.execute_orm

        async def fail(executor, statement, *args, **kwargs):
            result = await original(executor, statement, *args, **kwargs)
            if getattr(statement, "is_delete", False) and statement.table.name == AuthUser.__tablename__:
                raise IntegrityError("hidden", {}, Exception("secret database internals"))
            return result

        with patch.object(SqlAlchemyExecAsync, "execute_orm", fail):
            response = await self.single("users", self.user_target())
        self.assertEqual(response.status_code, 409)
        self.assertNotIn("secret", response.text)
        self.assertEqual(before, await self.snapshot())
        async with self.sessions() as session:
            self.assertEqual(
                await session.scalar(select(func.count()).select_from(RecordLogin).where(RecordLogin.user_id == 3)), 1
            )
        self.invalidate_cache.assert_not_awaited()

    async def test_user_cache_failure_is_explicit_after_commit(self):
        async def failed_cache():
            async with self.sessions() as session:
                self.assertIsNone(await session.get(AuthUser, 3))
                self.assertIsNone(await session.get(PortfolioSite, 12))
            raise HTTPException(status_code=503, detail="cache unavailable")

        self.invalidate_cache.side_effect = failed_cache
        response = await self.single("users", self.user_target())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE")
        self.assertEqual(response.headers["X-Management-Update-State"], "committed")
        self.assertEqual((await self.single("users", self.user_target())).status_code, 404)
        self.invalidate_cache.assert_awaited_once()

    async def test_competing_user_deletes_commit_only_once(self):
        responses = await asyncio.gather(
            self.single("users", self.user_target()), self.single("users", self.user_target())
        )
        self.assertEqual(sorted(response.status_code for response in responses), [200, 404])
        self.invalidate_cache.assert_awaited_once()

    async def test_role_assignment_and_delete_serialize_without_orphan_accounts(self):
        assignment = self.client.patch(
            "/management/users/4",
            json={"expected_email": "person4@example.com", "expected": {"role_id": 2}, "changes": {"role_id": 4}},
        )
        deletion, assigning = await asyncio.gather(self.single("roles", self.role_target()), assignment)
        self.assertIn((deletion.status_code, assigning.status_code), ((200, 404), (409, 200)))

    async def test_user_delete_and_default_switch_serialize(self):
        switching = self.client.patch(
            "/management/sites/3",
            json={
                "expected_owner_email": "person3@example.com",
                "expected": {"is_default": False},
                "changes": {"is_default": True},
            },
        )
        deletion, switching = await asyncio.gather(self.single("users", self.user_target()), switching)
        self.assertIn((deletion.status_code, switching.status_code), ((200, 404), (409, 200)))

    async def real_cookie_app(self):
        class SignInCache:
            async def incr_with_expiry(self, *args):
                return 1, 60

        app = FastAPI()
        app.add_middleware(
            SessionMiddleware, store_factory=lambda: store, cookie_name="session_id", cookie_https_only=False
        )
        store = InMemoryStore()
        app.include_router(auth_router)
        app.include_router(router)

        @app.post("/fixture/legacy")
        async def legacy(request: Request):
            await load_session(request)
            request.session.update({"id": 1, "email": "person1@example.com"})
            return {"issued": True}

        cache = SignInCache()
        mock = patch.object(AuthModule, "_cache", lambda self: cache)
        mock.start()
        self.addCleanup(mock.stop)
        async with self.sessions.begin() as session:
            for account_id in (1, 6):
                account = await session.get(AuthUser, account_id)
                await account.set_password("isolated-delete-password")
        return app

    async def test_deleted_session_cannot_follow_reused_id_email_user_and_password(self):
        app = await self.real_cookie_app()
        async with (
            AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as actor,
            AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as victim,
        ):
            self.assertEqual(
                (
                    await actor.post(
                        "/authority/sign-in",
                        json={"email": "person1@example.com", "password": "isolated-delete-password"},
                    )
                ).status_code,
                200,
            )
            logged_in = await victim.post(
                "/authority/sign-in", json={"email": "backup@example.com", "password": "isolated-delete-password"}
            )
            self.assertEqual(logged_in.status_code, 200)
            self.assertNotIn(AUTH_SESSION_IDENTITY_KEY, logged_in.json())
            response = await actor.request(
                "DELETE", "/management/users/6", json={"expected_email": "backup@example.com", "expected_site_id": None}
            )
            self.assertEqual(response.status_code, 200, response.text)
            async with self.sessions.begin() as session:
                replacement = AuthUser(id=6, user="backup-manager", email="backup@example.com", role_id=1)
                await replacement.set_password("isolated-delete-password")
                session.add(replacement)
            self.assertIsNone((await victim.get("/authority/session")).json())
            self.assertEqual((await victim.get("/management/users")).status_code, 401)
            self.assertEqual(
                (
                    await victim.post(
                        "/authority/sign-in",
                        json={"email": "backup@example.com", "password": "isolated-delete-password"},
                    )
                ).status_code,
                200,
            )
            self.assertEqual((await victim.get("/authority/session")).json()["id"], 6)

    async def test_legacy_session_requires_reauthentication(self):
        app = await self.real_cookie_app()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            await client.post("/fixture/legacy")
            self.assertIsNone((await client.get("/authority/session")).json())
            self.assertEqual(
                (
                    await client.post(
                        "/authority/sign-in",
                        json={"email": "person1@example.com", "password": "isolated-delete-password"},
                    )
                ).status_code,
                200,
            )
            self.assertEqual((await client.get("/authority/session")).json()["id"], 1)

    async def test_delete_contracts_are_registered_on_original_cbvs(self):
        paths = (await self.client.get("/openapi.json")).json()["paths"]
        for resource, key in (("roles", "role_id"), ("users", "account_id")):
            self.assertEqual(set(paths[f"/management/{resource}/{{{key}}}"]), {"patch", "delete"})
            self.assertEqual(set(paths[f"/management/{resource}/bulk-delete"]), {"post"})

    async def test_direct_module_boundaries_reject_actor_and_target_coercion(self):
        for module, target in (
            (ManagementRolesModule, self.role_target()),
            (ManagementUsersModule, self.user_target()),
        ):
            for targets, actor in (
                (None, 1),
                ([], 1),
                ([target], None),
                ([target], True),
                ([{**target, "unknown": 1}], 1),
            ):
                with self.subTest(module=module, targets=targets, actor=actor):
                    with self.assertRaises(HTTPException):
                        await module().delete(targets, actor_id=actor)


@skipUnless(os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL"), "Disposable PostgreSQL URL not supplied")
class PostgreSQLRoleUserDeleteTests(RoleUserDeleteTests):
    postgres_url = os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL")
