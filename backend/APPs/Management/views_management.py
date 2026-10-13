# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import MANAGEMENT_DEFAULT_SORT
from APPs.Management.schema.parser import *
from APPs.Management.schema.resp import *
from APPs.Management.module import *

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.tools import FastApiRouter, cbv
from SYSTEM.urls import PreFix, RouteManagement, Tags

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends

router = FastApiRouter(prefix=PreFix.MGR, tags=Tags.MGR)

_COLUMN_QUERY_DESCRIPTION = (
    "Use page/size (defaults 1/6; size 1–100) and up to three ordered field:asc|desc criteria. "
    f"The default sort is {MANAGEMENT_DEFAULT_SORT}; null sorts last, and ascending ID breaks ties. "
    "filters is a JSON array of {field, operator, value?}, with one predicate per allowlisted column; columns combine with AND. "
    "Text operators: contains, not_contains, equals, not_equals, starts, ends, empty, not_empty. "
    "Text comparisons ignore case; percent and underscore are literal. Empty means null or space-trimmed empty text. "
    "Number/date operators: equals, not_equals, gt, gte, lt, lte, between (two inclusive bounds). "
    "Date values accept YYYY-MM-DD for a whole UTC day: equals includes the day, not_equals excludes it, "
    "After starts at the following midnight and Before excludes the selected day. "
    "Precise ISO timestamps with a timezone remain supported and normalize to UTC. "
    "Boolean/enum operators: equals, not_equals; nullable fields also accept empty/not_empty. "
    "Role names also accept in/not_in with up to 100 unique strings; an empty in list matches no rows. "
    "Negative operators exclude null. False and zero are values, not empty. "
    "Invalid predicates return 400 INVALID_FILTERS; obsolete/unknown query keys return 400 INVALID_QUERY. "
    "All predicates run before the matching total and requested page are read. "
    "The envelope stays items/total/pages/page/size; out-of-range pages return empty items with the matching total. "
    "Unavailable storage returns 503 MANAGEMENT_DATABASE_UNAVAILABLE."
)


@cbv(router)
class ManagementRoles:
    """Read one row per role, including permissions and aggregate account counts."""

    path = RouteManagement.ROLES

    @router.get(
        path,
        summary="Query Management Roles",
        description=_COLUMN_QUERY_DESCRIPTION,
        response_model=RespManagementRoles,
        responses={400: {"description": "Invalid management query."}, 503: {"description": "Storage unavailable."}},
    )
    async def get_roles(self, query_string: dict = Depends(parser_management_roles)) -> dict:
        """Execute the validated role query without exposing credentials."""
        return await ManagementRolesModule(**query_string).select()


@cbv(router)
class ManagementUsers:
    """Read one row per account with joined role, optional site and login aggregates."""

    path = RouteManagement.USERS

    @router.get(
        path,
        summary="Query Management Users",
        description=_COLUMN_QUERY_DESCRIPTION,
        response_model=RespManagementUsers,
        responses={400: {"description": "Invalid management query."}, 503: {"description": "Storage unavailable."}},
    )
    async def get_users(self, query_string: dict = Depends(parser_management_users)) -> dict:
        """Filter the account projection before counting and paging."""
        return await ManagementUsersModule(**query_string).select()


@cbv(router)
class ManagementSites:
    """Read one row per owner, retaining missing sites and selected-language content."""

    path = RouteManagement.SITES

    @router.get(
        path,
        summary="Query Management Platform Sites",
        description=_COLUMN_QUERY_DESCRIPTION
        + " locale is en/zh-Hans/zh-Hant, default en; there is no language fallback. profile_name predicates use the selected language's full name or nickname, excluding presentation placeholders.",
        response_model=RespManagementSites,
        responses={400: {"description": "Invalid management query."}, 503: {"description": "Storage unavailable."}},
    )
    async def get_sites(self, query_string: dict = Depends(parser_management_sites)) -> dict:
        """Apply selected-language predicates without changing publication or default state."""
        return await ManagementSitesModule(**query_string).select()
