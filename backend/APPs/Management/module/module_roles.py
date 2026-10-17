# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import (
    ROLE_FIELD_COLUMNS,
    ROLE_PATCH_COLUMNS,
    EnumManagementField,
    EnumManagementError,
)
from APPs.Management.schema.body import (
    BodyManagementRolePatchRequest,
    BodyManagementRoleBulkDelete,
)
from .module_state import ManagementWriteState
from APPs.Management.schema.resp import (
    RespManagementRole,
    RespManagementRoleDeletion,
)
from .module_base import ManagementListModule

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.models import (
    AuthRole,
    AuthUser,
)

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import func, select, update, delete
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import ValidationError


class ManagementRolesModule(ManagementListModule):
    """
    Read role permissions and assigned account counts while keeping one role per row.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    def _query(self):
        """
        Build the role projection shared by list reads and transactional update responses.

        :return: Unfiltered role statement and its declared column expressions.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        assigned = (
            select(
                AuthUser.role_id,
                func.count(AuthUser.id).label(EnumManagementField.USER_COUNT),
            )
            .group_by(AuthUser.role_id)
            .subquery()
        )
        columns = dict(ROLE_FIELD_COLUMNS)
        columns[EnumManagementField.USER_COUNT] = func.coalesce(assigned.c[EnumManagementField.USER_COUNT], 0)
        stmt = select(*(expression.label(field) for field, expression in columns.items())).outerjoin(
            assigned, assigned.c[AuthUser.role_id.key] == AuthRole.id
        )
        return stmt, columns

    async def select(self) -> dict:
        """Read the shared projection through validated list controls."""
        stmt, columns = self._query()
        return await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))

    async def update(self, role_id: int, changes: dict, *, expected_role: str, expected: dict, actor_id: int) -> dict:
        """Patch role settings atomically, retaining a usable registration default and manager.

        Identity, original values and authority are checked after lock acquisition.
        Renaming changes the role row only; assigned account FKs remain untouched.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        try:
            body = BodyManagementRolePatchRequest.model_validate(
                dict(expected_role=expected_role, expected=expected, changes=changes)
            ).changes
        except ValidationError:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_MANAGEMENT_PATCH) from None
        assignments = body.orm_changes()
        if type(role_id) is not int or not 1 <= role_id <= 2147483647 or set(expected) != body.model_fields_set:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_MANAGEMENT_PATCH)
        try:
            async with self.transaction() as transaction:
                state = ManagementWriteState(transaction)
                await state.begin(actor_id, AuthRole.is_manage_roles)
                role = (
                    await transaction.execute_orm(
                        select(AuthRole).where(AuthRole.id == role_id, AuthRole.role == expected_role).with_for_update()
                    )
                ).scalar_one_or_none()
                if role is None:
                    raise HTTPException(status_code=404, detail=EnumManagementError.ROLE_NOT_FOUND)
                stmt, _ = self._query()
                before = (await transaction.execute_orm(stmt.where(AuthRole.id == role_id))).mappings().one()
                state.compare(before, expected, ROLE_PATCH_COLUMNS)
                final = {field: changes.get(field, before[field]) for field in ROLE_PATCH_COLUMNS}
                eligible = final[EnumManagementField.IS_ACTIVE] and not any(
                    final[field]
                    for field in (
                        EnumManagementField.IS_MANAGE_ROLES,
                        EnumManagementField.IS_MANAGE_USERS,
                        EnumManagementField.IS_MANAGE_SITES,
                    )
                )
                if final[EnumManagementField.IS_DEFAULT] and not eligible:
                    raise HTTPException(
                        status_code=409,
                        detail=EnumManagementError.DEFAULT_ROLE_REQUIRES_ACTIVE_UNPRIVILEGED,
                    )
                if role.is_default and not final[EnumManagementField.IS_DEFAULT]:
                    raise HTTPException(
                        status_code=409,
                        detail=EnumManagementError.DEFAULT_ROLE_REQUIRED,
                    )
                if changes.get(EnumManagementField.IS_DEFAULT) is True:
                    await transaction.execute_orm(
                        update(AuthRole)
                        .where(AuthRole.is_default.is_(True), AuthRole.id != role_id)
                        .values({AuthRole.is_default: False})
                    )
                changed = {
                    column: assignments[column]
                    for field, column in ROLE_PATCH_COLUMNS.items()
                    if field in changes and before[field] != changes[field]
                }
                if changed:
                    await transaction.execute_orm(update(AuthRole).where(AuthRole.id == role_id).values(changed))
                await state.preserve_manager()
                return RespManagementRole.model_validate(
                    (await transaction.execute_orm(stmt.where(AuthRole.id == role_id))).mappings().one()
                ).model_dump()
        except IntegrityError:
            raise HTTPException(status_code=409, detail=EnumManagementError.MANAGEMENT_UPDATE_CONFLICT) from None
        except (SQLAlchemyError, ValidationError, RuntimeError, OSError):
            raise HTTPException(
                status_code=503,
                detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE,
            ) from None

    async def delete(self, targets, *, actor_id: int) -> dict:
        """Delete only unused, non-default roles; every account, including inactive owners, counts.

        Single and bulk HTTP entries share this transaction and the existing management lock.
        FK RESTRICT remains the final guard against assignments outside this application's writer order.

        :param targets: Original role IDs and names; never SQL identifiers or mutable assignments.
        :param actor_id: Current server-issued identity, rechecked after locking.
        :return: Deleted role identifiers after one atomic commit.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        if not isinstance(targets, (list, tuple)):
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_ROLE_DELETE)
        try:
            batch = BodyManagementRoleBulkDelete.model_validate({"targets": list(targets)})
        except ValidationError:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_ROLE_DELETE) from None
        if type(actor_id) is not int or not 1 <= actor_id <= 2147483647:
            raise HTTPException(status_code=401, detail=EnumManagementError.AUTH_REQUIRED)
        ids = sorted(target.role_id for target in batch.targets)
        try:
            async with self.transaction() as transaction:
                state = ManagementWriteState(transaction)
                await state.begin(actor_id, AuthRole.is_manage_roles)
                roles = (
                    await transaction.execute_orm(
                        select(AuthRole.id, AuthRole.role, AuthRole.is_default)
                        .where(AuthRole.id.in_(ids))
                        .order_by(AuthRole.id)
                        .with_for_update()
                    )
                ).all()
                by_id = {role.id: role for role in roles}
                for target in batch.targets:
                    role = by_id.get(target.role_id)
                    if role is None or role.role != target.expected_role:
                        raise HTTPException(status_code=404, detail=EnumManagementError.ROLE_NOT_FOUND)
                    if role.is_default:
                        raise HTTPException(
                            status_code=409,
                            detail=EnumManagementError.DEFAULT_ROLE_REQUIRED,
                        )
                assigned = (
                    await transaction.execute_orm(
                        select(AuthUser.id)
                        .where(AuthUser.role_id.in_(ids))
                        .order_by(AuthUser.id)
                        .limit(1)
                        .with_for_update(read=True)
                    )
                ).first()
                if assigned is not None:
                    raise HTTPException(status_code=409, detail=EnumManagementError.ROLE_IN_USE)
                await transaction.execute_orm(delete(AuthRole).where(AuthRole.id.in_(ids)))
                result = RespManagementRoleDeletion(
                    deleted_count=len(ids),
                    deleted=[{"role_id": role_id} for role_id in ids],
                ).model_dump()
        except IntegrityError:
            raise HTTPException(status_code=409, detail=EnumManagementError.ROLE_DELETE_CONFLICT) from None
        except (SQLAlchemyError, ValidationError, RuntimeError, OSError):
            raise HTTPException(
                status_code=503,
                detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE,
            ) from None
        return result
