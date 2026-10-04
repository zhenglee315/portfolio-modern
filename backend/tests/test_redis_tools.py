"""Focused behavior tests for the async Redis helper without a Redis server."""

from datetime import datetime
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4
import asyncio
import sys

import pytest
from redis.asyncio import Redis
from redis.exceptions import ResponseError


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
    spec.loader.exec_module(module)
    client = Redis(host="127.0.0.1", port=6379, decode_responses=False)
    yield SimpleNamespace(cache=module.RedisAsync(redis=client), client=client, manager=database.CONN_MANAGER)
    asyncio.run(client.aclose())


class FakePipeline:
    """Record queued commands while exercising RedisAsync's pipeline ownership."""

    def __init__(self, results=()):
        self.commands = []
        self.results = results

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
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

    async def execute(self):
        self.commands.append(("execute", ()))
        return self.results


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
