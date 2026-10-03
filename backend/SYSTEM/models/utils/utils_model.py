# ◆—< Pack >—————————————————————————————————◆ Models
from SYSTEM.models import *

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy.sql import ColumnElement, literal_column
from sqlalchemy.orm import DeclarativeMeta

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Any, List, Type, Optional, Dict, Mapping, Union
from datetime import timedelta
import builtins
import re

_HUMAN_TOKEN = re.compile(r'(?P<num>\d+)\s*(?P<Unit>w(ee)?k|d(ay)?|h(our)?|m(in(ute)?)?|s(ec(ond)?)?)', re.IGNORECASE)


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Build Conditions
def model_where_cond(
    model: Optional[Type[DeclarativeMeta]] = None,
    multiple: bool = True,
    pattern: str = ',',
    range_suffix: bool = True,
    **filters: Any,
) -> List[ColumnElement]:
    """
    Dynamically builds SQLAlchemy ORM WHERE clause filter conditions, supporting
    equality, IN, range, LIKE (fuzzy), and INTERVAL queries.

    Usage Examples:
        - file_name_like='keyword'         → case-insensitive LIKE search on `file_name`
        - created_at_start='2024-01-01'    → `created_at >= '2024-01-01'`
        - created_at_end='2024-12-31'      → `created_at <= '2024-12-31'`
        - region='A,B,C'                   → IN query on `region` for ['A','B','C']
        - schedule_interval='7 days'       → INTERVAL comparison on `schedule_interval`
        - is_active=True                   → Boolean equality

    :param model:         (Optional) SQLAlchemy ORM model class for single-table queries.
                          If None, keys must be prefixed like 'ModelName__field'.
    :param multiple:      If True, split string values containing `pattern` into IN lists.
    :param pattern:       Delimiter used to split string values for IN queries.
    :param range_suffix:  Enable '_start'/'_end' suffixes for range (>=, <=) filters.
    :param filters:       Arbitrary key–value pairs as query filters.
                          - Keys ending in '_like' perform LIKE searches.
                          - Keys ending in '_interval' perform INTERVAL comparisons.
                          - Keys ending in '_start' or '_end' perform >= or <= filters.
                          - Other string values containing `pattern` become IN lists.
                          - Boolean values use `.is_(value)`.
    :return:             List of SQLAlchemy ColumnElement objects for WHERE clauses.
                                                                                              ♂ Wilson 2025.05.29
    """
    conditions: List[ColumnElement] = []

    # ------------------------------------------------------------● Find model class from current global
    def find_model_class(name: str) -> Optional[Type[DeclarativeMeta]]:
        """
        Try globals, then builtins, then locals if needed.
        :param name: Model name.
        :return: Type[DeclarativeMeta] | None
        """

        scope = globals()
        if name in scope:
            return scope[name]
        if hasattr(builtins, name):
            return getattr(builtins, name)
        return None

    for key, value in filters.items():
        # -------------------------------------------------------● Skip if value is None or empty string
        if value is None or (isinstance(value, str) and not value.strip()):
            continue

        # -------------------------------------------------------● Multi-model: key in 'Model__field' format
        if '__' in key:
            model_name, field_key = key.split('__', 1)
            model_cls = find_model_class(model_name)
            if not model_cls:
                raise AttributeError(
                    f"Model class '{model_name}' not found in current scope. " f"Please 'from SYSTEM.models import *'"
                )
        # -------------------------------------------------------● Single model: use given model
        else:
            if model is None:
                raise ValueError("You must provide 'model' parameter for single-table queries.")
            model_cls = model
            field_key = key

        # -------------------------------------------------------● Suffix - Like
        if field_key.endswith('_like'):
            field_name = field_key[:-5]
            operator = 'like'
        # -------------------------------------------------------● Suffix - Range (_start/_end)
        elif range_suffix and field_key.endswith('_start'):
            field_name = field_key[:-6]
            operator = '>='
        elif range_suffix and field_key.endswith('_end'):
            field_name = field_key[:-4]
            operator = '<='
        # -------------------------------------------------------● Suffix - IS NOT
        elif field_key.endswith('_isnot'):
            field_name = field_key[:-6]
            operator = 'not'
        # -------------------------------------------------------● Suffix - Interval
        elif field_key.endswith('_intvl'):
            # remove the '_interval' suffix to get the real column name
            field_name = field_key[:-6]
            # mark this as an interval comparison
            operator = 'interval'
        else:
            field_name = field_key
            if isinstance(value, (list, set, tuple)):
                operator = 'in'
            elif multiple and isinstance(value, str) and pattern in value:
                operator = 'in'
            else:
                operator = '=='
        # -------------------------------------------------------● Retrieve column from model class
        column = None
        if hasattr(model_cls, "c"):
            cols = getattr(model_cls, "c")
            if field_name in cols:
                column = cols[field_name]
        if column is None and hasattr(model_cls, field_name):
            column = getattr(model_cls, field_name)
        if column is None:
            raise AttributeError(
                f"Model '{getattr(model_cls, '__name__', type(model_cls).__name__)}' " f"has no column '{field_name}'."
            )
        # -------------------------------------------------------● Build the condition
        if operator == 'like':
            conditions.append(column.ilike(f"%{value}%"))
        elif operator == '>=':
            conditions.append(column >= value)
        elif operator == '<=':
            conditions.append(column <= value)
        elif operator == 'in':
            cond_list = value if isinstance(value, (list, set, tuple)) else value.split(pattern)
            items = [v.strip() if isinstance(v, str) else v for v in cond_list if v is not None and str(v).strip()]
            if items:
                conditions.append(column.in_(items))
        elif operator == 'interval':
            """
            Compare Postgres INTERVAL column by inlining a literal interval constant.
            This generates SQL like: column = 'P1M'::interval
            """
            conditions.append(column == literal_column(f"'{value}'::interval"))
        elif operator == 'not':
            conditions.append(column.isnot(value))
        else:
            """
            Boolean type → .is_() instead of ==
            """
            if isinstance(value, bool):
                conditions.append(column.is_(value))
            else:
                conditions.append(column == value)
    return conditions


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Model Interval
def model_parse_interval(val: Any) -> timedelta:
    """
    Supported:
      - timedelta → returned as-is
      - int/float → seconds
      - strings like "1 week", "2 days", "3h", "45min", "30 s", "1 day 2h30m"
    Not supported:
      - months/years semantics (use pgproto.Interval if needed)
    """
    if isinstance(val, timedelta):
        return val
    if isinstance(val, (int, float)):
        return timedelta(seconds=float(val))
    if not isinstance(val, str):
        raise TypeError(f"Unsupported interval type: {type(val)!r}")

    s = val.strip()
    total = timedelta(0)
    for m in _HUMAN_TOKEN.finditer(s):
        n = float(m.group('num'))
        u = m.group('Unit').lower()
        if u.startswith('w'):
            total += timedelta(days=7 * n)
        elif u.startswith('d'):
            total += timedelta(days=n)
        elif u.startswith('h'):
            total += timedelta(hours=n)
        elif u.startswith('m'):
            total += timedelta(minutes=n)
        elif u.startswith('s'):
            total += timedelta(seconds=n)

    if total.total_seconds() > 0:
        return total
    raise ValueError(f"Unrecognized interval string: {val!r}")


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Build Insert
def model_insert_values(
    values: Union[Dict[str, Any], List[Dict[str, Any]]], *, is_null: bool = False, strip_str: bool = True
) -> List[Dict[str, Any]]:
    """
    Dynamically builds normalized INSERT payload(s) from dict or list of dicts,
    filtering out empty values depending on `is_null`.

    Usage Examples:
        - {'name': 'Room A', 'factory_id': None, 'desc': '  '}
          with is_null=False → {'name': 'Room A'}
        - [{'name': 'Room B', 'desc': ''}, {'name': 'Room C', 'tags': []}]
          with is_null=True  → [{'name': 'Room B', 'desc': ''}, {'name': 'Room C', 'tags': []}]
        - {'schedule_interval_intvl': '1 week'}  → {'schedule_interval': timedelta(days=7)}

    :param values:    Input data (dict or list of dicts).
                       Each dict represents one row to insert.
    :param is_null:    Whether to keep null/empty values.
                       - False (default): drop None, empty string, empty container.
                       - True: keep all values as-is, including None and empty.
    :param strip_str:  Whether to apply `.strip()` before testing empty string.
                       - True (default): "   " → empty.
                       - False: "   " preserved as non-empty.
    :return:           List[Dict[str, Any]] normalized for INSERT statements.

    Notes:
        - Boolean False and numeric 0 are preserved (treated as valid values).
        - timedelta(0) is preserved (treated as a valid value).
        - Empty container types ([]/{} etc.) are removed if is_null=False.
                                                                                  ♂ Wilson 2025.08.25
    """

    # ------------------------------------------------------------● Helper: define "empty" value
    def is_empty_value(value: Any) -> bool:
        """
        Rules for empty value:
            - None → empty
            - str → empty if "" or (strip == "" when strip_str=True)
            - list/tuple/set/dict/bytes/bytearray → empty if len == 0
            - 0, False, timedelta(0) → NOT empty (kept)
        """
        if value is None:
            return True
        if isinstance(value, str):
            return (value.strip() == "") if strip_str else (value == "")
        if isinstance(value, (list, tuple, set, dict, bytes, bytearray)):
            return len(value) == 0
        # everything else (including 0, False, timedelta) is considered non-empty
        return False

    # ------------------------------------------------------------● Normalize input into list
    rows: List[Dict[str, Any]] = values if isinstance(values, list) else [values]

    result: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, Mapping):
            raise TypeError(f"Each item must be a dict, got {type(row)!r}")

        # --------------------------------------------------------● Stage 1: clone & normalize (strip strings)
        tmp: Dict[str, Any] = {}
        for k, v in row.items():
            if isinstance(v, str) and strip_str:
                v = v.strip()
            tmp[k] = v

        # --------------------------------------------------------● Stage 2: handle *_intvl → overwrite base key + drop temporary key
        intvl_keys = [k for k in tmp.keys() if k.endswith('_intvl')]
        for k in intvl_keys:
            base_key = k[:-6]  # remove "_intvl"
            raw_val = tmp.get(k)

            if raw_val is None:
                if is_null:
                    tmp[base_key] = None
                tmp.pop(k, None)
                continue

            if isinstance(raw_val, str) and strip_str and raw_val == "":
                if is_null:
                    tmp[base_key] = None
                tmp.pop(k, None)
                continue

            tmp[base_key] = model_parse_interval(raw_val)
            tmp.pop(k, None)

        # --------------------------------------------------------● Stage 3: final keep/drop by is_null
        if is_null:
            # keep everything (including None and empties)
            new_row = dict(tmp)
        else:
            # drop empty values, keep valid ones
            new_row: Dict[str, Any] = {}
            for k, v in tmp.items():
                if not is_empty_value(v):
                    new_row[k] = v

        result.append(new_row)

    return result


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Build Update
def model_update_values(
    values: Dict[str, Any] | List[Dict[str, Any]], *, keep_null: bool = False, strip_str: bool = True
) -> Dict[str, Any]:
    """
    Build a single UPDATE payload (dict) from dict or list-of-dicts.
    - Reuses model_insert_values for normalization & *_intvl parsing.
    - Drops empty values by default (keep_null=False).
    - Removes 'createuser' by default.
    """
    rows = model_insert_values(values, is_null=keep_null, strip_str=strip_str)
    payload = rows[0] if rows else {}
    payload.pop('createuser', None)
    return payload
