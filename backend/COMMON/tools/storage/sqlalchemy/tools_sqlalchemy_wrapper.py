# ◆—< Pack >—————————————————————————————————◆ Common
from .tools_sqlalchemy_async import SqlAlchemyExecAsync

# ◆—< Pack >—————————————————————————————————◆ SqlAlchemy
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy.engine import make_url

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database import CONN_MANAGER

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Optional, Callable
from types import TracebackType
from importlib import import_module
import inspect


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ SqlAlchemy - Repository Executor
class SqlAlchemyExecWrapper:
    """
    Forward repository operations using engines and sessions owned by CONN_MANAGER.

    Repository keys keep their existing namespace. Each invocation gets a fresh
    session; entering this wrapper's context does not create a shared transaction.
    SQLAlchemy's dialect selects sync/async I/O. The optional synchronous executor
    is loaded only when a synchronous method is requested.

    ● Guide:
        repo = SqlAlchemyExecWrapper(key="edw-holmes")
        rows = await repo.query(sql="SELECT * FROM sys_event")
        stream = await repo.query_large(sql="SELECT * FROM sys_event")
        async for row in stream:
            print(row)

                                                                                               ♂ ZhengLee 2026.10.03
    """

    def __init__(self, key: str) -> None:
        """
        Resolve the existing repository key without keeping a second engine cache.

        :param key: Identifier registered with CONN_MANAGER.add_repositories().
        :return: None; engines are registered with the manager before first use.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        self.key = key
        CONN_MANAGER.get_repository_session_factory(key)

    @property
    def engine(self):
        """
        Resolve the current repository engine, including metadata URL replacements.

        :return: Manager-owned Engine or AsyncEngine; callers must not dispose it.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return self.session_factory.kw["bind"]

    @property
    def session_factory(self):
        """
        Expose the manager's factory for compatibility with existing wrapper access.

        :return: Shared factory; sessions created directly are caller-owned.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return CONN_MANAGER.get_repository_session_factory(self.key)

    @property
    def _is_async(self) -> bool:
        """
        Return the I/O mode of the current manager-owned repository engine.

        :return: True for an AsyncEngine, otherwise False.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return isinstance(self.engine, AsyncEngine)

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
        Forward a method while retaining per-operation session ownership.

        :param meth_name: Existing SQL executor method name.
        :return: Async or sync proxy; async streams acquire their scope on iteration.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if self._is_async:
            method = getattr(SqlAlchemyExecAsync, meth_name)

            async def stream_proxy(*args, **kwargs):
                """
                Keep the repository session open until streaming ends or is closed.

                :param args: Positional method arguments.
                :param kwargs: Keyword method arguments.
                :yield: Original result rows; early consumers must close the iterator.

                                                                                               ♂ ZhengLee 2026.10.03
                """
                async with CONN_MANAGER.session_scope(self.key, repository=True) as session:
                    iterator = getattr(SqlAlchemyExecAsync(session=session), meth_name)(*args, **kwargs)
                    try:
                        async for row in iterator:
                            yield row
                    finally:
                        await iterator.aclose()

            async def async_proxy(*args, **kwargs):
                """
                Execute one async repository method with a fresh managed session.

                :param args: Positional method arguments.
                :param kwargs: Keyword method arguments.
                :return: Original method result, or a scoped iterator for query_large.

                                                                                               ♂ ZhengLee 2026.10.03
                """
                if inspect.isasyncgenfunction(inspect.unwrap(method)):
                    return stream_proxy(*args, **kwargs)
                async with CONN_MANAGER.session_scope(self.key, repository=True) as session:
                    result = getattr(SqlAlchemyExecAsync(session=session), meth_name)(*args, **kwargs)
                    return await result if inspect.isawaitable(result) else result

            return async_proxy

        # Load optional sync integration on demand so async imports do not require it.
        sync_class = import_module(".tools_sqlalchemy_sync", __package__).SqlAlchemyExecSync
        getattr(sync_class, meth_name)

        def sync_proxy(*args, **kwargs):
            """
            Forward one synchronous method using a session on the calling thread.

            :param args: Positional method arguments.
            :param kwargs: Keyword method arguments.
            :return: Original synchronous executor result.

                                                                                               ♂ ZhengLee 2026.10.03
            """
            with CONN_MANAGER.session_scope_sync(self.key, repository=True) as session:
                return getattr(sync_class(session=session), meth_name)(*args, **kwargs)

        return sync_proxy

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
