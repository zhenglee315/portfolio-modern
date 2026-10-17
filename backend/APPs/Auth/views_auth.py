# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Auth.module import (
    AuthRegisterModule,
    AuthSessionModule,
    AuthSignInModule,
    AuthSignOutModule,
)
from APPs.Auth.schema.parser import (
    parser_auth_email,
    parser_auth_email_available,
    parser_auth_register,
    parser_auth_sign_in,
    parser_auth_verify_email,
)
from APPs.Auth.schema.resp import (
    RespAuthCode,
    RespAuthEmailAvailability,
    RespAuthEmailVerified,
    RespAuthSignOut,
    RespAuthUser,
)

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.tools import FastApiRouter, cbv
from SYSTEM.urls import PreFix, RouteAuth, Tags

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute


# ■—< ROUTE >——————————————————————————————————————————————————————————————————————————■ Auth - Validation
class AuthRoute(APIRoute):
    """
    Sanitize authentication validation errors and disable response caching.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def get_route_handler(self):
        """
        Wrap the standard handler with sanitized request validation errors.

        :return: A handler that preserves validation locations, types and messages.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        route_handler = super().get_route_handler()

        async def handle(request: Request):
            """
            Apply one shared validation and cache policy to every authentication route.

            :param request: Current authentication HTTP request.
            :return: Original response with Cache-Control set to no-store.
            :raises HTTPException: Validation fails or the original operation rejects the request.

                                                                                               ♂ ZhengLee 2026.10.11
            """
            try:
                response = await route_handler(request)
            except RequestValidationError as error:
                detail = [{"loc": item["loc"], "type": item["type"], "msg": item["msg"]} for item in error.errors()]
                raise HTTPException(
                    status_code=422,
                    detail=detail,
                    headers={"Cache-Control": "no-store"},
                ) from None
            except HTTPException as error:
                error.headers = {**(error.headers or {}), "Cache-Control": "no-store"}
                raise

            response.headers["Cache-Control"] = "no-store"
            return response

        return handle


router = FastApiRouter(prefix=PreFix.AUTH, tags=Tags.AUTH, route_class=AuthRoute)


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Auth - Session
@cbv(router)
class AuthSession:
    """
    Restore current database-backed account permissions through a class-based view.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    path = RouteAuth.SESSION

    @router.get(
        path,
        summary="Restore Current Account Session",
        description=(
            "Restore the signed-in account and its current role permissions from the server-side session.\n\n"
            "📨 **Request:**\n"
            "- Send `GET /authority/session` with the browser's existing session cookie.\n"
            "- This endpoint has no query parameters or request body.\n\n"
            "🗂️ **How It Works:**\n"
            "- Reads the account primary key `id` from `SESSION`; the client does not supply an account ID.\n"
            "- Queries the current account and assigned role through the ORM; both must have `is_active=true`.\n"
            "- Returns the current email, public `user`, role, and all seven permission flags from the database.\n"
            "- Guests, invalid session identities, missing accounts, and inactive accounts or roles return `null`.\n\n"
            "🔐 **Session:**\n"
            "- Keep the same session cookie issued by Sign In or Register; browser requests must include credentials.\n"
            "- Refreshes the identity and permission fields in `SESSION` without replacing the session ID.\n"
            "- Removes invalid authentication fields while preserving unrelated registration session data.\n"
            "- Passwords and password hashes are never returned or stored in the authentication session.\n\n"
            "⚡ **Caching:**\n"
            "- Returns `Cache-Control: no-store`; there is no `is_caching` option or shared response cache.\n"
            "- A valid session identity reads the database so role and account changes take effect on this request.\n\n"
            "📦 **Response Format:**\n"
            "- An enabled signed-in account returns status 200 and this direct object:\n"
            "```json\n"
            "{\n"
            '  "id": 1, "email": "developer@example.com", "user": "developer", "role": "editor",\n'
            '  "is_create": true, "is_read": true, "is_update": true, "is_delete": true,\n'
            '  "is_manage_roles": false, "is_manage_users": false, "is_manage_sites": false\n'
            "}\n"
            "```\n"
            "- A guest or invalid identity also returns status 200:\n"
            "```json\n"
            "null\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- Permission values reflect the assigned role; the object above is an example.\n"
            "- Session storage failures return 503 `AUTH_STORAGE_UNAVAILABLE`.\n"
            "- Account database failures return 503 `AUTH_DATABASE_UNAVAILABLE`."
        ),
        response_model=RespAuthUser | None,
    )
    async def current_session(self, request: Request) -> dict | None:
        """
        Delegate restoration of the current server-side account identity and permissions.

        :param request: HTTP request carrying the server-side session cookie.
        :return: Current account details and permissions, or None for a guest.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return await AuthSessionModule(request=request).current_session()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Auth - Sign In
@cbv(router)
class AuthSignIn:
    """
    Delegate credential verification, SESSION initialization, and successful login recording.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    path = RouteAuth.SIGN_IN

    @router.post(
        path,
        summary="Sign In and Initialize Account Session",
        description=(
            "Authenticate an enabled account with its email and password, then initialize its authorization session.\n\n"
            "📨 **Request:**\n"
            "- Send `POST /authority/sign-in` with a JSON body containing only `email` and `password`.\n"
            "- `email` accepts supported ASCII addresses of 5–254 characters, with at most 64 characters before `@`.\n"
            "- Email matching is exact and case-sensitive; whitespace is not trimmed and makes an email invalid.\n"
            "- `password` accepts 1–1024 valid Unicode characters; its case and whitespace are preserved.\n"
            "```json\n"
            '{"email": "developer@example.com", "password": "ExamplePass123!"}\n'
            "```\n\n"
            "🗂️ **How It Works:**\n"
            "- Selects the account and its assigned role through the ORM, then verifies the Argon2id password hash.\n"
            "- Both the account and its role must have `is_active=true` before sign-in succeeds.\n"
            "- Unknown emails, incorrect passwords, inactive accounts, and inactive roles share the same 401 response.\n"
            "- Each successful sign-in inserts one `record_login` row with the account ID and a database-generated UTC timestamp.\n"
            "- The same event captures the trusted-proxy-normalized request IP and available local GeoIP City data.\n"
            "- Missing/unavailable geographic data remains null with a status; it does not block sign-in.\n"
            "- IP/location are server-owned and are not accepted in the sign-in body.\n"
            "- Failed sign-ins and session restoration requests do not create login records.\n"
            "- Allows up to 30 sign-in attempts per request client IP in a fixed 60-second window.\n"
            "- Successful and failed sign-ins share this allowance; further attempts do not extend the window.\n\n"
            "🔐 **Session:**\n"
            "- On success, invalidates the previous session and issues a replacement authenticated session cookie.\n"
            "- Stores `id`, `email`, `user`, `role`, and all seven permission flags in `SESSION` for subsequent requests.\n"
            "- Keep that cookie and include browser credentials when calling the other Auth APIs.\n"
            "- Passwords and password hashes are never returned or stored in `SESSION`.\n\n"
            "⚡ **Caching:**\n"
            "- Returns `Cache-Control: no-store`; authentication responses are not shared or browser-cached.\n"
            "- The System Redis cache holds the fixed-window sign-in attempt counter, not a cached account response.\n\n"
            "📦 **Response Format:**\n"
            "- Successful authentication returns status 200 and a direct account object:\n"
            "```json\n"
            "{\n"
            '  "id": 1, "email": "developer@example.com", "user": "developer", "role": "editor",\n'
            '  "is_create": true, "is_read": true, "is_update": true, "is_delete": true,\n'
            '  "is_manage_roles": false, "is_manage_users": false, "is_manage_sites": false\n'
            "}\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- Permission values come from the assigned role; the object above is an example.\n"
            "- Invalid credentials return 401 `INVALID_CREDENTIALS`.\n"
            "- Excess attempts return 429 `TOO_MANY_SIGN_IN_ATTEMPTS`, with remaining seconds in `Retry-After`.\n"
            "- Missing, invalid, or unexpected body fields return 422 without echoing submitted credentials.\n"
            "- If the login record cannot be saved, returns 503 and clears the newly prepared authenticated session.\n"
            "- Database failures return 503 `AUTH_DATABASE_UNAVAILABLE`; session or Redis failures return 503 `AUTH_STORAGE_UNAVAILABLE`."
        ),
        response_model=RespAuthUser,
    )
    async def sign_in(self, request: Request, params: dict = Depends(parser_auth_sign_in)) -> dict:
        """
        Delegate account authentication and session initialization to the module.

        :param request: HTTP request carrying the server-side session.
        :param params: Validated email and password.
        :return: Authenticated account details and permissions.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return await AuthSignInModule(request=request, **params).sign_in()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Auth - Sign Out
@cbv(router)
class AuthSignOut:
    """
    Delegate current SESSION removal without requiring account credentials.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    path = RouteAuth.SIGN_OUT

    @router.post(
        path,
        summary="Sign Out and Clear Current Account Session",
        description=(
            "Sign out the current browser session and remove its server-side authentication data.\n\n"
            "📨 **Request:**\n"
            "- Send `POST /authority/sign-out` with the browser's current session cookie.\n"
            "- This endpoint has no query parameters or request body; no email or password is required.\n"
            "- Browser requests must include credentials so the correct session is removed.\n\n"
            "🗂️ **How It Works:**\n"
            "- Loads the current session and removes its record through the configured System Redis session store.\n"
            "- Clears every `SESSION` field, including account identity, all permissions, and pending registration data.\n"
            "- Returns success for guests and repeated sign-out requests as well as signed-in accounts.\n"
            "- Does not change the account, its role, or sessions belonging to other browsers.\n\n"
            "🔐 **Session:**\n"
            "- Expires an incoming session cookie after the stored session has been removed.\n"
            "- Does not create a replacement authenticated or guest session.\n"
            "- A subsequent `GET /authority/session` returns `null`, including when the old cookie is replayed.\n"
            "- Registration must request and verify a new code because the previous session-bound proof is no longer accessible.\n\n"
            "⚡ **Caching:**\n"
            "- Returns `Cache-Control: no-store`; sign-out responses are not shared or browser-cached.\n"
            "- Removes only the current session record; unrelated System cache entries remain available.\n\n"
            "📦 **Response Format:**\n"
            "- Successful session clearing returns status 200:\n"
            "```json\n"
            '{"signed_out": true}\n'
            "```\n\n"
            "📝 **Notes:**\n"
            "- No active account or role is required to clear the current session.\n"
            "- Session storage failures handled by this operation return 503 `AUTH_STORAGE_UNAVAILABLE`.\n"
            "- Sign-in is required to establish a new authenticated session after signing out."
        ),
        response_model=RespAuthSignOut,
    )
    async def sign_out(self, request: Request) -> dict:
        """
        Delegate current session invalidation and clearing to the authentication module.

        :param request: HTTP request carrying the browser's current session cookie.
        :return: Confirmation that the current session has been cleared.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return await AuthSignOutModule(request=request).sign_out()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Auth - Register
@cbv(router)
class AuthRegister:
    """
    Organize email availability, verification, and account registration through class-based views.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    path = RouteAuth.REGISTER

    @router.get(
        path,
        summary="Check Registration Email Availability",
        description=(
            "Check whether an email is available before requesting a registration verification code.\n\n"
            "📨 **Request:**\n"
            "- Send `GET /authority/register?email=developer%40example.com` with the required `email` query parameter.\n"
            "- Accepts supported ASCII addresses of 5–254 characters, with at most 64 characters before `@`.\n"
            "- Email matching is exact and case-sensitive; casing is preserved and surrounding whitespace is invalid.\n"
            "- URL-encode the query value so characters such as `+` remain part of the email address.\n\n"
            "🗂️ **How It Works:**\n"
            "- Checks whether any account already owns the exact email through the ORM.\n"
            "- Active and inactive accounts both reserve their email and return `available=false`.\n"
            "- An unused email returns `available=true`; no account, code, or reservation is created.\n\n"
            "🔐 **Session:**\n"
            "- This availability check does not sign in an account or create a registration proof.\n"
            "- Continue with Confirm Email, Verify Email, and Register using the same browser session.\n\n"
            "⚡ **Caching:**\n"
            "- Returns `Cache-Control: no-store` and queries the database for the current reservation state.\n"
            "- There is no `is_caching` option or shared response cache.\n\n"
            "📦 **Response Format:**\n"
            "- Both available and reserved emails return status 200:\n"
            "```json\n"
            '{"email": "developer@example.com", "available": true}\n'
            "```\n"
            "- An existing account returns the same shape with `available=false`.\n\n"
            "📝 **Notes:**\n"
            "- Availability is checked again when requesting a code and creating an account.\n"
            "- An invalid email returns 400 `INVALID_EMAIL`; a missing email parameter returns 422.\n"
            "- Account database failures return 503 `AUTH_DATABASE_UNAVAILABLE`."
        ),
        response_model=RespAuthEmailAvailability,
    )
    async def email_available(self, request: Request, params: dict = Depends(parser_auth_email_available)) -> dict:
        """
        Delegate the registration email availability query.

        :param request: HTTP request carrying the server-side session.
        :param params: Validated email query parameter.
        :return: Email and whether it is available for registration.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return await AuthRegisterModule(request=request, **params).email_available()

    @router.post(
        RouteAuth.CONFIRM_EMAIL,
        summary="Send Registration Email Verification Code",
        description=(
            "Create a session-bound verification code for an available registration email.\n\n"
            "📨 **Request:**\n"
            "- Send `POST /authority/confirm-email` with a JSON body containing only `email`.\n"
            "- Accepts supported ASCII addresses of 5–254 characters, with at most 64 characters before `@`.\n"
            "- Email matching is exact and case-sensitive; casing is preserved and surrounding whitespace is invalid.\n"
            "```json\n"
            '{"email": "developer@example.com"}\n'
            "```\n\n"
            "🗂️ **How It Works:**\n"
            "- Checks that neither an active nor an inactive account already reserves the email.\n"
            "- Uses the temporary three-digit code `123` while SMTP is being prepared; no email is sent in this mode.\n"
            "- Creates the code and its verification proof with an original validity of 300 seconds.\n"
            "- Enforces a 60-second resend delay per exact email; a successful resend supersedes the previous proof.\n"
            "- The response reports timing information and does not return the verification code.\n\n"
            "🔐 **Session:**\n"
            "- Stores the registration email and its server-generated challenge identifier in `SESSION`.\n"
            "- Keep the session cookie and use the same browser session for Verify Email and Register.\n"
            "- Browser requests must include credentials so the registration session is retained.\n"
            "- Requesting a code does not create or sign in an account.\n\n"
            "⚡ **Caching:**\n"
            "- Uses `EnumCache.SYS` to store the raw code at `verify_<email>` with a 300-second expiry.\n"
            "- The matching verification proof and resend cooldown are maintained in the same System cache.\n"
            "- Returns `Cache-Control: no-store`; the HTTP response is not a shared cached response.\n\n"
            "📦 **Response Format:**\n"
            "- Successful code creation returns status 202:\n"
            "```json\n"
            '{"expires_in": 300, "retry_after": 60}\n'
            "```\n\n"
            "📝 **Notes:**\n"
            "- An already reserved email returns 409 `EMAIL_ALREADY_EXISTS`.\n"
            "- Resending too soon returns 429 `CODE_REQUEST_TOO_FREQUENT`, with remaining seconds in `Retry-After`.\n"
            "- Missing, invalid, or unexpected body fields return 422 without echoing submitted inputs.\n"
            "- Database failures return 503 `AUTH_DATABASE_UNAVAILABLE`; session or Redis failures return 503 `AUTH_STORAGE_UNAVAILABLE`."
        ),
        status_code=202,
        response_model=RespAuthCode,
    )
    async def send_code(self, request: Request, params: dict = Depends(parser_auth_email)) -> dict:
        """
        Delegate temporary verification code creation in the System cache.

        :param request: HTTP request carrying the registration session.
        :param params: Validated email request.
        :return: Code expiration and resend delay in seconds.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return await AuthRegisterModule(request=request, **params).send_code()

    @router.post(
        RouteAuth.VERIFY_EMAIL,
        summary="Verify Registration Email Code",
        description=(
            "Verify the registration email code within the session that requested it.\n\n"
            "📨 **Request:**\n"
            "- Send `POST /authority/verify-email` with a JSON body containing only `email` and `code`.\n"
            "- Use the exact email from Confirm Email; supported ASCII addresses are 5–254 characters with a local part of at most 64 characters.\n"
            "- Email casing is preserved, matching is case-sensitive, and surrounding whitespace is invalid.\n"
            "- `code` must be a string of exactly three ASCII digits; the current temporary code is `123`.\n"
            "```json\n"
            '{"email": "developer@example.com", "code": "123"}\n'
            "```\n\n"
            "🗂️ **How It Works:**\n"
            "- Checks the session's registration challenge, exact email, latest code owner, and cached raw code.\n"
            "- A matching code marks this challenge as verified so Register can use its proof.\n"
            "- Five incorrect code submissions before successful verification invalidate the code and proof.\n"
            "- Repeating the correct code after verification succeeds for the same unclaimed challenge.\n"
            "- Verification does not create an account or extend the original 300-second validity period.\n\n"
            "🔐 **Session:**\n"
            "- Include the same session cookie issued when Confirm Email created the challenge.\n"
            "- A different session or a different exact email cannot use the registration proof.\n"
            "- Keep the cookie for the subsequent Register request; verification alone does not sign in an account.\n\n"
            "⚡ **Caching:**\n"
            "- Reads `verify_<email>` and its matching proof from `EnumCache.SYS`.\n"
            "- Proof updates preserve the remaining expiry; a proof can complete only one registration.\n"
            "- Returns `Cache-Control: no-store`; verification responses are not shared or browser-cached.\n\n"
            "📦 **Response Format:**\n"
            "- Successful verification returns status 200:\n"
            "```json\n"
            '{"email": "developer@example.com", "verified": true}\n'
            "```\n\n"
            "📝 **Notes:**\n"
            "- A missing session challenge or mismatched email returns 400 `EMAIL_VERIFICATION_REQUIRED`.\n"
            "- A wrong, expired, superseded, or already claimed code returns 400 `INVALID_VERIFICATION_CODE`.\n"
            "- Missing, invalid, or unexpected body fields return 422 without echoing the submitted code.\n"
            "- Session or Redis failures return 503 `AUTH_STORAGE_UNAVAILABLE`."
        ),
        response_model=RespAuthEmailVerified,
    )
    async def verify_email(self, request: Request, params: dict = Depends(parser_auth_verify_email)) -> dict:
        """
        Delegate code verification for this registration session and email.

        :param request: HTTP request carrying the code request session.
        :param params: Validated email and code.
        :return: The verified email and confirmation status.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return await AuthRegisterModule(request=request, **params).verify_email()

    @router.post(
        path,
        summary="Register Verified Account and Initialize Session",
        description=(
            "Create an account for a verified registration email and sign it in with the configured default role.\n\n"
            "📨 **Request:**\n"
            "- Complete Confirm Email and Verify Email first, then send `POST /authority/register`.\n"
            "- The JSON body contains `email`, `password`, and optional `user`; the verified code is not submitted again.\n"
            "- Use the same exact email: a supported ASCII address of 5–254 characters with at most 64 characters before `@`.\n"
            "- Email matching is case-sensitive; casing is preserved and surrounding whitespace is invalid.\n"
            "- `password` must contain 8–1024 valid Unicode characters, inclusive; its case and whitespace are preserved.\n"
            "```json\n"
            '{"email": "developer@example.com", "password": "ExamplePass123!"}\n'
            "```\n\n"
            "🗂️ **How It Works:**\n"
            "- Requires this session's verified, unexpired, latest registration proof for the exact email.\n"
            "- Checks email uniqueness across active and inactive accounts and hashes the password with Argon2id.\n"
            "- Creates an active account using the role currently marked `is_default=true` and `is_active=true`.\n"
            "- Optional `user` chooses a stable public identifier; omission allocates the email prefix and resolves collisions with a suffix.\n"
            "- Public identifiers use 3–32 lowercase letters, digits, underscores, or hyphens, with alphanumeric ends; reserved routes are unavailable.\n"
            "- A requested identifier already in use returns 409 `USER_ALREADY_EXISTS`; changing email later keeps this identifier.\n"
            "- The default role must have `is_manage_roles=false`, `is_manage_users=false`, and `is_manage_sites=false`; the client cannot choose its role.\n"
            "- Saves the account through the ORM and consumes the verification proof after successful account creation.\n\n"
            "🔐 **Session:**\n"
            "- Include the same session cookie used by Confirm Email and Verify Email.\n"
            "- On success, replaces the registration session with a new authenticated session cookie.\n"
            "- Stores `id`, `email`, `user`, `role`, and all seven permission flags in `SESSION` for subsequent requests.\n"
            "- Passwords and password hashes are never returned or stored in the authentication session.\n\n"
            "⚡ **Caching:**\n"
            "- Uses the System Redis proof within its original 300-second validity; verification does not reset its expiry.\n"
            "- The proof can be claimed by only one concurrent registration and is consumed after successful creation.\n"
            "- Returns `Cache-Control: no-store`; account responses are not shared or browser-cached.\n\n"
            "📦 **Response Format:**\n"
            "- Successful account creation and sign-in return status 201:\n"
            "```json\n"
            "{\n"
            '  "id": 2, "email": "developer@example.com", "user": "developer", "role": "editor",\n'
            '  "is_create": true, "is_read": true, "is_update": true, "is_delete": true,\n'
            '  "is_manage_roles": false, "is_manage_users": false, "is_manage_sites": false\n'
            "}\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- The role and permission flags come from the configured default role; `editor` is an example.\n"
            "- A missing, unverified, expired, superseded, or claimed proof returns 400 `EMAIL_VERIFICATION_REQUIRED`.\n"
            "- An already reserved email returns 409 `EMAIL_ALREADY_EXISTS`, including a concurrent registration conflict.\n"
            "- After a database failure, the proof claim is released for retry when Redis is available; its expiry is not reset.\n"
            "- Missing, invalid, or unexpected body fields return 422 without echoing the submitted password.\n"
            "- No eligible enabled default role returns 503 `REGISTRATION_UNAVAILABLE`.\n"
            "- Database failures return 503 `AUTH_DATABASE_UNAVAILABLE`; session or Redis failures return 503 `AUTH_STORAGE_UNAVAILABLE`."
        ),
        status_code=201,
        response_model=RespAuthUser,
    )
    async def register(self, request: Request, params: dict = Depends(parser_auth_register)) -> dict:
        """
        Delegate verified registration and initial session creation.

        :param request: HTTP request carrying the verified registration session.
        :param params: Validated email and new password.
        :return: Registered account details and permissions.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return await AuthRegisterModule(request=request, **params).register()
