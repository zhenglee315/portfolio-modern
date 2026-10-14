"""Apply one literal, case-insensitive OR search before counting and pagination."""

from sqlalchemy import Boolean, DateTime, String, case, cast, func, literal, or_


def apply_table_search(stmt, columns: dict, search: dict | None):
    """Search scalar projection values; null stays absent, and LIKE wildcards remain literal."""
    if not search:
        return stmt
    conditions = []
    for field in search["fields"]:
        expression = columns[field]
        if isinstance(expression.type, Boolean):
            text = case(
                (expression.is_(True), literal("true")),
                (expression.is_(False), literal("false")),
                else_=None,
            )
        else:
            text = cast(expression, String)
        conditions.append(text.icontains(search["term"], autoescape=True))
        if isinstance(expression.type, DateTime):
            # The UI shows UTC dates with dots; ISO dates remain searchable as well.
            conditions.append(func.replace(text, "-", ".").icontains(search["term"], autoescape=True))
    return stmt.where(or_(*conditions))
