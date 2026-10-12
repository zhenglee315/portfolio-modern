"""Validate management list query parameters independently of public Portfolio pagination."""

from fastapi import Depends, HTTPException, Query

from APPs.Management.constants import (
    MANAGEMENT_DEFAULT_SIZE,
    MANAGEMENT_MAX_ID,
    MANAGEMENT_MAX_PAGE,
    MANAGEMENT_MAX_SEARCH_LENGTH,
    MANAGEMENT_MAX_SEARCH_TERMS,
    MANAGEMENT_MAX_SIZE,
    MANAGEMENT_MAX_SORT_FIELDS,
    ROLE_SORT_FIELDS,
    SITE_SORT_FIELDS,
    USER_SORT_FIELDS,
)
from COMMON.schema.parser import parser_locale


def _positive_integer(value: str, maximum: int, detail: str) -> int:
    """Parse a bounded integer query value and retain the common HTTP 400 error convention."""
    try:
        parsed = int(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=detail) from None
    if not 1 <= parsed <= maximum:
        raise HTTPException(status_code=400, detail=detail)
    return parsed


def _optional_boolean(value: str | None, detail: str) -> bool | None:
    """Distinguish an omitted filter from explicit true/false without accepting ambiguous values."""
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in ("true", "false"):
        raise HTTPException(status_code=400, detail=detail)
    return normalized == "true"


def _parse_sort(value: str, fields: tuple[str, ...]) -> tuple[tuple[str, str], ...]:
    """Validate ordered field:direction pairs and append one ascending ID tie-breaker when needed."""
    pairs = value.split(",")
    if not 1 <= len(pairs) <= MANAGEMENT_MAX_SORT_FIELDS:
        raise HTTPException(status_code=400, detail="INVALID_SORT")
    result = []
    seen = set()
    for pair in pairs:
        parts = [part.strip() for part in pair.split(":")]
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail="INVALID_SORT")
        field, direction = parts
        if field not in fields or direction not in ("asc", "desc") or field in seen:
            raise HTTPException(status_code=400, detail="INVALID_SORT")
        seen.add(field)
        result.append((field, direction))
    if "id" not in seen:
        result.append(("id", "asc"))
    return tuple(result)


def _parse_search(value: str) -> tuple[str, ...]:
    """Bound and tokenize literal search terms consistently across management resources."""
    value = value.strip()
    terms = tuple(value.split())
    if len(value) > MANAGEMENT_MAX_SEARCH_LENGTH or len(terms) > MANAGEMENT_MAX_SEARCH_TERMS:
        raise HTTPException(status_code=400, detail="INVALID_SEARCH")
    return terms


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
        "page": _positive_integer(page, MANAGEMENT_MAX_PAGE, "INVALID_PAGE"),
        "size": _positive_integer(size, MANAGEMENT_MAX_SIZE, "INVALID_SIZE"),
    }


def parser_management_roles(
    search: str = Query(default="", description="Case-insensitive role/description search; all words must match."),
    sort: str = Query(
        default="id:desc",
        description="Up to three ordered field:asc/desc pairs, separated by commas. Default id:desc.",
        examples=["is_active:desc,role:asc", "user_count:desc,createtime:desc"],
    ),
    is_active: str | None = Query(default=None, description="true/false role state; omit for both."),
    is_default: str | None = Query(default=None, description="true/false registration default; omit for both."),
    pagination: dict[str, int] = Depends(parser_management_pagination),
) -> dict:
    """
    Normalize role search, ordered sorting, optional boolean filters and numbered pagination.

    :param search: Literal words matched across role name and description; empty means no search.
    :param sort: Allowed projection names and asc/desc directions, in priority order.
    :param is_active: Optional role state filter, independently of assigned account states.
    :param is_default: Optional registration-default filter.
    :param pagination: Validated management page and size.
    :return: Immutable search/sort terms and typed filters for the role module.
    :raises HTTPException: Search limits, sorting or boolean filters are invalid.
    """
    return {
        **pagination,
        "search_terms": _parse_search(search),
        "sort": _parse_sort(sort, ROLE_SORT_FIELDS),
        "is_active": _optional_boolean(is_active, "INVALID_IS_ACTIVE"),
        "is_default": _optional_boolean(is_default, "INVALID_IS_DEFAULT"),
    }


# ■—< PARAM >—————————————————————————————————————————————————————————————————————————■ Management - Users
def parser_management_users(
    search: str = Query(default="", description="Case-insensitive user/email/role search; all words must match."),
    sort: str = Query(
        default="id:desc",
        description="Up to three ordered field:asc/desc pairs, separated by commas. Default id:desc.",
        examples=["is_active:desc,user:asc", "login_count:desc,last_login:desc"],
    ),
    is_active: str | None = Query(default=None, description="true/false account state; omit for both."),
    role_is_active: str | None = Query(default=None, description="true/false assigned-role state; omit for both."),
    has_site: str | None = Query(default=None, description="true/false website ownership; omit for both."),
    role_id: str | None = Query(
        default=None, description="Assigned-role ID from 1 to 2147483647; omit for every role."
    ),
    pagination: dict[str, int] = Depends(parser_management_pagination),
) -> dict:
    """
    Normalize account search, ordered sorting, optional identity filters and numbered pagination.

    :param search: Literal words matched across account handle, login email and assigned role name.
    :param sort: Allowed projection names and asc/desc directions, in priority order.
    :param is_active: Optional account state filter; inactive accounts remain visible when omitted.
    :param role_is_active: Optional assigned-role state filter, independent of the account state.
    :param has_site: Optional filter for whether the account owns a website record.
    :param role_id: Optional positive integer identifying the assigned role.
    :param pagination: Validated management page and size.
    :return: Immutable search/sort terms and typed filters for the user module.
    :raises HTTPException: Search limits, sorting, boolean filters or role ID are invalid.
    """
    return {
        **pagination,
        "search_terms": _parse_search(search),
        "sort": _parse_sort(sort, USER_SORT_FIELDS),
        "is_active": _optional_boolean(is_active, "INVALID_IS_ACTIVE"),
        "role_is_active": _optional_boolean(role_is_active, "INVALID_ROLE_IS_ACTIVE"),
        "has_site": _optional_boolean(has_site, "INVALID_HAS_SITE"),
        "role_id": None if role_id is None else _positive_integer(role_id, MANAGEMENT_MAX_ID, "INVALID_ROLE_ID"),
    }


# ■—< PARAM >—————————————————————————————————————————————————————————————————————————■ Management - Platform
def parser_management_sites(
    search: str = Query(default="", description="Literal owner/public-email and selected-language content search."),
    sort: str = Query(default="id:desc", description="Up to three distinct field:asc/desc pairs, in priority order."),
    owner_is_active: str | None = Query(default=None, description="true/false owner account state; omit for both."),
    has_site: str | None = Query(default=None, description="true/false portfolio presence; omit for both."),
    is_published: str | None = Query(default=None, description="true/false publication state; excludes absent sites."),
    is_default: str | None = Query(default=None, description="true/false homepage selection; excludes absent sites."),
    has_translation: str | None = Query(
        default=None, description="true/false content presence in the selected language."
    ),
    locale: str = Depends(parser_locale),
    pagination: dict[str, int] = Depends(parser_management_pagination),
) -> dict:
    """
    Combine bounded list controls with one management language and optional site/owner state filters.

    :param search: Literal words searched across the owner handle, public email and selected-language content.
    :param sort: Whitelisted scalar projection fields and ordered directions.
    :param owner_is_active: Optional account state, independently of publication and role availability.
    :param has_site: Whether the account has created a portfolio.
    :param is_published: Optional actual site publication flag; missing sites have no such state.
    :param is_default: Optional actual site default flag; missing sites have no such state.
    :param has_translation: Whether the requested language has site content.
    :param locale: Supported management language; there is no fallback to another language.
    :param pagination: Shared management page and size.
    :return: Typed query controls for the platform module.
    """
    return {
        **pagination,
        "search_terms": _parse_search(search),
        "sort": _parse_sort(sort, SITE_SORT_FIELDS),
        "locale": locale,
        "owner_is_active": _optional_boolean(owner_is_active, "INVALID_OWNER_IS_ACTIVE"),
        "has_site": _optional_boolean(has_site, "INVALID_HAS_SITE"),
        "is_published": _optional_boolean(is_published, "INVALID_IS_PUBLISHED"),
        "is_default": _optional_boolean(is_default, "INVALID_IS_DEFAULT"),
        "has_translation": _optional_boolean(has_translation, "INVALID_HAS_TRANSLATION"),
    }


__all__ = (
    "parser_management_pagination",
    "parser_management_roles",
    "parser_management_users",
    "parser_management_sites",
)
