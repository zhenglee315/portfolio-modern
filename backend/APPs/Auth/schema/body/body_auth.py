# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

# ◆—< Pack >—————————————————————————————————◆ Python
import re

_AUTH_EMAIL_PATTERN = re.compile(
    r"\A[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+\Z"
)


# ■—< VALIDATE >————————————————————————————————————————————————————————————————————————■ Auth - Email
def validate_auth_email(email: str) -> str:
    """
    Validate a login email using the same address rules as the account table.

    :param email: Exact login address; case and whitespace are preserved.
    :return: The unchanged address after validation.
    :raises ValueError: The address is outside the supported format or length.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    if not isinstance(email, str) or not 5 <= len(email) <= 254:
        raise ValueError("Invalid email address.")
    if not _AUTH_EMAIL_PATTERN.fullmatch(email) or len(email.split("@", 1)[0]) > 64:
        raise ValueError("Invalid email address.")
    return email


# ■—< BODY >————————————————————————————————————————————————————————————————————————————■ Auth - Email
class BodyAuthEmail(BaseModel):
    """Validated login address shared by registration and sign-in requests."""

    model_config = ConfigDict(strict=True, extra="forbid", hide_input_in_errors=True)

    email: str = Field(..., min_length=5, max_length=254, description="Exact login email address.")

    @field_validator("email")
    @classmethod
    def validate_email(cls, email: str) -> str:
        """
        Apply the shared email validator without normalizing the address.

        :param email: Login email from the request body.
        :return: The validated, unchanged email address.
        :raises ValueError: The address does not satisfy the account constraints.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return validate_auth_email(email)


# ■—< BODY >————————————————————————————————————————————————————————————————————————————■ Auth - Sign In
class BodyAuthSignIn(BodyAuthEmail):
    password: SecretStr = Field(
        ..., min_length=1, max_length=1024, description="Account password; whitespace is preserved."
    )

    @field_validator("password")
    @classmethod
    def validate_password(cls, password: SecretStr) -> SecretStr:
        """
        Validate UTF-8 encoding before the password reaches the hashing module.

        :param password: Secret password with its original whitespace preserved.
        :return: The unchanged secret password.
        :raises ValueError: The password contains invalid Unicode surrogate characters.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        try:
            password.get_secret_value().encode("utf-8")
        except UnicodeEncodeError:
            raise ValueError("Password must contain valid Unicode characters.") from None
        return password


# ■—< BODY >————————————————————————————————————————————————————————————————————————————■ Auth - Verify Email
class BodyAuthVerifyEmail(BodyAuthEmail):
    code: str = Field(
        ...,
        min_length=3,
        max_length=3,
        pattern=r"^[0-9]{3}$",
        description="Temporary three-digit verification code (123).",
    )


# ■—< BODY >————————————————————————————————————————————————————————————————————————————■ Auth - Register
class BodyAuthRegister(BodyAuthSignIn):
    password: SecretStr = Field(
        ...,
        min_length=8,
        max_length=1024,
        description="New password with at least eight characters; whitespace is preserved.",
    )


__all__ = ("BodyAuthEmail", "BodyAuthSignIn", "BodyAuthVerifyEmail", "BodyAuthRegister", "validate_auth_email")
