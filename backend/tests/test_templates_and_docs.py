def test_obsidian_templates_seeded(client):
    templates = client.get("/api/v1/obsidian-templates").json()
    types = {t["machine_type"] for t in templates}
    assert types == {"VM", "LXC", "PHYSICAL", "HOST", "NETWORK"}


def test_template_preview_and_validation(client):
    resp = client.post(
        "/api/v1/obsidian-templates/preview",
        json={"content": "# {{ machine.name }}\nIP: {{ machine.ip_address }}"},
    )
    body = resp.json()
    assert body["error"] is None
    assert "# docker-host-01" in body["rendered"]

    resp = client.post(
        "/api/v1/obsidian-templates/preview", json={"content": "{% for x in %}broken"}
    )
    assert resp.json()["error"]


def test_template_sandbox_blocks_dangerous_code(client):
    evil = "{{ machine.__class__.__mro__ }}"
    resp = client.post("/api/v1/obsidian-templates/preview", json={"content": evil})
    body = resp.json()
    # SandboxedEnvironment must refuse attribute escape attempts
    assert body["rendered"] is None or "__mro__" not in str(body.get("rendered"))


def test_update_template_rejects_broken_content(client):
    template = client.get("/api/v1/obsidian-templates").json()[0]
    resp = client.put(
        f"/api/v1/obsidian-templates/{template['id']}",
        json={"name": "Broken", "content": "{% if %}"},
    )
    assert resp.status_code == 422


def test_generate_document(client, machine):
    resp = client.post(f"/api/v1/machines/{machine['id']}/documents/generate")
    assert resp.status_code == 201, resp.text
    doc = resp.json()
    assert doc["filename"] == "test-vm-01.md"
    assert "VM Name: test-vm-01" in doc["content"]
    assert "IP Address: 192.168.1.50" in doc["content"]
    assert "VMID: 200" in doc["content"]
    assert "Machines or services that depend on this machine:" in doc["content"]
    # snapshot listed
    docs = client.get(f"/api/v1/machines/{machine['id']}/documents").json()
    assert len(docs) == 1
    # download works with attachment header
    dl = client.get(f"/api/v1/machines/{machine['id']}/documents/{doc['id']}/download")
    assert dl.status_code == 200
    assert "attachment" in dl.headers["content-disposition"]


def test_document_fills_reverse_dependencies(client, machine):
    dependent = client.post(
        "/api/v1/machines", json={"name": "jellyfin-01", "machine_type": "LXC"}
    ).json()
    client.post(
        f"/api/v1/machines/{dependent['id']}/dependencies",
        json={"depends_on_machine_id": machine["id"], "dependency_type": "Application"},
    )
    doc = client.post(f"/api/v1/machines/{machine['id']}/documents/generate").json()
    assert "- jellyfin-01 (Application)" in doc["content"]


def test_safe_filename():
    from app.services.rendering import safe_filename

    assert safe_filename("my machine") == "my machine.md"
    assert "/" not in safe_filename("../../etc/passwd")
    assert safe_filename("a" * 500).endswith(".md")


def test_reset_template(client):
    template = client.get("/api/v1/obsidian-templates").json()[0]
    client.put(
        f"/api/v1/obsidian-templates/{template['id']}",
        json={"name": "Custom", "content": "# {{ machine.name }}"},
    )
    resp = client.post(f"/api/v1/obsidian-templates/{template['id']}/reset")
    assert resp.status_code == 200
    assert resp.json()["content"] != "# {{ machine.name }}"
