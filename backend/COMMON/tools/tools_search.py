# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Any


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Recursive Search
async def search_recursive(data: list | dict, target_key: str) -> Any:
    """
    Find the first matching key in nested dictionaries and lists.

    :param data: Dictionary or list to inspect recursively.
    :param target_key: Key to locate in a nested dictionary.
    :return: Matching value, or None when the key is absent.

                                                                                               ♂ ZhengLee 2026.10.04
    """
    if isinstance(data, dict):
        if target_key in data:
            return data[target_key]
        for value in data.values():
            found_value = await search_recursive(value, target_key)
            if found_value is not None:
                return found_value

    elif isinstance(data, list):
        for item in data:
            found_value = await search_recursive(item, target_key)
            if found_value is not None:
                return found_value

    return None
