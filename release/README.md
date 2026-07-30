# Task Central installation

This bundle installs a prebuilt, versioned Task Central release. The only runtime prerequisite is
Docker Engine with the Docker Compose v2 plugin.

Supported container platforms:

- Linux `amd64`
- Linux `arm64`

## Install

Extract the release bundle, enter its directory, and run:

```bash
./install.sh
```

The installer asks for the web port (default `8484`), generates unique session and fallback
credentials, creates private `data/`, `backups/`, and `logs/` directories, pulls the release
images, starts the application, and waits for both containers to become healthy.

Open `http://localhost:8484` or `http://SERVER-IP:8484` and complete the first-run setup wizard.
The username and password selected in the wizard replace the generated fallback credentials.

Keep the extracted directory. It is the installation directory and contains the management
scripts, configuration, database, and backups.

## Update

Install the newest published release:

```bash
./update.sh
```

Install a specific release:

```bash
./update.sh 1.2.3
```

The updater downloads and verifies the new release bundle, refreshes its own Compose files,
management scripts, and documentation, downloads the new images before downtime, and creates an
online SQLite backup. It then pins the new image version, starts the containers, applies database
migrations, and waits for health checks. If startup fails, it automatically restores the previous
release files, version, and pre-update database.

Installations created before the self-refreshing updater can run this one-command bridge from their
existing installation directory:

```bash
curl -fsSL https://github.com/lurry2020/taskcentral/releases/latest/download/taskcentral-update.sh | bash
```

After the next login and Dashboard visit, Task Central shows that version's release notes once.
Use the **Changelog** button at the bottom of the sidebar to reopen them later.

## Back up and restore

Create a consistent online SQLite backup:

```bash
./backup.sh
```

Backups are stored under `backups/`. Restore one with:

```bash
./restore.sh taskcentral-20260101-120000.db
```

Restore creates an additional safety backup before replacing the current database.

You can also create portable JSON exports from **Settings → Data Management**.

## Status and logs

```bash
docker compose --env-file .env -f compose.yml ps
tail -f logs/taskcentral.log logs/frontend.log
```

`taskcentral.log` contains backend startup, application, integration, and failed-request entries.
`frontend.log` contains nginx and proxy errors. Both files rotate at 5 MiB by default and retain
five older numbered copies. Docker console logs remain available as a fallback:

```bash
docker compose --env-file .env -f compose.yml logs --tail=200
```

## Stop or uninstall

Stop the application without removing containers:

```bash
docker compose --env-file .env -f compose.yml stop
```

Remove the containers while preserving configuration, data, backups, and logs:

```bash
./uninstall.sh
```

Permanently delete the local database, backups, logs, configuration, and containers:

```bash
./uninstall.sh --delete-data
```

The destructive option requires typing `DELETE`. Automation must additionally pass `--yes`.

## Configuration

The installer writes `.env` with permissions limited to the current user. Common settings:

| Setting | Purpose |
| --- | --- |
| `APP_PORT` | Host web port, default `8484` |
| `APP_NAME` | Application name |
| `TASKCENTRAL_VERSION` | Pinned container release |
| `TASKCENTRAL_IMAGE_PREFIX` | Container registry and owner |
| `LOG_LEVEL` | `DEBUG`, `INFO`, `WARNING`, or `ERROR` |
| `LOG_MAX_BYTES` | Rotation size for each local log file; default `5242880` |
| `LOG_BACKUP_COUNT` | Number of older log files retained; default `5` |
| `DEMO_MODE` | Seed removable sample machines on the first start |

Do not share `.env`; it contains the session signing key and a generated fallback password.

## HTTPS and remote access

Task Central serves HTTP directly. Keep it on a trusted private network or put it behind a reverse
proxy with HTTPS. Example Caddy configuration:

```caddyfile
taskcentral.example.com {
    reverse_proxy 127.0.0.1:8484
}
```

Do not expose Task Central directly to the public internet without HTTPS and appropriate network
controls.

## Troubleshooting

Check service health:

```bash
docker compose --env-file .env -f compose.yml ps
```

View recent logs:

```bash
tail -n 200 logs/taskcentral.log
tail -n 200 logs/frontend.log
```

The files intentionally omit passwords, API keys, authentication headers, chat prompts, and model
response bodies. Use Docker console logs only if the local files do not explain a container that
failed before its logging mount initialized.

If port `8484` is already used, stop Task Central, change `APP_PORT` in `.env`, and run
`./install.sh` again. Existing settings and data are preserved.
