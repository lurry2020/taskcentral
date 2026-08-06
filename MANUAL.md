# Task Central User and Operations Manual

This manual is the primary user-facing reference for Task Central. It explains what the
application does, how its workflows behave, how to operate and maintain an installation, and
which current-version limitations matter when troubleshooting.

It reflects the repository and database behavior reviewed on July 31, 2026. If a later release
changes behavior, its release notes and current source take precedence over version-specific
details here.

Task Central is a single-user, self-hosted homelab machine provisioning and documentation
tracker. It inventories virtual machines, LXC containers, physical systems, hypervisor hosts,
and networks. Each record can have a generated setup checklist, recurring maintenance
reminders, dependencies, notes, type-specific infrastructure details, and a generated Obsidian
Markdown document.

## Contents

- [What Task Central is for](#what-task-central-is-for)
- [Core concepts](#core-concepts)
- [Getting started](#getting-started)
- [First-run setup wizard](#first-run-setup-wizard)
- [Authentication and sessions](#authentication-and-sessions)
- [Navigating the application](#navigating-the-application)
- [Chat window](#chat-window)
- [Machine types and fields](#machine-types-and-fields)
- [Creating a machine](#creating-a-machine)
- [Inventory management](#inventory-management)
- [Machine detail pages](#machine-detail-pages)
- [Checklists and task templates](#checklists-and-task-templates)
- [Recurring reminders](#recurring-reminders)
- [Services, storage, network equipment, and segments](#services-storage-network-equipment-and-segments)
- [Dependencies and automatic host links](#dependencies-and-automatic-host-links)
- [Notes and activity history](#notes-and-activity-history)
- [Obsidian document generation](#obsidian-document-generation)
- [Dashboard behavior](#dashboard-behavior)
- [Application settings](#application-settings)
- [Telegram alerts](#telegram-alerts)
- [Backup, export, import, and recovery](#backup-export-import-and-recovery)
- [Installation and deployment](#installation-and-deployment)
- [Upgrading](#upgrading)
- [Version and update checking](#version-and-update-checking)
- [Changelog and What's New](#changelog-and-whats-new)
- [API access](#api-access)
- [Security guidance](#security-guidance)
- [Logs and diagnostics](#logs-and-diagnostics)
- [Troubleshooting](#troubleshooting)
- [Known current-version caveats](#known-current-version-caveats)
- [Technical reference](#technical-reference)
- [Guidance for AI assistants](#guidance-for-ai-assistants)

## What Task Central is for

Task Central provides one place to answer questions such as:

- What machines, hosts, and networks exist in the homelab?
- Where does a VM or LXC run?
- Which services run on a machine, and how are they reached?
- What setup work remains before a deployment is complete?
- Which maintenance action is due next?
- What depends on a particular host, DNS server, database, storage system, or network?
- Which VLANs, switches, access points, and WAN details belong to the network?
- Is there a current, copyable Markdown document for the machine?
- What changed recently?

Task Central does not provision machines itself. It records the desired and actual state and
provides checklists that guide provisioning. It also does not write directly to an Obsidian
vault. Generated Markdown must be copied or downloaded and placed in the vault by the user.

## Core concepts

### Machines

“Machine” is Task Central's general term for all inventory records. There are five machine
types:

| Type | Intended use |
|---|---|
| `VM` | A virtual machine with its own kernel |
| `LXC` | A lightweight LXC container sharing its host kernel |
| `PHYSICAL` | A Raspberry Pi, mini PC, NAS, bare-metal server, appliance, or other physical system |
| `HOST` | A hypervisor or bare-metal host that runs VMs and containers |
| `NETWORK` | A router/network record containing internet service, equipment, VLANs, and subnets |

The selected machine type controls visible fields, detail tabs, checklist templates, reminder
templates, and the Obsidian template used for document generation.

### Machine statuses

Available statuses are:

| Status | Suggested meaning |
|---|---|
| Draft | The record is incomplete or the deployment has not started |
| In Progress | Provisioning or configuration work is underway |
| Active | The system is deployed and operating normally |
| Maintenance | The system is temporarily under maintenance or was restored from the archive |
| Retired | The system is no longer in service but remains in active inventory |
| Archived | The record is hidden from normal inventory and retained for reference |

Archiving a machine sets its status to `Archived`. Restoring it clears the archive marker and,
if its status is still `Archived`, changes the status to `Maintenance`.

### Templates and per-machine copies

Task and reminder templates are defaults, not live policies.

When a machine is created, enabled templates that apply to its type are copied into independent
machine tasks and reminders. Later edits to a template do not change existing machines. Use
**Apply new defaults** on an existing machine to preview and add missing defaults. Existing
items are never overwritten by that action.

### Machine-type scoping

For `VM`, `LXC`, `PHYSICAL`, and `HOST` records:

- `ALL` templates apply.
- Templates scoped specifically to that machine type also apply.

For `NETWORK` records:

- Only `NETWORK` templates apply.
- Server-oriented `ALL` templates deliberately do not apply.

This special network rule applies to both checklist tasks and recurring reminders.

### Progress

Checklist progress is:

`completed applicable tasks / all applicable tasks`

Tasks marked **Not Applicable** are excluded from both sides of the calculation. Pending,
In Progress, and Blocked tasks remain applicable. If there are no applicable tasks, progress is
reported as 0%.

## Getting started

A practical first-use sequence is:

1. Complete the first-run setup wizard.
2. Sign in with the password created during setup.
3. Review the default task, reminder, and Obsidian templates.
4. Create `HOST` records before their VMs and LXCs when possible.
5. Create a `NETWORK` record for the router and network design.
6. Create VMs, LXCs, and physical machines with the New Machine wizard.
7. Work through each machine's checklist.
8. Add services, dependencies, notes, storage, network equipment, or VLANs as appropriate.
9. Configure recurring reminders.
10. Generate and copy or download the Obsidian document.
11. Enable Telegram alert schedules only if alert delivery is wanted.
12. Create and test a backup before relying on the installation.

Creating hosts first makes the VM/LXC **Host** field a dropdown and allows Task Central to create
the guest-to-host dependency automatically.

## First-run setup wizard

A genuinely new Task Central database opens at `/setup` before the login screen. The wizard is
shown only while the internal `setup_completed` flag is false. Existing installations are
recognized during startup and marked complete automatically, so upgrading does not replace the
login page with setup or overwrite existing preferences.

The wizard has five screens:

1. **Account**
   - Choose the login username. Leading and trailing whitespace is removed.
   - Enter and confirm the single-user login password.
   - The minimum length is 6 characters.
   - The two values must match.
   - The completed setup stores only a salted PBKDF2 hash, never the plain password.
2. **General**
   - Choose an IANA timezone from the searchable timezone selector.
   - Choose `YYYY-MM-DD`, `DD.MM.YYYY`, or `MM/DD/YYYY` as the date format.
3. **Telegram**
   - Enter both the bot token and chat ID.
   - **Send test message** uses the currently entered values without saving them.
   - Both fields are required when proceeding with Telegram.
   - Select **Skip for now** to continue without saving Telegram credentials. Telegram can be
     configured later under **Settings → Alerts**.
4. **Local AI**
   - Choose Ollama or an OpenAI-compatible local server.
   - Enter the base URL and optional API key. Task Central asks the local server for its installed
     models and fills the model dropdown automatically.
   - Select a model from the dropdown. Use **Refresh** after installing or loading another model.
   - Choose the request timeout.
   - Provider, model, base URL, and timeout are required when proceeding with local AI.
   - **Test connection** uses the currently entered values without saving them.
   - Only local/private-network AI endpoints are accepted.
   - Select **Skip for now** to leave chat disabled and configure it later under
     **Settings → Local AI**.
5. **Confirm**
   - Review the selected general settings and which optional integrations will be configured.
   - Secrets are not repeated in the summary.
   - Select **Complete setup** to save all choices in one transaction.

Completing setup saves the selected username, password hash, general preferences, and any
non-skipped integration settings, then permanently sets `setup_completed=true`. The browser is
taken to the login screen; setup does not log the user in automatically. The selected username
and new password must be used to sign in.

If Telegram was configured, its credentials are saved but pending-task and reminder alerts remain
disabled until they are explicitly enabled under Settings. If local AI was configured, local AI
chat is enabled. Skipped integrations retain their normal defaults.

The setup completion and setup connection-test endpoints refuse requests after setup is complete.
The public setup-status endpoint remains available so the browser can decide whether to show setup
or login. There is intentionally no supported UI action for reopening first-run setup; use the
normal Settings page and password-reset CLI for later changes.

## Authentication and sessions

Task Central has one application user.

- New installations choose the username during first-run setup.
- The setup-selected username is stored as `auth_username` in application settings.
- Legacy installations without that database setting fall back to the configured
  `AUTH_USERNAME`.
- Usernames are compared case-insensitively.
- Passwords are case-sensitive.
- A successful login returns an HMAC-signed bearer token.
- The browser stores the token in local storage under `taskcentral-token`.
- The default session lifetime is seven days.
- An expired or invalid token returns the user to the login screen.
- Signing out removes the stored token and clears cached application data in the browser.

Every `/api/v1/*` endpoint requires authentication except:

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `GET /api/v1/setup/status`
- `POST /api/v1/setup/complete`
- `POST /api/v1/setup/llm-models`
- `POST /api/v1/setup/test-telegram`
- `POST /api/v1/setup/test-llm`

The four setup mutation/test endpoints are usable only before setup is completed. Login is
blocked until setup is complete.

### Changing the password

The recommended way to change a deployed instance's password is the backend CLI:

```bash
cd /taskcentral
docker compose exec backend python -m app.cli setpassword
```

The interactive command prompts twice without echoing the new password. A noninteractive form
also exists, but placing a password on a command line can expose it in shell history or process
lists:

```bash
docker compose exec backend python -m app.cli setpassword 'NewPassw0rd!'
```

The CLI stores a salted PBKDF2 password hash in the application database. This database override
takes effect for new logins immediately and takes precedence over `AUTH_PASSWORD`. The CLI reads
the username selected during setup for its prompt and status message. Changing a password never
changes that username.

To remove the database override and return to the environment/default password:

```bash
docker compose exec backend python -m app.cli setpassword --reset
```

The `--reset` option clears only the database password override. It does not remove or replace the
setup-selected username; that username remains paired with the `AUTH_PASSWORD` fallback.

Changing the password does not revoke already-issued session tokens. Change `SECRET_KEY` and
restart the backend if all existing tokens must be invalidated.

### Forgot password from the login page

Select **Forgot password?** below the username and password fields to replace the sign-in form
with password-reset instructions. Task Central does not send reset links by email because it is a
single-user, self-hosted application.

The recovery view instructs an administrator with server access to open a terminal, change to the
Task Central directory, and run:

```bash
docker compose exec backend python -m app.cli setpassword
```

Follow the prompts to enter and confirm a new password. The change takes effect immediately for
new sign-ins. Select **Back to sign in** to restore the username and password fields. If the user
does not have server access, the person who manages the Task Central installation must perform
the reset.

### Default credentials

The source distribution contains development-style fallback credentials, but a new installation
cannot log in until the setup wizard creates a database-backed username and password. Those
values override the authentication fallbacks. Treat any fallback credentials as public knowledge
and replace the default `SECRET_KEY` with a long random value.

See [Known current-version caveats](#known-current-version-caveats) before relying on
`AUTH_USERNAME` or `AUTH_PASSWORD` values placed only in `.env`.

## Navigating the application

The primary pages are:

| Page | Route | Purpose |
|---|---|---|
| First-run setup | `/setup` | Configure a new database before the first login; unavailable after completion |
| Dashboard | `/` | Summary, recent machines, and records needing attention |
| Inventory | `/inventory` | Search, filter, sort, open, duplicate, archive, restore, or delete machines |
| New Machine | `/inventory/new` | Six-step creation wizard |
| Machine detail | `/inventory/{id}/{tab}` | Work with one machine and its related records |
| Task Templates | `/task-templates` | Manage setup checklist defaults |
| Reminder Templates | `/reminder-templates` | Manage recurring maintenance defaults |
| Obsidian Templates | `/obsidian-templates` | Edit, preview, and reset Markdown templates |
| Settings | `/settings` | Preferences, alerts, Telegram, export/import, and maintenance actions |

Legacy `/machines/*` browser routes redirect to `/inventory`.

The theme can be set to dark or light in Settings. Theme choice is saved in the current browser,
not in the application database, so another browser or device can have a different theme.

## Chat window

Logged-in pages include a compact Task Central Assistant chat window in the bottom-right corner.
It never appears on the login or forgot-password screens.

- Select the circular chat button to open the window.
- Select the minus button in the window header to minimize it.
- The open or minimized state persists while navigating between pages.
- The state is also stored in the current browser, so it survives a refresh.
- Drag the diagonal resize control in the window's upper-left corner to change its width and
  height. The window remains anchored to the bottom-right corner.
- Resizing is bounded to a practical range: approximately 280–480 pixels wide and 320–640 pixels
  tall, while always fitting within the current browser viewport.
- The selected size persists across page navigation, minimizing/reopening, and browser refreshes.
- Each browser or device keeps its own chat-window open/minimized and size preferences.

The chat connects only to an LLM server configured under **Settings → Local AI**. Supported
provider protocols are:

- Ollama's `/api/chat` API.
- An OpenAI-compatible `/chat/completions` API, such as the local server in LM Studio.

For model discovery, Task Central calls Ollama's `/api/tags` endpoint or the OpenAI-compatible
`/models` endpoint. These requests come from the backend container, so the model server must be
reachable from that container rather than only from the user's browser.

Task Central deliberately rejects public model endpoints. The model must be reachable from the
backend container through loopback, a private IP address, a local hostname, a Docker service name,
or `host.docker.internal`.

### Configuring Ollama

1. Install Ollama on the Task Central host or another machine on the private network.
2. Pull a chat-capable model:

   ```bash
   ollama pull llama3.2:3b
   ```

3. Ensure Ollama listens on an address reachable by the Task Central backend container. When
   Ollama runs directly on the Docker host, it may need:

   ```bash
   OLLAMA_HOST=0.0.0.0:11434 ollama serve
   ```

4. Restrict port 11434 with the host firewall; do not expose it to the internet.
5. In **Settings → Local AI**, choose:

   - Provider: **Ollama**
   - Base URL: `http://host.docker.internal:11434`
   - Model: select an installed tag, such as `llama3.2:3b`, from the automatically loaded dropdown

6. Select **Refresh** if the newly installed model is not shown.
7. Select **Test connection**.
8. Enable local AI chat and save Settings.

If Ollama is in a Docker service reachable on the same Docker network, use its service name, such
as `http://ollama:11434`.

### Configuring LM Studio or another OpenAI-compatible server

1. Load a chat/instruct model in the local application.
2. Start its OpenAI-compatible local server and allow private-network access if Task Central runs
   in Docker.
3. In **Settings → Local AI**, choose:

   - Provider: **OpenAI-compatible local server**
   - Base URL: for example `http://host.docker.internal:1234/v1`
   - API key: only if the local server requires a Bearer token
   - Model: select an identifier returned by the server from the model dropdown

4. Select **Refresh** if the loaded model is not shown.
5. Select **Test connection**.
6. Enable local AI chat and save Settings.

Task Central appends `/chat/completions` to the configured OpenAI-compatible base URL unless the
URL already ends in that path.

### Chat behavior and privacy

- Enter sends a message; Shift+Enter inserts a line break.
- The model receives the visible user/assistant conversation plus the current Task Central route.
- When manual context is enabled, the backend selects up to several relevant `MANUAL.md` sections
  and includes them in the system prompt.
- Chat messages remain in browser memory while the authenticated layout is mounted. They are not
  stored in the Task Central database and disappear on refresh, sign-out, or **Clear chat**.
- The minimized/open state and bounded window dimensions are stored separately in browser local
  storage.
- Requests are not streamed; the Thinking indicator remains until the complete local-model
  response arrives or the configured timeout is reached.
- Model output is rendered as sanitized Markdown.
- Local models can be inaccurate. Verify commands and destructive actions before using them.

## Machine types and fields

### Fields common to most records

Common identity and organizational fields include:

- Name
- Status
- Management or primary IP address
- DNS record
- Architecture
- Deployment date
- Purpose
- Owner or maintainer
- Tags

IP addresses are validated as IPv4 or IPv6 addresses. MAC addresses must use six hexadecimal
octets separated consistently by colons or hyphens; stored output is normalized to uppercase.
Service URLs must begin with `http://` or `https://`.

Tags are trimmed, deduplicated case-insensitively, and limited to 100 characters each.

### VM and LXC fields

VMs and LXCs include:

- Hypervisor host
- VMID for VMs or CTID for LXCs
- IP and MAC address
- DNS record
- Operating system and version
- CPU type and core count
- Memory value and unit
- Disk value and unit
- Hypervisor storage location
- GPU or passthrough details
- Network interface or bridge

VMID/CTID values must be positive and may be up to 999,999,999.

### Physical machine fields

Physical records add inventory-oriented fields:

- Host or rack location
- Physical location
- Processor and core count
- Memory and disk
- Storage location
- GPU
- Network interface
- Hardware model
- Serial number
- Asset tag
- Operating system and version

### Host fields

Host records are intended for Proxmox, ESXi, or another hypervisor/bare-metal platform. Important
fields include:

- Cluster or group
- Management IP
- DNS record
- Hypervisor platform and version
- Architecture
- Physical location
- CPU, memory, disk, GPU, and network interface
- Hardware model, serial number, and asset tag

Hosts use a dedicated **Storage** tab for drive/pool records and automatically list linked guests
through reverse dependencies and generated documentation.

### Network fields

Network records represent a router and its network design. Important fields include:

- Management IP
- DNS record
- Router model
- Router responsibilities, usually one per line
- ISP
- Connection type, such as Fiber or Cable
- Download and upload speed
- WAN type, such as Dynamic Public IP
- Architecture and deployment date
- Physical location
- Owner and tags

After creating the record, use:

- **Equipment** for routers, switches, access points, and other managed network devices.
- **Segments** for VLAN IDs, subnets, names, purposes, and notes.

VLAN IDs, when supplied, must be from 1 through 4094.

## Creating a machine

Open **Inventory → New Machine**. The wizard has six steps.

### 1. Machine Type

Choose VM, LXC, Physical Machine, Host, or Network. The choice changes later fields and
machine-detail tabs.

### 2. Identity & Network

Enter the name, addressing, status, type-specific platform information, purpose, ownership, and
tags. If Host records exist, the VM/LXC Host field offers them as a dropdown.

### 3. Hardware

Record CPU, cores, memory, disk, storage location, GPU, network interface, and any physical
inventory details relevant to the type.

### 4. Services & Dependencies

- VMs, LXCs, and physical machines can receive initial services.
- Hosts can receive initial storage devices.
- Networks direct the user to add equipment and segments after creation.
- Dependencies can be entered for all types.

These records can also be added or edited later.

### 5. Checklist

Review the enabled task templates that will be copied into the machine. Checklist generation can
be disabled. If checklist generation is disabled, default reminders are also not generated at
creation; both can be applied later from their respective tabs.

### 6. Review

Review all entered information. Task Central checks for likely duplicates involving:

- Name
- IP address
- DNS record
- VMID/CTID in the same host context

These are warnings intended to prevent accidents; they are not necessarily hard uniqueness
constraints.

After creation, the application opens the new machine's detail page.

## Inventory management

The Inventory page shows non-archived records by default.

### Search and filters

Search covers machine name, IP address, DNS record, host, purpose, and operating system. Filters
are available for:

- Machine type
- Status
- Host
- Tag
- Archived records

The table can be sorted by name, creation time, update time, or checklist progress. Page size is
controlled in Settings.

The table's **State** column reports live ICMP reachability instead of the machine's editable
lifecycle status:

- **Online** with a green dot means the backend container received a ping reply.
- **Offline** with a red dot means no reply arrived, the ping could not run, or the record has no
  IP address.

Task Central checks all machines visible on the current inventory page when the page opens and
refreshes their state every 30 seconds. Hover over a state to see the ping result, check time, and
round-trip latency when available. Checks run concurrently from the backend container and do not
store connectivity history. The **Status** filter still filters the editable Draft, In Progress,
Active, Maintenance, Retired, and Archived lifecycle values.

Desktop inventory rows use a consistent height. Up to the first three tags are displayed on one
line beneath the machine name; additional tags are hidden from the table, and long visible tag
names are truncated. Open the machine to view its complete tag list.

### Duplicating a machine

Duplicating creates a new Draft record and generates a fresh checklist and reminders from the
templates that are enabled at duplication time.

The duplicate retains most descriptive, platform, resource, and organizational fields. The
following identity fields are deliberately cleared:

- VMID/CTID
- IP address
- MAC address
- DNS record
- Serial number
- Asset tag

Tags are copied. The dialog lets the user choose whether to copy services and dependencies.
The “Copy services” option also copies host storage and network equipment/segments where those
records exist.

### Archiving, restoring, and deleting

- **Archive** is a soft-delete operation. The record leaves normal inventory and receives the
  `Archived` status.
- **Restore** returns an archived record to normal inventory and changes an unchanged Archived
  status to `Maintenance`.
- **Delete permanently** is exposed in the archived inventory. It removes the machine and its
  child records through cascading deletion.

Permanent deletion is not recoverable from the application. Make a backup first.

## Machine detail pages

Every machine has a header with its type, tags, checklist progress, addressing, and actions such
as Edit, Duplicate, and Archive/Restore. The editable machine status is not displayed in this
header.

When a machine has a stored IP address, the header also shows ICMP reachability:

- **Online** means the Task Central backend container received a ping reply.
- **Offline** means no reply arrived before the short ping timeout, the check could not run, or
  the machine has no IP address to check.

The page checks when it opens, repeats the check every 30 seconds while open, and provides a
refresh button for an immediate check. Ping runs from the backend container, not the user's
browser, and no reachability history is stored. The header displays only plain `Online` or
`Offline` text; hover over it to see the ping result, check time, and round-trip latency when
available. A device can be operational while appearing Offline if its host firewall, network
firewall, or VLAN policy blocks ICMP echo requests.

If Overview, Services, Dependencies, or Notes information has changed since the latest Obsidian
document was generated, the header card displays an **Obsidian document needs regeneration**
warning. Open the Obsidian tab and regenerate the document to clear the warning.

Visible tabs vary by type:

| Tab | VM/LXC/Physical | Host | Network |
|---|---:|---:|---:|
| Overview | Yes | Yes | Yes |
| Checklist | Yes | Yes | Yes |
| Reminders | Yes | Yes | Yes |
| Services | Yes | No | No |
| Storage | No | Yes | No |
| Equipment | No | No | Yes |
| Segments | No | No | Yes |
| Dependencies | Yes | Yes | Yes |
| Notes | Yes | Yes | Yes |
| Obsidian | Yes | Yes | Yes |
| History | Yes | Yes | Yes |

### Overview

Displays the machine's structured identity, network, platform, internet, and hardware fields.
Use **Edit** in the machine header to change them.

### Checklist

Tracks deployment tasks, progress, categories, due dates, notes, blocking reasons, and
not-applicable reasons. See [Checklists and task templates](#checklists-and-task-templates).

### Reminders

Tracks recurring maintenance, last-performed dates, next due dates, and enabled state. See
[Recurring reminders](#recurring-reminders).

### Services

Records applications and endpoints running on a VM, LXC, or physical machine.

### Storage

Records drives and storage pools on a Host.

### Equipment and Segments

Records managed network hardware and VLAN/subnet design on a Network.

### Dependencies

Shows what this machine depends on and what other tracked machines depend on it.

### Notes

Stores titled or untitled Markdown notes.

### Obsidian

Generates, copies, downloads, and lists historical Markdown snapshots.

### History

Shows machine-related activity events, newest first.

## Checklists and task templates

### Task statuses

| Status | Behavior |
|---|---|
| Pending | Not started; counts as incomplete and applicable |
| In Progress | Work has started; counts as incomplete and applicable |
| Completed | Counts toward progress; completion time is recorded |
| Blocked | Counts as incomplete and requires a blocking reason |
| Not Applicable | Excluded from progress; an explanatory reason can be recorded |

Checkboxing a task toggles it between Completed and Pending. Expanding a task exposes its
description, notes, status actions, editing controls, and reorder controls.

Tasks can have:

- Title and description
- Category
- Required flag
- Status
- Due date
- Notes
- Blocking reason
- Not-applicable reason

The checklist can be filtered by status and category.

### Adding, editing, and deleting tasks

Use **Custom task** to add a machine-specific task. Every task on a machine can be edited,
reordered, or permanently deleted from that machine's expanded task controls.

Deleting a template-derived task removes only that machine's independent checklist copy. It does
not delete or modify the global task template, and it does not affect any other machine. Because
the template remains, a later **Apply new defaults** preview can offer the deleted task to that
machine again. Use Not Applicable instead of deletion when the task should remain visible as an
explicitly reviewed exception.

### Task templates

Task Templates define the starting checklist. Each template has:

- Title
- Description
- Category
- Scope: All, VM, LXC, Physical, Host, or Network
- Required flag
- Enabled flag
- Sort order

Disabling a template prevents it from being copied into future machines or through Apply new
defaults. It does not remove existing tasks. Deleting or editing a template likewise does not
rewrite existing machine checklists.

### Applying new defaults

On a machine's Checklist tab:

1. Select **Apply new defaults**.
2. Review the preview.
3. Confirm the addition.

A task is considered already present if either:

- It is linked to the same template, or
- Its normalized title matches an existing machine task.

Only missing tasks are added. Existing task content and status remain unchanged.

### Built-in task templates

The initial seed contains the following defaults. An administrator can edit, disable, reorder, or
delete them, so a particular installation may differ.

#### All non-Network machine types

| Default task | Category | Required |
|---|---|---:|
| Create or configure the machine | Provisioning | Yes |
| Configure hostname | Operating System | Yes |
| Configure operating system | Operating System | Yes |
| Apply operating system updates | Operating System | Yes |
| Configure SSH access | Security | Yes |
| Configure firewall | Security | Yes |
| Configure static or reserved IP address | Network | Yes |
| Configure the device in UniFi | UniFi | Yes |
| Set the UniFi device alias | UniFi | Yes |
| Set the UniFi device icon | UniFi | No |
| Configure the UniFi fixed IP address | UniFi | Yes |
| Add DNS record to Pi-hole | DNS | Yes |
| Verify forward DNS resolution | DNS | Yes |
| Verify reverse DNS resolution where applicable | DNS | No |
| Add machine to Uptime Kuma | Monitoring | Yes |
| Add machine or service to Homarr | Dashboard | No |
| Add machine documentation to Obsidian | Documentation | Yes |
| Add machine or services to Caddy where applicable | Reverse Proxy | No |
| Verify service accessibility | Validation | Yes |
| Verify monitoring | Monitoring | Yes |
| Verify backups | Backup | Yes |
| Record credentials or secret location | Security | Yes |
| Complete final validation | Validation | Yes |
| Mark deployment complete | Validation | Yes |

Physical machines additionally receive:

| Default task | Category | Required |
|---|---|---:|
| Record hardware inventory details | Provisioning | No |

The built-in set currently has no additional VM-, LXC-, or Host-specific setup tasks beyond the
`ALL` scope.

#### Network only

| Default task | Category | Required |
|---|---|---:|
| Configure the WAN / internet connection | Network | Yes |
| Configure VLANs and network segments | Network | Yes |
| Configure DHCP scopes per VLAN | Network | Yes |
| Configure DNS forwarding | DNS | Yes |
| Configure inter-VLAN firewall rules | Security | Yes |
| Configure Wi-Fi SSIDs | Network | Yes |
| Adopt and configure switches | Network | Yes |
| Adopt and configure access points | Network | Yes |
| Configure VPN access | Security | No |
| Set reserved IPs for infrastructure | Network | Yes |
| Verify internet speed | Validation | No |
| Back up controller configuration | Backup | Yes |
| Add network documentation to Obsidian | Documentation | Yes |
| Verify monitoring and alerts | Monitoring | No |

## Recurring reminders

Reminders are for repeated maintenance rather than one-time deployment work.

Each reminder contains:

- Title and description
- Category
- Interval in days
- Last-performed date
- Next-due date
- Enabled state
- Notes

Default reminders are generated when the machine is created, unless checklist/default generation
was disabled. A new generated reminder is first due one interval after its creation date.

### Marking a reminder done

Selecting **Done**:

- Sets `last performed` to today's date.
- Sets `next due` to today plus the reminder interval.
- Allows a Telegram alert to be sent again when the new due cycle arrives.

Editing the last-performed date or interval recomputes the next due date unless a next-due date is
explicitly supplied.

### Enabling, disabling, and deleting reminders

- Disabled reminders remain visible but are excluded from due-reminder alert checks.
- Template-derived and custom reminders can be edited, disabled, or deleted from an individual
  machine. Deleting a template-derived reminder removes only that machine's copy; it does not
  delete the source template or reminders already copied to other machines.
- Only non-archived machines participate in due-reminder checks.

### Reminder templates

Reminder Templates define defaults for future machines. Each has a title, description, category,
scope, interval, enabled flag, and sort order.

As with task templates, changes do not modify existing reminders. Use **Apply new defaults** on a
machine to preview and add missing reminder templates without altering existing reminders.

### Built-in reminder templates

The initial reminder defaults are:

| Scope | Reminder | Interval |
|---|---|---:|
| All | Apply OS updates | 7 days |
| All | Update installed packages & container images | 14 days |
| All | Verify backups | 7 days |
| All | Review disk usage | 30 days |
| All | Review logs & service health | 30 days |
| All | Rotate or review credentials | 180 days |
| VM | Prune VM snapshots | 30 days |
| LXC | Review container config | 90 days |
| Host | Update hypervisor packages | 30 days |
| Host | Check storage pool health | 30 days |
| Host | Verify host backups (vzdump) | 7 days |
| Host | Review resource allocation | 90 days |
| Physical | Check disk SMART health | 30 days |
| Physical | Clean / dust hardware | 180 days |
| Physical | Check for firmware / BIOS updates | 180 days |
| Network | Update router / controller firmware | 30 days |
| Network | Back up controller configuration | 30 days |
| Network | Review firewall rules | 90 days |
| Network | Review VLANs & Wi-Fi SSIDs | 90 days |
| Network | Review connected devices & DHCP leases | 30 days |
| Network | Test internet speed / failover | 30 days |

Network receives only the Network rows. Every other type receives all six All rows plus its own
type-specific rows.

## Services, storage, network equipment, and segments

### Services

Services are available for VM, LXC, and Physical records. A service can contain:

- Name
- Description
- Port from 1 through 65535
- Protocol
- HTTP or HTTPS URL
- Whether it is external
- Notes
- Sort order

Use services to record both machine-local applications and externally exposed entry points.

### Storage

Storage entries are shown on Host records and can contain:

- Device or pool name
- Capacity as display text, such as `1 TB`
- Purpose
- Notes
- Sort order

### Network equipment

Equipment entries are shown on Network records and can contain:

- Name
- Role, such as Router, Switch, or Access Point
- Management IP
- Notes
- Sort order

### Network segments

Segments are shown on Network records and can contain:

- Name
- VLAN ID
- Subnet
- Purpose
- Notes
- Sort order

Subnet is currently stored as text; use consistent CIDR notation such as `192.168.20.0/24`.

## Dependencies and automatic host links

A dependency says that one machine needs another system to function.

Each dependency can point to:

- Another machine tracked in Task Central, or
- A free-text external system.

Dependency types include Host, DNS, Storage, Network, Authentication, Database, Reverse Proxy,
Monitoring, Application, and Other. Notes can explain the relationship.

The Dependencies tab has two directions:

- **This machine depends on**: outgoing dependencies.
- **Machines that depend on this machine**: reverse dependencies calculated from other records.

A machine cannot depend on itself.

### Automatic VM/LXC host dependency

When a VM or LXC's Host value matches the name of a non-archived `HOST` machine,
case-insensitively, Task Central creates a `Host` dependency automatically with the note
“Runs on this host.”

This link stays synchronized when the guest's Host field changes. Creating a Host after guests
already reference its name also links those existing guests. The Host's reverse-dependency view
and generated Obsidian document can therefore list its hosted VMs and LXCs.

For reliable matching:

- Keep Host machine names unique.
- Select the Host from the dropdown rather than typing a variation.
- Avoid renaming hosts without reviewing their guests afterward.

## Notes and activity history

### Notes

Machine notes can have an optional title and Markdown content. They are appropriate for:

- Installation quirks
- Configuration decisions
- Recovery procedures
- Change rationale
- Known problems
- Links to secrets stored elsewhere

Do not place actual passwords, private keys, or tokens in notes. Markdown displayed in the
application is sanitized before rendering.

When an Obsidian document is generated, machine notes are joined into Markdown. Titled notes are
rendered as level-three sections.

### History

Task Central records activity events for operations such as:

- Creating, updating, archiving, or restoring a machine
- Updating tasks and reminders
- Adding or changing related records
- Generating a document
- Sending alerts
- Importing data

History is an operational audit trail, not a cryptographically tamper-proof security log.

## Obsidian document generation

Each machine type has one editable Jinja template:

- VM
- LXC
- Physical
- Host
- Network

Generating a document renders the template with the machine's current related data, creates a
safe `.md` filename, and stores an immutable generated snapshot. The machine's Obsidian tab can
copy or download the latest content and open previous snapshots.

Task Central tracks document freshness per machine. Creating, editing, deleting, or reordering a
Service; creating, editing, or deleting a Dependency or Note; or changing Overview information
marks that machine's document as needing regeneration. The warning appears in the machine header
and in Dashboard Needs Attention. A successful document generation clears it. Changes to
checklists, reminders, storage, equipment, segments, or templates do not currently set this flag.

Task Central never writes directly into an Obsidian vault.

### Typical workflow

1. Open **Obsidian Templates**.
2. Choose the machine type.
3. Edit and preview the template with sample data.
4. Save the template.
5. Open the machine's **Obsidian** tab.
6. Generate a document.
7. Copy it or download the `.md` file.
8. Place the file into the desired Obsidian vault.

Every generation creates another historical snapshot. Editing a template does not alter old
snapshots.

### Jinja basics

Print a value:

```jinja
# {{ machine.name }}
IP: {{ machine.ip_address or "" }}
```

Conditionally show a field:

```jinja
{% if machine.vmid %}
VMID: {{ machine.vmid }}
{% endif %}
```

Loop over services:

```jinja
{% for service in services %}
- {{ service.name }}{% if service.port %}:{{ service.port }}{% endif %}
{% endfor %}
```

Templates execute in a sandboxed Jinja environment. Missing values normally render as empty text
during document generation. Template saves and previews reject Jinja syntax/rendering errors.

### Available template context

#### `machine`

The `machine` object provides:

- `name`
- `machine_type` as a display label
- `host`
- `vmid`
- `ip_address`
- `mac_address`
- `dns_record`
- `operating_system`
- `operating_system_version`
- `hypervisor`
- `architecture`
- `status`
- `purpose`
- `responsibilities`
- `isp`
- `connection_type`
- `download_speed`
- `upload_speed`
- `wan_type`
- `tags` as a list of strings
- `cpu`
- `cpu_cores`
- `memory` as combined display text such as `8 GB`
- `disk` as combined display text such as `64 GB`
- `storage_location`
- `gpu`
- `network_interface`
- `hardware_model`
- `serial_number`
- `asset_tag`
- `location`
- `owner`
- `created_at`, formatted in the application timezone
- `deployment_date`
- `notes`, joined as Markdown

#### Related lists

`services` items contain:

- `name`, `description`, `port`, `protocol`, `url`, `is_external`, `notes`

`storage` items contain:

- `name`, `capacity`, `purpose`, `notes`

`network_devices` items contain:

- `name`, `role`, `ip_address`, `notes`

`network_segments` items contain:

- `name`, `vlan_id`, `subnet`, `purpose`, `notes`

`dependencies` items contain:

- `name`, `dependency_type`, `notes`, `is_external`

`reverse_dependencies` items contain:

- `name`, `dependency_type`, `notes`, `machine_type`, `status`

`hosted_machines` items contain:

- `name`, `machine_type`, `ip_address`, `status`

`checklist` items contain:

- `title`, `description`, `category`, `status`, `required`, `notes`, `completed_at`

Additional convenience lists:

- `completed_tasks`: checklist items whose status is Completed
- `pending_tasks`: checklist items that are neither Completed nor Not Applicable
- `now`: current date and time in the application timezone

The checklist-related lists reflect the Obsidian inclusion settings. For example, if completed
tasks are excluded, `completed_tasks` will be empty for that generation.

### Filename rules

The default filename format is `{name}.md`. `{date}` may also be used:

```text
{name}-{date}.md
```

The format must contain `{name}` and cannot contain `/`, `\`, or `..`. Machine names and final
filenames are sanitized, limited in length, and forced to end in `.md`.

### Resetting templates

An individual template can be reset from the Obsidian Templates page. Settings also has
**Restore default Obsidian templates**, which replaces all five type templates with their
built-in content. Custom template edits are lost, so export data or copy the template text first.

## Dashboard behavior

The Dashboard excludes archived machines and shows:

- Total machines
- “Active,” meaning records whose status is `In Progress`
- “Completed,” meaning records with at least one applicable task and every applicable task complete
- Overdue plus blocked task count
- Pending task count
- Up to eight recently updated machines
- Up to ten machines needing attention

A machine can need attention because it has:

- Blocked tasks
- Incomplete tasks while not in Draft
- Missing IP address or DNS record while not Draft or Retired
- Missing VMID/CTID for a VM or LXC while not Draft or Retired
- No generated Obsidian document while not Draft
- An Obsidian document that needs regeneration after relevant machine information changed

The Dashboard's completed state is derived from checklist progress, not from the machine's
`Active` status.

## Application settings

Settings are stored in the application database unless noted otherwise.

The timezone, date format, Telegram credentials, and local AI connection can initially be set in
the first-run wizard. Later changes use this Settings page.

### General

- **Timezone**: Used for displayed timestamps, generated document timestamps, and the Telegram
  reminder daily-send gate.
- **Date format**: Selectable as `YYYY-MM-DD`, `DD.MM.YYYY`, or `MM/DD/YYYY`.
- **Machines per page**: 10, 25, 50, or 100 in the UI; API validation allows 5 through 200.
- **Default status for new machines**.
- **Ask for confirmation before destructive actions**.

The default timezone is `America/New_York`. Dates and times stored by the backend are UTC;
changing the timezone changes display and rollover behavior, not stored timestamps.

The visible application name is stored as the `app_name` application setting and displayed in the
layout. The current UI does not expose an editor for it; it can be changed through the Settings
API. The `APP_NAME` process environment setting controls backend naming/logging but does not
replace an already-seeded database setting.

### Appearance

- **Theme**: Dark or Light. Stored only in the current browser/device and applied immediately.

### Obsidian

- Filename format
- Include checklist
- Include completed tasks
- Include Not Applicable tasks

### Tasks

- **Default category for custom tasks**.
- **Required task behavior**: warn on the dashboard or ignore.

### Alerts

- Enable pending-task alerts
- Enable due-reminder Telegram alerts
- Daily reminder send time
- Pending-task age threshold
- Minimum frequency between pending-task messages
- Telegram bot token
- Telegram chat ID

### Local AI

- **Enable local AI chat**: Allows the chat window to send messages.
- **Provider**: Ollama or OpenAI-compatible local server.
- **Base URL**: Local endpoint reachable from the backend container.
- **API key**: Optional Bearer token stored in the application database.
- **Request timeout**: 30 seconds through 10 minutes.
- **Model**: Dropdown populated from the local server after a valid base URL is entered. The list
  refreshes automatically; **Refresh** requests it again on demand.
- **Include relevant Task Central manual sections**: Adds keyword-selected documentation to each
  chat request.
- **Test connection**: Uses the unsaved form values and asks the model for a short confirmation.

Save Settings after a successful test. Testing alone does not enable the chat.

### Data Management

- Export all data as JSON
- Download a SQLite database backup
- Validate and import JSON, including VM, LXC, physical, host, and network machine records
- Restore default Obsidian templates
- Permanently delete sample machines
- **Reset Application**: Permanently erase all application records, settings, and login
  credentials; restore factory templates and safe default settings; mark setup incomplete; sign
  out; and return to `/setup`.

“Clear sample data” deletes all machines carrying the `sample-data` tag, then removes the tag.

When a JSON file fails validation, Task Central displays the specific reason instead of importing
anything. A successful validation shows a record-count summary before the destructive replacement
step is offered.

“Reset Application” is a full factory reset, not a selective cleanup. Its confirmation dialog
lists the affected data and must be accepted before the request is sent. The reset removes
machines, tags, checklists, reminders, templates, services, storage and network records,
dependencies, notes, generated documents, history, integration credentials, preferences, and the
login username/password hash. It then creates a fresh set of built-in templates and defaults with
`setup_completed` set to false. The current browser session is cleared and the first-run setup
wizard opens, where a new user must be created. The operation cannot be undone; download a
database backup first if any information may be needed later.

## Telegram alerts

Telegram integration is optional and uses the Telegram Bot API.

### Setup

1. Create a Telegram bot with `@BotFather`.
2. Obtain the bot token.
3. Send the bot at least one message.
4. Obtain the numeric chat ID, for example through `@userinfobot`.
5. Enter the token and chat ID under **Settings → Alerts**.
6. Select **Send test message**. The test uses the form's current values even if they have not
   been saved.
7. Enable the desired alert types and save Settings.

The backend container needs outbound HTTPS and working DNS to reach
`api.telegram.org`.

### Pending-task alerts

When enabled, Task Central counts Pending and In Progress tasks on non-archived machines whose
`updated_at` time is older than the configured threshold.

A message is sent only if:

- Alerts are enabled.
- Token and chat ID are present.
- At least one stale task exists.
- The configured minimum frequency has elapsed since the last successful pending-task alert.

The message reports a count rather than listing task details. A failed send does not advance the
last-sent time.

### Due-reminder alerts

When enabled, Task Central checks enabled reminders on non-archived machines.

- A reminder is due when its next-due date is today or earlier.
- Messages are gated until the configured daily time in the application timezone.
- Each reminder is notified once for a given next-due date.
- Marking it done or rescheduling it creates a new notification cycle.

The background alert loop checks approximately every 60 seconds. It is designed for one backend
worker. Running multiple uvicorn workers can cause duplicate sends.

Telegram messages are sent as plain text without Telegram markup parsing.

## Backup, export, import, and recovery

Task Central offers two backup formats with different purposes.

### JSON export

Use **Settings → Export all data (JSON)** for a portable application-level export. It includes:

- Machines and tags
- Tasks and task templates
- Reminders and reminder templates
- Services
- Host storage
- Network equipment and segments
- Dependencies
- Notes
- Obsidian templates
- Generated document snapshots
- Activity events
- Exposed application settings

The database password override (`auth_password_hash`), local AI API key (`llm_api_key`), and
internal first-run flag (`setup_completed`) are intentionally omitted.

JSON is the intended path for moving between database engines, but see
[Known current-version caveats](#known-current-version-caveats) before relying on JSON restore.

### SQLite database backup

Use **Download database backup** for an exact SQLite database file, including secrets and internal
settings such as the CLI password override and local AI API key. Protect the file accordingly.
This action is unavailable when using PostgreSQL.

Release-bundle installations can create a consistent online backup without stopping Task Central:

```bash
./backup.sh
```

The backup is written under `backups/`. Keep multiple dated copies and periodically test a restore
in a separate installation.

### JSON import

JSON import is a full replacement, not a merge.

The UI:

1. Rejects files larger than 20 MB.
2. Parses the JSON.
3. Sends a dry-run validation request.
4. Shows a record-count summary.
5. Requires confirmation.
6. Deletes current application data and replaces it with the imported records in one database
   transaction.

If import processing fails before commit, the transaction should roll back. Nevertheless, always
take a separate database backup before importing.

Because JSON exports omit the password hash and local AI API key while import replaces application
settings, a successful JSON import removes the CLI-set password override and clears the local AI
key. Existing signed browser sessions can remain valid, but future logins fall back to
`AUTH_PASSWORD` or its built-in default. Set the password again with the CLI and re-enter any
required local AI key immediately after a JSON restore.

### Restoring a SQLite file

For a release-bundle installation:

```bash
./restore.sh taskcentral-YYYYMMDD-HHMMSS.db
```

The restore script creates a safety backup, stops the application, replaces the database, removes
stale SQLite WAL files, restarts Task Central, and waits for health checks.

For a source deployment:

```bash
cd /taskcentral
docker compose down
cp ./data/taskcentral.db ./data/taskcentral.db.before-restore
cp /path/to/known-good-backup.db ./data/taskcentral.db
docker compose up -d
```

Use the correct ownership and permissions for the local deployment. Keep the pre-restore copy
until the restored application has been verified.

### PostgreSQL

The data model and SQLAlchemy configuration can use PostgreSQL, but the default distribution does
not include the PostgreSQL driver or database service.

To use it:

1. Add `psycopg[binary]` to `backend/requirements.txt`.
2. Supply a PostgreSQL SQLAlchemy URL through `DATABASE_URL`.
3. Provide and maintain the PostgreSQL server separately.
4. Use PostgreSQL-native backups such as `pg_dump`.

## Installation and deployment

### Requirements

For the standard release installation:

- Docker Engine
- Docker Compose v2
- Host port 8484, or another chosen `APP_PORT`
- Outbound HTTPS only if Telegram alerts are used

Prebuilt release images support Linux `amd64` and Linux `arm64`. Users do not need Git, Python,
Node.js, npm, or a local compiler.

### Recommended release installation

1. Download `taskcentral-VERSION.tar.gz` from the GitHub Releases page.
2. Optionally verify it against `SHA256SUMS`.
3. Extract the archive and enter the extracted directory.
4. Run:

```bash
./install.sh
```

5. Choose the web port, or press Enter for `8484`.
6. Open the URL printed by the installer and complete the first-run setup wizard.

The installer:

- Verifies access to Docker and Docker Compose v2
- Generates a unique `SECRET_KEY` and random fallback password
- Creates private `data/` and `backups/` directories
- Pulls pinned, versioned backend and frontend images
- Starts both services and waits until both health checks pass
- Preserves an existing `.env` and database when run again

Keep the extracted directory. It is the installation directory and contains the configuration,
database, backups, and management scripts.

### Source installation for developers

Clone or copy the source tree, then:

```bash
cp .env.example .env
docker compose up -d --build
```

Open:

```text
http://localhost:8484
```

The default topology is:

```text
Browser
  |
  v
frontend nginx :8484
  |  serves React static files
  |  proxies /api
  v
FastAPI backend :8000
  |
  v
/taskcentral/data/taskcentral.db
```

Source Compose mounts `MANUAL.md` read-only at `/app/MANUAL.md`. Release backend images include the
manual in the image so documentation updates arrive with application updates. Both deployment
methods map `host.docker.internal` to the Docker host gateway for local model access.

The backend container runs Alembic migrations before starting uvicorn. The frontend waits for the
backend health check before starting.

### Common Docker commands

```bash
# Status
docker compose ps

# Follow persistent local logs
tail -f logs/taskcentral.log logs/frontend.log

# Docker console logs remain available as a fallback
docker compose logs --tail=200 backend frontend

# Rebuild both services
docker compose build backend frontend

# Start or recreate both services
docker compose up -d backend frontend

# Stop the stack without deleting the data bind mount
docker compose down

# Backend health from the host
curl http://localhost:8484/api/v1/health
```

A healthy response is:

```json
{"status":"ok","database":"ok"}
```

### Environment variables

| Variable | Application default | Purpose |
|---|---|---|
| `TASKCENTRAL_VERSION` | Release bundle version | Pinned backend/frontend container tag |
| `TASKCENTRAL_IMAGE_PREFIX` | Generated per release | Registry and package owner |
| `TASKCENTRAL_RELEASE_REPOSITORY` | `lurry2020/taskcentral`; generated per release | Repository used by the in-app version check and updater |
| `APP_NAME` | `Task Central` | Backend application/logging name; the visible UI name is also stored in Settings |
| `APP_ENV` | `development` in code, `production` in Compose | Environment label used in startup logging |
| `APP_PORT` | `8484` | Host port published by the frontend container |
| `DATABASE_URL` | SQLite under the resolved data directory | SQLAlchemy database URL |
| `CORS_ORIGINS` | Local development and port 8484 in code | Comma-separated origins allowed by CORS |
| `LOG_LEVEL` | `INFO` | Backend logging level |
| `LOG_MAX_BYTES` | `5242880` | Size at which each persistent local log rotates |
| `LOG_BACKUP_COUNT` | `5` | Number of older numbered log files retained |
| `SECRET_KEY` | `change-me` | HMAC key used to sign login session tokens |
| `DATA_DIR` | Repository `data` locally, `/data` in the container | Data directory |
| `DEMO_MODE` | `false` | Seed sample machines on startup |
| `MAX_IMPORT_BYTES` | `20971520` | Backend request/import size threshold |
| `AUTH_USERNAME` | `admin` | Legacy/CLI fallback username; setup-selected DB value takes precedence |
| `AUTH_PASSWORD` | Development placeholder; random in release installs | Legacy/CLI fallback password |
| `AUTH_TOKEN_TTL_HOURS` | `168` | Login token lifetime in hours |

Release installers generate `.env` with mode `0600`. Do not share it; it contains the session
signing key and fallback password.

### Reverse proxy

Task Central can sit behind Caddy or another reverse proxy:

```caddyfile
taskcentral.example.com {
    reverse_proxy localhost:8484
}
```

Use HTTPS for any access beyond a trusted local network. Preserve the `/api` path when proxying.

### Local development

Backend:

```bash
cd /taskcentral/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload
```

The backend listens on port 8000. Interactive docs are configured at:

```text
http://localhost:8000/api/docs
```

Frontend:

```bash
cd /taskcentral/frontend
npm install
npm run dev
```

The development frontend listens on port 5173 and proxies `/api` to port 8000. Override the
backend target with `VITE_API_PROXY`.

### Verification commands

```bash
cd /taskcentral/backend
.venv/bin/python -m pytest tests -q

cd /taskcentral/frontend
npm test
npm run typecheck
npm run build
```

## Upgrading

### Release-bundle installation

Update to the newest published release:

```bash
./update.sh
```

Or install a specific version:

```bash
./update.sh 1.2.3
```

Installations created before the self-refreshing updater can run this one-command bridge from the
existing installation directory:

```bash
curl -fsSL https://github.com/lurry2020/taskcentral/releases/latest/download/taskcentral-update.sh | bash
```

After that bridge completes, future releases use the normal `./update.sh` command.

The updater:

1. Discovers or validates the requested version.
2. Downloads the versioned release bundle and verifies its SHA-256 checksum.
3. Pulls the new images before downtime.
4. Creates a consistent online SQLite backup.
5. Refreshes Compose files, management scripts, documentation, and release metadata.
6. Changes the pinned image version.
7. Recreates the services; Alembic applies migrations at backend startup.
8. Waits for backend and frontend health checks.
9. If health checks fail, restores the previous release files, image version, and pre-update
   database.

Never interrupt an update while it is restoring a failed deployment. The pre-update backup remains
under `backups/` after success.

### Source installation

Before every source upgrade:

1. Download or copy a database backup.
2. Confirm that the backup exists and is nonempty.
3. Read release or migration notes.

Typical source-based upgrade:

```bash
cd /taskcentral
git pull
docker compose build
docker compose up -d
```

Migrations apply automatically when the backend container starts. Monitor:

```bash
tail -f logs/taskcentral.log logs/frontend.log
```

Do not downgrade the database casually. SQLite constraint changes use table-rebuild migrations,
and older application versions may not understand newer machine types or fields.

## Version and update checking

The bottom of the desktop sidebar and mobile navigation drawer includes a **Version** button above
**Changelog**. It always identifies the release running in the backend container. Task Central
checks that release against the latest published GitHub release after the user signs in.

The installed release is pinned by `TASKCENTRAL_VERSION` in the installation's `.env`; release
bundles keep the accompanying `VERSION` file at the same value. To discover the latest release,
the backend downloads the small `VERSION` asset published at:

```text
https://github.com/lurry2020/taskcentral/releases/latest/download/VERSION
```

Successful results are cached in backend memory for one hour, preventing repeated GitHub requests
during normal navigation. The check sends no inventory, settings, credentials, or other application
data to GitHub.

- When the installed release is current, the modal says **You're up to date**.
- When a newer release exists, the sidebar button displays an **Update** marker and the modal shows
  both installed and latest versions.
- If GitHub is unavailable, the modal reports that the check could not be completed without
  claiming that an update is or is not available. **Check again** retries the request.

The modal links to the Task Central GitHub Releases page and can be closed with its **X**, the
Escape key, or the backdrop. Checking does not install anything. Run `./update.sh` from the
installation directory to perform the normal backed-up update process.

The authenticated endpoint is:

```text
GET /api/v1/version
```

The release repository comes from `TASKCENTRAL_RELEASE_REPOSITORY`, which official bundles set to
`lurry2020/taskcentral`.

The frontend image also embeds its own build version. While Task Central is open, the browser
checks the running backend version every 60 seconds and again when the tab regains focus. If an
update changes the backend while an older frontend remains loaded, a persistent banner identifies
both versions and offers **Reload Task Central**. Reloading is user-controlled so an automatic
refresh cannot discard an in-progress form.

Task Central serves `index.html` and browser routes with `no-store`/`no-cache` headers, so a normal
reload retrieves the current application shell. Fingerprinted files under `/assets/` remain
immutable and cacheable because every frontend build gives changed assets new filenames. A hard
refresh should not be necessary after this behavior is present in the installed release. A reverse
proxy or CDN should preserve these origin cache headers rather than overriding them.

## Changelog and What's New

Task Central keeps release notes in the repository-level `CHANGELOG.md`. The backend reads that
file and returns the section associated with the running `TASKCENTRAL_VERSION` followed by every
older release section. Sections remain in newest-first order. Unpublished `[Unreleased]` notes are
not included when an exact version heading exists.

After an existing installation updates to a version it has not seen:

1. The user signs in and visits the Dashboard at `/`.
2. Task Central automatically opens the **What's New in Task Central** modal.
3. The modal renders the current version followed by the complete older release history.
4. The current version is stored internally as `changelog_seen_version`, preventing another
   automatic popup for that version.

This acknowledgement is application-wide and stored in the Task Central database, rather than
browser storage. It therefore remains consistent across pages and browsers. A new version has a
different identifier and will automatically appear once after that update. Brand-new
installations mark their setup version as seen when the first-run wizard completes, so initial
installation is not misidentified as an update.

The **Changelog** button remains at the bottom of the desktop and mobile sidebar. It reopens the
same modal at any time. The history has its own bounded scroll area, with the newest version at the
top and the oldest at the bottom. Close the modal with its **X**, the Escape key, or the backdrop.

Maintainers write release sections in this format:

```markdown
## [1.2.3]

### Added

- Description of the current release change.
```

The changelog endpoint is authenticated:

```text
GET  /api/v1/changelog/current
POST /api/v1/changelog/current/seen
```

The `POST` endpoint records only the running version. It does not alter inventory or user
configuration.

## API access

The REST API is under `/api/v1`. Docker-hosted interactive documentation is available at:

```text
http://localhost:8484/api/docs
```

The OpenAPI document is at `/api/openapi.json`.

### Authenticating

Login:

```bash
curl -sS \
  -H 'Content-Type: application/json' \
  -d '{"username":"YOUR_USERNAME","password":"YOUR_PASSWORD"}' \
  http://localhost:8484/api/v1/auth/login
```

The response contains `token` and `username`. Supply the token on protected calls:

```bash
curl -sS \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  http://localhost:8484/api/v1/machines
```

Do not paste real tokens into tickets, notes, prompts, or command history.

### API groups

| Group | Purpose |
|---|---|
| `/setup` | Public first-run status, one-time completion, and pre-save integration tests |
| `/auth` | Login and current-user validation |
| `/health` | Database-backed health check |
| `/chat` | Authenticated local-LLM chat completion |
| `/version` | Installed release and cached latest-GitHub-release comparison |
| `/changelog` | Current-version notes and the one-time seen acknowledgement |
| `/dashboard` | Summary, recent machines, and attention items |
| `/machines` | Inventory CRUD, validation, live connectivity, duplicate, archive, hosts, tags, and activity |
| `/machines/{id}/tasks` | Checklist task operations |
| `/machines/{id}/reminders` | Recurring reminder operations |
| `/machines/{id}/services` | Service records |
| `/machines/{id}/storage` | Host storage records |
| `/machines/{id}/network-devices` | Network equipment |
| `/machines/{id}/network-segments` | VLAN/subnet segments |
| `/machines/{id}/dependencies` | Outgoing and reverse dependencies |
| `/machines/{id}/notes` | Markdown notes |
| `/machines/{id}/documents` | Generate, list, retrieve, and download Markdown snapshots |
| `/task-templates` | Checklist defaults |
| `/reminder-templates` | Reminder defaults |
| `/obsidian-templates` | Per-type templates, preview, variables, and reset |
| `/settings` | Application settings plus Telegram and local-AI connection tests |
| `/data` | JSON export/import, SQLite backup, and sample-data removal |

Use the OpenAPI documentation for exact request and response schemas.

## Security guidance

Task Central is designed for a trusted, single-user homelab environment. Login is useful but
does not replace network security.

Recommended controls:

- Keep the application on a private LAN, VPN, or access-controlled reverse proxy.
- Use HTTPS whenever traffic can cross an untrusted network.
- Set a long random `SECRET_KEY`; changing it invalidates all existing tokens.
- Change the built-in password immediately with the CLI.
- Protect `.env`, database backups, and JSON exports.
- Do not commit `.env` or the `data` directory.
- Keep the host OS, Docker, base images, Python packages, and npm packages updated.
- Expose only the frontend port; do not publish backend port 8000 unless necessary.
- Restrict filesystem access to `/taskcentral/data`.
- Review reverse-proxy request-size limits and authentication behavior.
- Treat Telegram bot tokens as secrets.
- Treat local AI API keys as secrets; they are stored in the database but excluded from JSON
  export.
- Firewall local model ports so only trusted LAN/container clients can reach them.
- Review the local model's own logging and retention behavior.
- Store actual credentials in a password manager and record only their location in Task Central.

Application protections include:

- HMAC-signed, expiring bearer tokens
- Salted PBKDF2 database password overrides
- Sandboxed Jinja templates
- Sanitized Markdown rendering
- Sanitized generated filenames
- Request/import size checks
- Pydantic validation for API input
- SQLite foreign keys and cascading child deletion

The application does not provide multiple users, roles, permissions, token revocation lists,
rate limiting, account lockout, or built-in TLS.

## Logs and diagnostics

Task Central writes persistent diagnostic files directly under the installation or project
directory. They are not stored under `data/`, and users normally do not need `docker logs` to
read them.

### Exact log locations

For the source installation used throughout this manual:

```text
/taskcentral/logs/taskcentral.log
/taskcentral/logs/frontend.log
```

For the separate test installation:

```text
/testtaskcentral/logs/taskcentral.log
/testtaskcentral/logs/frontend.log
```

For a release-bundle installation, `logs/` is inside the extracted installation directory-the
same directory that contains `compose.yml`, `.env`, `install.sh`, and `update.sh`. For example, if
the release was extracted to `/opt/taskcentral`, the files are
`/opt/taskcentral/logs/taskcentral.log` and `/opt/taskcentral/logs/frontend.log`.

The complete directory can contain active and rotated files:

```text
logs/
├── taskcentral.log
├── taskcentral.log.1
├── ...
├── frontend.log
└── frontend.log.1
```

- `taskcentral.log` contains backend startup and migration output, application exceptions,
  integration failures such as local-AI or Telegram connection problems, and failed API request
  status codes.
- `frontend.log` contains nginx startup, upstream, timeout, and reverse-proxy errors. Routine
  browser access requests are intentionally omitted.
- The active files rotate at 5 MiB by default and keep five older numbered copies. Configure
  `LOG_MAX_BYTES` and `LOG_BACKUP_COUNT` in `.env`, then recreate the containers to change this.
- Task Central does not intentionally record passwords, API keys, bearer tokens, chat prompts, or
  model response bodies. Local-AI response-shape errors record only structural field names.

### Reading the logs

From the installation directory, read the newest entries without interacting with Docker:

```bash
cd /taskcentral
tail -n 200 logs/taskcentral.log
tail -n 200 logs/frontend.log
```

Use `tail -f logs/taskcentral.log logs/frontend.log` to watch both files while reproducing a
problem. `docker compose logs --tail=200` remains a fallback for failures that happen before a
container can initialize its mounted log file.

To search active and rotated logs for likely failures:

```bash
grep -i -E 'critical|error|warning|failed|timeout' logs/*.log*
```

An empty `frontend.log` is normal when nginx has not encountered a warning, proxy failure, or
server error.

### Logging implementation

The backend uses Python's built-in `logging` module with `RotatingFileHandler`. Uvicorn server
errors and Task Central application loggers write to `taskcentral.log`. The frontend uses nginx's
native error log, written to `frontend.log`; routine nginx access logging is disabled to avoid
noise and unnecessary disk usage.

### Configuring the log level and rotation

`LOG_LEVEL` controls backend logging only. Supported values are:

| Value | What it records |
|---|---|
| `DEBUG` | Detailed diagnostic information plus all higher-severity entries |
| `INFO` | Normal startup and operational events plus warnings and errors; this is the default |
| `WARNING` | Potential problems plus errors and critical failures |
| `ERROR` | Errors and critical failures |
| `CRITICAL` | Only the most severe failures |

Edit the installation's `.env` file rather than running a temporary `export` command:

```dotenv
LOG_LEVEL=DEBUG
LOG_MAX_BYTES=5242880
LOG_BACKUP_COUNT=5
```

`LOG_MAX_BYTES` controls the approximate rotation size of both active log files.
`LOG_BACKUP_COUNT` controls how many older numbered copies are retained. After editing `.env`,
recreate the containers.

Source installation:

```bash
cd /taskcentral
docker compose up -d --force-recreate backend frontend
```

Release-bundle installation:

```bash
cd /path/to/taskcentral
docker compose --env-file .env -f compose.yml up -d --force-recreate backend frontend
```

Changing `LOG_LEVEL` does not require rebuilding an image and does not alter the database.

## Troubleshooting

### The page does not open

Check containers:

```bash
cd /taskcentral
docker compose ps
tail -n 100 logs/frontend.log logs/taskcentral.log
```

If port 8484 is occupied, choose another host port in `.env`:

```dotenv
APP_PORT=8585
```

Then recreate the frontend:

```bash
docker compose up -d
```

### Frontend returns 502

Nginx cannot reach a healthy backend. Inspect:

```bash
tail -n 200 logs/frontend.log
tail -n 200 logs/taskcentral.log
docker compose ps
```

Common causes are a failed migration, database permission problem, invalid database URL, or a
backend startup exception.

### Health check fails

Call it directly through the frontend:

```bash
curl -v http://localhost:8484/api/v1/health
```

The health endpoint performs `SELECT 1`; a database problem causes it to fail.

### Login fails

1. If `/setup` appears, complete first-run setup before attempting to log in.
2. Confirm the username; case does not matter.
3. Confirm exact password capitalization.
4. Select **Forgot password?** on the login page to display the reset command, or run:

   ```bash
   docker compose exec backend python -m app.cli setpassword
   ```

5. Confirm the backend is using the intended database volume.
6. If relying only on `.env` credentials, read the Compose caveat below.
7. Clear the site's local storage or sign out if an old token is behaving unexpectedly.

### Setup appears unexpectedly

Do not complete setup if the instance already contains data. An existing database should be
marked complete automatically.

1. Confirm the backend is using the intended `DATABASE_URL` and mounted database file.
2. Stop and inspect the volume mapping if a new, empty database was created accidentally.
3. Restore the intended database mapping or backup before continuing.
4. Check backend startup logs for database or permission errors.

Completing setup against the wrong empty database does not recover or migrate data from another
database file.

### A password reset appears to disappear

The CLI password override lives in the database. It will disappear if:

- The backend is pointed to another database.
- The data volume is replaced.
- A JSON import replaces settings.
- `setpassword --reset` is run.

Set it again after confirming the active database.

### Database locked

SQLite permits limited concurrent writes.

- Ensure only one Task Central backend is using the database.
- Do not run multiple uvicorn workers.
- Stop stray development servers.
- Avoid copying/replacing the database while the app is writing.
- Inspect backend logs for the operation that holds the lock.

For heavier concurrent use, migrate deliberately to PostgreSQL.

### Import is rejected

Confirm:

- The file is valid JSON.
- It contains `"format": "taskcentral-export"`.
- Its export version is supported.
- It is no larger than 20 MB.
- Every child record references a machine included in the export.

If the export contains Host or Network records, see the current restore defect under
[Known current-version caveats](#known-current-version-caveats).

### Obsidian template will not save or generate

- Use Preview to locate the Jinja error.
- Check `{% if %}`, `{% for %}`, and matching `{% endif %}`/`{% endfor %}` blocks.
- Use only variables shown by the template editor.
- Reset the individual template if needed.
- Back up custom template text before restoring defaults.

### Generated document is missing data

Generation uses a snapshot of current Task Central data.

- Confirm the field or related record is filled in.
- Confirm the template references the correct variable.
- Confirm checklist inclusion settings.
- Generate a new snapshot after changing data; old snapshots do not update.

### A template change did not update an existing checklist or reminder

This is expected. Templates are copied at machine creation.

Use **Apply new defaults** to add missing items. Edit existing machine items individually if
their copied content must change.

### A VM or LXC is not listed under its host

- Confirm the target record's type is Host.
- Confirm it is not archived.
- Make the guest's Host field match the Host machine's name.
- Save the guest again to synchronize the dependency.
- Check the guest's Dependencies tab for a Host dependency.

### Telegram test fails

- Verify both token and numeric chat ID.
- Send the bot a direct message first.
- Check backend outbound HTTPS and DNS.
- Inspect backend logs.
- Confirm Telegram has not revoked the token.

The test button uses unsaved form values, but scheduled alerts use saved values.

### Alerts do not arrive

- Save Settings after enabling alerts.
- Verify the relevant alert type is enabled.
- Confirm token and chat ID are stored.
- Confirm there are qualifying stale tasks or due reminders.
- For reminder alerts, wait until the configured daily time in the selected timezone.
- Ensure only one backend worker is running.

### Local AI connection test fails

- Confirm the local model server is running and the named model is installed or loaded.
- Select **Refresh** and choose the exact model tag or identifier reported by the server.
- For Ollama, configure the root URL such as `http://host.docker.internal:11434`; do not append
  `/api/chat`.
- For an OpenAI-compatible server, include `/v1` when its API requires it.
- Remember that `localhost` inside the backend container refers to the backend container itself,
  not the Docker host. Prefer `host.docker.internal` for a model running on the host.
- Ensure the model server listens on the host gateway/private interface rather than only
  `127.0.0.1`.
- Check the host firewall and model-server access controls.
- Public IP addresses and public hostnames are rejected by design.
- Increase the request timeout for large or CPU-only models.
- Inspect backend logs:

  ```bash
  docker compose logs --tail=200 backend
  ```

### Local AI model dropdown does not load

- Confirm the base URL is complete and uses `http://` or `https://`.
- Remember that the model list is requested by the Task Central backend container, not by the
  browser. Browser access to the Ollama welcome page does not prove container access.
- For Ollama, verify `http://OLLAMA-IP:11434/api/tags` is reachable from the backend container.
- For an OpenAI-compatible provider, verify its `/models` endpoint is enabled and include `/v1`
  in the base URL when required.
- Check routing, VLAN rules, and firewalls between the Task Central and model-server hosts.
- Confirm the optional API key is correct, then select **Refresh**.

### A machine is shown as Offline but is running

- The indicator measures ICMP ping response, not application or service health.
- Confirm the stored machine IP is correct.
- Permit ICMP echo between the Task Central backend container and the target network if desired.
- Check Docker networking, VLAN routing, and host/network firewalls.
- Use the refresh button beside the indicator after changing network rules.
- If ICMP is intentionally blocked, treat Offline as “no ping response,” not proof that the device
  is powered off.

### Chat says Setup required

- Open Settings → Local AI.
- Supply a provider, base URL, and model.
- Test the connection.
- Select **Enable local AI chat**.
- Save Settings and reopen the chat.

### Local AI answers lack application detail

- Enable **Include relevant Task Central manual sections**.
- Confirm `MANUAL.md` exists in `/taskcentral` and is mounted at `/app/MANUAL.md`:

  ```bash
  docker compose exec backend test -r /app/MANUAL.md
  ```

- Ask a specific question using the application feature's name.
- Clear the conversation if old context is confusing the model.

### Timestamps look wrong

- Set the application timezone in Settings.
- Do not change the backend/database to store local time.
- Backend timestamps are UTC and may be serialized without a trailing `Z`; the frontend treats
  timezone-less server timestamps as UTC before display conversion.

## Known current-version caveats

These notes describe verified behavior in the current source tree and should be considered when
supporting or operating this version.

### Some Settings controls are stored but not fully enforced

In the current frontend/backend wiring:

- Date format can be saved, but most application date rendering uses fixed formatting.
- “Ask for confirmation before destructive actions” can be saved, but dialogs are currently
  shown according to page behavior rather than this preference.
- “Required task behavior” can be saved, but Dashboard attention logic currently reports
  incomplete work independently of that setting.

Do not rely on these controls as policy enforcement until their consumers are implemented.

### Broad backend dependency ranges can drift

Python requirements allow broad compatible-looking ranges rather than exact tested versions.
A future dependency release can change test or runtime behavior without a source change. Preserve
a known-good image or lock resolved dependency versions for reproducible deployments.

### The scheduler assumes one worker

The background alert loop has no cross-process leader election or distributed lock. Use one
uvicorn worker to avoid duplicate Telegram messages.

### Single-user and SQLite assumptions

The application is optimized for one person and modest homelab write volume. There is no
multi-user authorization model, and SQLite is not intended for many concurrent writers.

## Technical reference

### Architecture

- Backend: Python, FastAPI, SQLAlchemy, Pydantic, Alembic, sandboxed Jinja2
- Frontend: React, TypeScript, Vite, Tailwind CSS, TanStack Query, React Hook Form, Zod
- Production web server: nginx
- Default database: SQLite
- Optional database: PostgreSQL with an added driver
- Alerts: Telegram Bot API through Python standard-library HTTP

### Persistence

The default SQLite file is:

```text
/taskcentral/data/taskcentral.db
```

Inside the backend container it is mounted at:

```text
/data/taskcentral.db
```

Application settings are stored as JSON-encoded values in a key/value table. Internal settings,
such as the password hash, last alert time, and `changelog_seen_version`, are not exposed on the
normal Settings API.

### Data relationships

- A Machine owns tasks, reminders, services, storage, equipment, segments, dependencies, notes,
  generated documents, and activity.
- Deleting a machine cascades to its child records.
- Tags have a many-to-many relationship with machines.
- Dependencies can point to another Machine or an external name.
- Templates can be deleted without deleting their previously copied machine items.
- Generated documents are snapshots and are not updated in place.
- Each Machine stores whether relevant changes require its Obsidian document to be regenerated.
  JSON export and import preserve this state.

### Seed behavior

On startup, Task Central idempotently adds missing built-in:

- Task templates
- Reminder templates
- Obsidian templates
- Application settings

It does not normally overwrite existing customized rows. The explicit restore-default action
does overwrite Obsidian template content.

With `DEMO_MODE=true`, startup can seed sample machines tagged `sample-data`. Clear them from
Settings when no longer needed.

### Limits and validation

- Import/request limit: 20 MiB by default
- Machine name: 1–200 characters
- VMID/CTID: 1–999,999,999
- Service port: 1–65535
- VLAN ID: 1–4094
- Reminder interval: 1–3650 days
- Page size API maximum: 200
- Activity endpoint maximum: 500 events per request
- Generated-document list maximum: 200 snapshots per request
- Machine task statuses: Pending, In Progress, Completed, Blocked, Not Applicable

## Guidance for AI assistants

An AI using this manual should follow these support principles:

1. Determine whether the user is asking about normal UI use, installation/operations, API use,
   recovery, or development before giving commands.
2. Prefer the UI workflow for ordinary user tasks and Docker Compose commands for deployed
   operations.
3. Never describe Task Central as a provisioning engine; it tracks and documents provisioning.
4. Remember that templates are copied. A template edit never retroactively changes existing
   machines.
5. Remember the special Network scoping rule: Network gets only Network defaults, not All.
6. Treat JSON import, permanent deletion, restoring templates, clearing sample data, and replacing
   the SQLite file as destructive operations. Recommend a verified backup first.
7. Never request or repeat passwords, session tokens, Telegram bot tokens, private keys, or
   database credentials. Use placeholders in examples.
8. Do not tell users to convert stored timestamps to local time; display conversion is the
    intended design.
9. Do not recommend multiple backend workers while Telegram alerts are enabled.
10. Distinguish archival from permanent deletion.
11. For release installations, prefer `backup.sh`, `update.sh`, and `restore.sh` over manual
    database copying or direct Compose changes.
12. When diagnosing a failure, ask for the exact page/action, HTTP status or UI message, relevant
    entries from `logs/taskcentral.log` or `logs/frontend.log`, deployment method, database type,
    and recent changes. Use Docker console logs only as a fallback.
13. When documentation and observed behavior conflict, prioritize the known current-version
    caveats and source-backed behavior in this manual.
14. Do not speculate about logging. State that backend logging uses Python's built-in `logging`
    module, give the exact project-relative `logs/` paths, and explain that `LOG_LEVEL` affects the
    backend while nginx records warnings and errors separately.
15. For high-risk recovery steps, state what will be replaced, what will be retained, and how to
    roll back before presenting the command.
16. For changelog questions, distinguish the automatic one-time current-version popup from the
    permanent sidebar button. Do not claim that the modal displays the full changelog history.

When uncertain, an AI should say what is known, identify the missing evidence, and suggest a
read-only diagnostic before proposing changes.
