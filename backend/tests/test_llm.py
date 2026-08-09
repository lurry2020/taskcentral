import pytest

from app.services import llm


def test_local_url_validation(monkeypatch):
    monkeypatch.setattr(
        llm.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(None, None, None, None, ("172.18.0.12", 11434))],
    )
    assert llm.validate_local_base_url("http://127.0.0.1:11434") == "http://127.0.0.1:11434"
    assert (
        llm.validate_local_base_url("http://host.docker.internal:11434/")
        == "http://host.docker.internal:11434"
    )
    assert llm.validate_local_base_url("http://ollama:11434") == "http://ollama:11434"
    assert llm.validate_local_base_url("http://192.168.1.20:1234/v1").endswith("/v1")


@pytest.mark.parametrize(
    "url",
    [
        "http://8.8.8.8:11434",
        "http://16843009",
        "http://0x08080808",
        "http://0177.0.0.1",
        "http://169.254.169.254",
        "http://[fe80::1]:11434",
        "http://0.0.0.0:11434",
        "ftp://127.0.0.1/model",
        "http://user:password@127.0.0.1:11434",
    ],
)
def test_public_or_unsafe_urls_are_rejected(url):
    with pytest.raises(ValueError):
        llm.validate_local_base_url(url)


def test_public_hostname_is_rejected(monkeypatch):
    monkeypatch.setattr(
        llm.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(None, None, None, None, ("93.184.216.34", 443))],
    )
    with pytest.raises(ValueError, match="Only loopback or private"):
        llm.validate_local_base_url("https://example.com/v1")


def test_hostname_with_mixed_private_and_public_answers_is_rejected(monkeypatch):
    monkeypatch.setattr(
        llm.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (None, None, None, None, ("192.168.1.20", 443)),
            (None, None, None, None, ("8.8.8.8", 443)),
        ],
    )
    with pytest.raises(ValueError, match="Only loopback or private"):
        llm.validate_local_base_url("https://llm.example/v1")


def test_request_is_pinned_to_validated_private_address(monkeypatch):
    connected = {}

    monkeypatch.setattr(
        llm.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(None, None, None, None, ("192.168.1.44", 11434))],
    )
    monkeypatch.setattr(
        llm.socket,
        "create_connection",
        lambda address, timeout, source_address=None: connected.setdefault("address", address),
    )

    class Response:
        status = 200

        def read(self, _size):
            return b'{"models": []}'

    class Connection:
        def __init__(self, host, port, timeout):
            self.host = host
            self.port = port

        def request(self, method, path, body=None, headers=None):
            self._create_connection(("203.0.113.10", self.port), 10)

        def getresponse(self):
            return Response()

        def close(self):
            pass

    monkeypatch.setattr(llm.http.client, "HTTPConnection", Connection)
    request = llm.urllib.request.Request("http://ollama.lan:11434/api/tags", method="GET")

    assert llm._open_json(request, 10) == {"models": []}
    assert connected["address"] == ("192.168.1.44", 11434)


def test_upstream_error_detail_is_logged_but_not_returned(monkeypatch):
    monkeypatch.setattr(
        llm.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(None, None, None, None, ("192.168.1.44", 11434))],
    )

    class Response:
        status = 500

        def read(self, _size):
            return b'{"error": "internal secret detail"}'

    class Connection:
        def __init__(self, host, port, timeout):
            pass

        def request(self, method, path, body=None, headers=None):
            pass

        def getresponse(self):
            return Response()

        def close(self):
            pass

    monkeypatch.setattr(llm.http.client, "HTTPConnection", Connection)
    request = llm.urllib.request.Request("http://ollama.lan:11434/api/tags", method="GET")

    with pytest.raises(llm.LocalLLMError) as exc_info:
        llm._open_json(request, 10)
    assert "internal secret detail" not in str(exc_info.value)


def test_provider_endpoints():
    ollama = llm.LocalLLMConfig("ollama", "http://ollama:11434", "llama3.2")
    assert llm._provider_endpoint(ollama) == "http://ollama:11434/api/chat"
    assert llm._models_endpoint(ollama) == "http://ollama:11434/api/tags"
    openai = llm.LocalLLMConfig(
        "openai_compatible", "http://host.docker.internal:1234/v1", "local-model"
    )
    assert (
        llm._provider_endpoint(openai)
        == "http://host.docker.internal:1234/v1/chat/completions"
    )
    assert (
        llm._models_endpoint(openai)
        == "http://host.docker.internal:1234/v1/models"
    )


@pytest.mark.parametrize(
    ("config", "body", "expected"),
    [
        (
            llm.LocalLLMConfig("ollama", "http://ollama:11434", ""),
            {
                "models": [
                    {"name": "qwen2.5:7b"},
                    {"model": "llama3.2:3b"},
                    {"name": "qwen2.5:7b"},
                ]
            },
            ["llama3.2:3b", "qwen2.5:7b"],
        ),
        (
            llm.LocalLLMConfig(
                "openai_compatible",
                "http://host.docker.internal:1234/v1",
                "",
                api_key="secret",
            ),
            {"data": [{"id": "z-model"}, {"id": "a-model"}]},
            ["a-model", "z-model"],
        ),
    ],
)
def test_model_discovery_parses_provider_responses(monkeypatch, config, body, expected):
    captured = {}

    def fake_open(request, timeout_seconds):
        captured["url"] = request.full_url
        captured["authorization"] = request.headers.get("Authorization")
        captured["timeout"] = timeout_seconds
        return body

    monkeypatch.setattr(llm, "_open_json", fake_open)

    assert llm.list_local_llm_models(config) == expected
    assert captured["url"] == llm._models_endpoint(config)
    assert captured["timeout"] == 60
    assert captured["authorization"] == (
        "Bearer secret" if config.api_key else None
    )


def test_model_discovery_rejects_unsupported_response(monkeypatch):
    config = llm.LocalLLMConfig("ollama", "http://ollama:11434", "")
    monkeypatch.setattr(llm, "_open_json", lambda request, timeout: {"unexpected": []})

    with pytest.raises(llm.LocalLLMError, match="unsupported model list"):
        llm.list_local_llm_models(config)


def test_provider_response_parsing():
    ollama = llm.LocalLLMConfig("ollama", "http://ollama:11434", "llama3.2")
    assert llm._response_content(ollama, {"message": {"content": " hello "}}) == "hello"
    openai = llm.LocalLLMConfig("openai_compatible", "http://lmstudio:1234/v1", "model")
    assert (
        llm._response_content(
            openai, {"choices": [{"message": {"content": " ready "}}]}
        )
        == "ready"
    )


def test_chat_adds_manual_and_page_context(monkeypatch):
    captured = {}

    def fake_post(config, messages):
        captured["messages"] = messages
        return {"message": {"content": "Use Settings."}}

    monkeypatch.setattr(llm, "_post_json", fake_post)
    monkeypatch.setattr(llm, "relevant_manual_context", lambda messages: "Manual section")
    config = llm.LocalLLMConfig("ollama", "http://ollama:11434", "llama3.2")
    reply = llm.chat_with_local_llm(
        config,
        [{"role": "user", "content": "How do I configure alerts?"}],
        "/settings",
    )
    assert reply == "Use Settings."
    system = captured["messages"][0]["content"]
    assert "Manual section" in system
    assert "/settings" in system
