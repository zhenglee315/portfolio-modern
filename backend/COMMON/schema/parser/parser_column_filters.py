"""Validate typed column predicates without depending on a resource or database model."""

import json
import math
from datetime import datetime, timedelta, timezone
import re
from fastapi import HTTPException

TEXT_OPERATORS = {"contains", "not_contains", "equals", "not_equals", "starts", "ends", "empty", "not_empty"}
ORDER_OPERATORS = {"equals", "not_equals", "gt", "gte", "lt", "lte", "between"}


def parse_column_filters(raw: str, fields: dict) -> tuple[dict, ...]:
    """Parse one bounded predicate per allowlisted field; return database-ready values."""

    def invalid():
        raise HTTPException(status_code=400, detail="INVALID_FILTERS")

    if len(raw) > 16384:
        invalid()
    try:
        predicates = json.loads(raw)
    except (ValueError, TypeError):
        invalid()
    if not isinstance(predicates, list) or len(predicates) > len(fields):
        invalid()
    result, seen = [], set()
    for predicate in predicates:
        if not isinstance(predicate, dict) or set(predicate) - {"field", "operator", "value"}:
            invalid()
        field, operator = predicate.get("field"), predicate.get("operator")
        if not isinstance(field, str) or field not in fields or field in seen or not isinstance(operator, str):
            invalid()
        seen.add(field)
        spec = fields[field]
        kind = spec["type"]
        allowed = set(
            TEXT_OPERATORS
            if kind == "text"
            else ORDER_OPERATORS if kind in {"number", "date"} else {"equals", "not_equals"}
        )
        if spec.get("nullable") or kind == "date":
            allowed |= {"empty", "not_empty"}
        if kind in {"text", "enum"} and spec.get("sets"):
            allowed |= {"in", "not_in"}
        if operator not in allowed:
            invalid()
        item = {"field": field, "operator": operator, "kind": kind}
        if operator in {"empty", "not_empty"}:
            if predicate.get("value") is not None:
                invalid()
            result.append(item)
            continue

        def normalize(value):
            if kind in {"text", "enum"}:
                if not isinstance(value, str) or not value or len(value) > 200:
                    invalid()
                if kind == "enum" and value not in spec["options"]:
                    invalid()
                return value
            if kind == "boolean":
                if not isinstance(value, bool):
                    invalid()
                return value
            if kind == "number":
                if (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or abs(value) > 9007199254740991
                    or not math.isfinite(value)
                ):
                    invalid()
                if spec.get("integer", True) and int(value) != value:
                    invalid()
                if not spec.get("minimum", -9007199254740991) <= value <= spec.get("maximum", 9007199254740991):
                    invalid()
                return value
            if not isinstance(value, str) or len(value) > 40:
                invalid()
            try:
                timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if timestamp.tzinfo is None:
                    invalid()
                return timestamp.astimezone(timezone.utc)
            except (ValueError, OverflowError):
                invalid()

        value = predicate.get("value")
        if kind == "date" and isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            if operator == "between":
                invalid()
            try:
                start = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                end = start + timedelta(days=1)
            except (ValueError, OverflowError):
                invalid()
            result.append({**item, "value": [start, end], "day": True})
            continue
        if operator in {"in", "not_in"}:
            if not isinstance(value, list) or len(value) > 100:
                invalid()
            value = [normalize(part) for part in value]
            unique = {part.lower() if kind == "text" else part for part in value}
            if len(unique) != len(value):
                invalid()
        elif operator == "between":
            if not isinstance(value, list) or len(value) != 2:
                invalid()
            value = [normalize(part) for part in value]
            if value[0] > value[1]:
                invalid()
        else:
            value = normalize(value)
        result.append({**item, "value": value})
    return tuple(result)
