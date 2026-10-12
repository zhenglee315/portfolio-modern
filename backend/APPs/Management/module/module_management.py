# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import ROLE_COLUMNS, SITE_COLUMNS, SITE_LOCALE_COLUMNS

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from COMMON.schema.resp import RespRecords

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.models import AuthRole, AuthUser, PortfolioSite, PortfolioSiteLocale, RecordLogin

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException

# ◆—< Pack >—————————————————————————————————◆ SqlAlchemy
from sqlalchemy import Select, and_, func, literal, or_, select
from sqlalchemy.exc import SQLAlchemyError


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Shared List
class ManagementListModule(SqlAlchemyExecAsync):
    """
    Share database search, sorting and numbered pagination across management resources.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    def __init__(self, page: int, size: int, search_terms: tuple[str, ...], sort: tuple[tuple[str, str], ...]) -> None:
        """
        Prepare the shared ORM executor and validated management list controls.

        :param page: Positive one-based page number selected by the request parser.
        :param size: Validated management page size from one to one hundred.
        :param search_terms: Literal search words that must each match a searchable column.
        :param sort: Validated field/direction pairs in priority order, including the ID tie-breaker.
        :return: None; inherited ORM helpers open storage when a statement is executed.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        super().__init__()
        self.page_number = page
        self.page_size = size
        self.search_terms = search_terms
        self.sort = sort

    def apply_search(self, stmt: Select, *expressions) -> Select:
        """
        Add case-insensitive literal search across the designated resource text columns.

        :param stmt: Resource projection before search and pagination are applied.
        :param expressions: Searchable text columns; each word may match any one column.
        :return: Statement requiring every word to match, with percent and underscore escaped.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        for term in self.search_terms:
            stmt = stmt.where(or_(*(expression.icontains(term, autoescape=True) for expression in expressions)))
        return stmt

    def apply_sort(self, stmt: Select, columns: dict) -> Select:
        """
        Order a management projection by validated fields with missing values last.

        :param stmt: Resource projection after search and state filters are applied.
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

    def __init__(
        self,
        page: int,
        size: int,
        search_terms: tuple[str, ...],
        sort: tuple[tuple[str, str], ...],
        is_active: bool | None,
        is_default: bool | None,
    ) -> None:
        """
        Prepare role state filters and the shared management list controls.

        :param page: Positive one-based page number.
        :param size: Validated management page size from one to one hundred.
        :param search_terms: Literal words searched across role names and descriptions.
        :param sort: Validated sorting criteria in priority order, including the ID tie-breaker.
        :param is_active: Role availability filter; None includes both states.
        :param is_default: Default-role filter; None includes both states.
        :return: None; role selection opens storage through the inherited ORM executor.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        super().__init__(page=page, size=size, search_terms=search_terms, sort=sort)
        self.is_active = is_active
        self.is_default = is_default

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
        stmt = self.apply_search(stmt, AuthRole.role, AuthRole.description)
        if self.is_active is not None:
            stmt = stmt.where(AuthRole.is_active.is_(self.is_active))
        if self.is_default is not None:
            stmt = stmt.where(AuthRole.is_default.is_(self.is_default))
        return await self.page(self.apply_sort(stmt, columns))


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Users
class ManagementUsersModule(ManagementListModule):
    """
    Read account identity, role and sign-in statistics while keeping one person per row.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    def __init__(
        self,
        page: int,
        size: int,
        search_terms: tuple[str, ...],
        sort: tuple[tuple[str, str], ...],
        is_active: bool | None,
        role_is_active: bool | None,
        has_site: bool | None,
        role_id: int | None,
    ) -> None:
        """
        Prepare account, role and website filters with the shared management list controls.

        :param page: Positive one-based page number.
        :param size: Validated management page size from one to one hundred.
        :param search_terms: Literal words searched across account names, emails and role names.
        :param sort: Validated sorting criteria in priority order, including the ID tie-breaker.
        :param is_active: Account availability filter; None includes both states.
        :param role_is_active: Assigned-role availability filter; None includes both states.
        :param has_site: Website existence filter; None includes accounts with or without a site.
        :param role_id: Assigned role ID filter; None includes every role.
        :return: None; account selection opens storage through the inherited ORM executor.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        super().__init__(page=page, size=size, search_terms=search_terms, sort=sort)
        self.is_active = is_active
        self.role_is_active = role_is_active
        self.has_site = has_site
        self.role_id = role_id

    async def select(self) -> dict:
        """
        Select account identity, assigned role, optional website and successful-login statistics.

        :return: Shared page envelope with thirteen named fields per account.
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
            "user": AuthUser.user,
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
        stmt = self.apply_search(stmt, AuthUser.user, AuthUser.email, AuthRole.role)
        if self.is_active is not None:
            stmt = stmt.where(AuthUser.is_active.is_(self.is_active))
        if self.role_is_active is not None:
            stmt = stmt.where(AuthRole.is_active.is_(self.role_is_active))
        if self.has_site is not None:
            stmt = stmt.where(PortfolioSite.id.is_not(None) if self.has_site else PortfolioSite.id.is_(None))
        if self.role_id is not None:
            stmt = stmt.where(AuthUser.role_id == self.role_id)
        return await self.page(self.apply_sort(stmt, columns))


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
        search_terms: tuple[str, ...],
        sort: tuple[tuple[str, str], ...],
        locale: str,
        owner_is_active: bool | None,
        has_site: bool | None,
        is_published: bool | None,
        is_default: bool | None,
        has_translation: bool | None,
    ) -> None:
        """
        Prepare the management language and account, website and translation state filters.

        :param page: Positive one-based page number.
        :param size: Validated management page size from one to one hundred.
        :param search_terms: Literal words searched across owner names, site emails and localized content.
        :param sort: Validated sorting criteria in priority order, including the ID tie-breaker.
        :param locale: Requested management language used for translation selection and search.
        :param owner_is_active: Owner-account availability filter; None includes both states.
        :param has_site: Website existence filter; None includes accounts with or without a site.
        :param is_published: Website publication filter; None includes every publication state.
        :param is_default: Default-website filter; None includes every default state.
        :param has_translation: Requested-language existence filter; None includes both states.
        :return: None; platform selection opens storage through the inherited ORM executor.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        super().__init__(page=page, size=size, search_terms=search_terms, sort=sort)
        self.locale = locale
        self.filters = {
            "owner_is_active": owner_is_active,
            "has_site": has_site,
            "is_published": is_published,
            "is_default": is_default,
            "has_translation": has_translation,
        }

    async def select(self) -> dict:
        """
        Query all account owners with only their requested language joined before filtering and pagination.

        :return: One page of person-based platform records, including missing-site/translation placeholders.
        :raises HTTPException: Storage is unavailable.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        columns = {
            "id": AuthUser.id,
            "user": AuthUser.user,
            "owner_is_active": AuthUser.is_active.label("owner_is_active"),
            "site_id": PortfolioSite.id.label("site_id"),
            "has_site": PortfolioSite.id.is_not(None).label("has_site"),
            **{name: getattr(PortfolioSite, name) for name in SITE_COLUMNS},
            "locale": literal(self.locale).label("locale"),
            "has_translation": PortfolioSiteLocale.id.is_not(None).label("has_translation"),
            **{name: getattr(PortfolioSiteLocale, name) for name in SITE_LOCALE_COLUMNS},
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
        stmt = self.apply_search(
            stmt,
            AuthUser.user,
            PortfolioSite.email,
            *(getattr(PortfolioSiteLocale, name) for name in SITE_LOCALE_COLUMNS),
        )
        for name, value in self.filters.items():
            if value is not None:
                stmt = stmt.where(columns[name].is_(value))
        return await self.page(self.apply_sort(stmt, columns))


__all__ = ("ManagementListModule", "ManagementRolesModule", "ManagementUsersModule", "ManagementSitesModule")
