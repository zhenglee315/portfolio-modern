"""Verify login snapshots, offline MMDB operations, migrations and protected history reads."""

from datetime import datetime, timezone
from importlib import import_module, util
from pathlib import Path
from types import SimpleNamespace
import socket

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import delete, select, update

from test_auth_architecture import sign_in
from test_management_permission import change, expect_private

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "GeoIP2-City-Test.mmdb"


@pytest.fixture
def geoip(auth_client):
    return import_module("SYSTEM.tools.tools_geoip")


def no_network(*args, **kwargs):
    raise AssertionError("IP/location collection attempted a network call")


def test_real_city_database_resolves_ipv4_and_ipv6_offline(geoip, monkeypatch):
    monkeypatch.setattr(socket.socket, "connect", no_network)
    reader = geoip.GeoIpReader(FIXTURE)
    assert reader.open() is True
    try:
        result = reader.lookup("81.2.69.142")
        assert result.record_values() == dict(
            ip_address="81.2.69.142",
            country_code="GB",
            region="England",
            city="London",
            geo_status="resolved",
        )
        assert reader.lookup("::ffff:81.2.69.142") == result
        ipv6 = reader.lookup("2001:218::")
        assert ipv6.ip_address == "2001:218::" and ipv6.country_code == "JP"
        assert ipv6.geo_status == "resolved"
        assert reader.lookup("8.8.8.8").geo_status == "not_found"
    finally:
        reader.close()
        reader.close()


@pytest.mark.parametrize(
    "address,status,normalized",
    [
        (None, "unknown", None),
        ("not-an-ip", "unknown", None),
        ("0.0.0.0", "unknown", None),
        ("::", "unknown", None),
        ("2001:218::%eth0", "unknown", None),
        ("8.8.8.8:80", "unknown", None),
        ("127.0.0.1", "non_public", "127.0.0.1"),
        ("10.0.0.2", "non_public", "10.0.0.2"),
        ("::1", "non_public", "::1"),
        ("224.0.0.1", "non_public", "224.0.0.1"),
        (" 8.8.8.8 ", "unavailable", "8.8.8.8"),
    ],
)
def test_unavailable_and_nonpublic_addresses_never_contact_network(geoip, monkeypatch, address, status, normalized):
    monkeypatch.setattr(socket.socket, "connect", no_network)
    result = geoip.GeoIpReader().lookup(address)
    assert (result.ip_address, result.geo_status) == (normalized, status)
    assert result.country_code is result.region is result.city is None


def test_missing_and_corrupt_mmdb_do_not_prevent_login(geoip, auth_client, tmp_path):
    for path in (tmp_path / "missing.mmdb", tmp_path / "bad.mmdb"):
        if path.name == "bad.mmdb":
            path.write_bytes(b"corrupt")
        reader = geoip.GeoIpReader(path)
        assert reader.open() is False
        auth_client.app.state.geoip_reader = reader
        assert (
            auth_client.post(
                "/authority/sign-in",
                json={"email": "owner@example.com", "password": "12345678"},
            ).status_code
            == 200
        )


def test_login_records_trusted_asgi_ip_and_ignores_spoofed_headers(geoip, auth_client, monkeypatch):
    reader = geoip.GeoIpReader(FIXTURE)
    assert reader.open()
    auth_client.app.state.geoip_reader = reader
    modules = import_module("APPs.Auth.module.module_sign_in")
    # A proxy normalizes ASGI client before application code. Spoofed HTTP headers
    # must never override that established peer inside the authentication module.
    monkeypatch.setattr(modules, "net_client_ip", lambda *, request: "81.2.69.142")
    monkeypatch.setattr(socket.socket, "connect", no_network)
    try:
        response = auth_client.post(
            "/authority/sign-in",
            json={"email": "owner@example.com", "password": "12345678"},
            headers={"X-Forwarded-For": "8.8.8.8", "X-Real-IP": "8.8.8.8"},
        )
        assert response.status_code == 200

        async def read():
            async with auth_client.app.state.sessions() as session:
                rows = (await session.scalars(select(auth_client.app.state.models.RecordLogin))).all()
                return [
                    dict(
                        id=row.id,
                        user_id=row.user_id,
                        ip_address=row.ip_address,
                        country_code=row.country_code,
                        region=row.region,
                        city=row.city,
                        geo_status=row.geo_status,
                    )
                    for row in rows
                ]

        rows = auth_client.portal.call(read)
        assert len(rows) == 1
        assert rows[0] == dict(
            id=1,
            user_id=1,
            ip_address="81.2.69.142",
            country_code="GB",
            region="England",
            city="London",
            geo_status="resolved",
        )
        assert "ip_address" not in response.json()
        assert auth_client.get("/authority/session").status_code == 200
        assert len(auth_client.portal.call(read)) == 1
        assert (
            auth_client.post(
                "/authority/sign-in",
                json={"email": "owner@example.com", "password": "wrong"},
            ).status_code
            == 401
        )
        assert len(auth_client.portal.call(read)) == 1
        assert (
            auth_client.post(
                "/authority/sign-in",
                json={
                    "email": "owner@example.com",
                    "password": "12345678",
                    "ip_address": "8.8.8.8",
                },
            ).status_code
            == 422
        )
        assert len(auth_client.portal.call(read)) == 1
    finally:
        reader.close()


def test_missing_city_data_and_expected_lookup_failure_keep_ip(geoip):
    reader = geoip.GeoIpReader()
    reader._reader = SimpleNamespace(
        city=lambda ip: SimpleNamespace(
            country=SimpleNamespace(iso_code="GB"),
            subdivisions=SimpleNamespace(most_specific=SimpleNamespace(name=None)),
            city=SimpleNamespace(name=None),
        )
    )
    partial = reader.lookup("81.2.69.142")
    assert partial.country_code == "GB" and partial.region is partial.city is None and partial.geo_status == "resolved"

    def broken(ip):
        raise OSError("local reader unavailable")

    reader._reader = SimpleNamespace(city=broken)
    failed = reader.lookup("81.2.69.142")
    assert failed.ip_address == "81.2.69.142" and failed.geo_status == "unavailable"


def load_file(path, name):
    spec = util.spec_from_file_location(name, path)
    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_offline_import_is_atomic_and_preserves_valid_file_on_failure(tmp_path, monkeypatch):
    importer = load_file(
        Path(__file__).resolve().parents[1] / "COMMON/tools/tools_geoip.py",
        "offline_import",
    )
    monkeypatch.setattr(socket.socket, "connect", no_network)
    destination = tmp_path / "installed" / "City.mmdb"
    result = importer.GeoIpDatabaseImporter(FIXTURE, destination).install()
    assert "City" in result["database_type"] and destination.read_bytes() == FIXTURE.read_bytes()
    bad = tmp_path / "bad.mmdb"
    bad.write_bytes(b"not-a-database")
    with pytest.raises(Exception):
        importer.GeoIpDatabaseImporter(bad, destination).install()
    assert destination.read_bytes() == FIXTURE.read_bytes()
    assert list(destination.parent.glob(".geoip-*")) == []


def test_migration_preserves_original_events_indexes_and_foreign_keys(tmp_path):
    directory = Path(__file__).resolve().parents[1] / "SYSTEM/models/migrations/versions"
    before = load_file(directory / "159af2dc7898_add_successful_login_records.py", "login_before")
    migration = load_file(directory / "71bc8f24d903_add_login_ip_locations.py", "login_after")
    engine = sa.create_engine(f'sqlite:///{tmp_path / "history.sqlite"}')
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        conn.exec_driver_sql("CREATE TABLE auth_user (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql("INSERT INTO auth_user (id) VALUES (1)")
        before.op = migration.op = Operations(MigrationContext.configure(conn))
        before.upgrade()
        conn.exec_driver_sql("INSERT INTO record_login (id,user_id,logintime) VALUES (1,1,'2026-01-01 01:02:03')")
        indexes = {index["name"] for index in sa.inspect(conn).get_indexes("record_login")}
        migration.upgrade()
        row = conn.exec_driver_sql("SELECT * FROM record_login").mappings().one()
        assert row["id"] == row["user_id"] == 1 and row["logintime"] == "2026-01-01 01:02:03"
        assert row["geo_status"] == "unknown"
        assert all(row[field] is None for field in ("ip_address", "country_code", "region", "city"))
        assert indexes == {index["name"] for index in sa.inspect(conn).get_indexes("record_login")}
        assert sa.inspect(conn).get_foreign_keys("record_login")[0]["referred_table"] == "auth_user"
        with pytest.raises(sa.exc.IntegrityError):
            conn.exec_driver_sql("INSERT INTO record_login (user_id,geo_status) VALUES (1,'invalid')")
        migration.downgrade()
        assert set(row["name"] for row in sa.inspect(conn).get_columns("record_login")) == {
            "id",
            "user_id",
            "logintime",
        }
        assert conn.exec_driver_sql("SELECT id,user_id,logintime FROM record_login").one() == (
            1,
            1,
            "2026-01-01 01:02:03",
        )
        migration.upgrade()
        assert conn.exec_driver_sql("SELECT count(*) FROM record_login").scalar_one() == 1
    engine.dispose()


@pytest.fixture
def history(protected):
    sign_in(protected)
    models = protected.app.state.models

    async def seed():
        async with protected.app.state.sessions.begin() as session:
            owner = await session.get(models.AuthUser, 1)
            session.add(
                models.AuthUser(
                    id=2,
                    user="disabled",
                    email="disabled@example.com",
                    role_id=1,
                    is_active=False,
                    password=owner.password,
                )
            )
            await session.flush()
            await session.execute(delete(models.RecordLogin))
            session.add_all(
                [
                    models.RecordLogin(
                        id=10,
                        user_id=1,
                        logintime=datetime(2026, 1, 2, tzinfo=timezone.utc),
                    ),
                    models.RecordLogin(
                        id=11,
                        user_id=1,
                        logintime=datetime(2026, 1, 3, tzinfo=timezone.utc),
                        ip_address="81.2.69.142",
                        country_code="GB",
                        region="England",
                        city="London",
                        geo_status="resolved",
                    ),
                    models.RecordLogin(
                        id=12,
                        user_id=1,
                        logintime=datetime(2026, 1, 3, tzinfo=timezone.utc),
                        ip_address="2001:218::",
                        country_code="JP",
                        geo_status="resolved",
                    ),
                    models.RecordLogin(
                        id=13,
                        user_id=2,
                        logintime=datetime(2026, 1, 4, tzinfo=timezone.utc),
                        ip_address="10.0.0.1",
                        geo_status="non_public",
                    ),
                ]
            )

    protected.portal.call(seed)
    return protected


def test_private_history_is_stably_paged_and_includes_disabled_target(history):
    client = history
    response = client.get("/management/login-records", params={"user_id": 1, "size": 1})
    assert response.status_code == 200, response.text
    expect_private(response)
    data = response.json()
    assert (data["total"], data["pages"]) == (3, 3)
    ids = [
        client.get("/management/login-records", params={"user_id": 1, "size": 1, "page": page}).json()["items"][0]["id"]
        for page in range(1, 4)
    ]
    assert ids == [12, 11, 10]
    all_rows = client.get("/management/login-records", params={"size": 100}).json()["items"]
    assert [row["id"] for row in all_rows] == [13, 12, 11, 10]
    assert all_rows[-1]["ip_address"] is None and all_rows[-1]["geo_status"] == "unknown"
    assert (
        client.get("/management/login-records", params={"user_id": 2}).json()["items"][0]["email"]
        == "disabled@example.com"
    )
    assert client.get("/management/login-records", params={"user_id": 999}).json()["total"] == 0
    assert client.get("/management/login-records", params={"user_id": 1, "page": 99}).json()["items"] == []
    assert (
        client.get("/management/login-records", params={"user_id": 1, "sort": "id:asc"}).json()["items"][0]["id"] == 10
    )


@pytest.mark.parametrize(
    "params,expected",
    [
        ({"search": "lOnD", "search_fields": '["city"]'}, [11]),
        (
            {"filters": '[{"field":"geo_status","operator":"equals","value":"non_public"}]'},
            [13],
        ),
        ({"filters": '[{"field":"ip_address","operator":"empty"}]'}, [10]),
        (
            {"filters": '[{"field":"logintime","operator":"equals","value":"2026-01-03"}]'},
            [12, 11],
        ),
        (
            {
                "user_id": "1",
                "search": "GB",
                "search_fields": '["country_code","region"]',
            },
            [11],
        ),
    ],
)
def test_history_search_and_filters_run_before_totals(history, params, expected):
    result = history.get("/management/login-records", params=params)
    assert result.status_code == 200, result.text
    assert [row["id"] for row in result.json()["items"]] == expected
    assert result.json()["total"] == len(expected)


@pytest.mark.parametrize(
    "query",
    [
        {"user_id": "0"},
        {"user_id": "-1"},
        {"user_id": "2147483648"},
        {"user_id": "x"},
        {"sort": "updatetime:desc"},
        {"sort": ""},
        {"sort": "password:asc"},
        {"search": "London", "search_fields": '["password"]'},
        {"role": "admin"},
        [("user_id", "1"), ("user_id", "2")],
    ],
)
def test_history_rejects_invalid_controls(history, query):
    assert history.get("/management/login-records", params=query).status_code == 400


def test_history_permission_is_refreshed_and_guests_cannot_read(protected):
    assert protected.get("/management/login-records").status_code == 401
    sign_in(protected)
    assert protected.get("/management/login-records").status_code == 200
    models = protected.app.state.models
    change(
        protected,
        update(models.AuthRole).where(models.AuthRole.id == 1).values(is_manage_users=False),
    )
    denied = protected.get("/management/login-records")
    assert denied.status_code == 403
    expect_private(denied)
    change(
        protected,
        update(models.AuthRole)
        .where(models.AuthRole.id == 1)
        .values(
            is_manage_users=True,
            is_read=False,
            is_manage_roles=False,
            is_manage_sites=False,
        ),
    )
    assert protected.get("/management/login-records").status_code == 200
    change(
        protected,
        update(models.AuthRole).where(models.AuthRole.id == 1).values(is_active=False),
    )
    assert protected.get("/management/login-records").status_code == 401


def test_history_openapi_and_route_use_existing_management_router(protected):
    schema = protected.app.openapi()
    operation = schema["paths"]["/management/login-records"]["get"]
    assert (
        next(value for value in operation["parameters"] if value["name"] == "sort")["schema"]["default"]
        == "logintime:desc"
    )
    assert set(operation["responses"]) >= {"200", "400", "401", "403", "503"}
    assert "/login-records" not in schema["paths"]
