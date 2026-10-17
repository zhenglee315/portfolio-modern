# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import (
    EnumManagementError,
    EnumSortDirection,
)

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from COMMON.schema.resp import RespRecords
from COMMON.tools.storage.sqlalchemy.tools_column_filters import apply_column_filters
from COMMON.tools.storage.sqlalchemy.tools_table_search import apply_table_search

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import Select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException

HAN_NAME_PATTERN = "^[⺀-⺙⺛-⻳⼀-⿕々〇〡-〩〸-〻㐀-䶿一-\u9fff豈-舘並-龎𖿢-𖿣𖿰-\U00016ff6𠀀-\U0002a6df𪜀-𫠝𫠠-\U0002cead𬺰-𮯠\U0002ebf0-\U0002ee5d丽-𪘀𰀀-𱍊\U00031350-\U00033479]+$"


class ManagementListModule(SqlAlchemyExecAsync):
    """
    Share typed predicates, sorting and numbered pagination across management resources.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    def __init__(
        self,
        page: int = 1,
        size: int = 6,
        filters: tuple[dict, ...] = (),
        sort: tuple[tuple[str, str], ...] = (),
        search: dict | None = None,
        *,
        session: AsyncSession | None = None,
    ) -> None:
        """Own validated page controls; resource projections supply allowed column expressions."""
        super().__init__(session=session)
        self.page_number, self.page_size = page, size
        self.filters, self.sort = filters, sort
        self.search = search

    def apply_filters(self, stmt: Select, columns: dict) -> Select:
        """Apply the same predicate engine to stored, joined and aggregate columns."""
        return apply_table_search(apply_column_filters(stmt, columns, self.filters), columns, self.search)

    def apply_sort(self, stmt: Select, columns: dict) -> Select:
        """
        Order a management projection by validated fields with missing values last.

        :param stmt: Resource projection after column predicates are applied.
        :param columns: Mapping from parser-approved field names to SQL projection expressions.
        :return: Statement ordered by each requested criterion and its stable ID tie-breaker.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        for field, direction in self.sort:
            expression = columns[field]
            stmt = stmt.order_by(
                (expression.asc() if direction == EnumSortDirection.ASC else expression.desc()).nulls_last()
            )
        return stmt

    async def page(self, stmt: Select) -> dict:
        """
        Count filtered records and read one numbered page through the shared ORM executor.

        :param stmt: Filtered and ordered resource projection with one record per management row.
        :return: Shared items/total/pages/page/size envelope for the requested page.
        :raises HTTPException: Storage is unavailable; database internals are not returned.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        try:
            result = await self.paginate_orm(stmt, page=self.page_number, size=self.page_size, unique=False)
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(
                status_code=503,
                detail=EnumManagementError.MANAGEMENT_DATABASE_UNAVAILABLE,
            ) from None
        return RespRecords.from_records(
            result.items, total=result.total, page=result.page, size=result.size
        ).model_dump()
