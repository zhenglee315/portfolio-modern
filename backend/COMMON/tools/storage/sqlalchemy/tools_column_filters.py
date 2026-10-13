"""Apply parser-validated column predicates to a projection before counting or paging."""

from sqlalchemy import String, and_, func, literal, or_
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement

_WHITESPACE = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


class trim_column_text(FunctionElement):
    """Match browser text normalization on PostgreSQL and isolated SQLite tests."""

    type = String()
    inherit_cache = True


@compiles(trim_column_text)
def _trim_text(element, compiler, **kwargs):
    return compiler.process(func.trim(list(element.clauses)[0], literal(_WHITESPACE)), **kwargs)


@compiles(trim_column_text, "postgresql")
def _trim_postgres_text(element, compiler, **kwargs):
    return compiler.process(func.btrim(list(element.clauses)[0], literal(_WHITESPACE)), **kwargs)


def apply_column_filters(stmt, columns: dict, predicates: tuple[dict, ...]):
    """Combine columns with AND; negative comparisons exclude null, which has explicit empty operators."""
    for predicate in predicates:
        expression = columns[predicate["field"]]
        operator, kind = predicate["operator"], predicate["kind"]
        if operator in {"empty", "not_empty"}:
            empty = expression.is_(None)
            if kind == "text":
                empty = or_(empty, trim_column_text(expression) == "")
            condition = empty if operator == "empty" else ~empty
        else:
            value = predicate["value"]
            if predicate.get("day"):
                start, end = value
                on_day = and_(expression >= start, expression < end)
                condition = {
                    "equals": on_day,
                    "not_equals": and_(expression.is_not(None), ~on_day),
                    "gt": expression >= end,
                    "gte": expression >= start,
                    "lt": expression < start,
                    "lte": expression < end,
                }[operator]
            elif operator in {"contains", "not_contains", "starts", "ends"}:
                if operator in {"contains", "not_contains"}:
                    condition = expression.icontains(value, autoescape=True)
                    if operator == "not_contains":
                        condition = and_(expression.is_not(None), ~condition)
                elif operator == "starts":
                    condition = expression.istartswith(value, autoescape=True)
                else:
                    condition = expression.iendswith(value, autoescape=True)
            elif operator in {"in", "not_in"}:
                compared = func.lower(expression) if kind == "text" else expression
                expected = [part.lower() for part in value] if kind == "text" else value
                condition = compared.in_(expected)
                if operator == "not_in":
                    condition = and_(expression.is_not(None), ~condition)
            elif operator in {"equals", "not_equals"}:
                compared = func.lower(expression) if kind == "text" else expression
                expected = value.lower() if kind == "text" else value
                condition = (
                    compared == expected
                    if operator == "equals"
                    else and_(expression.is_not(None), compared != expected)
                )
            elif operator == "between":
                condition = expression.between(*value)
            else:
                condition = {
                    "gt": expression.__gt__,
                    "gte": expression.__ge__,
                    "lt": expression.__lt__,
                    "lte": expression.__le__,
                }[operator](value)
        stmt = stmt.where(condition)
    return stmt
