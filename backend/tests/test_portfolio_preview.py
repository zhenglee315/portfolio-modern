"""Verify protected draft preview against real ORM/session middleware in isolated SQLite."""

from importlib import import_module
import pytest
from sqlalchemy import update

RESOURCES = ["site", "journey", "experiences", "projects", "skill-categories", "skills"]


def change(client, *statements):
    async def work():
        async with client.app.state.sessions.begin() as session:
            for statement in statements:
                await session.execute(statement)

    client.portal.call(work)


@pytest.fixture
def preview_client(portfolio_client):
    client = portfolio_client
    models = client.app.state.models

    async def labels():
        async with client.app.state.sessions.begin() as session:
            session.add(
                models.PortfolioSkillCategoryLocale(
                    site_id=1,
                    category_id="shared-category",
                    locale="en",
                    label="Category One",
                )
            )

    client.portal.call(labels)
    client.app.include_router(import_module("APPs.Management.views_management").router)
    return client


def parameters(resource, site_id=1):
    params = {"site_id": site_id, "locale": "en"}
    if resource == "skills":
        params.update(ownerType="category", ownerId="shared-category")
    return params


def grant(client):
    models = client.app.state.models
    change(client, update(models.AuthRole).values(is_manage_sites=True, is_default=False))
    client.post("/__test__/other-account-session")


@pytest.mark.parametrize("resource", RESOURCES)
def test_guest_and_current_permission_are_required_before_preview(preview_client, resource):
    client = preview_client
    response = client.get("/management/preview/" + resource, params=parameters(resource))
    assert response.status_code == 401
    assert response.headers["cache-control"] == "private, no-store"
    client.post("/__test__/other-account-session")
    response = client.get("/management/preview/" + resource, params=parameters(resource))
    assert response.status_code == 403
    assert response.headers["vary"] == "Cookie"


@pytest.mark.parametrize("resource", RESOURCES)
def test_draft_and_disabled_owner_use_existing_scoped_queries(preview_client, resource):
    client = preview_client
    grant(client)
    models = client.app.state.models
    change(
        client,
        update(models.PortfolioSite).where(models.PortfolioSite.id == 1).values(is_published=False, is_default=False),
        update(models.AuthUser).where(models.AuthUser.id == 1).values(is_active=False),
    )
    response = client.get("/management/preview/" + resource, params=parameters(resource))
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["vary"] == "Cookie"
    assert "password" not in response.text
    if resource == "site":
        assert response.json()["site_id"] == 1 and response.json()["profile"]["firstName"] == "Owner 1"
    if resource == "journey":
        assert all("Site 1" in item["organizationName"] for item in response.json())
    if resource in ("experiences", "projects"):
        assert all("Site 1" in item["organizationName"] for item in response.json()["items"])
    assert client.get("/portfolio/site", params={"site_id": 1}).status_code == 404


@pytest.mark.parametrize(
    "field,table,status",
    [
        ("is_manage_sites", "AuthRole", 403),
        ("is_active", "AuthRole", 401),
        ("is_active", "AuthUser", 401),
    ],
)
def test_current_database_revocation_rejects_cached_session_rights(preview_client, field, table, status):
    client = preview_client
    grant(client)
    models = client.app.state.models
    assert client.get("/management/preview/site", params={"site_id": 1}).status_code == 200
    entity = getattr(models, table)
    change(
        client,
        update(entity).where(entity.id == (2 if table == "AuthUser" else 1)).values(**{field: False}),
    )
    response = client.get("/management/preview/site", params={"site_id": 1})
    assert response.status_code == status
    assert response.headers["cache-control"] == "private, no-store"


def test_preview_does_not_fall_back_and_preserves_pagination_and_language(
    preview_client,
):
    client = preview_client
    grant(client)
    assert client.get("/management/preview/site").status_code == 422
    for value in ["0", "-1", "1.5", "2147483648", "bad"]:
        assert client.get("/management/preview/site", params={"site_id": value}).status_code == 400
    assert client.get("/management/preview/site", params={"site_id": 999}).status_code == 404
    assert client.get("/management/preview/site?site_id=1&site_id=2").status_code == 400
    assert client.get("/management/preview/site?site_id=1&user=owner-two").status_code == 400
    assert client.get("/management/preview/site?site_id=2&locale=zh-Hant").status_code == 404
    result = client.get("/management/preview/site?site_id=1&locale=zh-Hant").json()
    assert result["profile"]["content"] == "zh-Hant owner 1 introduction"
    result = client.get("/management/preview/projects?site_id=1&page=2").json()
    assert result["page"] == 2 and result["total"] == 8 and len(result["items"]) == 2
    assert client.get("/management/preview/projects?site_id=1&size=7").status_code == 400
    assert client.get("/management/preview/skills?site_id=1&ownerType=other&ownerId=shared-category").status_code == 400


@pytest.mark.parametrize("resource", RESOURCES)
def test_all_preview_routes_check_permission_before_invalid_selection(preview_client, resource):
    client = preview_client
    params = parameters(resource, site_id="not-an-id")
    assert client.get("/management/preview/" + resource, params=params).status_code == 401
    client.post("/__test__/other-account-session")
    assert client.get("/management/preview/" + resource, params=params).status_code == 403


@pytest.mark.parametrize("resource", RESOURCES)
def test_all_preview_collections_keep_missing_site_404(preview_client, resource):
    client = preview_client
    grant(client)
    response = client.get("/management/preview/" + resource, params=parameters(resource, site_id=99999))
    assert response.status_code == 404, response.text
    assert response.json() == {"detail": "NOT_FOUND"}
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["vary"] == "Cookie"


def test_preview_target_database_failure_keeps_private_503(preview_client, monkeypatch):
    from sqlalchemy.exc import SQLAlchemyError

    client = preview_client
    grant(client)
    modules = import_module("APPs.Portfolio.module.module_portfolio")

    async def unavailable(*_args, **_kwargs):
        raise SQLAlchemyError("sensitive connection details")

    monkeypatch.setattr(modules._PortfolioScopedModule, "execute_orm", unavailable)
    response = client.get("/management/preview/site", params=parameters("site"))
    assert response.status_code == 503
    assert response.json() == {"detail": "PORTFOLIO_DATABASE_UNAVAILABLE"}
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["vary"] == "Cookie"
    assert "sensitive" not in response.text


def test_unified_management_router_keeps_all_preview_contracts_once(preview_client):
    paths = preview_client.get("/openapi.json").json()["paths"]
    expected = {"/management/" + resource for resource in ("roles", "users", "sites", "login-records")}
    expected.update("/management/preview/" + resource for resource in RESOURCES)
    writes = {
        "/management/sites/{account_id}",
        "/management/users/{account_id}",
        "/management/roles/{role_id}",
    }
    assert {path for path in paths if path.startswith("/management/")} == expected | writes | {
        "/management/users/role-options",
        "/management/sites/bulk-delete",
        "/management/users/bulk-delete",
        "/management/roles/bulk-delete",
    }
    for path in writes:
        assert set(paths[path]) == {"patch", "delete"}
    assert set(paths["/management/sites/bulk-delete"]) == {"post"}
    assert set(paths["/management/users/bulk-delete"]) == {"post"}
    assert set(paths["/management/roles/bulk-delete"]) == {"post"}
    for path in expected:
        assert set(paths[path]) == {"get"}
        parameters = paths[path]["get"].get("parameters", [])
        assert all(parameter["name"] not in ("account", "is_manage_sites", "scope") for parameter in parameters)


@pytest.mark.parametrize("resource", ("journey", "experiences", "projects", "skill-categories", "skills"))
def test_preview_content_query_failure_is_private_503(preview_client, monkeypatch, resource):
    from sqlalchemy.exc import SQLAlchemyError

    client = preview_client
    grant(client)
    modules = import_module("APPs.Portfolio.module.module_portfolio")
    owner, method = {
        "journey": (modules.PortfolioJourneyModule, "select"),
        "experiences": (modules.PortfolioExperiencesModule, "select"),
        "projects": (modules.PortfolioProjectsModule, "select"),
        "skill-categories": (modules.PortfolioSkillsModule, "select_categories"),
        "skills": (modules.PortfolioSkillsModule, "select_skills"),
    }[resource]

    async def fail(*_args, **_kwargs):
        raise SQLAlchemyError("sensitive query details")

    monkeypatch.setattr(owner, method, fail)
    response = client.get("/management/preview/" + resource, params=parameters(resource))
    assert response.status_code == 503
    assert response.json() == {"detail": "PORTFOLIO_DATABASE_UNAVAILABLE"}
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["vary"] == "Cookie"
    assert "sensitive" not in response.text


def test_preview_skill_owner_validation_stays_outside_view(preview_client):
    client = preview_client
    grant(client)
    for owner_type, owner_id, detail in [
        ("other", "shared-category", "INVALID_OWNER"),
        ("category", "   ", "INVALID_OWNER_ID"),
    ]:
        response = client.get(
            "/management/preview/skills",
            params={
                **parameters("skills"),
                "ownerType": owner_type,
                "ownerId": owner_id,
            },
        )
        assert response.status_code == 400
        assert response.json() == {"detail": detail}
        assert response.headers["cache-control"] == "private, no-store"
    response = client.get(
        "/management/preview/skills",
        params={**parameters("skills"), "ownerId": "  shared-category  "},
    )
    assert response.status_code == 200, response.text


def test_preview_descriptions_keep_documented_style_and_valid_response_examples(
    preview_client,
):
    import json
    import re
    from pydantic import TypeAdapter

    schemas = import_module("APPs.Portfolio.schema.resp")
    contracts = {
        "site": schemas.RespPortfolioSite,
        "journey": list[schemas.RespPortfolioJourneyItem],
        "experiences": schemas.RespPortfolioExperiences,
        "projects": schemas.RespPortfolioProjects,
        "skill-categories": schemas.RespPortfolioSkillCategories,
        "skills": schemas.RespPortfolioSkills,
    }
    paths = preview_client.get("/openapi.json").json()["paths"]
    for resource, contract in contracts.items():
        description = paths["/management/preview/" + resource]["get"]["description"]
        for section in (
            "**Purpose & Permission:**",
            "**Portfolio Selection:**",
            "**Language:**",
            "**Privacy & Caching:**",
            "**Response Format:**",
            "**Notes:**",
        ):
            assert section in description
        examples = re.findall(r"```json\n(.*?)\n```", description, re.S)
        assert len(examples) == 1
        TypeAdapter(contract).validate_python(json.loads(examples[0]))
