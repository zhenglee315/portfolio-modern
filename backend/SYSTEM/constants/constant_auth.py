from .constant_session import EnumSess

# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Auth - Permissions
# Share session keys with permission validation instead of redefining field strings.
AUTH_PERMISSION_FIELDS = (
    EnumSess.IS_CREATE,
    EnumSess.IS_READ,
    EnumSess.IS_UPDATE,
    EnumSess.IS_DELETE,
    EnumSess.IS_MANAGE_ROLES,
    EnumSess.IS_MANAGE_USERS,
    EnumSess.IS_MANAGE_SITES,
)

# Shared transaction lock for role defaults, registration and management identity changes.
#                                                                                               ♂ ZhengLee 2026.10.16
AUTH_MANAGEMENT_WRITE_LOCK_KEY = 7369746574

__all__ = (
    "AUTH_PERMISSION_FIELDS",
    "AUTH_MANAGEMENT_WRITE_LOCK_KEY",
)
