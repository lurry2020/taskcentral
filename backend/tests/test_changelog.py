import json

from app.config import get_settings
from app.models import ApplicationSetting
from app.services.changelog import (
    CHANGELOG_SEEN_KEY,
    has_seen_current_changelog,
    mark_current_changelog_seen,
    parse_changelog_history,
    parse_changelog_section,
)


SAMPLE_CHANGELOG = """# Changelog

## [Unreleased]

- Pending feature

## [1.2.0]

### Added

- Current feature

## [1.1.0]

- Older feature
"""


def test_parser_returns_only_the_requested_version():
    entry = parse_changelog_section(SAMPLE_CHANGELOG, "v1.2.0")

    assert entry.version == "1.2.0"
    assert entry.display_version == "1.2.0"
    assert "Current feature" in entry.content
    assert "Older feature" not in entry.content
    assert "Pending feature" not in entry.content


def test_history_returns_current_and_older_versions_newest_first():
    entry = parse_changelog_history(SAMPLE_CHANGELOG, "1.2.0")

    assert "## [Unreleased]" not in entry.content
    assert "## [1.2.0]" in entry.content
    assert "## [1.1.0]" in entry.content
    assert entry.content.index("## [1.2.0]") < entry.content.index("## [1.1.0]")
    assert "Pending feature" not in entry.content


def test_development_and_unlisted_release_use_baked_unreleased_section():
    development = parse_changelog_section(SAMPLE_CHANGELOG, "dev")
    release = parse_changelog_section(SAMPLE_CHANGELOG, "1.3.0")

    assert development.display_version == "Unreleased"
    assert development.content == "- Pending feature"
    assert release.version == "1.3.0"
    assert release.display_version == "1.3.0"
    assert release.content == "- Pending feature"


def test_seen_version_is_persisted_per_release(db_session):
    db = db_session()
    version = "1.2.0"
    try:
        assert has_seen_current_changelog(db, version) is False
        mark_current_changelog_seen(db, version)
        assert has_seen_current_changelog(db, version) is True
        assert has_seen_current_changelog(db, "1.3.0") is False
        assert json.loads(db.get(ApplicationSetting, CHANGELOG_SEEN_KEY).value) == version
    finally:
        db.close()


def test_changelog_api_marks_current_version_seen(client, db_session):
    current = get_settings().taskcentral_version
    db = db_session()
    row = db.get(ApplicationSetting, CHANGELOG_SEEN_KEY)
    if row is not None:
        db.delete(row)
        db.commit()
    db.close()

    response = client.get("/api/v1/changelog/current")
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == current
    assert body["display_version"] == current
    assert body["available"] is True
    assert body["seen"] is False
    assert body["content"].strip()
    assert f"## [{current}]" in body["content"]
    assert "## [1.0.0]" in body["content"]
    assert "## [Unreleased]" not in body["content"]
    assert body["content"].index(f"## [{current}]") < body["content"].index("## [1.0.0]")

    marked = client.post("/api/v1/changelog/current/seen")
    assert marked.status_code == 200
    assert marked.json() == {"version": current, "seen": True}
    assert client.get("/api/v1/changelog/current").json()["seen"] is True
