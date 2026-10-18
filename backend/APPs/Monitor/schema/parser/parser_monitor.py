"""Bounded local-calendar queries and strict monitoring Socket.IO payloads."""

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.parser import parser_caching

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.settings import MONITOR_SERVICE_ID

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends, HTTPException, Query, Request

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, ConfigDict, Field

# ◆—< Pack >—————————————————————————————————◆ Python
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone as utc_timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import re

MONITOR_PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "Vary": "Cookie"}
MAX_DAYS = 93


def invalid_query(detail="MONITOR_INVALID_QUERY"):
    return HTTPException(status_code=400, detail=detail, headers=MONITOR_PRIVATE_HEADERS)


@dataclass(frozen=True)
class MonitorPeriod:
    """Inclusive local dates; database intervals always use an exclusive UTC end."""

    start: date
    end: date
    timezone: str
    service_id: str | None = None
    scope: Literal["http", "portfolio"] = "http"

    @property
    def days(self):
        return (self.end - self.start).days + 1

    def midnight(self, day):
        return datetime.combine(day, time.min, ZoneInfo(self.timezone)).astimezone(utc_timezone.utc)

    @property
    def bounds(self):
        return self.midnight(self.start), self.midnight(self.end + timedelta(days=1))

    @property
    def previous(self):
        return MonitorPeriod(
            self.start - timedelta(days=self.days),
            self.start - timedelta(days=1),
            self.timezone,
            self.service_id,
            self.scope,
        )

    def buckets(self):
        for offset in range(self.days):
            day = self.start + timedelta(days=offset)
            yield day, self.midnight(day), self.midnight(day + timedelta(days=1))


def _period(request, start, end, timezone, service_id, *, scope="http", traffic=False):
    allowed = {"start", "end", "timezone", "service_id", "is_caching"} | ({"scope"} if traffic else set())
    if set(request.query_params) - allowed or any(
        len(request.query_params.getlist(key)) != 1 for key in request.query_params
    ):
        raise invalid_query()
    try:
        if len(timezone) > 128:
            raise ValueError
        zone = ZoneInfo(timezone)
        today = datetime.now(zone).date()
        if (start is None) != (end is None):
            raise ValueError
        if start is None:
            last = today - timedelta(days=1)
            first = last - timedelta(days=6)
        else:
            if not all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", item) for item in (start, end)):
                raise ValueError
            first, last = date.fromisoformat(start), date.fromisoformat(end)
        if not 1 <= (last - first).days + 1 <= MAX_DAYS or last > today:
            raise ValueError
        if scope not in ("http", "portfolio"):
            raise ValueError
        if service_id is not None and not re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", service_id):
            raise ValueError
        if service_id is not None and service_id != MONITOR_SERVICE_ID:
            raise HTTPException(status_code=404, detail="MONITOR_SERVICE_NOT_FOUND", headers=MONITOR_PRIVATE_HEADERS)
        # Pin implicit dates and service identity before cache lookup, as Portfolio
        # parsers resolve their content scope before returning query_string.
        period = MonitorPeriod(first, last, timezone, MONITOR_SERVICE_ID, scope)
        # Validate both intervals now, including the lower calendar boundary.
        period.previous.bounds
        return period
    except (ValueError, TypeError, OverflowError, ZoneInfoNotFoundError):
        raise invalid_query() from None


def parser_monitor_period(
    request: Request,
    start: str | None = Query(None, description="First local date, YYYY-MM-DD; supply with end."),
    end: str | None = Query(None, description="Last local date inclusive; at most 93 days, no future dates."),
    timezone: str = Query("UTC", description="IANA time zone, e.g. Asia/Taipei. Defaults to seven completed days."),
    service_id: str | None = Query(None, description="Configured service from /monitor/services."),
    is_caching: bool = Depends(parser_caching),
) -> dict:
    return {"period": _period(request, start, end, timezone, service_id), "is_caching": is_caching}


def parser_monitor_traffic(
    request: Request,
    start: str | None = Query(None, description="First local date, YYYY-MM-DD; supply with end."),
    end: str | None = Query(None, description="Last local date inclusive; maximum 93 days."),
    timezone: str = Query("UTC", description="IANA time zone for daily buckets and the equal-length prior period."),
    service_id: str | None = Query(None, description="Configured service from /monitor/services."),
    scope: str = Query("http", description="http counts application HTTP requests; portfolio limits /portfolio/*."),
    is_caching: bool = Depends(parser_caching),
) -> dict:
    return {
        "period": _period(request, start, end, timezone, service_id, scope=scope, traffic=True),
        "is_caching": is_caching,
    }


def parser_monitor_services(request: Request) -> None:
    if request.query_params:
        raise invalid_query()


def parser_monitor_request_totals(request: Request) -> None:
    """Current server-run counters accept no date, worker, service or response-cache selectors."""
    if request.query_params:
        raise invalid_query()


class MonitorTestMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(default="monitor test", max_length=256, strict=True)


class MonitorSubscription(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topics: list[str] = Field(min_length=1, max_length=2)
