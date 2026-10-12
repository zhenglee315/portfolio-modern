"""Share management query limits and projection names without importing storage."""

from SYSTEM.constants import AUTH_PERMISSION_FIELDS

MANAGEMENT_DEFAULT_SIZE = 6
MANAGEMENT_MAX_SIZE = 100
MANAGEMENT_MAX_PAGE = 9007199254740991
MANAGEMENT_MAX_ID = 2147483647
MANAGEMENT_MAX_SORT_FIELDS = 3
MANAGEMENT_MAX_SEARCH_LENGTH = 200
MANAGEMENT_MAX_SEARCH_TERMS = 10

ROLE_COLUMNS = (
    "id",
    "role",
    "description",
    *AUTH_PERMISSION_FIELDS,
    "is_default",
    "is_active",
    "createtime",
    "updatetime",
)
ROLE_SORT_FIELDS = (*ROLE_COLUMNS, "user_count")

USER_SORT_FIELDS = (
    "id",
    "user",
    "email",
    "role_id",
    "role",
    "is_active",
    "role_is_active",
    "site_id",
    "has_site",
    "login_count",
    "last_login",
    "createtime",
    "updatetime",
)

SITE_COLUMNS = (
    "is_published",
    "is_default",
    "copyright_year",
    "linkedin",
    "github",
    "medium",
    "email",
    "chat_icon",
)
SITE_LOCALE_COLUMNS = (
    "brand_title",
    "brand_title_sub",
    "first_name",
    "family_name",
    "nick_name",
    "profile_content",
    "edu_code",
    "program",
    "intro_content",
    "footer_content",
    "chat_title",
    "chat_title_sub",
    "chat_content",
)
SITE_SORT_FIELDS = (
    "id",
    "user",
    "owner_is_active",
    "site_id",
    "has_site",
    *SITE_COLUMNS,
    "has_translation",
    *SITE_LOCALE_COLUMNS,
    "updatetime",
)

__all__ = (
    "MANAGEMENT_DEFAULT_SIZE",
    "MANAGEMENT_MAX_SIZE",
    "MANAGEMENT_MAX_PAGE",
    "MANAGEMENT_MAX_ID",
    "MANAGEMENT_MAX_SORT_FIELDS",
    "MANAGEMENT_MAX_SEARCH_LENGTH",
    "MANAGEMENT_MAX_SEARCH_TERMS",
    "ROLE_COLUMNS",
    "ROLE_SORT_FIELDS",
    "USER_SORT_FIELDS",
    "SITE_COLUMNS",
    "SITE_LOCALE_COLUMNS",
    "SITE_SORT_FIELDS",
)
