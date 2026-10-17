# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import (
    USER_PATCH_COLUMNS,
    USER_FIELD_COLUMNS,
    EnumManagementField,
    EnumManagementError,
)
from APPs.Management.schema.body import (
    BodyManagementUserPatchRequest,
    BodyManagementUserBulkDelete,
)
from .module_state import ManagementWriteState
from APPs.Auth.schema.body import validate_auth_email
from APPs.Management.schema.resp import (
    RespManagementUser,
    RespManagementUserDeletion,
)
from .module_base import ManagementListModule

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.models import (
    AuthRole,
    AuthUser,
    PortfolioSite,
    RecordLogin,
)

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import and_, func, select, update, delete
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import ValidationError


class ManagementUsersModule(ManagementListModule):
    """
    Read account identity, role and sign-in statistics while keeping one person per row.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    def _query(self):
        """
        Select account identity, assigned role, optional website and successful-login statistics.

        :return: Unfiltered account statement and its declared column expressions.
        :raises HTTPException: Storage is unavailable; database internals are not returned.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        logins = (
            select(
                RecordLogin.user_id,
                func.count(RecordLogin.id).label(EnumManagementField.LOGIN_COUNT),
                func.max(RecordLogin.logintime).label(EnumManagementField.LAST_LOGIN),
            )
            .group_by(RecordLogin.user_id)
            .subquery()
        )
        columns = {
            **USER_FIELD_COLUMNS,
            EnumManagementField.HAS_SITE: PortfolioSite.id.is_not(None),
            EnumManagementField.LOGIN_COUNT: func.coalesce(logins.c[EnumManagementField.LOGIN_COUNT], 0),
            EnumManagementField.LAST_LOGIN: logins.c[EnumManagementField.LAST_LOGIN],
        }
        stmt = (
            select(*(expression.label(field) for field, expression in columns.items()))
            .select_from(AuthUser)
            .join(AuthRole, AuthRole.id == AuthUser.role_id)
            .outerjoin(PortfolioSite, PortfolioSite.user_id == AuthUser.id)
            .outerjoin(logins, logins.c[RecordLogin.user_id.key] == AuthUser.id)
        )
        return stmt, columns

    async def select(self) -> dict:
        """Read the same account projection returned by a successful update."""
        stmt, columns = self._query()
        return await self.page(self.apply_sort(self.apply_filters(stmt, columns), columns))

    async def role_options(self, actor_id: int) -> dict:
        """Page searchable role choices under User permission without opening the Role-management list.

        Inactive and excessive-grant roles remain visible but cannot be newly assigned.
                                                                                               ♂ ZhengLee 2026.10.16
        """
        try:
            async with self.transaction() as transaction:
                actor_role = (
                    await transaction.execute_orm(
                        select(AuthRole)
                        .join(AuthUser, AuthUser.role_id == AuthRole.id)
                        .where(
                            AuthUser.id == actor_id,
                            AuthUser.is_active.is_(True),
                            AuthRole.is_active.is_(True),
                            AuthRole.is_manage_users.is_(True),
                        )
                    )
                ).scalar_one_or_none()
                if actor_role is None:
                    raise HTTPException(status_code=403, detail=EnumManagementError.PERMISSION_DENIED)
                assignable = and_(
                    AuthRole.is_active.is_(True), *ManagementWriteState.role_assignment_conditions(actor_role)
                )
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(
                status_code=503,
                detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE,
            ) from None
        columns = {EnumManagementField.ROLE: AuthRole.role}
        stmt = select(
            AuthRole.id,
            AuthRole.role,
            AuthRole.is_active,
            assignable.label(EnumManagementField.CAN_ASSIGN),
        ).order_by(func.lower(AuthRole.role), AuthRole.id)
        return await self.page(self.apply_filters(stmt, columns))

    async def update(
        self, account_id: int, changes: dict, *, expected_email: str, expected: dict, actor_id: int
    ) -> dict:
        """Assign an eligible role and apply activation in one transaction.

        Platform shares account-state decisions; role assignment rechecks the actor's
        permission ceiling, target availability, original value and final manager.

        ♂ ZhengLee 2026.10.16
        """
        try:
            body = BodyManagementUserPatchRequest.model_validate(
                dict(expected_email=expected_email, expected=expected, changes=changes)
            ).changes
            expected_email = validate_auth_email(expected_email)
        except (ValidationError, ValueError, TypeError):
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_MANAGEMENT_PATCH) from None
        if type(account_id) is not int or not 1 <= account_id <= 2147483647 or set(expected) != body.model_fields_set:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_MANAGEMENT_PATCH)
        try:
            async with self.transaction() as transaction:
                state = ManagementWriteState(transaction)
                await state.begin(actor_id, AuthRole.is_manage_users)
                owner = (
                    await transaction.execute_orm(
                        select(AuthUser)
                        .where(AuthUser.id == account_id, AuthUser.email == expected_email)
                        .with_for_update()
                    )
                ).scalar_one_or_none()
                if owner is None:
                    raise HTTPException(status_code=404, detail=EnumManagementError.ACCOUNT_NOT_FOUND)
                stmt, _ = self._query()
                before = (await transaction.execute_orm(stmt.where(AuthUser.id == account_id))).mappings().one()
                state.compare(before, expected, USER_PATCH_COLUMNS)
                assignments = body.orm_changes()
                if AuthUser.role_id in assignments and assignments[AuthUser.role_id] != owner.role_id:
                    target_id = assignments[AuthUser.role_id]
                    target_role = (
                        await transaction.execute_orm(
                            select(AuthRole).where(AuthRole.id == target_id).with_for_update(read=True)
                        )
                    ).scalar_one_or_none()
                    if target_role is None:
                        raise HTTPException(status_code=404, detail=EnumManagementError.ROLE_NOT_FOUND)
                    if not target_role.is_active:
                        raise HTTPException(
                            status_code=409,
                            detail=EnumManagementError.ROLE_ASSIGNMENT_INACTIVE,
                        )
                    permitted = (
                        await transaction.execute_orm(
                            select(AuthRole.id).where(
                                AuthRole.id == target_id, *state.role_assignment_conditions(state.actor_role)
                            )
                        )
                    ).scalar_one_or_none()
                    if permitted is None:
                        raise HTTPException(
                            status_code=403,
                            detail=EnumManagementError.ROLE_ASSIGNMENT_FORBIDDEN,
                        )
                    await transaction.execute_orm(
                        update(AuthUser).where(AuthUser.id == owner.id).values({AuthUser.role_id: target_id})
                    )
                if AuthUser.is_active in assignments:
                    await state.activate(owner, assignments[AuthUser.is_active])
                await state.preserve_manager()
                result = RespManagementUser.model_validate(
                    (await transaction.execute_orm(stmt.where(AuthUser.id == account_id))).mappings().one()
                ).model_dump()
        except IntegrityError:
            raise HTTPException(status_code=409, detail=EnumManagementError.MANAGEMENT_UPDATE_CONFLICT) from None
        except (SQLAlchemyError, ValidationError, RuntimeError, OSError):
            raise HTTPException(
                status_code=503,
                detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE,
            ) from None
        await ManagementWriteState.invalidate_public_cache()
        return result

    async def delete(self, targets, *, actor_id: int) -> dict:
        """Delete accounts, owned websites and login history atomically, preserving shared roles/locales.

        The original optional website ID is an explicit confirmation boundary. A website created,
        replaced or removed after the dialog opened requires a fresh confirmation. Default and the
        final effective role manager are protected before any owned rows are deleted.

        :param targets: Account ID/email and original optional website ID confirmations.
        :param actor_id: Current server-issued identity; User-management permission owns this operation.
        :return: Confirmed account/site IDs after commit, with no email or credential data.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        if not isinstance(targets, (list, tuple)):
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_USER_DELETE)
        try:
            batch = BodyManagementUserBulkDelete.model_validate({"targets": list(targets)})
        except ValidationError:
            raise HTTPException(status_code=422, detail=EnumManagementError.INVALID_USER_DELETE) from None
        if type(actor_id) is not int or not 1 <= actor_id <= 2147483647:
            raise HTTPException(status_code=401, detail=EnumManagementError.AUTH_REQUIRED)
        ids = sorted(target.account_id for target in batch.targets)
        try:
            async with self.transaction() as transaction:
                state = ManagementWriteState(transaction)
                await state.begin(actor_id, AuthRole.is_manage_users)
                owners = (
                    await transaction.execute_orm(
                        select(AuthUser.id, AuthUser.email)
                        .where(AuthUser.id.in_(ids))
                        .order_by(AuthUser.id)
                        .with_for_update()
                    )
                ).all()
                by_id = {owner.id: owner.email for owner in owners}
                sites = (
                    await transaction.execute_orm(
                        select(
                            PortfolioSite.id,
                            PortfolioSite.user_id,
                            PortfolioSite.is_default,
                        )
                        .where(PortfolioSite.user_id.in_(ids))
                        .order_by(PortfolioSite.id)
                        .with_for_update()
                    )
                ).all()
                by_owner = {site.user_id: site for site in sites}
                for target in batch.targets:
                    if by_id.get(target.account_id) != target.expected_email:
                        raise HTTPException(
                            status_code=404,
                            detail=EnumManagementError.ACCOUNT_NOT_FOUND,
                        )
                    site = by_owner.get(target.account_id)
                    if (site.id if site else None) != target.expected_site_id:
                        raise HTTPException(
                            status_code=409,
                            detail=EnumManagementError.USER_DELETE_CONFLICT,
                        )
                    if site and site.is_default:
                        raise HTTPException(
                            status_code=409,
                            detail=EnumManagementError.DEFAULT_SITE_DELETE_FORBIDDEN,
                        )
                await state.preserve_manager(ids)
                # Child roots cascade through existing FKs; account FKs stay RESTRICT.
                await transaction.execute_orm(delete(RecordLogin).where(RecordLogin.user_id.in_(ids)))
                await transaction.execute_orm(delete(PortfolioSite).where(PortfolioSite.user_id.in_(ids)))
                await transaction.execute_orm(delete(AuthUser).where(AuthUser.id.in_(ids)))
                result = RespManagementUserDeletion(
                    deleted_count=len(ids),
                    deleted=[
                        {
                            "account_id": account_id,
                            "site_id": (by_owner[account_id].id if account_id in by_owner else None),
                        }
                        for account_id in ids
                    ],
                ).model_dump()
        except IntegrityError:
            raise HTTPException(status_code=409, detail=EnumManagementError.USER_DELETE_CONFLICT) from None
        except (SQLAlchemyError, ValidationError, RuntimeError, OSError):
            raise HTTPException(
                status_code=503,
                detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE,
            ) from None
        await ManagementWriteState.invalidate_public_cache(
            EnumManagementError.MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE
        )
        return result
