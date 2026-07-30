from types import SimpleNamespace

from app.services import connectivity


def test_ping_reports_online_and_parses_latency(monkeypatch):
    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["kwargs"] = kwargs
        return SimpleNamespace(
            returncode=0,
            stdout="64 bytes from 192.168.1.20: icmp_seq=1 ttl=64 time=2.45 ms\n",
            stderr="",
        )

    monkeypatch.setattr(connectivity.subprocess, "run", fake_run)

    result = connectivity.ping_ip_address("192.168.1.20")

    assert result.status == "online"
    assert result.latency_ms == 2.45
    assert captured["command"][-1] == "192.168.1.20"
    assert captured["kwargs"]["check"] is False
    assert "shell" not in captured["kwargs"]


def test_ping_reports_offline_when_no_reply(monkeypatch):
    monkeypatch.setattr(
        connectivity.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=1, stdout="", stderr=""),
    )

    result = connectivity.ping_ip_address("192.168.1.21")

    assert result.status == "offline"
    assert result.latency_ms is None


def test_ping_rejects_invalid_stored_address_without_running_command(monkeypatch):
    monkeypatch.setattr(
        connectivity.subprocess,
        "run",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("must not run")),
    )

    result = connectivity.ping_ip_address("192.168.1.1; touch /tmp/nope")

    assert result.status == "unknown"
    assert "invalid" in result.message


def test_ping_reports_unknown_when_utility_is_missing(monkeypatch):
    def missing(*args, **kwargs):
        raise FileNotFoundError

    monkeypatch.setattr(connectivity.subprocess, "run", missing)

    result = connectivity.ping_ip_address("::1")

    assert result.status == "unknown"
    assert "unavailable" in result.message
