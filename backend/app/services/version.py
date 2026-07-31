"""Check the installed Task Central version against the latest GitHub release."""

from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import Settings, get_settings


logger = logging.getLogger(__name__)

REPOSITORY_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
SEMVER_RE = re.compile(
    r"^[vV]?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
    r"(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$"
)
CACHE_TTL_SECONDS = 60 * 60


@dataclass(frozen=True)
class VersionCheck:
    current_version: str
    latest_version: str | None
    status: Literal["up_to_date", "update_available", "check_failed"]
    checked_at: datetime
    releases_url: str
    message: str


_cache_lock = threading.Lock()
_latest_cache: dict[str, tuple[float, str, datetime]] = {}


def clear_version_cache() -> None:
    """Clear the in-process release cache. Intended for tests and explicit retries."""
    with _cache_lock:
        _latest_cache.clear()


def _normalized_semver(value: str) -> str | None:
    value = (value or "").strip()
    match = SEMVER_RE.fullmatch(value)
    if match is None:
        return None
    return value[1:] if value[:1].lower() == "v" else value


def _semver_key(value: str) -> tuple | None:
    normalized = _normalized_semver(value)
    if normalized is None:
        return None
    match = SEMVER_RE.fullmatch(normalized)
    assert match is not None
    prerelease = match.group(4)
    prerelease_key = (
        tuple(
            (0, int(identifier)) if identifier.isdigit() else (1, identifier)
            for identifier in prerelease.split(".")
        )
        if prerelease
        else ()
    )
    return (
        int(match.group(1)),
        int(match.group(2)),
        int(match.group(3)),
        1 if prerelease is None else 0,
        prerelease_key,
    )


def _fetch_latest_version(repository: str, timeout_seconds: int = 5) -> str:
    url = f"https://github.com/{repository}/releases/latest/download/VERSION"
    request = Request(
        url,
        headers={
            "Accept": "text/plain",
            "User-Agent": "Task-Central-Version-Check",
        },
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        value = response.read(128).decode("utf-8", errors="strict").strip()
    normalized = _normalized_semver(value)
    if normalized is None:
        raise ValueError("GitHub returned an invalid VERSION release asset")
    return normalized


def _latest_release(repository: str) -> tuple[str, datetime]:
    now_monotonic = time.monotonic()
    with _cache_lock:
        cached = _latest_cache.get(repository)
        if cached is not None and now_monotonic - cached[0] < CACHE_TTL_SECONDS:
            return cached[1], cached[2]

    latest = _fetch_latest_version(repository)
    checked_at = datetime.now(timezone.utc)
    with _cache_lock:
        _latest_cache[repository] = (time.monotonic(), latest, checked_at)
    return latest, checked_at


def check_version(settings: Settings | None = None) -> VersionCheck:
    settings = settings or get_settings()
    current = _normalized_semver(settings.taskcentral_version)
    repository = settings.taskcentral_release_repository.strip()
    repository_is_valid = REPOSITORY_RE.fullmatch(repository) is not None
    releases_url = (
        f"https://github.com/{repository}/releases"
        if repository_is_valid
        else "https://github.com/lurry2020/taskcentral/releases"
    )
    checked_at = datetime.now(timezone.utc)

    if current is None:
        return VersionCheck(
            current_version=settings.taskcentral_version.strip() or "Unknown",
            latest_version=None,
            status="check_failed",
            checked_at=checked_at,
            releases_url=releases_url,
            message="The installed version is not a valid Task Central release number.",
        )
    if not repository_is_valid:
        return VersionCheck(
            current_version=current,
            latest_version=None,
            status="check_failed",
            checked_at=checked_at,
            releases_url=releases_url,
            message="The Task Central release repository is not configured correctly.",
        )

    try:
        latest, checked_at = _latest_release(repository)
    except (HTTPError, URLError, TimeoutError, OSError, UnicodeError, ValueError) as exc:
        logger.warning("Task Central version check failed: %s", exc)
        return VersionCheck(
            current_version=current,
            latest_version=None,
            status="check_failed",
            checked_at=checked_at,
            releases_url=releases_url,
            message="Task Central could not reach GitHub to check the latest release.",
        )

    current_key = _semver_key(current)
    latest_key = _semver_key(latest)
    update_available = current_key is not None and latest_key is not None and current_key < latest_key
    return VersionCheck(
        current_version=current,
        latest_version=latest,
        status="update_available" if update_available else "up_to_date",
        checked_at=checked_at,
        releases_url=releases_url,
        message=(
            f"Task Central {latest} is available."
            if update_available
            else f"Task Central {current} is up to date."
        ),
    )
