# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import MANAGEMENT_DEFAULT_SORT
from APPs.Management.schema.parser import *
from APPs.Management.schema.resp import *
from APPs.Management.module import *
from APPs.Management.schema.parser.parser_portfolio_preview import (
    parser_portfolio_preview,
    parser_portfolio_preview_records,
    parser_portfolio_preview_skills,
)
from APPs.Portfolio.module import (
    PortfolioSiteModule,
    PortfolioJourneyModule,
    PortfolioExperiencesModule,
    PortfolioProjectsModule,
    PortfolioSkillsModule,
)
from APPs.Portfolio.schema.resp import (
    RespPortfolioSite,
    RespPortfolioJourneyItem,
    RespPortfolioExperiences,
    RespPortfolioProjects,
    RespPortfolioSkillCategories,
    RespPortfolioSkills,
)

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.tools import FastApiRouter, cbv
from SYSTEM.urls import PreFix, RouteManagement, RoutePortfolio, Tags

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
    "search adds literal case-insensitive substring matching across search_fields (a JSON array); fields combine with OR. "
    "Search combines with column filters using AND and runs before counting/paging. Blank text clears it; maximum 200 characters. "
    "Boolean search values are true/false, numbers use text, and UTC dates accept ISO or the displayed dotted format. "
    "Invalid scopes/duplicate search parameters return 400 INVALID_SEARCH. "
    "The envelope stays items/total/pages/page/size; out-of-range pages return empty items with the matching total. "
    "Unavailable storage returns 503 MANAGEMENT_DATABASE_UNAVAILABLE."
)

_PERMISSION_DESCRIPTION = (
    "Requires a signed-in, enabled account and role with the stated management permission. "
    "Permissions are refreshed from the database on every request; another management or content CRUD flag cannot substitute. "
    "Guests and disabled identities return 401; missing permission returns 403; identity storage failures return 503. "
    "Successful reads are private, no-store and vary by Cookie. "
)

_READ_RESPONSES = {
    400: {"description": "Invalid management query."},
    401: {"description": "Authentication required or account/role disabled."},
    403: {"description": "Required management permission denied."},
    503: {"description": "Storage unavailable."},
}


@cbv(router)
class ManagementRoles:
    """Read one row per role, including permissions and aggregate account counts."""

    path = RouteManagement.ROLES

    @router.get(
        path,
        summary="Query Management Roles",
        description=_PERMISSION_DESCRIPTION + "Required flag: is_manage_roles. " + _COLUMN_QUERY_DESCRIPTION,
        response_model=RespManagementRoles,
        dependencies=[Depends(ManagementPermission(is_manage_roles=True))],
        responses=_READ_RESPONSES,
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
        description=_PERMISSION_DESCRIPTION + "Required flag: is_manage_users. " + _COLUMN_QUERY_DESCRIPTION,
        response_model=RespManagementUsers,
        dependencies=[Depends(ManagementPermission(is_manage_users=True))],
        responses=_READ_RESPONSES,
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
        description=_PERMISSION_DESCRIPTION + "Required flag: is_manage_sites. " + _COLUMN_QUERY_DESCRIPTION
        + " locale is en/zh-Hans/zh-Hant, default en; there is no language fallback. has_profile checks for a career with the requested active-language translation using EXISTS; has_site only indicates website presence. profile_name predicates use the selected language's full name or nickname, excluding presentation placeholders.",
        response_model=RespManagementSites,
        dependencies=[Depends(ManagementPermission(is_manage_sites=True))],
        responses=_READ_RESPONSES,
    )
    async def get_sites(self, query_string: dict = Depends(parser_management_sites)) -> dict:
        """Apply selected-language predicates without changing publication or default state."""
        return await ManagementSitesModule(**query_string).select()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Management - Login Records
@cbv(router)
class ManagementLoginRecords:
    """
    Declare the private login-history contract and delegate reads to its module.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    path = RouteManagement.LOGIN_RECORDS

    @router.get(
        path,
        summary="Query Management Login Records",
        description=(
            "Retrieve successful-login events with their stored source IP and approximate geographic snapshot.\n\n"
            "🛡️ **Purpose & Permission:**\n"
            "- Requires a signed-in, enabled account and role with `is_manage_users=true`.\n"
            "- Uses ManagementPermission to refresh current database rights on every request.\n"
            "- Target accounts may be disabled; historical events remain available.\n\n"
            "🔎 **Query & Order:**\n"
            "- Optional `user_id` selects one account; omit it to query all login records.\n"
            "- Supports the existing page/size, typed filters, explicit sort, search and search_fields controls.\n"
            "- Defaults to `logintime:desc,id:desc`; explicit sort criteria take precedence and retain descending ID ties.\n"
            "- Page starts at 1; size defaults to 6 and accepts 1–100.\n"
            "- Filters and search run before counting and paging; out-of-range pages return empty items.\n\n"
            "🌐 **Location Snapshot:**\n"
            "- IP comes from the trusted-proxy-normalized ASGI client, never client-submitted login fields.\n"
            "- Country, region and city are approximate IP-derived values captured at login time.\n"
            "- Historic missing IP/location fields remain null with `geo_status=unknown`.\n"
            "- Status is unknown/resolved/not_found/non_public/unavailable; reads never call GeoIP.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
            '  "items": [{"id": 1, "user_id": 1, "email": "developer@example.com",\n'
            '    "logintime": "2026-10-15T09:00:00Z", "ip_address": null,\n'
            '    "country_code": null, "region": null, "city": null, "geo_status": "unknown"}],\n'
            '  "total": 1, "pages": 1, "page": 1, "size": 6\n'
            "}\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- Responses are private, no-store and vary by Cookie.\n"
            "- Invalid account selectors, repeated/unknown query keys or table controls return 400.\n"
            "- Missing/disabled identity returns 401; insufficient permission returns 403.\n"
            "- Unavailable identity or history storage returns a sanitized 503 response."
        ),
        response_model=RespManagementLoginRecords,
        dependencies=[Depends(ManagementPermission(is_manage_users=True))],
        responses=_READ_RESPONSES,
    )
    async def get_login_records(self, query_string: dict = Depends(parser_management_login_records)) -> dict:
        """
        Delegate validated login-history reads without collecting or interpreting client IPs.

        :param query_string: Account selector and shared DataTable controls.
        :return: Numbered page of stored successful-login snapshots.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await ManagementLoginRecordsModule(**query_string).select()


# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Management - Portfolio Preview
_PREVIEW_DESCRIPTION = (
    "🛡️ **Purpose & Permission:**\n"
    "- Supports the administrator's embedded portfolio preview.\n"
    "- Requires a signed-in, enabled account and role with `is_manage_sites=true`.\n"
    "- Checks current database permissions on every request; role names and client flags do not grant access.\n"
    "- Unpublished portfolios and disabled portfolio owners are included.\n\n"
    "👤 **Portfolio Selection:**\n"
    "- Supply the required `site_id`; no public-user or default-portfolio fallback is used.\n"
    "- Keep the same `site_id` on every content and continuation request.\n"
    "- Supplying `user` or duplicate `site_id` selectors returns 400 `INVALID_SITE_SELECTOR`.\n\n"
    "🌐 **Language:**\n"
    "- Select `en`, `zh-Hans`, or `zh-Hant`; English is the default.\n"
    "- Content uses the selected active language without translation fallback.\n\n"
    "🔒 **Privacy & Caching:**\n"
    "- Send the current browser session cookie; browser requests must include credentials.\n"
    "- Responses use `Cache-Control: private, no-store` and `Vary: Cookie`.\n"
    "- Preview reads do not use the public portfolio response cache.\n\n"
)

_PREVIEW_PAGINATION = (
    "📄 **Pagination:**\n"
    "- `page` starts at 1 and defaults to 1; `size` defaults to and must equal 6.\n"
    "- The response contains `items`, `total`, `pages`, `page`, and `size`.\n"
    "- An empty collection has `items=[]` and `pages=0`; an out-of-range page retains its requested number.\n\n"
)

_PREVIEW_ERRORS = (
    "📝 **Notes:**\n"
    "- Guests and disabled administrator identities return 401 `AUTH_REQUIRED`.\n"
    "- Missing site management permission returns 403 `PORTFOLIO_PREVIEW_FORBIDDEN`.\n"
    "- Missing targets return 404 `NOT_FOUND`; a missing Site translation also returns 404.\n"
    "- Invalid selectors, languages, pages, or sizes return 400; missing required parameters return 422.\n"
    "- Unavailable identity or portfolio storage returns a sanitized 503 response."
)


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Management - Portfolio Preview
@cbv(router)
class ManagementPortfolioPreview:
    """
    Expose management preview reads through the existing portfolio module methods.

    The per-request CBV identity dependency protects every method in this class.
    Views declare the HTTP contract and delegate reads; parsers validate parameters,
    ManagementPermission checks rights, and portfolio modules own the read workflow.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    path = RouteManagement.PREVIEW
    account: dict = Depends(ManagementPermission(is_manage_sites=True, denied_detail="PORTFOLIO_PREVIEW_FORBIDDEN"))

    @router.get(
        f"{path}{RoutePortfolio.SITE}",
        summary="Preview Management Portfolio Site",
        description=(
            "Retrieve localized brand, profile, social links, and contact-bubble content for a management preview.\n\n"
            + _PREVIEW_DESCRIPTION
            + "🗂️ **How It Works:**\n"
            "- Reads the selected portfolio and one active-language translation through PortfolioSiteModule.preview().\n"
            "- Returns the existing four content groups; this endpoint does not use pagination.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
            '  "site_id": 1, "user": "portfolio-owner",\n'
            '  "brand": {"title": "Portfolio", "titleSub": "ENGINEER", "copyrightYear": 2026},\n'
            '  "profile": {"firstName": "Alex", "familyName": "Lee", "nickName": "Alex",\n'
            '    "content": "Profile introduction", "eduCode": "UCL", "program": "MSc",\n'
            '    "introContent": "Introduction", "footerContent": "Footer copy"},\n'
            '  "social": {"linkedin": "", "github": "", "medium": "", "email": "contact@example.com"},\n'
            '  "chatme": {"title": "Contact", "titleSub": "Available", "content": "Contact copy", "icon": "assets/icons/cow-engineer.svg"}\n'
            "}\n"
            "```\n\n"
            + _PREVIEW_ERRORS
        ),
        response_model=RespPortfolioSite,
    )
    async def preview_site(self, query_string: dict = Depends(parser_portfolio_preview)) -> dict:
        """
        Delegate the selected site's preview to its portfolio module.

        :param query_string: Validated site ID and language.
        :return: Existing localized site response.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await PortfolioSiteModule(**query_string).preview()

    @router.get(
        f"{path}{RoutePortfolio.JOURNEY}",
        summary="Preview Management Portfolio Journey",
        description=(
            "Retrieve the complete localized career journey for a management preview.\n\n"
            + _PREVIEW_DESCRIPTION
            + "🗺️ **Order & Map:**\n"
            "- Returns a direct array in saved journey order, without pagination.\n"
            "- Coordinates, organization labels, and detail content share the existing public Journey response contract.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            "[{\n"
            '  "id": 1, "countryCode": "GBR", "countryName": "United Kingdom", "city": "London",\n'
            '  "latitude": 51.5, "longitude": -0.1, "type": "work",\n'
            '  "startMonth": "2025-01", "endMonth": null, "expected": false,\n'
            '  "organizationName": "Example", "organizationCode": "EX", "organizationTitle": "Engineer", "detail": null\n'
            "}]\n"
            "```\n\n"
            + _PREVIEW_ERRORS
        ),
        response_model=list[RespPortfolioJourneyItem],
        response_model_exclude_unset=True,
    )
    async def preview_journey(self, query_string: dict = Depends(parser_portfolio_preview)) -> list[dict]:
        """
        Delegate the selected journey's preview to its portfolio module.

        :param query_string: Validated site ID and language.
        :return: Existing ordered journey response.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await PortfolioJourneyModule(**query_string).preview()

    @router.get(
        f"{path}{RoutePortfolio.EXPERIENCES}",
        summary="Preview Management Portfolio Experiences",
        description=(
            "Retrieve one localized experience page with details and skills for a management preview.\n\n"
            + _PREVIEW_DESCRIPTION
            + _PREVIEW_PAGINATION
            + "🗂️ **How It Works:**\n"
            "- Uses the existing experience ordering and complete detail/skill fields.\n"
            "- Month values use `YYYY-MM`; a null `endMonth` means ongoing.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            '{"items":[],"total":0,"pages":0,"page":1,"size":6}\n'
            "```\n\n"
            + _PREVIEW_ERRORS
        ),
        response_model=RespPortfolioExperiences,
    )
    async def preview_experiences(self, query_string: dict = Depends(parser_portfolio_preview_records)) -> dict:
        """
        Delegate one experience preview page to its portfolio module.

        :param query_string: Validated site ID, language and pagination.
        :return: Existing numbered experience response.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await PortfolioExperiencesModule(**query_string).preview()

    @router.get(
        f"{path}{RoutePortfolio.PROJECTS}",
        summary="Preview Management Portfolio Projects",
        description=(
            "Retrieve one localized project page with full details and skills for a management preview.\n\n"
            + _PREVIEW_DESCRIPTION
            + _PREVIEW_PAGINATION
            + "🗂️ **How It Works:**\n"
            "- Uses saved project display order, with project ID breaking ties.\n"
            "- Each item retains the existing project `detail` and `skills` response fields.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            '{"items":[],"total":0,"pages":0,"page":1,"size":6}\n'
            "```\n\n"
            + _PREVIEW_ERRORS
        ),
        response_model=RespPortfolioProjects,
    )
    async def preview_projects(self, query_string: dict = Depends(parser_portfolio_preview_records)) -> dict:
        """
        Delegate one project preview page to its portfolio module.

        :param query_string: Validated site ID, language and pagination.
        :return: Existing numbered project response.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await PortfolioProjectsModule(**query_string).preview()

    @router.get(
        f"{path}{RoutePortfolio.SKILL_CATEGORIES}",
        summary="Preview Management Portfolio Skill Categories",
        description=(
            "Retrieve localized skill categories and their bounded first skill pages for a management preview.\n\n"
            + _PREVIEW_DESCRIPTION
            + _PREVIEW_PAGINATION
            + "🧩 **Skill Previews & Continuation:**\n"
            "- Categories follow saved position then ID; nested skill previews are read in batches.\n"
            "- Continue through `/management/preview/skills?site_id=<site_id>&ownerType=category&ownerId=<id>&page=2&size=6`.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            '{"items":[{"id":"backend-apis","label":"Backend & APIs",\n'
            ' "skills":{"items":[{"id":"python","label":"Python"}],"total":1,"pages":1,"page":1,"size":6}}],\n'
            ' "total":1,"pages":1,"page":1,"size":6}\n'
            "```\n\n"
            + _PREVIEW_ERRORS
        ),
        response_model=RespPortfolioSkillCategories,
    )
    async def preview_categories(self, query_string: dict = Depends(parser_portfolio_preview_records)) -> dict:
        """
        Delegate category previews and bounded nested skills to their portfolio module.

        :param query_string: Validated site ID, language and pagination.
        :return: Existing numbered category response.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await PortfolioSkillsModule(**query_string).preview_categories()

    @router.get(
        f"{path}{RoutePortfolio.SKILLS}",
        summary="Preview Management Portfolio Skills",
        description=(
            "Retrieve one category-owned localized skill page for a management preview.\n\n"
            + _PREVIEW_DESCRIPTION
            + "🔎 **Category:**\n"
            "- Use `ownerType=category` and the required `ownerId` category slug.\n"
            "- Keep the same `site_id` and `ownerId` on every continuation request.\n"
            "- Unsupported owner types return 400 `INVALID_OWNER`; blank IDs return 400 `INVALID_OWNER_ID`.\n"
            "- Missing owner IDs return 422; unknown categories return 404.\n\n"
            + _PREVIEW_PAGINATION
            + "📦 **Response Format:**\n"
            "```json\n"
            '{"items":[{"id":"python","label":"Python"}],"total":1,"pages":1,"page":1,"size":6}\n'
            "```\n\n"
            + _PREVIEW_ERRORS
        ),
        response_model=RespPortfolioSkills,
    )
    async def preview_skills(self, query_string: dict = Depends(parser_portfolio_preview_skills)) -> dict:
        """
        Delegate the validated category's skill preview to its portfolio module.

        :param query_string: Validated site ID, language, pagination and category owner.
        :return: Existing numbered skill response.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await PortfolioSkillsModule(**query_string).preview_skills()
