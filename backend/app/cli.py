"""Command-line admin utilities.

Usage (inside the backend container):
    docker compose exec backend python -m app.cli setpassword
    docker compose exec backend python -m app.cli setpassword 'NewPassw0rd!'
    docker compose exec backend python -m app.cli setpassword --reset   # revert to AUTH_PASSWORD
"""

import argparse
import getpass
import sys

from sqlalchemy import select

from app.database import SessionLocal
from app.models import IntegrationToken
from app.services.auth import clear_password, get_login_username, set_password
from app.services.integration_tokens import (
    INVENTORY_READ_SCOPE,
    SUPPORTED_SCOPES,
    create_integration_token,
    find_integration_token,
    parse_scopes,
    revoke_integration_token,
)


def _cmd_setpassword(args: argparse.Namespace) -> int:
    db = SessionLocal()
    try:
        username = get_login_username(db)
        if args.reset:
            cleared = clear_password(db)
            db.commit()
            print(
                f"Password override for '{username}' cleared - login now uses the "
                "AUTH_PASSWORD env/default. The username was not changed. Existing sessions "
                "were signed out."
                if cleared
                else f"No password override was set for '{username}'; nothing to clear."
            )
            return 0

        password = args.password
        if not password:
            password = getpass.getpass(f"New password for '{username}': ")
            confirm = getpass.getpass("Confirm new password: ")
            if password != confirm:
                print("Passwords do not match.", file=sys.stderr)
                return 1
        if not password:
            print("Password cannot be empty.", file=sys.stderr)
            return 1

        set_password(db, password)
        db.commit()
    finally:
        db.close()
    print(f"Password for '{username}' updated. Existing sessions were signed out.")
    return 0


def _cmd_integration_token_create(args: argparse.Namespace) -> int:
    if not args.name.strip():
        print("Integration token name cannot be blank.", file=sys.stderr)
        return 1
    scopes = args.scope or [INVENTORY_READ_SCOPE]
    unknown = set(scopes) - SUPPORTED_SCOPES
    if unknown:
        print(f"Unsupported scope: {sorted(unknown)[0]}", file=sys.stderr)
        return 1
    db = SessionLocal()
    try:
        record, plaintext = create_integration_token(db, args.name, scopes)
        db.commit()
        token_id = record.id
        prefix = record.token_prefix
    finally:
        db.close()
    print(f"Integration token created (id={token_id}, prefix={prefix}).")
    print("Copy this token now. It cannot be displayed again:")
    print(plaintext)
    return 0


def _cmd_integration_token_list(_args: argparse.Namespace) -> int:
    db = SessionLocal()
    try:
        records = list(db.scalars(select(IntegrationToken).order_by(IntegrationToken.id)))
        if not records:
            print("No integration tokens found.")
            return 0
        print("ID\tPREFIX\tSTATUS\tSCOPES\tNAME\tCREATED\tLAST USED")
        for record in records:
            status_text = "active" if record.revoked_at is None else "revoked"
            scopes = ",".join(parse_scopes(record.scopes)) or "none"
            last_used = record.last_used_at.isoformat() if record.last_used_at else "never"
            print(
                f"{record.id}\t{record.token_prefix}\t{status_text}\t{scopes}\t"
                f"{record.name}\t{record.created_at.isoformat()}\t{last_used}"
            )
    finally:
        db.close()
    return 0


def _cmd_integration_token_revoke(args: argparse.Namespace) -> int:
    db = SessionLocal()
    try:
        try:
            record = find_integration_token(db, args.selector)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        if record is None:
            print("Integration token not found.", file=sys.stderr)
            return 1
        if not revoke_integration_token(record):
            print(f"Integration token {record.id} ({record.token_prefix}) is already revoked.")
            return 0
        db.commit()
        print(f"Integration token {record.id} ({record.token_prefix}) revoked.")
    finally:
        db.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="taskcentral", description="Task Central admin CLI")
    sub = parser.add_subparsers(dest="command")

    sp = sub.add_parser("setpassword", help="Set (or reset) the login password")
    sp.add_argument("password", nargs="?", help="New password; omit to be prompted securely")
    sp.add_argument(
        "--reset",
        action="store_true",
        help="Clear the stored password and fall back to the AUTH_PASSWORD env/default",
    )
    sp.set_defaults(func=_cmd_setpassword)

    integration = sub.add_parser(
        "integration-token", help="Create, list, or revoke read-only integration tokens"
    )
    integration_sub = integration.add_subparsers(dest="integration_token_command")

    create = integration_sub.add_parser("create", help="Create an integration token")
    create.add_argument("--name", required=True, help="Descriptive token name")
    create.add_argument(
        "--scope",
        action="append",
        choices=sorted(SUPPORTED_SCOPES),
        help=f"Token scope (default: {INVENTORY_READ_SCOPE})",
    )
    create.set_defaults(func=_cmd_integration_token_create)

    list_tokens = integration_sub.add_parser("list", help="List integration token metadata")
    list_tokens.set_defaults(func=_cmd_integration_token_list)

    revoke = integration_sub.add_parser("revoke", help="Revoke an integration token")
    revoke.add_argument("selector", help="Token ID or unambiguous displayed prefix")
    revoke.set_defaults(func=_cmd_integration_token_revoke)

    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
