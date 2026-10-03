# ◆—< Pack >———————————————————————————————————————————————————————————————————————————◆ Sqlalchemy
from sqlalchemy import Boolean, Column, Integer, String, DateTime, Float, Text, BigInteger, Interval
from sqlalchemy.sql import func


# ■—< COLS >———————————————————————————————————————————————————————————————————————————■ Basic Column Factories
def column_id() -> Column:
    return Column(Integer, primary_key=True, autoincrement=True, comment='Auto-incrementing primary key')


def column_desc() -> Column:
    return Column(Text, nullable=True, comment='Descriptive text about the row content.')


def column_completetime() -> Column:
    return Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        comment='UTC timestamp when the record was completed',
    )


def column_durationtime() -> Column:
    """
    Returns a SQLAlchemy Column for storing duration intervals (e.g., processing time),
    using PostgreSQL INTERVAL type. Value is nullable by default.
    """
    return Column(Interval, nullable=True, comment='Duration interval (e.g. "00:12:34")')


def column_createtime() -> Column:
    return Column(
        DateTime(timezone=True), nullable=False, default=func.now(), comment='UTC timestamp when the record was created'
    )


def column_createuser() -> Column:
    return Column(String(64), nullable=False, comment='Username of the creator')


def column_updatetime() -> Column:
    return Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
        comment='UTC timestamp when the record was last updated',
    )


def column_updateuser() -> Column:
    return Column(String(64), nullable=False, comment='Username of the last updater')


def column_is_freeze() -> Column:
    return Column(
        Boolean, nullable=False, default=False, comment='True if operations in this data (row) are currently frozen'
    )


def column_is_active() -> Column:
    return Column(Boolean, nullable=False, default=True, index=True, comment='True if the data is active')


def column_reason() -> Column:
    return Column(Text, nullable=False, comment='English description of the data (row)')


def column_reason_cn() -> Column:
    return Column(Text, nullable=False, comment='English description of the data (row)')


# ■—< COLS >———————————————————————————————————————————————————————————————————————————■ UI / Visualizations
def column_index() -> Column:
    return Column(
        Float,
        nullable=False,
        index=True,
        default=1,
        comment='Specifies the order in which records are displayed in visualizations',
    )


def column_color() -> Column:
    return Column(String(7), nullable=False, index=True, comment='Hex color for UI display (e.g., #FF0000)')


# ■—< COLS >———————————————————————————————————————————————————————————————————————————■ Traceability / Relation Column
def column_region() -> Column:
    return Column(String(64), nullable=True, index=True, comment='Region code where the file was stored (optional)')


def column_factory() -> Column:
    return Column(String(64), nullable=True, index=True, comment='Factory code associated with the file (optional)')


def column_plant() -> Column:
    return Column(String(64), nullable=True, index=True, comment='Plant code within the factory (optional)')


def column_owner() -> Column:
    return Column(String(64), nullable=True, index=True, comment='Owner or responsible entity code (optional)')


def column_line() -> Column:
    return Column(
        String(64), nullable=True, index=True, comment='Production line code where the file originated (optional)'
    )

def column_section() -> Column:
    return Column(
        String(64), nullable=True, index=True, comment='Section code where the file originated (optional)'
    )


# ■—< COLS >———————————————————————————————————————————————————————————————————————————■ Calculation Column Factories
def column_size_mb() -> Column:
    return Column(Float(precision=53), nullable=True, comment='Size of the artifact in megabytes (MB)')


def column_ttl_str() -> Column:
    return Column(String(16), nullable=True, comment='Time-to-live duration (e.g., "1M"); null if unlimited')


# ■—< COLS >———————————————————————————————————————————————————————————————————————————■ MES
def column_eqp_code(nullable: bool = False) -> Column:
    return Column(String(64), nullable=nullable, index=True, comment='Equipment code (e.g., E022111206)')


def column_error_type() -> Column:
    return Column(
        String(16), nullable=False, index=True, comment='Classification of error source (e.g., product, machine)'
    )


def column_mes_model() -> Column:
    return Column(String(64), nullable=False, index=True, comment='Manufacturing product type')


def column_mes_mono() -> Column:
    return Column(String(64), nullable=False, index=True, comment='Manufacturing order number')


# ■—< COLS >———————————————————————————————————————————————————————————————————————————■ Algorithm
def column_algo_is_critical() -> Column:
    return Column(
        Boolean, nullable=False, default=True, index=True, comment='True if this status stops further tree growth.'
    )


# ■—< COLS >———————————————————————————————————————————————————————————————————————————■ Schedule
def column_is_paused() -> Column:
    return Column(
        Boolean, nullable=False, default=False, index=True, comment='True if the schedule is currently paused'
    )
