# ◆—< Pack >—————————————————————————————————◆ Tools
from COMMON.tools import EnumUtils


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ HTTP - Protocol Values
class EnumHttpHeader(EnumUtils):
    """Share protocol header names across request validation and private responses.

    ♂ ZhengLee 2026.10.16
    """

    ORIGIN = "Origin"
    CONTENT_TYPE = "Content-Type"
    CONTENT_ENCODING = "Content-Encoding"
    CACHE_CONTROL = "Cache-Control"
    VARY = "Vary"
    MANAGEMENT_UPDATE_STATE = "X-Management-Update-State"


class EnumMediaType(EnumUtils):
    """Declare supported wire formats without repeating media-type literals."""

    JSON = "application/json"


class EnumContentEncoding(EnumUtils):
    """Identify the uncompressed request-body encoding accepted by management."""

    IDENTITY = "identity"


class EnumUrlScheme(EnumUtils):
    """Declare public-link schemes shared by URL and browser-origin validation."""

    HTTP = "http"
    HTTPS = "https"


TEXT_ENCODING = "utf-8"
HTTP_URL_SCHEMES = frozenset(EnumUrlScheme)
PRIVATE_CACHE_CONTROL = "private, no-store"
COOKIE_VARY = "Cookie"

__all__ = (
    "EnumHttpHeader",
    "EnumMediaType",
    "EnumContentEncoding",
    "EnumUrlScheme",
    "TEXT_ENCODING",
    "HTTP_URL_SCHEMES",
    "PRIVATE_CACHE_CONTROL",
    "COOKIE_VARY",
)
