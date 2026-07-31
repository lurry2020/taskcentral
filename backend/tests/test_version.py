from urllib.error import URLError

from app.config import Settings
from app.services import version as version_service


class FakeResponse:
    def __init__(self, value: str):
        self.value = value

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, limit: int) -> bytes:
        return self.value.encode("utf-8")[:limit]


def test_version_check_reports_up_to_date_and_caches_success(monkeypatch):
    calls = []

    def fake_urlopen(request, timeout):
        calls.append((request.full_url, timeout))
        return FakeResponse("v1.1.2\n")

    version_service.clear_version_cache()
    monkeypatch.setattr(version_service, "urlopen", fake_urlopen)
    settings = Settings(
        taskcentral_version="1.1.2",
        taskcentral_release_repository="lurry2020/taskcentral",
    )

    first = version_service.check_version(settings)
    second = version_service.check_version(settings)

    assert first.status == "up_to_date"
    assert first.current_version == "1.1.2"
    assert first.latest_version == "1.1.2"
    assert second.checked_at == first.checked_at
    assert len(calls) == 1
    assert calls[0][0].endswith("/releases/latest/download/VERSION")


def test_version_check_reports_newer_release(monkeypatch):
    version_service.clear_version_cache()
    monkeypatch.setattr(
        version_service,
        "urlopen",
        lambda *args, **kwargs: FakeResponse("1.2.0"),
    )

    result = version_service.check_version(Settings(taskcentral_version="1.1.2"))

    assert result.status == "update_available"
    assert result.latest_version == "1.2.0"
    assert result.releases_url == "https://github.com/lurry2020/taskcentral/releases"


def test_version_check_handles_github_failure(monkeypatch):
    version_service.clear_version_cache()
    monkeypatch.setattr(
        version_service,
        "urlopen",
        lambda *args, **kwargs: (_ for _ in ()).throw(URLError("offline")),
    )

    result = version_service.check_version(Settings(taskcentral_version="1.1.2"))

    assert result.status == "check_failed"
    assert result.latest_version is None
    assert "could not reach GitHub" in result.message


def test_release_build_is_newer_than_matching_prerelease(monkeypatch):
    version_service.clear_version_cache()
    monkeypatch.setattr(
        version_service,
        "urlopen",
        lambda *args, **kwargs: FakeResponse("1.2.0"),
    )

    result = version_service.check_version(Settings(taskcentral_version="1.2.0-rc.1"))

    assert result.status == "update_available"
