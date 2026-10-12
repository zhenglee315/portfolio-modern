# ◆—< Pack >—————————————————————————————————◆ Python
import re

# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Public User
PUBLIC_USER_PATTERN = r"^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$"
PUBLIC_USER_RESERVED = frozenset(
    (
        "admin",
        "dashboard",
        "login",
        "register",
        "authority",
        "portfolio",
        "api",
        "assets",
        "en",
        "zh-hans",
        "zh-hant",
        "system",
    )
)


# ■—< VALIDATE >————————————————————————————————————————————————————————————————————————■ Public User
def validate_public_user(user: str) -> str:
    """
    Validate the stable account identifier shared by public URLs and API selectors.

    :param user: Lowercase account identifier, without whitespace normalization.
    :return: The unchanged identifier after validation.
    :raises ValueError: The format is invalid or the identifier reserves an application route.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    if not isinstance(user, str) or not re.fullmatch(PUBLIC_USER_PATTERN, user) or user in PUBLIC_USER_RESERVED:
        raise ValueError("Invalid public user identifier.")
    return user


def public_user_candidate(email: str, attempt: int = 1) -> str:
    """
    Derive a legal public identifier while retaining room for a collision suffix.

    :param email: Validated login email; only its local part supplies the initial identifier.
    :param attempt: One for the initial candidate, then two or more for a numeric suffix.
    :return: A legal identifier; the database remains responsible for uniqueness.
    :raises ValueError: The requested collision attempt is not positive.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    if type(attempt) is not int or attempt < 1:
        raise ValueError("The public user attempt must be positive.")
    prefix = re.sub(r"[^a-z0-9_-]+", "-", email.split("@", 1)[0].lower()).strip("-_")[:32].rstrip("-_")
    if len(prefix) < 3 or prefix in PUBLIC_USER_RESERVED:
        prefix = (f"user-{prefix}" if prefix else "user")[:32].rstrip("-_")
    suffix = "" if attempt == 1 else f"-{attempt}"
    return validate_public_user(prefix[: 32 - len(suffix)].rstrip("-_") + suffix)


__all__ = ("PUBLIC_USER_PATTERN", "PUBLIC_USER_RESERVED", "validate_public_user", "public_user_candidate")
