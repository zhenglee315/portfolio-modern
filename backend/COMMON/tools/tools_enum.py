# ◆—< Pack >—————————————————————————————————◆ Python
from enum import Enum, IntEnum, StrEnum
from typing import cast

__all__ = ["EnumUtils", "IntEnumUtils"]


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Shared enum utilities
class _EnumValuesMixin:
    """
    Share raw-value representation and value retrieval across typed enum bases.

    This mixin is intended for Enum subclasses, not standalone instances.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    def __repr__(self) -> str:
        """
        Represent the member using repr() of its underlying value.

        This affects diagnostic output, including dictionary representations;
        equality, hashing, and serialization follow the enum's underlying type.

        :return: The raw value's representation, including quotes for strings.

                                                                                               ♂ ZhengLee 2026.09.26
        """
        return repr(cast(Enum, self).value)

    @classmethod
    def values(cls) -> list[str | int]:
        """
        Return the enum's raw values in member definition order.

        Aliases are omitted, matching standard Enum iteration. Each call returns
        a new list; changing the list does not change the enum.

        :return: String values for EnumUtils or integer values for IntEnumUtils.
                 An empty enum base returns an empty list.

                                                                                               ♂ ZhengLee 2026.09.26
        """
        return [member.value for member in cast(type[Enum], cls)]


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ String enum
class EnumUtils(_EnumValuesMixin, StrEnum):
    """
    Define string constants with raw-value display and a shared values() method.

    Members behave as strings; str(member) and formatting use the raw value.
    Explicit member values must be strings, as required by StrEnum. Use
    IntEnumUtils for numeric constants instead of mixing string and integer data.

                                                                                               ♂ ZhengLee 2026.09.26
    """


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Integer enum
class IntEnumUtils(_EnumValuesMixin, IntEnum):
    """
    Define integer constants with raw-value display and a shared values() method.

    Members follow standard IntEnum behavior: comparisons and arithmetic use
    integer values, and arithmetic results are ordinary integers, not members.
    str(member) and formatting use the numeric value.

                                                                                               ♂ ZhengLee 2026.09.26
    """
