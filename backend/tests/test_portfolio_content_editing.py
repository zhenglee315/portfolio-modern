"""Exercise the real colocated CBVs, authorization and atomic ORM writes in isolated SQLite."""

from copy import deepcopy
from importlib import import_module
import pytest
from sqlalchemy import update

RESOURCES = ("site", "experiences", "projects", "skill-categories", "skills")


@pytest.fixture
def editor(portfolio_client, monkeypatch):
    client = portfolio_client
    models = client.app.state.models

    async def grant():
        async with client.app.state.sessions.begin() as session:
            await session.execute(
                update(models.AuthRole).values(
                    is_default=False, is_read=True, is_create=True, is_update=True, is_delete=True
                )
            )

    client.portal.call(grant)
    client.post("/__test__/other-account-session")

    async def invalidate():
        return None

    monkeypatch.setattr(
        import_module("APPs.Portfolio.module.module_portfolio_manage").PortfolioManagementModule,
        "invalidate_cache",
        invalidate,
    )
    return client


def snapshot(client):
    responses = {name: client.get("/portfolio/me/" + name) for name in RESOURCES}
    for response in responses.values():
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "private, no-store"
    bodies = {name: response.json() for name, response in responses.items()}
    revision = bodies["site"]["revision"]
    assert all(body["revision"] == revision for body in bodies.values())
    draft = bodies["site"]["site"]
    for resource, order in (
        ("experiences", "experienceOrder"),
        ("projects", "projectOrder"),
        ("skill-categories", "categoryOrder"),
    ):
        target = "categories" if resource == "skill-categories" else resource
        draft[target] = {item["id"]: item for item in bodies[resource]["items"]}
        draft[order] = bodies[resource]["order"]
    draft["skills"] = {item["id"]: item for item in bodies["skills"]["items"]}
    return revision, draft


def write(client, method, path, revision, **values):
    response = client.request(method, "/portfolio/" + path, json={"expected_revision": revision, **values})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["revision"] == revision + 1
    return body["revision"], body["draft"]


def test_original_classes_are_colocated_and_all_29_operations_are_documented(editor):
    views = import_module("APPs.Portfolio.views_portfolio")
    modules = import_module("APPs.Portfolio.module.module_portfolio")
    assert modules.PortfolioProjectsModule is views.PortfolioProjectsModule
    assert modules.PortfolioProjectsModule.__module__ == "APPs.Portfolio.views_portfolio"
    paths = editor.get("/openapi.json").json()["paths"]
    operations = [
        (path, method, spec)
        for path, methods in paths.items()
        if path.startswith("/portfolio/")
        for method, spec in methods.items()
    ]
    assert len(operations) == 29
    assert len({spec["operationId"] for _, _, spec in operations}) == 29
    for path, method, spec in operations:
        if method != "get":
            assert "🔄 **Transaction & Revision:**" in spec["description"]
            assert "📦 **Response & Cache:**" in spec["description"]
    assert paths["/portfolio/projects"]["post"]["operationId"].startswith("PortfolioProjects_")


@pytest.mark.parametrize("resource", RESOURCES)
def test_owner_reads_require_current_permissions_and_ignore_publication(portfolio_client, resource):
    client = portfolio_client
    response = client.get("/portfolio/me/" + resource)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "private, no-store"
    client.post("/__test__/other-account-session")
    assert client.get("/portfolio/me/" + resource).status_code == 403


def test_atomic_save_changes_all_sections_and_public_reads_use_shared_skill_ids(editor):
    revision, draft = snapshot(editor)
    assert draft["source"]["siteId"] == 2
    draft["profiles"]["en"]["firstName"] = "Updated owner"
    career = draft["experiences"][draft["experienceOrder"][0]]
    career["latitude"], career["longitude"] = "25.03", "121.56"
    skill = next(iter(draft["skills"]))
    draft["skills"][skill]["labels"]["en"] = "Shared renamed skill"
    career["skillIds"] = [skill]
    project = draft["projects"][draft["projectOrder"][0]]
    project["skillIds"] = [skill]
    project["experienceId"] = career["id"]
    project["translations"]["en"]["technical"] = "Transactional detail"
    draft["categoryOrder"].reverse()
    revision, saved = write(editor, "POST", "site/save", revision, draft=draft)
    assert saved["profiles"]["en"]["firstName"] == "Updated owner"
    public = editor.get("/portfolio/projects?site_id=2").json()["items"][0]
    assert public["skills"] == ["Shared renamed skill"]
    assert public["detail"]["technicalDescription"] == "Transactional detail"
    assert public["organizationName"] == career["translations"]["en"]["organization"]
    journey = editor.get("/portfolio/journey?site_id=2").json()
    assert next(item for item in journey if item["id"] == int(career["id"].split(":")[1]))["latitude"] == 25.03
    assert editor.get("/portfolio/site?site_id=1").json()["profile"]["firstName"] == "Owner 1"
    assert snapshot(editor) == (revision, saved)


def test_all_resource_cud_order_and_category_memberships_use_the_same_revision(editor):
    revision, draft = snapshot(editor)
    revision, draft = write(
        editor, "PATCH", "site", revision, profiles={"en": {**draft["profiles"]["en"], "nickName": "Edited"}}
    )
    revision, draft = write(
        editor,
        "POST",
        "skills",
        revision,
        entry=dict(
            id="skill-test",
            label="Test skill",
            labels={language: "Test skill" for language in ("en", "zh-Hans", "zh-Hant")},
        ),
    )
    revision, draft = write(editor, "PATCH", "skills/skill-test", revision, changes={"label": "Renamed"})
    revision, draft = write(
        editor,
        "POST",
        "skill-categories",
        revision,
        entry=dict(
            id="category-test",
            names={language: "New category" for language in ("en", "zh-Hans", "zh-Hant")},
            visible=True,
            skillIds=[],
        ),
    )
    revision, draft = write(editor, "PATCH", "skill-categories/category-test", revision, changes={"visible": False})
    revision, draft = write(
        editor, "PUT", "skill-categories/order", revision, ids=list(reversed(draft["categoryOrder"]))
    )
    revision, draft = write(editor, "PUT", "skill-categories/category-test/skills", revision, ids=["skill:skill-test"])
    assert (
        editor.request("DELETE", "/portfolio/skills/skill-test", json={"expected_revision": revision}).status_code
        == 409
    )
    revision, draft = write(editor, "PUT", "skill-categories/category-test/skills", revision, ids=[])
    revision, draft = write(editor, "DELETE", "skills/skill-test", revision)
    revision, draft = write(editor, "DELETE", "skill-categories/category-test", revision)
    entry = deepcopy(next(iter(draft["experiences"].values())))
    entry["id"] = "experience-new"
    revision, draft = write(editor, "POST", "experiences", revision, entry=entry)
    career = draft["experienceOrder"][0]
    revision, draft = write(
        editor, "PATCH", "experiences/" + career.split(":")[1], revision, changes={"latitude": "51.6"}
    )
    revision, draft = write(editor, "PUT", "experiences/order", revision, ids=list(reversed(draft["experienceOrder"])))
    entry = deepcopy(next(iter(draft["projects"].values())))
    entry.update(id="project-new", experienceId=career)
    revision, draft = write(editor, "POST", "projects", revision, entry=entry)
    project = draft["projectOrder"][0]
    revision, draft = write(editor, "PATCH", "projects/" + project.split(":")[1], revision, changes={"visible": False})
    revision, draft = write(editor, "PUT", "projects/order", revision, ids=list(reversed(draft["projectOrder"])))
    revision, draft = write(editor, "DELETE", "experiences/" + career.split(":")[1], revision)
    assert draft["projects"][project]["experienceId"] is None
    revision, draft = write(editor, "DELETE", "projects/" + project.split(":")[1], revision)
    assert snapshot(editor) == (revision, draft)


def test_stale_foreign_and_invalid_references_never_commit_partial_changes(editor):
    revision, draft = snapshot(editor)
    assert (
        editor.patch(
            "/portfolio/projects/1", json={"expected_revision": revision, "changes": {"visible": False}}
        ).status_code
        == 404
    )
    invalid = deepcopy(draft)
    invalid["profiles"]["en"]["firstName"] = "Must roll back"
    next(iter(invalid["projects"].values()))["skillIds"] = ["skill:foreign"]
    assert (
        editor.post("/portfolio/site/save", json={"expected_revision": revision, "draft": invalid}).status_code == 422
    )
    assert snapshot(editor) == (revision, draft)
    next_revision, _ = write(editor, "PUT", "projects/order", revision, ids=list(reversed(draft["projectOrder"])))
    assert editor.post("/portfolio/site/save", json={"expected_revision": revision, "draft": draft}).status_code == 409
    assert snapshot(editor)[0] == next_revision


def test_database_failure_rolls_back_and_cache_failure_reports_committed_state(editor, monkeypatch):
    views = import_module("APPs.Portfolio.views_portfolio")
    revision, draft = snapshot(editor)
    original = views._PortfolioScopedModule._persist_document

    async def fail_after_sql(self, *args):
        await original(self, *args)
        raise RuntimeError("sensitive database information")

    monkeypatch.setattr(views._PortfolioScopedModule, "_persist_document", fail_after_sql)
    changed = deepcopy(draft)
    changed["profiles"]["en"]["firstName"] = "Not committed"
    response = editor.post("/portfolio/site/save", json={"expected_revision": revision, "draft": changed})
    assert response.status_code == 503
    assert "sensitive" not in response.text
    assert snapshot(editor) == (revision, draft)
    monkeypatch.setattr(views._PortfolioScopedModule, "_persist_document", original)

    async def cache_unavailable():
        from fastapi import HTTPException

        raise HTTPException(503, "CACHE_DOWN")

    monkeypatch.setattr(views.PortfolioManagementModule, "invalidate_cache", cache_unavailable)
    response = editor.post("/portfolio/site/save", json={"expected_revision": revision, "draft": changed})
    assert response.status_code == 503
    assert response.headers["x-portfolio-update-state"] == "committed"
    assert snapshot(editor)[1]["profiles"]["en"]["firstName"] == "Not committed"


def test_transport_types_current_revocation_and_hidden_records_are_enforced(editor):
    revision, draft = snapshot(editor)
    assert (
        editor.post(
            "/portfolio/site/save",
            json={"expected_revision": revision, "draft": draft},
            headers={"Origin": "https://foreign.example"},
        ).status_code
        == 403
    )
    assert (
        editor.post(
            "/portfolio/site/save",
            content='{"expected_revision":0,"expected_revision":1}',
            headers={"content-type": "application/json"},
        ).status_code
        == 400
    )
    assert (
        editor.put(
            "/portfolio/projects/order", json={"expected_revision": str(revision), "ids": draft["projectOrder"]}
        ).status_code
        == 422
    )
    project = draft["projectOrder"][0]
    revision, draft = write(editor, "PATCH", "projects/" + project.split(":")[1], revision, changes={"visible": False})
    assert len(editor.get("/portfolio/projects?site_id=2").json()["items"]) == 1
    assert len(snapshot(editor)[1]["projects"]) == 2

    async def revoke():
        async with editor.app.state.sessions.begin() as session:
            await session.execute(update(editor.app.state.models.AuthRole).values(is_update=False))

    editor.portal.call(revoke)
    assert editor.post("/portfolio/site/save", json={"expected_revision": revision, "draft": draft}).status_code == 403


def test_unpublished_and_hidden_content_remain_editable(editor):
    models = editor.app.state.models

    async def hide():
        async with editor.app.state.sessions.begin() as session:
            await session.execute(
                update(models.PortfolioSite).where(models.PortfolioSite.id == 2).values(is_published=False)
            )
            await session.execute(
                update(models.PortfolioCareer).where(models.PortfolioCareer.site_id == 2).values(visible=False)
            )

    editor.portal.call(hide)
    assert editor.get("/portfolio/site?site_id=2").status_code == 404
    revision, draft = snapshot(editor)
    assert len(draft["experiences"]) == 3
    assert all(not item["visible"] for item in draft["experiences"].values())
    revision, draft = write(
        editor, "PATCH", "site", revision, profiles={"en": {**draft["profiles"]["en"], "firstName": "Private owner"}}
    )
    assert snapshot(editor)[1]["profiles"]["en"]["firstName"] == "Private owner"


def test_migration_backfill_preserves_existing_localized_public_skill_arrays(editor):
    migration = import_module("SYSTEM.models.migrations.versions.e42b19a7d603_profile_content_editing")
    before = {name: editor.get("/portfolio/" + name + "?site_id=2").json() for name in ("experiences", "projects")}

    async def backfill():
        async with editor.app.state.sessions.begin() as session:
            connection = await session.connection()
            await connection.run_sync(migration.backfill_skills)

    editor.portal.call(backfill)
    for name, body in before.items():
        assert editor.get("/portfolio/" + name + "?site_id=2").json() == body


def test_admin_edits_invalidate_an_open_editor_revision(editor):
    # Platform writes increment the same revision; stale owner saves cannot undo an administrator.
    from APPs.Management.module import ManagementSitesModule

    revision, draft = snapshot(editor)
    models = editor.app.state.models

    async def modify():
        async with editor.app.state.sessions.begin() as session:
            await session.execute(update(models.AuthRole).values(is_manage_sites=True))
        await ManagementSitesModule(locale="en").update(
            account_id=2,
            changes={"first_name": "Admin changed"},
            expected_owner_email="login-two@example.com",
            expected={"first_name": "Owner 2"},
            actor_id=2,
        )

    editor.portal.call(modify)
    response = editor.post("/portfolio/site/save", json={"expected_revision": revision, "draft": draft})
    assert response.status_code == 409
