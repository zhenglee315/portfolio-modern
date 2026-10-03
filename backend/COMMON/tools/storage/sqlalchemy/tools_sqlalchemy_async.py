# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.decorator import sql_validate

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database import CONN_MANAGER
from SYSTEM.constants import EnumDBType

# ◆—< Pack >—————————————————————————————————◆ SqlAlchemy
from .tools_sqlalchemy_utils import sqlalchemy_pagination_stmt, BigParams
from sqlalchemy.exc import SQLAlchemyError, NoSuchTableError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy import text, inspect, Result
from sqlalchemy.sql import Select

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi_pagination.ext.sqlalchemy import apaginate
from fastapi_pagination import Params, create_page
from fastapi_pagination.default import Page

# ◆—< Pack >—————————————————————————————————◆ Common
from typing import Union, Any, Optional, Dict
from pydantic import validate_call
from contextlib import asynccontextmanager


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ SqlAlchemy SQL execution
class SqlAlchemyExecAsync:
    """
    Execute async SQL using a fresh session per key-based operation.

    The existing key= and session= call styles keep automatic commit/rollback/close by
    default. manage_transaction=False requires an external AsyncSession and leaves all
    transaction and close decisions to its owner. Concurrent tasks need separate sessions.
    execute_commit() retains explicit submission and rejects externally managed mode.

                                                                                               ♂ ZhengLee 2026.10.03
    """

    def __init__(self, key: str = None, session: Optional[AsyncSession] = None, *, manage_transaction: bool = True):
        """
        Select a database key or an injected async session without opening a connection.

        :param key: Database identifier used when an external session is not supplied.
        :param session: Optional AsyncSession; it takes priority over key.
        :param manage_transaction: True preserves legacy automatic commit/rollback/close.
                                   False leaves these decisions to the external session owner.
        :return: None; key-based sessions are created separately for each operation.
        :raises TypeError: The selected session/engine is not asynchronous.
        :raises ValueError: Required key/session or ownership options are invalid.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if session is not None and not isinstance(session, AsyncSession):
            raise TypeError("session must be an AsyncSession.")
        if not isinstance(manage_transaction, bool):
            raise TypeError("manage_transaction must be a boolean.")
        if session is None:
            if key is None:
                raise ValueError("Provide a database key or an AsyncSession.")
            if not manage_transaction:
                raise ValueError("manage_transaction=False requires an external session.")
            factory = CONN_MANAGER.get_session_factory(key)
            if not isinstance(factory.kw["bind"], AsyncEngine):
                raise TypeError("Database key must select an async engine.")
        self.key = key
        self._session = session
        self.manage_transaction = manage_transaction

    @property
    def session(self) -> AsyncSession:
        """
        Expose the injected session or pin one session for explicit legacy access.

        :return: Stable AsyncSession for repeated explicit property access. This opts
                 the executor into its legacy session-bound behavior; direct users
                 must close it and must not share it across concurrent tasks.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if self._session is None:
            self._session = CONN_MANAGER.get_session(self.key)
        return self._session

    @session.setter
    def session(self, value: AsyncSession | None) -> None:
        """
        Preserve explicit session assignment without changing transaction ownership.

        :param value: AsyncSession, or None to resume key-based session creation.
        :return: None; the caller must finish the previous session before replacement.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if value is not None and not isinstance(value, AsyncSession):
            raise TypeError("session must be an AsyncSession.")
        if value is None and (self.key is None or not self.manage_transaction):
            raise ValueError("Clearing the session requires a key and managed transaction mode.")
        self._session = value

    @asynccontextmanager
    async def _session_scope(self, *, commit: bool = False):
        """
        Apply session ownership without sharing a key-based session between operations.

        :param commit: Submit successful statements in the legacy managed mode.
        :yield: Session; external transaction mode leaves all cleanup to its owner.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if not self.manage_transaction:
            yield self._session
            return
        scope = self._session if self._session is not None else CONN_MANAGER.session_scope(self.key)
        async with scope as session:
            try:
                yield session
                if commit:
                    await session.commit()
            except SQLAlchemyError:
                await session.rollback()
                raise

    @asynccontextmanager
    async def _inspection_scope(self):
        """
        Preserve legacy metadata ownership while supporting external transactions.

        Legacy injected sessions inspect through a separate engine connection without
        closing or submitting the injected session. External transaction mode uses
        that session's current connection; key-based inspection uses a managed scope.

        :yield: AsyncConnection for SQLAlchemy's synchronous inspector facade.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if self._session is not None and self.manage_transaction:
            async with self._session.bind.connect() as conn:
                yield conn
        else:
            async with self._session_scope() as session:
                yield await session.connection()

    async def _execute(self, sql: str, params: Optional[Dict[str, Any]] = None) -> Result:
        """
        Execute raw SQL and return SQLAlchemy's buffered Result.

        :param sql: SQL text using :name placeholders for bound values.
        :param params: Optional values bound to the SQL statement.
        :return: Buffered Result; legacy mode commits before returning. External mode leaves
                 transaction ownership to the supplied session's caller.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        async with self._session_scope(commit=True) as session:
            return await session.execute(text(sql), params)

    async def _execute_stmt(self, stmt: Select) -> Result:
        """
        Execute a SQLAlchemy statement under the selected session ownership mode.

        :param stmt: SQLAlchemy select, insert, update, delete, or other executable statement.
        :return: Buffered Result; legacy mode submits the operation, external mode does not.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        async with self._session_scope(commit=True) as session:
            return await session.execute(stmt)

    # —< Transaction >—————————————————————————————————————● Query Tables
    async def query_tables(self, schema: str = "public"):
        """
        List all table names under the specified schema.

        ● Guide：
            conn_cls = SqlAlchemyExecAsync(session=SESSION[KEYS])
            result = await conn_cls.query_tables(table_name='config_eqp_basic')

        :param schema: Optional; schema name (e.g., 'public' for PostgreSQL, None for MySQL).
        :return: List[str]; table names.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        async with self._inspection_scope() as conn:

            def sync_get_table_names(sync_conn):
                """
                Run sync get table names using the current operation context.

                :param sync_conn: Synchronous facade for the current SQLAlchemy connection.

                :return: Table names reported by the selected schema inspector.

                                                                                               ♂ ZhengLee 2026.10.03
                """
                inspector = inspect(sync_conn)
                return inspector.get_table_names(schema=schema)

            return await conn.run_sync(sync_get_table_names)

    # —< Transaction >—————————————————————————————————————● Query Ta
    async def query_table_exists(self, table: str) -> bool:
        """
        Check table existence using the current session's SQLAlchemy inspector.

        ● Guide：
            conn_cls = SqlAlchemyExecAsync(key="main")
            result = await conn_cls.query_table_exists(table='Table_name')

        :param table: Literal table name; SQL fragments are not interpolated.
        :return: True when the table exists in the connection's default schema.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        async with self._session_scope(commit=True) as session:
            conn = await session.connection()

            def sync_has_table(sync_conn):
                """
                Check a literal table name on the current transaction's connection.

                :param sync_conn: Synchronous facade for the current SQLAlchemy connection.

                :return: True when the literal table name exists in the default schema.

                                                                                               ♂ ZhengLee 2026.10.03
                """
                return inspect(sync_conn).has_table(table)

            return await conn.run_sync(sync_has_table)

    # —< Transaction >—————————————————————————————————————● Query Schema
    async def query_schema(self, table_name: str, schema: str = "public"):
        """
        Retrieve column definitions for a specific table in the database.

        ● Guide:
            conn_cls = SqlAlchemyExecAsync(key="main")
            result = await conn_cls.query_schema(table_name='config_eqp_basic')

        :param table_name: Target table name.
        :param schema: Schema name (default: 'public' for PostgreSQL).
        :return: List[dict]; each dict contains column metadata.
            All SQLAlchemy types are converted to string for JSON serialization compatibility.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        async with self._inspection_scope() as conn:

            def sync_get_columns(sync_conn):
                """
                Use SQLAlchemy inspector to retrieve columns metadata for the specified table.

                :param sync_conn: Synchronous facade for the current SQLAlchemy connection.

                :return: Column metadata reported by the table inspector.

                                                                                               ♂ ZhengLee 2026.10.03
                """
                inspector = inspect(sync_conn)
                return inspector.get_columns(table_name, schema=schema)

            try:
                # Run the column retrieval in a sync context.
                columns = await conn.run_sync(sync_get_columns)
                for col in columns:
                    """
                    Convert non-serializable fields (like type) to string for each column definition.
                    """
                    if "type" in col:
                        col["type"] = str(col["type"])
                return columns

            except NoSuchTableError:
                """
                Raised if the specified table does not exist in the database.
                """
                raise

    # —< Transaction >—————————————————————————————————————● Query to list
    @sql_validate
    async def query(self, sql: str, params: Optional[Dict[str, Any]] = None) -> list:
        """
        Execute a raw SQL query and fetch all results as a list.

        ● Guide：
            conn_cls = SqlAlchemyExecAsync(key="main")
            result = await conn_cls.query(sql='SELECT * FROM public.test')

        :param sql: Raw SQL with parameters (use :name style).
        :param params: Parameters dict for SQL query.
        :return: List of rows as lists.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        try:
            result = await self._execute(sql, params)
            return [list(row) for row in result.fetchall()]
        except SQLAlchemyError as e:
            raise e

    # —< Transaction >—————————————————————————————————————● Query to scalar
    @sql_validate
    async def query_scalar(self, sql: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """
        Execute a raw SQL query and return a single scalar.

        ● Guide：
            conn_cls = SqlAlchemyExecAsync(key="main")
            scalar = await conn_cls.query_scalar(sql='SELECT COUNT(*) FROM public.test')

        :param sql: Raw SQL with parameters (use :name style).
        :param params: Parameters dict for SQL query.
        :return: The first scalar result.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        try:
            result = await self._execute(sql, params)
            return [row[0] for row in result.fetchall()][0]
        except SQLAlchemyError as e:
            raise e

    # —< Transaction >—————————————————————————————————————● Query large result
    @sql_validate
    async def query_large(self, sql: str, params: Optional[Dict[str, Any]] = None, mapping: bool = False):
        """
        Yield rows from a buffered SQL result while preserving the existing return format.

        ● Guide:
            db = SqlAlchemyExecAsync(key="main")
            async for row in db.query_large("SELECT id FROM item"):
                print(row)

        :param sql: Raw SQL using :name placeholders.
        :param params: Optional bound statement values.
        :param mapping: Yield RowMapping values when True, otherwise Row objects.
        :yield: One row at a time from an already buffered Result; this is not server-side
                streaming and still requires memory for the complete result.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        result = await self._execute(sql, params)
        result_iter = result.mappings() if mapping else result
        for row in result_iter:
            yield row

    # —< Transaction >—————————————————————————————————————● Query to dictionary
    @sql_validate
    async def query_dict(self, sql: str, params: Optional[Dict[str, Any]] = None) -> list:
        """
        Execute a raw SQL query and transform results into a list of dictionaries.

        ● Guide：
            conn_cls = SqlAlchemyExecAsync(key="main")
            result = await conn_cls.query_dict(sql='SELECT * FROM public.test')

        :param sql: Raw SQL with parameters (use :name style).
        :param params: Parameters dict for SQL query.
        :return: List of dicts (column -> value).

                                                                                               ♂ ZhengLee 2026.10.03
        """
        try:
            result = await self._execute(sql, params)
            return [dict(row) for row in result.mappings()]
        except SQLAlchemyError as e:
            raise e

    # —< Transaction >—————————————————————————————————————● Query to List in specific index.
    @sql_validate
    async def query_list_idx(self, sql: str, params: Optional[Dict[str, Any]] = None, index: Optional[int] = 0) -> list:
        """
        Execute the raw SQL query and return a list of values from a specific column index.

        ● Guide：
            conn_cls = SqlAlchemyExecAsync(key="main")
            result = await conn_cls.query_list_idx(sql='SELECT * FROM public.test')

        :param sql: Raw SQL with parameters (use :name style).
        :param params: Parameters dict for SQL query.
        :param index: Specifies a column by index.
        :return: List of rows as lists.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        try:
            result = await self._execute(sql, params)
            if len(result.keys()) == 1:
                """
                Directly return a list of values for the single column.
                """
                return [row[0] for row in result.fetchall()]
            else:
                """
                For multiple columns, extract values using the specified index.
                Ensure index is within bounds for each row.
                """
                return [row[index] if index < len(row) else None for row in result.fetchall()]
        except SQLAlchemyError as e:
            raise e

    # —< Transaction >—————————————————————————————————————● Query the first data in specific index.
    @sql_validate
    async def query_first(self, sql: str, params: Optional[Dict[str, Any]] = None, index: Optional[int] = 0) -> dict:
        """
        Execute the raw SQL query and return a fist values from a specific column index list.

        ● Guide：
            conn_cls = SqlAlchemyExecAsync(key="main")
            result = await conn_cls.query_first(sql='SELECT * FROM public.test')

        :param sql: Raw SQL with parameters (use :name style).
        :param params: Parameters dict for SQL query.
        :param index: Specifies a column by index.
        :return: Dict of rows.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        rows = await self.query_list_idx(sql=sql, params=params, index=index)
        return rows[0] if rows and len(rows) >= 1 and rows[0] else None

    # —< Transaction >—————————————————————————————————————● Query to List in specific column name.
    @sql_validate
    async def query_list_col(self, sql: str, params: Optional[Dict[str, Any]] = None, column_name: str = "N/A") -> list:
        """
        Execute the raw SQL query and return a list of values from a specific column by name.

        ● Guide：
            conn_cls = SqlAlchemyExecAsync(key="main")
            result = await conn_cls.query_list_col(sql='SELECT * FROM public.test', column_name='Specific column name')

        :param sql: Raw SQL with parameters (use :name style).
        :param params: Parameters dict for SQL query.
        :param column_name: Specifies a column by column_name.
        :return: List of rows as lists.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        try:
            result = await self._execute(sql, params)
            if column_name in result.keys():
                """
                Proceed to extract the values if the column exists.
                """
                return [row[column_name] for row in result.mappings()]
            else:
                """
                Handle the case where the specified column name does not exist.
                """
                return []
        except SQLAlchemyError as e:
            raise e

    # —< Transaction >—————————————————————————————————————● Execute raw SQL INSERT/UPDATE/DELETE commands.
    @sql_validate
    async def exec(self, sql: str, param: Optional[Dict[str, Any]] = None) -> bool:
        """
        Execute a raw SQL command (e.g., INSERT, UPDATE, DELETE) and return a boolean status.

        ● Guide：
            conn_cls = SqlAlchemyExecAsync(key="main")
            result = await conn_cls.exec(sql='INSERT INTO public.test (is_active) VALUES(true)')

        :param sql: Raw SQL with parameters (use :name style).
        :param param: Parameters dict for SQL query.
        :return: True if executed successfully.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        try:
            await self._execute(sql, param)
            return True
        except SQLAlchemyError as e:
            raise e

    # —< Transaction >—————————————————————————————————————● ORM Command Execution
    async def execute_orm(self, stmt: Select) -> Result:
        """
        Execute an ORM query using a SQLAlchemy statement object and return the buffered Result object.
        This method does not enforce a particular result fetching strategy (e.g., all(), first());
        you can decide later whether to call .all(), .first(), etc.

        ● Guide(Select)：
            from sqlalchemy import select
            stmt = select(Model).where(Model.id == 1)
            conn_cls = SqlAlchemyExecAsync(session=SESSION[KEYS])
            result = await conn_cls.execute_orm(stmt)
            records = result.all()  # or result.first(), etc.

        ● Guide(Insert)：
            from sqlalchemy import insert
            stmt = insert(Model).values(column=value)
            conn_cls = SqlAlchemyExecAsync(session=SESSION[KEYS])
            rowcount = await conn_cls.execute_orm(stmt)

        :param stmt: A SQLAlchemy statement (e.g., select(Model).where(...))
        :return: The buffered Result object from executing the ORM query.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        try:
            result = await self._execute_stmt(stmt)
            return result
        except SQLAlchemyError as e:
            raise e

    # —< Transaction >—————————————————————————————————————● ORM Object Add & Commit
    async def execute_commit(self, obj: Any) -> Any:
        """
        Add an ORM object, explicitly commit it, refresh its fields, and return it.

        ● Guide:
            db = SqlAlchemyExecAsync(key="main")
            saved = await db.execute_commit(model_object)

        :param obj: ORM object to add to the session.
        :return: Committed and refreshed ORM object; owned sessions close before returning.
        :raises RuntimeError: manage_transaction=False would bypass an external transaction.
        :raises SQLAlchemyError: ORM persistence or refresh failed.

        For external transactions, use session.add() and await session.flush() so the outer
        context decides when to submit all operations.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if not self.manage_transaction:
            raise RuntimeError("execute_commit cannot submit an externally managed transaction; use session.add/flush.")
        async with self._session_scope() as session:
            session.add(obj)
            await session.commit()
            await session.refresh(obj)
            return obj

    # —< Transaction >—————————————————————————————————————● ORM Command Pagination
    async def paginate_orm(
        self,
        stmt,
        page: Union[int, str] = "all",
        size: Union[int, str] = "all",
        subquery_count: bool = True,
        unique=True,
    ) -> Page[dict]:
        """
        Execute a Select statement with fastapi-pagination.

        :param stmt:           SQLAlchemy Select expression.
        :param page:           Page number (>=1) or "all" (str, case-insensitive).
        :param size:           Records per page (>=1) or "all" (str).
        :param subquery_count: Use sub-query for COUNT(*) when JOINs are complex.
        :param unique:         Make sure the value is unique. The rows are not hashable, please use unique=False.
        :return:               fastapi_pagination.default.Page instance
                               (identical schema whether paginated or full).
        :raises SQLAlchemyError: On database errors; rolls back the session before re-raising.

        ● Return format:
            {
                "total": int,                     Total matching rows.
                "pages": int,                     Total matching pages.
                "page": int,                      Current page.
                "size": int,                      Current page size(rows).
                "items": List[Dict]               Result rows as dict
            }

                                                                                               ♂ ZhengLee 2026.10.03
        """
        # ----------------------------------------------------------● Step 1. Detect full‑fetch mode
        is_all = (isinstance(page, str) and page.lower() == "all") or (isinstance(size, str) and size.lower() == "all")
        # ----------------------------------------------------------● Step 2. FULL‑FETCH  (no pagination)
        if is_all:
            try:
                result = await self._execute_stmt(stmt)
                items = [dict(r._mapping) for r in result] if result else []
                total = len(items)
                params = Params(page=1, size=max(total, 1))
                return create_page(items, total, params)
            except SQLAlchemyError as e:
                raise e
        # ----------------------------------------------------------● Step 3. PAGINATED mode
        try:
            async with self._session_scope() as session:
                params = Params(page=max(int(page), 1), size=max(int(size), 1))
                page_obj = await apaginate(session, stmt, params=params, subquery_count=subquery_count, unique=unique)

            # --------------------------------------------------● Step 4.  Row → dict conversion
            page_obj = page_obj.model_copy(update={"items": [dict(r._mapping) for r in page_obj.items]})
            return page_obj

        except SQLAlchemyError as e:
            raise e

    # —< Transaction >—————————————————————————————————————● RAW Pagination
    @validate_call
    async def paginate_query(
        self, sql: str, page: Union[int, str] = 1, size: Union[int, str] = 20, single_element: bool = False
    ):
        """
        Generate a paginated (or full‑fetch) response for an arbitrary SQL statement.

        ● Behaviour
            1. **Full‑Fetch** – if *page* or *size* equals ``"all"`` (case‑insensitive),
               execute the query once and wrap it in a Pagination `Page`.
            2. **Paginated** – otherwise delegate to `fastapi_pagination.apaginate`
               for LIMIT/OFFSET handling.

        :param sql:            Raw SQL text.
        :param page:           Page index (1‑based) **or** the string ``"all"``.
        :param size:           Page size (>=1)       **or** the string ``"all"``.
        :param single_element: Treat each row as a single scalar (1‑column result).
        :return:               `fastapi_pagination.default.Page`

                                                                                               ♂ ZhengLee 2026.10.03
        """
        # --------------------------------------------------------------● Step 1. Detect mode
        is_all = str(page).lower() == "all" or str(size).lower() == "all"

        # --------------------------------------------------------------● Step 2. FULL‑FETCH
        if is_all:
            rows = (
                await self.query_list_idx(sql)  # → flat list
                if single_element
                else await self.query(sql)  # → list[list]
            )
            total = len(rows)
            params = Params(page=1, size=max(total, 1))
            return create_page(rows, total, params)

        # --------------------------------------------------------------● Step 3. PAGINATED
        params = Params(page=max(int(page), 1), size=max(int(size), 1))
        async with self._session_scope() as session:
            page_obj = await apaginate(session, text(sql), params=params, unwrap_mode="no-unwrap")

        # --------------------------------------------------------------● Step 4. Row → list / scalar
        coercer = (lambda r: list(r)[0]) if single_element else (lambda r: list(r))
        page_obj = page_obj.model_copy(update={"items": [coercer(r) for r in page_obj.items]})
        return page_obj

    # —< Transaction >—————————————————————————————————————● RAW Pagination (dict rows)
    @validate_call
    async def paginate_query_dict(
        self,
        sql: str,
        type_db: EnumDBType = EnumDBType.POSTGRESQL,
        page: Union[int, str] = 1,
        size: Union[int, str] = 20,
    ):
        """
        Paginate *or* fully fetch a raw SQL statement and convert each row to **dict**.

        ● Behaviour
            1. **Full‑Fetch** – return *all* rows (→ List[dict]).
            2. **Paginated** – call database‑specific helper to apply LIMIT/OFFSET.

        :param sql:     Raw SQL text.
        :param type_db: Enum designating DB flavour (passed to `sqlalchemy_pagination_stmt`).
        :param page:    Page index (1‑based) **or** the string ``"all"``.
        :param size:    Page size (>=1)       **or** the string ``"all"``.
        :return:        `fastapi_pagination.default.Page`

                                                                                               ♂ ZhengLee 2026.10.03
        """
        # --------------------------------------------------------------● Step 1. Detect mode
        is_all = str(page).lower() == "all" or str(size).lower() == "all"

        # --------------------------------------------------------------● Step 2. FULL‑FETCH
        if is_all:
            items = await self.query_dict(sql)
            total = len(items)
            params = BigParams(page=1, size=max(total, 1))
            return create_page(items, total, params)

        # --------------------------------------------------------------● Step 3. PAGINATED
        page_int = max(int(page), 1)
        size_int = max(int(size), 1)

        # COUNT(*)  (needed by fastapi-pagination Page schema)
        count_sql = f"SELECT COUNT(*) FROM ({sql}) AS total"
        total = await self.query_scalar(count_sql)

        # Dialect‑aware pagination SQL
        page_sql = sqlalchemy_pagination_stmt(sql, page_int, size_int, type_db)
        result = await self._execute(page_sql)
        items = [dict(row) for row in result.mappings()]
        params = BigParams(page=page_int, size=size_int)
        return create_page(items, total, params)
