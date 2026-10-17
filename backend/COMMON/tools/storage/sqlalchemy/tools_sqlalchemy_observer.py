"""Observe root Session transactions without opening sessions or executing SQL."""

import threading
import time
import weakref

from sqlalchemy import event
from sqlalchemy.orm import Session


class SqlAlchemyTransactionObserver:
    """Engine-filtered logical transaction counts, including read autobegin.

    Savepoints are excluded. These counters describe transaction lifetimes, not
    concurrent SQL execution. The owner starts/stops listeners before disposing
    the borrowed engine; this helper never owns its engine or sessions.
    """

    def __init__(self, engine, *, ignore_key="storage.observe.ignore"):
        self.engine = getattr(engine, "sync_engine", engine)
        self.ignore_key = ignore_key
        self._active = weakref.WeakKeyDictionary()
        self._completed = 0
        self._lock = threading.RLock()
        self._listeners = []
        self.listening = False

    def start(self):
        if self.listening or self.engine is None:
            return
        try:
            for name, callback in (
                ("after_transaction_create", self._created),
                ("after_transaction_end", self._ended),
            ):
                event.listen(Session, name, callback)
                self._listeners.append((name, callback))
            with self._lock:
                self.listening = True
        except BaseException:
            self.stop()
            raise

    def stop(self):
        with self._lock:
            self.listening = False
        for name, callback in self._listeners:
            event.remove(Session, name, callback)
        self._listeners.clear()
        with self._lock:
            self._active.clear()

    def _created(self, session, transaction):
        if (
            transaction.parent is None
            and not session.info.get(self.ignore_key)
            and getattr(session.bind, "engine", session.bind) is self.engine
        ):
            with self._lock:
                if self.listening:
                    self._active[transaction] = time.monotonic()

    def _ended(self, session, transaction):
        if transaction.parent is None:
            with self._lock:
                if self._active.pop(transaction, None) is not None:
                    self._completed += 1

    def snapshot(self):
        with self._lock:
            started = list(self._active.values())
            return {
                "active_transactions": len(started),
                "completed_transactions_total": self._completed,
                "oldest_transaction_seconds": (max(0.0, time.monotonic() - min(started)) if started else 0.0),
            }
