import os
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "sqlite://")

from app.config import get_settings  # noqa: E402
from app.database import build_engine, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import ApplicationSetting, Base  # noqa: E402
from app.services.setup import SETUP_COMPLETED_KEY  # noqa: E402
from app.services.auth import create_token  # noqa: E402
from app.services.seed import seed_all  # noqa: E402


@pytest.fixture()
def db_session(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestSession()
    seed_all(session)
    # Most tests model an installation that has already completed first-run
    # setup. Setup-specific tests explicitly switch this isolated flag off.
    setup_row = session.get(ApplicationSetting, SETUP_COMPLETED_KEY)
    setup_row.value = json.dumps(True)
    session.commit()
    yield TestSession
    session.close()
    engine.dispose()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        db = db_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # lifespan seeding hits the real DB config; use a plain TestClient without lifespan side effects.
    # Authenticate every request (auth middleware protects all /api/v1 routes).
    token = create_token(get_settings().auth_username)
    with TestClient(app, raise_server_exceptions=True, headers={"Authorization": f"Bearer {token}"}) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def machine(client):
    resp = client.post(
        "/api/v1/machines",
        json={
            "name": "test-vm-01",
            "machine_type": "VM",
            "status": "In Progress",
            "host": "proxmox-01",
            "vmid": 200,
            "ip_address": "192.168.1.50",
            "dns_record": "test-vm-01.home.arpa",
            "tags": ["test", "docker"],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
