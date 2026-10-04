# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.help import HELP_CACHING, HELP_LOCALE, HELP_PAGE, HELP_SIZE, HELP_CURSOR_LIMIT, HELP_CURSOR

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import EnumLocal

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException, Query

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Union


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Caching
async def parser_caching(is_caching: bool = Query(default=False, **HELP_CACHING)) -> bool:
    """
    Parse the shared response caching query parameter.

    :param is_caching: Whether this request may use the response cache.
    :return: True when caching is requested; otherwise False.
    """
    return is_caching


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Locale
async def parser_locale(
    locale: str = Query(
        default=EnumLocal.EN,
        json_schema_extra={"enum": EnumLocal.values()},
        **HELP_LOCALE,
    )
) -> str:
    """
    Parse the shared portfolio content language query parameter.

    :param locale: Requested language; English is the default.
    :return: A supported language code.
    :raises HTTPException: The requested language is not supported.

                                                                                               ♂ ZhengLee 2026.10.04
    """
    if locale not in EnumLocal.values():
        raise HTTPException(status_code=400, detail="INVALID_LOCALE")
    return locale


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Pagination
async def parser_pagination(
    page: Union[int, str] = Query(default=1, **HELP_PAGE),
    size: Union[int, str] = Query(default=6, **HELP_SIZE),
) -> dict[str, int]:
    """
    Validate the shared numbered pagination query parameters.

    :param page: Positive page number within the JavaScript safe-integer range.
    :param size: Fixed Portfolio page size of six.
    :return: Validated page and size values for collection endpoints.
    :raises HTTPException: The page or page size is invalid.

                                                                                               ♂ ZhengLee 2026.10.04
    """
    try:
        page = int(page)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="INVALID_PAGE") from None
    if page < 1 or page > 9007199254740991:
        raise HTTPException(status_code=400, detail="INVALID_PAGE")

    try:
        size = int(size)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="INVALID_SIZE") from None
    if size != 6:
        raise HTTPException(status_code=400, detail="INVALID_SIZE")

    return {"page": page, "size": size}


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Cursor Pagination
async def parser_cursor_pagination(
    limit: Union[int, str] = Query(default=12, **HELP_CURSOR_LIMIT),
    cursor: str | None = Query(default=None, **HELP_CURSOR),
) -> dict[str, int | str | None]:
    """
    Validate the shared cursor pagination parameters.

    :param limit: Number of records per page, from one to fifty.
    :param cursor: Opaque cursor returned by an earlier page, if any.
    :return: Validated limit and unchanged cursor for the collection module.
    :raises HTTPException: The page limit is invalid.

                                                                                               ♂ ZhengLee 2026.10.04
    """
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="INVALID_LIMIT") from None
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=400, detail="INVALID_LIMIT")

    return {"limit": limit, "cursor": cursor}
