"""Creation, verification, and revocation for dedicated integration tokens."""

import hashlib
import hmac
import json
import re
import secrets
from datetime import timezone, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import IntegrationToken
from app.models.base import utcnow

INVENTORY_READ_SCOPE = "inventory:read"
SUPPORTED_SCOPES = frozenset({INVENTORY_READ_SCOPE})
TOKEN_PREFIX_LENGTH = 12
LAST_USED_WRITE_INTERVAL = timedelta(minutes=15)
_TOKEN_RE = re.compile(r"^tcint_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$")


def hash_integration_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def parse_scopes(value: str) -> list[str]:
    try:
        scopes = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(scopes, list):
        return []
    return [scope for scope in scopes if isinstance(scope, str)]


def normalize_scopes(scopes: list[str]) -> list[str]:
    return sorted(set(scopes))


def create_integration_token(
    db: Session,
    name: str,
    scopes: list[str],
) -> tuple[IntegrationToken, str]:
    """Create a token and return its record plus one-time plaintext value."""
    clean_name = name.strip()
    if not clean_name:
        raise ValueError("Integration token name cannot be blank")
    normalized_scopes = normalize_scopes(scopes)
    unknown = set(normalized_scopes) - SUPPORTED_SCOPES
    if unknown:
        raise ValueError(f"Unsupported integration token scope: {sorted(unknown)[0]}")

    # Prefix collisions are extraordinarily unlikely, but explicitly retry so
    # the indexed prefix remains a reliable lookup key.
    for _ in range(10):
        prefix = secrets.token_hex(TOKEN_PREFIX_LENGTH // 2)
        if db.scalar(
            select(IntegrationToken.id).where(IntegrationToken.token_prefix == prefix)
        ) is None:
            break
    else:
        raise RuntimeError("Could not generate a unique integration token prefix")

    # token_urlsafe(32) draws 32 random bytes, providing 256 bits of entropy.
    token = f"tcint_{prefix}_{secrets.token_urlsafe(32)}"
    record = IntegrationToken(
        name=clean_name,
        token_prefix=prefix,
        token_hash=hash_integration_token(token),
        scopes=json.dumps(normalized_scopes, separators=(",", ":")),
        created_at=utcnow(),
    )
    db.add(record)
    db.flush()
    return record, token


def authenticate_integration_token(db: Session, token: str) -> IntegrationToken | None:
    match = _TOKEN_RE.fullmatch(token)
    if match is None:
        return None
    record = db.scalar(
        select(IntegrationToken).where(IntegrationToken.token_prefix == match.group(1))
    )
    if record is None or record.revoked_at is not None:
        return None
    candidate_hash = hash_integration_token(token)
    if not hmac.compare_digest(record.token_hash, candidate_hash):
        return None
    return record


def mark_integration_token_used(db: Session, record: IntegrationToken) -> None:
    now = utcnow()
    last_used_at = record.last_used_at
    if last_used_at is not None and last_used_at.tzinfo is None:
        last_used_at = last_used_at.replace(tzinfo=timezone.utc)
    if last_used_at is None or now - last_used_at >= LAST_USED_WRITE_INTERVAL:
        record.last_used_at = now
        db.commit()


def revoke_integration_token(record: IntegrationToken) -> bool:
    if record.revoked_at is not None:
        return False
    record.revoked_at = utcnow()
    return True


def find_integration_token(db: Session, selector: str) -> IntegrationToken | None:
    """Resolve a CLI selector by numeric ID or unambiguous displayed prefix."""
    selector = selector.strip().lower()
    if selector.isdigit():
        return db.get(IntegrationToken, int(selector))
    if selector.startswith("tcint_"):
        selector = selector[6:]
    if len(selector) < 4:
        raise ValueError("Provide at least four token-prefix characters")
    matches = list(
        db.scalars(
            select(IntegrationToken)
            .where(IntegrationToken.token_prefix.startswith(selector))
            .order_by(IntegrationToken.id)
            .limit(2)
        )
    )
    if len(matches) > 1:
        raise ValueError("Token prefix is ambiguous; provide more characters")
    return matches[0] if matches else None
