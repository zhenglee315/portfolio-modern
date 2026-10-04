"""Reusable function decorators."""

# ◆—< Pack >—————————————————————————————————◆ Python
from functools import wraps
from inspect import signature

# ◆—< Pack >—————————————————————————————————◆ Common
from .deco_cache import cache


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ SQL Input Validation
def sql_validate(func):
    """
    Validate SQL text while preserving the coroutine or iterator returned by func.

    :param func: SQL executor method accepting an argument named sql.
    :return: Wrapped callable; this decorator does not manage transactions.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    func_signature = signature(func)

    @wraps(func)
    def wrapper(*args, **kwargs):
        """
        Check positional or keyword SQL before forwarding the original arguments.

        :param args: Positional executor arguments.
        :param kwargs: Keyword executor arguments.
        :return: Original coroutine, async iterator, or synchronous result.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        bound = func_signature.bind(*args, **kwargs)
        sql = bound.arguments.get("sql")
        if not isinstance(sql, str) or not sql.strip():
            raise ValueError("sql must be a non-empty string.")
        return func(*args, **kwargs)

    return wrapper
