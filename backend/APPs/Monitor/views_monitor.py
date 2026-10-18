"""HTTP declarations for the monitoring overview; business logic stays in its module."""

# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.module.module_permission import ManagementPermission
from APPs.Monitor.module import MonitorModule
from APPs.Monitor.schema.parser import (
    MONITOR_PRIVATE_HEADERS,
    parser_monitor_period,
    parser_monitor_services,
    parser_monitor_request_totals,
    parser_monitor_traffic,
)
from APPs.Monitor.schema.resp import (
    RespMonitorAvailability,
    RespMonitorHealth,
    RespMonitorLogins,
    RespMonitorServices,
    RespMonitorTraffic,
    RespMonitorRequestTotals,
)

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.decorator import cache

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import CacheExpiry, EnumCacheNamespace
from SYSTEM.models import AuthRole
from SYSTEM.tools import FastApiRouter, cbv
from SYSTEM.urls import PreFix, Tags, RouteMonitor

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Any


class MonitorRoute(APIRoute):
    """
    Keep private headers on cached responses, 304s and parameter/dependency errors.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    def get_route_handler(self):
        handler = super().get_route_handler()

        async def handle(request: Request):
            try:
                response = await handler(request)
            except RequestValidationError as error:
                detail = [{"loc": item["loc"], "type": item["type"], "msg": item["msg"]} for item in error.errors()]
                raise HTTPException(status_code=422, detail=detail, headers=MONITOR_PRIVATE_HEADERS) from None
            except HTTPException as error:
                error.headers = {**(error.headers or {}), **MONITOR_PRIVATE_HEADERS}
                raise
            response.headers.update(MONITOR_PRIVATE_HEADERS)
            return response

        return handle


router = FastApiRouter(prefix=PreFix.Monitor, tags=Tags.Monitor, route_class=MonitorRoute)

_PERMISSION = [Depends(ManagementPermission(AuthRole.is_monitor))]
_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"description": "Invalid, repeated or unknown query parameters."},
    401: {"description": "An enabled signed-in account and role are required."},
    403: {"description": "Current site-management permission is required."},
    404: {"description": "Unknown service; enumerate /monitor/services."},
    503: {"description": "Monitoring storage is unavailable."},
}
# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Monitor - Private Access
_PRIVATE_ACCESS_DESCRIPTION = (
    "🔒 **Access and Privacy:**\n"
    "- Requires a signed-in, enabled account and role with `is_monitor=true`.\n"
    "- Identity comes from the server-side SESSION; client-supplied permission flags do not grant access.\n"
    "- Current account and role permissions are checked before every request, including cache hits and conditional reads.\n"
    "- Responses use `Cache-Control: private, no-store` and `Vary: Cookie`.\n\n"
)

# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Monitor - Calendar and Service
_PERIOD_DESCRIPTION = (
    "📅 **Period and Service Selection:**\n"
    "- Supply `start` and `end` together as `YYYY-MM-DD`; both local dates are inclusive.\n"
    "- Omit both dates to select the most recent seven completed days in the requested time zone.\n"
    "- `timezone` accepts an IANA name such as `Asia/Taipei` or `Europe/London`; the default is `UTC`.\n"
    "- A period can contain 1–93 days and may include today; future dates are rejected.\n"
    "- Daily boundaries are converted to `[start, end + 1 day)` in UTC, respecting daylight-saving changes.\n"
    "- Omit `service_id` for the configured service, or use its ID from `GET /monitor/services`.\n"
    "- This deployment exposes one logical service backed by the shared database.\n\n"
)

# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Monitor - Comparison and Coverage
_COMPARISON_DESCRIPTION = (
    "📊 **Comparison and Coverage:**\n"
    "- The comparison period immediately precedes `start` and contains the same number of local calendar days.\n"
    "- `change_percent` is `(total - comparison.total) / comparison.total × 100`, rounded to two decimals.\n"
    "- The change is `null` when either period lacks coverage or the previous total is zero.\n"
    "- `coverage.started_at` is the recorded collection boundary; older observations can still be returned.\n"
    "- `coverage.data_as_of` identifies how far the source is known to be available.\n"
    "- `coverage.complete` and each day's `complete` describe collection coverage, not an audit guarantee.\n"
    "- A zero count with incomplete coverage must not be interpreted as confirmed zero activity.\n\n"
)

# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Monitor - Caching
_CACHING_DESCRIPTION = (
    "⚡ **Caching:**\n"
    "- Set `is_caching=true` to reuse a server-side aggregate for up to 60 seconds.\n"
    "- Omit the flag or set it to `false` to query current storage for this request.\n"
    "- Permission checks, parameter validation, and implicit date/service resolution happen before cache lookup.\n"
    "- Cached reads expose `X-FastAPI-Cache: HIT` or `MISS`; a matching `If-None-Match` can return 304.\n"
    "- `generated_at` remains the original snapshot time on a cache hit; updates do not automatically clear the cache.\n"
    "- This is server-side caching; browser responses retain the private, no-store policy.\n\n"
)

# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Monitor - Aggregate Errors
_AGGREGATE_ERRORS_DESCRIPTION = (
    "🚦 **Errors:**\n"
    "- Invalid dates, time zones, ranges, or unknown/repeated parameters return 400 `MONITOR_INVALID_QUERY`.\n"
    "- An unknown configured service returns 404 `MONITOR_SERVICE_NOT_FOUND`.\n"
    "- An invalid boolean `is_caching` value returns 422.\n"
    "- Missing/disabled identity returns 401; insufficient permission returns 403.\n"
    "- Unavailable aggregate storage returns 503 `MONITOR_UNAVAILABLE`; identity-storage failures also return 503.\n\n"
)


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Monitor - HTTP Traffic
@cbv(router)
class MonitorTraffic:
    """
    Serve HTTP traffic totals, calendar-day series and preceding-period comparisons.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    @router.get(
        RouteMonitor.TRAFFIC,
        summary="Query Monitor HTTP Traffic",
        description=(
            _PRIVATE_ACCESS_DESCRIPTION
            + "Retrieve observed HTTP traffic for the overview cards and daily trend chart.\n\n"
            + _PERIOD_DESCRIPTION
            + "🌐 **Traffic Scope:**\n"
            "- `scope=http` is the default and counts monitored application HTTP requests.\n"
            "- `scope=portfolio` limits the same metric to paths beginning with `/portfolio/`.\n"
            "- Counts represent requests, not page views, distinct IPs, online visitors, or signed-in accounts.\n"
            "- Repeated requests count separately; stored error, cancelled, and disconnected outcomes also count.\n"
            "- Monitor routes are excluded so dashboard polling does not inflate this metric.\n\n"
            "🗂️ **How It Works:**\n"
            "- Aggregates completed request-history records by `entered_at` using the selected local-day boundaries.\n"
            "- Returns `total`, `daily_average`, and one chronological `series` item for every selected date.\n"
            "- `daily_average` divides the observed total by the number of selected days, rounded to two decimals.\n"
            "- Dates without stored observations have count zero and an independent coverage flag.\n"
            "- Request history is normally flushed every 60 seconds; backlog or failures can delay availability.\n"
            "- The watermark advances only after a successful queue drain; it can be null before the first flush.\n\n"
            + _COMPARISON_DESCRIPTION
            + _CACHING_DESCRIPTION
            + "🔎 **Request Example:**\n"
            "`GET /monitor/traffic?start=2026-10-15&end=2026-10-15&timezone=Asia/Taipei"
            "&scope=http&is_caching=true`\n\n"
            "📦 **Response Format:**\n"
            "Illustrative one-day response:\n"
            "```json\n"
            "{\n"
            '  "period": {"start": "2026-10-15", "end": "2026-10-15",\n'
            '    "timezone": "Asia/Taipei", "service_id": "api"},\n'
            '  "metric": "http_requests", "scope": "http",\n'
            '  "total": 240, "daily_average": 240.0,\n'
            '  "series": [{"date": "2026-10-15", "count": 240, "complete": true}],\n'
            '  "comparison": {"start": "2026-10-14", "end": "2026-10-14",\n'
            '    "total": 200, "complete": true, "change_percent": 20.0},\n'
            '  "coverage": {"started_at": "2026-10-01T00:00:00Z",\n'
            '    "data_as_of": "2026-10-15T23:59:00Z", "complete": true,\n'
            '    "basis": "best_effort_http_events"},\n'
            '  "generated_at": "2026-10-16T00:00:00Z"\n'
            "}\n"
            "```\n\n" + _AGGREGATE_ERRORS_DESCRIPTION + "📝 **Notes:**\n"
            "- The response is one aggregate object without pagination or raw request details.\n"
            "- Collection is best-effort: a worker crash before publication or a full buffer can lose observations.\n"
            "- A selected period containing today remains incomplete until its final local day has ended and been ingested.\n"
            "- Timestamp fields use UTC ISO 8601; series dates follow `period.timezone`."
        ),
        response_model=RespMonitorTraffic,
        dependencies=_PERMISSION,
        responses=_RESPONSES,
    )
    @cache(expire=CacheExpiry.MIN, namespace=EnumCacheNamespace.MONITOR)
    async def get_traffic(self, query_string: dict = Depends(parser_monitor_traffic)) -> dict:
        """
        Return the traffic overview assembled from the validated period and scope.

        :param query_string: Resolved calendar/service period, traffic scope and shared caching flag.
        :return: Traffic totals, daily series, comparison and collection coverage.
        :raises HTTPException: Query, permission, service selection or monitoring storage is unavailable/invalid.

                                                                                               ♂ ZhengLee 2026.10.18
        """
        return await MonitorModule().traffic(query_string["period"])


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Monitor - Sign-ins and Countries
@cbv(router)
class MonitorLogins:
    """
    Serve distinct sign-in totals and each account's last in-period country distribution.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    @router.get(
        RouteMonitor.LOGINS,
        summary="Query Monitor Distinct Sign-ins and Countries",
        description=(
            _PRIVATE_ACCESS_DESCRIPTION
            + "Retrieve distinct successful sign-ins and the geographic distribution used by the overview map.\n\n"
            + _PERIOD_DESCRIPTION
            + "👥 **Sign-in Counts:**\n"
            "- `total` counts distinct accounts with at least one successful sign-in during the entire period.\n"
            "- Each daily `series.count` independently deduplicates accounts within that local date.\n"
            "- One account can appear on several days, so adding daily counts can exceed the period total.\n"
            "- Failed sign-ins, restored sessions, and current online presence do not create successful-login events.\n"
            "- Successful-login events are saved at sign-in time; the overview does not wait for the request-history flush.\n\n"
            "🌍 **Country Distribution:**\n"
            "- Selects each account's last successful sign-in within the requested period.\n"
            "- The larger record ID wins when two events have the same timestamp.\n"
            "- Localhost and private-network last sign-ins (`geo_status=non_public`) count under `local_users`.\n"
            "- Other unresolved last locations count under `unknown_users`; no account falls back to an older country.\n"
            "- `countries` contains two-letter country codes, distinct user counts, and percentages of all period users.\n"
            "- Local and unknown users remain in the percentage denominator; known-country shares may sum to less than 100%.\n"
            "- Countries sort by user count descending, then country code; `country_count` excludes local and unknown locations.\n"
            "- Existing stored GeoIP snapshots are used; reading this endpoint performs no IP lookup.\n\n"
            + _COMPARISON_DESCRIPTION
            + _CACHING_DESCRIPTION
            + "🔎 **Request Example:**\n"
            "`GET /monitor/logins?start=2026-10-15&end=2026-10-15&timezone=Asia/Taipei&is_caching=true`\n\n"
            "📦 **Response Format:**\n"
            "Illustrative one-day response with one local-network account:\n"
            "```json\n"
            "{\n"
            '  "period": {"start": "2026-10-15", "end": "2026-10-15",\n'
            '    "timezone": "Asia/Taipei", "service_id": "api"},\n'
            '  "total": 10,\n'
            '  "series": [{"date": "2026-10-15", "count": 10, "complete": true}],\n'
            '  "comparison": {"start": "2026-10-14", "end": "2026-10-14",\n'
            '    "total": 8, "complete": true, "change_percent": 25.0},\n'
            '  "countries": [\n'
            '    {"country_code": "TW", "users": 6, "percent": 60.0},\n'
            '    {"country_code": "GB", "users": 3, "percent": 30.0}\n'
            "  ],\n"
            '  "country_count": 2, "local_users": 1, "unknown_users": 0,\n'
            '  "coverage": {"started_at": "2026-10-01T00:00:00Z",\n'
            '    "data_as_of": "2026-10-16T00:00:00Z", "complete": true,\n'
            '    "basis": "stored_successful_sign_ins"},\n'
            '  "generated_at": "2026-10-16T00:00:00Z"\n'
            "}\n"
            "```\n\n" + _AGGREGATE_ERRORS_DESCRIPTION + "📝 **Notes:**\n"
            "- Returns aggregate counts only; no account IDs, email addresses, source IPs, or login-event details.\n"
            "- Empty periods return total zero, a zero-count series, `countries=[]`, `local_users=0` and `unknown_users=0`.\n"
            "- The frontend anchors local users to a Robot marker; this marker is not a geographic coordinate.\n"
            "- Old events without IP data remain unknown; reading this API never relabels them as localhost.\n"
            "- Country names and map coordinates are resolved by the frontend from `country_code`.\n"
            "- Counts cover retained shared-database history, not per-worker or per-website login ownership.\n"
            "- Login coverage uses the collection boundary and query time; timestamps are UTC ISO 8601."
        ),
        response_model=RespMonitorLogins,
        dependencies=_PERMISSION,
        responses=_RESPONSES,
    )
    @cache(expire=CacheExpiry.MIN, namespace=EnumCacheNamespace.MONITOR)
    async def get_logins(self, query_string: dict = Depends(parser_monitor_period)) -> dict:
        """
        Return the distinct-login overview and last-login country aggregates.

        :param query_string: Resolved calendar/service period and shared caching flag.
        :return: Distinct user totals, daily series, comparison, country distribution and coverage.
        :raises HTTPException: Query, permission, service selection or monitoring storage is unavailable/invalid.

                                                                                               ♂ ZhengLee 2026.10.18
        """
        return await MonitorModule().logins(query_string["period"])


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Monitor - Sampled Availability
@cbv(router)
class MonitorAvailability:
    """
    Serve sampled service availability, observation coverage and the latest health snapshot.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    @router.get(
        RouteMonitor.AVAILABILITY,
        summary="Query Monitor Sampled Availability",
        description=(
            _PRIVATE_ACCESS_DESCRIPTION
            + "Retrieve sampled availability, monitoring coverage, daily trends and the latest service health.\n\n"
            + _PERIOD_DESCRIPTION
            + "🩺 **Health Observations:**\n"
            "- The scheduler independently probes the configured HTTP endpoint, SYS Redis ping, and SQL `SELECT 1`.\n"
            "- One stored observation per configured service and UTC minute is retained; duplicate runs keep the first.\n"
            "- An observation succeeds only when HTTP, Redis, and SQL all pass.\n"
            "- Missing scheduler runs or results that cannot be persisted remain unknown minutes, not successes.\n"
            "- These probes measure the configured endpoint and dependencies, separately from Worker lifespan heartbeats.\n\n"
            "📊 **Availability, Coverage and SLO:**\n"
            "- `expected` counts completed minute slots in the selected dates; today's unfinished minute is excluded.\n"
            "- Daily minute counts follow the requested time zone, so daylight-saving days can have 23 or 25 hours.\n"
            "- `observed` counts stored checks; `successful` counts checks where all three components passed.\n"
            "- `availability_percent` is `successful / observed × 100`; it is null when no checks were observed.\n"
            "- `coverage_percent` is `observed / expected × 100`; it is null when no minutes are expected.\n"
            "- Percentages are rounded to four decimals; missing observations reduce coverage without implying success.\n"
            "- `slo_target_percent` comes from configuration and defaults to 99.9.\n"
            "- `slo_met` is evaluated only for an ended period with every expected minute observed; otherwise it is null.\n"
            "- `series` returns the same counts and percentages for each selected local date, in chronological order.\n\n"
            "🕒 **Latest Service Status:**\n"
            "- `latest` is the service's newest observation, even when it falls outside the selected historical period.\n"
            "- `checked_at` is its UTC minute identifier; `duration_ms` is the probe cycle duration, not HTTP latency.\n"
            "- At `generated_at`, a check no older than 120 seconds is healthy if all components passed, otherwise unhealthy.\n"
            "- Missing, stale, or future-dated checks produce `current_status=unknown`.\n"
            "- A cache hit preserves this snapshot; opting into caching can add up to 60 seconds of display lag.\n\n"
            + _CACHING_DESCRIPTION
            + "🔎 **Request Example:**\n"
            "`GET /monitor/availability?start=2026-10-15&end=2026-10-15"
            "&timezone=Asia/Taipei&is_caching=true`\n\n"
            "📦 **Response Format:**\n"
            "Illustrative fully observed day with one failed check; latest is a newer, healthy observation:\n"
            "```json\n"
            "{\n"
            '  "period": {"start": "2026-10-15", "end": "2026-10-15",\n'
            '    "timezone": "Asia/Taipei", "service_id": "api"},\n'
            '  "basis": "sampled_http_and_dependencies",\n'
            '  "expected": 1440, "observed": 1440, "successful": 1439,\n'
            '  "availability_percent": 99.9306, "coverage_percent": 100.0,\n'
            '  "slo_target_percent": 99.9, "slo_met": true,\n'
            '  "series": [{"date": "2026-10-15", "expected": 1440,\n'
            '    "observed": 1440, "successful": 1439,\n'
            '    "availability_percent": 99.9306, "coverage_percent": 100.0}],\n'
            '  "latest": {"checked_at": "2026-10-15T23:59:00Z",\n'
            '    "http_ok": true, "redis_ok": true, "database_ok": true,\n'
            '    "http_status": 200, "duration_ms": 12.5},\n'
            '  "current_status": "healthy",\n'
            '  "generated_at": "2026-10-16T00:00:00Z"\n'
            "}\n"
            "```\n\n" + _AGGREGATE_ERRORS_DESCRIPTION + "📝 **Notes:**\n"
            "- This is the success ratio of observed probes, not a continuous-time uptime guarantee.\n"
            "- Before collection begins, historical dates have no observations; availability cannot be backfilled.\n"
            "- A period with no checks returns `observed=0`, `successful=0`, null availability and null SLO status.\n"
            "- `latest` and `current_status` describe the current service snapshot, not the selected period's final state.\n"
            "- The response is one aggregate object without pagination; timestamp fields use UTC ISO 8601."
        ),
        response_model=RespMonitorAvailability,
        dependencies=_PERMISSION,
        responses=_RESPONSES,
    )
    @cache(expire=CacheExpiry.MIN, namespace=EnumCacheNamespace.MONITOR)
    async def get_availability(self, query_string: dict = Depends(parser_monitor_period)) -> dict:
        """
        Return sampled availability and the latest health observation for the configured service.

        :param query_string: Resolved calendar/service period and shared caching flag.
        :return: Daily/period probe statistics, SLO evaluation and latest service status.
        :raises HTTPException: Query, permission, service selection or monitoring storage is unavailable/invalid.

                                                                                               ♂ ZhengLee 2026.10.18
        """
        return await MonitorModule().availability(query_string["period"])


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Monitor - Services and Versions
@cbv(router)
class MonitorServices:
    """
    Describe the configured logical service and the runtime serving this deployment.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    @router.get(
        RouteMonitor.SERVICES,
        summary="Query Monitor Services and Runtime Versions",
        description=(
            _PRIVATE_ACCESS_DESCRIPTION
            + "Retrieve service selector options, deployment labels, runtime versions and overview refresh guidance.\n\n"
            "🖥️ **Service Metadata:**\n"
            "- `items` currently contains the deployment's single configured logical service.\n"
            "- `id` is the `service_id` accepted by the traffic, sign-in and availability APIs.\n"
            "- `name`, `environment`, and optional `region` come from deployment configuration.\n"
            "- `region` is null when no deployment region has been configured; it is not inferred from login IPs.\n"
            "- `host`, `port`, and `expected_workers` describe the configured API listener and Worker target.\n"
            "- `versions` contains the actual installed FastAPI, Uvicorn, and Python runtime versions.\n"
            "- `scope=shared_database` identifies the aggregation boundary, not per-website login attribution.\n"
            "- `probe_scope=configured_endpoint` identifies the availability probe target type; its URL is not exposed.\n\n"
            "⏱️ **Refresh Guidance:**\n"
            "- `refresh_seconds=30` is the suggested overview refresh interval.\n"
            "- `history_flush_seconds=60` is the request-history persistence interval.\n"
            "- `worker_cycle_seconds` is the configured Worker sampling and Socket.IO update cadence.\n"
            "- An overview refresh can therefore return the same saved history as the previous refresh.\n\n"
            "⚡ **Caching and Parameters:**\n"
            "- This endpoint does not use the aggregate response-cache decorator.\n"
            "- It accepts no query parameters; dates, service selectors, and `is_caching` are rejected.\n"
            "- Deployment values are read from the running service configuration and installed packages.\n\n"
            "🔎 **Request Example:**\n"
            "`GET /monitor/services`\n\n"
            "📦 **Response Format:**\n"
            "Illustrative local deployment; labels and versions depend on the running installation:\n"
            "```json\n"
            "{\n"
            '  "items": [{\n'
            '    "id": "api", "name": "Core API", "environment": "local",\n'
            '    "region": null, "scope": "shared_database",\n'
            '    "host": "127.0.0.1", "port": 8080, "expected_workers": 4,\n'
            '    "versions": {"fastapi": "0.141.1", "uvicorn": "0.54.0", "python": "3.13.15"},\n'
            '    "probe_scope": "configured_endpoint"\n'
            "  }],\n"
            '  "refresh_seconds": 30, "history_flush_seconds": 60, "worker_cycle_seconds": 0.5\n'
            "}\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- The `items` array is not paginated and is not an inventory of every machine or running Worker.\n"
            "- Use the `/monitor` Socket.IO namespace and `workers` topic for live Worker counts and resource gauges.\n"
            "- Shared-database login statistics cannot be split into arbitrary services using this selector.\n"
            "- Unknown query parameters return 400; missing identity returns 401; insufficient permission returns 403.\n"
            "- Identity-storage failures return 503; no credentials, session data, or probe URL are included."
        ),
        response_model=RespMonitorServices,
        dependencies=[*_PERMISSION, Depends(parser_monitor_services)],
        responses=_RESPONSES,
    )
    async def get_services(self):
        """
        Return service metadata and update intervals from the running deployment.

        :return: Configured service options, actual versions and monitoring refresh guidance.
        :raises HTTPException: Query parameters, identity or current permission are invalid/unavailable.

                                                                                               ♂ ZhengLee 2026.10.18
        """
        return await MonitorModule.services()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Monitor - Server Run Request Totals
@cbv(router)
class MonitorRequestTotals:
    """
    Read current server-run HTTP outcome counters shared by every Worker through SYS Redis.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    @router.get(
        RouteMonitor.REQUEST_TOTALS,
        summary="Query Monitor Server Run Request Totals",
        description=(
            _PRIVATE_ACCESS_DESCRIPTION
            + "Retrieve successful and failed request totals for the Services & Workers cards.\n\n"
            "🗂️ **How It Works:**\n"
            "- The existing HTTP MonitorMiddleware records each terminal request exactly once.\n"
            "- All Workers in this instance and supervisor run publish to one shared SYS Redis hash.\n"
            "- The API reads that Redis hash directly; request-history SQL is not queried.\n"
            "- `total` equals `successful + failed`; in-flight requests are not included.\n"
            "- `successful` counts HTTP 2xx/3xx after the final response body/trailers have been sent.\n"
            "- `failed` counts HTTP 4xx/5xx, missing final responses, exceptions, cancellations and disconnects.\n"
            "- WebSocket/Socket.IO, monitoring endpoints and the middleware's health/documentation exclusions are omitted.\n"
            "- A response followed by failing background work retains its already completed HTTP outcome.\n\n"
            "⏱️ **Run and Refresh:**\n"
            "- `run_id` identifies the current supervisor startup; a full server restart starts new counters.\n"
            "- Worker replacement within the same run retains totals from previous Workers.\n"
            "- `started_at` is when this run first initialized its metrics; `sampled_at` is its last publication.\n"
            "- Cumulative per-process checkpoints prevent retry or out-of-order publication from double counting.\n"
            "- Publication uses the existing Worker cycle; idle keys refresh every 30 seconds.\n"
            "- Keys expire 24 hours after their last publication, so a running idle server retains its counters.\n"
            "- Collection is best-effort: an abrupt Worker exit before publication can lose buffered outcomes.\n\n"
            "⚡ **Caching and Parameters:**\n"
            "- No query parameters or response-cache decorator; dates, worker filters and `is_caching` are rejected.\n"
            "- Every read rechecks current account/role permission and returns private, no-store headers.\n"
            "- No previous server runs, persisted history or public website counts are added to this run.\n\n"
            "🔎 **Request Example:**\n"
            "`GET /monitor/request-totals`\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            '{"run_id":"server-run-id","instance_id":"api-host","basis":"server_run",\n'
            ' "total":120,"successful":115,"failed":5,\n'
            ' "started_at":"2026-10-18T00:00:00Z","sampled_at":"2026-10-18T00:05:00Z"}\n'
            "```\n\n"
            "🚦 **Errors:**\n"
            "- Unknown or repeated query parameters return 400 `MONITOR_INVALID_QUERY`.\n"
            "- Missing/disabled identity returns 401; insufficient permission returns 403.\n"
            "- Missing current-run metrics, invalid counters or unavailable Redis return 503 `MONITOR_UNAVAILABLE`.\n"
            "- Unavailable metrics are not returned as healthy zero counts."
        ),
        response_model=RespMonitorRequestTotals,
        dependencies=[*_PERMISSION, Depends(parser_monitor_request_totals)],
        responses=_RESPONSES,
    )
    async def get_request_totals(self, request: Request):
        """
        Read the current supervisor run's shared request counters from SYS Redis.

        :param request: Application state owns the Worker monitor and its borrowed metrics storage.
        :return: Server-run identity, successful/failed/total counts and UTC observation timestamps.
        :raises HTTPException: Identity, permission, query or Redis metrics are unavailable/invalid.

                                                                                               ♂ ZhengLee 2026.10.18
        """
        worker = getattr(request.app.state, "monitor", None)
        return await MonitorModule.request_totals(getattr(worker, "request_metrics", None))


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Monitor - HTTP Liveness
@cbv(router)
class MonitorHealth:
    """
    Serve the minimal public HTTP response used by the configured availability probe.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    @router.get(
        RouteMonitor.HEALTH,
        summary="Probe Monitor HTTP Liveness",
        description=(
            "Check whether the API can serve a minimal HTTP response.\n\n"
            "🌐 **Access and Purpose:**\n"
            "- This endpoint is public and requires no authenticated account or monitoring permission.\n"
            "- It requires no request body or query parameters.\n"
            "- A successfully served request returns HTTP 200 with the fixed payload shown below.\n\n"
            "🗂️ **How It Works:**\n"
            "- Provides HTTP liveness only; the handler does not query SQL, ping Redis, or inspect Worker health.\n"
            "- The scheduler probes this endpoint by default and independently checks Redis and SQL.\n"
            "- HTTP timeout, an unsuccessful response, or an invalid probe payload can make a scheduled observation fail.\n"
            "- Merely calling this endpoint does not persist a health observation; the scheduler owns collection.\n"
            "- This path is excluded from monitored HTTP history and does not refresh the online-visitor heartbeat.\n\n"
            "⚡ **Caching:**\n"
            "- No server-side aggregate response cache is used; the handler runs for each request.\n"
            "- Responses use the monitoring route's private, no-store policy.\n\n"
            "🔎 **Request Example:**\n"
            "`GET /monitor/health`\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            '{"status": "ok"}\n'
            "```\n\n"
            "📝 **Notes:**\n"
            "- `status=ok` confirms HTTP liveness, not complete dependency readiness or a healthy Worker fleet.\n"
            "- Use `GET /monitor/availability` for saved probe results and its latest service-status snapshot.\n"
            "- Use the `/monitor` Socket.IO `workers` topic for current Worker observations.\n"
            "- The payload contains no versions, host details, account identity, or deployment credentials."
        ),
        response_model=RespMonitorHealth,
    )
    async def get_health(self):
        """
        Return the public minimal HTTP liveness payload without performing dependency probes.

        :return: The fixed status object used by the scheduler's HTTP probe.

                                                                                               ♂ ZhengLee 2026.10.18
        """
        return await MonitorModule.health()
