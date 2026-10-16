"""Share transaction-local guards across management resources without owning commits."""

from fastapi import HTTPException
from sqlalchemy import func, select, update
from APPs.Management.constants import (
    MANAGEMENT_WRITE_LOCK_KEY,
    SITE_PUBLICATION_LOCK_KEY,
    ROLE_PERMISSION_COLUMNS,
    EnumManagementError,
)
from SYSTEM.constants import EnumDBType
from SYSTEM.models import AuthRole, AuthUser, PortfolioSite


class ManagementWriteState:
    """Serialize invariant changes, recheck current authority, and preserve the last role manager.

    Lock order: management advisory/writer lock, publication advisory lock, actor rows,
    then target rows. Registration's existing shared role locks remain compatible.
    This helper never commits, opens another session, or changes an API's permission gate.

                                                                                               ♂ ZhengLee 2026.10.16
    """

    def __init__(self, transaction):
        self.transaction = transaction

    async def begin(self, actor_id, permission):
        """Acquire shared write ordering before resolving the server-issued actor again."""
        dialect = self.transaction.session.get_bind().dialect.name
        if dialect == EnumDBType.POSTGRESQL:
            for key in (MANAGEMENT_WRITE_LOCK_KEY, SITE_PUBLICATION_LOCK_KEY):
                await self.transaction.execute_orm(select(func.pg_advisory_xact_lock(key)))
        elif dialect == EnumDBType.SQLLite:
            await self.transaction.execute_orm(
                update(AuthRole)
                .where(AuthRole.id == -1)
                .values({AuthRole.is_active: AuthRole.is_active, AuthRole.updatetime: AuthRole.updatetime})
            )
        if actor_id is not None:
            actor = (
                await self.transaction.execute_orm(
                    select(AuthUser.id, permission, AuthRole)
                    .join(AuthRole, AuthRole.id == AuthUser.role_id)
                    .where(AuthUser.id == actor_id, AuthUser.is_active.is_(True), AuthRole.is_active.is_(True))
                    .with_for_update(read=True, of=(AuthUser, AuthRole))
                )
            ).one_or_none()
            if actor is None:
                raise HTTPException(status_code=401, detail=EnumManagementError.AUTH_REQUIRED)
            if actor[1] is not True:
                raise HTTPException(status_code=403, detail=EnumManagementError.PERMISSION_DENIED)
            self.actor_role = actor[2]
        self.managers_before = await self.manager_count()

    @staticmethod
    def role_assignment_conditions(actor_role):
        """Build an explicit ORM permission ceiling; role labels and client flags never authorize grants.

        Attribute keys come from declared ORM objects, so renaming a model field has one binding.
                                                                                               ♂ ZhengLee 2026.10.16
        """
        return [column.is_(False) for column in ROLE_PERMISSION_COLUMNS if not getattr(actor_role, column.key)]

    async def manager_count(self):
        """Count enabled accounts with enabled role-management authority, independent of role names."""
        return (
            await self.transaction.execute_orm(
                select(func.count())
                .select_from(AuthUser)
                .join(AuthRole, AuthRole.id == AuthUser.role_id)
                .where(AuthUser.is_active.is_(True), AuthRole.is_active.is_(True), AuthRole.is_manage_roles.is_(True))
            )
        ).scalar_one()

    async def preserve_manager(self):
        """Reject losing the final eligible manager; allow repair of pre-existing empty setups."""
        if self.managers_before and not await self.manager_count():
            raise HTTPException(status_code=409, detail=EnumManagementError.LAST_ROLE_MANAGER_REQUIRED)

    async def activate(self, owner, active):
        """Update account activation consistently for User and Platform, preserving identity and no-op time."""
        if active != owner.is_active:
            await self.transaction.execute_orm(
                update(AuthUser).where(AuthUser.id == owner.id).values({AuthUser.is_active: active})
            )
        if not active:
            await self.transaction.execute_orm(
                update(PortfolioSite)
                .where(PortfolioSite.user_id == owner.id, PortfolioSite.is_default.is_(True))
                .values({PortfolioSite.is_default: False})
            )

    @staticmethod
    def compare(row, expected, bindings):
        """Compare declared original values under lock; target identity alone is not a version check."""
        if expected is None:
            return
        for field, value in expected.items():
            if field not in bindings:
                raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_MANAGEMENT_PATCH)
            actual = row[field]
            if type(actual) is not type(value) or actual != value:
                raise HTTPException(status_code=409, detail=EnumManagementError.MANAGEMENT_EDIT_CONFLICT)
