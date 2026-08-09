"""Single-user credentials and revocable opaque browser sessions."""

import hashlib
import hmac
import json
import os
import secrets
from datetime import timezone, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import ApplicationSetting, AuthSession
from app.models.base import utcnow

# A password override set via the CLI (`setpassword`) lives in application_settings,
# stored as a salted PBKDF2 hash. When present it takes precedence over AUTH_PASSWORD.
PASSWORD_HASH_KEY = "auth_password_hash"
USERNAME_KEY = "auth_username"
_PBKDF2_ITERATIONS = 200_000
SESSION_COOKIE_NAME = "taskcentral_session"


def hash_password(password: str, iterations: int = _PBKDF2_ITERATIONS) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${derived.hex()}"


def _verify_password_hash(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_hex, hash_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        derived = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(derived.hex(), hash_hex)
    except Exception:
        return False


def get_stored_password_hash(db: Session) -> str | None:
    row = db.get(ApplicationSetting, PASSWORD_HASH_KEY)
    if row is None:
        return None
    try:
        return json.loads(row.value)
    except Exception:
        return None


def get_login_username(db: Session) -> str:
    """Return the setup-selected username, falling back for legacy installs."""
    row = db.get(ApplicationSetting, USERNAME_KEY)
    if row is not None:
        try:
            username = json.loads(row.value)
            if isinstance(username, str) and username.strip():
                return username.strip()
        except Exception:
            pass
    return get_settings().auth_username.strip()


def set_login_username(db: Session, username: str) -> None:
    revoke_all_sessions(db)
    value = json.dumps(username.strip())
    row = db.get(ApplicationSetting, USERNAME_KEY)
    if row is None:
        db.add(ApplicationSetting(key=USERNAME_KEY, value=value))
    else:
        row.value = value


def set_password(db: Session, password: str) -> None:
    """Store a new login password (hashed). Overrides AUTH_PASSWORD until cleared."""
    revoke_all_sessions(db)
    value = json.dumps(hash_password(password))
    row = db.get(ApplicationSetting, PASSWORD_HASH_KEY)
    if row is None:
        db.add(ApplicationSetting(key=PASSWORD_HASH_KEY, value=value))
    else:
        row.value = value


def clear_password(db: Session) -> bool:
    """Remove the CLI password override so login falls back to AUTH_PASSWORD."""
    row = db.get(ApplicationSetting, PASSWORD_HASH_KEY)
    if row is None:
        return False
    revoke_all_sessions(db)
    db.delete(row)
    return True


def check_credentials(db: Session, username: str | None, password: str | None) -> bool:
    """Username case-insensitive, password case-sensitive (constant-time).

    Uses the CLI-set password hash if one exists, otherwise the AUTH_PASSWORD env/default.
    """
    settings = get_settings()
    user_ok = (username or "").strip().casefold() == get_login_username(db).casefold()
    stored_hash = get_stored_password_hash(db)
    if stored_hash:
        pass_ok = _verify_password_hash(password or "", stored_hash)
    else:
        pass_ok = hmac.compare_digest(password or "", settings.auth_password)
    return user_ok and pass_ok


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def revoke_all_sessions(db: Session) -> None:
    db.execute(delete(AuthSession))


def create_session(db: Session, username: str) -> tuple[str, int]:
    """Create a random opaque session and return its cookie value and lifetime."""
    settings = get_settings()
    lifetime_seconds = settings.auth_token_ttl_hours * 3600
    now = utcnow()
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= now))
    token = secrets.token_urlsafe(48)
    db.add(
        AuthSession(
            token_hash=_token_hash(token),
            username=username,
            expires_at=now + timedelta(seconds=lifetime_seconds),
        )
    )
    return token, lifetime_seconds


def authenticate_session(db: Session, token: str | None) -> str | None:
    """Return the username for an active server-side session, else None."""
    if not token:
        return None
    session = db.scalar(
        select(AuthSession).where(AuthSession.token_hash == _token_hash(token))
    )
    if session is None:
        return None
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= utcnow():
        return None
    if session.username.casefold() != get_login_username(db).casefold():
        return None
    return session.username


def revoke_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == _token_hash(token)))
