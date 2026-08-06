def test_services_crud(client, machine):
    resp = client.post(
        f"/api/v1/machines/{machine['id']}/services",
        json={"name": "Jellyfin", "port": 8096, "protocol": "HTTP", "url": "http://192.168.1.50:8096"},
    )
    assert resp.status_code == 201
    svc = resp.json()
    resp = client.put(
        f"/api/v1/machines/{machine['id']}/services/{svc['id']}",
        json={"name": "Jellyfin", "port": 8920, "is_external": True},
    )
    assert resp.json()["port"] == 8920
    assert client.post(
        f"/api/v1/machines/{machine['id']}/services",
        json={"name": "bad", "port": 99999},
    ).status_code == 422
    assert client.delete(f"/api/v1/machines/{machine['id']}/services/{svc['id']}").status_code == 204


def test_dependencies_and_reverse(client, machine):
    other = client.post(
        "/api/v1/machines", json={"name": "pihole-01", "machine_type": "LXC"}
    ).json()
    resp = client.post(
        f"/api/v1/machines/{machine['id']}/dependencies",
        json={"depends_on_machine_id": other["id"], "dependency_type": "DNS"},
    )
    assert resp.status_code == 201
    assert resp.json()["depends_on_machine_name"] == "pihole-01"
    # self-dependency rejected
    resp = client.post(
        f"/api/v1/machines/{machine['id']}/dependencies",
        json={"depends_on_machine_id": machine["id"], "dependency_type": "DNS"},
    )
    assert resp.status_code == 400
    # reverse view
    reverse = client.get(f"/api/v1/machines/{other['id']}/dependencies/reverse").json()
    assert [r["machine_name"] for r in reverse] == ["test-vm-01"]
    # external dependency
    resp = client.post(
        f"/api/v1/machines/{machine['id']}/dependencies",
        json={"external_name": "Cloudflare DNS", "dependency_type": "DNS"},
    )
    assert resp.status_code == 201


def test_notes_crud(client, machine):
    resp = client.post(
        f"/api/v1/machines/{machine['id']}/notes",
        json={"title": "Install notes", "content": "Used the **Debian 12** template."},
    )
    assert resp.status_code == 201
    note = resp.json()
    resp = client.put(
        f"/api/v1/machines/{machine['id']}/notes/{note['id']}",
        json={"title": "Install notes", "content": "Updated."},
    )
    assert resp.json()["content"] == "Updated."
    assert client.delete(f"/api/v1/machines/{machine['id']}/notes/{note['id']}").status_code == 204


def test_activity_history(client, machine):
    tasks = client.get(f"/api/v1/machines/{machine['id']}/tasks").json()
    client.patch(
        f"/api/v1/machines/{machine['id']}/tasks/{tasks[0]['id']}",
        json={"status": "Completed"},
    )
    events = client.get(f"/api/v1/machines/{machine['id']}/activity").json()
    types = [e["event_type"] for e in events]
    assert "machine_created" in types
    assert "task_completed" in types


def test_dashboard(client, machine):
    resp = client.get("/api/v1/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"]["total_machines"] == 1
    assert body["recent_machines"][0]["name"] == "test-vm-01"


def test_timezone_setting_affects_documents(client, machine):
    # Default timezone is US Eastern; invalid zones are rejected
    assert client.get("/api/v1/settings").json()["timezone"] == "America/New_York"
    assert client.put("/api/v1/settings", json={"timezone": "Mars/Phobos"}).status_code == 422

    # Use a VM template that prints the created timestamp
    vm_tpl = [
        t for t in client.get("/api/v1/obsidian-templates").json() if t["machine_type"] == "VM"
    ][0]
    client.put(
        f"/api/v1/obsidian-templates/{vm_tpl['id']}",
        json={"name": "TZ", "content": "Created: {{ machine.created_at }}"},
    )

    assert client.put("/api/v1/settings", json={"timezone": "Asia/Tokyo"}).status_code == 200
    doc = client.post(f"/api/v1/machines/{machine['id']}/documents/generate").json()
    assert "JST" in doc["content"]

    client.put("/api/v1/settings", json={"timezone": "UTC"})
    doc2 = client.post(f"/api/v1/machines/{machine['id']}/documents/generate").json()
    assert "UTC" in doc2["content"]


def test_settings_roundtrip(client):
    resp = client.get("/api/v1/settings")
    assert resp.json()["app_name"] == "Task Central"
    resp = client.put(
        "/api/v1/settings",
        json={"default_page_size": 50, "obsidian_include_not_applicable": True},
    )
    assert resp.json()["default_page_size"] == 50
    assert resp.json()["obsidian_include_not_applicable"] is True
    # invalid filename format rejected
    resp = client.put("/api/v1/settings", json={"obsidian_filename_format": "../{name}.md"})
    assert resp.status_code == 422


def test_export_import_roundtrip(client, machine):
    client.post(f"/api/v1/machines/{machine['id']}/services", json={"name": "Pi-hole", "port": 80})
    export = client.get("/api/v1/data/export").json()
    assert export["format"] == "taskcentral-export"
    assert len(export["machines"]) == 1

    # dry run validates without changing anything
    resp = client.post("/api/v1/data/import", params={"dry_run": True}, json=export)
    assert resp.json()["valid"] is True
    assert resp.json()["imported"] is False

    resp = client.post("/api/v1/data/import", json=export)
    assert resp.json()["imported"] is True
    machines = client.get("/api/v1/machines").json()
    assert machines["total"] == 1
    services = client.get(f"/api/v1/machines/{machine['id']}/services").json()
    assert [s["name"] for s in services] == ["Pi-hole"]
    restored_machine = client.get(f"/api/v1/machines/{machine['id']}").json()
    assert restored_machine["obsidian_document_needs_regeneration"] is True

    # invalid file rejected
    resp = client.post("/api/v1/data/import", json={"format": "nope"})
    assert resp.status_code == 422


def test_meta_options(client):
    body = client.get("/api/v1/meta/options").json()
    assert "Provisioning" in body["task_categories"]
    assert "DNS" in body["dependency_types"]
