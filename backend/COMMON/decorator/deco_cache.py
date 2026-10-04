# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools import search_recursive

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi_cache.decorator import cache as fastapi_cache
from fastapi import Request

# ◆—< Pack >—————————————————————————————————◆ Python
from functools import wraps
from inspect import signature


# ■—< DECO >———————————————————————————————————————————————————————————————————————————■ Request Caching
def cache(control_key: str = 'is_caching', **cache_kwargs):
    """
    Overwrites a fastapi_cache(_cache) to optionally enable caching for FastAPI routes.

    When the request URL includes the query parameter (e.g., ?is_caching=true, '1', or 'yes'),
    the route's response will be cached using fastapi-cache2. Otherwise, the original function
    will be executed without caching.

    :param control_key: The query parameter key used to control caching (default is 'is_caching').
    :param cache_kwargs: Additional keyword arguments passed to the fastapi-cache decorator.
    :return: A decorated function that conditionally caches its response.
                                                                                              ♂ Wilson 2025.02.10
    """

    def decorator(func):
        # Pre-wrap the original function with the fastapi_cache decorator to avoid wrapping on every call.
        cached_func = fastapi_cache(**cache_kwargs)(func)
        cached_signature = signature(cached_func)
        injected_names = cached_signature.parameters.keys() - signature(func).parameters.keys()

        @wraps(func)
        async def wrapper(*args, **kwargs):
            req: Request | None = None
            # First, try to find a Request object among the positional arguments.
            for arg in args:
                if isinstance(arg, Request):
                    req = arg
                    break

            # If no Request is found in positional arguments, search in keyword arguments.
            if not req:
                for value in kwargs.values():
                    if isinstance(value, Request):
                        req = value
                        break

            # Retrieve the control flag from query parameters if a Request object was found.
            if req:
                flag = req.query_params.get(control_key)
            else:
                # If no Request object is found, recursively search for the control key in kwargs.
                flag = await search_recursive(kwargs, control_key)

            # Enable caching only if the flag is set to 'true', '1', or 'yes' (case-insensitive).
            if flag is not None and str(flag).lower() in ('true', '1', 'yes'):
                return await cached_func(*args, **kwargs)
            handler_kwargs = {name: value for name, value in kwargs.items() if name not in injected_names}
            return await func(*args, **handler_kwargs)

        # Expose fastapi-cache2's Request and Response parameters to FastAPI without
        # requiring them in each endpoint's own signature.
        wrapper.__signature__ = cached_signature
        return wrapper

    return decorator
