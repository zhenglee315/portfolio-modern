"""Focused behavior tests for the async Redis helper without a Redis server."""

from datetime import datetime
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4
import asyncio
import pickle
import sys

import pytest
from redis.asyncio import Redis
from redis.exceptions import DataError, RedisError, ResponseError, WatchError


@pytest.fixture
def redis_tools(monkeypatch):
    """Load RedisAsync with its settings and manager imports isolated."""

    system = ModuleType("SYSTEM")
    system.__path__ = []
    database = ModuleType("SYSTEM.database")
    database.CONN_MANAGER = SimpleNamespace(get_cache=Mock(side_effect=AssertionError("manager lookup is unexpected")))
    settings = ModuleType("SYSTEM.settings")
    settings.TIME_ZONE = "UTC"
    for name, module in (("SYSTEM", system), ("SYSTEM.database", database), ("SYSTEM.settings", settings)):
        monkeypatch.setitem(sys.modules, name, module)

    path = Path(__file__).resolve().parents[1] / "COMMON/tools/storage/redis/tools_redis_async.py"
    spec = spec_from_file_location(f"isolated_redis_tools_{uuid4().hex}", path)
    module = module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)
    spec.loader.exec_module(module)
    client = Redis(host="127.0.0.1", port=6379, decode_responses=False)
    close_client = client.aclose
    yield SimpleNamespace(
        cache=module.RedisAsync(redis=client), client=client, manager=database.CONN_MANAGER, module=module
    )
    asyncio.run(close_client())


class FakePipeline:
    """Record queued commands while exercising RedisAsync's pipeline ownership."""

    def __init__(self, results=(), *, execute_error=None):
        self.commands = []
        self.results = results
        self.execute_error = execute_error
        self.exit_errors = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        self.exit_errors.append(exc_value)
        return None

    def lrem(self, *args):
        self.commands.append(("lrem", args))

    def lpush(self, *args):
        self.commands.append(("lpush", args))

    def ltrim(self, *args):
        self.commands.append(("ltrim", args))

    def lrange(self, *args):
        self.commands.append(("lrange", args))

    def sadd(self, *args):
        self.commands.append(("sadd", args))

    def set(self, *args, **kwargs):
        self.commands.append(("set", args, kwargs))

    def exists(self, *args):
        self.commands.append(("exists", args))

    def incrby(self, *args):
        self.commands.append(("incrby", args))

    def expire(self, *args, **kwargs):
        self.commands.append(("expire", args, kwargs))

    def ttl(self, *args):
        self.commands.append(("ttl", args))

    async def execute(self):
        self.commands.append(("execute", ()))
        if self.execute_error is not None:
            raise self.execute_error
        return self.results


class FakeWatchPipeline(FakePipeline):
    """Model watched reads, EXEC failures and connection release without a server."""

    def __init__(self, snapshot=None, *, execute_error=None, read_error=None):
        super().__init__()
        self.snapshot = snapshot or {}
        self.execute_error = execute_error
        self.read_error = read_error
        self.reset_count = 0

    async def __aexit__(self, exc_type, exc_value, traceback):
        await self.reset()

    async def watch(self, *keys):
        self.commands.append(("watch", keys))

    async def mget(self, keys):
        self.commands.append(("mget", tuple(keys)))
        if self.read_error is not None:
            raise self.read_error
        return [self.snapshot.get(key) for key in keys]

    def multi(self):
        self.commands.append(("multi", ()))

    def delete(self, *keys):
        self.commands.append(("delete", keys))

    async def execute(self):
        self.commands.append(("execute", ()))
        if self.execute_error is not None:
            raise self.execute_error
        return []

    async def reset(self):
        self.reset_count += 1


def test_set_keeps_existing_four_positional_arguments(redis_tools, monkeypatch):
    set_value = AsyncMock(return_value=True)
    monkeypatch.setattr(redis_tools.client, "set", set_value)

    assert asyncio.run(redis_tools.cache.set("code", "123", 300, False)) is True
    set_value.assert_awaited_once_with("code", "123", ex=300)


@pytest.mark.parametrize("condition", ["nx", "xx"])
def test_set_returns_conditional_failure_without_claiming_success(redis_tools, monkeypatch, condition):
    set_value = AsyncMock(return_value=None)
    monkeypatch.setattr(redis_tools.client, "set", set_value)

    assert asyncio.run(redis_tools.cache.set("lock", b"owner", serialize=False, **{condition: True})) is None
    assert set_value.await_args.args == ("lock", b"owner")
    assert set_value.await_args.kwargs[condition] is True


def test_set_can_preserve_existing_expiry(redis_tools, monkeypatch):
    set_value = AsyncMock(return_value=True)
    monkeypatch.setattr(redis_tools.client, "set", set_value)

    assert asyncio.run(redis_tools.cache.set("proof", b"verified", serialize=False, keepttl=True)) is True
    assert set_value.await_args.args == ("proof", b"verified")
    assert set_value.await_args.kwargs["keepttl"] is True
    assert set_value.await_args.kwargs.get("ex") is None


def test_empty_mget_avoids_invalid_redis_command(redis_tools, monkeypatch):
    mget = AsyncMock(side_effect=AssertionError("empty MGET must not reach Redis"))
    monkeypatch.setattr(redis_tools.client, "mget", mget)

    assert asyncio.run(redis_tools.cache.mget([])) == []
    mget.assert_not_awaited()


@pytest.mark.parametrize("deserialize", [True, False])
def test_mget_preserves_order_missing_values_and_raw_payloads(redis_tools, monkeypatch, deserialize):
    encoded = pickle.dumps({"id": 7})
    raw = b"123"
    mget = AsyncMock(return_value=[encoded, None, raw, encoded])
    monkeypatch.setattr(redis_tools.client, "mget", mget)
    keys = ["user", "missing", "code", "user"]

    expected_user = {"id": 7} if deserialize else encoded
    assert asyncio.run(redis_tools.cache.mget(keys, deserialize=deserialize)) == [
        expected_user,
        None,
        raw,
        expected_user,
    ]
    mget.assert_awaited_once_with(keys)


@pytest.mark.parametrize("remaining", [-2, -1, 0, 300])
def test_ttl_preserves_redis_missing_and_persistent_sentinels(redis_tools, monkeypatch, remaining):
    ttl = AsyncMock(return_value=remaining)
    monkeypatch.setattr(redis_tools.client, "ttl", ttl)

    assert asyncio.run(redis_tools.cache.ttl("proof")) == remaining
    ttl.assert_awaited_once_with("proof")


@pytest.mark.parametrize(
    "results,expected", [([1, True, 60], (1, 60)), ([2, False, 19], (2, 19)), ([8, True, 60], (8, 60))]
)
def test_incr_with_expiry_uses_one_transaction_and_only_assigns_missing_expiry(
    redis_tools, monkeypatch, results, expected
):
    pipe = FakePipeline(results=results)
    pipeline = Mock(return_value=pipe)
    close = AsyncMock(side_effect=AssertionError("the cache does not own its pooled client"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)
    monkeypatch.setattr(redis_tools.client, "aclose", close)

    assert asyncio.run(redis_tools.cache.incr_with_expiry("rate:ip", 60)) == expected
    pipeline.assert_called_once_with(transaction=True)
    assert pipe.commands == [
        ("incrby", ("rate:ip", 1)),
        ("expire", ("rate:ip", 60), {"nx": True}),
        ("ttl", ("rate:ip",)),
        ("execute", ()),
    ]
    assert pipe.exit_errors == [None]
    close.assert_not_awaited()


@pytest.mark.parametrize("amount", [-3, 0, 7])
def test_incr_with_expiry_accepts_signed_integer_amounts(redis_tools, monkeypatch, amount):
    pipe = FakePipeline(results=[10 + amount, False, 17])
    monkeypatch.setattr(redis_tools.client, "pipeline", Mock(return_value=pipe))

    assert asyncio.run(redis_tools.cache.incr_with_expiry("counter", 60, amount=amount)) == (10 + amount, 17)
    assert pipe.commands[0] == ("incrby", ("counter", amount))


@pytest.mark.parametrize("expiry", [0, -1, True, False, 1.5, "60", None])
def test_incr_with_expiry_rejects_invalid_expiry_before_opening_pipeline(redis_tools, monkeypatch, expiry):
    pipeline = Mock(side_effect=AssertionError("invalid expiry must not borrow a connection"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    with pytest.raises(ValueError):
        asyncio.run(redis_tools.cache.incr_with_expiry("counter", expiry))
    pipeline.assert_not_called()


@pytest.mark.parametrize("amount", [True, False, 1.5, "1", None])
def test_incr_with_expiry_rejects_non_integer_amounts_before_opening_pipeline(redis_tools, monkeypatch, amount):
    pipeline = Mock(side_effect=AssertionError("invalid amount must not borrow a connection"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    with pytest.raises(ValueError):
        asyncio.run(redis_tools.cache.incr_with_expiry("counter", 60, amount=amount))
    pipeline.assert_not_called()


def test_incr_with_expiry_does_not_repeat_increment_after_ordinary_redis_error(redis_tools, monkeypatch):
    failure = RedisError("connection lost during EXEC")
    pipe = FakePipeline(execute_error=failure)
    pipeline = Mock(return_value=pipe)
    close = AsyncMock(side_effect=AssertionError("pooled client must remain available"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)
    monkeypatch.setattr(redis_tools.client, "aclose", close)

    with pytest.raises(RedisError) as error:
        asyncio.run(redis_tools.cache.incr_with_expiry("rate:ip", 60))
    assert error.value is failure
    pipeline.assert_called_once()
    assert pipe.exit_errors == [failure]
    assert sum(command[0] == "execute" for command in pipe.commands) == 1
    close.assert_not_awaited()


def test_incr_with_expiry_cancellation_releases_pipeline_without_closing_client(redis_tools, monkeypatch):
    failure = asyncio.CancelledError()
    pipe = FakePipeline(execute_error=failure)
    pipeline = Mock(return_value=pipe)
    close = AsyncMock(side_effect=AssertionError("pooled client must remain available"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)
    monkeypatch.setattr(redis_tools.client, "aclose", close)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(redis_tools.cache.incr_with_expiry("rate:ip", 60))
    pipeline.assert_called_once()
    assert pipe.exit_errors == [failure]
    close.assert_not_awaited()


def test_transaction_reads_unique_keys_and_commits_a_result_only_after_exec(redis_tools, monkeypatch):
    pipe = FakeWatchPipeline({"code": b"123", "state": pickle.dumps({"attempts": 1})})
    pipeline = Mock(return_value=pipe)
    close = AsyncMock(side_effect=AssertionError("the cache does not own its pooled client"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)
    monkeypatch.setattr(redis_tools.client, "aclose", close)
    result = object()

    def updater(snapshot):
        assert snapshot == {"code": b"123", "state": {"attempts": 1}, "missing": None}
        return redis_tools.module.RedisUpdate(
            result=result,
            writes={"state": redis_tools.module.RedisValue({"attempts": 2}, keepttl=True)},
            deletes=("code",),
        )

    assert asyncio.run(redis_tools.cache.transaction(["code", "state", "code", "missing"], updater)) is result
    assert pipe.commands[:3] == [
        ("watch", ("code", "state", "missing")),
        ("mget", ("code", "state", "missing")),
        ("multi", ()),
    ]
    set_command = next(command for command in pipe.commands if command[0] == "set")
    assert set_command[1][0] == "state"
    assert pickle.loads(set_command[1][1]) == {"attempts": 2}
    assert set_command[2] == {"keepttl": True}
    assert ("delete", ("code",)) in pipe.commands
    assert pipe.commands[-1] == ("execute", ())
    assert pipe.reset_count >= 1
    pipeline.assert_called_once()
    close.assert_not_awaited()


def test_transaction_can_read_and_write_unserialized_values(redis_tools, monkeypatch):
    raw = pickle.dumps({"must": "stay encoded"})
    pipe = FakeWatchPipeline({"proof": raw})
    monkeypatch.setattr(redis_tools.client, "pipeline", Mock(return_value=pipe))

    def updater(snapshot):
        assert snapshot == {"proof": raw}
        return redis_tools.module.RedisUpdate(
            result=True,
            writes={"proof": redis_tools.module.RedisValue("verified", ex=300)},
        )

    assert asyncio.run(redis_tools.cache.transaction(["proof"], updater, serialize=False, deserialize=False)) is True
    assert ("set", ("proof", b"verified"), {"ex": 300}) in pipe.commands
    assert pipe.reset_count >= 1


def test_transaction_retries_conflict_using_new_snapshot(redis_tools, monkeypatch):
    stale = FakeWatchPipeline({"attempts": b"1"}, execute_error=WatchError("concurrent verification"))
    current = FakeWatchPipeline({"attempts": b"2"})
    pipeline = Mock(side_effect=[stale, current])
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)
    seen = []

    def updater(snapshot):
        attempts = int(snapshot["attempts"])
        seen.append(attempts)
        return redis_tools.module.RedisUpdate(
            result=attempts + 1,
            writes={"attempts": redis_tools.module.RedisValue(str(attempts + 1), keepttl=True)},
        )

    assert asyncio.run(redis_tools.cache.transaction(["attempts"], updater, serialize=False, deserialize=False)) == 3
    assert seen == [1, 2]
    assert ("set", ("attempts", b"3"), {"keepttl": True}) in current.commands
    assert stale.reset_count >= 1
    assert current.reset_count >= 1
    assert pipeline.call_count == 2


def test_transaction_noop_still_checks_for_a_changed_snapshot(redis_tools, monkeypatch):
    stale = FakeWatchPipeline({"proof": b"verified"}, execute_error=WatchError("proof was consumed"))
    current = FakeWatchPipeline()
    pipeline = Mock(side_effect=[stale, current])
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    def updater(snapshot):
        return redis_tools.module.RedisUpdate(result=snapshot["proof"] == b"verified")

    assert asyncio.run(redis_tools.cache.transaction(["proof"], updater, deserialize=False)) is False
    assert ("multi", ()) in stale.commands
    assert ("execute", ()) in stale.commands
    assert ("multi", ()) in current.commands
    assert ("execute", ()) in current.commands
    assert all(command[0] not in {"set", "delete"} for pipe in (stale, current) for command in pipe.commands)
    assert stale.reset_count >= 1
    assert current.reset_count >= 1


@pytest.mark.parametrize("phase", ["read", "execute"])
def test_transaction_does_not_retry_unrelated_redis_failures(redis_tools, monkeypatch, phase):
    failure = RedisError("cache is unavailable")
    pipe = FakeWatchPipeline(**{f"{phase}_error": failure})
    pipeline = Mock(return_value=pipe)
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    with pytest.raises(RedisError) as error:
        asyncio.run(
            redis_tools.cache.transaction(["proof"], lambda snapshot: redis_tools.module.RedisUpdate(result=True))
        )
    assert error.value is failure
    assert pipeline.call_count == 1
    assert pipe.reset_count >= 1


def test_transaction_cancellation_releases_its_pipeline_without_closing_client(redis_tools, monkeypatch):
    pipe = FakeWatchPipeline(execute_error=asyncio.CancelledError())
    pipeline = Mock(return_value=pipe)
    close = AsyncMock(side_effect=AssertionError("pooled client must remain available"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)
    monkeypatch.setattr(redis_tools.client, "aclose", close)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(redis_tools.cache.transaction(["proof"], lambda snapshot: redis_tools.module.RedisUpdate()))
    pipeline.assert_called_once()
    assert pipe.reset_count >= 1
    close.assert_not_awaited()


def test_transaction_limits_conflict_retries(redis_tools, monkeypatch):
    pipes = [FakeWatchPipeline(execute_error=WatchError("conflict")) for _ in range(3)]
    pipeline = Mock(side_effect=pipes)
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    with pytest.raises(WatchError):
        asyncio.run(
            redis_tools.cache.transaction(["proof"], lambda snapshot: redis_tools.module.RedisUpdate(), max_attempts=3)
        )
    assert pipeline.call_count == 3
    assert all(pipe.reset_count >= 1 for pipe in pipes)


def test_transaction_updater_failure_releases_pipeline_without_retrying(redis_tools, monkeypatch):
    pipe = FakeWatchPipeline()
    pipeline = Mock(return_value=pipe)
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)
    failure = RuntimeError("business decision failed")

    def updater(snapshot):
        raise failure

    with pytest.raises(RuntimeError) as error:
        asyncio.run(redis_tools.cache.transaction(["proof"], updater))
    assert error.value is failure
    pipeline.assert_called_once()
    assert all(command[0] not in {"multi", "set", "execute"} for command in pipe.commands)
    assert pipe.reset_count >= 1


def test_transaction_rejects_async_updater_without_starting_a_coroutine(redis_tools, monkeypatch):
    pipeline = Mock(side_effect=AssertionError("an async updater must not borrow a connection"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    async def updater(snapshot):
        return redis_tools.module.RedisUpdate()

    with pytest.raises(TypeError):
        asyncio.run(redis_tools.cache.transaction(["proof"], updater))
    pipeline.assert_not_called()


@pytest.mark.parametrize("keys", ["proof", {"proof"}])
def test_transaction_requires_an_explicit_key_sequence(redis_tools, monkeypatch, keys):
    pipeline = Mock(side_effect=AssertionError("invalid keys must not borrow a connection"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    with pytest.raises(TypeError):
        asyncio.run(redis_tools.cache.transaction(keys, lambda snapshot: redis_tools.module.RedisUpdate()))
    pipeline.assert_not_called()


@pytest.mark.parametrize("invalid_plan", [None, True, {"writes": {}}])
def test_transaction_requires_a_structured_update_plan(redis_tools, monkeypatch, invalid_plan):
    pipe = FakeWatchPipeline()
    monkeypatch.setattr(redis_tools.client, "pipeline", Mock(return_value=pipe))

    with pytest.raises(TypeError):
        asyncio.run(redis_tools.cache.transaction(["proof"], lambda snapshot: invalid_plan))
    assert all(command[0] not in {"multi", "set", "execute"} for command in pipe.commands)
    assert pipe.reset_count >= 1


@pytest.mark.parametrize("keys", [[], [""], ["proof", 3]])
def test_transaction_rejects_missing_or_invalid_watch_keys_before_opening_pipeline(redis_tools, monkeypatch, keys):
    pipeline = Mock(side_effect=AssertionError("invalid keys must not borrow a connection"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    with pytest.raises(ValueError):
        asyncio.run(redis_tools.cache.transaction(keys, lambda snapshot: redis_tools.module.RedisUpdate()))
    pipeline.assert_not_called()


@pytest.mark.parametrize("max_attempts", [0, -1, True, 1.5])
def test_transaction_rejects_invalid_retry_bound_before_opening_pipeline(redis_tools, monkeypatch, max_attempts):
    pipeline = Mock(side_effect=AssertionError("invalid limit must not borrow a connection"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    with pytest.raises(ValueError):
        asyncio.run(
            redis_tools.cache.transaction(
                ["proof"], lambda snapshot: redis_tools.module.RedisUpdate(), max_attempts=max_attempts
            )
        )
    pipeline.assert_not_called()


@pytest.mark.parametrize("operation", ["write", "delete", "overlap"])
def test_transaction_rejects_changes_outside_watched_keys_and_write_delete_overlap(redis_tools, monkeypatch, operation):
    pipe = FakeWatchPipeline()
    monkeypatch.setattr(redis_tools.client, "pipeline", Mock(return_value=pipe))
    writes = {"unwatched": redis_tools.module.RedisValue("value")} if operation == "write" else {}
    deletes = ("unwatched",) if operation == "delete" else ()
    if operation == "overlap":
        writes = {"proof": redis_tools.module.RedisValue("value")}
        deletes = ("proof",)

    with pytest.raises(ValueError):
        asyncio.run(
            redis_tools.cache.transaction(
                ["proof"], lambda snapshot: redis_tools.module.RedisUpdate(writes=writes, deletes=deletes)
            )
        )
    assert all(command[0] not in {"multi", "set", "delete", "execute"} for command in pipe.commands)
    assert pipe.reset_count >= 1


@pytest.mark.parametrize("expiry", [0, -1, True, 1.5, "300"])
def test_transaction_rejects_invalid_expiry_before_multi(redis_tools, monkeypatch, expiry):
    pipe = FakeWatchPipeline()
    monkeypatch.setattr(redis_tools.client, "pipeline", Mock(return_value=pipe))

    with pytest.raises(ValueError):
        asyncio.run(
            redis_tools.cache.transaction(
                ["proof"],
                lambda snapshot: redis_tools.module.RedisUpdate(
                    writes={"proof": redis_tools.module.RedisValue("value", ex=expiry)}
                ),
            )
        )
    assert all(command[0] not in {"multi", "set", "execute"} for command in pipe.commands)
    assert pipe.reset_count >= 1


def test_transaction_cannot_replace_and_preserve_expiry_at_once(redis_tools, monkeypatch):
    pipe = FakeWatchPipeline()
    monkeypatch.setattr(redis_tools.client, "pipeline", Mock(return_value=pipe))

    with pytest.raises(ValueError):
        asyncio.run(
            redis_tools.cache.transaction(
                ["proof"],
                lambda snapshot: redis_tools.module.RedisUpdate(
                    writes={"proof": redis_tools.module.RedisValue("value", ex=300, keepttl=True)}
                ),
            )
        )
    assert all(command[0] not in {"multi", "set", "execute"} for command in pipe.commands)
    assert pipe.reset_count >= 1


def test_transaction_serializes_every_write_before_multi(redis_tools, monkeypatch):
    pipe = FakeWatchPipeline()
    monkeypatch.setattr(redis_tools.client, "pipeline", Mock(return_value=pipe))

    class Unpicklable:
        def __reduce__(self):
            raise ValueError("invalid payload")

    with pytest.raises(ValueError, match="invalid payload"):
        asyncio.run(
            redis_tools.cache.transaction(
                ["first", "second"],
                lambda snapshot: redis_tools.module.RedisUpdate(
                    writes={
                        "first": redis_tools.module.RedisValue({"valid": True}),
                        "second": redis_tools.module.RedisValue(Unpicklable()),
                    }
                ),
            )
        )
    assert all(command[0] not in {"multi", "set", "execute"} for command in pipe.commands)
    assert pipe.reset_count >= 1


def test_transaction_rejects_invalid_raw_payload_before_queueing_any_writes(redis_tools, monkeypatch):
    pipe = FakeWatchPipeline()
    monkeypatch.setattr(redis_tools.client, "pipeline", Mock(return_value=pipe))

    with pytest.raises(DataError):
        asyncio.run(
            redis_tools.cache.transaction(
                ["first", "second"],
                lambda snapshot: redis_tools.module.RedisUpdate(
                    writes={
                        "first": redis_tools.module.RedisValue("valid"),
                        "second": redis_tools.module.RedisValue({"not": "a Redis string"}),
                    }
                ),
                serialize=False,
            )
        )
    assert all(command[0] not in {"multi", "set", "execute"} for command in pipe.commands)
    assert pipe.reset_count >= 1


def test_get_preserves_non_pickle_raw_bytes(redis_tools, monkeypatch):
    raw = b"\xffnot-a-pickle"
    get = AsyncMock(return_value=raw)
    monkeypatch.setattr(redis_tools.client, "get", get)

    assert asyncio.run(redis_tools.cache.get("external")) == raw
    get.assert_awaited_once_with("external")


def test_empty_delete_and_hash_mget_avoid_invalid_redis_commands(redis_tools, monkeypatch):
    delete = AsyncMock(side_effect=AssertionError("empty delete must not reach Redis"))
    hmget = AsyncMock(side_effect=AssertionError("empty HMGET must not reach Redis"))
    monkeypatch.setattr(redis_tools.client, "delete", delete)
    monkeypatch.setattr(redis_tools.client, "hmget", hmget)

    async def run():
        assert await redis_tools.cache.delete() == 0
        assert await redis_tools.cache.hash_mget("hash", []) == []

    asyncio.run(run())
    delete.assert_not_awaited()
    hmget.assert_not_awaited()


@pytest.mark.parametrize("max_length", [0, -1])
def test_list_left_push_rejects_nonpositive_length(redis_tools, monkeypatch, max_length):
    pipeline = Mock(side_effect=AssertionError("invalid length must not open a pipeline"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    with pytest.raises(ValueError, match="max_length"):
        asyncio.run(redis_tools.cache.list_left_push("recent", b"item", max_length=max_length))
    pipeline.assert_not_called()


def test_list_left_push_queues_remove_push_trim_in_one_pipeline(redis_tools, monkeypatch):
    pipe = FakePipeline(results=[0, 1, True])
    pipeline = Mock(return_value=pipe)
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    assert asyncio.run(redis_tools.cache.list_left_push("recent", b"item", max_length=2, serialize=False)) is True
    pipeline.assert_called_once_with(transaction=True)
    assert pipe.commands == [
        ("lrem", ("recent", 0, b"item")),
        ("lpush", ("recent", b"item")),
        ("ltrim", ("recent", 0, 1)),
        ("execute", ()),
    ]


def test_list_left_pop_propagates_unrelated_response_error(redis_tools, monkeypatch):
    lpop = AsyncMock(side_effect=ResponseError("WRONGTYPE Operation against a key holding the wrong kind of value"))
    pipeline = Mock(side_effect=AssertionError("unrelated LPOP errors must not use fallback"))
    monkeypatch.setattr(redis_tools.client, "lpop", lpop)
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    with pytest.raises(ResponseError, match="WRONGTYPE"):
        asyncio.run(redis_tools.cache.list_left_pop("recent", count=2))
    lpop.assert_awaited_once_with("recent", 2)
    pipeline.assert_not_called()


def test_list_left_pop_falls_back_for_older_count_syntax(redis_tools, monkeypatch):
    lpop = AsyncMock(side_effect=ResponseError("wrong number of arguments for 'lpop' command"))
    pipe = FakePipeline(results=[[b"a", b"b"], True])
    pipeline = Mock(return_value=pipe)
    monkeypatch.setattr(redis_tools.client, "lpop", lpop)
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    assert asyncio.run(redis_tools.cache.list_left_pop("recent", count=2, deserialize=False)) == [b"a", b"b"]
    assert pipe.commands == [
        ("lrange", ("recent", 0, 1)),
        ("ltrim", ("recent", 2, -1)),
        ("execute", ()),
    ]
    pipeline.assert_called_once()


def test_list_left_pop_modern_success(redis_tools, monkeypatch):
    lpop = AsyncMock(return_value=[b"a", b"b"])
    monkeypatch.setattr(redis_tools.client, "lpop", lpop)

    assert asyncio.run(redis_tools.cache.list_left_pop("recent", count=2, deserialize=False)) == [b"a", b"b"]
    lpop.assert_awaited_once_with("recent", 2)


@pytest.mark.parametrize("identifier,expire", [("", 60), ("   ", 60), ("user", 0), ("user", -1)])
def test_heartbeat_client_validates_before_redis(redis_tools, monkeypatch, identifier, expire):
    pipeline = Mock(side_effect=AssertionError("invalid heartbeat must not open a pipeline"))
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    with pytest.raises(ValueError):
        asyncio.run(redis_tools.cache.heartbeat_client(identifier=identifier, expire=expire))
    pipeline.assert_not_called()


def test_heartbeat_client_refreshes_key_and_roster(redis_tools, monkeypatch):
    pipe = FakePipeline(results=[1, True])
    pipeline = Mock(return_value=pipe)
    ttl = AsyncMock(return_value=59)
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)
    monkeypatch.setattr(redis_tools.client, "ttl", ttl)

    result = asyncio.run(redis_tools.cache.heartbeat_client(identifier="192.0.2.1", expire=60))

    assert result["employee_id"] == "192.0.2.1"
    datetime.strptime(result["expiry"], "%Y-%m-%d %H:%M:%S")
    assert pipe.commands == [
        ("sadd", ("online_clients", "192.0.2.1")),
        ("set", ("online:192.0.2.1", 1), {"ex": 60}),
        ("execute", ()),
    ]
    ttl.assert_awaited_once_with("online:192.0.2.1")
    pipeline.assert_called_once()


def test_heartbeat_total_counts_live_members_and_removes_stale(redis_tools, monkeypatch):
    smembers = AsyncMock(return_value={b"live", b"stale"})
    srem = AsyncMock(return_value=1)
    pipe = FakePipeline(results=[1, 0])
    pipeline = Mock(return_value=pipe)
    monkeypatch.setattr(redis_tools.client, "smembers", smembers)
    monkeypatch.setattr(redis_tools.client, "srem", srem)
    monkeypatch.setattr(redis_tools.client, "pipeline", pipeline)

    # SMEMBERS returns a set, so line up each EXISTS result with queue order.
    async def execute_for_queued_members():
        pipe.commands.append(("execute", ()))
        return [int(command[1][0] == "online:live") for command in pipe.commands if command[0] == "exists"]

    pipe.execute = execute_for_queued_members
    assert asyncio.run(redis_tools.cache.heartbeat_total()) == 1

    assert {args[0] for name, args in pipe.commands if name == "exists"} == {"online:live", "online:stale"}
    smembers.assert_awaited_once_with("online_clients")
    srem.assert_awaited_once_with("online_clients", "stale")
    pipeline.assert_called_once()


def test_delete_pattern_scans_and_deletes_bounded_batches(redis_tools, monkeypatch):
    """Cache invalidation avoids blocking KEYS or clearing unrelated namespaces."""

    async def scan_iter(**kwargs):
        assert kwargs == {"match": "cache:portfolio:*", "count": 2}
        for key in (b"a", b"b", b"c"):
            yield key

    delete = AsyncMock(side_effect=[2, 1])
    monkeypatch.setattr(redis_tools.client, "scan_iter", scan_iter)
    monkeypatch.setattr(redis_tools.client, "delete", delete)
    assert asyncio.run(redis_tools.cache.delete_pattern("cache:portfolio:*", 2)) == 3
    assert [call.args for call in delete.await_args_list] == [(b"a", b"b"), (b"c",)]
