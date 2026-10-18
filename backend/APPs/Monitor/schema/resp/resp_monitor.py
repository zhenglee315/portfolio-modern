"""Public monitoring contracts; no account identities, IPs or credentials."""

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, Field

# ◆—< Pack >—————————————————————————————————◆ Python
from datetime import date, datetime
from typing import Literal


class RespMonitorPeriod(BaseModel):
    start: date
    end: date
    timezone: str
    service_id: str


class RespMonitorCoverage(BaseModel):
    started_at: datetime | None
    data_as_of: datetime | None
    complete: bool
    basis: Literal["best_effort_http_events", "stored_successful_sign_ins"]


class RespMonitorDay(BaseModel):
    date: date
    count: int = Field(ge=0, description="Observed count; check complete before treating zero as no activity.")
    complete: bool


class RespMonitorComparison(BaseModel):
    start: date
    end: date
    total: int = Field(ge=0)
    complete: bool
    change_percent: float | None = Field(description="Null for incomplete coverage or a zero prior denominator.")


class RespMonitorTraffic(BaseModel):
    period: RespMonitorPeriod
    metric: Literal["http_requests"] = "http_requests"
    scope: Literal["http", "portfolio"]
    total: int = Field(ge=0)
    daily_average: float = Field(ge=0)
    series: list[RespMonitorDay]
    comparison: RespMonitorComparison
    coverage: RespMonitorCoverage
    generated_at: datetime


class RespMonitorCountry(BaseModel):
    country_code: str = Field(pattern=r"^[A-Z]{2}$")
    users: int = Field(ge=0)
    percent: float = Field(ge=0, le=100, description="Share of all distinct users, including unknown locations.")


class RespMonitorLogins(BaseModel):
    """
    Separate each account's latest country, local network and unresolved sign-in location.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    period: RespMonitorPeriod
    total: int = Field(ge=0, description="Distinct accounts in the entire selected period, not daily counts summed.")
    series: list[RespMonitorDay]
    comparison: RespMonitorComparison
    countries: list[RespMonitorCountry]
    country_count: int = Field(ge=0)
    local_users: int = Field(
        default=0, ge=0, description="Latest sign-in has a non-public IP, including localhost and LAN."
    )
    unknown_users: int = Field(ge=0)
    coverage: RespMonitorCoverage
    generated_at: datetime


class RespMonitorAvailabilityDay(BaseModel):
    date: date
    expected: int = Field(ge=0)
    observed: int = Field(ge=0)
    successful: int = Field(ge=0)
    availability_percent: float | None
    coverage_percent: float | None


class RespMonitorHealthObservation(BaseModel):
    checked_at: datetime
    http_ok: bool
    redis_ok: bool
    database_ok: bool
    http_status: int | None
    duration_ms: float = Field(ge=0)


class RespMonitorAvailability(BaseModel):
    period: RespMonitorPeriod
    basis: Literal["sampled_http_and_dependencies"] = "sampled_http_and_dependencies"
    expected: int = Field(ge=0)
    observed: int = Field(ge=0)
    successful: int = Field(ge=0)
    availability_percent: float | None
    coverage_percent: float | None
    slo_target_percent: float
    slo_met: bool | None = Field(description="Unknown until every expected minute of the full period is observed.")
    series: list[RespMonitorAvailabilityDay]
    latest: RespMonitorHealthObservation | None
    current_status: Literal["healthy", "unhealthy", "unknown"]
    generated_at: datetime


class RespMonitorService(BaseModel):
    id: str
    name: str
    environment: str
    region: str | None
    scope: Literal["shared_database"] = "shared_database"
    host: str
    port: int
    expected_workers: int
    versions: dict[str, str]
    probe_scope: Literal["configured_endpoint"] = "configured_endpoint"


class RespMonitorServices(BaseModel):
    items: list[RespMonitorService]
    refresh_seconds: int = 30
    history_flush_seconds: int = 60
    worker_cycle_seconds: float


class RespMonitorHealth(BaseModel):
    status: Literal["ok"] = "ok"


class RespMonitorRequestTotals(BaseModel):
    """
    Successful and failed terminal outcomes across all Workers in the current server run.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    run_id: str
    instance_id: str
    basis: Literal["server_run"] = "server_run"
    total: int = Field(ge=0, description="successful + failed; excludes in-flight and monitor requests.")
    successful: int = Field(ge=0, description="Fully sent HTTP 2xx and 3xx responses.")
    failed: int = Field(ge=0, description="HTTP 4xx/5xx, exceptions, cancellations and disconnects.")
    started_at: datetime
    sampled_at: datetime
