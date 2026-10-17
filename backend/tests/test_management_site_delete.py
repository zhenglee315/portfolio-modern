"""Exercise physical Platform deletion with isolated storage and real authorization/constraints."""

import asyncio
import os
from unittest import IsolatedAsyncioTestCase, skipUnless
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

import test_management_site_update as platform_fixture
from APPs.Management.module import ManagementSitesModule
from APPs.Management.module.module_state import ManagementWriteState
from APPs.Management.constants import MANAGEMENT_DELETE_MAX_BYTES
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from SYSTEM.constants import EnumLocal
from SYSTEM.models import (
    AuthRole,
    AuthUser,
    RecordLogin,
    PortfolioSite,
    PortfolioSiteLocale,
    PortfolioLocale,
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


class PlatformDeleteTests(IsolatedAsyncioTestCase):
    """Reuse the existing disposable fixture, without inheriting/rerunning its PATCH test methods.

    ♂ ZhengLee 2026.10.16
    """

    postgres_url = None
    asyncSetUp = platform_fixture.PlatformPatchTests.asyncSetUp
    asyncTearDown = platform_fixture.PlatformPatchTests.asyncTearDown
    snapshot = platform_fixture.PlatformPatchTests.snapshot
    seed_inactive_language_content = platform_fixture.PlatformPatchTests.seed_inactive_language_content

    @staticmethod
    def target(account=3, site=12):
        return {
            "account_id": account,
            "expected_owner_email": f"person{account}@example.com",
            "expected_site_id": site,
        }

    async def single(self, account=3, site=12, **kwargs):
        target = self.target(account, site)
        target.pop("account_id")
        return await self.client.request("DELETE", f"/management/sites/{account}", json=target, **kwargs)

    async def test_single_preserves_account_and_its_row(self):
        before = await self.snapshot()
        response = await self.single()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json(),
            {"deleted_count": 1, "deleted": [{"account_id": 3, "site_id": 12}]},
        )
        async with self.sessions() as session:
            self.assertIsNotNone(await session.get(AuthUser, 3))
            self.assertIsNone(await session.get(PortfolioSite, 12))
            self.assertIsNotNone(await session.get(PortfolioSite, 11))
        after = await self.snapshot()
        self.assertEqual(before[0], after[0])
        rows = (await self.client.get("/management/sites")).json()["items"]
        owner = next(row for row in rows if row["id"] == 3)
        self.assertFalse(owner["has_site"])
        self.assertIsNone(owner["site_id"])
        self.assertEqual(owner["owner_email"], "person3@example.com")
        self.assertIn("no-store", response.headers["cache-control"])
        self.invalidate_cache.assert_awaited_once()

    async def test_delete_contracts_and_public_reads(self):
        paths = (await self.client.get("/openapi.json")).json()["paths"]
        self.assertEqual(set(paths["/management/sites/{account_id}"]), {"patch", "delete"})
        self.assertEqual(set(paths["/management/sites/bulk-delete"]), {"post"})
        before = await self.client.get("/portfolio/site?user=person3&locale=en")
        self.assertEqual(before.status_code, 200, before.text)
        self.assertEqual((await self.single()).status_code, 200)
        self.assertEqual(
            (await self.client.get("/portfolio/site?user=person3&locale=en")).status_code,
            404,
        )
        self.assertEqual(
            (await self.client.get("/management/preview/site?site_id=12&locale=en")).status_code,
            404,
        )

    async def test_batch_deletes_inactive_owner_and_keeps_other_site(self):
        response = await self.client.post(
            "/management/sites/bulk-delete",
            json={"targets": [self.target(5, 13), self.target()]},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["deleted_count"], 2)
        async with self.sessions() as session:
            self.assertEqual((await session.execute(select(PortfolioSite.id))).scalars().all(), [11])
            self.assertIsNotNone(await session.get(AuthUser, 5))
        self.invalidate_cache.assert_awaited_once()

    async def test_all_content_cascades_but_shared_locales_history_and_account_survive(
        self,
    ):
        await self.seed_inactive_language_content()
        async with self.sessions.begin() as session:
            await session.execute(
                update(PortfolioSite).where(PortfolioSite.id == 11).values({PortfolioSite.is_default: False})
            )
            session.add(RecordLogin(user_id=2, ip_address="192.0.2.2"))
            # Identical skill/category keys in another tenant must survive the composite-FK cascades.
            session.add_all(
                [
                    PortfolioSkill(site_id=12, id="python", label_key="skill.python"),
                    PortfolioSkillCategory(
                        site_id=12,
                        id="engineering",
                        label_key="category.engineering",
                        position=0,
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    PortfolioSkillLocale(
                        site_id=12,
                        skill_id="python",
                        locale=EnumLocal.EN,
                        label="Python",
                    ),
                    PortfolioSkillCategoryLocale(
                        site_id=12,
                        category_id="engineering",
                        locale=EnumLocal.EN,
                        label="Engineering",
                    ),
                    PortfolioCategorySkill(
                        site_id=12,
                        category_id="engineering",
                        skill_id="python",
                        position=0,
                    ),
                ]
            )
        response = await self.single(2, 11)
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
                self.assertEqual(
                    (await session.execute(select(func.count()).select_from(model))).scalar_one(),
                    (
                        1
                        if model
                        in {
                            PortfolioSkill,
                            PortfolioSkillLocale,
                            PortfolioSkillCategory,
                            PortfolioSkillCategoryLocale,
                            PortfolioCategorySkill,
                        }
                        else 0
                    ),
                    model.__name__,
                )
            self.assertEqual(
                (
                    await session.execute(
                        select(func.count()).select_from(PortfolioSiteLocale).where(PortfolioSiteLocale.site_id == 11)
                    )
                ).scalar_one(),
                0,
            )
            self.assertEqual(
                (await session.execute(select(func.count()).select_from(PortfolioLocale))).scalar_one(),
                3,
            )
            self.assertEqual(
                (await session.execute(select(func.count()).select_from(RecordLogin))).scalar_one(),
                1,
            )
            self.assertIsNotNone(await session.get(AuthUser, 2))
            self.assertIsNotNone(await session.get(PortfolioSite, 12))

    async def test_default_in_batch_rolls_back_every_target(self):
        before = await self.snapshot()
        response = await self.client.post(
            "/management/sites/bulk-delete",
            json={"targets": [self.target(), self.target(2, 11)]},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "DEFAULT_SITE_DELETE_FORBIDDEN")
        self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()

    async def test_one_invalid_confirmation_rolls_back_batch(self):
        for change in (
            {"expected_owner_email": "person2@example.com"},
            {"expected_site_id": 11},
            {"account_id": 4},
        ):
            with self.subTest(change=change):
                before = await self.snapshot()
                target = {**self.target(), **change}
                response = await self.client.post(
                    "/management/sites/bulk-delete",
                    json={"targets": [self.target(5, 13), target]},
                )
                self.assertIn(response.status_code, (404, 409), response.text)
                self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()

    async def test_invalid_schema_never_echoes_input_or_writes(self):
        invalid = [
            [],
            [self.target()] * 2,
            [self.target()] * 101,
            [{**self.target(), "account_id": True}],
            [{**self.target(), "expected_site_id": "12"}],
            [{**self.target(), "expected_site_id": None}],
            [{**self.target(), "expected_owner_email": "bad"}],
            [{**self.target(), "is_active": False}],
            [{**self.target(), "expected_site_id": -1}],
            [self.target(), {**self.target(5, 13), "expected_site_id": 12}],
        ]
        before = await self.snapshot()
        for targets in invalid:
            with self.subTest(targets=targets):
                response = await self.client.post("/management/sites/bulk-delete", json={"targets": targets})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertNotIn("person3@example.com", response.text)
                self.assertIn("no-store", response.headers["cache-control"])
        self.assertEqual(before, await self.snapshot())

    async def test_transport_boundaries_apply_to_both_methods(self):
        for method, path in (
            ("DELETE", "/management/sites/3"),
            ("POST", "/management/sites/bulk-delete"),
        ):
            for content, headers, status in (
                ('{"x":1,"x":2}', {"Content-Type": "application/json"}, 400),
                ('{"x":NaN}', {"Content-Type": "application/json"}, 400),
                ("{}", {"Content-Type": "text/plain"}, 415),
                (
                    "{}",
                    {"Content-Type": "application/json", "Content-Encoding": "gzip"},
                    415,
                ),
                (
                    "{}",
                    {
                        "Content-Type": "application/json",
                        "Origin": "https://untrusted.example",
                    },
                    403,
                ),
                (
                    " " * (MANAGEMENT_DELETE_MAX_BYTES + 1),
                    {"Content-Type": "application/json"},
                    413,
                ),
            ):
                with self.subTest(method=method, status=status):
                    response = await self.client.request(method, path, content=content, headers=headers)
                    self.assertEqual(response.status_code, status, response.text)
                    self.assertIn("no-store", response.headers["cache-control"])
        self.invalidate_cache.assert_not_awaited()

    async def test_rejects_locale_and_query_scopes(self):
        for suffix in ("?locale=en", "?page=1", "?locale=en&locale=en"):
            response = await self.single(params=suffix[1:])
            self.assertEqual(response.status_code, 400, response.text)
        response = await self.client.post("/management/sites/bulk-delete?locale=en", json={"targets": [self.target()]})
        self.assertEqual(response.status_code, 400)

    async def test_authority_is_database_backed(self):
        async with self.sessions.begin() as session:
            await session.execute(
                update(AuthRole)
                .where(AuthRole.id == 1)
                .values({AuthRole.is_manage_sites: False, AuthRole.is_delete: True})
            )
        response = await self.single()
        self.assertEqual(response.status_code, 403)
        self.identity.clear()
        self.assertEqual((await self.single()).status_code, 401)
        self.invalidate_cache.assert_not_awaited()

    async def test_permission_revoked_at_transaction_boundary_blocks_write(self):
        original = ManagementWriteState.begin

        async def revoked(state, actor_id, permission):
            await state.transaction.execute_orm(
                update(AuthRole).where(AuthRole.id == 1).values({AuthRole.is_manage_sites: False})
            )
            await original(state, actor_id, permission)

        with patch.object(ManagementWriteState, "begin", revoked):
            response = await self.single()
        self.assertEqual(response.status_code, 403)
        async with self.sessions() as session:
            self.assertIsNotNone(await session.get(PortfolioSite, 12))

    async def test_database_failure_after_delete_rolls_back_cascade(self):
        before = await self.snapshot()
        original = SqlAlchemyExecAsync.execute_orm

        async def fail(executor, statement, *args, **kwargs):
            result = await original(executor, statement, *args, **kwargs)
            if getattr(statement, "is_delete", False):
                raise IntegrityError("hidden", {}, Exception("secret database detail"))
            return result

        with patch.object(SqlAlchemyExecAsync, "execute_orm", fail):
            response = await self.single()
        self.assertEqual(response.status_code, 409)
        self.assertNotIn("secret", response.text)
        self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()

    async def test_cache_failure_reports_commit_and_retry_cannot_delete_another_site(
        self,
    ):
        async def cache_failure():
            async with self.sessions() as session:
                self.assertIsNone(await session.get(PortfolioSite, 12))
            raise HTTPException(status_code=503, detail="cache unavailable")

        self.invalidate_cache.side_effect = cache_failure
        response = await self.single()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE")
        self.assertEqual(response.headers["X-Management-Update-State"], "committed")
        self.assertEqual((await self.single()).status_code, 404)
        self.invalidate_cache.assert_awaited_once()

    async def test_competing_deletions_have_only_one_success(self):
        responses = await asyncio.gather(self.single(), self.single())
        self.assertEqual(sorted(response.status_code for response in responses), [200, 404])
        self.invalidate_cache.assert_awaited_once()

    async def test_default_switch_and_delete_serialize(self):
        body = {
            "expected_owner_email": "person3@example.com",
            "expected": {"is_default": False},
            "changes": {"is_default": True},
        }
        deletion, switching = await asyncio.gather(self.single(), self.client.patch("/management/sites/3", json=body))
        self.assertIn((deletion.status_code, switching.status_code), ((200, 404), (409, 200)))
        async with self.sessions() as session:
            default = (
                await session.execute(select(PortfolioSite).where(PortfolioSite.is_default.is_(True)))
            ).scalar_one()
            self.assertIn(default.id, (11, 12))
            self.assertTrue(default.is_published)

    async def test_direct_module_boundary_and_actor_confirmation(self):
        for targets, actor in (
            (None, 1),
            ([], 1),
            ([self.target()], None),
            ([self.target()], True),
            ([{**self.target(), "account_id": "3"}], 1),
        ):
            with self.subTest(targets=targets, actor=actor):
                with self.assertRaises(HTTPException):
                    await ManagementSitesModule().delete(targets, actor_id=actor)
        self.invalidate_cache.assert_not_awaited()


@skipUnless(
    os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL"),
    "Disposable PostgreSQL URL not supplied",
)
class PostgreSQLPlatformDeleteTests(PlatformDeleteTests):
    postgres_url = os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL")
