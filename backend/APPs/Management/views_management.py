# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.schema.parser import *
from APPs.Management.schema.resp import *
from APPs.Management.module import *
from APPs.Management.constants import ROLE_SORT_FIELDS, SITE_SORT_FIELDS, USER_SORT_FIELDS

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.tools import FastApiRouter, cbv
from SYSTEM.urls import PreFix, RouteManagement, Tags

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends

router = FastApiRouter(prefix=PreFix.MGR, tags=Tags.MGR)

# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Management - Lists
_MANAGEMENT_PAGE_DESCRIPTION = (
    "📄 **Pagination:**\n"
    "- Use `page` and `size`; defaults are `page=1` and `size=6`.\n"
    "- Pages start at 1; size accepts 1–100. Full-fetch values such as `all` are unsupported.\n"
    "- Returns `items`, `total`, `pages`, `page`, and `size`; `pages=ceil(total/size)`.\n"
    "- Empty results use `total=0`, `pages=0`, and `items=[]`.\n"
    "- Requests beyond the last page retain the requested page and matching total, with `items=[]`.\n\n"
)
_MANAGEMENT_ORDERING_DESCRIPTION = (
    "🧩 **Ordering:**\n"
    "- Use up to three distinct `field:asc|desc` pairs, separated by commas, in priority order.\n"
    "- The default is `id:desc`.\n"
    "- Null values sort last in both directions; `id:asc` breaks ties unless ID sorting was specified.\n"
)
_MANAGEMENT_CACHING_DESCRIPTION = (
    "⚡ **Caching:**\n" "- Each request queries the database; these endpoints have no response-cache decorator.\n\n"
)


def _sort_fields_description(fields: tuple[str, ...]) -> str:
    """Document the parser's actual whitelist so allowed fields cannot drift from the query contract."""
    return "- Allowed fields: " + ", ".join(f"`{name}`" for name in fields) + ".\n\n"


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Management - Roles
@cbv(router)
class ManagementRoles:
    """Serve role-management rows through the project's class-based route convention."""

    path = RouteManagement.ROLES

    @router.get(
        path,
        summary="Query Management Roles",
        description=(
            "Retrieve one page of roles for reviewing permissions, role availability, and assigned-account counts.\n\n"
            + _MANAGEMENT_PAGE_DESCRIPTION
            + "🔎 **Search:**\n"
            "- Use `search` for case-insensitive literal matches across `role` and `description`.\n"
            "- Every whitespace-separated word must match either field; words can match different fields.\n"
            "- Percent (`%`) and underscore (`_`) are searched as literal characters.\n"
            "- An empty search applies no search filter; at most 200 characters and 10 words are accepted.\n\n"
            "🔍 **Filters:**\n"
            "- `is_active=true|false` filters role availability.\n"
            "- `is_default=true|false` filters the registration-default role.\n"
            "- Omit a filter to include both states; explicit `false` values apply a filter.\n\n"
            + _MANAGEMENT_ORDERING_DESCRIPTION
            + "- Example: `sort=is_active:desc,user_count:desc,role:asc`.\n"
            + _sort_fields_description(ROLE_SORT_FIELDS)
            + "🗂️ **How It Works:**\n"
            "- Search, filters, ordering, and pagination run in the database.\n"
            "- Each item represents one role; account counts are aggregated before joining roles.\n"
            "- `user_count` includes all assigned accounts, including soft-deleted accounts; no accounts means zero.\n"
            "- `total` counts all matching roles before pagination.\n"
            "- Permission and state fields are booleans; timestamps use UTC ISO 8601.\n\n"
            + _MANAGEMENT_CACHING_DESCRIPTION
            + "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
            '  "items": [{\n'
            '    "id": 2, "role": "editor", "description": "Content editor",\n'
            '    "is_create": true, "is_read": true, "is_update": true, "is_delete": false,\n'
            '    "is_manage_sites": false, "is_manage_users": false, "is_manage_roles": false,\n'
            '    "is_default": false, "is_active": true,\n'
            '    "createtime": "2026-10-12T09:00:00Z", "updatetime": "2026-10-12T09:00:00Z",\n'
            '    "user_count": 3\n'
            "  }],\n"
            '  "total": 1, "pages": 1, "page": 1, "size": 6\n'
            "}\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- Items are named objects; the response has no `data`, `included`, `meta`, or `revision` envelope.\n"
            "- Role descriptions can be null.\n"
            "- Invalid pages return 400 `INVALID_PAGE`; invalid sizes return 400 `INVALID_SIZE`.\n"
            "- Invalid searches return 400 `INVALID_SEARCH`; invalid sorting returns 400 `INVALID_SORT`.\n"
            "- Invalid state filters return 400 `INVALID_IS_ACTIVE` or `INVALID_IS_DEFAULT`.\n"
            "- Unavailable storage returns 503 `MANAGEMENT_DATABASE_UNAVAILABLE`."
        ),
        response_model=RespManagementRoles,
        responses={400: {"description": "Invalid management query."}, 503: {"description": "Storage unavailable."}},
    )
    async def get_roles(self, query_string: dict = Depends(parser_management_roles)) -> dict:
        """
        Delegate parser-validated query values to the role module and serialize the declared response.

        :param query_string: Typed pagination, search, sorting and state filters.
        :return: One page of role records with consistent matching totals.
        """
        return await ManagementRolesModule(**query_string).select()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Management - Users
@cbv(router)
class ManagementUsers:
    """Serve one account per administrative row with role and successful-login summaries."""

    path = RouteManagement.USERS

    @router.get(
        path,
        summary="Query Management Users",
        description=(
            "Retrieve one page of accounts for reviewing identity, role assignment, account state, and login activity.\n\n"
            + _MANAGEMENT_PAGE_DESCRIPTION
            + "🔎 **Search:**\n"
            "- Use `search` for case-insensitive literal matches across `user`, login `email`, and `role`.\n"
            "- Every whitespace-separated word must match either field; percent and underscore are literal.\n"
            "- An empty search applies no filter; at most 200 characters and 10 words are accepted.\n\n"
            "🔍 **Filters:**\n"
            "- `is_active=true|false` filters the account state; inactive accounts remain available for review.\n"
            "- `role_is_active=true|false` filters whether the assigned role allows sign-in.\n"
            "- `has_site=true|false` filters portfolio presence, independently of publication.\n"
            "- `role_id` selects one role ID from 1 to 2147483647.\n"
            "- Omit filters to include all accounts; explicit `false` applies a filter.\n\n"
            + _MANAGEMENT_ORDERING_DESCRIPTION
            + "- Example: `sort=login_count:desc,last_login:desc,user:asc`.\n"
            + _sort_fields_description(USER_SORT_FIELDS)
            + "🗂️ **How It Works:**\n"
            "- Search, filters, ordering, and pagination run in the database before reading a page.\n"
            "- Every item represents one account, including inactive accounts and accounts without a portfolio.\n"
            "- `site_id` is null without a portfolio; `has_site` indicates whether one exists.\n"
            "- Login records are aggregated before joining: `login_count` counts successful sign-ins and "
            "`last_login` is the latest successful sign-in. No records means zero and null respectively.\n"
            "- Role state and account state are separate; both must be active to sign in.\n"
            "- Timestamps use UTC ISO 8601; passwords and password hashes are never selected or returned.\n\n"
            + _MANAGEMENT_CACHING_DESCRIPTION
            + "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
            '  "items": [{\n'
            '    "id": 1, "user": "portfolio-owner", "email": "owner@example.com",\n'
            '    "role_id": 2, "role": "editor", "is_active": true, "role_is_active": true,\n'
            '    "site_id": 1, "has_site": true, "login_count": 3,\n'
            '    "last_login": "2026-10-12T09:00:00Z",\n'
            '    "createtime": "2026-10-01T09:00:00Z", "updatetime": "2026-10-12T09:00:00Z"\n'
            "  }],\n"
            '  "total": 1, "pages": 1, "page": 1, "size": 6\n'
            "}\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- Items are named objects in the same five-field envelope as the role list.\n"
            "- Invalid pages/sizes return 400 `INVALID_PAGE`/`INVALID_SIZE`.\n"
            "- Invalid search/sorting returns 400 `INVALID_SEARCH`/`INVALID_SORT`.\n"
            "- Invalid filters return 400 `INVALID_IS_ACTIVE`, `INVALID_ROLE_IS_ACTIVE`, "
            "`INVALID_HAS_SITE`, or `INVALID_ROLE_ID`.\n"
            "- Unavailable storage returns 503 `MANAGEMENT_DATABASE_UNAVAILABLE`."
        ),
        response_model=RespManagementUsers,
        responses={400: {"description": "Invalid management query."}, 503: {"description": "Storage unavailable."}},
    )
    async def get_users(self, query_string: dict = Depends(parser_management_users)) -> dict:
        """
        Return one numbered account page through the modular parser and query executor.

        :param query_string: Typed pagination, literal search, ordered sorting and account/role filters.
        :return: Account identity, state and summarized login activity in the shared envelope.
        """
        return await ManagementUsersModule(**query_string).select()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Management - Platform
@cbv(router)
class ManagementSites:
    """Serve one person's portfolio and selected-language content per administrative row."""

    path = RouteManagement.SITES

    @router.get(
        path,
        summary="Query Management Platform Sites",
        description=(
            "Retrieve one page of people and their portfolios for reviewing publication, homepage selection, "
            "public links, profile content, and contact-bubble content.\n\n"
            + _MANAGEMENT_PAGE_DESCRIPTION
            + "🌐 **Language:**\n"
            "- Select `locale=en`, `zh-Hans`, or `zh-Hant`; English is the default.\n"
            "- Search and returned localized content use only this management language.\n"
            "- Missing translations remain null; there is no fallback to another language.\n\n"
            "🔎 **Search:**\n"
            "- Use `search` for case-insensitive literal matches across the owner `user`, public contact `email`, "
            "and all returned localized brand, name, profile, education, introduction, footer, and chat text.\n"
            "- Login email and other languages are not searched.\n"
            "- Every whitespace-separated word must match a searchable field; percent and underscore are literal.\n"
            "- An empty search applies no filter; at most 200 characters and 10 words are accepted.\n\n"
            "🔍 **Filters:**\n"
            "- `owner_is_active=true|false` filters the owner's account state.\n"
            "- `has_site=true|false` filters portfolio presence.\n"
            "- `is_published=true|false` filters an existing portfolio's publication flag.\n"
            "- `is_default=true|false` filters an existing portfolio's homepage flag.\n"
            "- `has_translation=true|false` filters content presence in the requested language.\n"
            "- Omit filters to include all states; missing-site null flags do not match explicit false filters.\n\n"
            + _MANAGEMENT_ORDERING_DESCRIPTION
            + "- Example: `sort=is_published:desc,brand_title:asc,user:asc`.\n"
            + _sort_fields_description(SITE_SORT_FIELDS)
            + "🗂️ **How It Works:**\n"
            "- The account `id` identifies the person-based row; `site_id` identifies that person's portfolio.\n"
            "- `updatetime` is the primary account's UTC update time, including accounts without a portfolio; "
            "it does not record changes to website settings or localized content.\n"
            "- All accounts are included, even without a portfolio or the selected translation.\n"
            "- Unique ownership and a single selected-language join ensure one person per row.\n"
            "- Without a site, `has_site=false` and site fields are null. Without a translation, "
            "`has_translation=false` and localized fields are null.\n"
            "- Public contact `email` is separate from the login email; `chat_icon` is the contact-bubble icon path.\n"
            "- Publication and homepage flags are stored site settings; an inactive owner's site is not public.\n"
            "- Search, filters, ordering, totals, and pagination run in the database.\n\n"
            + _MANAGEMENT_CACHING_DESCRIPTION
            + "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
            '  "items": [{\n'
            '    "id": 1, "user": "portfolio-owner", "owner_is_active": true,\n'
            '    "site_id": 1, "has_site": true, "is_published": true, "is_default": false,\n'
            '    "copyright_year": 2026, "linkedin": "", "github": "", "medium": "",\n'
            '    "email": "contact@example.com", "chat_icon": "assets/icons/cow-engineer.svg",\n'
            '    "locale": "en", "has_translation": true,\n'
            '    "brand_title": "ZL", "brand_title_sub": "WILSON",\n'
            '    "first_name": "Zheng", "family_name": "Lee", "nick_name": "Wilson",\n'
            '    "profile_content": "Software engineer", "edu_code": "UCL",\n'
            '    "program": "MSc Software Systems Engineering", "intro_content": "Welcome",\n'
            '    "footer_content": "Building software", "chat_title": "London",\n'
            '    "chat_title_sub": "Open to opportunities", "chat_content": "Contact me",\n'
            '    "updatetime": "2026-10-12T09:00:00Z"\n'
            "  }],\n"
            '  "total": 1, "pages": 1, "page": 1, "size": 6\n'
            "}\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- Account identity is displayed here for ownership; account and role settings belong to User/Role management.\n"
            "- Portfolios have no creation/update timestamp columns; `updatetime` refers only to the owner account.\n"
            "- Invalid language returns 400 `INVALID_LOCALE`; invalid page/size returns `INVALID_PAGE`/`INVALID_SIZE`.\n"
            "- Invalid search/sorting returns 400 `INVALID_SEARCH`/`INVALID_SORT`.\n"
            "- Invalid filters return 400 `INVALID_OWNER_IS_ACTIVE`, `INVALID_HAS_SITE`, `INVALID_IS_PUBLISHED`, "
            "`INVALID_IS_DEFAULT`, or `INVALID_HAS_TRANSLATION`.\n"
            "- Unavailable storage returns 503 `MANAGEMENT_DATABASE_UNAVAILABLE`."
        ),
        response_model=RespManagementSites,
        responses={400: {"description": "Invalid management query."}, 503: {"description": "Storage unavailable."}},
    )
    async def get_sites(self, query_string: dict = Depends(parser_management_sites)) -> dict:
        """
        Return one selected-language portfolio row per person without applying public visibility restrictions.

        :param query_string: Management language, pagination, literal search, ordering and optional owner/site states.
        :return: One page of people and their nullable site/translation data.
        """
        return await ManagementSitesModule(**query_string).select()
