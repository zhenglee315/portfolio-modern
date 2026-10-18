# ◆—< Pack >—————————————————————————————————◆ Columns
from .columns import column_id

# ◆—< Pack >—————————————————————————————————◆ Auth
from .models_auth import AuthUser

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
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

    __tablename__ = "record_login"

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● FK / User
    user_id = Column(
        Integer,
        ForeignKey(AuthUser.id, ondelete="RESTRICT"),
        nullable=False,
        comment="Account that successfully signed in; retained when the account is soft-deleted",
    )
    user = relationship(AuthUser, backref=backref("login_records", passive_deletes="all"))
    # ---------------------------------------------------------------------● Login / Network Snapshot
    # Nullable enrichment preserves old login events and partial GeoIP results.
    ip_address = Column(
        String(45),
        nullable=True,
        comment="Normalized request IPv4/IPv6; null when unknown",
    )
    country_code = Column(
        String(2),
        nullable=True,
        comment="IP-derived two-letter country code at login time",
    )
    region = Column(
        String(128),
        nullable=True,
        comment="Approximate IP-derived region name at login time",
    )
    city = Column(
        String(128),
        nullable=True,
        comment="Approximate IP-derived city name at login time",
    )
    geo_status = Column(
        String(24),
        nullable=False,
        default="unknown",
        server_default="unknown",
        comment="GeoIP enrichment result; unknown retains historical events without source IP",
    )
    # ---------------------------------------------------------------------● Time
    logintime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
        comment="UTC timestamp when the account successfully signed in",
    )
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (
        CheckConstraint(id > 0, name="ck_record_login_id_positive"),
        CheckConstraint(
            f"geo_status IN ({', '.join(repr(status) for status in LOGIN_GEO_STATUSES)})",
            name="ck_record_login_geo_status",
        ),
        # The leading user_id also indexes the FK; no separate user_id index is needed.
        Index("ix_record_login_user_id_logintime_id", user_id, logintime.desc(), id.desc()),
        Index("ix_record_login_logintime_id", logintime.desc(), id.desc()),
    )


class RecordRequest(BASE):
    """Immutable completed HTTP events; request_id makes queue redelivery idempotent."""

    __tablename__ = "record_request"

    id = Column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    request_id = Column(String(32), nullable=False)
    run_id = Column(String(128), nullable=False)
    instance_id = Column(String(255), nullable=False)
    process_uid = Column(String(128), nullable=False)
    pid = Column(Integer, nullable=False)
    method = Column(String(16), nullable=False)
    path = Column(String(2048), nullable=False)
    ip_address = Column(String(45), nullable=True)
    country_code = Column(String(2), nullable=True)
    region = Column(String(128), nullable=True)
    city = Column(String(128), nullable=True)
    geo_status = Column(String(24), nullable=False)
    entered_at = Column(DateTime(timezone=True), nullable=False)
    response_started_at = Column(DateTime(timezone=True), nullable=True)
    left_at = Column(DateTime(timezone=True), nullable=False)
    duration_ms = Column(Float, nullable=False)
    http_status = Column(Integer, nullable=True)
    status = Column(String(24), nullable=False)
    failed = Column(Boolean, nullable=False)
    stored_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("request_id", name="uq_record_request_request_id"),
        CheckConstraint("id > 0", name="ck_record_request_id_positive"),
        CheckConstraint("pid > 0", name="ck_record_request_pid_positive"),
        CheckConstraint("duration_ms >= 0", name="ck_record_request_duration"),
        CheckConstraint(
            "http_status IS NULL OR http_status BETWEEN 100 AND 599",
            name="ck_record_request_http_status",
        ),
        CheckConstraint(
            "status IN ('completed', 'error', 'cancelled', 'disconnected')",
            name="ck_record_request_status",
        ),
        CheckConstraint(
            f"geo_status IN ({', '.join(repr(status) for status in LOGIN_GEO_STATUSES)})",
            name="ck_record_request_geo_status",
        ),
        Index("ix_record_request_entered_at_id", entered_at.desc(), id.desc()),
        Index("ix_record_request_instance_entered_at", instance_id, entered_at),
        Index("ix_record_request_http_status_entered_at", http_status, entered_at),
        Index("ix_record_request_country_entered_at", country_code, entered_at),
    )


class RecordMonitorCoverage(BASE):
    """Conservative collection boundary and successful request-ingestion watermark."""

    __tablename__ = "record_monitor_coverage"
    source = Column(String(24), primary_key=True)
    started_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    through_at = Column(DateTime(timezone=True), nullable=True)


class RecordMonitorHealth(BASE):
    """One observation per configured service/minute; absent minutes remain unknown."""

    __tablename__ = "record_monitor_health"
    service_id = Column(String(64), primary_key=True)
    checked_at = Column(DateTime(timezone=True), primary_key=True)
    http_ok = Column(Boolean, nullable=False)
    redis_ok = Column(Boolean, nullable=False)
    database_ok = Column(Boolean, nullable=False)
    http_status = Column(Integer, nullable=True)
    duration_ms = Column(Float, nullable=False)
    __table_args__ = (
        CheckConstraint("duration_ms >= 0", name="ck_record_monitor_health_duration"),
        CheckConstraint(
            "http_status IS NULL OR http_status BETWEEN 100 AND 599", name="ck_record_monitor_health_http_status"
        ),
    )


__all__ = ("RecordLogin", "RecordRequest", "RecordMonitorCoverage", "RecordMonitorHealth")
