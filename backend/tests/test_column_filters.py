"""Verify SQL predicates with explicit ID ordering; resource tests cover default update ordering."""

import json
import pytest
from test_management_roles import fetch as roles
from test_management_lists import fetch as lists


def predicate(field, operator, value=None):
    return {
        "field": field,
        "operator": operator,
        **({} if operator in {"empty", "not_empty"} else {"value": value}),
    }


@pytest.mark.parametrize(
    ("field", "operator", "value", "ids"),
    [
        ("role", "contains", "EDITOR", [5, 2]),
        ("role", "not_contains", "editor", [8, 7, 6, 4, 3, 1]),
        ("role", "equals", "EDITOR", [2]),
        ("role", "not_equals", "editor", [8, 7, 6, 5, 4, 3, 1]),
        ("role", "starts", "edit", [5, 2]),
        ("role", "ends", "ops", [5]),
        ("role", "in", ["EDITOR", "viewer"], [2, 1]),
        ("role", "not_in", ["editor", "viewer"], [8, 7, 6, 5, 4, 3]),
        ("role", "in", [], []),
        ("role", "not_in", [], [8, 7, 6, 5, 4, 3, 2, 1]),
        ("description", "empty", None, [1]),
        ("description", "not_empty", None, [8, 7, 6, 5, 4, 3, 2]),
        ("user_count", "equals", 0, [8, 7, 6, 5, 4, 1]),
        ("user_count", "gt", 0, [3, 2]),
        ("user_count", "gte", 2, [2]),
        ("user_count", "lt", 1, [8, 7, 6, 5, 4, 1]),
        ("user_count", "lte", 1, [8, 7, 6, 5, 4, 3, 1]),
        ("user_count", "between", [1, 2], [3, 2]),
        ("is_active", "not_equals", True, [8, 4]),
        ("createtime", "equals", "2026-01-02T03:04:05Z", [8, 7, 6, 5, 4, 3, 2, 1]),
        ("createtime", "gt", "2026-01-02T04:04:05+01:00", []),
    ],
)
def test_role_operators_before_count_and_page(role_client, field, operator, value, ids):
    filters = [predicate(field, operator, value)]
    data = roles(role_client, filters=filters, size=100, sort="id:desc")
    assert data["total"] == len(ids)
    assert [row["id"] for row in data["items"]] == ids
    for index, expected in enumerate(ids):
        page = roles(role_client, filters=filters, size=1, page=index + 1, sort="id:desc")
        assert page["total"] == page["pages"] == len(ids)
        assert page["items"][0]["id"] == expected


@pytest.mark.parametrize(
    ("resource", "field", "operator", "value", "ids"),
    [
        ("sites", "is_published", "empty", None, [7, 3]),
        ("sites", "is_published", "not_equals", True, [5, 2]),
        ("sites", "is_published", "not_empty", None, [6, 5, 4, 2, 1]),
        ("sites", "locale", "equals", "zh-Hant", []),
        (
            "sites",
            "createtime",
            "equals",
            "2026-01-02T03:04:05Z",
            [7, 6, 5, 4, 3, 2, 1],
        ),
        ("users", "last_login", "empty", None, [7, 5, 3]),
        ("users", "login_count", "equals", 0, [7, 5, 3]),
        ("users", "last_login", "gt", "2026-01-04T00:00:00Z", [1]),
        (
            "users",
            "last_login",
            "between",
            ["2026-01-03T00:00:00Z", "2026-01-05T00:00:00Z"],
            [6, 4, 1],
        ),
    ],
)
def test_joined_nullable_and_aggregate_columns(management_client, resource, field, operator, value, ids):
    data = lists(
        management_client,
        resource,
        filters=[predicate(field, operator, value)],
        size=100,
        sort="id:desc",
    )
    assert [row["id"] for row in data["items"]] == ids
    assert data["total"] == len(ids)


@pytest.mark.parametrize("management_client", ["calendar_dates"], indirect=True)
@pytest.mark.parametrize(
    ("operator", "value", "ids"),
    [
        ("equals", "2026-01-05", [3, 2, 1]),
        ("not_equals", "2026-01-05", [7, 6, 5, 4]),
        ("gt", "2026-01-05", [6, 4]),
        ("lt", "2026-01-05", [7, 5]),
        ("empty", None, []),
        ("not_empty", None, [7, 6, 5, 4, 3, 2, 1]),
    ],
)
def test_calendar_day_boundaries_before_count_and_paging(management_client, operator, value, ids):
    filters = [predicate("updatetime", operator, value)]
    for resource in ("users", "sites"):
        data = lists(management_client, resource, filters=filters, size=100, sort="id:desc")
        assert [row["id"] for row in data["items"]] == ids
        assert data["total"] == len(ids)
        if ids:
            page = lists(
                management_client,
                resource,
                filters=filters,
                size=1,
                page=len(ids),
                sort="id:desc",
            )
            assert page["total"] == len(ids)
            assert page["items"][0]["id"] == ids[-1]


def test_calendar_negative_comparison_excludes_missing_login_times(management_client):
    data = lists(
        management_client,
        "users",
        filters=[predicate("last_login", "not_equals", "2026-01-03")],
        size=100,
        sort="id:desc",
    )
    assert [row["id"] for row in data["items"]] == [4, 2, 1]


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        "{}",
        "[null]",
        json.dumps([predicate("password", "equals", "secret")]),
        json.dumps([predicate("role", "gt", "a")]),
        json.dumps([predicate("role", "in", ["Admin", "admin"])]),
        json.dumps([predicate("role", "in", [1])]),
        json.dumps([predicate("role", "in", [str(value) for value in range(101)])]),
        json.dumps([predicate("description", "in", ["one"])]),
        json.dumps([predicate("is_active", "contains", "true")]),
        json.dumps([predicate("is_active", "equals", "false")]),
        json.dumps([predicate("id", "equals", True)]),
        json.dumps([predicate("id", "equals", 2147483648)]),
        json.dumps([predicate("user_count", "equals", 10**400)]),
        json.dumps([predicate("user_count", "between", [2, 1])]),
        json.dumps([predicate("role", "contains", "x" * 201)]),
        json.dumps([predicate("role", "equals", "a"), predicate("role", "equals", "b")]),
        json.dumps([predicate("createtime", "equals", "2026-02-30T00:00:00Z")]),
        json.dumps([predicate("createtime", "equals", "2026-02-29")]),
        json.dumps([predicate("createtime", "equals", "9999-12-31")]),
        json.dumps([predicate("createtime", "between", "2026-01-01")]),
        json.dumps([predicate("createtime", "equals", "2026-01-01T00:00:00")]),
        json.dumps([predicate("createtime", "equals", "9999-12-31T23:59:59-01:00")]),
        json.dumps([predicate("createtime", "equals", "0001-01-01T00:00:00+01:00")]),
        json.dumps([{"field": "description", "operator": "empty", "value": "ignored"}]),
    ],
)
def test_invalid_predicates_are_rejected_without_storage_errors(role_client, raw):
    response = role_client.get("/management/roles", params={"filters": raw})
    assert response.status_code == 400
    assert response.json() == {"detail": "INVALID_FILTERS"}


@pytest.mark.parametrize("management_client", ["profile_names"], indirect=True)
def test_profile_names_share_browser_order_nickname_and_missing_content(
    management_client,
):
    for locale, name, ids in [
        ("en", "Ada Lovelace", [1]),
        ("en", "Beta", [2]),
        ("en", "王小明", [5]),
        ("zh-Hant", "李正", [1]),
    ]:
        data = lists(
            management_client,
            "sites",
            locale=locale,
            filters=[predicate("profile_name", "equals", name)],
        )
        assert [row["id"] for row in data["items"]] == ids
    data = lists(
        management_client,
        "sites",
        filters=[predicate("profile_name", "empty")],
        size=100,
        sort="id:desc",
    )
    assert [row["id"] for row in data["items"]] == [7, 6, 4, 3]
