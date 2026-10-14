"""Validate management pages, ordered sorting and typed column predicates."""

from fastapi import Depends, HTTPException, Query, Request
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
        raise HTTPException(status_code=400, detail="INVALID_QUERY")
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
        raise HTTPException(status_code=400, detail="INVALID_QUERY")
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
    if set(request.query_params) - {"locale", "filters", "size", "page", "sort", "search", "search_fields"}:
        raise HTTPException(status_code=400, detail="INVALID_QUERY")
    return {
        **pagination,
        "locale": locale,
        "filters": parse_column_filters(filters, SITE_FILTER_FIELDS),
        "sort": _parse_sort(sort, SITE_SORT_FIELDS),
        "search": _parse_search(request, search, search_fields, SITE_FILTER_FIELDS),
    }


def _parse_search(request: Request, term: str | None, selected: str | None, fields: dict) -> dict | None:
    if any(len(request.query_params.getlist(key)) > 1 for key in ("search", "search_fields")):
        raise HTTPException(status_code=400, detail="INVALID_SEARCH")
    return parse_table_search(term, selected, fields)


__all__ = (
    "parser_management_pagination",
    "parser_management_roles",
    "parser_management_users",
    "parser_management_sites",
)
