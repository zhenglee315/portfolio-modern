# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.help import HELP_CACHING, HELP_LOCALE

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import EnumLocal

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException, Query


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
