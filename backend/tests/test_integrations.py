import hashlib
import re
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select

from app.config import get_settings
from app.main import app
from app.models import IntegrationToken
from app.services.integration_tokens import (
    INVENTORY_READ_SCOPE,
    create_integration_token,
    parse_scopes,
)


def _create_token(client, name="Test automation"):
    response = client.post(
        "/api/v1/settings/integration-tokens",
        json={"name": name, "scopes": [INVENTORY_READ_SCOPE]},
    )
    assert response.status_code == 201, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_token_creation_returns_plaintext_once_and_stores_only_hash(client, db_session):
    created = _create_token(client)
    plaintext = created["token"]
    assert re.fullmatch(r"tcint_[0-9a-f]{12}_[A-Za-z0-9_-]{43}", plaintext)
    assert created["token_prefix"] in plaintext

    listed = client.get("/api/v1/settings/integration-tokens")
    assert listed.status_code == 200
    assert "token" not in listed.json()[0]
    assert plaintext not in listed.text

    db = db_session()
    record = db.get(IntegrationToken, created["id"])
    assert record.token_hash == hashlib.sha256(plaintext.encode()).hexdigest()
    assert record.token_hash != plaintext
    assert parse_scopes(record.scopes) == [INVENTORY_READ_SCOPE]
    db.close()


def test_generated_prefixes_are_unique_even_after_collision(db_session, monkeypatch):
    import app.services.integration_tokens as token_service

    prefixes = iter(["a" * 12, "a" * 12, "b" * 12])
    monkeypatch.setattr(token_service.secrets, "token_hex", lambda _size: next(prefixes))
    db = db_session()
    first, _ = create_integration_token(db, "First", [INVENTORY_READ_SCOPE])
    db.commit()
    second, _ = create_integration_token(db, "Second", [INVENTORY_READ_SCOPE])
    db.commit()
    assert first.token_prefix == "a" * 12
    assert second.token_prefix == "b" * 12
    db.close()


def test_integration_authentication_failures_return_safe_401(client):
    with TestClient(app) as anonymous:
        for headers in (
            {},
            {"Authorization": "Basic abc"},
            {"Authorization": "Bearer malformed"},
            {"Authorization": f"Bearer tcint_{'f' * 12}_{'A' * 43}"},
        ):
            response = anonymous.get("/api/v1/integrations/health", headers=headers)
            assert response.status_code == 401
            assert response.headers["www-authenticate"] == "Bearer"
            assert response.json() == {"detail": "Invalid or missing integration token"}


def test_valid_revoked_and_insufficient_scope_tokens(client, db_session):
    created = _create_token(client)
    with TestClient(app) as anonymous:
        response = anonymous.get(
            "/api/v1/integrations/health", headers=_headers(created["token"])
        )
        assert response.status_code == 200
        assert response.json()["integration_api"] is True
        db = db_session()
        first_used_at = db.get(IntegrationToken, created["id"]).last_used_at
        db.close()
        assert first_used_at is not None
        assert anonymous.get(
            "/api/v1/integrations/health", headers=_headers(created["token"])
        ).status_code == 200
        db = db_session()
        assert db.get(IntegrationToken, created["id"]).last_used_at == first_used_at
        db.close()

    revoked = client.post(
        f"/api/v1/settings/integration-tokens/{created['id']}/revoke"
    )
    assert revoked.status_code == 200
    assert revoked.json()["active"] is False
    with TestClient(app) as anonymous:
        assert anonymous.get(
            "/api/v1/integrations/health", headers=_headers(created["token"])
        ).status_code == 401

    db = db_session()
    _, no_scope_token = create_integration_token(db, "No scope", [])
    db.commit()
    db.close()
    with TestClient(app) as anonymous:
        assert anonymous.get(
            "/api/v1/integrations/health", headers=_headers(no_scope_token)
        ).status_code == 403


def test_integration_token_cannot_authenticate_existing_or_management_apis(client):
    created = _create_token(client)
    with TestClient(app) as integration_client:
        headers = _headers(created["token"])
        assert integration_client.post(
            "/api/v1/machines",
            headers=headers,
            json={"name": "Must not be created", "machine_type": "VM"},
        ).status_code == 401
        assert integration_client.get(
            "/api/v1/settings/integration-tokens", headers=headers
        ).status_code == 401

    # Normal cookie-session authentication remains unchanged.
    assert client.get("/api/v1/settings").status_code == 200


def test_machine_list_returns_current_inventory_in_stable_name_order(client, machine):
    zulu = client.post(
        "/api/v1/machines",
        json={
            "name": "Zulu host",
            "machine_type": "HOST",
            "status": "Active",
            "ip_address": "192.168.1.70",
        },
    ).json()
    alpha = client.post(
        "/api/v1/machines",
        json={
            "name": "alpha appliance",
            "machine_type": "PHYSICAL",
            "status": "Maintenance",
            "dns_record": "alpha.example.test",
        },
    ).json()
    archived = client.post(
        "/api/v1/machines",
        json={
            "name": "Archived machine",
            "machine_type": "LXC",
            "status": "Active",
        },
    ).json()
    assert client.post(f"/api/v1/machines/{archived['id']}/archive").status_code == 200
    created = _create_token(client)

    with TestClient(app) as integration_client:
        response = integration_client.get(
            "/api/v1/integrations/machines",
            headers=_headers(created["token"]),
        )

    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == [alpha["id"], machine["id"], zulu["id"]]
    assert [item["name"] for item in payload] == [
        "alpha appliance",
        "test-vm-01",
        "Zulu host",
    ]
    assert all(item["archived"] is False for item in payload)
    assert payload[0]["machine_type"] == "PHYSICAL"
    assert payload[0]["status"] == "Maintenance"
    assert payload[0]["dns_record"] == "alpha.example.test"
    assert payload[2]["ip_address"] == "192.168.1.70"
    assert archived["id"] not in {item["id"] for item in payload}


def test_machine_and_service_context_include_one_level_relationships(client, machine):
    dependency = client.post(
        "/api/v1/machines",
        json={
            "name": "Dependency machine",
            "machine_type": "LXC",
            "status": "Active",
            "ip_address": "192.168.1.60",
            "dns_record": "dependency.example.test",
        },
    ).json()
    dependent = client.post(
        "/api/v1/machines",
        json={"name": "Dependent machine", "machine_type": "VM"},
    ).json()
    service = client.post(
        f"/api/v1/machines/{machine['id']}/services",
        json={
            "name": "Example Service",
            "description": "Test service",
            "port": 8080,
            "protocol": "HTTP",
            "url": "http://192.168.1.50:8080",
        },
    ).json()
    client.post(
        f"/api/v1/machines/{machine['id']}/dependencies",
        json={"depends_on_machine_id": dependency["id"], "dependency_type": "Database"},
    )
    client.post(
        f"/api/v1/machines/{machine['id']}/dependencies",
        json={"external_name": "External API", "dependency_type": "API", "notes": "Stored note"},
    )
    client.post(
        f"/api/v1/machines/{dependent['id']}/dependencies",
        json={"depends_on_machine_id": machine["id"], "dependency_type": "Service"},
    )
    created = _create_token(client)

    with TestClient(app) as integration_client:
        headers = _headers(created["token"])
        machine_response = integration_client.get(
            f"/api/v1/integrations/machines/{machine['id']}/context", headers=headers
        )
        assert machine_response.status_code == 200
        context = machine_response.json()
        assert context["machine"]["name"] == machine["name"]
        assert context["machine"]["machine_type"] == "VM"
        assert context["machine"]["archived"] is False
        assert context["machine"]["tags"] == ["docker", "test"]
        assert [item["name"] for item in context["services"]] == ["Example Service"]
        assert context["dependencies"][0]["target_machine"]["id"] == dependency["id"]
        assert context["dependencies"][1]["external_name"] == "External API"
        assert context["dependents"][0]["machine"]["id"] == dependent["id"]

        services_response = integration_client.get(
            f"/api/v1/integrations/machines/{machine['id']}/services", headers=headers
        )
        assert services_response.json()["services"][0]["id"] == service["id"]

        service_response = integration_client.get(
            f"/api/v1/integrations/services/{service['id']}/context", headers=headers
        )
        service_context = service_response.json()
        assert service_context["service"]["name"] == "Example Service"
        assert service_context["machine"]["id"] == machine["id"]
        assert len(service_context["dependencies"]) == 2
        assert len(service_context["dependents"]) == 1


def test_archived_direct_lookups_and_missing_records(client, machine):
    service = client.post(
        f"/api/v1/machines/{machine['id']}/services", json={"name": "Archived service"}
    ).json()
    created = _create_token(client)
    client.post(f"/api/v1/machines/{machine['id']}/archive")
    with TestClient(app) as integration_client:
        headers = _headers(created["token"])
        response = integration_client.get(
            f"/api/v1/integrations/machines/{machine['id']}/context", headers=headers
        )
        assert response.status_code == 200
        assert response.json()["machine"]["archived"] is True
        service_response = integration_client.get(
            f"/api/v1/integrations/services/{service['id']}/context", headers=headers
        )
        assert service_response.status_code == 200
        assert service_response.json()["machine"]["archived"] is True
        assert integration_client.get(
            "/api/v1/integrations/machines/999999/context", headers=headers
        ).status_code == 404
        assert integration_client.get(
            "/api/v1/integrations/services/999999/context", headers=headers
        ).status_code == 404


def test_service_lookup_is_exact_case_insensitive_and_detects_ambiguity(client, machine):
    first = client.post(
        f"/api/v1/machines/{machine['id']}/services", json={"name": "Status Page"}
    ).json()
    created = _create_token(client)
    with TestClient(app) as integration_client:
        headers = _headers(created["token"])
        base = "/api/v1/integrations/services/lookup"
        response = integration_client.get(
            base, params={"machine_id": machine["id"], "name": "status page"}, headers=headers
        )
        assert response.status_code == 200
        assert response.json()["service"]["id"] == first["id"]
        assert integration_client.get(
            base, params={"machine_id": machine["id"], "name": "Status"}, headers=headers
        ).status_code == 404
        assert integration_client.get(
            base, params={"machine_id": 0, "name": "Status Page"}, headers=headers
        ).status_code == 422
        assert integration_client.get(
            base, params={"machine_id": machine["id"], "name": " "}, headers=headers
        ).status_code == 422

        client.post(
            f"/api/v1/machines/{machine['id']}/services", json={"name": "STATUS PAGE"}
        )
        assert integration_client.get(
            base, params={"machine_id": machine["id"], "name": "Status Page"}, headers=headers
        ).status_code == 409


def test_hashes_and_plaintext_are_absent_from_serialization_and_export(client):
    created = _create_token(client)
    listed_text = client.get("/api/v1/settings/integration-tokens").text
    export_text = client.get("/api/v1/data/export").text
    assert created["token"] not in listed_text
    assert "token_hash" not in listed_text
    assert "integration_tokens" not in export_text
    assert created["token"] not in export_text
    assert "token_hash" not in export_text


def test_factory_reset_deletes_integration_tokens(client, db_session):
    from app.services.reset import reset_application

    _create_token(client)
    db = db_session()
    assert db.scalar(select(IntegrationToken.id)) is not None
    reset_application(db)
    assert db.scalar(select(IntegrationToken.id)) is None
    db.close()


def test_cli_create_list_and_revoke(db_session, monkeypatch, capsys):
    import app.cli as cli

    monkeypatch.setattr(cli, "SessionLocal", db_session)
    assert cli.main(
        ["integration-token", "create", "--name", "CLI automation", "--scope", INVENTORY_READ_SCOPE]
    ) == 0
    create_output = capsys.readouterr().out
    plaintext = next(line for line in create_output.splitlines() if line.startswith("tcint_"))

    assert cli.main(["integration-token", "list"]) == 0
    list_output = capsys.readouterr().out
    assert "CLI automation" in list_output
    assert plaintext not in list_output
    assert hashlib.sha256(plaintext.encode()).hexdigest() not in list_output

    db = db_session()
    record = db.scalar(select(IntegrationToken))
    selector = record.token_prefix[:8]
    db.close()
    assert cli.main(["integration-token", "revoke", selector]) == 0
    assert "revoked" in capsys.readouterr().out
    assert cli.main(["integration-token", "revoke", selector]) == 0
    assert "already revoked" in capsys.readouterr().out


def test_alembic_upgrade_from_previous_schema(tmp_path, monkeypatch):
    database_path = tmp_path / "migration.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    get_settings.cache_clear()
    try:
        config = Config("alembic.ini")
        command.upgrade(config, "a7b8c9d0e1f2")
        previous_engine = create_engine(f"sqlite:///{database_path}")
        assert "integration_tokens" not in inspect(previous_engine).get_table_names()
        previous_engine.dispose()
        command.upgrade(config, "head")
        engine = create_engine(f"sqlite:///{database_path}")
        inspector = inspect(engine)
        assert "integration_tokens" in inspector.get_table_names()
        assert {column["name"] for column in inspector.get_columns("integration_tokens")} == {
            "id",
            "name",
            "token_prefix",
            "token_hash",
            "scopes",
            "created_at",
            "last_used_at",
            "revoked_at",
        }
        engine.dispose()
    finally:
        get_settings.cache_clear()
