"""Exercise role/user updates and cross-resource invariants using disposable SQL storage."""

import asyncio
import os
import unittest
from unittest.mock import patch, AsyncMock
from fastapi import HTTPException, Request
from APPs.Auth.module import AuthRegisterModule
from sqlalchemy import select, update
from test_management_site_update import PlatformPatchTests as _PlatformFixture
from APPs.Management.module import (
    ManagementRolesModule,
    ManagementUsersModule,
)
from APPs.Management.module.module_state import ManagementWriteState
from APPs.Management.schema.resp import RespManagementRole
from SYSTEM.models import AuthRole, AuthUser, PortfolioSite, RecordLogin
from COMMON.tools.storage.redis import RedisAsync
from redis.exceptions import ConnectionError as RedisConnectionError


class RoleUserUpdateTests(_PlatformFixture):
    """Use real permission reads, original-value comparisons and one transaction per write.

    ♂ ZhengLee 2026.10.16
    """

    async def asyncSetUp(self):
        await super().asyncSetUp()
        async with self.sessions.begin() as session:
            await session.execute(
                update(AuthRole)
                .where(AuthRole.id == 1)
                .values({AuthRole.is_manage_users: True, AuthRole.is_manage_roles: True})
            )
            session.add(AuthRole(id=3, role="registration", is_default=True))
            session.add(
                AuthUser(
                    user="backup-manager",
                    email="backup@example.com",
                    password="$argon2id$v=19$m=65536,t=3,p=4$" + "a" * 22 + "$" + "b" * 43,
                    role_id=1,
                )
            )

    async def request_update(self, resource, target, changes, *, expected=None, confirmation=None):
        module = ManagementRolesModule() if resource == "roles" else ManagementUsersModule()
        stmt, _ = module._query()
        identity = AuthRole.id if resource == "roles" else AuthUser.id
        async with self.sessions() as session:
            row = (await session.execute(stmt.where(identity == target))).mappings().one()
        key = "expected_role" if resource == "roles" else "expected_email"
        return await self.client.patch(
            f"/management/{resource}/{target}",
            json={
                key: confirmation or row["role" if resource == "roles" else "email"],
                "expected": (expected if expected is not None else {field: row[field] for field in changes}),
                "changes": changes,
            },
        )

    async def test_role_update_preserves_fk_and_returns_full_projection(self):
        response = await self.request_update("roles", 2, {"role": "reader", "description": None, "is_read": True})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["user_count"], 4)
        self.assertEqual(response.json()["role"], "reader")
        async with self.sessions() as session:
            self.assertEqual(
                await session.scalar(select(AuthUser.role_id).where(AuthUser.id == 2)),
                2,
            )
        users = await self.client.get("/management/users")
        self.assertEqual(next(r["role"] for r in users.json()["items"] if r["id"] == 2), "reader")

    async def test_monitor_permission_updates_and_filters_without_management_grants(self):
        """Allow the registration default to view monitoring without granting administration."""
        response = await self.request_update("roles", 3, {"is_monitor": True})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["is_monitor"])
        self.assertTrue(response.json()["is_default"])
        for field in ("is_manage_sites", "is_manage_users", "is_manage_roles"):
            self.assertFalse(response.json()[field])
        roles = await self.client.get(
            "/management/roles",
            params={
                "filters": '[{"field":"is_monitor","operator":"equals","value":true}]',
                "sort": "is_monitor:desc",
            },
        )
        self.assertEqual(roles.status_code, 200, roles.text)
        self.assertEqual([row["id"] for row in roles.json()["items"]], [3])
        stale = await self.request_update("roles", 3, {"is_monitor": False}, expected={"is_monitor": False})
        self.assertEqual(stale.status_code, 409)
        removed = await self.request_update("roles", 3, {"is_monitor": False})
        self.assertEqual(removed.status_code, 200, removed.text)
        self.assertFalse(removed.json()["is_monitor"])

    async def test_user_role_assignment_reuses_patch_and_checks_original_role(self):
        response = await self.request_update("users", 2, {"role_id": 3})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["role"], "registration")
        self.assertEqual(response.json()["email"], "person2@example.com")
        stale = await self.request_update("users", 2, {"role_id": 2}, expected={"role_id": 2})
        self.assertEqual(stale.status_code, 409, stale.text)
        await self.patch_site("/management/sites/3", json={"is_default": True})
        combined = await self.request_update("users", 2, {"role_id": 2, "is_active": False})
        self.assertEqual(combined.status_code, 200, combined.text)
        self.assertFalse(combined.json()["is_active"])

    async def test_user_role_assignment_validates_target_grants_and_final_manager(self):
        async with self.sessions.begin() as session:
            session.add_all(
                [
                    AuthRole(id=4, role="inactive", is_active=False),
                    AuthRole(id=5, role="higher", is_create=True),
                ]
            )
        for target, status in [(9999, 404), (4, 409), (5, 403)]:
            response = await self.request_update("users", 2, {"role_id": target})
            self.assertEqual(response.status_code, status, response.text)
        async with self.sessions.begin() as session:
            await session.execute(update(AuthUser).where(AuthUser.id == 6).values({AuthUser.is_active: False}))
        response = await self.request_update("users", 1, {"role_id": 2})
        self.assertEqual(response.status_code, 409, response.text)
        async with self.sessions() as session:
            self.assertEqual(
                await session.scalar(select(AuthUser.role_id).where(AuthUser.id == 1)),
                1,
            )

    async def test_user_role_assignment_rejects_coercion_null_and_unbounded_ids(self):
        for value in [None, True, "2", 0, -1, 1.5, 2147483648]:
            response = await self.request_update("users", 2, {"role_id": value})
            self.assertEqual(response.status_code, 422, response.text)

    async def test_role_choices_require_users_only_and_apply_grant_ceiling(self):
        async with self.sessions.begin() as session:
            await session.execute(update(AuthRole).where(AuthRole.id == 1).values({AuthRole.is_manage_roles: False}))
            session.add_all(
                [
                    AuthRole(id=4, role="inactive", is_active=False),
                    AuthRole(id=5, role="higher", is_create=True),
                ]
            )
        self.assertEqual((await self.client.get("/management/roles")).status_code, 403)
        response = await self.client.get("/management/users/role-options?size=2&search=ig")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json()["items"],
            [{"id": 5, "role": "higher", "is_active": True, "can_assign": False}],
        )
        response = await self.client.get("/management/users/role-options?size=100")
        self.assertEqual(response.status_code, 200, response.text)
        choices = {row["id"]: row for row in response.json()["items"]}
        self.assertTrue(choices[2]["can_assign"])
        self.assertFalse(choices[4]["can_assign"])
        self.assertIn("no-store", response.headers["cache-control"])
        for query in [
            "size=0",
            "page=1&page=2",
            "search=x&search=y",
            "sort=role:desc",
            "search=" + "x" * 201,
        ]:
            self.assertEqual(
                (await self.client.get("/management/users/role-options?" + query)).status_code,
                400,
            )

    async def test_login_presence_batches_only_page_ips_and_preserves_geography(self):
        initializer = patch.object(RedisAsync, "__init__", return_value=None)
        initializer.start()
        self.addCleanup(initializer.stop)
        async with self.sessions.begin() as session:
            session.add_all(
                [RecordLogin(user_id=2, ip_address=ip) for ip in ["192.0.2.1", "192.0.2.1", "2001:db8::1", None]]
            )
        with patch.object(
            RedisAsync,
            "heartbeat_status",
            new_callable=AsyncMock,
            return_value={"192.0.2.1": True, "2001:db8::1": False},
        ) as status:
            response = await self.client.get("/management/login-records?user_id=2&size=100")
            self.assertEqual(response.status_code, 200, response.text)
            rows = response.json()["items"]
            self.assertEqual(len(status.await_args.args[0]), 2)
            self.assertEqual(sum(row["is_online"] is True for row in rows), 2)
            self.assertTrue(all(row["geo_status"] == "unknown" for row in rows))
        with patch.object(
            RedisAsync,
            "heartbeat_status",
            new_callable=AsyncMock,
            side_effect=RedisConnectionError("internal secret"),
        ):
            response = await self.client.get("/management/login-records?user_id=2&size=100")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertTrue(all(row["is_online"] is None for row in response.json()["items"]))
            self.assertNotIn("internal secret", response.text)
        self.assertEqual(
            (await self.client.get("/management/login-records?sort=is_online:asc")).status_code,
            400,
        )

    async def test_heartbeat_status_uses_raw_mget_without_roster_scan(self):
        cache = RedisAsync.__new__(RedisAsync)
        cache.mget = AsyncMock(return_value=[b"1", None])
        self.assertEqual(
            await cache.heartbeat_status(["192.0.2.1", "192.0.2.1", "::1"]),
            {"192.0.2.1": True, "::1": False},
        )
        cache.mget.assert_awaited_once_with(("online:192.0.2.1", "online:::1"), deserialize=False)
        cache.mget.reset_mock()
        self.assertEqual(await cache.heartbeat_status([]), {})
        cache.mget.assert_not_awaited()

    async def test_role_default_replaces_atomically_and_rejects_invalid_final_state(
        self,
    ):
        response = await self.request_update("roles", 2, {"is_default": True})
        self.assertEqual(response.status_code, 200, response.text)
        for changes in (
            {"is_default": False},
            {"is_active": False},
            {"is_manage_sites": True},
        ):
            response = await self.request_update("roles", 2, changes)
            self.assertEqual(response.status_code, 409, response.text)
        response = await self.request_update("roles", 1, {"is_default": True})
        self.assertEqual(response.status_code, 409)
        async with self.sessions() as session:
            self.assertEqual(
                (await session.scalars(select(AuthRole.id).where(AuthRole.is_default.is_(True)))).all(),
                [2],
            )

    async def test_role_validates_combined_state_instead_of_old_permissions(self):
        async with self.sessions.begin() as session:
            await session.execute(
                update(AuthRole)
                .where(AuthRole.id == 2)
                .values({AuthRole.is_manage_sites: True, AuthRole.is_active: False})
            )
        response = await self.request_update(
            "roles",
            2,
            {"is_manage_sites": False, "is_active": True, "is_default": True},
        )
        self.assertEqual(response.status_code, 200, response.text)

    async def test_role_rejects_duplicate_names_wrong_identity_and_readonly_values(
        self,
    ):
        response = await self.request_update("roles", 2, {"role": "manager"})
        self.assertEqual(response.status_code, 409)
        response = await self.request_update("roles", 2, {"description": "wrong"}, confirmation="wrong")
        self.assertEqual(response.status_code, 404)
        for changes in (
            {"id": 4},
            {"user_count": 4},
            {"role": " bad "},
            {"role": ""},
            {"is_read": "true"},
            {"is_read": None},
            {"description": "x" * 10001},
        ):
            response = await self.client.patch(
                "/management/roles/2",
                json={
                    "expected_role": "viewer",
                    "expected": {key: None for key in changes},
                    "changes": changes,
                },
            )
            self.assertEqual(response.status_code, 422, response.text)

    async def test_last_manager_guard_covers_role_user_and_platform(self):
        async with self.sessions.begin() as session:
            await session.execute(update(AuthUser).where(AuthUser.id == 6).values({AuthUser.is_active: False}))
        for changes in ({"is_active": False}, {"is_manage_roles": False}):
            response = await self.request_update("roles", 1, changes)
            self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(response.json()["detail"], "LAST_ROLE_MANAGER_REQUIRED")
        response = await self.request_update("users", 1, {"is_active": False})
        self.assertEqual(response.status_code, 409, response.text)
        response = await self.patch_site("/management/sites/1", json={"owner_is_active": False})
        self.assertEqual(response.status_code, 409, response.text)
        async with self.sessions() as session:
            self.assertTrue(await session.scalar(select(AuthUser.is_active).where(AuthUser.id == 1)))

    async def test_user_activation_cannot_bypass_platform_default_protection(self):
        before = await self.snapshot()
        response = await self.request_update("users", 2, {"is_active": False, "role_id": 3})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"], "DEFAULT_SITE_DEACTIVATE_FORBIDDEN")
        self.assertEqual(before, await self.snapshot())
        async with self.sessions() as session:
            self.assertEqual(
                await session.scalar(select(AuthUser.role_id).where(AuthUser.id == 2)),
                2,
            )
        self.invalidate_cache.assert_not_awaited()
        response = await self.patch_site("/management/sites/3", json={"is_default": True})
        self.assertEqual(response.status_code, 200, response.text)
        response = await self.request_update("users", 2, {"is_active": False})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["email"], "person2@example.com")
        async with self.sessions() as session:
            self.assertFalse(await session.scalar(select(PortfolioSite.is_default).where(PortfolioSite.id == 11)))
        response = await self.request_update("users", 4, {"is_active": False})
        self.assertEqual(response.status_code, 200)
        response = await self.request_update("users", 2, {"is_active": True})
        self.assertEqual(response.status_code, 200)
        async with self.sessions() as session:
            self.assertFalse(await session.scalar(select(PortfolioSite.is_default).where(PortfolioSite.id == 11)))

    async def test_user_readonly_account_and_related_fields_cannot_be_written(self):
        for field, value in [
            ("email", "new@example.com"),
            ("site_id", 11),
            ("role", "manager"),
            ("password", "new password"),
            ("role_is_active", False),
            ("id", 3),
            ("updatetime", "2026-01-01"),
        ]:
            response = await self.client.patch(
                "/management/users/2",
                json={
                    "expected_email": "person2@example.com",
                    "changes": {field: value},
                    "expected": {field: None},
                },
            )
            self.assertEqual(response.status_code, 422, response.text)
        response = await self.request_update("users", 2, {"is_active": False}, confirmation="other@example.com")
        self.assertEqual(response.status_code, 404)

    async def test_stale_original_values_reject_overwriting_another_administrator(self):
        for resource, target, changes, expected in [
            ("roles", 2, {"description": "first"}, {"description": None}),
            ("users", 5, {"is_active": True}, {"is_active": False}),
        ]:
            one = await self.request_update(resource, target, changes, expected=expected)
            self.assertEqual(one.status_code, 200, one.text)
            two = await self.request_update(resource, target, changes, expected=expected)
            self.assertEqual(two.status_code, 409, two.text)
            self.assertEqual(two.json()["detail"], "MANAGEMENT_EDIT_CONFLICT")
        response = await self.client.patch(
            "/management/users/2",
            json={
                "expected_email": "person2@example.com",
                "changes": {"is_active": False},
            },
        )
        self.assertEqual(response.status_code, 422)

    async def test_user_noop_does_not_change_updated_and_self_disable_revokes_session(
        self,
    ):
        first = await self.request_update("users", 2, {"is_active": True})
        second = await self.request_update("users", 2, {"is_active": True})
        self.assertEqual(first.json()["updatetime"], second.json()["updatetime"])
        response = await self.request_update("users", 1, {"is_active": False})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((await self.client.get("/management/users")).status_code, 401)

    async def test_cross_permission_changes_are_rechecked_after_waiting_for_a_write(
        self,
    ):
        waiting = asyncio.Event()
        release = asyncio.Event()
        original = ManagementWriteState.begin

        async def pause(state, *args):
            waiting.set()
            await release.wait()
            return await original(state, *args)

        with patch.object(ManagementWriteState, "begin", pause):
            task = asyncio.create_task(self.request_update("roles", 2, {"description": "must not save"}))
            await asyncio.wait_for(waiting.wait(), 5)
            async with self.sessions.begin() as session:
                await session.execute(
                    update(AuthRole).where(AuthRole.id == 1).values({AuthRole.is_manage_roles: False})
                )
            release.set()
            response = await task
        self.assertEqual(response.status_code, 403, response.text)
        async with self.sessions() as session:
            self.assertIsNone(await session.scalar(select(AuthRole.description).where(AuthRole.id == 2)))

    async def test_platform_permission_cannot_substitute_for_role_or_user_updates(self):
        async with self.sessions.begin() as session:
            await session.execute(
                update(AuthRole)
                .where(AuthRole.id == 1)
                .values({AuthRole.is_manage_roles: False, AuthRole.is_manage_users: False})
            )
        for resource, changes in [
            ("roles", {"description": "denied"}),
            ("users", {"is_active": False}),
        ]:
            response = await self.request_update(resource, 2, changes)
            self.assertEqual(response.status_code, 403, response.text)
            self.assertEqual(response.headers["cache-control"], "private, no-store")
        response = await self.patch_site("/management/sites/2", json={"first_name": "permitted"})
        self.assertEqual(response.status_code, 200, response.text)

    async def test_failed_role_response_rolls_back_default_replacement_and_other_fields(
        self,
    ):
        with patch.object(
            RespManagementRole,
            "model_validate",
            side_effect=RuntimeError("private driver data"),
        ):
            response = await self.request_update("roles", 2, {"is_default": True, "description": "must roll back"})
        self.assertEqual(response.status_code, 503, response.text)
        self.assertNotIn("private driver data", response.text)
        async with self.sessions() as session:
            self.assertEqual(
                (await session.scalars(select(AuthRole.id).where(AuthRole.is_default.is_(True)))).all(),
                [3],
            )
            self.assertIsNone(await session.scalar(select(AuthRole.description).where(AuthRole.id == 2)))

    async def test_user_cache_failure_reports_committed_activation_from_another_connection(
        self,
    ):
        async def failed_cache():
            async with self.sessions() as session:
                self.assertFalse(await session.scalar(select(AuthUser.is_active).where(AuthUser.id == 3)))
                self.assertTrue(await session.scalar(select(PortfolioSite.is_default).where(PortfolioSite.id == 11)))
            raise HTTPException(status_code=503, detail="private cache data")

        self.invalidate_cache.side_effect = failed_cache
        response = await self.request_update("users", 3, {"is_active": False})
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(response.json()["detail"], "MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE")
        self.assertEqual(response.headers["x-management-update-state"], "committed")
        self.assertNotIn("private cache data", response.text)

    async def test_cross_concurrent_user_disable_and_site_default_preserve_visibility(
        self,
    ):
        results = await asyncio.gather(
            self.request_update("users", 2, {"is_active": False}),
            self.patch_site("/management/sites/2", json={"is_default": True}),
        )
        self.assertTrue(all(r.status_code in (200, 409) for r in results), [r.text for r in results])
        self.assertEqual(results[0].status_code, 409, results[0].text)
        self.assertEqual(results[1].status_code, 200, results[1].text)
        async with self.sessions() as session:
            self.assertTrue(await session.scalar(select(AuthUser.is_active).where(AuthUser.id == 2)))
            self.assertTrue(await session.scalar(select(PortfolioSite.is_default).where(PortfolioSite.id == 11)))

    async def test_last_manager_guard_serializes_two_delegated_account_disables(self):
        async with self.sessions.begin() as session:
            session.add(AuthRole(id=4, role="account-manager", is_manage_users=True))
            await session.flush()
            session.add(
                AuthUser(
                    id=7,
                    user="delegated",
                    email="delegated@example.com",
                    password="$argon2id$v=19$m=65536,t=3,p=4$" + "a" * 22 + "$" + "b" * 43,
                    role_id=4,
                )
            )
        self.identity = {"id": 7}
        results = await asyncio.gather(
            self.request_update("users", 1, {"is_active": False}),
            self.request_update("users", 6, {"is_active": False}),
        )
        self.assertEqual(
            sorted(r.status_code for r in results),
            [200, 409],
            [r.text for r in results],
        )
        async with self.sessions() as session:
            self.assertEqual(
                (
                    await session.scalars(
                        select(AuthUser.id).where(AuthUser.id.in_([1, 6]), AuthUser.is_active.is_(True))
                    )
                )
                .all()
                .__len__(),
                1,
            )

    async def test_role_default_switch_and_registration_share_transaction_order(self):
        module = AuthRegisterModule(
            Request({"type": "http", "session": {}}),
            "registered@example.com",
            "test-password-only",
            user="registered",
        )
        with (
            patch.object(module, "_load_session", new_callable=AsyncMock),
            patch.object(module, "_challenge_id", return_value="isolated"),
            patch.object(module, "_verified_challenge", new_callable=AsyncMock),
            patch.object(module, "_claim_challenge", new_callable=AsyncMock, return_value=True),
            patch.object(module, "_complete_challenge", new_callable=AsyncMock),
            patch.object(module, "_start_session", new_callable=AsyncMock),
        ):
            registration, changed = await asyncio.gather(
                module.register(), self.request_update("roles", 2, {"is_default": True})
            )
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertIn(registration["role"], ["registration", "viewer"])
        self.assertFalse(registration["is_manage_roles"])
        self.assertFalse(registration["is_manage_users"])
        self.assertFalse(registration["is_manage_sites"])


@unittest.skipUnless(
    os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL"),
    "Disposable PostgreSQL URL required.",
)
class PostgreSQLRoleUserUpdateTests(RoleUserUpdateTests):
    postgres_url = os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL")


def load_tests(loader, tests, pattern):
    """Run this module's new cases only; inherited Platform cases have their own suite."""
    names = [name for name in RoleUserUpdateTests.__dict__ if name.startswith("test_")]
    return unittest.TestSuite(
        cls(name) for cls in (RoleUserUpdateTests, PostgreSQLRoleUserUpdateTests) for name in names
    )
