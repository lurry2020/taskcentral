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
credentials, creates private `data/` and `backups/` directories, pulls the release images, starts
the application, and waits for both containers to become healthy.

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

An update downloads the new images before downtime, creates an online SQLite backup, changes the
pinned image version, starts the new containers, applies database migrations, and waits for health
checks. If startup fails, it automatically restores both the previous version and the pre-update
database.

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
docker compose --env-file .env -f compose.yml logs -f
```

## Stop or uninstall

Stop the application without removing containers:

```bash
docker compose --env-file .env -f compose.yml stop
```

Remove the containers while preserving configuration, data, and backups:

```bash
./uninstall.sh
```

Permanently delete the local database, backups, configuration, and containers:

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
docker compose --env-file .env -f compose.yml logs --tail=200
```

If port `8484` is already used, stop Task Central, change `APP_PORT` in `.env`, and run
`./install.sh` again. Existing settings and data are preserved.
