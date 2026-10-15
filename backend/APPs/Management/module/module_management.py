# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import ROLE_COLUMNS, SITE_COLUMNS, SITE_LOCALE_COLUMNS, LOGIN_SORT_FIELDS

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from COMMON.schema.resp import RespRecords

# ◆—< Pack >—————————————————————————————————◆ System
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

# ◆—< Pack >—————————————————————————————————◆ SqlAlchemy
from sqlalchemy import Select, and_, case, func, literal, select
from COMMON.tools.storage.sqlalchemy.tools_column_filters import apply_column_filters, trim_column_text
from COMMON.tools.storage.sqlalchemy.tools_table_search import apply_table_search
from sqlalchemy.exc import SQLAlchemyError

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
        page: int,
        size: int,
        filters: tuple[dict, ...],
        sort: tuple[tuple[str, str], ...],
        search: dict | None = None,
    ) -> None:
        """Own validated page controls; resource projections supply allowed column expressions."""
        super().__init__()
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
            stmt = stmt.order_by((expression.asc() if direction == "asc" else expression.desc()).nulls_last())
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
            raise HTTPException(status_code=503, detail="MANAGEMENT_DATABASE_UNAVAILABLE") from None
        return RespRecords.from_records(
            result.items, total=result.total, page=result.page, size=result.size
        ).model_dump()


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Roles
class ManagementRolesModule(ManagementListModule):
    """
    Read role permissions and assigned account counts while keeping one role per row.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    async def select(self) -> dict:
        """
        Filter, sort and page a one-role projection using the same statement for total and items.

        :return: Shared page envelope with fifteen named role fields per item.
        :raises HTTPException: Storage is unavailable; database internals are not returned.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        assigned = (
            select(AuthUser.role_id, func.count(AuthUser.id).label("user_count")).group_by(AuthUser.role_id).subquery()
        )
        columns = {name: getattr(AuthRole, name) for name in ROLE_COLUMNS}
        columns["user_count"] = func.coalesce(assigned.c.user_count, 0).label("user_count")
        stmt = select(*columns.values()).outerjoin(assigned, assigned.c.role_id == AuthRole.id)
        return await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Users
class ManagementUsersModule(ManagementListModule):
    """
    Read account identity, role and sign-in statistics while keeping one person per row.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    async def select(self) -> dict:
        """
        Select account identity, assigned role, optional website and successful-login statistics.

        :return: Shared page envelope with twelve named fields per account, identified by login email.
        :raises HTTPException: Storage is unavailable; database internals are not returned.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        logins = (
            select(
                RecordLogin.user_id,
                func.count(RecordLogin.id).label("login_count"),
                func.max(RecordLogin.logintime).label("last_login"),
            )
            .group_by(RecordLogin.user_id)
            .subquery()
        )
        columns = {
            "id": AuthUser.id,
            "email": AuthUser.email,
            "role_id": AuthUser.role_id,
            "role": AuthRole.role.label("role"),
            "is_active": AuthUser.is_active,
            "role_is_active": AuthRole.is_active.label("role_is_active"),
            "site_id": PortfolioSite.id.label("site_id"),
            "has_site": PortfolioSite.id.is_not(None).label("has_site"),
            "login_count": func.coalesce(logins.c.login_count, 0).label("login_count"),
            "last_login": logins.c.last_login,
            "createtime": AuthUser.createtime,
            "updatetime": AuthUser.updatetime,
        }
        stmt = (
            select(*columns.values())
            .select_from(AuthUser)
            .join(AuthRole, AuthRole.id == AuthUser.role_id)
            .outerjoin(PortfolioSite, PortfolioSite.user_id == AuthUser.id)
            .outerjoin(logins, logins.c.user_id == AuthUser.id)
        )
        return await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Sites
class ManagementSitesModule(ManagementListModule):
    """
    Read person-based portfolio settings and the requested language, including missing sites.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    def __init__(
        self,
        page: int,
        size: int,
        filters: tuple[dict, ...],
        sort: tuple[tuple[str, str], ...],
        locale: str,
        search: dict | None = None,
    ) -> None:
        """Restrict joined profile fields and derived names to one requested language."""
        super().__init__(page, size, filters, sort, search)
        self.locale = locale

    async def select(self) -> dict:
        """
        Query all account owners with only their requested language joined before filtering and pagination.

        :return: One page of person-based platform records, including missing-site/translation placeholders.
        :raises HTTPException: Storage is unavailable.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        has_profile = (
            select(literal(1))
            .select_from(PortfolioCareer)
            .join(PortfolioCareerLocale, PortfolioCareerLocale.career_id == PortfolioCareer.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioCareerLocale.locale)
            .where(
                PortfolioCareer.site_id == PortfolioSite.id,
                PortfolioCareerLocale.locale == self.locale,
                PortfolioLocale.is_active.is_(True),
            )
            .correlate(PortfolioSite)
            .exists()
        )
        columns = {
            "id": AuthUser.id,
            "user": AuthUser.user,
            "owner_email": AuthUser.email.label("owner_email"),
            "owner_is_active": AuthUser.is_active.label("owner_is_active"),
            "site_id": PortfolioSite.id.label("site_id"),
            "has_site": PortfolioSite.id.is_not(None).label("has_site"),
            "has_profile": has_profile.label("has_profile"),
            **{name: getattr(PortfolioSite, name) for name in SITE_COLUMNS},
            "locale": literal(self.locale).label("locale"),
            "has_translation": PortfolioSiteLocale.id.is_not(None).label("has_translation"),
            **{name: getattr(PortfolioSiteLocale, name) for name in SITE_LOCALE_COLUMNS},
            "createtime": AuthUser.createtime,
            "updatetime": AuthUser.updatetime,
        }
        stmt = (
            select(*columns.values())
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
        columns["profile_name"] = func.coalesce(
            func.nullif(name, ""), func.nullif(trim_column_text(PortfolioSiteLocale.nick_name), "")
        )
        return await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))


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

        :return: Shared records envelope containing only audit identity/time/location fields.
        :raises HTTPException: Unavailable storage returns the shared sanitized 503 response.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        columns = {
            name: AuthUser.email if name == "email" else getattr(RecordLogin, name)
            for name in LOGIN_SORT_FIELDS
        }
        stmt = select(*columns.values()).join(AuthUser, AuthUser.id == RecordLogin.user_id)
        if self.user_id is not None:
            stmt = stmt.where(RecordLogin.user_id == self.user_id)
        return await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))


__all__ = (
    "ManagementListModule", "ManagementRolesModule", "ManagementUsersModule", "ManagementSitesModule",
    "ManagementLoginRecordsModule",
)
