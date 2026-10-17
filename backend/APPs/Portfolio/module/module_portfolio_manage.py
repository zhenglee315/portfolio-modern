# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Auth.module import AuthSessionModule

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.redis import RedisAsync
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import (
    AUTH_PERMISSION_FIELDS,
    EnumCache,
    EnumCacheNamespace,
    EnumCacheError,
    EnumSess,
)
from SYSTEM.models import AuthUser, PortfolioSite

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import select, update, or_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException, Request
from fastapi_cache import FastAPICache

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.exceptions import RedisError


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Management Scope
class PortfolioManagementModule(SqlAlchemyExecAsync):
    """
    Provide authorization and atomic publication operations for future management views.

    No management route is exposed in this architecture phase.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    async def account(self, request: Request, permission: EnumSess) -> dict:
        """
        Read the current enabled account and verify one recognized permission.

        :param request: Current request carrying the server-side authentication session.
        :param permission: EnumSess CRUD or management field, validated before lookup.
        :return: Current database-backed identity and permissions.
        :raises HTTPException: Authentication is absent, permission is denied, or storage fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        if permission not in AUTH_PERMISSION_FIELDS:
            raise ValueError("Unknown permission.")
        account = await AuthSessionModule(request).current_session()
        if account is None:
            raise HTTPException(status_code=401, detail="AUTHENTICATION_REQUIRED")
        if account[permission] is not True:
            raise HTTPException(status_code=403, detail="PERMISSION_DENIED")
        return account

    @staticmethod
    async def invalidate_cache() -> None:
        """
        Remove public portfolio responses after committed publication/default changes.

        :return: None after incrementally removing the dedicated response cache namespace.
        :raises HTTPException: Cache storage is unavailable; the publication state remains committed.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        try:
            prefix = FastAPICache.get_prefix()
            await RedisAsync(key=EnumCache.WEB).delete_pattern(f"{prefix}:{EnumCacheNamespace.PORTFOLIO}:*")
        except (RedisError, KeyError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail=EnumCacheError.PORTFOLIO_CACHE_UNAVAILABLE) from None

    async def owned_site(self, request: Request, site_id: int, permission: EnumSess) -> dict:
        """
        Authorize a portfolio operation against ownership or explicit site management permission.

        :param request: Current authentication request.
        :param site_id: Target portfolio primary key.
        :param permission: Required operation permission.
        :return: Current account identity, authorized for this portfolio.
        :raises HTTPException: The portfolio is missing or belongs to another account.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        account = await self.account(request, permission)
        try:
            owner = (
                await self.execute_orm(select(PortfolioSite.user_id).where(PortfolioSite.id == site_id))
            ).scalar_one_or_none()
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail="PORTFOLIO_DATABASE_UNAVAILABLE") from None
        if owner is None:
            raise HTTPException(status_code=404, detail="NOT_FOUND")
        if owner != account[EnumSess.ID] and account[EnumSess.IS_MANAGE_SITES] is not True:
            raise HTTPException(status_code=403, detail="PERMISSION_DENIED")
        return account

    async def set_published(self, request: Request, site_id: int, is_published: bool) -> None:
        """
        Commit one authorized publication change without unpublishing the default portfolio.

        :param request: Current authentication request.
        :param site_id: Target portfolio primary key.
        :param is_published: New public visibility state.
        :return: None after commit and public cache invalidation.
        :raises HTTPException: Permission is denied, the default must be replaced, or storage fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        if type(is_published) is not bool:
            raise ValueError("Publication state must be a boolean.")
        await self.owned_site(request, site_id, EnumSess.IS_UPDATE)
        try:
            async with self.transaction() as transaction:
                row = (
                    await transaction.execute_orm(
                        select(PortfolioSite.is_default).where(PortfolioSite.id == site_id).with_for_update()
                    )
                ).one_or_none()
                if row is None:
                    raise HTTPException(status_code=404, detail="NOT_FOUND")
                if row.is_default and not is_published:
                    raise HTTPException(status_code=409, detail="DEFAULT_SITE_MUST_BE_PUBLISHED")
                await transaction.execute_orm(
                    update(PortfolioSite).where(PortfolioSite.id == site_id).values(is_published=is_published)
                )
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail="PORTFOLIO_DATABASE_UNAVAILABLE") from None
        await self.invalidate_cache()

    async def set_default(self, request: Request, site_id: int) -> None:
        """
        Atomically replace the global homepage with an enabled owner's published portfolio.

        :param request: Current authentication request with site management permission.
        :param site_id: Published portfolio selected as the new default.
        :return: None after the old/default state commits together and caches are invalidated.
        :raises HTTPException: Target is hidden, concurrent selection conflicts, or storage fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        await self.account(request, EnumSess.IS_MANAGE_SITES)
        try:
            async with self.transaction() as transaction:
                sites = (
                    (
                        await transaction.execute_orm(
                            select(
                                PortfolioSite.id,
                                PortfolioSite.is_published,
                                AuthUser.is_active,
                            )
                            .join(AuthUser, AuthUser.id == PortfolioSite.user_id)
                            .where(
                                or_(
                                    PortfolioSite.id == site_id,
                                    PortfolioSite.is_default.is_(True),
                                )
                            )
                            .order_by(PortfolioSite.id)
                            .with_for_update()
                        )
                    )
                    .mappings()
                    .all()
                )
                target = next((row for row in sites if row["id"] == site_id), None)
                if target is None or not target["is_published"] or not target["is_active"]:
                    raise HTTPException(status_code=404, detail="NOT_FOUND")
                await transaction.execute_orm(
                    update(PortfolioSite)
                    .where(PortfolioSite.is_default.is_(True), PortfolioSite.id != site_id)
                    .values(is_default=False)
                )
                await transaction.execute_orm(
                    update(PortfolioSite).where(PortfolioSite.id == site_id).values(is_default=True)
                )
        except IntegrityError:
            raise HTTPException(status_code=409, detail="DEFAULT_SITE_CONFLICT") from None
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail="PORTFOLIO_DATABASE_UNAVAILABLE") from None
        await self.invalidate_cache()


__all__ = ("PortfolioManagementModule",)
