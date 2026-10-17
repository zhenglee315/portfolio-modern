# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import (
    SITE_ACCOUNT_PATCH_COLUMNS,
    SITE_COLUMNS,
    SITE_LOCALE_COLUMNS,
    SITE_PATCH_COLUMNS,
    SITE_OWNER_COLUMNS,
    SITE_TRANSLATION_PATCH_COLUMNS,
    EnumManagementField,
    EnumManagementError,
)
from APPs.Management.schema.body import (
    BodyManagementSitePatch,
    BodyManagementSiteBulkDelete,
)
from .module_state import ManagementWriteState
from APPs.Auth.schema.body import validate_auth_email
from APPs.Management.schema.resp import (
    RespManagementSite,
    RespManagementSiteDeletion,
)
from .module_base import ManagementListModule, HAN_NAME_PATTERN

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy.tools_column_filters import trim_column_text

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import EnumLocal
from SYSTEM.models import (
    AuthRole,
    AuthUser,
    PortfolioCareer,
    PortfolioCareerLocale,
    PortfolioLocale,
    PortfolioSite,
    PortfolioSiteLocale,
)

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import Select, and_, case, func, literal, select, update, delete
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import ValidationError


class ManagementSitesModule(ManagementListModule):
    """
    Read and update person-based platform settings within the same resource module.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    def __init__(
        self,
        page: int = 1,
        size: int = 6,
        filters: tuple[dict, ...] = (),
        sort: tuple[tuple[str, str], ...] = (),
        locale: EnumLocal = EnumLocal.EN,
        search: dict | None = None,
        *,
        session: AsyncSession | None = None,
    ) -> None:
        """Restrict joined profile fields and derived names to one requested language."""
        super().__init__(page, size, filters, sort, search, session=session)
        self.locale = EnumLocal(locale)

    def _query(self) -> tuple[Select, dict]:
        """
        Build one shared projection for list reads and post-update row responses.

        :return: Owner-based statement and filter expressions, without pagination or target selection.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        has_profile = (
            select(literal(1))
            .select_from(PortfolioCareer)
            .join(
                PortfolioCareerLocale,
                PortfolioCareerLocale.career_id == PortfolioCareer.id,
            )
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioCareerLocale.locale)
            .where(
                PortfolioCareer.site_id == PortfolioSite.id,
                PortfolioCareerLocale.locale == self.locale,
            )
            .correlate(PortfolioSite)
            .exists()
        )
        columns = {
            **SITE_OWNER_COLUMNS,
            **SITE_PATCH_COLUMNS,
            **SITE_TRANSLATION_PATCH_COLUMNS,
            EnumManagementField.HAS_SITE: PortfolioSite.id.is_not(None),
            EnumManagementField.HAS_PROFILE: has_profile,
            # A projected constant still needs its ORM type: PostgreSQL cannot infer an
            # enum-derived bind first used by IS NOT NULL in a negative column filter.
            #                                                                               ♂ ZhengLee 2026.10.16
            EnumManagementField.LOCALE: literal(self.locale, type_=PortfolioLocale.code.type),
            EnumManagementField.HAS_TRANSLATION: PortfolioSiteLocale.id.is_not(None),
        }
        stmt = (
            select(*(expression.label(field) for field, expression in columns.items()))
            .select_from(AuthUser)
            .outerjoin(PortfolioSite, PortfolioSite.user_id == AuthUser.id)
            .outerjoin(
                PortfolioSiteLocale,
                and_(
                    PortfolioSiteLocale.site_id == PortfolioSite.id,
                    PortfolioSiteLocale.locale == self.locale,
                ),
            )
        )
        # The filter-only name expression matches the public renderer; missing content stays null.
        first = trim_column_text(func.coalesce(PortfolioSiteLocale.first_name, ""))
        family = trim_column_text(func.coalesce(PortfolioSiteLocale.family_name, ""))
        name = case(
            (
                and_(
                    first.regexp_match(HAN_NAME_PATTERN),
                    family.regexp_match(HAN_NAME_PATTERN),
                ),
                family + first,
            ),
            else_=trim_column_text(first + literal(" ") + family),
        )
        columns[EnumManagementField.PROFILE_NAME] = func.coalesce(
            func.nullif(name, ""),
            func.nullif(trim_column_text(PortfolioSiteLocale.nick_name), ""),
        )
        return stmt, columns

    async def select(self) -> dict:
        """
        Query all owners with the requested language joined before filtering and pagination.

        :return: One page, including owners whose website or requested translation is missing.
        :raises HTTPException: Storage failures return the shared sanitized 503 response.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        stmt, columns = self._query()
        return await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))

    async def update(
        self,
        account_id: int,
        changes: dict,
        *,
        expected_owner_email: str,
        expected: dict | None = None,
        actor_id: int | None = None,
    ) -> dict:
        """
        Atomically patch an existing owner's website and selected translation without changing identity.

        The view checks current management permission. This method owns all resource
        rules and commits once through the shared executor. Only account activation
        may change on AuthUser; identity columns remain immutable.
        Publication writes serialize in PostgreSQL with a transaction advisory lock.
        SQLite acquires its writer lock before reading the state used by this patch.

        :param account_id: Existing account PK, matching the Platform row identity.
        :param expected_owner_email: Immutable target confirmation; must match the same account under lock.
        :param changes: Explicit mutable assignments; omitted values remain unchanged.
        :return: Complete RespManagementSite projection read inside the write transaction.
        :raises HTTPException: Invalid input (422), missing records (404), state conflicts (409),
                               or unavailable storage (503). Cache failure after commit is explicit.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        # --------------------------------------------------● Step 1. Defend the module boundary as well as HTTP input.
        if type(account_id) is not int or not 1 <= account_id <= 2147483647:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_ACCOUNT_ID)
        try:
            expected_owner_email = validate_auth_email(expected_owner_email)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_ACCOUNT_CONFIRMATION) from None
        if not isinstance(changes, dict):
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_PLATFORM_PATCH)
        try:
            changes = BodyManagementSitePatch.model_validate(changes).orm_changes()
        except ValidationError:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_PLATFORM_PATCH) from None
        site_changes = {column: value for column, value in changes.items() if column in frozenset(SITE_COLUMNS)}
        translation_changes = {
            column: value for column, value in changes.items() if column in frozenset(SITE_LOCALE_COLUMNS)
        }

        try:
            async with self.transaction() as transaction:
                state = ManagementWriteState(transaction)
                await state.begin(actor_id, AuthRole.is_manage_sites)
                owner = (
                    (
                        await transaction.execute_orm(
                            select(AuthUser)
                            .options(load_only(AuthUser.id, AuthUser.is_active, raiseload=True))
                            .where(
                                AuthUser.id == account_id,
                                AuthUser.email == expected_owner_email,
                            )
                            .with_for_update(read=AuthUser.is_active not in changes)
                        )
                    )
                    .scalars()
                    .one_or_none()
                )
                if owner is None:
                    raise HTTPException(status_code=404, detail=EnumManagementError.ACCOUNT_NOT_FOUND)
                site = (
                    (
                        await transaction.execute_orm(
                            select(PortfolioSite)
                            .options(
                                load_only(
                                    PortfolioSite.id,
                                    PortfolioSite.is_published,
                                    PortfolioSite.is_default,
                                    raiseload=True,
                                )
                            )
                            .where(PortfolioSite.user_id == account_id)
                            .with_for_update()
                        )
                    )
                    .scalars()
                    .one_or_none()
                )
                if site is None and (site_changes or translation_changes):
                    raise HTTPException(status_code=404, detail=EnumManagementError.SITE_NOT_FOUND)

                stmt, _ = self._query()
                before = (await transaction.execute_orm(stmt.where(AuthUser.id == account_id))).mappings().one()
                bindings = {
                    **SITE_ACCOUNT_PATCH_COLUMNS,
                    **SITE_PATCH_COLUMNS,
                    **SITE_TRANSLATION_PATCH_COLUMNS,
                }
                if expected is not None and (
                    not isinstance(expected, dict)
                    or set(expected) != {field for field, column in bindings.items() if column in changes}
                ):
                    raise HTTPException(
                        status_code=422,
                        detail=EnumManagementError.INVALID_MANAGEMENT_PATCH,
                    )
                state.compare(before, expected, bindings)

                # ------------------------------------------● Step 3. Include inactive translations in management; require existence only.
                if translation_changes:
                    translation_id = (
                        await transaction.execute_orm(
                            select(PortfolioSiteLocale.id)
                            .join(
                                PortfolioLocale,
                                PortfolioLocale.code == PortfolioSiteLocale.locale,
                            )
                            .where(
                                PortfolioSiteLocale.site_id == site.id,
                                PortfolioSiteLocale.locale == self.locale,
                            )
                            # Lock this site's translation, not the shared language row across every website.
                            .with_for_update(of=PortfolioSiteLocale)
                        )
                    ).scalar_one_or_none()
                    if translation_id is None:
                        raise HTTPException(
                            status_code=404,
                            detail=EnumManagementError.SITE_TRANSLATION_NOT_FOUND,
                        )

                # ------------------------------------------● Step 4. Validate the final publication/default state, then replace the old default.
                published = site_changes.get(PortfolioSite.is_published, site.is_published if site else False)
                default = site_changes.get(PortfolioSite.is_default, site.is_default if site else False)
                active = changes.get(AuthUser.is_active, owner.is_active)
                if site_changes.get(PortfolioSite.is_default) is True and (not published or not active):
                    raise HTTPException(
                        status_code=409,
                        detail=EnumManagementError.DEFAULT_SITE_REQUIRES_ACTIVE_PUBLISHED,
                    )
                if default and not active:
                    raise HTTPException(
                        status_code=409,
                        detail=EnumManagementError.DEFAULT_SITE_DEACTIVATE_FORBIDDEN,
                    )
                if not published and default:
                    site_changes[PortfolioSite.is_default] = False
                if site_changes.get(PortfolioSite.is_default) is True:
                    await transaction.execute_orm(
                        update(PortfolioSite)
                        .where(
                            PortfolioSite.is_default.is_(True),
                            PortfolioSite.id != site.id,
                        )
                        .values({PortfolioSite.is_default: False})
                    )

                # ------------------------------------------● Step 5. Persist activation/content and validate the shared response before commit.
                # Account state is the only writable account field; its existing onupdate owns Updated.
                # Skip an unchanged value so repeated activation requests remain idempotent.
                #                                                                               ♂ ZhengLee 2026.10.16
                # Apply explicit Default changes before the shared activation guard; never infer them from Active.
                if site_changes:
                    await transaction.execute_orm(
                        update(PortfolioSite).where(PortfolioSite.id == site.id).values(site_changes)
                    )
                await state.activate(owner, active)
                await state.preserve_manager()
                if translation_changes:
                    await transaction.execute_orm(
                        update(PortfolioSiteLocale)
                        .where(PortfolioSiteLocale.id == translation_id)
                        .values(translation_changes)
                    )
                stmt, _ = self._query()
                row = (await transaction.execute_orm(stmt.where(AuthUser.id == account_id))).mappings().one()
                result = RespManagementSite.model_validate(row).model_dump()
        except IntegrityError:
            raise HTTPException(status_code=409, detail=EnumManagementError.PLATFORM_UPDATE_CONFLICT) from None
        except (SQLAlchemyError, ValidationError, RuntimeError, OSError):
            raise HTTPException(
                status_code=503,
                detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE,
            ) from None

        await ManagementWriteState.invalidate_public_cache()
        return result

    async def delete(self, targets, *, actor_id: int) -> dict:
        """Delete confirmed websites and all child content atomically, preserving account identities.

        HTTP entry points normalize single/batch targets here. Identity confirmation is not
        authorization: current server-issued authority is checked again under the shared lock.
        Database FK cascades own child cleanup; shared locales, accounts and login history survive.

        :param targets: Validated owner/email/site confirmations, never client-provided SQL names.
        :param actor_id: Current server-session account; required even for direct module callers.
        :return: Deleted account/site identifiers after one successful commit.
        :raises HTTPException: Invalid targets, missing identities, changed sites, Default protection or storage failure.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        # --------------------------------------------------● Step 1. Defend direct callers as well as the HTTP schema boundary.
        if not isinstance(targets, (list, tuple)):
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_SITE_DELETE)
        try:
            batch = BodyManagementSiteBulkDelete.model_validate({"targets": list(targets)})
        except ValidationError:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_SITE_DELETE) from None
        if type(actor_id) is not int or not 1 <= actor_id <= 2147483647:
            raise HTTPException(status_code=401, detail=EnumManagementError.AUTH_REQUIRED)
        ordered = sorted(batch.targets, key=lambda target: target.account_id)
        try:
            async with self.transaction() as transaction:
                state = ManagementWriteState(transaction)
                await state.begin(actor_id, AuthRole.is_manage_sites)
                # --------------------------------------------------● Step 2. Confirm every owner and website before deleting any target.
                owners = (
                    await transaction.execute_orm(
                        select(AuthUser.id, AuthUser.email)
                        .where(AuthUser.id.in_([target.account_id for target in ordered]))
                        .order_by(AuthUser.id)
                        .with_for_update(read=True)
                    )
                ).all()
                emails = {owner.id: owner.email for owner in owners}
                sites = (
                    await transaction.execute_orm(
                        select(
                            PortfolioSite.id,
                            PortfolioSite.user_id,
                            PortfolioSite.is_default,
                        )
                        .where(PortfolioSite.user_id.in_([target.account_id for target in ordered]))
                        .order_by(PortfolioSite.id)
                        .with_for_update()
                    )
                ).all()
                by_owner = {site.user_id: site for site in sites}
                for target in ordered:
                    if emails.get(target.account_id) != target.expected_owner_email:
                        raise HTTPException(
                            status_code=404,
                            detail=EnumManagementError.ACCOUNT_NOT_FOUND,
                        )
                    site = by_owner.get(target.account_id)
                    if site is None:
                        raise HTTPException(status_code=404, detail=EnumManagementError.SITE_NOT_FOUND)
                    if site.id != target.expected_site_id:
                        raise HTTPException(
                            status_code=409,
                            detail=EnumManagementError.SITE_DELETE_CONFLICT,
                        )
                    if site.is_default:
                        raise HTTPException(
                            status_code=409,
                            detail=EnumManagementError.DEFAULT_SITE_DELETE_FORBIDDEN,
                        )
                # --------------------------------------------------● Step 3. Delete roots only; the existing FK cascade clears every language and relation.
                await transaction.execute_orm(
                    delete(PortfolioSite).where(PortfolioSite.id.in_([site.id for site in sites]))
                )
                result = RespManagementSiteDeletion(
                    deleted_count=len(sites),
                    deleted=[{"account_id": site.user_id, "site_id": site.id} for site in sites],
                ).model_dump()
        except IntegrityError:
            raise HTTPException(status_code=409, detail=EnumManagementError.SITE_DELETE_CONFLICT) from None
        except (SQLAlchemyError, ValidationError, RuntimeError, OSError):
            raise HTTPException(
                status_code=503,
                detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE,
            ) from None
        # --------------------------------------------------● Step 4. A committed deletion is never retried because cache invalidation failed.
        await ManagementWriteState.invalidate_public_cache(
            EnumManagementError.MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE
        )
        return result
