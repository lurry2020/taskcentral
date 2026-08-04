"""Default seed content: task templates, Obsidian templates, application settings."""

# (title, description, category, scope, required) - sort order comes from list position
DEFAULT_TASK_TEMPLATES: list[tuple[str, str, str, str, bool]] = [
    ("Create or configure the machine", "Provision the VM/LXC or set up the physical hardware.", "Provisioning", "ALL", True),
    ("Configure hostname", "Set the machine hostname to match its DNS record.", "Operating System", "ALL", True),
    ("Configure operating system", "Base OS configuration: locale, timezone, users, packages.", "Operating System", "ALL", True),
    ("Apply operating system updates", "Run a full update/upgrade cycle before deploying services.", "Operating System", "ALL", True),
    ("Configure SSH access", "Install SSH keys, disable password auth where appropriate.", "Security", "ALL", True),
    ("Configure firewall", "Enable and configure the host firewall for required ports only.", "Security", "ALL", True),
    ("Configure static or reserved IP address", "Assign a static IP or DHCP reservation.", "Network", "ALL", True),
    ("Configure the device in UniFi", "Confirm the device appears in the UniFi controller.", "UniFi", "ALL", True),
    ("Set the UniFi device alias", "Give the device a recognizable alias in UniFi.", "UniFi", "ALL", True),
    ("Set the UniFi device icon", "Assign the appropriate device icon in UniFi.", "UniFi", "ALL", False),
    ("Configure the UniFi fixed IP address", "Set the fixed IP assignment in UniFi to match the planned address.", "UniFi", "ALL", True),
    ("Add DNS record to Pi-hole", "Create the local DNS record in Pi-hole.", "DNS", "ALL", True),
    ("Verify forward DNS resolution", "Confirm the DNS name resolves to the expected IP.", "DNS", "ALL", True),
    ("Verify reverse DNS resolution where applicable", "Confirm PTR lookups resolve where reverse DNS is configured.", "DNS", "ALL", False),
    ("Add machine to Uptime Kuma", "Create an Uptime Kuma monitor for the machine or its key service.", "Monitoring", "ALL", True),
    ("Add machine or service to Homarr", "Add a Homarr dashboard tile for the machine or its services.", "Dashboard", "ALL", False),
    ("Add machine documentation to Obsidian", "Generate the Obsidian document in Task Central and paste it into the vault.", "Documentation", "ALL", True),
    ("Add machine or services to Caddy where applicable", "Add reverse proxy entries for exposed services. Mark Not Applicable if none.", "Reverse Proxy", "ALL", False),
    ("Verify service accessibility", "Confirm each service is reachable at its expected URL/port.", "Validation", "ALL", True),
    ("Verify monitoring", "Confirm monitors report Up and alerting works.", "Monitoring", "ALL", True),
    ("Verify backups", "Confirm the machine or its data is included in the backup rotation.", "Backup", "ALL", True),
    ("Record credentials or secret location", "Record where credentials/secrets are stored (e.g. password manager entry).", "Security", "ALL", True),
    ("Complete final validation", "Final review: all fields recorded, services documented, checklist accurate.", "Validation", "ALL", True),
    ("Mark deployment complete", "Set the machine status to Active once everything is verified.", "Validation", "ALL", True),
    ("Record hardware inventory details", "Record model, serial number, and asset tag for physical inventory.", "Provisioning", "PHYSICAL", False),
    # Basic network checklist (NETWORK machines get only these, not the ALL tasks)
    ("Configure the WAN / internet connection", "Bring up the WAN link and confirm the ISP connection is online.", "Network", "NETWORK", True),
    ("Configure VLANs and network segments", "Create the VLANs/subnets for your network segments.", "Network", "NETWORK", True),
    ("Configure DHCP scopes per VLAN", "Set DHCP ranges and options for each network.", "Network", "NETWORK", True),
    ("Configure DNS forwarding", "Point clients at your DNS resolver (e.g. Pi-hole) and set upstreams.", "DNS", "NETWORK", True),
    ("Configure inter-VLAN firewall rules", "Restrict traffic between VLANs (isolate IoT/guest as needed).", "Security", "NETWORK", True),
    ("Configure Wi-Fi SSIDs", "Create SSIDs and map them to the correct VLANs.", "Network", "NETWORK", True),
    ("Adopt and configure switches", "Adopt switches in the controller and configure ports/VLANs.", "Network", "NETWORK", True),
    ("Adopt and configure access points", "Adopt APs and confirm coverage and band settings.", "Network", "NETWORK", True),
    ("Configure VPN access", "Set up remote-access or site-to-site VPN if needed.", "Security", "NETWORK", False),
    ("Set reserved IPs for infrastructure", "Create DHCP reservations / static IPs for key devices.", "Network", "NETWORK", True),
    ("Verify internet speed", "Run a speed test and confirm it matches the plan.", "Validation", "NETWORK", False),
    ("Back up controller configuration", "Export/back up the router/controller configuration.", "Backup", "NETWORK", True),
    ("Add network documentation to Obsidian", "Generate the network document in Task Central and paste it into the vault.", "Documentation", "NETWORK", True),
    ("Verify monitoring and alerts", "Confirm the network/WAN is monitored and alerting works.", "Monitoring", "NETWORK", False),
]

# (title, description, category, scope, interval_days) - recurring maintenance
# reminders. NETWORK machines get only NETWORK-scoped ones; every other type gets
# ALL plus its own type-scoped ones (mirrors the checklist scoping).
DEFAULT_REMINDER_TEMPLATES: list[tuple[str, str, str, str, int]] = [
    ("Apply OS updates", "Run apt update && apt upgrade (or your distro's equivalent) and reboot if a new kernel landed.", "Operating System", "ALL", 7),
    ("Update installed packages & container images", "Pull the latest container images / update installed apps and redeploy.", "Operating System", "ALL", 14),
    ("Verify backups", "Confirm this machine's backups ran recently and a restore has been tested.", "Backup", "ALL", 7),
    ("Review disk usage", "Check free space, prune logs/caches, and clean up as needed.", "Operating System", "ALL", 30),
    ("Review logs & service health", "Scan logs and confirm services are healthy and reachable.", "Validation", "ALL", 30),
    ("Rotate or review credentials", "Rotate keys/passwords and confirm the password manager entry is current.", "Security", "ALL", 180),
    ("Prune VM snapshots", "Delete stale snapshots to reclaim storage.", "Provisioning", "VM", 30),
    ("Review container config", "Confirm resource limits, mounts, and autostart are still correct.", "Provisioning", "LXC", 90),
    ("Update hypervisor packages", "Update the Proxmox/ESXi host and reboot during a maintenance window.", "Operating System", "HOST", 30),
    ("Check storage pool health", "Run a ZFS scrub / check SMART on the host's disks.", "Backup", "HOST", 30),
    ("Verify host backups (vzdump)", "Confirm guest backups completed and are restorable.", "Backup", "HOST", 7),
    ("Review resource allocation", "Rebalance CPU/RAM across guests and check for contention.", "Provisioning", "HOST", 90),
    ("Check disk SMART health", "Review SMART stats and replace any failing drive.", "Backup", "PHYSICAL", 30),
    ("Clean / dust hardware", "Physically clean the machine and check fans/airflow.", "Provisioning", "PHYSICAL", 180),
    ("Check for firmware / BIOS updates", "Apply firmware/BIOS updates from the vendor.", "Operating System", "PHYSICAL", 180),
    ("Update router / controller firmware", "Apply the latest firmware to the router and adopted devices.", "Network", "NETWORK", 30),
    ("Back up controller configuration", "Export and store a fresh backup of the controller config.", "Backup", "NETWORK", 30),
    ("Review firewall rules", "Audit inter-VLAN and WAN firewall rules for drift.", "Security", "NETWORK", 90),
    ("Review VLANs & Wi-Fi SSIDs", "Confirm segments, SSIDs, and their VLAN mappings are still correct.", "Network", "NETWORK", 90),
    ("Review connected devices & DHCP leases", "Look for unknown/rogue devices and tidy reservations.", "Monitoring", "NETWORK", 30),
    ("Test internet speed / failover", "Run a speed test and verify failover works if configured.", "Validation", "NETWORK", 30),
]

DEFAULT_SETTINGS: dict[str, object] = {
    "app_name": "Task Central",
    "timezone": "America/New_York",
    "default_machine_status": "In Progress",
    "date_format": "YYYY-MM-DD",
    "default_page_size": 25,
    "confirm_destructive": True,
    "default_task_category": "Other",
    "required_task_behavior": "warn",
    "obsidian_filename_format": "{name}.md",
    "obsidian_include_checklist": True,
    "obsidian_include_completed": True,
    "obsidian_include_not_applicable": False,
    # Pending-task alerting (delivered via Telegram)
    "alerts_enabled": False,
    "pending_task_threshold_hours": 24,
    "alert_frequency_hours": 24,
    "reminder_alerts_enabled": False,
    "reminder_send_time": "09:00",
    "telegram_bot_token": "",
    "telegram_chat_id": "",
    # Local-only LLM chat integration
    "llm_enabled": False,
    "llm_provider": "ollama",
    "llm_base_url": "http://host.docker.internal:11434",
    "llm_model": "",
    "llm_api_key": "",
    "llm_timeout_seconds": 60,
    "llm_include_manual": True,
}

TASK_CATEGORIES = [
    "Provisioning",
    "Operating System",
    "Network",
    "UniFi",
    "DNS",
    "Monitoring",
    "Dashboard",
    "Reverse Proxy",
    "Documentation",
    "Security",
    "Backup",
    "Validation",
    "Other",
]

DEPENDENCY_TYPES = [
    "Host",
    "DNS",
    "Storage",
    "Network",
    "Authentication",
    "Database",
    "Reverse Proxy",
    "Monitoring",
    "Application",
    "Other",
]

MACHINE_STATUSES = ["Draft", "In Progress", "Active", "Maintenance", "Retired", "Archived"]

def _machine_template(name_label: str, type_label: str, id_line: str, extra_hw: str) -> str:
    return f"""_____________
{name_label}: {{{{ machine.name }}}}
Type: {type_label}
Host: {{{{ machine.host or "" }}}}
{id_line}IP Address: {{{{ machine.ip_address or "" }}}}
DNS Record: {{{{ machine.dns_record or "" }}}}
Operating System: {{{{ machine.operating_system or "" }}}}{{% if machine.operating_system_version %}} {{{{ machine.operating_system_version }}}}{{% endif +%}}
Tags: {{{{ machine.tags | join(", ") }}}}

## Purpose
{{{{ machine.purpose or "" }}}}

## Hardware Resources
**CPU:** {{% if machine.cpu_cores %}}{{{{ machine.cpu_cores }}}} cores{{% if machine.cpu %}} ({{{{ machine.cpu }}}}){{% endif %}}{{% elif machine.cpu %}}{{{{ machine.cpu }}}}{{% endif +%}}
**Memory:** {{{{ machine.memory or "" }}}}
**Disk:** {{{{ machine.disk or "" }}}}
**Storage Location:** {{{{ machine.storage_location or "" }}}}
{extra_hw}_____________
## Services Running
{{% for service in services %}}
- {{{{ service.name }}}}{{% if service.port %}} (:{{{{ service.port }}}}){{% endif %}}{{% if service.url %}} - {{{{ service.url }}}}{{% endif %}}{{% if service.description %}} - {{{{ service.description }}}}{{% endif +%}}
{{% else %}}
-
{{% endfor %}}

___

## Dependencies
This machine depends on:
{{% for dependency in dependencies %}}
- {{{{ dependency.name }}}} ({{{{ dependency.dependency_type }}}}){{% if dependency.notes %}} - {{{{ dependency.notes }}}}{{% endif +%}}
{{% else %}}
-
{{% endfor %}}

Machines or services that depend on this machine:
{{% for dependent in reverse_dependencies %}}
- {{{{ dependent.name }}}} ({{{{ dependent.dependency_type }}}})
{{% else %}}
-
{{% endfor %}}
___
## Notes
{{{{ machine.notes or "" }}}}
"""


DEFAULT_VM_TEMPLATE = _machine_template(
    "VM Name",
    "VM",
    "VMID: {{ machine.vmid or \"\" }}\n",
    "",
)

DEFAULT_LXC_TEMPLATE = _machine_template(
    "LXC Name",
    "LXC",
    "CTID: {{ machine.vmid or \"\" }}\n",
    "",
)

DEFAULT_PHYSICAL_TEMPLATE = _machine_template(
    "Machine Name",
    "Physical Machine",
    "Location: {{ machine.location or \"\" }}\n",
    "**Hardware Model:** {{ machine.hardware_model or \"\" }}\n**Serial Number:** {{ machine.serial_number or \"\" }}\n",
)

DEFAULT_HOST_TEMPLATE = """_____________
Host Name: {{ machine.name }}
Type: Host
Hypervisor: {{ machine.hypervisor or "" }}
Location: {{ machine.location or "" }}
IP Address: {{ machine.ip_address or "" }}
DNS Record: {{ machine.dns_record or "" }}
Tags: {{ machine.tags | join(", ") }}

## Purpose
{{ machine.purpose or "" }}

## Hardware Resources
**CPU:** {{ machine.cpu or "" }}
**Memory:** {{ machine.memory or "" }}
**Hardware Model:** {{ machine.hardware_model or "" }}
**Serial Number:** {{ machine.serial_number or "" }}

## Storage
{% for disk in storage %}
- **{{ disk.name }}**{% if disk.capacity %} - {{ disk.capacity }}{% endif %}{% if disk.purpose %} - {{ disk.purpose }}{% endif +%}
{% else %}
-
{% endfor %}
_____________
## Dependencies
Hosted machines (VMs & LXCs):
{% for guest in hosted_machines %}
- {{ guest.name }} ({{ guest.machine_type }}){% if guest.ip_address %} - {{ guest.ip_address }}{% endif +%}
{% else %}
-
{% endfor %}

Other dependencies:
{% for dependency in dependencies %}
- {{ dependency.name }} ({{ dependency.dependency_type }}){% if dependency.notes %} - {{ dependency.notes }}{% endif +%}
{% else %}
-
{% endfor %}
___
## Notes
{{ machine.notes or "" }}
"""

DEFAULT_NETWORK_TEMPLATE = """# {{ machine.name }}

## Overview
{{ machine.purpose or "" }}

---

# Core Network Equipment

## Router
- **Model:** {{ machine.hardware_model or "" }}
- **Management IP:** {{ machine.ip_address or "" }}
- **Responsibilities:**
{{ machine.responsibilities or "" }}

---

## Switches

| Device | Management IP |
|---|---|
{% for d in network_devices %}
{% if d.role == "Switch" %}
| {{ d.name }} | {{ d.ip_address or "" }} |
{% endif %}
{% endfor %}

---

## Wireless Access Points

| Device | Management IP |
|---|---|
{% for d in network_devices %}
{% if d.role == "Access Point" %}
| {{ d.name }} | {{ d.ip_address or "" }} |
{% endif %}
{% endfor %}

---

# Network Segments

| Network | VLAN | Subnet | Purpose |
|---|---|---|---|
{% for s in network_segments %}
| {{ s.name }} | {{ s.vlan_id or "" }} | {{ s.subnet or "" }} | {{ s.purpose or "" }} |
{% endfor %}

---

# Internet Service

| Property | Value |
|---|---|
| ISP | {{ machine.isp or "" }} |
| Connection Type | {{ machine.connection_type or "" }} |
| Download Speed | {{ machine.download_speed or "" }} |
| Upload Speed | {{ machine.upload_speed or "" }} |
| WAN Type | {{ machine.wan_type or "" }} |

---

# Dependencies

Machines that depend on this network:
{% for m in reverse_dependencies %}
- {{ m.name }} ({{ m.machine_type }})
{% endfor %}

# Notes
{{ machine.notes or "" }}
"""

DEFAULT_OBSIDIAN_TEMPLATES: dict[str, tuple[str, str, str]] = {
    "VM": ("Default VM Template", "Obsidian note for Proxmox virtual machines.", DEFAULT_VM_TEMPLATE),
    "LXC": ("Default LXC Template", "Obsidian note for LXC containers.", DEFAULT_LXC_TEMPLATE),
    "PHYSICAL": (
        "Default Physical Machine Template",
        "Obsidian note for physical machines (Pi, mini PC, NAS, servers).",
        DEFAULT_PHYSICAL_TEMPLATE,
    ),
    "HOST": (
        "Default Host Template",
        "Obsidian note for hypervisor hosts (Proxmox, ESXi, bare-metal hosts).",
        DEFAULT_HOST_TEMPLATE,
    ),
    "NETWORK": (
        "Default Network Template",
        "Obsidian note for the router / network (equipment, VLANs, internet service).",
        DEFAULT_NETWORK_TEMPLATE,
    ),
}

TEMPLATE_VARIABLES: list[dict[str, str]] = [
    {"variable": "{{ machine.name }}", "description": "Machine name"},
    {"variable": "{{ machine.machine_type }}", "description": "VM, LXC, or Physical Machine"},
    {"variable": "{{ machine.host }}", "description": "Proxmox host or physical location host"},
    {"variable": "{{ machine.vmid }}", "description": "VMID / CTID (VM and LXC)"},
    {"variable": "{{ machine.ip_address }}", "description": "IP address"},
    {"variable": "{{ machine.mac_address }}", "description": "MAC address"},
    {"variable": "{{ machine.dns_record }}", "description": "DNS record"},
    {"variable": "{{ machine.operating_system }}", "description": "Operating system"},
    {"variable": "{{ machine.operating_system_version }}", "description": "OS version"},
    {"variable": "{{ machine.hypervisor }}", "description": "Hypervisor / platform (host), e.g. Proxmox VE 9"},
    {"variable": "{{ machine.architecture }}", "description": "CPU architecture"},
    {"variable": "{{ machine.status }}", "description": "Machine status"},
    {"variable": "{{ machine.purpose }}", "description": "Purpose"},
    {"variable": "{{ machine.tags }}", "description": "List of tag names"},
    {"variable": "{{ machine.cpu }}", "description": "CPU description"},
    {"variable": "{{ machine.cpu_cores }}", "description": "CPU core count"},
    {"variable": "{{ machine.memory }}", "description": "Memory, human readable (e.g. 8 GB)"},
    {"variable": "{{ machine.disk }}", "description": "Disk, human readable (e.g. 64 GB)"},
    {"variable": "{{ machine.storage_location }}", "description": "Storage location"},
    {"variable": "{{ machine.gpu }}", "description": "GPU"},
    {"variable": "{{ machine.location }}", "description": "Physical location"},
    {"variable": "{{ machine.hardware_model }}", "description": "Hardware model (physical)"},
    {"variable": "{{ machine.serial_number }}", "description": "Serial number (physical)"},
    {"variable": "{{ machine.asset_tag }}", "description": "Asset tag (physical)"},
    {"variable": "{{ machine.owner }}", "description": "Owner or maintainer"},
    {"variable": "{{ machine.created_at }}", "description": "Date created in Task Central"},
    {"variable": "{{ machine.deployment_date }}", "description": "Deployment date"},
    {"variable": "{{ machine.notes }}", "description": "Machine notes, joined as Markdown"},
    {"variable": "{{ services }}", "description": "List of services (name, description, port, protocol, url, is_external, notes)"},
    {"variable": "{{ storage }}", "description": "List of storage devices (name, capacity, purpose, notes)"},
    {"variable": "{{ machine.responsibilities }}", "description": "Router responsibilities (network)"},
    {"variable": "{{ machine.isp }}", "description": "Internet service provider (network)"},
    {"variable": "{{ machine.connection_type }}", "description": "WAN connection type, e.g. Fiber (network)"},
    {"variable": "{{ machine.download_speed }}", "description": "Download speed (network)"},
    {"variable": "{{ machine.upload_speed }}", "description": "Upload speed (network)"},
    {"variable": "{{ machine.wan_type }}", "description": "WAN type, e.g. Dynamic Public IP (network)"},
    {"variable": "{{ network_devices }}", "description": "Network equipment (name, role, ip_address, notes)"},
    {"variable": "{{ network_segments }}", "description": "VLANs / segments (name, vlan_id, subnet, purpose, notes)"},
    {"variable": "{{ dependencies }}", "description": "List of dependencies (name, dependency_type, notes)"},
    {"variable": "{{ reverse_dependencies }}", "description": "Machines that depend on this machine (name, dependency_type, notes)"},
    {"variable": "{{ hosted_machines }}", "description": "VMs/LXCs this host runs (name, machine_type, ip_address, status)"},
    {"variable": "{{ checklist }}", "description": "List of checklist tasks (title, status, category, required, notes)"},
    {"variable": "{{ completed_tasks }}", "description": "Only completed tasks"},
    {"variable": "{{ pending_tasks }}", "description": "Tasks that are not completed and not marked Not Applicable"},
]
