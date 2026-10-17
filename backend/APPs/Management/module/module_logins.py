# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import (
    LOGIN_FIELD_COLUMNS,
    EnumManagementField,
)
from .module_base import ManagementListModule

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.redis import RedisAsync

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import EnumCache
from SYSTEM.models import (
    AuthUser,
    RecordLogin,
)

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import select

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.exceptions import RedisError


class ManagementLoginRecordsModule(ManagementListModule):
    """
    Read immutable successful-login events through the shared private DataTable query engine.

    Account state does not hide historical events. Geographic values come only
    from the stored snapshot; reading a history page never performs GeoIP lookups.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    def __init__(self, *, user_id: int | None = None, **controls) -> None:
        """
        Retain an optional target account and the validated shared page controls.

        :param user_id: Target account ID, or None to read all authorized login records.
        :param controls: Shared pagination, filter, sort and search constructor values.
        :return: None; select() owns the read workflow.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        super().__init__(**controls)
        self.user_id = user_id

    async def select(self) -> dict:
        """
        Filter, count and page one row per event, including old records without IP data.

        :return: Shared records envelope containing audit snapshots and nullable live IP presence.
        :raises HTTPException: Unavailable storage returns the shared sanitized 503 response.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        columns = dict(LOGIN_FIELD_COLUMNS)
        stmt = select(*(expression.label(field) for field, expression in columns.items())).join(
            AuthUser, AuthUser.id == RecordLogin.user_id
        )
        if self.user_id is not None:
            stmt = stmt.where(RecordLogin.user_id == self.user_id)
        result = await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))
        # Read only this page's IP keys, using the same TTL as system heartbeat.
        # Redis failure is unknown rather than a false report of offline activity.
        #                                                                                       ♂ ZhengLee 2026.10.16
        identifiers = tuple(
            dict.fromkeys(
                row[EnumManagementField.IP_ADDRESS] for row in result["items"] if row[EnumManagementField.IP_ADDRESS]
            )
        )
        try:
            online = await RedisAsync(key=EnumCache.SYS).heartbeat_status(identifiers) if identifiers else {}
        except (RedisError, KeyError, AssertionError):
            online = None
        for row in result["items"]:
            row[EnumManagementField.IS_ONLINE] = (
                None if online is None else online.get(row[EnumManagementField.IP_ADDRESS], False)
            )
        return result
