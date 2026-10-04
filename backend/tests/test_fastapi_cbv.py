"""Verify that separate CBV classes can use the same application router."""

from importlib import import_module
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest


@pytest.fixture
def cbv_tools(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1]))
    return import_module("SYSTEM.tools.tools_fastapi")


def test_multiple_cbv_classes_share_one_router(cbv_tools):
    router = cbv_tools.FastApiRouter(prefix="portfolio", tags="Portfolio")

    @cbv_tools.cbv(router)
    class Site:
        @router.get("/site")
        def get_site(self):
            return {"site": True}

    @cbv_tools.cbv(router)
    class Projects:
        @router.get("/projects")
        def get_projects(self):
            return {"projects": True}

    app = FastAPI()
    app.include_router(router)

    with TestClient(app) as client:
        assert client.get("/portfolio/site").json() == {"site": True}
        assert client.get("/portfolio/projects").json() == {"projects": True}

    paths = app.openapi()["paths"]
    assert paths["/portfolio/site"]["get"]["tags"] == ["Portfolio"]
    assert paths["/portfolio/projects"]["get"]["tags"] == ["Portfolio"]
    assert paths["/portfolio/site"]["get"]["operationId"].startswith("Site_get_site_")
    assert paths["/portfolio/projects"]["get"]["operationId"].startswith("Projects_get_projects_")


def test_duplicate_cbv_route_is_rejected_across_classes(cbv_tools):
    router = cbv_tools.FastApiRouter(prefix="portfolio", tags="Portfolio")

    @cbv_tools.cbv(router)
    class First:
        @router.get("/site")
        def get_site(self):
            return {}

    with pytest.raises(ValueError, match="Duplicate CBV route role"):

        @cbv_tools.cbv(router)
        class Second:
            @router.get("/site")
            def get_site(self):
                return {}
