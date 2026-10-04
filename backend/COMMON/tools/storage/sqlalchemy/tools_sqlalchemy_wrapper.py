# ◆—< Pack >—————————————————————————————————◆ Common
from .tools_sqlalchemy_async import SqlAlchemyExecAsync

# ◆—< Pack >—————————————————————————————————◆ SqlAlchemy
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession
from sqlalchemy.engine import make_url

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database import CONN_MANAGER

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Optional, Callable
from types import TracebackType
import inspect


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ SqlAlchemy - Async Executor Wrapper
class SqlAlchemyExecWrapper:
    """
    Forward SQL operations using the one asynchronous database in CONN_MANAGER.

    key= remains a compatibility alias; it no longer selects another repository.
    Each default invocation gets a fresh session. Entering this wrapper's context
    does not create a shared transaction.

    ● Guide:
        repo = SqlAlchemyExecWrapper()
        rows = await repo.query(sql="SELECT * FROM sys_event")
        stream = await repo.query_large(sql="SELECT * FROM sys_event")
        async for row in stream:
            print(row)

                                                                                               ♂ ZhengLee 2026.10.03
    """

    def __init__(
        self, key: str | None = None, session: AsyncSession | None = None, *, manage_transaction: bool = True
    ) -> None:
        """
        Prepare a single-database executor without opening a connection.

        :param key: Legacy identifier; all values use the one configured database.
        :param session: Optional caller-supplied asynchronous session.
        :param manage_transaction: False leaves the injected session under caller control.
        :return: None; the manager must be initialized before the first operation.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        self.key = key
        self._executor = SqlAlchemyExecAsync(
            key=key, session=session, manage_transaction=manage_transaction
        )

    @property
    def engine(self):
        """
        Resolve the current manager-owned database engine.

        :return: Injected session bind or manager-owned AsyncEngine; callers must not dispose it.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if self._executor._session is not None and self._executor._session.bind is not None:
            return self._executor._session.bind
        return self.session_factory.kw["bind"]

    @property
    def session_factory(self):
        """
        Expose the manager's single database factory for compatibility.

        :return: Shared factory; sessions created directly are caller-owned.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        factory = CONN_MANAGER._session_factory
        if factory is None:
            raise RuntimeError("Database has not been initialized; call init_db() first.")
        return factory

    @property
    def _is_async(self) -> bool:
        """
        Return the I/O mode of the current manager-owned engine.

        :return: True for an AsyncEngine or AsyncConnection, otherwise False.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return isinstance(self.engine, (AsyncEngine, AsyncConnection))

    @staticmethod
    def _detect_async(url: str) -> bool:
        """
        Detect the driver's default I/O mode using SQLAlchemy's URL dialect.

        :param url: SQLAlchemy URL; passwords and database names do not select I/O.
        :return: True for an async dialect, False for a synchronous default.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return make_url(url).get_dialect().is_async

    def __getattr__(self, meth_name: str) -> Callable:
        """
        Forward an asynchronous method while retaining its session ownership.

        :param meth_name: Existing SQL executor method name.
        :return: Awaitable proxy; async streams return an iterator when awaited.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        method = getattr(SqlAlchemyExecAsync, meth_name)
        if meth_name.startswith('_') or not callable(method):
            raise AttributeError(meth_name)

        async def async_proxy(*args, **kwargs):
            """
            Forward one operation to the executor's current session policy.

            :param args: Positional method arguments.
            :param kwargs: Keyword method arguments.
            :return: Original method result, or an iterator for query_large.

                                                                                               ♂ ZhengLee 2026.10.03
            """
            result = getattr(self._executor, meth_name)(*args, **kwargs)
            return await result if inspect.isawaitable(result) else result

        return async_proxy

    # —< Context >—————————————————————————————————————————● Compatibility
    def __enter__(self) -> "SqlAlchemyExecWrapper":
        """
        Return this wrapper; each method still owns a separate operation scope.

        :return: This wrapper; entering does not start a transaction.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return self

    def __exit__(
        self, exc_type: Optional[type], exc_value: Optional[BaseException], traceback: Optional[TracebackType]
    ) -> bool | None:
        """
        Leave the wrapper context without suppressing exceptions or closing engines.

        :param exc_type: Exception type raised inside the context, or None.

        :param exc_value: Exception raised inside the context, or None.

        :param traceback: Traceback associated with the context exception, or None.

        :return: None; exceptions are not suppressed.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return None

    async def __aenter__(self) -> "SqlAlchemyExecWrapper":
        """
        Return this wrapper without creating a shared async session or transaction.

        :return: This wrapper; entering does not start a transaction.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return self

    async def __aexit__(
        self, exc_type: Optional[type], exc_value: Optional[BaseException], traceback: Optional[TracebackType]
    ) -> bool | None:
        """
        Leave the async wrapper context; method scopes release their own sessions.

        :param exc_type: Exception type raised inside the context, or None.

        :param exc_value: Exception raised inside the context, or None.

        :param traceback: Traceback associated with the context exception, or None.

        :return: None; exceptions are not suppressed.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return None
