# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import APIRouter, FastAPI, Request
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html, get_swagger_ui_oauth2_redirect_html
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

# ◆—< Pack >—————————————————————————————————◆ FastAPI Utils
from fastapi_utils.cbv import cbv as fastapi_utils_cbv

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy.engine.row import Row, RowMapping

# ◆—< Pack >—————————————————————————————————◆ Python
from collections.abc import Callable, Mapping, Sequence
from copy import copy
from datetime import date, datetime
from enum import Enum
from pathlib import Path
from typing import Any, Optional, Final
from uuid import UUID
from pydantic import BaseModel
import importlib.util
import hashlib
import inspect
import json


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ FastAPI - JsonResponse
class FastApiJSONResponse(JSONResponse):
    """
    Serialize response data with support for shared Python and database types.
    Keep the original data structure without adding a response envelope.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    @staticmethod
    def default_dumps(obj: Any) -> Any:
        """
        Convert values that the standard JSON encoder cannot serialize directly.

        :param obj: Set, date, bytes, UUID, Enum, Pydantic model, or database row.
        :return: A value that can be passed back to the JSON encoder.
        :raises TypeError: If the value has no supported JSON representation.
        :raises UnicodeDecodeError: If bytes do not contain valid UTF-8 text.
        """
        # --------------------------------------------------● Standard
        if isinstance(obj, (tuple, set, frozenset)):
            return list(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, bytes):
            return obj.decode("utf-8")
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, Enum):
            return obj.value

        # --------------------------------------------------● Sqlalchemy
        if isinstance(obj, RowMapping):
            return dict(obj)
        if isinstance(obj, Row):
            return list(obj)

        # --------------------------------------------------● Model / Mapping
        if isinstance(obj, BaseModel):
            return obj.model_dump()
        if isinstance(obj, Mapping):
            return dict(obj)
        raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")

    def render(self, content: Any) -> bytes:
        """
        Encode response data as UTF-8 JSON using default_dumps when needed.

        :param content: Response data to encode as JSON.
        :return: Compact JSON bytes with Unicode characters preserved.
        :raises TypeError: If a nested value is not supported by default_dumps.
        :raises ValueError: If data contains a circular reference or a non-finite number.
        """
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            default=self.default_dumps,
            separators=(",", ":"),
        ).encode("utf-8")


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ FastAPI - Router
class FastApiRouter(APIRouter):
    """
    Apply the JSON response class and keep documentation tags unique per route.
    Infer a prefix from the caller's directory when no explicit prefix is given.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    def __init__(
        self,
        *,
        prefix: str | bool | None = None,
        tags: str | Enum | dict | Sequence[str | Enum | dict] | None = None,
        include_in_schema: bool | Enum = True,
        **kwargs: Any,
    ) -> None:
        """
        Resolve router defaults before registering endpoints.

        :param prefix: URL prefix; None uses the caller's directory, False or '' disables it.
        :param tags: Documentation tags; None uses the resolved prefix when present.
        :param include_in_schema: Boolean or Enum value controlling OpenAPI visibility.
        :param kwargs: Additional APIRouter options, including response or route class overrides.
        """
        # --------------------------------------------------● Prefix
        if prefix is None:
            prefix = Path(inspect.stack()[1].filename).resolve().parent.name.lower()
        if prefix is False:
            prefix = ""
        if not isinstance(prefix, str):
            raise TypeError("prefix must be a string, False, or None")
        prefix = f"/{prefix.strip('/')}" if prefix.strip("/") else ""

        # --------------------------------------------------● Docs
        if isinstance(include_in_schema, Enum):
            include_in_schema = include_in_schema.value
        if tags is None:
            tags = [prefix.lstrip("/")] if prefix else []
        elif isinstance(tags, (str, Enum, dict)):
            tags = [tags]
        tag_names = list(dict.fromkeys(self._tag_name(tag) for tag in tags))

        # --------------------------------------------------● Response
        kwargs.setdefault("default_response_class", FastApiJSONResponse)
        super().__init__(prefix=prefix, tags=tag_names, include_in_schema=include_in_schema, **kwargs)

    @staticmethod
    def _tag_name(tag: str | Enum | dict) -> str:
        """
        Resolve a documentation tag to its display name.

        :param tag: String, Enum value, or dictionary containing a 'name' entry.
        :return: Tag name used in the generated OpenAPI schema.
        """
        if isinstance(tag, Enum):
            tag = tag.value
        return str(tag["name"] if isinstance(tag, dict) else tag)

    def add_api_route(
        self,
        path: str,
        endpoint: Callable[..., Any],
        *,
        tags: Sequence[str | Enum | dict] | None = None,
        **kwargs: Any,
    ) -> None:
        """
        Register an endpoint without repeating router tags in the documentation.

        :param path: Endpoint path relative to this router's prefix.
        :param endpoint: Synchronous or asynchronous endpoint callable.
        :param tags: Additional documentation tags for this endpoint.
        :param kwargs: Remaining options forwarded to APIRouter.add_api_route.
        :return: None; the route is appended to this router.
        """
        # --------------------------------------------------● Route Tags
        # FastAPI prepends self.tags; only forward additional names for this route.
        # Keep this set local so later endpoints retain the same documentation tags.
        seen = set(self.tags)
        unique_tags = []
        for tag in tags or []:
            name = self._tag_name(tag)
            if name not in seen:
                seen.add(name)
                unique_tags.append(name)

        super().add_api_route(path, endpoint, tags=unique_tags, **kwargs)

    def include_router(self, router: APIRouter, **kwargs: Any) -> None:
        """
        Include routes without repeating this router's tags in CBV documentation.

        CBV moves existing routes into an untagged inner router. Those routes
        already contain this router's tags, which FastAPI adds again on include.

        :param router: Router to include.
        :param kwargs: Options forwarded to APIRouter.include_router.
        :return: None; the router is included with unique documentation tags.
        """
        if self.tags and not router.tags:
            copied_routes = []
            for route in router.routes:
                if isinstance(route, APIRoute):
                    unique_tags = list(dict.fromkeys(self._tag_name(tag) for tag in route.tags))
                    if any(tag in self.tags for tag in unique_tags):
                        route = copy(route)
                        route.tags = [tag for tag in unique_tags if tag not in self.tags]
                copied_routes.append(route)

            if any(original is not copied for original, copied in zip(router.routes, copied_routes)):
                router = copy(router)
                router.routes = copied_routes

        super().include_router(router, **kwargs)


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ FastAPI - Class-Based View
def cbv(router: APIRouter) -> Callable[[type], type]:
    """
    Register multiple CBV classes on one router with current FastAPI versions.

    fastapi-utils expects every existing router entry to be an APIRoute, while
    FastAPI now keeps earlier included CBV routes as router entries. Hide those
    entries only during CBV registration, then restore them in their original order.

    :param router: Shared router used by the class endpoint decorators.
    :return: Class decorator that registers one CBV class.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    def decorator(cls: type) -> type:
        route_roles = {
            (route.path, frozenset(route.methods or ())) for route in router.routes if isinstance(route, APIRoute)
        }
        included_routes = [route for route in router.routes if not isinstance(route, APIRoute)]
        if not included_routes:
            registered = fastapi_utils_cbv(router)(cls)
            router._cbv_registered_roles = getattr(router, "_cbv_registered_roles", set()) | route_roles
            return registered

        previous_roles = getattr(router, "_cbv_registered_roles", set())
        if duplicate_roles := previous_roles & route_roles:
            raise ValueError(f"Duplicate CBV route role: {duplicate_roles!r}")

        # FastAPI caches included routes, so refresh its route version after each list change.
        router.routes[:] = [route for route in router.routes if isinstance(route, APIRoute)]
        router._mark_routes_changed()
        try:
            registered = fastapi_utils_cbv(router)(cls)
            router._cbv_registered_roles = previous_roles | route_roles
            return registered
        finally:
            router.routes[:0] = included_routes
            router._mark_routes_changed()

    return decorator


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ FastAPI - Router includer
def fastapi_include_routers(app: FastAPI, app_dir: str, file_pattern: str = "views") -> None:
    """
    Discover matching Python modules recursively and register their routers.

    :param app: FastAPI application receiving the discovered routers.
    :param app_dir: Base directory containing the application modules.
    :param file_pattern: Filename fragment to match, such as 'views' for views_user.py.
    :return: None; matching modules are executed and their routers are registered.
    :raises Exception: Module import and router registration errors propagate to the caller.

                                                                                               ♂ ZhengLee 2026.09.26
    """
    base_path = Path(app_dir)

    # --------------------------------------------------● Module Discovery
    for py_file in sorted(base_path.rglob(f"*{file_pattern}*.py")):
        module_rel = py_file.relative_to(base_path).with_suffix("")
        module_name = ".".join(module_rel.parts)

        # --------------------------------------------------● Module Loading
        spec = importlib.util.spec_from_file_location(module_name, py_file)
        if spec is None or spec.loader is None:
            continue
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        # --------------------------------------------------● Router Registration
        router = getattr(module, "router", None)
        if router is not None:
            app.include_router(router)


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ FastAPI - Local doc
class FastApiLocalDocs:
    """
    Serve Swagger UI and ReDoc from local assets without CDN dependencies.

                                                                                                  ♂ Wilson 2025.05.21
    """

    # —< Init >———————————————————————————————————————————● Constructor
    def __init__(
        self,
        app: FastAPI,
        dir_path: str | Path,
        dir_static: str = "static",
        docs_url: str = "/docs",
        redoc_url: str = "/redoc",
    ) -> None:
        """
        Configure local documentation paths.

        :param app: FastAPI application created with docs_url=None and redoc_url=None.
        :param dir_path: Parent directory containing the static asset folder.
        :param dir_static: Static asset directory name and URL prefix.
        :param docs_url: Swagger UI endpoint path.
        :param redoc_url: ReDoc endpoint path.
        """
        self.app: FastAPI = app
        self.dir_path: Path = Path(dir_path).resolve()
        self.dir_static: str = dir_static
        self.docs_url: Final[str] = docs_url.rstrip("/") or "/docs"
        self.redoc_url: Final[str] = redoc_url.rstrip("/") or "/redoc"
        self._oauth2_redirect: Final[str] = f"{self.docs_url}/oauth2-redirect"

    # —< API >———————————————————————————————————————————● Public
    def load(self) -> None:
        """
        Mount local assets and register documentation endpoints once before startup.

        :return: None; adds the static mount and documentation routes to the app.
        """
        self._mount_static()
        self._register_docs()

    # —< Internals >———————————————————————————————————● Helpers
    def _mount_static(self) -> None:
        """
        Mount the configured local asset directory.

        :return: None; registers /<dir_static> with the application.
        :raises FileNotFoundError: If the asset directory does not exist.
        """
        static_dir: Path = self.dir_path / self.dir_static
        if not static_dir.is_dir():
            raise FileNotFoundError(f"Static directory not found: {static_dir}")
        self.app.mount(f"/{self.dir_static}", StaticFiles(directory=str(static_dir)), name=self.dir_static)

    def _register_docs(self) -> None:
        """
        Register Swagger UI, ReDoc, OAuth2 redirect, and the root docs redirect.
        JavaScript, CSS, and the optional icon are served from local static paths.

        :return: None; adds hidden documentation routes to the app.
        """

        @self.app.get(self.docs_url, include_in_schema=False)
        async def _swagger_ui() -> HTMLResponse:
            """Return Swagger UI HTML using local JavaScript, CSS, and favicon assets."""
            return get_swagger_ui_html(
                openapi_url=self.app.openapi_url,
                title=f"{self.app.title} – Swagger UI",
                oauth2_redirect_url=self._oauth2_redirect,
                swagger_js_url=f"/{self.dir_static}/swagger/js/swagger-ui-bundle.js",
                swagger_css_url=f"/{self.dir_static}/swagger/css/swagger-ui.css",
                swagger_favicon_url=f"/{self.dir_static}/icon/logo.png",
            )

        @self.app.get(self._oauth2_redirect, include_in_schema=False)
        async def _swagger_redirect() -> HTMLResponse:
            """Return the OAuth2 redirect page at the path configured in Swagger UI."""
            return get_swagger_ui_oauth2_redirect_html()

        @self.app.get(self.redoc_url, include_in_schema=False)
        async def _redoc() -> HTMLResponse:
            """Return ReDoc HTML using local JavaScript and favicon assets."""
            return get_redoc_html(
                openapi_url=self.app.openapi_url,
                title=f"{self.app.title} – ReDoc",
                redoc_js_url=f"/{self.dir_static}/redoc/js/redoc.standalone.js",
                with_google_fonts=False,
                redoc_favicon_url=f"/{self.dir_static}/icon/logo.png",
            )

        @self.app.get("/", include_in_schema=False)
        async def default_redirect() -> RedirectResponse:
            """Redirect the root URL to the configured Swagger UI endpoint."""
            return RedirectResponse(url=self.docs_url)


# ■—< FUNC >———————————————————————————————————————————————————————————————————————————■ FastAPI - Cache Key Builder
def fastapi_cache_key_builder(
    func: Callable[..., Any], namespace: str = "", request: Optional[Request] = None, *_, **kwargs
):
    """
    Generate a cache key for FastAPI class-based view endpoints.

    Combine the function identity, URL path/query, and basic keyword values.
    Exclude CBV self, host, port, and scheme so keys do not depend on object addresses
    or the hostname used to access the same endpoint.

    :param func: Original endpoint callable.
    :param namespace: Prefix separating cache groups.
    :param request: Optional request supplying the path and query string.
    :param kwargs: Cache callback options; nested kwargs supplies endpoint arguments.
    :return: Namespace-prefixed MD5 digest of the cache identity.

                                                                                                  ♂ Wilson 2025.06.09
    """
    module = getattr(func, "__module__", "")
    qualname = getattr(func, "__qualname__", "")

    # ----------------------------------------------● Path extraction
    if request is not None:
        path = request.url.path
        query = str(request.url.query)
        path_query = f"{path}?{query}" if query else path
    else:
        path_query = str(kwargs.get("path", ""))

    # ----------------------------------------------● Remove CBV self and non-serializable kwargs
    inner_kwargs = dict(kwargs.get("kwargs", {}))

    def is_basic_serializable(val):
        """
        Check the original cache argument whitelist at the top level.

        :param val: Endpoint keyword value.
        :return: True for basic scalars and built-in tuple, list, or dict containers.
        """
        return isinstance(val, (str, int, float, bool, type(None), tuple, list, dict))

    safe_kwargs = {k: v for k, v in inner_kwargs.items() if k != "self" and is_basic_serializable(v)}
    safe_kwargs_str = str(sorted(safe_kwargs.items()))

    # ----------------------------------------------● Build raw key string and hash
    raw_key = f"{module}:{qualname}:{path_query}:{safe_kwargs_str}"
    cache_key = hashlib.md5(raw_key.encode("utf-8")).hexdigest()
    return f"{namespace}:{cache_key}"
