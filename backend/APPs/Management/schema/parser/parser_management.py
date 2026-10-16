"""Validate management pages, ordered sorting and typed column predicates."""

from fastapi import Body, Depends, HTTPException, Path, Query, Request
from APPs.Management.schema.body import BodyManagementSitePatchRequest, ManagementSitePatchParameters
from SYSTEM.constants import EnumLocal
from APPs.Management.constants import (
    MANAGEMENT_DEFAULT_SIZE,
    MANAGEMENT_DEFAULT_SORT,
    MANAGEMENT_MAX_PAGE,
    MANAGEMENT_MAX_SIZE,
    MANAGEMENT_MAX_SORT_FIELDS,
    ROLE_SORT_FIELDS,
    USER_SORT_FIELDS,
    SITE_SORT_FIELDS,
    ROLE_FILTER_FIELDS,
    USER_FILTER_FIELDS,
    SITE_FILTER_FIELDS,
    LOGIN_DEFAULT_SORT,
    LOGIN_SORT_FIELDS,
    LOGIN_FILTER_FIELDS,
    EnumManagementField,
    EnumManagementError,
    EnumSortDirection,
)
from COMMON.schema.parser import parser_locale
from COMMON.schema.parser.parser_column_filters import parse_column_filters
from COMMON.schema.parser.parser_table_search import parse_table_search


def _positive_integer(value: str, maximum: int, detail: str) -> int:
    try:
        parsed = int(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=detail) from None
    if not 1 <= parsed <= maximum:
        raise HTTPException(status_code=400, detail=detail)
    return parsed


def _parse_sort(
    value: str, fields: tuple[str, ...], *, id_direction: str = EnumSortDirection.ASC
) -> tuple[tuple[str, str], ...]:
    """
    Validate ordered resource fields and append the configured stable ID tie-breaker.

    :param value: One to three unique field:direction pairs from the request.
    :param fields: Resource-specific allowlist of sortable SQL projection names.
    :param id_direction: Internal tie-breaker policy; history uses desc and other lists use asc.
    :return: Validated ordering, with exactly one ID criterion.
    :raises HTTPException: Unsupported, repeated or malformed sort criteria return 400.

                                                                                               ♂ ZhengLee 2026.10.15
    """
    pairs = value.split(",")
    if not 1 <= len(pairs) <= MANAGEMENT_MAX_SORT_FIELDS:
        raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_SORT)
    result = []
    seen = set()
    for pair in pairs:
        parts = [part.strip() for part in pair.split(":")]
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_SORT)
        field, direction = parts
        if field not in fields or direction not in (EnumSortDirection.ASC, EnumSortDirection.DESC) or field in seen:
            raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_SORT)
        seen.add(field)
        result.append((EnumManagementField(field), EnumSortDirection(direction)))
    if EnumManagementField.ID not in seen:
        result.append((EnumManagementField.ID, id_direction))
    return tuple(result)


def parser_management_pagination(
    page: str = Query(default="1", description="One-based page; pages beyond the end return empty items."),
    size: str = Query(default=str(MANAGEMENT_DEFAULT_SIZE), description="Rows per page, from 1 to 100; default 6."),
) -> dict[str, int]:
    """
    Parse bounded management pages without changing Portfolio's fixed six-record contract.

    :param page: Positive one-based page number, bounded by the JavaScript safe-integer range.
    :param size: Positive number of rows, at most one hundred.
    :return: Validated page and size values.
    :raises HTTPException: Page or size is invalid; full-fetch values are unsupported.
    """
    return {
        "page": _positive_integer(page, MANAGEMENT_MAX_PAGE, EnumManagementError.INVALID_PAGE),
        "size": _positive_integer(size, MANAGEMENT_MAX_SIZE, EnumManagementError.INVALID_SIZE),
    }


def parser_management_roles(
    request: Request,
    search: str | None = Query(default=None, description="Case-insensitive literal substring search."),
    search_fields: str | None = Query(default=None, description="JSON array of search field names, combined with OR."),
    filters: str = Query(
        default="[]",
        description="JSON array of {field, operator, value?}; one typed predicate per column, combined with AND.",
    ),
    sort: str = Query(default=MANAGEMENT_DEFAULT_SORT, description="Up to three ordered field:asc/desc criteria."),
    pagination: dict[str, int] = Depends(parser_management_pagination),
) -> dict:
    """Validate role column predicates and page controls."""
    if set(request.query_params) - {"filters", "sort", "page", "size", "search", "search_fields"}:
        raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_QUERY)
    return {
        **pagination,
        "filters": parse_column_filters(filters, ROLE_FILTER_FIELDS),
        "sort": _parse_sort(sort, ROLE_SORT_FIELDS),
        "search": _parse_search(request, search, search_fields, ROLE_FILTER_FIELDS),
    }


def parser_management_users(
    request: Request,
    search: str | None = Query(default=None, description="Case-insensitive literal substring search."),
    search_fields: str | None = Query(default=None, description="JSON array of search field names, combined with OR."),
    filters: str = Query(default="[]", description="JSON array of typed column predicates, combined with AND."),
    sort: str = Query(default=MANAGEMENT_DEFAULT_SORT, description="Up to three ordered field:asc/desc criteria."),
    pagination: dict[str, int] = Depends(parser_management_pagination),
) -> dict:
    """Validate account column predicates and page controls."""
    if set(request.query_params) - {"filters", "sort", "page", "size", "search", "search_fields"}:
        raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_QUERY)
    return {
        **pagination,
        "filters": parse_column_filters(filters, USER_FILTER_FIELDS),
        "sort": _parse_sort(sort, USER_SORT_FIELDS),
        "search": _parse_search(request, search, search_fields, USER_FILTER_FIELDS),
    }


def parser_management_sites(
    request: Request,
    search: str | None = Query(default=None, description="Case-insensitive literal substring search."),
    search_fields: str | None = Query(default=None, description="JSON array of search field names, combined with OR."),
    filters: str = Query(
        default="[]", description="JSON array of typed column predicates; profile_name uses only the selected language."
    ),
    sort: str = Query(default=MANAGEMENT_DEFAULT_SORT, description="Up to three ordered field:asc/desc criteria."),
    locale: str = Depends(parser_locale),
    pagination: dict[str, int] = Depends(parser_management_pagination),
) -> dict:
    """Validate selected-language platform predicates and page controls."""
    if set(request.query_params) - {
        EnumManagementField.LOCALE,
        "filters",
        "size",
        "page",
        "sort",
        "search",
        "search_fields",
    }:
        raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_QUERY)
    return {
        **pagination,
        EnumManagementField.LOCALE: locale,
        "filters": parse_column_filters(filters, SITE_FILTER_FIELDS),
        "sort": _parse_sort(sort, SITE_SORT_FIELDS),
        "search": _parse_search(request, search, search_fields, SITE_FILTER_FIELDS),
    }


# ■—< PARSER >———————————————————————————————————————————————————————————————————————■ Management - Platform Patch
def parser_management_site_patch(
    request: Request,
    account_id: str = Path(..., description="Existing owner account ID; never reassigned by the patch."),
    locale: str = Depends(parser_locale),
    body: BodyManagementSitePatchRequest = Body(...),
) -> ManagementSitePatchParameters:
    """
    Select one owner/language and extract only explicitly submitted mutable fields.

    :param request: Current request used to reject unknown and repeated query selectors.
    :param account_id: Positive account PK matching the Platform list row's id.
    :param locale: Existing content language; this selects a translation, never changes its FK.
    :param body: Exact owner-email confirmation and strictly validated mutable changes.
    :return: Target identity, language and explicit changes for ManagementSitesModule.update().
    :raises HTTPException: Invalid selectors or unexpected query controls return 400.

                                                                                               ♂ ZhengLee 2026.10.15
    """
    if set(request.query_params) - {EnumManagementField.LOCALE} or any(
        len(request.query_params.getlist(key)) > 1 for key in request.query_params
    ):
        raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_QUERY)
    if not account_id.isascii() or not account_id.isdecimal():
        raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_ACCOUNT_ID)
    return ManagementSitePatchParameters(
        account_id=_positive_integer(account_id, 2147483647, EnumManagementError.INVALID_ACCOUNT_ID),
        expected_owner_email=body.expected_owner_email,
        locale=EnumLocal(locale),
        changes=body.changes.model_dump(exclude_unset=True),
    )


def _parse_search(request: Request, term: str | None, selected: str | None, fields: dict) -> dict | None:
    if any(len(request.query_params.getlist(key)) > 1 for key in ("search", "search_fields")):
        raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_SEARCH)
    return parse_table_search(term, selected, fields)


# ■—< PARSER >———————————————————————————————————————————————————————————————————————■ Management - Login Records
def parser_management_login_records(
    request: Request,
    user_id: str | None = Query(default=None, description="Optional account ID; disabled accounts remain readable."),
    search: str | None = Query(default=None, description="Case-insensitive literal substring search."),
    search_fields: str | None = Query(default=None, description="JSON array of login-record search fields."),
    filters: str = Query(default="[]", description="JSON array of typed column predicates, combined with AND."),
    sort: str = Query(
        default=LOGIN_DEFAULT_SORT, description="Ordered field:asc/desc criteria; latest login first by default."
    ),
    pagination: dict[str, int] = Depends(parser_management_pagination),
) -> dict:
    """
    Validate private login-history controls without interpreting proxy headers or checking rights.

    :param request: Current request used to reject unknown or repeated query keys.
    :param user_id: Optional positive account selector, separate from column predicates.
    :param search: Optional literal search term.
    :param search_fields: Optional JSON array of allowlisted search columns.
    :param filters: Typed column predicates shared with other DataTables.
    :param sort: Explicit ordering or event-time descending with descending ID ties.
    :param pagination: Validated page and size from the existing shared parser.
    :return: Validated constructor values for ManagementLoginRecordsModule.
    :raises HTTPException: Invalid selectors or table controls return sanitized 400 errors.

                                                                                               ♂ ZhengLee 2026.10.15
    """
    allowed = {EnumManagementField.USER_ID, "search", "search_fields", "filters", "sort", "page", "size"}
    if set(request.query_params) - allowed or any(
        len(request.query_params.getlist(key)) > 1 for key in request.query_params
    ):
        raise HTTPException(status_code=400, detail=EnumManagementError.INVALID_QUERY)
    return {
        **pagination,
        EnumManagementField.USER_ID: (
            _positive_integer(user_id, 2147483647, EnumManagementError.INVALID_USER_ID) if user_id is not None else None
        ),
        "filters": parse_column_filters(filters, LOGIN_FILTER_FIELDS),
        "sort": _parse_sort(sort, LOGIN_SORT_FIELDS, id_direction=EnumSortDirection.DESC),
        "search": _parse_search(request, search, search_fields, LOGIN_FILTER_FIELDS),
    }


__all__ = (
    "parser_management_pagination",
    "parser_management_roles",
    "parser_management_users",
    "parser_management_sites",
    "parser_management_site_patch",
    "parser_management_login_records",
)
