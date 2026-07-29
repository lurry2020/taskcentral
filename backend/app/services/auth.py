"""Single-user login: HMAC-signed session tokens (stdlib only, no dependency)."""

import base64
import hashlib
import hmac
import json
import os
import time

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import ApplicationSetting

# A password override set via the CLI (`setpassword`) lives in application_settings,
# stored as a salted PBKDF2 hash. When present it takes precedence over AUTH_PASSWORD.
PASSWORD_HASH_KEY = "auth_password_hash"
USERNAME_KEY = "auth_username"
_PBKDF2_ITERATIONS = 200_000


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(body: str) -> str:
    secret = get_settings().secret_key.encode("utf-8")
    return _b64encode(hmac.new(secret, body.encode("ascii"), hashlib.sha256).digest())


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
    value = json.dumps(username.strip())
    row = db.get(ApplicationSetting, USERNAME_KEY)
    if row is None:
        db.add(ApplicationSetting(key=USERNAME_KEY, value=value))
    else:
        row.value = value


def set_password(db: Session, password: str) -> None:
    """Store a new login password (hashed). Overrides AUTH_PASSWORD until cleared."""
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


def create_token(username: str) -> str:
    settings = get_settings()
    payload = {
        "sub": username,
        "exp": int(time.time()) + settings.auth_token_ttl_hours * 3600,
    }
    body = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{body}.{_sign(body)}"


def verify_token(token: str | None) -> str | None:
    """Return the subject (username) for a valid, unexpired token, else None."""
    if not token or "." not in token:
        return None
    body, signature = token.split(".", 1)
    if not hmac.compare_digest(signature, _sign(body)):
        return None
    try:
        payload = json.loads(_b64decode(body))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < time.time():
        return None
    return payload.get("sub")
