# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database import CONN_MANAGER
from SYSTEM.settings import TIME_ZONE

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.exceptions import RedisError, ResponseError
from redis.asyncio import Redis

# ◆—< Pack >—————————————————————————————————◆ Standard
from typing import Any, Optional, Callable, Awaitable, List
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import pickle


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Redis execution
class RedisAsync:
    """
    Wrap async pooled Redis commands with serialization and heartbeat helpers.

    An injected redis= client takes priority; otherwise key= resolves the manager client.
    The manager or injecting caller owns client/pool shutdown. Ordinary commands use the
    client's pool directly; pipelines belong to their operation and must be executed.
    Pickled values require binary responses and a trusted producer. Existing command,
    pagination, list, scan, TTL, pipeline, and heartbeat interfaces are retained.

                                                                                               ♂ ZhengLee 2026.10.03
    """

    def __init__(self, key: Optional[str] = None, redis: Redis = None):
        """
        Select an injected async Redis client or resolve one by its manager key.

        :param key: Cache identifier used only when redis is not supplied.
        :param redis: Optional redis.asyncio.Redis; the injecting caller owns its shutdown.
        :return: None; this constructor does not borrow a connection or ping the server.
        :raises KeyError: No manager client exists for the requested key.
        :raises TypeError: The selected client is not an async Redis client.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        self.redis: Redis = redis if redis is not None else CONN_MANAGER.get_cache(key=key)
        if not isinstance(self.redis, Redis):
            raise TypeError("RedisAsync requires a redis.asyncio.Redis client.")
        self._heartbeat_set = "online_clients"
        self._heartbeat_predix = "online"

    @staticmethod
    def _serialize(value: Any, serialize: bool = True) -> Any:
        """
        Pickle a trusted Python value unless serialization is disabled.

        :param value: Value to encode; raw values must be accepted by redis-py.
        :param serialize: If False, return value unchanged.
        :return: Pickle bytes or the original value.
        :raises Exception: Pickle encoding errors propagate to the caller.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return pickle.dumps(value) if serialize else value

    @staticmethod
    def _deserialize(value: Any, deserialize: bool = True) -> Any:
        """
        Decode pickle bytes; leave None, non-bytes, and disabled decoding unchanged.

        Only ValueError is caught by the current implementation. UnpicklingError,
        EOFError, and missing-class/import errors can propagate for raw or stale data.
        Only deserialize values written by a trusted producer.

        :param value: Cached value, normally bytes when decode_responses=False.
        :param deserialize: Whether to attempt pickle decoding for bytes.
        :return: Decoded object, or the original value when decoding is skipped.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if value is not None and deserialize:
            try:
                return pickle.loads(value) if isinstance(value, bytes) else value
            except ValueError:
                return value
        return value

    async def _execute(self, func: Callable[..., Awaitable[Any]], *args, **kwargs) -> Any:
        """
        Execute one bound Redis command through its client's normal pool handling.

        :param func: Bound awaitable command on the selected Redis client.
        :param args: Positional command arguments.
        :param kwargs: Keyword command arguments.
        :return: Original command result; no unrelated single-client connection is acquired.
        :raises RedisError: Original Redis failure, without unrelated DISCARD masking it.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return await func(*args, **kwargs)

    # —< Command >—————————————————————————————————————————● SET
    async def set(self, key: str, value: Any, ex: Optional[int] = None, serialize: bool = True) -> bool:
        """
        Set a Redis string value, optionally pickled, with an expiry in seconds.

        ● Guide:
            cache = RedisAsync(key=EnumCache.WEB)
            await cache.set("user:1", {"id": 123}, ex=3600)

        :param key: Redis key to create or replace.
        :param value: Python value to pickle, or a Redis-compatible raw value.
        :param ex: Positive expiry seconds; None writes without an expiry.
        :param serialize: Whether to pickle value before storing it.
        :return: True on successful SET. Replacing a key also replaces its previous TTL.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        to_store = self._serialize(value, serialize=serialize)
        return await self._execute(self.redis.set, key, to_store, ex=ex)

    # —< Command >—————————————————————————————————————————● GET
    async def get(self, key: str, deserialize: bool = True) -> Any:
        """
        Read a Redis string and optionally decode its pickle payload.

        ● Guide:
            value = await cache.get("user:1")
            raw_value = await cache.get("external:key", deserialize=False)

        :param key: Redis key.
        :param deserialize: Enable only for trusted pickle data; raw bytes may fail decoding.
        :return: Decoded/raw value, or None when the key does not exist.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        data = await self._execute(self.redis.get, key)
        return self._deserialize(data, deserialize=deserialize)

    # —< Command >—————————————————————————————————————————● GET by key
    async def get_by_key(self, key: str, method: str, deserialize: bool = True) -> Any:
        """
        Read a Redis string stored under the composite key '<key>:<method>'.

        ● Guide:
            value = await cache.get_by_key(key="device:1", method="raw", deserialize=True)

        :param key: Base Redis key.
        :param method: Suffix appended after a colon; not a Redis command name.
        :param deserialize: Whether to decode a trusted pickle payload.
        :return: Decoded/raw value, or None when the composite key does not exist.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        data = await self._execute(self.redis.get, f"{key}:{method}")
        return self._deserialize(data, deserialize=deserialize)

    # —< Command >—————————————————————————————————————————● DELETE
    async def delete(self, *keys: str) -> int:
        """
        Delete one or more Redis keys.

        ● Guide:
            removed = await cache.delete("user:1", "user:2")

        :param keys: One or more keys; an empty argument list is not handled locally.
        :return: Number of keys actually removed, excluding missing keys.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return await self._execute(self.redis.delete, *keys)

    # —< Command >—————————————————————————————————————————● Hash - SET
    async def hash_set(self, name: str, key: str, value: Any, serialize: bool = True) -> int:
        """
        Create or replace a single Redis hash field.

        ● Guide:
            added = await cache.hash_set("user:1:profile", "info", {"age": 20})

        :param name: Redis hash key.
        :param key: Field name within the hash.
        :param value: Python value to pickle or a Redis-compatible raw value.
        :param serialize: Whether to pickle the field value.
        :return: 1 for a newly added field; 0 for an existing field, even when changed.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        val = self._serialize(value, serialize=serialize)
        return await self._execute(self.redis.hset, name, key, val)

    # —< Command >—————————————————————————————————————————● Hash - GET
    async def hash_get(self, name: str, key: str, deserialize: bool = True) -> Any:
        """
        Read one Redis hash field, optionally decoding its pickle payload.

        :param name: Redis hash key.
        :param key: Field name within the hash.
        :param deserialize: Whether to decode trusted pickle bytes.
        :return: Decoded/raw field value, or None for a missing field/hash.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        data = await self._execute(self.redis.hget, name, key)
        return self._deserialize(data, deserialize=deserialize)

    # —< Command >—————————————————————————————————————————● Hash - DEL
    async def hash_del(self, name: str, key: str) -> int:
        """
        Delete one field from a Redis hash.

        :param name: Redis hash key.
        :param key: Field name to remove.
        :return: 1 when removed, or 0 when the field does not exist.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return await self._execute(self.redis.hdel, name, key)

    # —< Command >—————————————————————————————————————————● Hash - Multi-GET
    async def hash_mget(self, name: str, keys: list, deserialize: bool = True) -> list:
        """
        Read multiple hash fields in the requested order.

        :param name: Redis hash key.
        :param keys: Non-empty list of field names; empty input is not handled locally.
        :param deserialize: Whether to decode trusted pickle bytes per field.
        :return: Ordered list of values, with None for each missing field.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        values = await self._execute(self.redis.hmget, name, *keys)
        return [self._deserialize(v, deserialize=deserialize) for v in values]

    # —< Command >—————————————————————————————————————————● List - LPUSH / LPOP / LREM / LTRIM
    async def list_left_push(self, key: str, value: Any, max_length: int = 100, serialize: bool = True) -> bool:
        """
        Move a serialized value to the list head and trim in one transaction.

        LREM compares stored bytes, not Python object equality. Runtime errors during
        EXEC do not roll back other commands. A positive max_length is required by
        the intended contract but is not validated; zero produces LTRIM 0 -1.

        ● Guide:
            await cache.list_left_push("recent:logins", user_obj, max_length=100)

        :param key: Redis list key.
        :param value: Value to remove from existing positions and push to the head.
        :param max_length: Intended positive maximum number of retained elements.
        :param serialize: Whether to pickle value before matching and storing it.
        :return: True after successful execution of LREM, LPUSH, and LTRIM.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        val = self._serialize(value, serialize=serialize)
        async with self.redis.pipeline(transaction=True) as pipe:
            await pipe.lrem(key, 0, val)  # Remove duplicates
            await pipe.lpush(key, val)  # Left push
            await pipe.ltrim(key, 0, max_length - 1)
            await pipe.execute()
        return True

    # —< Command >—————————————————————————————————————————● List - LPOP
    async def list_left_pop(self, key: str, count: int = 1, deserialize: bool = True) -> list:
        """
        Remove up to count values from the left of a Redis list.

        Try LPOP with COUNT (Redis 6.2+), then use transactional LRANGE/LTRIM on
        ResponseError. The fallback currently catches every ResponseError, not only
        unsupported COUNT syntax. Nonpositive counts return an empty list.

        :param key: Redis list key.
        :param count: Maximum number of values to remove.
        :param deserialize: Whether to decode trusted pickle bytes after removal.
        :return: List of removed values, or [] when no values are available.
        :raises Exception: Command or decoding errors; decoding occurs after removal.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if count <= 0:
            return []
        try:
            # Try modern Redis 6.2+: LPOP key COUNT
            res = await self._execute(self.redis.lpop, key, count)
            if res is None:
                return []
            items = [res] if isinstance(res, (bytes, bytearray)) else list(res)

        except ResponseError:
            # Fallback for older Redis (no COUNT support)
            async with await self.pipeline() as pipe:
                await pipe.lrange(key, 0, count - 1)
                await pipe.ltrim(key, count, -1)
                res_preview, _ = await pipe.execute()
            items = res_preview or []

        return [self._deserialize(i, deserialize=deserialize) for i in items]

    # —< Command >—————————————————————————————————————————● List - LRANGE
    async def list_range(self, key: str, start: int = 0, end: int = -1, deserialize: bool = True) -> list:
        """
        Read a Redis list range without removing its values.

        :param key: Redis list key.
        :param start: Inclusive start index; negative indexes count from the tail.
        :param end: Inclusive end index; -1 includes the last element.
        :param deserialize: Whether to decode trusted pickle bytes.
        :return: List of values, or [] for a missing key or empty range.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        items = await self._execute(self.redis.lrange, key, start, end)
        return [self._deserialize(i, deserialize=deserialize) for i in items]

    # —< Command >—————————————————————————————————————————● List - FIRST
    async def list_first(self, key: str, deserialize: bool = True) -> Any:
        """
        Read the first list element without removing it.

        :param key: Redis list key.
        :param deserialize: Whether to decode trusted pickle bytes.
        :return: First decoded/raw value, or None when the list is absent.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        items = await self._execute(self.redis.lrange, key, 0, 0)
        return self._deserialize(items[0], deserialize=deserialize) if items else None

    # —< Command >—————————————————————————————————————————● INCR (Increment integer)
    async def incr(self, key: str, amount: int = 1) -> int:
        """
        Atomically add an integer amount to a Redis integer string.

        :param key: Key containing an unpickled integer string; missing keys start at zero.
        :param amount: Signed integer increment.
        :return: Updated integer value.
        :raises RedisError: Non-integer data, wrong Redis type, or integer overflow.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return await self._execute(self.redis.incrby, key, amount)

    # —< Command >—————————————————————————————————————————● TYPE
    async def type(self, key: str) -> str:
        """
        Read the Redis storage type for a key.

        :param key: Redis key.
        :return: Type name such as 'string', 'list', or 'none' for a missing key.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        tp = await self._execute(self.redis.type, key)
        return tp.decode() if isinstance(tp, bytes) else str(tp)

    # —< Command >—————————————————————————————————————————● TTL
    async def ttl(self, key: str) -> int:
        """
        Read a key's remaining expiry in seconds.

        :param key: Redis key.
        :return: Nonnegative remaining seconds, -1 for no expiry, or -2 for a missing key.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return await self._execute(self.redis.ttl, key)

    # —< Command >—————————————————————————————————————————● SCAN/SCAN_ITER
    async def scan_iter(self, match: str = "*", count: int = 100) -> list:
        """
        Collect a complete SCAN iteration into memory as decoded key names.

        SCAN is not a snapshot and may return duplicate keys during iteration.
        COUNT is a work hint, not a result limit. UTF-8 decoding assumes text keys.

        :param match: Redis glob pattern passed through unchanged.
        :param count: Work hint for each SCAN call.
        :return: List of all yielded key names; duplicates are not removed.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        keys = []
        async for k in self.redis.scan_iter(match=match, count=count):
            keys.append(k.decode() if isinstance(k, bytes) else k)
        return keys

    # —< Command >—————————————————————————————————————————● EXISTS
    async def exists(self, key: str) -> bool:
        """
        Check whether a single Redis key exists at the time of the command.

        :param key: Redis key.
        :return: True when the key exists, otherwise False.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        result = await self._execute(self.redis.exists, key)
        return bool(result)

    # —< Command >—————————————————————————————————————————● EXISTS - Scan
    async def exists_scan(self, match: str = "*") -> bool:
        """
        Check the first SCAN result using the expanded pattern '*<match>*'.

        The added wildcards perform a contains-style match, so 'user:*' can also
        match 'backup:user:1'. An empty key is treated as False by the current code.

        :param match: Redis glob fragment, wrapped in leading and trailing '*'.
        :return: Boolean value of the first returned key, or False when no key is yielded.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        exists = False
        async for k in self.redis.scan_iter(match=f"*{match}*"):
            exists = bool(k)
            break
        return exists

    # —< Command >—————————————————————————————————————————● KEYS (List keys by pattern)
    async def keys(self, pattern: str = "*") -> list:
        """
        Fetch every key matching a Redis glob pattern with KEYS.

        KEYS scans the selected database in one command and can block Redis on a
        large keyspace. Use scan_iter for incremental server work when appropriate.

        :param pattern: Redis glob pattern passed through unchanged.
        :return: List of UTF-8-decoded key names; assumes keys contain UTF-8 text.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        keys = await self._execute(self.redis.keys, pattern)
        return [k.decode() if isinstance(k, bytes) else k for k in keys]

    # —< Command >—————————————————————————————————————————● Flush (Dangerous!)
    async def flush(self) -> bool:
        """
        Delete every key in the selected logical Redis database using FLUSHDB.

        This affects other applications sharing the same database, regardless of
        their key prefixes. It does not delete other logical databases.

        :return: True when Redis accepts FLUSHDB.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return await self._execute(self.redis.flushdb)

    # —< Command >—————————————————————————————————————————● Pipeline/Transaction (multi)
    async def pipeline(self):
        """
        Create a transactional pipeline; the caller must execute queued commands.

        ● Guide:
            async with (await cache.pipeline()) as pipe:
                pipe.set("foo", "bar")
                pipe.incr("baz")
                results = await pipe.execute()

        Leaving the context resets queued commands; it does not execute them.
        Redis transactions do not undo commands already executed after runtime errors.

        :return: redis.asyncio Pipeline with the client's default transaction=True.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return self.redis.pipeline()

    # —< Command >—————————————————————————————————————————● EXPIRE
    async def expire(self, key: str, ex: int) -> bool:
        """
        Assign an expiry in seconds to an existing Redis key.

        :param key: Redis key.
        :param ex: Expiry seconds; zero or a negative value deletes an existing key.
        :return: True when applied, or False when the key does not exist.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return await self._execute(self.redis.expire, key, ex)

    # —< Command >—————————————————————————————————————————● Health/Expire Statistics
    async def expire_stat(self, match: str = "*") -> dict:
        """
        Collect TTL observations and summarize nonnegative remaining lifetimes.

        Scan all matching keys, then request each TTL sequentially. This requires
        memory proportional to matched keys and is not a consistent snapshot.
        Persistent and disappeared keys remain in overview but not in the aggregates.

        :param match: Redis glob pattern forwarded to scan_iter.
        :return: Dict with avg/max/min (None without timed keys) and per-key overview.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        keys = await self.scan_iter(match=match)
        key_ttl_dict = {}
        for key in keys:
            ttl = await self.ttl(key)
            key_ttl_dict[key] = ttl if ttl >= 0 else "no expiry" if ttl == -1 else "key does not exist"
        ttl_values = [v for v in key_ttl_dict.values() if isinstance(v, int)]
        if not ttl_values:
            return {"avg": None, "max": None, "min": None, "overview": key_ttl_dict}
        return {
            "avg": sum(ttl_values) / len(ttl_values),
            "max": max(ttl_values),
            "min": min(ttl_values),
            "overview": key_ttl_dict,
        }

    # —< Command >—————————————————————————————————————————● Heartbeat (Set user online status)
    async def heartbeat_client(
        self, identifier: str, expire: int = 60, set_key: str = "online_clients", key_prefix: str = "online"
    ) -> dict:
        """
        Refresh a heartbeat TTL key and add its identifier to the roster set.

        SADD and SET run in one transaction; runtime command errors do not roll back
        other commands. The later TTL read is separate. A nonpositive observed TTL
        currently falls back to expire when computing the displayed expiry.

        ● Guide:
            result = await cache.heartbeat_client(identifier="123456", expire=60)
            # {"employee_id": "123456", "expiry": "2026-09-26 11:08:30"}

        :param identifier: Nonempty identifier; converted to str after the truthiness check.
        :param expire: Intended positive TTL seconds for the heartbeat key.
        :param set_key: Redis set holding identifiers; stale entries do not expire automatically.
        :param key_prefix: Prefix of '<key_prefix>:<identifier>' heartbeat keys.
        :return: employee_id and estimated expiry in TIME_ZONE without a UTC offset.
        :raises RuntimeError: If identifier is false, including integer zero.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if not identifier:
            raise

        identifier = str(identifier)
        hb_key = f"{key_prefix}:{identifier}"

        async with await self.pipeline() as pipe:
            await pipe.sadd(set_key, identifier)
            await pipe.set(hb_key, 1, ex=expire)
            await pipe.execute()

        ttl = await self.redis.ttl(hb_key)
        ttl = max(0, int(ttl)) if isinstance(ttl, (int, float)) else expire

        now = datetime.now(tz=ZoneInfo(TIME_ZONE))
        expiry = now + timedelta(seconds=ttl if ttl > 0 else expire)
        return {"employee_id": identifier, "expiry": expiry.strftime("%Y-%m-%d %H:%M:%S")}

    # —< Command >—————————————————————————————————————————● Heartbeat total (Online user count)
    async def heartbeat_total(self, set_key: str = "online_clients", key_prefix: str = "online") -> int:
        """
        Count observed heartbeat keys and remove roster entries observed as absent.

        SMEMBERS, transactional EXISTS, and SREM run as separate operations. A renewal
        between EXISTS and SREM can leave a live heartbeat missing from the roster.
        The result is an observation, not an atomic snapshot of all online users.

        :param set_key: Redis set containing heartbeat identifiers.
        :param key_prefix: Prefix used when checking each identifier's heartbeat key.
        :return: Number of heartbeat keys observed as present, or zero for an empty roster.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        user_ids = await self.redis.smembers(set_key)
        user_ids: List[str] = [u.decode() if isinstance(u, (bytes, bytearray)) else str(u) for u in user_ids]

        if not user_ids:
            return 0

        async with await self.pipeline() as pipe:
            for uid in user_ids:
                await pipe.exists(f"{key_prefix}:{uid}")
            exists_results = await pipe.execute()  # [0/1, 0/1, ...]

        alive, expired = [], []
        for uid, exists in zip(user_ids, exists_results):
            (alive if int(exists) > 0 else expired).append(uid)

        if expired:
            await self.redis.srem(set_key, *expired)

        return len(alive)
