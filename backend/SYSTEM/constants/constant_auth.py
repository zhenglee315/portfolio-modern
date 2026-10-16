# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Auth - Permissions
AUTH_PERMISSION_FIELDS = (
    "is_create",
    "is_read",
    "is_update",
    "is_delete",
    "is_manage_roles",
    "is_manage_users",
    "is_manage_sites",
)

# Shared transaction lock for role defaults, registration and management identity changes.
#                                                                                               ♂ ZhengLee 2026.10.16
AUTH_MANAGEMENT_WRITE_LOCK_KEY = 7369746574
AUTH_SESSION_IDENTITY_KEY = "auth_identity"

__all__ = ("AUTH_PERMISSION_FIELDS", "AUTH_MANAGEMENT_WRITE_LOCK_KEY", "AUTH_SESSION_IDENTITY_KEY")
