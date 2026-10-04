# ◆—< Pack >—————————————————————————————————◆ Columns
from .columns import column_id, column_createtime, column_updatetime

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy import Column, String, UniqueConstraint

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database.orm import BASE


# ■—< AUTH >——————————————————————————————————————————————————————————————————————————■ Account
class AuthUser(BASE):
    """Account allowed to maintain the portfolio content."""

    __tablename__ = 'auth_user'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● Login
    account = Column(String(64), nullable=False, comment='Unique login account')
    password = Column(String(255), nullable=False, comment='Password hash; never plaintext')
    # ---------------------------------------------------------------------● Time
    createtime = column_createtime()
    updatetime = column_updatetime()
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (UniqueConstraint(account, name='uq_auth_user_account'),)


__all__ = ('AuthUser',)
