import pytest

from app.services import llm


def test_local_url_validation():
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
    with pytest.raises(ValueError, match="Only local"):
        llm.validate_local_base_url("https://example.com/v1")


def test_provider_endpoints():
    ollama = llm.LocalLLMConfig("ollama", "http://ollama:11434", "llama3.2")
    assert llm._provider_endpoint(ollama) == "http://ollama:11434/api/chat"
    openai = llm.LocalLLMConfig(
        "openai_compatible", "http://host.docker.internal:1234/v1", "local-model"
    )
    assert (
        llm._provider_endpoint(openai)
        == "http://host.docker.internal:1234/v1/chat/completions"
    )


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
