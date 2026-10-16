"""Verify Platform PATCH against real isolated SQLite storage and the existing permission dependency."""

# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import SITE_LOCALE_COLUMNS, SITE_PATCH_MAX_BYTES, SITE_TEXT_MAX_LENGTH, SITE_CHAT_ICONS
from APPs.Management.module.module_management import ManagementSitesModule
from APPs.Management.module.module_permission import ManagementPermission
from APPs.Auth.module.module_auth import AuthRegisterModule
from APPs.Management.schema.body import BodyManagementSitePatch, BodyManagementSitePatchRequest
from APPs.Management.views_management import router
from APPs.Portfolio.module.module_portfolio_manage import PortfolioManagementModule
from APPs.Portfolio.views_portfolio import router as public_portfolio_router
from APPs.Portfolio.module import PortfolioSiteModule
from SYSTEM.database import CONN_MANAGER
from SYSTEM.constants import EnumLocal
from SYSTEM.models import (
    BASE,
    AuthRole,
    AuthUser,
    PortfolioLocale,
    PortfolioSite,
    PortfolioSiteLocale,
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

# ◆—< Pack >—————————————————————————————————◆ Test / Storage
from fastapi import FastAPI, HTTPException, Request
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import event, insert, select, text, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase, TestCase, skipUnless
from unittest.mock import AsyncMock, patch
import asyncio
import tempfile
import os
import json
from uuid import uuid4
from datetime import date
from urllib.parse import urlsplit


# ■—< TEST >——————————————————————————————————————————————————————————————————————————■ Platform - Input Contract
class PlatformPatchBodyTests(TestCase):
    """Exercise malformed values without connecting to application storage.

    ♂ ZhengLee 2026.10.15
    """

    def test_rejects_invalid_values_and_readonly_fields(self):
        """Reject coercion, nulls, unsafe links/assets, overflows and identity reassignment."""
        invalid = [
            {},
            {"is_published": "false"},
            {"is_default": 1},
            {"owner_is_active": "false"},
            {"owner_is_active": 0},
            {"copyright_year": True},
            {"copyright_year": "2026"},
            {"copyright_year": 2026.0},
            {"copyright_year": 1899},
            {"copyright_year": 10000},
            {"first_name": 123},
            {"first_name": []},
            {"first_name": {"$set": "name"}},
            {"first_name": "x" * 256},
            {"first_name": "invalid\x00text"},
            {"first_name": "\ud800"},
            {"edu_code": "x" * 129},
            {"profile_content": "x" * (SITE_TEXT_MAX_LENGTH + 1)},
            {"github": "javascript:alert(1)"},
            {"github": "data:text/html,test"},
            {"github": "//example.com"},
            {"github": "https:///missing"},
            {"github": "https://user:password@example.com"},
            {"github": "https://example.com\n/path"},
            {"github": "https://example.com\\@evil.test"},
            {"github": "https://example.com:65536"},
            {"github": "https://example.com:0"},
            {"github": "https://[invalid"},
            {"github": "https://example.com/" + "a" * 2048},
            {"email": "invalid"},
            {"email": "person@example.com\r\nBcc:other@example.com"},
            {"chat_icon": "../../secret.svg"},
            {"chat_icon": "https://example.com/icon.svg"},
            {"chat_icon": "assets/icons/unknown.svg"},
        ]
        invalid.extend({field: None} for field in BodyManagementSitePatch.model_fields)
        invalid.extend(
            {field: value}
            for field, value in {
                "id": 9,
                "site_id": 9,
                "user_id": 9,
                "role_id": 9,
                "locale": "en",
                "owner_email": "replacement@example.com",
                "user": "replacement",
                "has_site": True,
                "has_profile": True,
                "has_translation": True,
                "profile_name": "name",
                "createtime": "2026-01-01T00:00:00Z",
                "updatetime": "2026-01-01T00:00:00Z",
                "unknown": "value",
            }.items()
        )
        for payload in invalid:
            with self.subTest(payload=repr(payload)[:100]), self.assertRaises(ValidationError):
                BodyManagementSitePatch.model_validate(payload)

    def test_preserves_explicit_values_and_excludes_omissions(self):
        """Keep false, empty text, newlines and multilingual content without normalization."""
        payload = {
            "is_published": False,
            "github": "",
            "email": "",
            "first_name": " 鄭 ",
            "chat_content": "第一段\n第二段",
            "edu_code": "UCL",
            "copyright_year": 2026,
        }
        self.assertEqual(BodyManagementSitePatch.model_validate(payload).model_dump(exclude_unset=True), payload)

    def test_patch_boundary_produces_orm_attributes_and_keeps_false(self):
        """One boundary translates external names; identity columns never enter writable ORM assignments."""
        changes = BodyManagementSitePatch(is_default=False, github="").orm_changes()
        self.assertEqual(changes, {PortfolioSite.is_default: False, PortfolioSite.github: ""})
        self.assertNotIn(PortfolioSite.user_id, changes)
        self.assertNotIn(AuthUser.email, changes)

    def test_permission_declarations_require_real_permission_attributes(self):
        """Reject string names, non-permission ORM fields, expressions and duplicate declarations."""
        ManagementPermission(AuthRole.is_manage_sites, AuthRole.is_manage_users)
        for gates in [
            (),
            ("is_manage_sites",),
            (AuthRole.role,),
            (AuthUser.is_active,),
            (AuthRole.is_manage_sites == True,),
            (AuthRole.is_manage_sites, AuthRole.is_manage_sites),
        ]:
            with self.subTest(gates=gates), self.assertRaises(ValueError):
                ManagementPermission(*gates)

    def test_request_separates_target_confirmation_from_changes(self):
        """Require a valid immutable identity confirmation without opening account fields for writes."""
        for payload in [
            {"changes": {"first_name": "name"}},
            {"expected_owner_email": None, "changes": {"first_name": "name"}},
            {"expected_owner_email": "invalid", "changes": {"first_name": "name"}},
            {"expected_owner_email": "person2@example.com", "changes": {}},
            {"expected_owner_email": "person2@example.com", "changes": {"owner_email": "other@example.com"}},
        ]:
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                BodyManagementSitePatchRequest.model_validate(payload)
        request = BodyManagementSitePatchRequest.model_validate(
            {
                "expected_owner_email": "person2@example.com",
                "changes": {"first_name": "name"},
                "expected": {"first_name": "original"},
            }
        )
        self.assertEqual(request.expected_owner_email, "person2@example.com")
        self.assertEqual(request.changes.orm_changes(), {PortfolioSiteLocale.first_name: "name"})


# ■—< TEST >——————————————————————————————————————————————————————————————————————————■ Platform - HTTP / Transaction
class PlatformPatchTests(IsolatedAsyncioTestCase):
    """
    Use a temporary database and a loaded server-session stub; authorization still reads real roles/accounts.

    Only connection selection and cache invalidation are replaced. No configured database,
    Redis service or SMTP server is contacted, and every test starts with fresh fixtures.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    postgres_url = None

    async def asyncSetUp(self):
        """Create real constraints and seed separate account/site IDs plus two content languages."""
        self.directory = tempfile.TemporaryDirectory()
        self.schema = f"platform_patch_{uuid4().hex}"
        if self.postgres_url:
            self.engine = create_async_engine(
                self.postgres_url, connect_args={"server_settings": {"search_path": self.schema}}
            )
        else:
            self.engine = create_async_engine(f"sqlite+aiosqlite:///{self.directory.name}/platform.sqlite")

            @event.listens_for(self.engine.sync_engine, "connect")
            def enable_foreign_keys(connection, _):
                connection.execute("PRAGMA foreign_keys=ON")

        async with self.engine.begin() as connection:
            if self.postgres_url:
                await connection.execute(CreateSchema(self.schema))
            await connection.run_sync(BASE.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.sessions.begin() as session:
            session.add_all(
                [
                    AuthRole(id=1, role="manager", is_manage_sites=True),
                    AuthRole(id=2, role="viewer", is_manage_sites=False),
                ]
            )
            await session.flush()
            password = "$argon2id$v=19$m=65536,t=3,p=4$" + "a" * 22 + "$" + "b" * 43
            session.add_all(
                [
                    AuthUser(
                        user=f"person{number}",
                        email=f"person{number}@example.com",
                        password=password,
                        role_id=1 if number == 1 else 2,
                        is_active=number != 5,
                    )
                    for number in range(1, 6)
                ]
            )
            session.add_all(
                [
                    PortfolioLocale(code=EnumLocal.EN, name="English"),
                    PortfolioLocale(code=EnumLocal.ZH_HANT, name="繁體中文"),
                    PortfolioLocale(code=EnumLocal.ZH_HANS, name="简体中文"),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    PortfolioSite(
                        id=site_id,
                        user_id=owner,
                        is_published=published,
                        is_default=default,
                        copyright_year=2025,
                        chat_icon=SITE_CHAT_ICONS[1],
                    )
                    for site_id, owner, published, default in [
                        (11, 2, True, True),
                        (12, 3, True, False),
                        (13, 5, False, False),
                    ]
                ]
            )
            await session.flush()
            for site_id, locale in [
                (11, EnumLocal.EN),
                (11, EnumLocal.ZH_HANT),
                (12, EnumLocal.EN),
                (13, EnumLocal.EN),
            ]:
                await session.execute(
                    insert(PortfolioSiteLocale).values(
                        {
                            **dict.fromkeys(SITE_LOCALE_COLUMNS, "original"),
                            PortfolioSiteLocale.site_id: site_id,
                            PortfolioSiteLocale.locale: locale,
                            PortfolioSiteLocale.first_name: f"name-{locale}",
                        }
                    )
                )
        self.identity = {"id": 1, "is_manage_sites": True}
        app = FastAPI()

        @app.middleware("http")
        async def loaded_session(request, call_next):
            request.scope["session"] = self.identity.copy()
            # This fixture issues a loaded server identity; real-cookie tests exercise proof persistence/revocation.
            from APPs.Auth.module.module_auth import AuthModule
            from SYSTEM.constants import AUTH_SESSION_IDENTITY_KEY

            async with self.sessions() as session:
                actor = await session.get(AuthUser, self.identity.get("id")) if self.identity.get("id") else None
                if actor is not None:
                    request.scope["session"][AUTH_SESSION_IDENTITY_KEY] = AuthModule.session_identity(
                        actor.id, actor.password
                    )
            request.scope["session_handler"] = SimpleNamespace(is_loaded=True)
            return await call_next(request)

        app.include_router(router)
        app.include_router(public_portfolio_router)
        self.app = app
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
        self.database_patch = patch.object(CONN_MANAGER, "get_db", side_effect=self.sessions)
        self.database_patch.start()
        self.cache_patch = patch.object(PortfolioManagementModule, "invalidate_cache", new_callable=AsyncMock)
        self.invalidate_cache = self.cache_patch.start()
        self.addCleanup(self.database_patch.stop)
        self.addCleanup(self.cache_patch.stop)

    async def asyncTearDown(self):
        """Close all isolated resources after the request/task work finishes."""
        await self.client.aclose()
        if self.postgres_url:
            async with self.engine.begin() as connection:
                await connection.execute(DropSchema(self.schema, cascade=True))
        await self.engine.dispose()
        self.directory.cleanup()

    async def patch_site(self, path, *, expected_owner_email=None, **kwargs):
        """Build the identity-confirmed request envelope; raw content cases bypass JSON wrapping."""
        if "json" in kwargs:
            target = urlsplit(path).path.rsplit("/", 1)[-1]
            from urllib.parse import parse_qs

            locale = (kwargs.get("params") or {}).get("locale", parse_qs(urlsplit(path).query).get("locale", ["en"])[0])
            from APPs.Management.constants import (
                SITE_ACCOUNT_PATCH_COLUMNS,
                SITE_PATCH_COLUMNS,
                SITE_TRANSLATION_PATCH_COLUMNS,
            )

            bindings = {**SITE_ACCOUNT_PATCH_COLUMNS, **SITE_PATCH_COLUMNS, **SITE_TRANSLATION_PATCH_COLUMNS}
            stmt = (
                select(*(column.label(field) for field, column in bindings.items()))
                .select_from(AuthUser)
                .outerjoin(PortfolioSite, PortfolioSite.user_id == AuthUser.id)
                .outerjoin(
                    PortfolioSiteLocale,
                    (PortfolioSiteLocale.site_id == PortfolioSite.id) & (PortfolioSiteLocale.locale == locale),
                )
            )
            async with self.sessions() as session:
                original = (
                    (
                        await session.execute(
                            stmt.where(
                                AuthUser.id == int(target)
                                if target.isdecimal() and 1 <= int(target) <= 2147483647
                                else AuthUser.id == 2
                            )
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
            changes = kwargs["json"]
            kwargs["json"] = {
                "expected_owner_email": expected_owner_email
                or f"person{target if target.isdecimal() else '2'}@example.com",
                "changes": changes,
                "expected": {field: original.get(field) if original else value for field, value in changes.items()},
            }
        return await self.client.patch(path, **kwargs)

    async def snapshot(self):
        """Compare full stored state using ORM-keyed mappings; HTTP assertions retain independent wire names."""
        groups = (
            (
                AuthUser.id,
                AuthUser.user,
                AuthUser.email,
                AuthUser.password,
                AuthUser.role_id,
                AuthUser.is_active,
                AuthUser.createtime,
                AuthUser.updatetime,
            ),
            (
                PortfolioSite.id,
                PortfolioSite.user_id,
                PortfolioSite.is_published,
                PortfolioSite.is_default,
                PortfolioSite.copyright_year,
                PortfolioSite.linkedin,
                PortfolioSite.github,
                PortfolioSite.medium,
                PortfolioSite.email,
                PortfolioSite.chat_icon,
            ),
            (
                PortfolioSiteLocale.id,
                PortfolioSiteLocale.site_id,
                PortfolioSiteLocale.locale,
                *SITE_LOCALE_COLUMNS,
                PortfolioSiteLocale.content_blocks,
            ),
        )
        async with self.sessions() as session:
            return [
                [
                    {column: row[column] for column in columns}
                    for row in (await session.execute(select(*columns).order_by(columns[0]))).mappings()
                ]
                for columns in groups
            ]

    async def seed_inactive_language_content(self):
        """Populate every localized content family in a disabled language using real ORM constraints."""
        async with self.sessions.begin() as session:
            await session.execute(
                update(PortfolioLocale)
                .where(PortfolioLocale.code == EnumLocal.ZH_HANT)
                .values({PortfolioLocale.is_active: False})
            )
            session.add_all(
                [
                    PortfolioCareer(
                        id=101,
                        site_id=11,
                        journey_position=0,
                        experience_order=1.0,
                        country_code="GBR",
                        latitude=51.5,
                        longitude=-0.1,
                        type="work",
                        start_month=date(2020, 1, 1),
                    ),
                    PortfolioProject(id=201, site_id=11, position=0, start_month=date(2020, 1, 1)),
                    PortfolioSkill(site_id=11, id="python", label_key="skill.python"),
                    PortfolioSkillCategory(site_id=11, id="engineering", label_key="category.engineering", position=0),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    PortfolioCareerLocale(
                        career_id=101,
                        locale=EnumLocal.ZH_HANT,
                        country_name="英國",
                        city="倫敦",
                        organization_name="Example",
                        organization_code="EX",
                        organization_title="工程師",
                        content="停用語言的內容",
                        skills=["Python"],
                    ),
                    PortfolioProjectLocale(
                        project_id=201,
                        locale=EnumLocal.ZH_HANT,
                        organization_name="Example",
                        organization_code="EX",
                        organization_title="工程師",
                        project_name="作品",
                        project_title="工具",
                        intro="停用語言的專案",
                        skills=["Python"],
                        detail_kind="null",
                    ),
                    PortfolioSkillLocale(site_id=11, skill_id="python", locale=EnumLocal.ZH_HANT, label="Python"),
                    PortfolioSkillCategoryLocale(
                        site_id=11, category_id="engineering", locale=EnumLocal.ZH_HANT, label="工程"
                    ),
                    PortfolioCategorySkill(site_id=11, category_id="engineering", skill_id="python", position=0),
                ]
            )

    async def test_confirmation_must_match_the_same_account_and_never_changes_login_email(self):
        """A valid email for a different ID still fails; confirmation never becomes a writable account field."""
        before = await self.snapshot()
        response = await self.patch_site(
            "/management/sites/2", expected_owner_email="person3@example.com", json={"first_name": "wrong target"}
        )
        self.assertEqual(response.status_code, 404, response.text)
        for confirmation in [None, 123, "invalid", "person2@example.com\r\nBcc:other@example.com"]:
            response = await self.client.patch(
                "/management/sites/2",
                json={
                    "expected_owner_email": confirmation,
                    "changes": {"first_name": "changed"},
                },
            )
            self.assertEqual(response.status_code, 422, response.text)
        response = await self.client.patch("/management/sites/2", json={"changes": {"first_name": "changed"}})
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()
        response = await self.patch_site("/management/sites/2", json={"first_name": "confirmed"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["owner_email"], "person2@example.com")
        self.assertEqual(before[0], (await self.snapshot())[0])

    async def test_default_owner_activation_is_protected_until_default_changes(self):
        """Reject implicit Default removal, then allow activation edits after the homepage moves."""
        before = await self.snapshot()
        for changes in [
            {"owner_is_active": False},
            {"owner_is_active": False, "first_name": "must roll back"},
            {"owner_is_active": False, "is_published": False},
        ]:
            response = await self.patch_site("/management/sites/2", json=changes)
            self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(response.json()["detail"], "DEFAULT_SITE_DEACTIVATE_FORBIDDEN")
            self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()
        response = await self.patch_site("/management/sites/3", json={"is_default": True})
        self.assertEqual(response.status_code, 200, response.text)
        response = await self.patch_site("/management/sites/2", json={"owner_is_active": False})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["owner_is_active"])
        self.assertFalse(response.json()["is_default"])
        self.assertTrue(response.json()["is_published"])
        self.assertEqual((await self.client.get("/portfolio/site", params={"site_id": 11})).status_code, 404)
        after = await self.snapshot()
        for original, current in zip(before[0], after[0]):
            for column in original:
                if column not in {AuthUser.is_active, AuthUser.updatetime}:
                    self.assertEqual(original[column], current[column])
        response = await self.patch_site("/management/sites/2", json={"owner_is_active": True})
        self.assertTrue(response.json()["owner_is_active"])
        self.assertFalse(response.json()["is_default"])
        restored = await self.snapshot()
        await self.patch_site("/management/sites/2", json={"owner_is_active": True})
        self.assertEqual(restored, await self.snapshot())

    async def test_explicit_default_removal_and_deactivation_share_one_transaction(self):
        """A full draft may explicitly clear Default before disabling; Active alone never clears it."""
        response = await self.patch_site("/management/sites/2", json={"is_default": False, "owner_is_active": False})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["owner_is_active"])
        self.assertFalse(response.json()["is_default"])

    async def test_activation_without_site_and_self_deactivation(self):
        """Activation applies to every account row; disabling the actor removes access on the next request."""
        response = await self.patch_site("/management/sites/4", json={"owner_is_active": False})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["owner_is_active"])
        self.assertIsNone(response.json()["site_id"])
        self.assertFalse(response.json()["has_site"])
        response = await self.patch_site("/management/sites/1", json={"owner_is_active": False})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((await self.client.get("/management/sites")).status_code, 401)

    async def test_final_activation_and_default_are_validated_together(self):
        """Conflicting fields roll back; a disabled owner can be reactivated and selected in one transaction."""
        before = await self.snapshot()
        response = await self.patch_site("/management/sites/2", json={"owner_is_active": False, "is_default": True})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"], "DEFAULT_SITE_REQUIRES_ACTIVE_PUBLISHED")
        self.assertEqual(before, await self.snapshot())
        response = await self.patch_site(
            "/management/sites/5", json={"owner_is_active": True, "is_published": True, "is_default": True}
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["owner_is_active"])
        self.assertTrue(response.json()["is_default"])
        async with self.sessions() as session:
            defaults = (await session.execute(select(PortfolioSite.id).where(PortfolioSite.is_default))).scalars().all()
        self.assertEqual(defaults, [13])

    async def test_concurrent_activation_and_default_cannot_leave_inactive_homepage(self):
        """The same publication lock serializes activation with global homepage replacement."""
        responses = await asyncio.gather(
            self.patch_site("/management/sites/3", json={"owner_is_active": False}),
            self.patch_site("/management/sites/3", json={"is_default": True}),
        )
        self.assertIn(responses[0].status_code, (200, 409), responses[0].text)
        self.assertIn(responses[1].status_code, (200, 409), responses[1].text)
        async with self.sessions() as session:
            invalid = (
                (
                    await session.execute(
                        select(PortfolioSite.id)
                        .join(AuthUser, AuthUser.id == PortfolioSite.user_id)
                        .where(PortfolioSite.is_default, AuthUser.is_active.is_(False))
                    )
                )
                .scalars()
                .all()
            )
        self.assertEqual(invalid, [])

    async def test_inactive_target_owner_is_visible_editable_and_previewable(self):
        """Target activation does not filter management; inactive actors and public visibility remain guarded."""
        listed = await self.client.get("/management/sites")
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertFalse(next(item for item in listed.json()["items"] if item["id"] == 5)["owner_is_active"])
        response = await self.patch_site("/management/sites/5", json={"first_name": "repaired"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["owner_is_active"])
        preview = await self.client.get("/management/preview/site", params={"site_id": 13})
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(preview.json()["profile"]["firstName"], "repaired")
        public = await self.client.get("/portfolio/site", params={"site_id": 13})
        self.assertEqual(public.status_code, 404, public.text)
        self.identity = {"id": 5}
        denied = await self.client.get("/management/preview/site", params={"site_id": 13})
        self.assertEqual(denied.status_code, 401, denied.text)

    async def test_inactive_language_is_visible_in_all_previews_but_hidden_publicly(self):
        """Management profile/preview paths include disabled language rows; public reads cannot opt out."""
        await self.seed_inactive_language_content()
        listed = await self.client.get("/management/sites", params={"locale": "zh-Hant"})
        self.assertEqual(listed.status_code, 200, listed.text)
        target = next(item for item in listed.json()["items"] if item["id"] == 2)
        self.assertTrue(target["has_profile"])
        self.assertTrue(target["has_translation"])
        for resource in ["site", "journey", "experiences", "projects", "skill-categories", "skills"]:
            params = {"site_id": 11, "locale": "zh-Hant"}
            if resource == "skills":
                params.update(ownerType="category", ownerId="engineering")
            with self.subTest(resource=resource):
                preview = await self.client.get(f"/management/preview/{resource}", params=params)
                self.assertEqual(preview.status_code, 200, preview.text)
                if resource == "journey":
                    self.assertEqual(len(preview.json()), 1)
                elif resource != "site":
                    self.assertEqual(preview.json()["total"], 1)
                    if resource == "skill-categories":
                        self.assertEqual(preview.json()["items"][0]["skills"]["total"], 1)
                public = await self.client.get(f"/portfolio/{resource}", params={**params, "include_inactive": "true"})
                self.assertEqual(public.status_code, 404, public.text)
        # Public visibility dependencies reject inactive languages before even optional cache access.
        cached = await self.client.get(
            "/portfolio/site", params={"site_id": 11, "locale": "zh-Hant", "is_caching": "true"}
        )
        self.assertEqual(cached.status_code, 404, cached.text)
        # Preview does not mutate policy on a reusable module instance.
        module = PortfolioSiteModule(locale=EnumLocal.ZH_HANT, site_id=11)
        await module.preview()
        with self.assertRaises(HTTPException) as caught:
            await module.select()
        self.assertEqual(caught.exception.status_code, 404)
        async with self.sessions.begin() as session:
            await session.execute(
                update(PortfolioLocale)
                .where(PortfolioLocale.code == EnumLocal.ZH_HANT)
                .values({PortfolioLocale.is_active: True})
            )
        for resource in ["site", "journey", "experiences", "projects", "skill-categories", "skills"]:
            params = {"site_id": 11, "locale": "zh-Hant"}
            if resource == "skills":
                params.update(ownerType="category", ownerId="engineering")
            public = await self.client.get(f"/portfolio/{resource}", params=params)
            self.assertEqual(public.status_code, 200, public.text)

    async def test_inactive_content_preview_still_requires_current_management_permission(self):
        """Knowing IDs, email or inactive state never authorizes a non-manager's preview request."""
        await self.seed_inactive_language_content()
        self.identity = {"id": 2, "is_manage_sites": True}
        for resource in ["site", "journey", "experiences", "projects", "skill-categories", "skills"]:
            params = {"site_id": 11, "locale": "zh-Hant", "ownerType": "category", "ownerId": "engineering"}
            response = await self.client.get(f"/management/preview/{resource}", params=params)
            self.assertEqual(response.status_code, 403, response.text)

    async def test_updates_only_requested_fields_and_language(self):
        """Patch one translation and shared settings without changing verified identity or timestamps."""
        before = await self.snapshot()
        response = await self.patch_site(
            "/management/sites/2?locale=zh-Hant",
            json={
                "first_name": "鄭",
                "github": "https://github.com/example",
                "email": "contact@example.com",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        row = response.json()
        self.assertEqual((row["id"], row["site_id"], row["first_name"]), (2, 11, "鄭"))
        self.assertEqual(row["family_name"], "original")
        self.assertEqual(row["owner_email"], "person2@example.com")
        self.assertEqual(row["email"], "contact@example.com")
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertEqual(response.headers["vary"], "Cookie")
        after = await self.snapshot()
        self.assertEqual(before[0], after[0])
        english = next(
            item
            for item in after[2]
            if item[PortfolioSiteLocale.site_id] == 11 and item[PortfolioSiteLocale.locale] == EnumLocal.EN
        )
        self.assertEqual(english[PortfolioSiteLocale.first_name], "name-en")
        self.invalidate_cache.assert_awaited_once()
        listed = await self.client.get("/management/sites?locale=zh-Hant")
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(next(item for item in listed.json()["items"] if item["id"] == 2), row)

    async def test_readonly_and_malformed_requests_never_write_or_echo_input(self):
        """An invalid patch containing mutable fields still fails before any write."""
        before = await self.snapshot()
        for payload in [
            {"owner_email": "secret@example.com", "first_name": "changed"},
            {"site_id": 12},
            {"locale": "en"},
            {"owner_is_active": "false"},
            {"is_published": "false"},
            {"copyright_year": True},
            {"first_name": None},
            {},
            {"chat_icon": "../secret.svg"},
            {"github": "javascript:secret"},
            {"unknown": "secret-value"},
        ]:
            with self.subTest(payload=payload):
                response = await self.patch_site("/management/sites/2", json=payload)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertNotIn('"input"', response.text)
                self.assertNotIn("secret@example.com", response.text)
                self.assertNotIn("secret-value", response.text)
                self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()

    async def test_rejects_invalid_json_and_query_selectors(self):
        """Reject duplicate keys, non-finite numbers, malformed encoding and ambiguous selectors."""
        for body in [
            b'{"first_name":"a","first_name":"b"}',
            b'{"copyright_year":NaN}',
            b'{"copyright_year":Infinity}',
            b"{",
            b"\xff",
        ]:
            response = await self.patch_site(
                "/management/sites/2", content=body, headers={"Content-Type": "application/json"}
            )
            self.assertEqual(response.status_code, 400, response.text)
        response = await self.patch_site(
            "/management/sites/2",
            content=b'{"expected_owner_email":"person2@example.com","changes":{"first_name":"\\ud800"}}',
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(response.status_code, 422, response.text)
        for target in ["0", "-1", "2147483648", "abc", "2?locale=en&locale=zh-Hant", "2?site_id=12", "2?page=1"]:
            response = await self.patch_site(f"/management/sites/{target}", json={"first_name": "changed"})
            self.assertEqual(response.status_code, 400, response.text)
        response = await self.patch_site("/management/sites/2?locale=fr", json={"first_name": "changed"})
        self.assertEqual(response.status_code, 400, response.text)
        self.invalidate_cache.assert_not_awaited()

    async def test_bounds_transport_and_rejects_cross_origin_writes(self):
        """Enforce stream size without trusting Content-Length and guard browser-origin writes."""
        response = await self.patch_site("/management/sites/2", content='{"first_name":"x"}')
        self.assertEqual(response.status_code, 415)
        response = await self.patch_site(
            "/management/sites/2", json={"first_name": "x"}, headers={"Content-Encoding": "gzip"}
        )
        self.assertEqual(response.status_code, 415)

        async def oversized_stream():
            yield b'{"chat_content":"'
            for _ in range(5):
                yield b"x" * (SITE_PATCH_MAX_BYTES // 4)
            yield b'"}'

        response = await self.patch_site(
            "/management/sites/2", content=oversized_stream(), headers={"Content-Type": "application/json"}
        )
        self.assertEqual(response.status_code, 413)
        response = await self.patch_site(
            "/management/sites/2", json={"first_name": "x"}, headers={"Origin": "https://evil.example"}
        )
        self.assertEqual(response.status_code, 403)
        response = await self.patch_site(
            "/management/sites/2", json={"first_name": "x"}, headers={"Origin": "http://testserver"}
        )
        self.assertEqual(response.status_code, 200, response.text)
        response = await self.patch_site(
            "/management/sites/2", json={"first_name": "x"}, headers={"Origin": "http://127.0.0.1:5173"}
        )
        self.assertEqual(response.status_code, 200, response.text)

    async def test_current_database_permission_overrides_stale_session_flags(self):
        """A stored site-management grant is required; ownership or content-update rights cannot substitute."""
        self.identity = {"id": 2, "is_manage_sites": True}
        response = await self.patch_site("/management/sites/2", json={"first_name": "changed"})
        self.assertEqual(response.status_code, 403)
        self.identity = {"id": 1, "is_manage_sites": True}
        async with self.sessions.begin() as session:
            await session.execute(
                update(AuthRole)
                .where(AuthRole.id == 1)
                .values({AuthRole.is_manage_sites: False, AuthRole.is_update: True})
            )
        response = await self.patch_site("/management/sites/2", json={"first_name": "changed"})
        self.assertEqual(response.status_code, 403)
        self.identity = {}
        response = await self.patch_site("/management/sites/2", json={"first_name": "changed"})
        self.assertEqual(response.status_code, 401)
        self.identity = {"id": 5, "is_manage_sites": True}
        response = await self.patch_site("/management/sites/2", json={"first_name": "changed"})
        self.assertEqual(response.status_code, 401)
        self.invalidate_cache.assert_not_awaited()

    async def test_missing_records_do_not_create_data_or_partially_update_settings(self):
        """Only translation edits require the selected translation; missing rows never trigger inserts."""
        before = await self.snapshot()
        for target, payload in [
            ("999", {"github": ""}),
            ("4", {"github": ""}),
            ("3?locale=zh-Hant", {"github": "https://example.com", "first_name": "changed"}),
        ]:
            response = await self.patch_site(f"/management/sites/{target}", json=payload)
            self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(before, await self.snapshot())
        response = await self.patch_site("/management/sites/3?locale=zh-Hant", json={"github": ""})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["has_translation"])

    async def test_inactive_translation_can_be_updated_in_management(self):
        """Management can repair soft-deleted language content without reactivating it."""
        async with self.sessions.begin() as session:
            await session.execute(
                update(PortfolioLocale)
                .where(PortfolioLocale.code == EnumLocal.ZH_HANT)
                .values({PortfolioLocale.is_active: False})
            )
        response = await self.patch_site("/management/sites/2?locale=zh-Hant", json={"first_name": "changed"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["first_name"], "changed")
        async with self.sessions() as session:
            self.assertFalse(
                await session.scalar(select(PortfolioLocale.is_active).where(PortfolioLocale.code == EnumLocal.ZH_HANT))
            )

    async def test_other_management_queries_keep_wire_names_filters_and_sorting(self):
        """Role/user/history queries retain their public contract after replacing dynamic ORM lookup."""
        async with self.sessions.begin() as session:
            await session.execute(
                update(AuthRole)
                .where(AuthRole.id == 1)
                .values(
                    {
                        AuthRole.is_manage_users: True,
                        AuthRole.is_manage_roles: True,
                    }
                )
            )
        roles = await self.client.get(
            "/management/roles",
            params={
                "sort": "role:asc",
                "filters": json.dumps([{"field": "role", "operator": "equals", "value": "viewer"}]),
            },
        )
        self.assertEqual(roles.status_code, 200, roles.text)
        self.assertEqual(roles.json()["items"][0]["role"], "viewer")
        self.assertEqual(roles.json()["items"][0]["user_count"], 4)
        users = await self.client.get(
            "/management/users",
            params={
                "sort": "email:desc",
                "search": "person3",
                "search_fields": json.dumps(["email"]),
            },
        )
        self.assertEqual(users.status_code, 200, users.text)
        self.assertEqual(users.json()["items"][0]["id"], 3)
        self.assertEqual(users.json()["items"][0]["role"], "viewer")
        history = await self.client.get("/management/login-records", params={"user_id": "3"})
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual(history.json()["items"], [])
        # Soft-deleted target roles/accounts remain visible to the active authorized operator.
        async with self.sessions.begin() as session:
            await session.execute(update(AuthRole).where(AuthRole.id == 2).values({AuthRole.is_active: False}))
            await session.execute(update(AuthUser).where(AuthUser.id == 2).values({AuthUser.is_active: False}))
        roles = await self.client.get("/management/roles")
        users = await self.client.get("/management/users")
        self.assertEqual(roles.status_code, 200, roles.text)
        self.assertEqual(users.status_code, 200, users.text)
        self.assertFalse(next(row for row in roles.json()["items"] if row["id"] == 2)["is_active"])
        target = next(row for row in users.json()["items"] if row["id"] == 2)
        self.assertFalse(target["is_active"])
        self.assertFalse(target["role_is_active"])

    async def test_projected_locale_filters_keep_an_explicit_database_type(self):
        """Negative filters on the selected language must work in PostgreSQL as well as SQLite.

        ♂ ZhengLee 2026.10.16
        """
        async with self.sessions() as session:
            account_count = len((await session.scalars(select(AuthUser.id))).all())
        for locale in EnumLocal:
            for operator, expected in (("equals", account_count), ("not_equals", 0)):
                with self.subTest(locale=locale, operator=operator):
                    response = await self.client.get(
                        "/management/sites",
                        params={
                            "locale": locale,
                            "filters": json.dumps([{"field": "locale", "operator": operator, "value": locale}]),
                        },
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json()["total"], expected)
            # The selected language belongs to the owner projection even when its content is missing.
            response = await self.client.get(
                "/management/sites",
                params={"locale": locale, "search": locale, "search_fields": json.dumps(["locale"])},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["total"], account_count)

    async def test_registration_permission_projection_still_uses_the_default_role(self):
        """Exercise the shared Auth projection with real storage while replacing proof/session transport only."""
        async with self.sessions.begin() as session:
            await session.execute(update(AuthRole).values({AuthRole.is_default: False}))
            await session.execute(update(AuthRole).where(AuthRole.id == 2).values({AuthRole.is_default: True}))
        module = AuthRegisterModule(
            Request({"type": "http", "session": {}}), "new-person@example.com", "test-password-only", user="new-person"
        )
        with (
            patch.object(module, "_load_session", new_callable=AsyncMock),
            patch.object(module, "_challenge_id", return_value="isolated-test-challenge"),
            patch.object(module, "_verified_challenge", new_callable=AsyncMock),
            patch.object(module, "_claim_challenge", new_callable=AsyncMock, return_value=True),
            patch.object(module, "_complete_challenge", new_callable=AsyncMock),
            patch.object(module, "_start_session", new_callable=AsyncMock),
        ):
            result = await module.register()
        self.assertEqual(result["role"], "viewer")
        self.assertFalse(result["is_manage_sites"])
        self.assertEqual(result["email"], "new-person@example.com")
        async with self.sessions() as session:
            account = await session.scalar(select(AuthUser).where(AuthUser.email == "new-person@example.com"))
            self.assertEqual(account.role_id, 2)

    async def test_default_switch_unpublish_and_repeated_updates(self):
        """Switch the global default atomically, preserve idempotence and clear Default on unpublish."""
        response = await self.patch_site("/management/sites/3", json={"is_default": True})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["is_default"])
        response = await self.patch_site("/management/sites/3", json={"is_default": True})
        self.assertEqual(response.status_code, 200, response.text)
        rows = (await self.snapshot())[1]
        self.assertEqual([row[PortfolioSite.id] for row in rows if row[PortfolioSite.is_default]], [12])
        response = await self.patch_site("/management/sites/3", json={"is_published": False, "github": ""})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["is_default"])
        self.assertFalse(response.json()["is_published"])
        self.assertEqual(response.json()["github"], "")
        response = await self.patch_site("/management/sites/3", json={"is_published": True, "is_default": True})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["is_default"])
        self.assertTrue(response.json()["is_published"])

    async def test_default_conflicts_roll_back(self):
        """Reject draft or inactive-owner defaults and contradictory assignments without clearing the old default."""
        before = await self.snapshot()
        for target, payload in [
            ("5", {"is_default": True}),
            ("5", {"is_default": True, "is_published": True}),
            ("3", {"is_default": True, "is_published": False, "first_name": "changed"}),
        ]:
            response = await self.patch_site(f"/management/sites/{target}", json=payload)
            self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()

    async def test_database_failure_rolls_back_old_default_and_all_fields(self):
        """Fail after both Default writes, proving that the complete transaction restores the old state."""
        async with self.engine.begin() as connection:
            if self.postgres_url:
                await connection.execute(
                    text(
                        "CREATE FUNCTION reject_translation() RETURNS trigger LANGUAGE plpgsql AS $$ "
                        "BEGIN IF NEW.brand_title = '__fail__' THEN "
                        "RAISE EXCEPTION 'private database detail' USING ERRCODE = '23514'; "
                        "END IF; RETURN NEW; END; $$"
                    )
                )
                await connection.execute(
                    text(
                        "CREATE TRIGGER reject_translation BEFORE UPDATE ON portfolio_site_locale "
                        "FOR EACH ROW EXECUTE FUNCTION reject_translation()"
                    )
                )
            else:
                await connection.execute(
                    text(
                        "CREATE TRIGGER reject_translation BEFORE UPDATE ON portfolio_site_locale "
                        "WHEN NEW.brand_title = '__fail__' BEGIN SELECT RAISE(ABORT, 'private database detail'); END"
                    )
                )
        async with self.sessions.begin() as session:
            await session.execute(update(AuthUser).where(AuthUser.id == 3).values({AuthUser.is_active: False}))
        before = await self.snapshot()
        response = await self.patch_site(
            "/management/sites/3", json={"owner_is_active": True, "is_default": True, "brand_title": "__fail__"}
        )
        self.assertEqual(response.status_code, 409, response.text)
        self.assertNotIn("private database detail", response.text)
        self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()

    async def test_cache_invalidation_runs_after_commit_and_reports_committed_failure(self):
        """Cache failure cannot be described as a rollback once another connection sees committed content."""

        async def failed_cache():
            async with self.sessions() as session:
                name = await session.scalar(
                    select(PortfolioSiteLocale.first_name).where(
                        PortfolioSiteLocale.site_id == 11, PortfolioSiteLocale.locale == EnumLocal.EN
                    )
                )
                self.assertEqual(name, "committed")
            raise HTTPException(status_code=503, detail="private cache detail")

        self.invalidate_cache.side_effect = failed_cache
        response = await self.patch_site("/management/sites/2", json={"first_name": "committed"})
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(response.headers["x-management-update-state"], "committed")
        self.assertEqual(response.json()["detail"], "MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE")
        self.assertNotIn("private cache detail", response.text)

    async def test_concurrent_defaults_leave_exactly_one_default(self):
        """Independent writer transactions serialize before reading final publication state."""
        responses = await asyncio.gather(
            self.patch_site("/management/sites/2", json={"is_default": True}),
            self.patch_site("/management/sites/3", json={"is_default": True}),
        )
        for response in responses:
            self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(sum(row[PortfolioSite.is_default] for row in (await self.snapshot())[1]), 1)

    async def test_module_revalidates_direct_assignments(self):
        """An internal caller cannot bypass the field allowlist or strict scalar validation."""
        module = ManagementSitesModule(session=self.sessions())
        for payload in [{"owner_email": "changed@example.com"}, {"is_default": "true"}, {"first_name": None}, []]:
            with self.assertRaises(HTTPException) as caught:
                await module.update(2, payload, expected_owner_email="person2@example.com")
            self.assertEqual(caught.exception.status_code, 422)

    async def test_storage_error_is_sanitized_and_rolls_back(self):
        """A readback/storage failure rolls back earlier writes and never exposes driver credentials."""
        before = await self.snapshot()
        with patch.object(ManagementSitesModule, "_query", side_effect=RuntimeError("private driver password")):
            response = await self.patch_site("/management/sites/2", json={"first_name": "must roll back"})
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(response.json()["detail"], "MANAGEMENT_DATABASE_UNAVAILABLE")
        self.assertNotIn("private driver password", response.text)
        self.assertEqual(before, await self.snapshot())
        self.invalidate_cache.assert_not_awaited()

    async def test_content_is_bound_as_plain_text(self):
        """SQL-like and HTML-like copy is stored as data without changing any account or schema."""
        value = "'; DROP TABLE auth_user; -- <script>alert('text')</script>"
        before = (await self.snapshot())[0]
        response = await self.patch_site("/management/sites/2", json={"profile_content": value})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["profile_content"], value)
        self.assertEqual((await self.snapshot())[0], before)

    async def test_concurrent_content_and_default_updates_preserve_both(self):
        """Different sites sharing a language can update content while the global default moves."""
        responses = await asyncio.gather(
            self.patch_site("/management/sites/2", json={"first_name": "old default content"}),
            self.patch_site("/management/sites/3", json={"first_name": "new default content", "is_default": True}),
        )
        for response in responses:
            self.assertEqual(response.status_code, 200, response.text)
        snapshot = await self.snapshot()
        self.assertEqual([row[PortfolioSite.id] for row in snapshot[1] if row[PortfolioSite.is_default]], [12])
        self.assertEqual(
            {
                row[PortfolioSiteLocale.site_id]: row[PortfolioSiteLocale.first_name]
                for row in snapshot[2]
                if row[PortfolioSiteLocale.locale] == EnumLocal.EN and row[PortfolioSiteLocale.site_id] in (11, 12)
            },
            {11: "old default content", 12: "new default content"},
        )

    def test_openapi_exposes_patch_on_original_resource_and_nonnullable_fields(self):
        """Keep GET and PATCH together with an explicit strict request schema."""
        schema = self.app.openapi()
        self.assertIn("get", schema["paths"]["/management/sites"])
        self.assertIn("patch", schema["paths"]["/management/sites/{account_id}"])
        body = schema["components"]["schemas"]["BodyManagementSitePatch"]
        self.assertFalse(body["additionalProperties"])
        self.assertEqual(body["properties"]["is_default"]["type"], "boolean")
        self.assertNotIn("owner_email", body["properties"])
        envelope = schema["components"]["schemas"]["BodyManagementSitePatchRequest"]
        self.assertEqual(set(envelope["required"]), {"expected_owner_email", "changes", "expected"})


# ■—< TEST >——————————————————————————————————————————————————————————————————————————■ Platform - Optional PostgreSQL
@skipUnless(
    os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL"), "Set a disposable PostgreSQL test URL to run this suite."
)
class PostgreSQLPlatformPatchTests(PlatformPatchTests):
    """
    Repeat HTTP and transaction checks in a unique PostgreSQL schema removed after each test.

    Supply only a disposable test database; the configured application database is never selected.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    postgres_url = os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL")


if __name__ == "__main__":
    import unittest

    unittest.main()
