"""Verify first-clone offline extraction, cache updates and atomic failure recovery."""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from importlib import import_module
from pathlib import Path
import gzip
import json
import socket
import subprocess
import sys

import pytest
from maxminddb import InvalidDatabaseError

BACKEND = Path(__file__).resolve().parents[1]
FIXTURE = BACKEND / "tests/fixtures/GeoIP2-City-Test.mmdb"


def bundle(directory, data=None):
    directory.mkdir(parents=True, exist_ok=True)
    data = FIXTURE.read_bytes() if data is None else data
    compressed = gzip.compress(data, mtime=0)
    archive = directory / "City.mmdb.gz"
    archive.write_bytes(compressed)
    manifest = {
        "archive": archive.name,
        "bytes": len(data),
        "sha256": sha256(data).hexdigest(),
        "archive_bytes": len(compressed),
        "archive_sha256": sha256(compressed).hexdigest(),
    }
    (directory / "manifest.json").write_text(json.dumps(manifest))
    return directory / "City.mmdb", manifest


@pytest.fixture
def importer(monkeypatch):
    monkeypatch.syspath_prepend(str(BACKEND))
    return import_module("COMMON.tools.tools_geoip").GeoIpDatabaseImporter


def no_network(*args, **kwargs):
    raise AssertionError("Offline database preparation attempted a network request")


def test_first_clone_archive_is_prepared_and_read_without_network(auth_client, tmp_path, monkeypatch):
    target, _ = bundle(tmp_path)
    assert not target.exists()
    monkeypatch.setattr(socket.socket, "connect", no_network)
    reader = import_module("SYSTEM.tools.tools_geoip").GeoIpReader(
        target,
        prepare_database=import_module("COMMON.tools.tools_geoip").GeoIpDatabaseImporter.prepare_bundle,
    )
    assert reader.open()
    try:
        assert reader.lookup("81.2.69.142").country_code == "GB"
        assert reader.lookup("2001:218::").country_code == "JP"
        assert target.read_bytes() == FIXTURE.read_bytes()
        assert target.stat().st_mode & 0o777 == 0o640
    finally:
        reader.close()
    assert not list(tmp_path.glob(".geoip-*"))


def test_matching_cache_requires_no_rewrite(importer, tmp_path, monkeypatch):
    target, _ = bundle(tmp_path)
    importer.prepare_bundle(target)
    before = target.stat().st_mtime_ns
    monkeypatch.setattr(
        importer,
        "install",
        lambda self: pytest.fail("Matching cache was unnecessarily rewritten"),
    )
    importer.prepare_bundle(target)
    assert target.stat().st_mtime_ns == before


def test_git_data_update_replaces_an_older_readable_cache(importer, tmp_path):
    target, _ = bundle(tmp_path)
    old = FIXTURE.read_bytes() + b"old-release"
    target.write_bytes(old)
    from geoip2.database import Reader

    with Reader(str(target)) as reader:
        assert "City" in reader.metadata().database_type
    importer.prepare_bundle(target)
    assert target.read_bytes() == FIXTURE.read_bytes()


def test_same_size_corrupt_cache_is_repaired(importer, tmp_path):
    target, _ = bundle(tmp_path)
    data = bytearray(FIXTURE.read_bytes())
    data[0] ^= 1
    target.write_bytes(data)
    importer.prepare_bundle(target)
    assert target.read_bytes() == FIXTURE.read_bytes()


@pytest.mark.parametrize("case", ["archive_hash", "raw_hash", "raw_size", "truncated", "not_city"])
def test_invalid_update_preserves_prior_file_and_cleans_staging(importer, tmp_path, case):
    target, manifest = bundle(tmp_path)
    original = FIXTURE.read_bytes() + b"old-release"
    target.write_bytes(original)
    if case == "archive_hash":
        manifest["archive_sha256"] = "0" * 64
    elif case == "raw_hash":
        manifest["sha256"] = "0" * 64
    elif case == "raw_size":
        manifest["bytes"] -= 1
    elif case == "truncated":
        archive = tmp_path / "City.mmdb.gz"
        data = archive.read_bytes()[:-5]
        archive.write_bytes(data)
        manifest.update(archive_sha256=sha256(data).hexdigest(), archive_bytes=len(data))
    elif case == "not_city":
        _, manifest = bundle(tmp_path, b"not-a-city-database")
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises((ValueError, OSError, EOFError, InvalidDatabaseError)):
        importer.prepare_bundle(target)
    assert target.read_bytes() == original
    assert not list(tmp_path.glob(".geoip-*"))


@pytest.mark.parametrize(
    "value",
    [
        [],
        None,
        {"archive": "../City.mmdb.gz"},
        {"archive": "City.mmdb.gz", "sha256": "bad"},
        {
            "archive": "City.mmdb.gz",
            "sha256": "0" * 64,
            "archive_sha256": "0" * 64,
            "bytes": True,
            "archive_bytes": 1,
        },
    ],
)
def test_invalid_manifest_cannot_replace_existing_cache(importer, tmp_path, value):
    target, _ = bundle(tmp_path)
    target.write_bytes(b"original")
    (tmp_path / "manifest.json").write_text(json.dumps(value))
    with pytest.raises(ValueError):
        importer.prepare_bundle(target)
    assert target.read_bytes() == b"original"


def test_concurrent_worker_preparation_publishes_complete_database(importer, tmp_path):
    target, _ = bundle(tmp_path)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(importer.prepare_bundle, [target] * 4))
    assert target.read_bytes() == FIXTURE.read_bytes()
    assert not list(tmp_path.glob(".geoip-*"))


def test_custom_raw_database_has_no_bundle_side_effects(importer, tmp_path):
    target = tmp_path / "custom.mmdb"
    target.write_bytes(FIXTURE.read_bytes())
    before = target.stat().st_mtime_ns
    importer.prepare_bundle(target)
    assert target.stat().st_mtime_ns == before
    assert sorted(file.name for file in tmp_path.iterdir()) == ["custom.mmdb"]


def test_failed_bundle_refresh_keeps_existing_reader_available(auth_client, tmp_path):
    target, _ = bundle(tmp_path)
    target.write_bytes(FIXTURE.read_bytes() + b"old-release")
    (tmp_path / "manifest.json").write_text("invalid JSON")
    reader = import_module("SYSTEM.tools.tools_geoip").GeoIpReader(
        target,
        prepare_database=import_module("COMMON.tools.tools_geoip").GeoIpDatabaseImporter.prepare_bundle,
    )
    assert reader.open()
    try:
        assert reader.lookup("81.2.69.142").country_code == "GB"
    finally:
        reader.close()


def test_standalone_gzip_import_needs_no_settings_or_private_config(tmp_path):
    target, _ = bundle(tmp_path / "source")
    destination = tmp_path / "target" / "City.mmdb"
    script = BACKEND / "COMMON/tools/tools_geoip.py"
    code = """
from importlib.util import spec_from_file_location, module_from_spec
import sys
spec = spec_from_file_location('offline_import', sys.argv[1])
module = module_from_spec(spec)
spec.loader.exec_module(module)
assert 'SYSTEM' not in sys.modules
module.GeoIpDatabaseImporter(__import__('pathlib').Path(sys.argv[2]), __import__('pathlib').Path(sys.argv[3])).install()
assert 'SYSTEM' not in sys.modules
"""
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            code,
            str(script),
            str(target) + ".gz",
            str(destination),
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert destination.read_bytes() == FIXTURE.read_bytes()
