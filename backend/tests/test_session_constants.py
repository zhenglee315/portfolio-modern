"""Protect the session key contract across enum access, Redis JSON and account schemas."""

import json

import pytest

from APPs.Auth.schema.resp import RespAuthUser
from SYSTEM.constants import AUTH_PERMISSION_FIELDS, EnumSess
from test_auth_architecture import sign_in


def test_session_enum_covers_the_public_account_schema_and_permission_fields():
    """A new public account field must also have a central session key definition."""
    public_fields = set(RespAuthUser.model_fields)
    assert all(EnumSess(field).value == field for field in public_fields)
    assert all(isinstance(field, EnumSess) for field in AUTH_PERMISSION_FIELDS)
    assert set(AUTH_PERMISSION_FIELDS) == {field for field in public_fields if field.startswith("is_")}
    assert {EnumSess.AUTH_IDENTITY, EnumSess.AUTH_REGISTRATION, EnumSess.CHALLENGE_ID, EnumSess.PASSWORD}.isdisjoint(
        public_fields
    )


def test_enum_keys_round_trip_through_the_existing_session_json_format():
    """Native string keys loaded from Redis must support enum reads and updates."""
    # Literal keys deliberately model data written before EnumSess was introduced.
    legacy_json = (
        '{"id":1,"auth_identity":"proof","auth_registration":{"email":"pending@example.com","challenge_id":"abc"}}'
    )
    payload = json.loads(legacy_json)
    assert payload[EnumSess.ID] == 1
    assert payload[EnumSess.AUTH_IDENTITY] == "proof"
    assert payload[EnumSess.AUTH_REGISTRATION][EnumSess.EMAIL] == "pending@example.com"
    assert payload[EnumSess.AUTH_REGISTRATION][EnumSess.CHALLENGE_ID] == "abc"
    payload[EnumSess.ID] = 2
    payload[EnumSess.AUTH_REGISTRATION][EnumSess.CHALLENGE_ID] = "new"
    restored = json.loads(json.dumps(payload))
    assert restored == {
        "id": 2,
        "auth_identity": "proof",
        "auth_registration": {"email": "pending@example.com", "challenge_id": "new"},
    }
    assert json.loads(json.dumps({field: True for field in AUTH_PERMISSION_FIELDS})) == dict.fromkeys(
        (field.value for field in AUTH_PERMISSION_FIELDS), True
    )


@pytest.mark.parametrize("invalid_identity", [False, True])
def test_legacy_cookie_session_refresh_and_cleanup_preserve_registration(auth_client, invalid_identity):
    """Exercise real middleware with native JSON keys, legacy secrets and pending registration."""
    identity = sign_in(auth_client)
    cookie = auth_client.cookies["session"]
    store = auth_client.app.state.store
    payload = json.loads(store.data[cookie])
    registration = {"email": "pending@example.com", "challenge_id": "a" * 32}
    payload["auth_registration"] = registration
    payload["password"] = "legacy-secret"
    if invalid_identity:
        payload["id"] = "invalid"
    store.data[cookie] = json.dumps(payload).encode()

    response = auth_client.get("/authority/session")
    assert response.status_code == 200
    assert response.json() == (None if invalid_identity else identity)
    assert auth_client.cookies["session"] == cookie
    stored = json.loads(store.data[cookie])
    assert stored[EnumSess.AUTH_REGISTRATION] == registration
    assert EnumSess.PASSWORD not in stored
    if invalid_identity:
        assert set(stored).isdisjoint(RespAuthUser.model_fields)
        assert EnumSess.AUTH_IDENTITY not in stored
    else:
        assert {field: stored[field] for field in RespAuthUser.model_fields} == identity
        assert EnumSess.AUTH_IDENTITY in stored
