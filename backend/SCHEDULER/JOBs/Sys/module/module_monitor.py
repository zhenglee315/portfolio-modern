"""Monitor dependency checks and durable request-queue ingestion."""

from datetime import datetime, timezone
from ipaddress import ip_address
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from COMMON.tools.storage.redis import RedisAsync
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from SYSTEM.constants import LoginGeoStatus
from SYSTEM.models.models_record import RecordRequest
from SYSTEM.settings import (
    EnumCache,
    MONITOR_REQUEST_BATCH,
    MONITOR_REQUEST_GROUP,
    MONITOR_REQUEST_MAX_BATCHES,
    MONITOR_REQUEST_QUEUE,
)


class RequestEvent(BaseModel):
    """Validate the versioned queue contract before a batch can reach SQL."""

    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)
    schema_version: Literal[1] = Field(alias="schema")
    request_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    run_id: str = Field(min_length=1, max_length=128)
    instance_id: str = Field(min_length=1, max_length=255)
    process_uid: str = Field(min_length=1, max_length=128)
    pid: int = Field(gt=0, strict=True)
    method: str = Field(min_length=1, max_length=16)
    path: str = Field(max_length=2048)
    ip_address: str | None = Field(default=None, max_length=45)
    country_code: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    region: str | None = Field(default=None, max_length=128)
    city: str | None = Field(default=None, max_length=128)
    geo_status: LoginGeoStatus
    entered_at: datetime
    response_started_at: datetime | None = None
    left_at: datetime
    duration_ms: float = Field(ge=0)
    http_status: int | None = Field(default=None, ge=100, le=599, strict=True)
    status: Literal["completed", "error", "cancelled", "disconnected"]
    failed: bool = Field(strict=True)

    @field_validator("entered_at", "response_started_at", "left_at", mode="before")
    @classmethod
    def utc_time(cls, value):
        if value is None:
            return None
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            try:
                return datetime.fromtimestamp(value, timezone.utc)
            except (ValueError, OverflowError, OSError) as exc:
                raise ValueError("Invalid request timestamp") from exc
        raise ValueError("Queue timestamps must be Unix seconds")

    @field_validator("ip_address")
    @classmethod
    def normalized_ip(cls, value):
        return str(ip_address(value)) if value is not None else None

    def record_values(self):
        return self.model_dump(exclude={"schema_version"})


class MonitorRequestModule:
    """Commit SQL before ACK; recover pending messages and tolerate redelivery."""

    def __init__(
        self,
        *,
        cache=None,
        db=None,
        stream=MONITOR_REQUEST_QUEUE,
        group=MONITOR_REQUEST_GROUP,
        batch_size=MONITOR_REQUEST_BATCH,
        max_batches=MONITOR_REQUEST_MAX_BATCHES,
        consumer="request-writer",
    ):
        if not 1 <= batch_size <= 1000 or max_batches < 1:
            raise ValueError("Invalid request ingestion batch limits")
        self.cache = cache if cache is not None else RedisAsync(key=EnumCache.SYS)
        self.db = db if db is not None else SqlAlchemyExecAsync()
        self.stream, self.group, self.consumer = stream, group, consumer
        self.batch_size, self.max_batches = batch_size, max_batches

    async def flush(self):
        await self.cache.stream_group_create(self.stream, self.group)
        totals = {"processed": 0, "inserted": 0, "duplicates": 0, "rejected": 0}
        for _ in range(self.max_batches):
            entries = await self.cache.stream_claim(self.stream, self.group, self.consumer, count=self.batch_size)
            if len(entries) < self.batch_size:
                entries += await self.cache.stream_read(
                    self.stream,
                    self.group,
                    self.consumer,
                    count=self.batch_size - len(entries),
                )
            if not entries:
                break
            rows, entry_ids = [], []
            for entry_id, fields in entries:
                raw = fields.get(b"payload", fields.get("payload", b""))
                try:
                    row = RequestEvent.model_validate_json(raw).record_values()
                except (ValidationError, ValueError, TypeError):
                    totals["rejected"] += await self.cache.stream_reject(
                        self.stream,
                        self.group,
                        entry_id,
                        f"{self.stream}:dead",
                        raw,
                        "Invalid request event schema or values",
                    )
                    continue
                rows.append(row)
                entry_ids.append(entry_id)
            if not rows:
                continue
            async with self.db.transaction() as transaction:
                dialect = transaction.session.get_bind().dialect.name
                if dialect == "postgresql":
                    insert = postgres_insert
                elif dialect == "sqlite":
                    insert = sqlite_insert
                else:
                    raise ValueError(f"Unsupported request-history database: {dialect}")
                stmt = (
                    insert(RecordRequest)
                    .values(rows)
                    .on_conflict_do_nothing(index_elements=["request_id"])
                    .returning(RecordRequest.request_id)
                )
                result = await transaction.execute_orm(stmt)
                inserted = len(result.scalars().all())
            # A failed/ambiguous ACK leaves pending entries recoverable. Repeating
            # INSERT after a successful commit is safe because request_id is unique.
            await self.cache.stream_ack_delete(self.stream, self.group, entry_ids)
            totals["processed"] += len(entry_ids)
            totals["inserted"] += inserted
            totals["duplicates"] += len(rows) - inserted
        return totals


async def check_monitor_dependencies():
    await RedisAsync(key=EnumCache.SYS).ping()
    if await SqlAlchemyExecAsync().query_scalar("SELECT 1") != 1:
        raise RuntimeError("Database health check returned an unexpected result")
    return {"redis": "ok", "database": "ok"}
