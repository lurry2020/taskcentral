# Security policy

## Supported versions

Security fixes are provided for the current release. Users should run `./update.sh` regularly and
review release notes before upgrading.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities, credentials, session tokens, database contents, or
private deployment details in a public issue.

Use the repository's **Security → Report a vulnerability** option to open a private vulnerability
report. Include the affected Task Central version, deployment method, impact, and minimal
reproduction steps. Redact all real secrets and personal data.

If private vulnerability reporting is unavailable, contact the repository owner privately before
opening any public issue.

## Deployment expectations

Task Central is a single-user homelab application. Keep it on a trusted private network or behind
an access-controlled HTTPS reverse proxy. The application does not provide built-in TLS, multiple
users, roles, account lockout, or rate limiting.
