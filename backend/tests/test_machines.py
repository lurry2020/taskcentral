def test_health(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_create_machine_generates_checklist(client, machine):
    assert machine["name"] == "test-vm-01"
    assert machine["progress"]["total_tasks"] >= 24
    tasks = client.get(f"/api/v1/machines/{machine['id']}/tasks").json()
    titles = [t["title"] for t in tasks]
    assert "Create or configure the machine" in titles
    assert "Mark deployment complete" in titles
    # PHYSICAL-only template must not be copied to a VM
    assert "Record hardware inventory details" not in titles


def test_create_host_machine_and_document(client):
    resp = client.post(
        "/api/v1/machines",
        json={
            "name": "proxmox-01",
            "machine_type": "HOST",
            "status": "Active",
            "ip_address": "192.168.1.2",
            "hardware_model": "Dell R730",
        },
    )
    assert resp.status_code == 201, resp.text
    host = resp.json()
    assert host["machine_type"] == "HOST"
    # A HOST machine still generates a checklist from ALL-scoped templates
    assert host["progress"]["total_tasks"] >= 1
    # And it can render its own Obsidian document (HOST template is seeded)
    doc = client.post(f"/api/v1/machines/{host['id']}/documents/generate")
    assert doc.status_code == 201, doc.text
    assert "Host Name: proxmox-01" in doc.json()["content"]


def test_host_storage_and_guest_linking(client):
    # Create a host with two drives
    host = client.post(
        "/api/v1/machines",
        json={
            "name": "proxmox-01",
            "machine_type": "HOST",
            "status": "Active",
            "hypervisor": "Proxmox VE 9",
            "storage": [
                {"name": "nvme0n1", "capacity": "1 TB", "purpose": "VM disks"},
                {"name": "sda", "capacity": "4 TB", "purpose": "Backups"},
            ],
        },
    ).json()
    drives = client.get(f"/api/v1/machines/{host['id']}/storage").json()
    assert [d["name"] for d in drives] == ["nvme0n1", "sda"]

    # A VM that names the host is auto-linked as a dependency of the host
    vm = client.post(
        "/api/v1/machines",
        json={"name": "docker-host-01", "machine_type": "VM", "host": "proxmox-01", "vmid": 104},
    ).json()
    # VM depends on the host
    vm_deps = client.get(f"/api/v1/machines/{vm['id']}/dependencies").json()
    assert any(d["depends_on_machine_name"] == "proxmox-01" for d in vm_deps)
    # Host lists the VM as a machine that depends on it (its guest)
    reverse = client.get(f"/api/v1/machines/{host['id']}/dependencies/reverse").json()
    assert any(r["machine_name"] == "docker-host-01" for r in reverse)

    # The host document renders storage and hosted guests
    doc = client.post(f"/api/v1/machines/{host['id']}/documents/generate").json()
    assert "Hypervisor: Proxmox VE 9" in doc["content"]
    assert "nvme0n1" in doc["content"] and "4 TB" in doc["content"]
    assert "docker-host-01 (VM)" in doc["content"]


def test_host_links_preexisting_guest(client):
    # VM created first (host is free text, no host machine yet)
    client.post(
        "/api/v1/machines",
        json={"name": "vm-early", "machine_type": "LXC", "host": "pve-later"},
    )
    host = client.post(
        "/api/v1/machines", json={"name": "pve-later", "machine_type": "HOST"}
    ).json()
    reverse = client.get(f"/api/v1/machines/{host['id']}/dependencies/reverse").json()
    assert any(r["machine_name"] == "vm-early" for r in reverse)


def test_network_machine_full(client):
    net = client.post(
        "/api/v1/machines",
        json={
            "name": "Home Network",
            "machine_type": "NETWORK",
            "status": "Active",
            "hardware_model": "UniFi Dream Router 7 (UDR7)",
            "ip_address": "192.168.1.1",
            "isp": "Brightspeed",
            "connection_type": "Fiber (FTTH)",
            "download_speed": "1 Gbps",
            "upload_speed": "1 Gbps",
            "wan_type": "Dynamic Public IP",
            "responsibilities": "Routing\nDHCP\nFirewall",
            "network_devices": [
                {"name": "USW Flex Mini", "role": "Switch", "ip_address": "192.168.1.115"},
                {"name": "U7 In-Wall", "role": "Access Point", "ip_address": "192.168.1.7"},
            ],
            "network_segments": [
                {"name": "Main", "vlan_id": 1, "subnet": "192.168.1.0/24", "purpose": "Trusted"},
                {"name": "IoT", "vlan_id": 2, "subnet": "192.168.2.0/24", "purpose": "Smart home"},
            ],
        },
    ).json()
    assert net["machine_type"] == "NETWORK"
    # Network gets the basic network checklist only (not the 24 ALL tasks)
    tasks = client.get(f"/api/v1/machines/{net['id']}/tasks").json()
    titles = [t["title"] for t in tasks]
    assert "Configure VLANs and network segments" in titles
    assert "Configure SSH access" not in titles  # ALL-scoped task must NOT apply
    # Devices and segments stored
    devices = client.get(f"/api/v1/machines/{net['id']}/network-devices").json()
    assert {d["role"] for d in devices} == {"Switch", "Access Point"}
    segments = client.get(f"/api/v1/machines/{net['id']}/network-segments").json()
    assert [s["name"] for s in segments] == ["Main", "IoT"]

    # A machine can depend on the network; it shows on the network's reverse deps
    vm = client.post(
        "/api/v1/machines", json={"name": "web-01", "machine_type": "VM"}
    ).json()
    client.post(
        f"/api/v1/machines/{vm['id']}/dependencies",
        json={"depends_on_machine_id": net["id"], "dependency_type": "Network"},
    )
    reverse = client.get(f"/api/v1/machines/{net['id']}/dependencies/reverse").json()
    assert any(r["machine_name"] == "web-01" for r in reverse)

    # Network document renders equipment table, VLANs, internet service, dependents
    doc = client.post(f"/api/v1/machines/{net['id']}/documents/generate").json()
    content = doc["content"]
    assert "| USW Flex Mini | 192.168.1.115 |" in content
    assert "| U7 In-Wall | 192.168.1.7 |" in content
    assert "| Main | 1 | 192.168.1.0/24 | Trusted |" in content
    assert "| ISP | Brightspeed |" in content
    assert "- web-01 (VM)" in content


def test_invalid_ip_rejected(client):
    resp = client.post(
        "/api/v1/machines",
        json={"name": "bad-ip", "machine_type": "VM", "ip_address": "999.1.2.3"},
    )
    assert resp.status_code == 422


def test_duplicate_warnings(client, machine):
    resp = client.post(
        "/api/v1/machines",
        json={
            "name": "test-vm-01",
            "machine_type": "VM",
            "ip_address": "192.168.1.50",
            "vmid": 200,
            "host": "proxmox-01",
        },
    )
    assert resp.status_code == 201
    warnings = resp.json()["warnings"]
    assert any("already exists" in w for w in warnings)
    assert any("192.168.1.50" in w for w in warnings)
    assert any("VMID 200" in w for w in warnings)


def test_update_machine(client, machine):
    resp = client.put(
        f"/api/v1/machines/{machine['id']}",
        json={
            "name": "test-vm-01",
            "machine_type": "VM",
            "status": "Active",
            "ip_address": "192.168.1.51",
            "tags": ["updated"],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Active"
    assert body["tags"] == ["updated"]


def test_archive_and_list_filters(client, machine):
    resp = client.post(f"/api/v1/machines/{machine['id']}/archive")
    assert resp.status_code == 200
    assert resp.json()["archived_at"] is not None
    active = client.get("/api/v1/machines").json()
    assert active["total"] == 0
    archived = client.get("/api/v1/machines", params={"archived": True}).json()
    assert archived["total"] == 1


def test_delete_machine(client, machine):
    assert client.delete(f"/api/v1/machines/{machine['id']}").status_code == 204
    assert client.get(f"/api/v1/machines/{machine['id']}").status_code == 404


def test_duplicate_machine_clears_identity(client, machine):
    # add a service to source
    client.post(
        f"/api/v1/machines/{machine['id']}/services",
        json={"name": "Pi-hole", "port": 80},
    )
    resp = client.post(
        f"/api/v1/machines/{machine['id']}/duplicate",
        json={"name": "test-vm-02", "copy_services": True, "copy_dependencies": False},
    )
    assert resp.status_code == 201
    clone = resp.json()
    assert clone["name"] == "test-vm-02"
    assert clone["ip_address"] is None
    assert clone["vmid"] is None
    assert clone["dns_record"] is None
    assert clone["status"] == "Draft"
    assert clone["progress"]["completed_tasks"] == 0
    services = client.get(f"/api/v1/machines/{clone['id']}/services").json()
    assert [s["name"] for s in services] == ["Pi-hole"]


def test_search_and_filter(client, machine):
    resp = client.get("/api/v1/machines", params={"search": "test-vm"})
    assert resp.json()["total"] == 1
    resp = client.get("/api/v1/machines", params={"machine_type": "LXC"})
    assert resp.json()["total"] == 0
    resp = client.get("/api/v1/machines", params={"tag": "docker"})
    assert resp.json()["total"] == 1
