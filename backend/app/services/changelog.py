"""Read release history and persist whether the current version was shown."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import ApplicationSetting


CHANGELOG_SEEN_KEY = "changelog_seen_version"
SECTION_RE = re.compile(
    r"^##[ \t]+\[([^\]]+)\](?:[ \t]+-[ \t]+([^\n]+))?[ \t]*$",
    re.MULTILINE,
)


@dataclass(frozen=True)
class ChangelogSection:
    version: str
    display_version: str
    content: str
    available: bool


def normalized_version(value: str) -> str:
    value = (value or "dev").strip()
    if value.lower() in {"dev", "development", "unreleased"}:
        return "dev"
    return value[1:] if value.lower().startswith("v") else value


def _target_heading(version: str) -> str:
    return "Unreleased" if normalized_version(version) == "dev" else normalized_version(version)


def _parse_sections(text: str) -> list[tuple[str, str]]:
    matches = list(SECTION_RE.finditer(text))
    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        sections.append((match.group(1).strip(), text[match.end() : end].strip()))
    return sections


def parse_changelog_section(text: str, version: str) -> ChangelogSection:
    """Return only the matching H2 release section.

    Tagged builds may fall back to the baked-in Unreleased section. Because a
    release image is immutable, that section represents the changes available
    at the time that particular image was built.
    """
    sections = {heading.casefold(): (heading, content) for heading, content in _parse_sections(text)}

    current = normalized_version(version)
    target = _target_heading(current)
    selected = sections.get(target.casefold())
    if selected is None and current != "dev":
        selected = sections.get("unreleased")
    if selected is None:
        return ChangelogSection(
            version=current,
            display_version=current,
            content="",
            available=False,
        )

    heading, content = selected
    display_version = "Unreleased" if heading.casefold() == "unreleased" and current == "dev" else current
    return ChangelogSection(
        version=current,
        display_version=display_version,
        content=content,
        available=bool(content),
    )


def parse_changelog_history(text: str, version: str) -> ChangelogSection:
    """Return the running release and all older sections in newest-first order."""
    sections = _parse_sections(text)
    current = normalized_version(version)
    target = _target_heading(current)
    start = next(
        (index for index, (heading, _) in enumerate(sections) if heading.casefold() == target.casefold()),
        None,
    )
    if start is None and current != "dev":
        start = next(
            (
                index
                for index, (heading, _) in enumerate(sections)
                if heading.casefold() == "unreleased"
            ),
            None,
        )
    if start is None:
        return ChangelogSection(
            version=current,
            display_version=current,
            content="",
            available=False,
        )

    rendered: list[str] = []
    for index, (heading, content) in enumerate(sections[start:]):
        if not content:
            continue
        display_heading = (
            current
            if index == 0 and heading.casefold() == "unreleased" and current != "dev"
            else heading
        )
        rendered.append(f"## [{display_heading}]\n\n{content}")

    history = "\n\n".join(rendered)
    return ChangelogSection(
        version=current,
        display_version="Unreleased" if current == "dev" else current,
        content=history,
        available=bool(history),
    )


def _changelog_path(settings: Settings) -> Path | None:
    candidates = (
        Path(settings.changelog_path) if settings.changelog_path else None,
        Path("/app/CHANGELOG.md"),
        Path(__file__).resolve().parents[3] / "CHANGELOG.md",
    )
    return next((path for path in candidates if path is not None and path.is_file()), None)


def current_changelog(settings: Settings | None = None) -> ChangelogSection:
    settings = settings or get_settings()
    path = _changelog_path(settings)
    if path is None:
        version = normalized_version(settings.taskcentral_version)
        return ChangelogSection(version, version, "", False)
    return parse_changelog_history(
        path.read_text(encoding="utf-8"),
        settings.taskcentral_version,
    )


def has_seen_current_changelog(db: Session, version: str) -> bool:
    row = db.get(ApplicationSetting, CHANGELOG_SEEN_KEY)
    if row is None:
        return False
    try:
        seen_version = json.loads(row.value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return False
    return (
        isinstance(seen_version, str)
        and normalized_version(seen_version) == normalized_version(version)
    )


def mark_current_changelog_seen(db: Session, version: str) -> None:
    current = normalized_version(version)
    row = db.get(ApplicationSetting, CHANGELOG_SEEN_KEY)
    if row is None:
        db.add(ApplicationSetting(key=CHANGELOG_SEEN_KEY, value=json.dumps(current)))
    else:
        row.value = json.dumps(current)
    db.commit()
