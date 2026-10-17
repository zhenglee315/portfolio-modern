"""Deployment migrations target PostgreSQL; SQLite remains a tool/test adapter."""


def require_migration_backend(backend: str) -> None:
    """Reject unsupported full-schema migrations before a connection or any DDL.

    Historical revisions use PostgreSQL regex constraints, partial indexes and
    ownership backfills. SQLite support in ConnectionManager does not promise
    that those deployment revisions can run on SQLite.
    """
    if backend != "postgresql":
        raise ValueError(
            "Full application migrations require PostgreSQL. "
            "SQLite is supported only for isolated storage/model tests; no schema was changed."
        )
