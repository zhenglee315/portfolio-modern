"""Synchronous Redis access for non-async owners such as supervisor threads."""

from redis import Redis
from redis.backoff import NoBackoff
from redis.retry import Retry


class RedisSync:
    """Borrow an injected client, or own a client created through from_config()."""

    def __init__(self, redis: Redis, *, owns_client: bool = False):
        if not isinstance(redis, Redis):
            raise TypeError("RedisSync requires a redis.Redis client.")
        self.redis = redis
        self.owns_client = owns_client

    @classmethod
    def from_config(cls, config: dict, *, socket_connect_timeout=0.5, socket_timeout=0.5):
        """Create a disconnected client with bounded I/O and no automatic retries."""
        return cls(
            Redis(
                host=config["HOST"],
                port=config["PORT"],
                db=config["DB"],
                socket_connect_timeout=socket_connect_timeout,
                socket_timeout=socket_timeout,
                retry=Retry(NoBackoff(), 0),
            ),
            owns_client=True,
        )

    def pipeline(self):
        """Return a raw transactional pipeline; the caller executes and closes it."""
        return self.redis.pipeline(transaction=True)

    def close(self):
        """Close only a client created by this adapter, preserving borrowed pools."""
        if self.owns_client:
            self.redis.close()
