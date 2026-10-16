# ◆—< Pack >—————————————————————————————————◆ Columns
from .columns import column_id, column_desc

# ◆—< Pack >—————————————————————————————————◆ Argon2
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# ◆—< Pack >—————————————————————————————————◆ AnyIO
from anyio import CapacityLimiter, to_thread

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    false,
    true,
)
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database.orm import BASE

_PASSWORD_HASHER = PasswordHasher()
# Bound memory-intensive hashing and verification across all account callers.
_PASSWORD_HASH_LIMITER = CapacityLimiter(4)
# Explicit Unicode whitespace keeps role-name checks consistent across database dialects.
_ROLE_WHITESPACE = ' \t\n\r\f\v\x1c-\x1f\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'


# ■—< AUTH >——————————————————————————————————————————————————————————————————————————■ Role
class AuthRole(BASE):
    """Configurable permissions and login availability shared by accounts."""

    __tablename__ = 'auth_role'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● Conf
    role = Column(String(64), nullable=False, comment='Unique role, e.g. admin, editor or viewer')
    description = column_desc()
    is_default = Column(
        Boolean, nullable=False, default=False, server_default=false(), comment='Default role for new registrations'
    )
    # ---------------------------------------------------------------------● Content
    is_create = Column(
        Boolean, nullable=False, default=False, server_default=false(), comment='Allow creating portfolio content'
    )
    is_read = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
        comment='Allow reading portfolio management content',
    )
    is_update = Column(
        Boolean, nullable=False, default=False, server_default=false(), comment='Allow updating portfolio content'
    )
    is_delete = Column(
        Boolean, nullable=False, default=False, server_default=false(), comment='Allow deleting portfolio content'
    )
    # ---------------------------------------------------------------------● Management
    is_manage_roles = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
        comment='Allow managing roles and registration defaults',
    )
    is_manage_users = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
        comment='Allow managing accounts and assigned roles',
    )
    is_manage_sites = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
        comment='Allow managing portfolio publication and the website default',
    )
    # ---------------------------------------------------------------------● State
    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
        comment='True while enabled; false disables login for all accounts assigned to this role',
    )
    # ---------------------------------------------------------------------● Time
    createtime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
        comment='UTC timestamp when the record was created',
    )
    updatetime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
        onupdate=func.now(),
        comment='UTC timestamp when the record was last updated',
    )
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (
        CheckConstraint(id > 0, name='ck_auth_role_id_positive'),
        UniqueConstraint(role, name='uq_auth_role_role'),
        CheckConstraint(
            func.length(role).between(1, 64) & ~role.regexp_match(rf"\A[{_ROLE_WHITESPACE}]|[{_ROLE_WHITESPACE}]\Z"),
            name='ck_auth_role_role',
        ),
        CheckConstraint(
            ~is_default | ~(is_manage_roles | is_manage_users | is_manage_sites),
            name='ck_auth_role_default_no_management',
        ),
        # Only true rows participate; role-management transactions must maintain at least one default.
        Index(
            'uq_auth_role_one_default',
            is_default,
            unique=True,
            postgresql_where=is_default.is_(True),
            sqlite_where=is_default.is_(True),
        ),
    )


# ■—< AUTH >——————————————————————————————————————————————————————————————————————————■ Account
class AuthUser(BASE):
    """Login identity and assigned role; inactive accounts are soft-deleted."""

    __tablename__ = 'auth_user'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● Public Identity
    user = Column(String(32), nullable=False, comment='Unique public handle; independent of the login email')
    # ---------------------------------------------------------------------● Login
    email = Column(String(320), nullable=False, comment='Unique login email; independent of the public portfolio email')
    password = Column(String(255), nullable=False, comment='Salted Argon2id password hash; never plaintext')
    # ---------------------------------------------------------------------● FK / Role
    role_id = Column(
        Integer, ForeignKey(AuthRole.id, ondelete='RESTRICT'), nullable=False, index=True, comment='Assigned role'
    )
    role = relationship(AuthRole, backref=backref('users', passive_deletes='all'))
    # ---------------------------------------------------------------------● State
    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
        comment='True while active; false marks the account as soft-deleted',
    )
    # ---------------------------------------------------------------------● Time
    createtime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
        comment='UTC timestamp when the record was created',
    )
    updatetime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
        onupdate=func.now(),
        comment='UTC timestamp when the record was last updated',
    )
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (
        CheckConstraint(id > 0, name='ck_auth_user_id_positive'),
        UniqueConstraint(user, name='uq_auth_user_user'),
        CheckConstraint(user.regexp_match(r'\A[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]\Z'), name='ck_auth_user_user_format'),
        CheckConstraint(
            ~user.in_(
                (
                    'admin',
                    'dashboard',
                    'login',
                    'register',
                    'authority',
                    'portfolio',
                    'api',
                    'assets',
                    'en',
                    'zh-hans',
                    'zh-hant',
                    'system',
                )
            ),
            name='ck_auth_user_user_reserved',
        ),
        UniqueConstraint(email, name='uq_auth_user_email'),
        # ASCII dot-atom login addresses with a dotted DNS domain; no surrounding whitespace.
        CheckConstraint(func.length(email).between(5, 254), name='ck_auth_user_email_length'),
        CheckConstraint(email.regexp_match(r'\A[^@]{1,64}@'), name='ck_auth_user_email_local_length'),
        CheckConstraint(
            email.regexp_match(
                r"\A[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@"
                r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?'
                r'(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+\Z'
            ),
            name='ck_auth_user_email_format',
        ),
        # Stored hash bounds; plaintext password length is validated before hashing.
        CheckConstraint(func.length(password).between(1, 255), name='ck_auth_user_password_hash_length'),
        CheckConstraint(
            password.regexp_match(
                r'\A\$argon2id\$v=19\$m=[1-9][0-9]*,t=[1-9][0-9]*,p=[1-9][0-9]*'
                r'\$[A-Za-z0-9+/]{22,}\$[A-Za-z0-9+/]{43,}\Z'
            ),
            name='ck_auth_user_password_hash_format',
        ),
    )

    # —< Security >————————————————————————————————————————● Set Password
    async def set_password(self, raw_password: str) -> None:
        """
        Hash on a bounded worker and store the result without persisting the account.

        :param raw_password: Plaintext password with at least eight characters; whitespace is preserved.
        :return: None after hashing; the caller owns the database transaction.
        :raises TypeError: The password is not a string.
        :raises ValueError: The password contains fewer than eight characters.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        if not isinstance(raw_password, str):
            raise TypeError('Password must be a string.')
        if len(raw_password) < 8:
            raise ValueError('Password must contain at least 8 characters.')

        # Only plain values enter the worker; mapped attributes stay on the event loop.
        self.password = await to_thread.run_sync(_PASSWORD_HASHER.hash, raw_password, limiter=_PASSWORD_HASH_LIMITER)

    # —< Security >————————————————————————————————————————● Get Password
    async def get_password(self, raw_password: str) -> bool:
        """
        Verify on a bounded worker without blocking the event loop or returning a password.

        :param raw_password: Plaintext password to verify.
        :return: True when the password matches; False for a mismatch or an invalid hash.
                 Account and role activation are checked separately during authentication.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        if not isinstance(raw_password, str) or not raw_password:
            return False
        password_hash = self.password
        if not isinstance(password_hash, str) or not password_hash:
            return False

        try:
            return await to_thread.run_sync(
                _PASSWORD_HASHER.verify, password_hash, raw_password, limiter=_PASSWORD_HASH_LIMITER
            )
        except (InvalidHashError, VerificationError, UnicodeError):
            return False


# ■—< ORM >———————————————————————————————————————————————————————————————————————————■ Auth - Permission Columns
# Explicit ORM references support registration projections without dynamic getattr lookups.
#                                                                                               ♂ ZhengLee 2026.10.16
AUTH_ROLE_PERMISSION_COLUMNS = (
    AuthRole.is_create,
    AuthRole.is_read,
    AuthRole.is_update,
    AuthRole.is_delete,
    AuthRole.is_manage_roles,
    AuthRole.is_manage_users,
    AuthRole.is_manage_sites,
)

__all__ = ("AuthRole", "AuthUser", "AUTH_ROLE_PERMISSION_COLUMNS")
