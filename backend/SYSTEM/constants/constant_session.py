# ◆—< Pack >—————————————————————————————————◆ Tools
from COMMON.tools.tools_enum import EnumUtils


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Session
class EnumSess(EnumUtils):
    """
    Define HTTP session payload keys and nested registration challenge fields.

    EnumUtils keeps the existing string values compatible with Redis JSON and
    public account responses. Cached permissions are refreshed from the database
    on each identity lookup; session values alone do not authorize an operation.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    # Public identity shared by authentication responses and the server session.
    ID = "id"
    EMAIL = "email"
    USER = "user"
    ROLE = "role"

    # Current role permissions; AUTH_PERMISSION_FIELDS selects these members.
    IS_CREATE = "is_create"
    IS_READ = "is_read"
    IS_UPDATE = "is_update"
    IS_DELETE = "is_delete"
    IS_MANAGE_ROLES = "is_manage_roles"
    IS_MANAGE_USERS = "is_manage_users"
    IS_MANAGE_SITES = "is_manage_sites"

    # Server-only proof fields; never include them in public account responses.
    AUTH_IDENTITY = "auth_identity"
    AUTH_REGISTRATION = "auth_registration"
    CHALLENGE_ID = "challenge_id"

    # Remove this field from legacy sessions; new sessions never store passwords.
    PASSWORD = "password"


__all__ = ("EnumSess",)
