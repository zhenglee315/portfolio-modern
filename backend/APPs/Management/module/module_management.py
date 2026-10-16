# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import (
    ROLE_FIELD_COLUMNS,
    ROLE_PATCH_COLUMNS,
    USER_PATCH_COLUMNS,
    SITE_ACCOUNT_PATCH_COLUMNS,
    SITE_COLUMNS,
    SITE_LOCALE_COLUMNS,
    LOGIN_FIELD_COLUMNS,
    SITE_PATCH_COLUMNS,
    SITE_OWNER_COLUMNS,
    USER_FIELD_COLUMNS,
    SITE_TRANSLATION_PATCH_COLUMNS,
    EnumManagementField,
    EnumManagementError,
    EnumManagementUpdateState,
    EnumSortDirection,
    SITE_PUBLICATION_LOCK_KEY,
)
from APPs.Management.schema.body import (
    BodyManagementSitePatch,
    BodyManagementRolePatch,
    BodyManagementUserPatch,
    BodyManagementRolePatchRequest,
    BodyManagementUserPatchRequest,
)
from .module_management_state import ManagementWriteState
from APPs.Auth.schema.body import validate_auth_email
from APPs.Management.schema.resp import RespManagementSite, RespManagementRole, RespManagementUser
from APPs.Portfolio.module.module_portfolio_manage import PortfolioManagementModule

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from COMMON.schema.resp import RespRecords
from COMMON.tools.storage.redis import RedisAsync

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import EnumDBType, EnumLocal, EnumHttpHeader, EnumCache
from SYSTEM.models import (
    AuthRole,
    AuthUser,
    PortfolioCareer,
    PortfolioCareerLocale,
    PortfolioLocale,
    PortfolioSite,
    PortfolioSiteLocale,
    RecordLogin,
)

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException
from redis.exceptions import RedisError

# ◆—< Pack >—————————————————————————————————◆ SqlAlchemy
from sqlalchemy import Select, and_, case, func, literal, select, update
from COMMON.tools.storage.sqlalchemy.tools_column_filters import apply_column_filters, trim_column_text
from COMMON.tools.storage.sqlalchemy.tools_table_search import apply_table_search
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import ValidationError

# Generated from ECMAScript Script=Han to share the browser name-order rule.
HAN_NAME_PATTERN = "^[⺀-⺙⺛-⻳⼀-⿕々〇〡-〩〸-〻㐀-䶿一-\u9fff豈-舘並-龎𖿢-𖿣𖿰-\U00016ff6𠀀-\U0002a6df𪜀-𫠝𫠠-\U0002cead𬺰-𮯠\U0002ebf0-\U0002ee5d丽-𪘀𰀀-𱍊\U00031350-\U00033479]+$"


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Shared List
class ManagementListModule(SqlAlchemyExecAsync):
    """
    Share typed predicates, sorting and numbered pagination across management resources.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    def __init__(
        self,
        page: int = 1,
        size: int = 6,
        filters: tuple[dict, ...] = (),
        sort: tuple[tuple[str, str], ...] = (),
        search: dict | None = None,
        *,
        session: AsyncSession | None = None,
    ) -> None:
        """Own validated page controls; resource projections supply allowed column expressions."""
        super().__init__(session=session)
        self.page_number, self.page_size = page, size
        self.filters, self.sort = filters, sort
        self.search = search

    def apply_filters(self, stmt: Select, columns: dict) -> Select:
        """Apply the same predicate engine to stored, joined and aggregate columns."""
        return apply_table_search(apply_column_filters(stmt, columns, self.filters), columns, self.search)

    def apply_sort(self, stmt: Select, columns: dict) -> Select:
        """
        Order a management projection by validated fields with missing values last.

        :param stmt: Resource projection after column predicates are applied.
        :param columns: Mapping from parser-approved field names to SQL projection expressions.
        :return: Statement ordered by each requested criterion and its stable ID tie-breaker.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        for field, direction in self.sort:
            expression = columns[field]
            stmt = stmt.order_by(
                (expression.asc() if direction == EnumSortDirection.ASC else expression.desc()).nulls_last()
            )
        return stmt

    async def page(self, stmt: Select) -> dict:
        """
        Count filtered records and read one numbered page through the shared ORM executor.

        :param stmt: Filtered and ordered resource projection with one record per management row.
        :return: Shared items/total/pages/page/size envelope for the requested page.
        :raises HTTPException: Storage is unavailable; database internals are not returned.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        try:
            result = await self.paginate_orm(stmt, page=self.page_number, size=self.page_size, unique=False)
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE) from None
        return RespRecords.from_records(
            result.items, total=result.total, page=result.page, size=result.size
        ).model_dump()


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Roles
class ManagementRolesModule(ManagementListModule):
    """
    Read role permissions and assigned account counts while keeping one role per row.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    def _query(self):
        """
        Build the role projection shared by list reads and transactional update responses.

        :return: Unfiltered role statement and its declared column expressions.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        assigned = (
            select(AuthUser.role_id, func.count(AuthUser.id).label(EnumManagementField.USER_COUNT))
            .group_by(AuthUser.role_id)
            .subquery()
        )
        columns = dict(ROLE_FIELD_COLUMNS)
        columns[EnumManagementField.USER_COUNT] = func.coalesce(assigned.c[EnumManagementField.USER_COUNT], 0)
        stmt = select(*(expression.label(field) for field, expression in columns.items())).outerjoin(
            assigned, assigned.c[AuthUser.role_id.key] == AuthRole.id
        )
        return stmt, columns

    async def select(self) -> dict:
        """Read the shared projection through validated list controls."""
        stmt, columns = self._query()
        return await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))

    async def update(self, role_id: int, changes: dict, *, expected_role: str, expected: dict, actor_id: int) -> dict:
        """Patch role settings atomically, retaining a usable registration default and manager.

        Identity, original values and authority are checked after lock acquisition.
        Renaming changes the role row only; assigned account FKs remain untouched.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        try:
            body = BodyManagementRolePatchRequest.model_validate(
                dict(expected_role=expected_role, expected=expected, changes=changes)
            ).changes
        except ValidationError:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_MANAGEMENT_PATCH) from None
        assignments = body.orm_changes()
        if type(role_id) is not int or not 1 <= role_id <= 2147483647 or set(expected) != body.model_fields_set:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_MANAGEMENT_PATCH)
        try:
            async with self.transaction() as transaction:
                state = ManagementWriteState(transaction)
                await state.begin(actor_id, AuthRole.is_manage_roles)
                role = (
                    await transaction.execute_orm(
                        select(AuthRole).where(AuthRole.id == role_id, AuthRole.role == expected_role).with_for_update()
                    )
                ).scalar_one_or_none()
                if role is None:
                    raise HTTPException(status_code=404, detail=EnumManagementError.ROLE_NOT_FOUND)
                stmt, _ = self._query()
                before = (await transaction.execute_orm(stmt.where(AuthRole.id == role_id))).mappings().one()
                state.compare(before, expected, ROLE_PATCH_COLUMNS)
                final = {field: changes.get(field, before[field]) for field in ROLE_PATCH_COLUMNS}
                eligible = final[EnumManagementField.IS_ACTIVE] and not any(
                    final[field]
                    for field in (
                        EnumManagementField.IS_MANAGE_ROLES,
                        EnumManagementField.IS_MANAGE_USERS,
                        EnumManagementField.IS_MANAGE_SITES,
                    )
                )
                if final[EnumManagementField.IS_DEFAULT] and not eligible:
                    raise HTTPException(
                        status_code=409, detail=EnumManagementError.DEFAULT_ROLE_REQUIRES_ACTIVE_UNPRIVILEGED
                    )
                if role.is_default and not final[EnumManagementField.IS_DEFAULT]:
                    raise HTTPException(status_code=409, detail=EnumManagementError.DEFAULT_ROLE_REQUIRED)
                if changes.get(EnumManagementField.IS_DEFAULT) is True:
                    await transaction.execute_orm(
                        update(AuthRole)
                        .where(AuthRole.is_default.is_(True), AuthRole.id != role_id)
                        .values({AuthRole.is_default: False})
                    )
                changed = {
                    column: assignments[column]
                    for field, column in ROLE_PATCH_COLUMNS.items()
                    if field in changes and before[field] != changes[field]
                }
                if changed:
                    await transaction.execute_orm(update(AuthRole).where(AuthRole.id == role_id).values(changed))
                await state.preserve_manager()
                return RespManagementRole.model_validate(
                    (await transaction.execute_orm(stmt.where(AuthRole.id == role_id))).mappings().one()
                ).model_dump()
        except IntegrityError:
            raise HTTPException(status_code=409, detail=EnumManagementError.MANAGEMENT_UPDATE_CONFLICT) from None
        except (SQLAlchemyError, ValidationError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE) from None


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Users
class ManagementUsersModule(ManagementListModule):
    """
    Read account identity, role and sign-in statistics while keeping one person per row.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    def _query(self):
        """
        Select account identity, assigned role, optional website and successful-login statistics.

        :return: Unfiltered account statement and its declared column expressions.
        :raises HTTPException: Storage is unavailable; database internals are not returned.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        logins = (
            select(
                RecordLogin.user_id,
                func.count(RecordLogin.id).label(EnumManagementField.LOGIN_COUNT),
                func.max(RecordLogin.logintime).label(EnumManagementField.LAST_LOGIN),
            )
            .group_by(RecordLogin.user_id)
            .subquery()
        )
        columns = {
            **USER_FIELD_COLUMNS,
            EnumManagementField.HAS_SITE: PortfolioSite.id.is_not(None),
            EnumManagementField.LOGIN_COUNT: func.coalesce(logins.c[EnumManagementField.LOGIN_COUNT], 0),
            EnumManagementField.LAST_LOGIN: logins.c[EnumManagementField.LAST_LOGIN],
        }
        stmt = (
            select(*(expression.label(field) for field, expression in columns.items()))
            .select_from(AuthUser)
            .join(AuthRole, AuthRole.id == AuthUser.role_id)
            .outerjoin(PortfolioSite, PortfolioSite.user_id == AuthUser.id)
            .outerjoin(logins, logins.c[RecordLogin.user_id.key] == AuthUser.id)
        )
        return stmt, columns

    async def select(self) -> dict:
        """Read the same account projection returned by a successful update."""
        stmt, columns = self._query()
        return await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))

    async def role_options(self, actor_id: int) -> dict:
        """Page searchable role choices under User permission without opening the Role-management list.

        Inactive and excessive-grant roles remain visible but cannot be newly assigned.
                                                                                               ♂ ZhengLee 2026.10.16
        """
        try:
            async with self.transaction() as transaction:
                actor_role = (
                    await transaction.execute_orm(
                        select(AuthRole)
                        .join(AuthUser, AuthUser.role_id == AuthRole.id)
                        .where(
                            AuthUser.id == actor_id,
                            AuthUser.is_active.is_(True),
                            AuthRole.is_active.is_(True),
                            AuthRole.is_manage_users.is_(True),
                        )
                    )
                ).scalar_one_or_none()
                if actor_role is None:
                    raise HTTPException(status_code=403, detail=EnumManagementError.PERMISSION_DENIED)
                assignable = and_(
                    AuthRole.is_active.is_(True), *ManagementWriteState.role_assignment_conditions(actor_role)
                )
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE) from None
        columns = {EnumManagementField.ROLE: AuthRole.role}
        stmt = select(
            AuthRole.id, AuthRole.role, AuthRole.is_active, assignable.label(EnumManagementField.CAN_ASSIGN)
        ).order_by(func.lower(AuthRole.role), AuthRole.id)
        return await self.page(self.apply_filters(stmt, columns))

    async def update(
        self, account_id: int, changes: dict, *, expected_email: str, expected: dict, actor_id: int
    ) -> dict:
        """Assign an eligible role and apply activation in one transaction.

        Platform shares account-state decisions; role assignment rechecks the actor's
        permission ceiling, target availability, original value and final manager.

        ♂ ZhengLee 2026.10.16
        """
        try:
            body = BodyManagementUserPatchRequest.model_validate(
                dict(expected_email=expected_email, expected=expected, changes=changes)
            ).changes
            expected_email = validate_auth_email(expected_email)
        except (ValidationError, ValueError, TypeError):
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_MANAGEMENT_PATCH) from None
        if type(account_id) is not int or not 1 <= account_id <= 2147483647 or set(expected) != body.model_fields_set:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_MANAGEMENT_PATCH)
        try:
            async with self.transaction() as transaction:
                state = ManagementWriteState(transaction)
                await state.begin(actor_id, AuthRole.is_manage_users)
                owner = (
                    await transaction.execute_orm(
                        select(AuthUser)
                        .where(AuthUser.id == account_id, AuthUser.email == expected_email)
                        .with_for_update()
                    )
                ).scalar_one_or_none()
                if owner is None:
                    raise HTTPException(status_code=404, detail=EnumManagementError.ACCOUNT_NOT_FOUND)
                stmt, _ = self._query()
                before = (await transaction.execute_orm(stmt.where(AuthUser.id == account_id))).mappings().one()
                state.compare(before, expected, USER_PATCH_COLUMNS)
                assignments = body.orm_changes()
                if AuthUser.role_id in assignments and assignments[AuthUser.role_id] != owner.role_id:
                    target_id = assignments[AuthUser.role_id]
                    target_role = (
                        await transaction.execute_orm(
                            select(AuthRole).where(AuthRole.id == target_id).with_for_update(read=True)
                        )
                    ).scalar_one_or_none()
                    if target_role is None:
                        raise HTTPException(status_code=404, detail=EnumManagementError.ROLE_NOT_FOUND)
                    if not target_role.is_active:
                        raise HTTPException(status_code=409, detail=EnumManagementError.ROLE_ASSIGNMENT_INACTIVE)
                    permitted = (
                        await transaction.execute_orm(
                            select(AuthRole.id).where(
                                AuthRole.id == target_id, *state.role_assignment_conditions(state.actor_role)
                            )
                        )
                    ).scalar_one_or_none()
                    if permitted is None:
                        raise HTTPException(status_code=403, detail=EnumManagementError.ROLE_ASSIGNMENT_FORBIDDEN)
                    await transaction.execute_orm(
                        update(AuthUser).where(AuthUser.id == owner.id).values({AuthUser.role_id: target_id})
                    )
                if AuthUser.is_active in assignments:
                    await state.activate(owner, assignments[AuthUser.is_active])
                await state.preserve_manager()
                result = RespManagementUser.model_validate(
                    (await transaction.execute_orm(stmt.where(AuthUser.id == account_id))).mappings().one()
                ).model_dump()
        except IntegrityError:
            raise HTTPException(status_code=409, detail=EnumManagementError.MANAGEMENT_UPDATE_CONFLICT) from None
        except (SQLAlchemyError, ValidationError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE) from None
        await self.invalidate_public_cache()
        return result

    @staticmethod
    async def invalidate_public_cache():
        """Report post-commit cache failure explicitly; never imply a rolled-back account change."""
        try:
            await PortfolioManagementModule.invalidate_cache()
        except (HTTPException, AssertionError):
            raise HTTPException(
                status_code=503,
                detail=EnumManagementError.MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE,
                headers={EnumHttpHeader.MANAGEMENT_UPDATE_STATE: EnumManagementUpdateState.COMMITTED},
            ) from None


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Sites
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
            .join(PortfolioCareerLocale, PortfolioCareerLocale.career_id == PortfolioCareer.id)
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
                and_(PortfolioSiteLocale.site_id == PortfolioSite.id, PortfolioSiteLocale.locale == self.locale),
            )
        )
        # The filter-only name expression matches the public renderer; missing content stays null.
        first = trim_column_text(func.coalesce(PortfolioSiteLocale.first_name, ""))
        family = trim_column_text(func.coalesce(PortfolioSiteLocale.family_name, ""))
        name = case(
            (and_(first.regexp_match(HAN_NAME_PATTERN), family.regexp_match(HAN_NAME_PATTERN)), family + first),
            else_=trim_column_text(first + literal(" ") + family),
        )
        columns[EnumManagementField.PROFILE_NAME] = func.coalesce(
            func.nullif(name, ""), func.nullif(trim_column_text(PortfolioSiteLocale.nick_name), "")
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
                            .where(AuthUser.id == account_id, AuthUser.email == expected_owner_email)
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
                bindings = {**SITE_ACCOUNT_PATCH_COLUMNS, **SITE_PATCH_COLUMNS, **SITE_TRANSLATION_PATCH_COLUMNS}
                if expected is not None and (
                    not isinstance(expected, dict)
                    or set(expected) != {field for field, column in bindings.items() if column in changes}
                ):
                    raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_MANAGEMENT_PATCH)
                state.compare(before, expected, bindings)

                # ------------------------------------------● Step 3. Include inactive translations in management; require existence only.
                if translation_changes:
                    translation_id = (
                        await transaction.execute_orm(
                            select(PortfolioSiteLocale.id)
                            .join(PortfolioLocale, PortfolioLocale.code == PortfolioSiteLocale.locale)
                            .where(
                                PortfolioSiteLocale.site_id == site.id,
                                PortfolioSiteLocale.locale == self.locale,
                            )
                            # Lock this site's translation, not the shared language row across every website.
                            .with_for_update(of=PortfolioSiteLocale)
                        )
                    ).scalar_one_or_none()
                    if translation_id is None:
                        raise HTTPException(status_code=404, detail=EnumManagementError.SITE_TRANSLATION_NOT_FOUND)

                # ------------------------------------------● Step 4. Validate the final publication/default state, then replace the old default.
                published = site_changes.get(PortfolioSite.is_published, site.is_published if site else False)
                default = site_changes.get(PortfolioSite.is_default, site.is_default if site else False)
                active = changes.get(AuthUser.is_active, owner.is_active)
                if site_changes.get(PortfolioSite.is_default) is True and (not published or not active):
                    raise HTTPException(
                        status_code=409, detail=EnumManagementError.DEFAULT_SITE_REQUIRES_ACTIVE_PUBLISHED
                    )
                if (not published or not active) and default:
                    site_changes[PortfolioSite.is_default] = False
                if site_changes.get(PortfolioSite.is_default) is True:
                    await transaction.execute_orm(
                        update(PortfolioSite)
                        .where(PortfolioSite.is_default.is_(True), PortfolioSite.id != site.id)
                        .values({PortfolioSite.is_default: False})
                    )

                # ------------------------------------------● Step 5. Persist activation/content and validate the shared response before commit.
                # Account state is the only writable account field; its existing onupdate owns Updated.
                # Skip an unchanged value so repeated activation requests remain idempotent.
                #                                                                               ♂ ZhengLee 2026.10.16
                await state.activate(owner, active)
                await state.preserve_manager()
                if site_changes:
                    await transaction.execute_orm(
                        update(PortfolioSite).where(PortfolioSite.id == site.id).values(site_changes)
                    )
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
            raise HTTPException(status_code=503, detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE) from None

        await ManagementUsersModule.invalidate_public_cache()
        return result


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Login Records
class ManagementLoginRecordsModule(ManagementListModule):
    """
    Read immutable successful-login events through the shared private DataTable query engine.

    Account state does not hide historical events. Geographic values come only
    from the stored snapshot; reading a history page never performs GeoIP lookups.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    def __init__(self, *, user_id: int | None = None, **controls) -> None:
        """
        Retain an optional target account and the validated shared page controls.

        :param user_id: Target account ID, or None to read all authorized login records.
        :param controls: Shared pagination, filter, sort and search constructor values.
        :return: None; select() owns the read workflow.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        super().__init__(**controls)
        self.user_id = user_id

    async def select(self) -> dict:
        """
        Filter, count and page one row per event, including old records without IP data.

        :return: Shared records envelope containing audit snapshots and nullable live IP presence.
        :raises HTTPException: Unavailable storage returns the shared sanitized 503 response.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        columns = dict(LOGIN_FIELD_COLUMNS)
        stmt = select(*(expression.label(field) for field, expression in columns.items())).join(
            AuthUser, AuthUser.id == RecordLogin.user_id
        )
        if self.user_id is not None:
            stmt = stmt.where(RecordLogin.user_id == self.user_id)
        result = await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))
        # Read only this page's IP keys, using the same TTL as system heartbeat.
        # Redis failure is unknown rather than a false report of offline activity.
        #                                                                                       ♂ ZhengLee 2026.10.16
        identifiers = tuple(
            dict.fromkeys(
                row[EnumManagementField.IP_ADDRESS] for row in result["items"] if row[EnumManagementField.IP_ADDRESS]
            )
        )
        try:
            online = await RedisAsync(key=EnumCache.SYS).heartbeat_status(identifiers) if identifiers else {}
        except (RedisError, KeyError, AssertionError):
            online = None
        for row in result["items"]:
            row[EnumManagementField.IS_ONLINE] = (
                None if online is None else online.get(row[EnumManagementField.IP_ADDRESS], False)
            )
        return result


__all__ = (
    "ManagementListModule",
    "ManagementRolesModule",
    "ManagementUsersModule",
    "ManagementSitesModule",
    "ManagementLoginRecordsModule",
)
