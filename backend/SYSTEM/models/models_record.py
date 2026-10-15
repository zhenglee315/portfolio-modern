# ◆—< Pack >—————————————————————————————————◆ Columns
from .columns import column_id

# ◆—< Pack >—————————————————————————————————◆ Auth
from .models_auth import AuthUser

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database.orm import BASE
from SYSTEM.constants import LOGIN_GEO_STATUSES


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
    # ---------------------------------------------------------------------● Login / Network Snapshot
    # Nullable enrichment preserves old login events and partial GeoIP results.
    ip_address = Column(String(45), nullable=True, comment='Normalized request IPv4/IPv6; null when unknown')
    country_code = Column(String(2), nullable=True, comment='IP-derived two-letter country code at login time')
    region = Column(String(128), nullable=True, comment='Approximate IP-derived region name at login time')
    city = Column(String(128), nullable=True, comment='Approximate IP-derived city name at login time')
    geo_status = Column(
        String(24), nullable=False, default='unknown', server_default='unknown',
        comment='GeoIP enrichment result; unknown retains historical events without source IP',
    )
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
        CheckConstraint(
            f"geo_status IN ({', '.join(repr(status) for status in LOGIN_GEO_STATUSES)})",
            name='ck_record_login_geo_status',
        ),
        # The leading user_id also indexes the FK; no separate user_id index is needed.
        Index('ix_record_login_user_id_logintime_id', user_id, logintime.desc(), id.desc()),
        Index('ix_record_login_logintime_id', logintime.desc(), id.desc()),
    )


__all__ = ('RecordLogin',)
