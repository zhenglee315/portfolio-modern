# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.help import HELP_CACHING

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Query


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Caching
async def parser_caching(is_caching: bool = Query(default=False, **HELP_CACHING)) -> bool:
    """
    Parse the shared response caching query parameter.

    :param is_caching: Whether this request may use the response cache.
    :return: True when caching is requested; otherwise False.
    """
    return is_caching
