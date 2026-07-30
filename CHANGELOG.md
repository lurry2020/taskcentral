# Changelog

All notable changes to Task Central releases are documented here.

The format follows Keep a Changelog, and release numbers use Semantic Versioning. The application
displays only the section that belongs to its running version.

## [Unreleased]

## [1.1.1] - 2026-07-30

### Changed

- Updates are now one command: `./update.sh` downloads and verifies the new release bundle,
  refreshes its own management files, pulls the pinned images, backs up the database, and applies
  the update.
- Added a standalone `taskcentral-update.sh` release asset that upgrades older installations whose
  original updater cannot refresh release files.

### Fixed

- Failed updates now restore the previous release-management files along with the prior version
  and pre-update database.

## [1.1.0] - 2026-07-30

### Added

- Local AI model dropdowns on the Setup and Settings pages, populated from the models installed on
  the configured local AI server.
- An Online or Offline indicator in each machine detail header, backed by an ICMP ping to the
  machine's IP address. Hovering over the indicator displays the ping details.
- Persistent rotating application logs inside the Task Central project directory. Backend logs are
  written to `logs/taskcentral.log`, and frontend/nginx logs are written to `logs/frontend.log`.
- A version-aware What's New modal that appears once after an update, plus a sidebar Changelog
  button for viewing the current version's notes again.
- A resizable Local AI chat window whose selected size and open or minimized state persist across
  page navigation.

### Changed

- Removed the Active, In Progress, and Maintenance status badge from the machine detail header.

## [1.0.0]

### Added

- Guided first-run setup with application username and password.
- Inventory for VM, LXC, physical, host, and network records.
- Per-machine checklists, reminders, services, storage, networking, dependencies, and notes.
- Obsidian document generation and version history.
- Telegram alerts and optional local-AI chat.
- JSON export/import, SQLite backup, and confirmed application reset.
- Prebuilt multi-architecture Docker release packaging.
- Guided install, backup, update, rollback, restore, and uninstall scripts.
