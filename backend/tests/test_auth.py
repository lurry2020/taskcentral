from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

DEFAULT_USERNAME = get_settings().auth_username
DEFAULT_PASSWORD = get_settings().auth_password


def test_protected_routes_require_auth():
    # A client with no Authorization header is rejected on protected routes.
    with TestClient(app) as anon:
        assert anon.get("/api/v1/machines").status_code == 401
        assert anon.get("/api/v1/settings").status_code == 401
        # Health + login stay open (login here fails creds but is reachable, not 401-from-mw)
        assert anon.get("/api/v1/health").status_code == 200


def test_login_success_and_me(client):
    # correct password, username case-insensitive
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": DEFAULT_USERNAME.upper(), "password": DEFAULT_PASSWORD},
    )
    assert resp.status_code == 200
    token = resp.json()["token"]
    assert resp.json()["username"] == DEFAULT_USERNAME

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == DEFAULT_USERNAME


def test_login_password_is_case_sensitive(client):
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD.upper()},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"username": DEFAULT_USERNAME, "password": "wrong"}
        ).status_code
        == 401
    )


def test_bad_token_rejected(client):
    resp = client.get("/api/v1/machines", headers={"Authorization": "Bearer not.a.validtoken"})
    assert resp.status_code == 401


def test_cli_setpassword_changes_login(db_session):
    from app.services.auth import (
        check_credentials,
        clear_password,
        set_login_username,
        set_password,
    )

    db = db_session()
    # Default: env/config password works, an arbitrary one does not.
    assert check_credentials(db, DEFAULT_USERNAME, DEFAULT_PASSWORD) is True
    assert check_credentials(db, DEFAULT_USERNAME, "brand-new-pass") is False

    # After setpassword: the new password works, the old one no longer does.
    set_password(db, "brand-new-pass")
    db.commit()
    assert check_credentials(db, DEFAULT_USERNAME, "brand-new-pass") is True
    assert check_credentials(db, DEFAULT_USERNAME.upper(), "brand-new-pass") is True
    assert check_credentials(db, DEFAULT_USERNAME, DEFAULT_PASSWORD) is False
    assert check_credentials(db, DEFAULT_USERNAME, "BRAND-NEW-PASS") is False

    # Reset clears the override → back to the env/config password.
    assert clear_password(db) is True
    db.commit()
    assert check_credentials(db, DEFAULT_USERNAME, DEFAULT_PASSWORD) is True
    assert check_credentials(db, DEFAULT_USERNAME, "brand-new-pass") is False

    # A username selected during setup is stored independently of the password
    # and remains case-insensitive.
    set_login_username(db, "homelab-admin")
    db.commit()
    assert check_credentials(db, "HOMELAB-ADMIN", DEFAULT_PASSWORD) is True
    assert check_credentials(db, DEFAULT_USERNAME, DEFAULT_PASSWORD) is False
    db.close()


def test_password_hash_excluded_from_export(client, db_session):
    from app.services.auth import set_password

    db = db_session()
    set_password(db, "secret-pass")
    db.commit()
    db.close()
    # Login uses the new password now (set via the CLI helper)…
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": DEFAULT_USERNAME, "password": "secret-pass"},
        ).status_code
        == 200
    )
    # …but the hash is never included in a data export.
    export = client.get("/api/v1/data/export").json()
    assert "auth_password_hash" not in export["settings"]
    assert "setup_completed" not in export["settings"]
