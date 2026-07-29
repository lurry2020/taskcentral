"""Command-line admin utilities.

Usage (inside the backend container):
    docker compose exec backend python -m app.cli setpassword
    docker compose exec backend python -m app.cli setpassword 'NewPassw0rd!'
    docker compose exec backend python -m app.cli setpassword --reset   # revert to AUTH_PASSWORD
"""

import argparse
import getpass
import sys

from app.config import get_settings
from app.database import SessionLocal
from app.services.auth import clear_password, set_password


def _cmd_setpassword(args: argparse.Namespace) -> int:
    username = get_settings().auth_username
    db = SessionLocal()
    try:
        if args.reset:
            cleared = clear_password(db)
            db.commit()
            print(
                "Password override cleared — login now uses the AUTH_PASSWORD env/default."
                if cleared
                else "No password override was set; nothing to clear."
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
    print(f"Password for '{username}' updated. New logins take effect immediately.")
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

    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
