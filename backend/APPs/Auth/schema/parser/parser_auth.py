# ◆—< Pack >—————————————————————————————————◆ Auth
from APPs.Auth.schema.body import (
    BodyAuthEmail,
    BodyAuthRegister,
    BodyAuthSignIn,
    BodyAuthVerifyEmail,
    validate_auth_email,
)

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Body, HTTPException, Query


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Auth - Sign In
def parser_auth_sign_in(body: BodyAuthSignIn = Body(...)) -> dict:
    """
    Extract the validated credentials for account sign-in.

    :param body: Validated login email and secret password.
    :return: Credentials for the authentication module.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    return {"email": body.email, "password": body.password.get_secret_value()}


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Auth - Email
def parser_auth_email(body: BodyAuthEmail = Body(...)) -> dict:
    """
    Extract the validated email for registration verification.

    :param body: Validated email request.
    :return: The exact login email for the authentication module.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    return {"email": body.email}


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Auth - Email Availability
def parser_auth_email_available(email: str = Query(..., description="Exact login email address.")) -> dict:
    """
    Validate the email query parameter before checking registration availability.

    :param email: Required login address from the query string.
    :return: The unchanged, validated login address.
    :raises HTTPException: The email does not satisfy the account constraints.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    try:
        email = validate_auth_email(email)
    except ValueError:
        raise HTTPException(status_code=400, detail="INVALID_EMAIL") from None
    return {"email": email}


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Auth - Verify Email
def parser_auth_verify_email(body: BodyAuthVerifyEmail = Body(...)) -> dict:
    """
    Extract the email and temporary three-digit verification code.

    :param body: Validated email verification request.
    :return: Verification parameters for the authentication module.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    return {"email": body.email, "code": body.code}


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Auth - Register
def parser_auth_register(body: BodyAuthRegister = Body(...)) -> dict:
    """
    Extract validated credentials for a verified registration.

    :param body: Exact email and secret password with at least eight characters.
    :return: Registration credentials for the authentication module.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    return {"email": body.email, "password": body.password.get_secret_value()}


__all__ = (
    "parser_auth_sign_in",
    "parser_auth_email",
    "parser_auth_email_available",
    "parser_auth_verify_email",
    "parser_auth_register",
)
