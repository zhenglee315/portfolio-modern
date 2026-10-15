"""Share management query limits and projection names without importing storage."""

from SYSTEM.constants import AUTH_PERMISSION_FIELDS

# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Management - Private Responses
MANAGEMENT_PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "Vary": "Cookie"}

MANAGEMENT_DEFAULT_SIZE = 6
MANAGEMENT_DEFAULT_SORT = "updatetime:desc"
MANAGEMENT_MAX_SIZE = 100
MANAGEMENT_MAX_PAGE = 9007199254740991
MANAGEMENT_MAX_SORT_FIELDS = 3

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
    "owner_email",
    "owner_is_active",
    "site_id",
    "has_site",
    "has_profile",
    *SITE_COLUMNS,
    "has_translation",
    *SITE_LOCALE_COLUMNS,
    "createtime",
    "updatetime",
)


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
    (*AUTH_PERMISSION_FIELDS, "is_active", "is_default"),
    ("id", "user_count"),
    ("createtime", "updatetime"),
    ("description",),
)
ROLE_FILTER_FIELDS["role"]["sets"] = True
for field in ("id",):
    ROLE_FILTER_FIELDS[field].update(minimum=-2147483648, maximum=2147483647)

USER_FILTER_FIELDS = _filter_fields(
    USER_SORT_FIELDS,
    ("is_active", "role_is_active", "has_site"),
    ("id", "role_id", "site_id", "login_count"),
    ("createtime", "updatetime", "last_login"),
    ("site_id", "last_login"),
)
USER_FILTER_FIELDS["role"]["sets"] = True
for field in ("id", "role_id", "site_id"):
    USER_FILTER_FIELDS[field].update(minimum=-2147483648, maximum=2147483647)

SITE_FILTER_FIELDS = _filter_fields(
    (*SITE_SORT_FIELDS, "profile_name", "locale"),
    ("owner_is_active", "has_site", "has_profile", "is_published", "is_default", "has_translation"),
    ("id", "site_id", "copyright_year"),
    ("createtime", "updatetime"),
    ("site_id", *SITE_COLUMNS, *SITE_LOCALE_COLUMNS, "profile_name"),
)
for field in ("id", "site_id", "copyright_year"):
    SITE_FILTER_FIELDS[field].update(minimum=-2147483648, maximum=2147483647)

SITE_FILTER_FIELDS["locale"] = {"type": "enum", "options": ("en", "zh-Hans", "zh-Hant")}
__all__ = tuple(name for name in globals() if name.isupper())
