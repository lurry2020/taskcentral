import json

from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.database import build_engine
from app.models import (
    Base,
    Machine,
    NetworkDevice,
    NetworkSegment,
    StorageDevice,
)
from app.routers.data import build_export, import_data
from app.services.seed import seed_all


def _database(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'import-test.db'}")
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def test_export_import_roundtrip_supports_host_and_network_records(tmp_path):
    engine, session_factory = _database(tmp_path)
    source = session_factory()
    try:
        seed_all(source)
        host = Machine(name="Import Host", machine_type="HOST", status="Active")
        network = Machine(name="Import Network", machine_type="NETWORK", status="Active")
        source.add_all([host, network])
        source.flush()
        source.add_all(
            [
                StorageDevice(
                    machine_id=host.id,
                    name="nvme0n1",
                    capacity="1 TB",
                    purpose="VM storage",
                    sort_order=10,
                ),
                NetworkDevice(
                    machine_id=network.id,
                    name="Core switch",
                    role="Switch",
                    ip_address="192.168.1.2",
                    sort_order=10,
                ),
                NetworkSegment(
                    machine_id=network.id,
                    name="Main",
                    vlan_id=1,
                    subnet="192.168.1.0/24",
                    sort_order=10,
                ),
            ]
        )
        source.commit()
        exported = build_export(source)
    finally:
        source.close()

    assert {machine["machine_type"] for machine in exported["machines"]} == {"HOST", "NETWORK"}

    importer = session_factory()
    try:
        dry_run = import_data(exported, dry_run=True, db=importer)
        assert dry_run["valid"] is True
        assert dry_run["summary"]["storage_devices"] == 1
        assert dry_run["summary"]["network_devices"] == 1
        assert dry_run["summary"]["network_segments"] == 1

        imported = import_data(exported, dry_run=False, db=importer)
        assert imported["imported"] is True
    finally:
        importer.close()

    verifier = session_factory()
    try:
        assert set(verifier.scalars(select(Machine.machine_type))) == {"HOST", "NETWORK"}
        assert verifier.scalar(select(func.count()).select_from(StorageDevice)) == 1
        assert verifier.scalar(select(func.count()).select_from(NetworkDevice)) == 1
        assert verifier.scalar(select(func.count()).select_from(NetworkSegment)) == 1
    finally:
        verifier.close()
        engine.dispose()


def test_invalid_import_returns_a_useful_422_detail(tmp_path):
    engine, session_factory = _database(tmp_path)
    db = session_factory()
    try:
        response = import_data(
            {
                "format": "taskcentral-export",
                "version": 1,
                "machines": [
                    {"id": 1, "name": "Unknown type", "machine_type": "NOT_A_MACHINE_TYPE"},
                ],
                "settings": {},
            },
            dry_run=True,
            db=db,
        )
        body = json.loads(response.body)

        assert response.status_code == 422
        assert body["valid"] is False
        assert body["errors"] == ["Machine record invalid: 'Unknown type'"]
        assert body["detail"] == (
            "Import validation failed: Machine record invalid: 'Unknown type'"
        )
    finally:
        db.close()
        engine.dispose()
