"""Validate bounded substring search without accepting SQL expressions from clients."""

import json
from fastapi import HTTPException


def parse_table_search(term: str | None, raw_fields: str | None, fields: dict) -> dict | None:
    """Return a validated OR scope; blank text removes search without altering column predicates."""

    def invalid():
        raise HTTPException(status_code=400, detail="INVALID_SEARCH")

    if term is not None and (not isinstance(term, str) or len(term) > 200):
        invalid()
    selected = [field for field in fields if field != "locale"]
    if raw_fields is not None:
        if len(raw_fields) > 4096:
            invalid()
        try:
            selected = json.loads(raw_fields)
        except (ValueError, TypeError):
            invalid()
    if (
        not isinstance(selected, list)
        or not selected
        or len(selected) > len(fields)
        or any(not isinstance(field, str) or field not in fields for field in selected)
        or len(set(selected)) != len(selected)
    ):
        invalid()
    normalized = (term or "").strip()
    return {"term": normalized, "fields": tuple(selected)} if normalized else None
