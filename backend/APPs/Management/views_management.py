# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.schema.parser.parser_portfolio_preview import *
from APPs.Auth.schema.resp import RespAuthUser
from APPs.Management.schema.parser import *
from APPs.Management.schema.resp import *
from APPs.Management.schema.body import *
from APPs.Portfolio.schema.resp import *
from APPs.Management.constants import *
from APPs.Management.module import *
from APPs.Portfolio.module import *

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.urls import PreFix, RouteManagement, RoutePortfolio, Tags
from SYSTEM.settings import SEC_MANAGEMENT_ORIGINS
from SYSTEM.tools import FastApiRouter, cbv
from SYSTEM.models import AuthRole
from SYSTEM.constants import *

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi import Depends, HTTPException, Request
from starlette.requests import ClientDisconnect
from fastapi.routing import APIRoute

# ◆—< Pack >—————————————————————————————————◆ Python
from http import HTTPMethod
import json


# ■—< ROUTE >——————————————————————————————————————————————————————————————————————————■ Management - Request Boundary
class ManagementRoute(APIRoute):
    """
    Bound platform JSON writes and keep private errors free of submitted input values.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    @staticmethod
    def _unique_object(pairs: list[tuple]) -> dict:
        """
        Reject duplicate JSON keys instead of silently using the last submitted assignment.

        :param pairs: Decoded object entries, including duplicate keys.
        :return: Unique-key object.
        :raises ValueError: A field was supplied more than once.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate JSON key.")
            result[key] = value
        return result

    @staticmethod
    def _reject_constant(value: str):
        """
        Reject nonstandard JSON NaN/Infinity constants before field validation.

        :param value: Invalid JSON numeric constant.
        :raises ValueError: Such constants are never accepted in a management write.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        raise ValueError("Non-finite JSON number.")

    def get_route_handler(self):
        """
        Apply bounded JSON decoding to management writes and sanitize all validation errors.

        :return: Handler preserving normal FastAPI dependency injection and response validation.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        route_handler = super().get_route_handler()

        async def handle(request: Request):
            """
            Validate the transport before normal parsing and attach private response headers.

            :param request: Current request; write bodies use the bounded JSON/content policy.
            :return: Original endpoint response without a new envelope.
            :raises HTTPException: Invalid transport, input, authentication or resource state.

                                                                                               ♂ ZhengLee 2026.10.15
            """
            try:
                if request.method in (
                    HTTPMethod.PATCH,
                    HTTPMethod.DELETE,
                    HTTPMethod.POST,
                ):
                    deleting = request.method != HTTPMethod.PATCH
                    # --------------------------------------● Step 1. Reject cross-origin browser writes and unsupported encodings.
                    origin = request.headers.get(EnumHttpHeader.ORIGIN)
                    if origin and origin not in {
                        str(request.base_url).rstrip("/"),
                        *SEC_MANAGEMENT_ORIGINS,
                    }:
                        raise HTTPException(status_code=403, detail=EnumManagementError.INVALID_ORIGIN)
                    if (
                        request.headers.get(EnumHttpHeader.CONTENT_TYPE, "").split(";", 1)[0].strip().lower()
                        != EnumMediaType.JSON
                        or request.headers.get(
                            EnumHttpHeader.CONTENT_ENCODING,
                            EnumContentEncoding.IDENTITY,
                        ).lower()
                        != EnumContentEncoding.IDENTITY
                    ):
                        raise HTTPException(
                            status_code=415,
                            detail=EnumManagementError.JSON_BODY_REQUIRED,
                        )
                    # --------------------------------------● Step 2. Enforce actual streamed bytes, including chunked bodies.
                    chunks, length = [], 0
                    async for chunk in request.stream():
                        length += len(chunk)
                        if length > (MANAGEMENT_DELETE_MAX_BYTES if deleting else SITE_PATCH_MAX_BYTES):
                            raise HTTPException(
                                status_code=413,
                                detail=(
                                    EnumManagementError.MANAGEMENT_DELETE_TOO_LARGE
                                    if deleting
                                    else (
                                        EnumManagementError.PLATFORM_PATCH_TOO_LARGE
                                        if request.url.path.startswith(f"{PreFix.MGR}{RouteManagement.SITES}/")
                                        else EnumManagementError.MANAGEMENT_PATCH_TOO_LARGE
                                    )
                                ),
                            )
                        chunks.append(chunk)
                    # Starlette caches body bytes here; FastAPI then performs its normal body/schema parsing.
                    request._body = b"".join(chunks)
                    try:
                        json.loads(
                            request._body.decode(TEXT_ENCODING),
                            object_pairs_hook=self._unique_object,
                            parse_constant=self._reject_constant,
                        )
                    except (ValueError, UnicodeError, RecursionError):
                        raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_JSON) from None
                response = await route_handler(request)
            except ClientDisconnect:
                raise HTTPException(
                    status_code=400,
                    detail=EnumManagementError.INVALID_BODY,
                    headers=MANAGEMENT_PRIVATE_HEADERS,
                ) from None
            except RequestValidationError as error:
                detail = [{"loc": item["loc"], "type": item["type"], "msg": item["msg"]} for item in error.errors()]
                raise HTTPException(status_code=422, detail=detail, headers=MANAGEMENT_PRIVATE_HEADERS) from None
            except HTTPException as error:
                error.headers = {**(error.headers or {}), **MANAGEMENT_PRIVATE_HEADERS}
                raise
            response.headers.update(MANAGEMENT_PRIVATE_HEADERS)
            return response

        return handle


router = FastApiRouter(prefix=PreFix.MGR, tags=Tags.MGR, route_class=ManagementRoute)

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

_DELETE_RESPONSES = {
    **_READ_RESPONSES,
    404: {"description": "Target confirmation does not match."},
    409: {"description": "A protected, changed or referenced target prevents the whole batch."},
    413: {"description": "Delete body exceeds 64 KiB."},
    415: {"description": "Uncompressed application/json required."},
    422: {"description": "Invalid, repeated or excessive targets."},
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
        dependencies=[Depends(ManagementPermission(AuthRole.is_manage_roles))],
        responses=_READ_RESPONSES,
    )
    async def get_roles(self, query_string: dict = Depends(parser_management_roles)) -> dict:
        """Execute the validated role query without exposing credentials."""
        return await ManagementRolesModule(**query_string).select()

    @router.patch(
        f"{path}/{{role_id}}",
        response_model=RespManagementRole,
        summary="Update Management Role",
        description=_PERMISSION_DESCRIPTION
        + "Requires is_manage_roles. Confirms the ID and original role name. Send changes and matching expected original values. Permissions, state and registration Default update atomically. A registration Default must remain active without management flags; the final effective role manager cannot be removed.",
        responses={
            **_READ_RESPONSES,
            404: {"description": "Target confirmation does not match."},
            409: {"description": "Original values, default, manager or uniqueness conflict."},
            422: {"description": "Invalid mutable assignments."},
        },
    )
    async def patch_role(
        self,
        parameters: ManagementRolePatchParameters = Depends(parser_management_role_patch),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_roles)),
    ) -> dict:
        """Delegate to the same class as GET; the module owns all transactional decisions."""
        return await ManagementRolesModule().update(
            parameters.role_id,
            parameters.changes,
            expected_role=parameters.expected_role,
            expected=parameters.expected,
            actor_id=actor.id,
        )

    @router.delete(
        f"{path}/{{role_id}}",
        response_model=RespManagementRoleDeletion,
        summary="Delete Management Role",
        responses=_DELETE_RESPONSES,
        description=_PERMISSION_DESCRIPTION + "Requires is_manage_roles. Confirm expected_role. "
        "Only unused, non-default roles may be deleted; inactive accounts still count as assignments. "
        "Accounts and portfolios are never cascaded. No query selectors; 64 KiB JSON body.",
    )
    async def delete_role(
        self,
        parameters: ManagementRoleDeleteParameters = Depends(parser_management_role_delete),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_roles)),
    ) -> dict:
        """Delegate a single role to the original class's atomic delete method. ♂ ZhengLee 2026.10.16"""
        return await ManagementRolesModule().delete(parameters.targets, actor_id=actor.id)

    @router.post(
        RouteManagement.ROLE_BULK_DELETE,
        response_model=RespManagementRoleDeletion,
        summary="Bulk Delete Management Roles",
        responses=_DELETE_RESPONSES,
        description=_PERMISSION_DESCRIPTION + "Requires is_manage_roles. Submit 1–100 unique targets "
        "with role_id and expected_role. Every role must be unused and non-default; all succeed or all roll back. "
        "Accounts and portfolios remain untouched. No query selectors; 64 KiB JSON body.",
    )
    async def bulk_delete_roles(
        self,
        parameters: ManagementRoleDeleteParameters = Depends(parser_management_role_bulk_delete),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_roles)),
    ) -> dict:
        """Keep batch business rules in ManagementRolesModule, alongside select/update/delete."""
        return await ManagementRolesModule().delete(parameters.targets, actor_id=actor.id)


@cbv(router)
class ManagementUsers:
    """Read one row per account with joined role, optional site and login aggregates."""

    path = RouteManagement.USERS

    @router.get(
        path,
        summary="Query Management Users",
        description=_PERMISSION_DESCRIPTION + "Required flag: is_manage_users. " + _COLUMN_QUERY_DESCRIPTION,
        response_model=RespManagementUsers,
        dependencies=[Depends(ManagementPermission(AuthRole.is_manage_users))],
        responses=_READ_RESPONSES,
    )
    async def get_users(self, query_string: dict = Depends(parser_management_users)) -> dict:
        """Filter the account projection before counting and paging."""
        return await ManagementUsersModule(**query_string).select()

    @router.get(
        f"{path}{RouteManagement.ROLE_OPTIONS}",
        summary="Query User Role Assignment Choices",
        description=_PERMISSION_DESCRIPTION
        + "Requires is_manage_users. Search and page role names. Inactive roles and roles granting permissions the actor lacks cannot be assigned. Writes recheck under lock.",
        response_model=RespManagementRoleOptions,
        responses=_READ_RESPONSES,
    )
    async def get_role_options(
        self,
        query_string: dict = Depends(parser_management_role_options),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_users)),
    ) -> dict:
        """Reuse the User module for role assignment choices. ♂ ZhengLee 2026.10.16"""
        return await ManagementUsersModule(**query_string).role_options(actor.id)

    @router.patch(
        f"{path}/{{account_id}}",
        response_model=RespManagementUser,
        summary="Update Management User",
        description=_PERMISSION_DESCRIPTION
        + "Requires is_manage_users. Accepts is_active and role_id with existing email confirmation and matching expected original values. Role assignment requires an active role granting no permissions the actor lacks. A Default website's account cannot be disabled; clear or switch its website Default first (409 DEFAULT_SITE_DEACTIVATE_FORBIDDEN). All other identity/FKs and password remain read-only. The final effective role manager must be retained.",
        responses={
            **_READ_RESPONSES,
            404: {"description": "ID/email confirmation does not match."},
            409: {"description": "Original values or final role manager conflict."},
            422: {"description": "Invalid mutable assignments."},
        },
    )
    async def patch_user(
        self,
        parameters: ManagementUserPatchParameters = Depends(parser_management_user_patch),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_users)),
    ) -> dict:
        """Reuse account-state decisions with Platform without substituting its permission gate."""
        return await ManagementUsersModule().update(
            parameters.account_id,
            parameters.changes,
            expected_email=parameters.expected_email,
            expected=parameters.expected,
            actor_id=actor.id,
        )

    @router.delete(
        f"{path}/{{account_id}}",
        response_model=RespManagementUserDeletion,
        summary="Delete Management User",
        responses=_DELETE_RESPONSES,
        description=_PERMISSION_DESCRIPTION + "Requires is_manage_users. Confirm expected_email and required "
        "expected_site_id (null when no website exists). Permanently removes the account, login history and owned "
        "website in every language; shared roles and languages survive. Replace Default first and retain an effective "
        "role manager. No query selectors; 64 KiB JSON. Committed cache failure returns "
        "MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE and X-Management-Update-State: committed; never retry automatically.",
    )
    async def delete_user(
        self,
        parameters: ManagementUserDeleteParameters = Depends(parser_management_user_delete),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_users)),
    ) -> dict:
        """Delegate account-owned cleanup to the original User business class. ♂ ZhengLee 2026.10.16"""
        return await ManagementUsersModule().delete(parameters.targets, actor_id=actor.id)

    @router.post(
        RouteManagement.USER_BULK_DELETE,
        response_model=RespManagementUserDeletion,
        summary="Bulk Delete Management Users",
        responses=_DELETE_RESPONSES,
        description=_PERMISSION_DESCRIPTION + "Requires is_manage_users. Submit 1–100 unique targets with "
        "account_id, expected_email and required expected_site_id (nullable). All confirmations, Default and last-manager "
        "rules are checked before deleting any account-owned data. One failure rolls back the whole batch. "
        "No query selectors; 64 KiB JSON. A committed cache failure is explicit and must not be retried automatically.",
    )
    async def bulk_delete_users(
        self,
        parameters: ManagementUserDeleteParameters = Depends(parser_management_user_bulk_delete),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_users)),
    ) -> dict:
        """One atomic batch, without separately committed per-user requests."""
        return await ManagementUsersModule().delete(parameters.targets, actor_id=actor.id)


@cbv(router)
class ManagementSites:
    """Read and patch owner-based platform settings through one resource CBV."""

    path = RouteManagement.SITES

    @router.get(
        path,
        summary="Query Management Platform Sites",
        description=_PERMISSION_DESCRIPTION
        + "Required flag: is_manage_sites. "
        + _COLUMN_QUERY_DESCRIPTION
        + " locale is en/zh-Hans/zh-Hant, default en; there is no language fallback. has_profile checks for a career with the requested translation using EXISTS without filtering inactive target data; has_site only indicates website presence. profile_name predicates use the selected language's full name or nickname, excluding presentation placeholders.",
        response_model=RespManagementSites,
        dependencies=[Depends(ManagementPermission(AuthRole.is_manage_sites))],
        responses=_READ_RESPONSES,
    )
    async def get_sites(self, query_string: dict = Depends(parser_management_sites)) -> dict:
        """Apply selected-language predicates without changing publication or default state."""
        return await ManagementSitesModule(**query_string).select()

    @router.patch(
        f"{path}/{{account_id}}",
        summary="Update Management Platform Site",
        description=(
            "Patch an existing owner's platform settings and the selected language's content.\n\n"
            "🛡️ **Permission & Identity:**\n"
            "- Requires the current enabled account/role with `is_manage_sites=true`; content `is_update` is separate.\n"
            "- Path `account_id` matches the Platform row's `id`, not its `site_id`.\n"
            "- Body `expected_owner_email` must match that same account under lock; it is confirmation, never an update.\n"
            "- PKs, FKs, owner login email, public user, timestamps and derived fields are read-only; owner_is_active is editable.\n\n"
            "📨 **Partial Update:**\n"
            "- Send application/json with `expected_owner_email`, matching `expected` original values and a nonempty `changes` object; limit 256 KiB.\n"
            "- Only explicitly submitted fields change. Null, unknown fields, duplicate keys and type coercion are rejected.\n"
            "- `locale` selects existing en/zh-Hans/zh-Hant content (default en); other query controls are rejected.\n"
            "- Activation-only changes also support accounts without a site. Missing sites are never created; translation edits require an existing translation, including disabled languages.\n"
            "- Text is plain text; bounded long-copy fields accept up to 10,000 characters.\n"
            "- Social links require HTTP(S); empty links/contact email hide them. Icons must be bundled/allowlisted.\n\n"
            "🔄 **Transaction & Default:**\n"
            "- All settings/translation writes commit together or roll back together.\n"
            "- A new Default requires an active owner and final published state; it atomically replaces the old Default.\n"
            "- A Default website's owner cannot be disabled (409 DEFAULT_SITE_DEACTIVATE_FORBIDDEN). Clear or switch Default first, or explicitly clear Default in the same PATCH. Active never implicitly clears Default. Unpublishing still clears Default. Explicit Default=true with an unpublished final state is a 409 conflict.\n"
            "- Only account activation may change; its existing onupdate maintains Updated. Identity and explicit timestamp writes remain forbidden.\n\n"
            "📦 **Response & Cache:**\n"
            "- Returns one complete Platform row using the same projection as GET, with private/no-store headers.\n"
            "- Public portfolio response caches are invalidated after commit.\n"
            "- A post-commit cache failure returns 503 MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE and\n"
            "  X-Management-Update-State: committed; refetch because the database changes already succeeded.\n"
            "- Invalid input errors omit submitted values and internal database details."
        ),
        response_model=RespManagementSite,
        dependencies=[Depends(ManagementPermission(AuthRole.is_manage_sites))],
        responses={
            **_READ_RESPONSES,
            404: {"description": "ID/email confirmation, website or required translation is missing."},
            409: {"description": "Invalid Default state or concurrent database constraint conflict."},
            413: {"description": "Patch exceeds 256 KiB."},
            415: {"description": "An uncompressed application/json body is required."},
            422: {"description": "Invalid, empty, null or read-only field assignment."},
        },
    )
    async def patch_site(
        self,
        parameters: ManagementSitePatchParameters = Depends(parser_management_site_patch),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_sites)),
    ) -> dict:
        """
        Delegate validated assignments to the existing Platform module's update method.

        :param parameters: Owner PK/email confirmation, selected language and explicitly submitted changes.
        :return: Updated complete Platform row; the module owns commit and cache invalidation.
        :raises HTTPException: Authorization, validation, missing records or update conflicts.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await ManagementSitesModule(locale=parameters.locale).update(
            account_id=parameters.account_id,
            changes=parameters.changes,
            expected_owner_email=parameters.expected_owner_email,
            expected=parameters.expected,
            actor_id=actor.id,
        )

    @router.delete(
        f"{path}/{{account_id}}",
        summary="Delete Management Platform Site",
        response_model=RespManagementSiteDeletion,
        description=_PERMISSION_DESCRIPTION
        + "Requires is_manage_sites. Path ID is the owner account ID. Confirm expected_owner_email and expected_site_id. "
        "Physically deletes the website and ALL languages/child content, preserving the account, role, login history and shared locales. "
        "Replace Default before deleting. No query parameters. Limit 64 KiB uncompressed JSON. "
        "Uses the same atomic transaction as bulk-delete. A committed cache failure returns 503 "
        "MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE with X-Management-Update-State: committed; do not retry automatically.",
        responses={
            **_READ_RESPONSES,
            404: {"description": "Confirmation or website missing."},
            409: {"description": "Changed website, Default protection or FK conflict."},
            413: {"description": "Delete body exceeds 64 KiB."},
            415: {"description": "Uncompressed JSON required."},
            422: {"description": "Invalid delete target."},
        },
    )
    async def delete_site(
        self,
        parameters: ManagementSiteDeleteParameters = Depends(parser_management_site_delete),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_sites)),
    ) -> dict:
        """Normalize one confirmed target into the original Platform class's shared delete transaction.

        ♂ ZhengLee 2026.10.16
        """
        return await ManagementSitesModule().delete(parameters.targets, actor_id=actor.id)

    @router.post(
        RouteManagement.SITE_BULK_DELETE,
        summary="Bulk Delete Management Platform Sites",
        response_model=RespManagementSiteDeletion,
        description=_PERMISSION_DESCRIPTION
        + "Requires is_manage_sites. Submit targets with account_id, expected_owner_email and expected_site_id. "
        "Accepts 1–100 unique owners/sites, 64 KiB uncompressed JSON, and no query selectors. "
        "Every target is checked before any deletion; one failure rolls back the whole batch. "
        "Default must be replaced first. All site languages/content cascade; accounts, roles and login history remain. "
        "Committed cache failure is explicit and must not be retried automatically.",
        responses={
            **_READ_RESPONSES,
            404: {"description": "Confirmation or website missing."},
            409: {"description": "Changed website, Default protection or FK conflict."},
            413: {"description": "Delete body exceeds 64 KiB."},
            415: {"description": "Uncompressed JSON required."},
            422: {"description": "Invalid or repeated targets."},
        },
    )
    async def bulk_delete_sites(
        self,
        parameters: ManagementSiteDeleteParameters = Depends(parser_management_site_bulk_delete),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_sites)),
    ) -> dict:
        """Delegate one atomic batch; the view never loops over separately committed single deletes."""
        return await ManagementSitesModule().delete(parameters.targets, actor_id=actor.id)


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
            "- geo_status preserves the stored GeoIP outcome; reads never call GeoIP.\n"
            "- is_online observes this page's IP heartbeat keys in Redis (60-second TTL); it is not account-session status.\n"
            "- Missing IP or absent heartbeat is false; Redis unavailability is null. Live status cannot be SQL-filtered or sorted.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
            '  "items": [{"id": 1, "user_id": 1, "email": "developer@example.com",\n'
            '    "logintime": "2026-10-15T09:00:00Z", "ip_address": null,\n'
            '    "country_code": null, "region": null, "city": null, "geo_status": "unknown", "is_online": false}],\n'
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
        dependencies=[Depends(ManagementPermission(AuthRole.is_manage_users))],
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
    "- Unpublished portfolios, disabled portfolio owners and disabled language records are included.\n\n"
    "👤 **Portfolio Selection:**\n"
    "- Supply the required `site_id`; no public-user or default-portfolio fallback is used.\n"
    "- Keep the same `site_id` on every content and continuation request.\n"
    "- Supplying `user` or duplicate `site_id` selectors returns 400 `INVALID_SITE_SELECTOR`.\n\n"
    "🌐 **Language:**\n"
    "- Select `en`, `zh-Hans`, or `zh-Hant`; English is the default.\n"
    "- Content uses the selected language even when disabled, without translation fallback.\n\n"
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
    account: RespAuthUser = Depends(
        ManagementPermission(
            AuthRole.is_manage_sites,
            denied_detail=EnumManagementError.PORTFOLIO_PREVIEW_FORBIDDEN,
        )
    )

    @router.get(
        f"{path}{RoutePortfolio.SITE}",
        summary="Preview Management Portfolio Site",
        description=(
            "Retrieve localized brand, profile, social links, and contact-bubble content for a management preview.\n\n"
            + _PREVIEW_DESCRIPTION
            + "🗂️ **How It Works:**\n"
            "- Reads the selected portfolio and one selected-language translation (including disabled languages) through PortfolioSiteModule.preview().\n"
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
            "```\n\n" + _PREVIEW_ERRORS
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
            "```\n\n" + _PREVIEW_ERRORS
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
            "```\n\n" + _PREVIEW_ERRORS
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
            "```\n\n" + _PREVIEW_ERRORS
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
            "```\n\n" + _PREVIEW_ERRORS
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
            "```\n\n" + _PREVIEW_ERRORS
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
