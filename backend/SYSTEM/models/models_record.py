# ◆—< Pack >—————————————————————————————————◆ Columns
from .columns import column_id

# ◆—< Pack >—————————————————————————————————◆ Auth
from .models_auth import AuthUser

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database.orm import BASE


# ■—< RECORD >————————————————————————————————————————————————————————————————————————■ Login
class RecordLogin(BASE):
    """
    Store one historical event for each successful account sign-in.

    Keep the event time unchanged; repeated sign-ins create separate records.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    __tablename__ = 'record_login'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● FK / User
    user_id = Column(
        Integer,
        ForeignKey(AuthUser.id, ondelete='RESTRICT'),
        nullable=False,
        comment='Account that successfully signed in; retained when the account is soft-deleted',
    )
    user = relationship(AuthUser, backref=backref('login_records', passive_deletes='all'))
    # ---------------------------------------------------------------------● Time
    logintime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
        comment='UTC timestamp when the account successfully signed in',
    )
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (
        CheckConstraint(id > 0, name='ck_record_login_id_positive'),
        # The leading user_id also indexes the FK; no separate user_id index is needed.
        Index('ix_record_login_user_id_logintime_id', user_id, logintime.desc(), id.desc()),
        Index('ix_record_login_logintime_id', logintime.desc(), id.desc()),
    )


__all__ = ('RecordLogin',)
