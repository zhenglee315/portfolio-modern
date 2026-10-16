"""Declare stable API names and explicitly allowlisted ORM attributes for management resources."""

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import (
    EnumLocal,
    AUTH_MANAGEMENT_WRITE_LOCK_KEY,
    LOGIN_GEO_STATUSES,
    EnumHttpHeader,
    PRIVATE_CACHE_CONTROL,
    COOKIE_VARY,
)
from SYSTEM.models import AuthRole, AuthUser, PortfolioSite, PortfolioSiteLocale, RecordLogin

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools import EnumUtils


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Management - Wire Contract
class EnumManagementField(EnumUtils):
    """Keep external field names stable while ORM attributes remain explicit refactorable references.

    ♂ ZhengLee 2026.10.16
    """

    ID = "id"
    USER = "user"
    ROLE = "role"
    DESCRIPTION = "description"
    IS_CREATE = "is_create"
    IS_READ = "is_read"
    IS_UPDATE = "is_update"
    IS_DELETE = "is_delete"
    IS_MANAGE_ROLES = "is_manage_roles"
    IS_MANAGE_USERS = "is_manage_users"
    IS_MANAGE_SITES = "is_manage_sites"
    IS_DEFAULT = "is_default"
    IS_ACTIVE = "is_active"
    CREATETIME = "createtime"
    UPDATETIME = "updatetime"
    USER_COUNT = "user_count"
    EMAIL = "email"
    ROLE_ID = "role_id"
    ROLE_IS_ACTIVE = "role_is_active"
    SITE_ID = "site_id"
    HAS_SITE = "has_site"
    LOGIN_COUNT = "login_count"
    LAST_LOGIN = "last_login"
    OWNER_EMAIL = "owner_email"
    OWNER_IS_ACTIVE = "owner_is_active"
    HAS_PROFILE = "has_profile"
    IS_PUBLISHED = "is_published"
    COPYRIGHT_YEAR = "copyright_year"
    LINKEDIN = "linkedin"
    GITHUB = "github"
    MEDIUM = "medium"
    CHAT_ICON = "chat_icon"
    LOCALE = "locale"
    HAS_TRANSLATION = "has_translation"
    BRAND_TITLE = "brand_title"
    BRAND_TITLE_SUB = "brand_title_sub"
    FIRST_NAME = "first_name"
    FAMILY_NAME = "family_name"
    NICK_NAME = "nick_name"
    PROFILE_CONTENT = "profile_content"
    EDU_CODE = "edu_code"
    PROGRAM = "program"
    INTRO_CONTENT = "intro_content"
    FOOTER_CONTENT = "footer_content"
    CHAT_TITLE = "chat_title"
    CHAT_TITLE_SUB = "chat_title_sub"
    CHAT_CONTENT = "chat_content"
    PROFILE_NAME = "profile_name"
    USER_ID = "user_id"
    LOGINTIME = "logintime"
    IP_ADDRESS = "ip_address"
    COUNTRY_CODE = "country_code"
    REGION = "region"
    CITY = "city"
    GEO_STATUS = "geo_status"
    IS_ONLINE = "is_online"
    CAN_ASSIGN = "can_assign"


class EnumSortDirection(EnumUtils):
    """Validate sort directions once before choosing SQLAlchemy order expressions."""

    ASC = "asc"
    DESC = "desc"


class EnumManagementError(EnumUtils):
    """Centralize existing public error codes without changing their wire values."""

    AUTH_REQUIRED = "AUTH_REQUIRED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    AUTH_DATABASE_UNAVAILABLE = "AUTH_DATABASE_UNAVAILABLE"
    ACCOUNT_NOT_FOUND = "ACCOUNT_NOT_FOUND"
    DEFAULT_SITE_REQUIRES_ACTIVE_PUBLISHED = "DEFAULT_SITE_REQUIRES_ACTIVE_PUBLISHED"
    DEFAULT_SITE_DEACTIVATE_FORBIDDEN = "DEFAULT_SITE_DEACTIVATE_FORBIDDEN"
    INVALID_ACCOUNT_ID = "INVALID_ACCOUNT_ID"
    INVALID_ACCOUNT_CONFIRMATION = "INVALID_ACCOUNT_CONFIRMATION"
    INVALID_USER_ID = "INVALID_USER_ID"
    INVALID_BODY = "INVALID_BODY"
    INVALID_JSON = "INVALID_JSON"
    INVALID_ORIGIN = "INVALID_ORIGIN"
    INVALID_PLATFORM_PATCH = "INVALID_PLATFORM_PATCH"
    INVALID_QUERY = "INVALID_QUERY"
    INVALID_SEARCH = "INVALID_SEARCH"
    INVALID_SORT = "INVALID_SORT"
    INVALID_PAGE = "INVALID_PAGE"
    INVALID_SIZE = "INVALID_SIZE"
    JSON_BODY_REQUIRED = "JSON_BODY_REQUIRED"
    MANAGEMENT_DATABASE_UNAVAILABLE = "MANAGEMENT_DATABASE_UNAVAILABLE"
    MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE = "MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE"
    PLATFORM_PATCH_TOO_LARGE = "PLATFORM_PATCH_TOO_LARGE"
    PLATFORM_UPDATE_CONFLICT = "PLATFORM_UPDATE_CONFLICT"
    PORTFOLIO_PREVIEW_FORBIDDEN = "PORTFOLIO_PREVIEW_FORBIDDEN"
    SITE_NOT_FOUND = "SITE_NOT_FOUND"
    INVALID_SITE_DELETE = "INVALID_SITE_DELETE"
    INVALID_ROLE_DELETE = "INVALID_ROLE_DELETE"
    INVALID_USER_DELETE = "INVALID_USER_DELETE"
    ROLE_DELETE_CONFLICT = "ROLE_DELETE_CONFLICT"
    USER_DELETE_CONFLICT = "USER_DELETE_CONFLICT"
    ROLE_IN_USE = "ROLE_IN_USE"
    SITE_DELETE_CONFLICT = "SITE_DELETE_CONFLICT"
    DEFAULT_SITE_DELETE_FORBIDDEN = "DEFAULT_SITE_DELETE_FORBIDDEN"
    MANAGEMENT_DELETE_TOO_LARGE = "MANAGEMENT_DELETE_TOO_LARGE"
    MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE = "MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE"
    SITE_TRANSLATION_NOT_FOUND = "SITE_TRANSLATION_NOT_FOUND"
    ROLE_NOT_FOUND = "ROLE_NOT_FOUND"
    INVALID_ROLE_ID = "INVALID_ROLE_ID"
    INVALID_MANAGEMENT_PATCH = "INVALID_MANAGEMENT_PATCH"
    MANAGEMENT_PATCH_TOO_LARGE = "MANAGEMENT_PATCH_TOO_LARGE"
    MANAGEMENT_UPDATE_CONFLICT = "MANAGEMENT_UPDATE_CONFLICT"
    MANAGEMENT_EDIT_CONFLICT = "MANAGEMENT_EDIT_CONFLICT"
    DEFAULT_ROLE_REQUIRED = "DEFAULT_ROLE_REQUIRED"
    DEFAULT_ROLE_REQUIRES_ACTIVE_UNPRIVILEGED = "DEFAULT_ROLE_REQUIRES_ACTIVE_UNPRIVILEGED"
    LAST_ROLE_MANAGER_REQUIRED = "LAST_ROLE_MANAGER_REQUIRED"
    ROLE_ASSIGNMENT_FORBIDDEN = "ROLE_ASSIGNMENT_FORBIDDEN"
    ROLE_ASSIGNMENT_INACTIVE = "ROLE_ASSIGNMENT_INACTIVE"


class EnumManagementUpdateState(EnumUtils):
    """Distinguish a committed write from a rolled-back transaction when cache invalidation fails."""

    COMMITTED = "committed"


# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Management - Limits
MANAGEMENT_PRIVATE_HEADERS = {
    EnumHttpHeader.CACHE_CONTROL: PRIVATE_CACHE_CONTROL,
    EnumHttpHeader.VARY: COOKIE_VARY,
}
MANAGEMENT_DEFAULT_SIZE = 6
MANAGEMENT_DEFAULT_SORT = f"{EnumManagementField.UPDATETIME}:{EnumSortDirection.DESC}"
MANAGEMENT_MAX_SIZE = 100
MANAGEMENT_DELETE_MAX_TARGETS = 100
MANAGEMENT_DELETE_MAX_BYTES = 65536
MANAGEMENT_MAX_PAGE = 9007199254740991
MANAGEMENT_MAX_SORT_FIELDS = 3

# Bound untrusted writes before JSON decoding; long copy has its own character limit.
#                                                                                               ♂ ZhengLee 2026.10.15
SITE_PATCH_MAX_BYTES = 262144
SITE_TEXT_MAX_LENGTH = 10000
SITE_CHAT_ICONS = (
    "src/assets/icons/cow-engineer.svg",
    "assets/icons/cow-engineer.svg",
    "assets/cow-engineer.svg",
    "cow-engineer.svg",
)
# PostgreSQL transaction-scoped advisory lock shared by publication/default writes.
SITE_PUBLICATION_LOCK_KEY = 7369746573
MANAGEMENT_WRITE_LOCK_KEY = AUTH_MANAGEMENT_WRITE_LOCK_KEY

# ■—< ORM >———————————————————————————————————————————————————————————————————————————■ Management - Field Bindings
# Only these explicit bindings may cross from validated API fields into ORM operations.
# Do not infer write access from model introspection: PKs, FKs and identity stay excluded.
#                                                                                               ♂ ZhengLee 2026.10.16
ROLE_FIELD_COLUMNS = {
    EnumManagementField.ID: AuthRole.id,
    EnumManagementField.ROLE: AuthRole.role,
    EnumManagementField.DESCRIPTION: AuthRole.description,
    EnumManagementField.IS_CREATE: AuthRole.is_create,
    EnumManagementField.IS_READ: AuthRole.is_read,
    EnumManagementField.IS_UPDATE: AuthRole.is_update,
    EnumManagementField.IS_DELETE: AuthRole.is_delete,
    EnumManagementField.IS_MANAGE_ROLES: AuthRole.is_manage_roles,
    EnumManagementField.IS_MANAGE_USERS: AuthRole.is_manage_users,
    EnumManagementField.IS_MANAGE_SITES: AuthRole.is_manage_sites,
    EnumManagementField.IS_DEFAULT: AuthRole.is_default,
    EnumManagementField.IS_ACTIVE: AuthRole.is_active,
    EnumManagementField.CREATETIME: AuthRole.createtime,
    EnumManagementField.UPDATETIME: AuthRole.updatetime,
}

ROLE_SORT_FIELDS = (*ROLE_FIELD_COLUMNS, EnumManagementField.USER_COUNT)

ROLE_PERMISSION_COLUMNS = (
    AuthRole.is_create,
    AuthRole.is_read,
    AuthRole.is_update,
    AuthRole.is_delete,
    AuthRole.is_manage_roles,
    AuthRole.is_manage_users,
    AuthRole.is_manage_sites,
)

ROLE_PATCH_COLUMNS = {
    EnumManagementField.ROLE: AuthRole.role,
    EnumManagementField.DESCRIPTION: AuthRole.description,
    EnumManagementField.IS_CREATE: AuthRole.is_create,
    EnumManagementField.IS_READ: AuthRole.is_read,
    EnumManagementField.IS_UPDATE: AuthRole.is_update,
    EnumManagementField.IS_DELETE: AuthRole.is_delete,
    EnumManagementField.IS_MANAGE_ROLES: AuthRole.is_manage_roles,
    EnumManagementField.IS_MANAGE_USERS: AuthRole.is_manage_users,
    EnumManagementField.IS_MANAGE_SITES: AuthRole.is_manage_sites,
    EnumManagementField.IS_DEFAULT: AuthRole.is_default,
    EnumManagementField.IS_ACTIVE: AuthRole.is_active,
}

USER_PATCH_COLUMNS = {
    EnumManagementField.IS_ACTIVE: AuthUser.is_active,
    EnumManagementField.ROLE_ID: AuthUser.role_id,
}

USER_FIELD_COLUMNS = {
    EnumManagementField.ID: AuthUser.id,
    EnumManagementField.EMAIL: AuthUser.email,
    EnumManagementField.ROLE_ID: AuthUser.role_id,
    EnumManagementField.IS_ACTIVE: AuthUser.is_active,
    EnumManagementField.CREATETIME: AuthUser.createtime,
    EnumManagementField.UPDATETIME: AuthUser.updatetime,
    EnumManagementField.ROLE: AuthRole.role,
    EnumManagementField.ROLE_IS_ACTIVE: AuthRole.is_active,
    EnumManagementField.SITE_ID: PortfolioSite.id,
}

USER_SORT_FIELDS = (
    *USER_FIELD_COLUMNS,
    EnumManagementField.HAS_SITE,
    EnumManagementField.LOGIN_COUNT,
    EnumManagementField.LAST_LOGIN,
)

SITE_ACCOUNT_PATCH_COLUMNS = {
    EnumManagementField.OWNER_IS_ACTIVE: AuthUser.is_active,
}

SITE_PATCH_COLUMNS = {
    EnumManagementField.IS_PUBLISHED: PortfolioSite.is_published,
    EnumManagementField.IS_DEFAULT: PortfolioSite.is_default,
    EnumManagementField.COPYRIGHT_YEAR: PortfolioSite.copyright_year,
    EnumManagementField.LINKEDIN: PortfolioSite.linkedin,
    EnumManagementField.GITHUB: PortfolioSite.github,
    EnumManagementField.MEDIUM: PortfolioSite.medium,
    EnumManagementField.EMAIL: PortfolioSite.email,
    EnumManagementField.CHAT_ICON: PortfolioSite.chat_icon,
}

SITE_TRANSLATION_PATCH_COLUMNS = {
    EnumManagementField.BRAND_TITLE: PortfolioSiteLocale.brand_title,
    EnumManagementField.BRAND_TITLE_SUB: PortfolioSiteLocale.brand_title_sub,
    EnumManagementField.FIRST_NAME: PortfolioSiteLocale.first_name,
    EnumManagementField.FAMILY_NAME: PortfolioSiteLocale.family_name,
    EnumManagementField.NICK_NAME: PortfolioSiteLocale.nick_name,
    EnumManagementField.PROFILE_CONTENT: PortfolioSiteLocale.profile_content,
    EnumManagementField.EDU_CODE: PortfolioSiteLocale.edu_code,
    EnumManagementField.PROGRAM: PortfolioSiteLocale.program,
    EnumManagementField.INTRO_CONTENT: PortfolioSiteLocale.intro_content,
    EnumManagementField.FOOTER_CONTENT: PortfolioSiteLocale.footer_content,
    EnumManagementField.CHAT_TITLE: PortfolioSiteLocale.chat_title,
    EnumManagementField.CHAT_TITLE_SUB: PortfolioSiteLocale.chat_title_sub,
    EnumManagementField.CHAT_CONTENT: PortfolioSiteLocale.chat_content,
}

SITE_COLUMNS = tuple(SITE_PATCH_COLUMNS.values())
SITE_LOCALE_COLUMNS = tuple(SITE_TRANSLATION_PATCH_COLUMNS.values())

SITE_OWNER_COLUMNS = {
    EnumManagementField.ID: AuthUser.id,
    EnumManagementField.USER: AuthUser.user,
    EnumManagementField.OWNER_EMAIL: AuthUser.email,
    EnumManagementField.OWNER_IS_ACTIVE: AuthUser.is_active,
    EnumManagementField.SITE_ID: PortfolioSite.id,
    EnumManagementField.CREATETIME: AuthUser.createtime,
    EnumManagementField.UPDATETIME: AuthUser.updatetime,
}

SITE_SORT_FIELDS = (
    *SITE_OWNER_COLUMNS,
    *SITE_PATCH_COLUMNS,
    *SITE_TRANSLATION_PATCH_COLUMNS,
    EnumManagementField.HAS_SITE,
    EnumManagementField.HAS_PROFILE,
    EnumManagementField.HAS_TRANSLATION,
)

LOGIN_FIELD_COLUMNS = {
    EnumManagementField.ID: RecordLogin.id,
    EnumManagementField.USER_ID: RecordLogin.user_id,
    EnumManagementField.EMAIL: AuthUser.email,
    EnumManagementField.LOGINTIME: RecordLogin.logintime,
    EnumManagementField.IP_ADDRESS: RecordLogin.ip_address,
    EnumManagementField.COUNTRY_CODE: RecordLogin.country_code,
    EnumManagementField.REGION: RecordLogin.region,
    EnumManagementField.CITY: RecordLogin.city,
    EnumManagementField.GEO_STATUS: RecordLogin.geo_status,
}

LOGIN_DEFAULT_SORT = f"{EnumManagementField.LOGINTIME}:{EnumSortDirection.DESC}"
LOGIN_SORT_FIELDS = tuple(LOGIN_FIELD_COLUMNS)


# Filter metadata describes data, independently of checkbox/switch presentation.
def _filter_fields(names, booleans=(), numbers=(), dates=(), nullable=()):
    return {
        name: {
            "type": (
                "boolean" if name in booleans else "number" if name in numbers else "date" if name in dates else "text"
            ),
            "nullable": name in nullable,
        }
        for name in names
    }


ROLE_FILTER_FIELDS = _filter_fields(
    ROLE_SORT_FIELDS,
    tuple(field for field, column in ROLE_FIELD_COLUMNS.items() if column.type.python_type is bool),
    (EnumManagementField.ID, EnumManagementField.USER_COUNT),
    (EnumManagementField.CREATETIME, EnumManagementField.UPDATETIME),
    (EnumManagementField.DESCRIPTION,),
)
ROLE_FILTER_FIELDS[EnumManagementField.ROLE]["sets"] = True
for field in (EnumManagementField.ID,):
    ROLE_FILTER_FIELDS[field].update(minimum=-2147483648, maximum=2147483647)

USER_FILTER_FIELDS = _filter_fields(
    USER_SORT_FIELDS,
    (EnumManagementField.IS_ACTIVE, EnumManagementField.ROLE_IS_ACTIVE, EnumManagementField.HAS_SITE),
    (EnumManagementField.ID, EnumManagementField.ROLE_ID, EnumManagementField.SITE_ID, EnumManagementField.LOGIN_COUNT),
    (EnumManagementField.CREATETIME, EnumManagementField.UPDATETIME, EnumManagementField.LAST_LOGIN),
    (EnumManagementField.SITE_ID, EnumManagementField.LAST_LOGIN),
)
USER_FILTER_FIELDS[EnumManagementField.ROLE]["sets"] = True
for field in (EnumManagementField.ID, EnumManagementField.ROLE_ID, EnumManagementField.SITE_ID):
    USER_FILTER_FIELDS[field].update(minimum=-2147483648, maximum=2147483647)

SITE_FILTER_FIELDS = _filter_fields(
    (*SITE_SORT_FIELDS, EnumManagementField.PROFILE_NAME, EnumManagementField.LOCALE),
    (
        EnumManagementField.OWNER_IS_ACTIVE,
        EnumManagementField.HAS_SITE,
        EnumManagementField.HAS_PROFILE,
        EnumManagementField.IS_PUBLISHED,
        EnumManagementField.IS_DEFAULT,
        EnumManagementField.HAS_TRANSLATION,
    ),
    (EnumManagementField.ID, EnumManagementField.SITE_ID, EnumManagementField.COPYRIGHT_YEAR),
    (EnumManagementField.CREATETIME, EnumManagementField.UPDATETIME),
    (
        EnumManagementField.SITE_ID,
        *SITE_PATCH_COLUMNS,
        *SITE_TRANSLATION_PATCH_COLUMNS,
        EnumManagementField.PROFILE_NAME,
    ),
)
for field in (EnumManagementField.ID, EnumManagementField.SITE_ID, EnumManagementField.COPYRIGHT_YEAR):
    SITE_FILTER_FIELDS[field].update(minimum=-2147483648, maximum=2147483647)

SITE_FILTER_FIELDS[EnumManagementField.LOCALE] = {"type": "enum", "options": tuple(EnumLocal)}

LOGIN_FILTER_FIELDS = _filter_fields(
    LOGIN_SORT_FIELDS,
    numbers=(EnumManagementField.ID, EnumManagementField.USER_ID),
    dates=(EnumManagementField.LOGINTIME,),
    nullable=(
        EnumManagementField.IP_ADDRESS,
        EnumManagementField.COUNTRY_CODE,
        EnumManagementField.REGION,
        EnumManagementField.CITY,
    ),
)
for field in (EnumManagementField.ID, EnumManagementField.USER_ID):
    LOGIN_FILTER_FIELDS[field].update(minimum=-2147483648, maximum=2147483647)
LOGIN_FILTER_FIELDS[EnumManagementField.GEO_STATUS] = {"type": "enum", "options": LOGIN_GEO_STATUSES}

__all__ = tuple(name for name in globals() if name.isupper()) + (
    "EnumManagementField",
    "EnumSortDirection",
    "EnumManagementError",
    "EnumManagementUpdateState",
)
