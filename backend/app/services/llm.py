"""Local-network-only LLM client for Task Central chat."""

from __future__ import annotations

import ipaddress
import http.client
import json
import logging
import re
import socket
import ssl
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse


logger = logging.getLogger(__name__)


LOCAL_HOSTS = {"localhost", "host.docker.internal", "host.containers.internal"}
LOCAL_SUFFIXES = (".local", ".lan", ".home", ".internal", ".home.arpa")
HOST_LABEL_RE = re.compile(r"^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?$")
AMBIGUOUS_IP_RE = re.compile(
    r"^(?:0x[0-9a-f]+|[0-9]+)(?:\.(?:0x[0-9a-f]+|[0-9]+))*$",
    re.IGNORECASE,
)
ALLOWED_NETWORKS = tuple(
    ipaddress.ip_network(value)
    for value in (
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "127.0.0.0/8",
        "::1/128",
        "fc00::/7",
    )
)
MAX_LOCAL_AI_RESPONSE_BYTES = 5 * 1024 * 1024
WORD_RE = re.compile(r"[a-z0-9][a-z0-9_-]{2,}")
STOP_WORDS = {
    "about", "after", "again", "also", "and", "are", "can", "does", "for", "from",
    "have", "how", "into", "its", "not", "that", "the", "this", "through", "use",
    "user", "what", "when", "where", "which", "with", "your",
}


class LocalLLMError(RuntimeError):
    """A connection, protocol, or model response error safe to show to the user."""


@dataclass(frozen=True)
class LocalLLMConfig:
    provider: str
    base_url: str
    model: str
    api_key: str = ""
    timeout_seconds: int = 60
    include_manual: bool = True


def _is_local_ip(value: str) -> bool:
    ip = ipaddress.ip_address(value)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return any(ip in network for network in ALLOWED_NETWORKS if ip.version == network.version)


def _validate_hostname_syntax(hostname: str) -> None:
    if len(hostname) > 253 or AMBIGUOUS_IP_RE.fullmatch(hostname):
        raise ValueError("Ambiguous or numeric hostnames are not allowed for local AI")
    labels = hostname.split(".")
    if not labels or any(not HOST_LABEL_RE.fullmatch(label) for label in labels):
        raise ValueError("Local AI URL contains an invalid hostname")


def _resolve_allowed_addresses(hostname: str, port: int | None) -> tuple[str, ...]:
    try:
        literal = ipaddress.ip_address(hostname)
    except ValueError:
        literal = None
    if literal is not None:
        if not _is_local_ip(str(literal)):
            raise ValueError("Only loopback or private-network AI endpoints are allowed")
        return (str(literal),)

    _validate_hostname_syntax(hostname)
    try:
        addresses = tuple(
            dict.fromkeys(
                info[4][0]
                for info in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
            )
        )
    except OSError as exc:
        raise ValueError(
            "Local AI hostname must resolve to a loopback or private-network address"
        ) from exc
    if not addresses or not all(_is_local_ip(address) for address in addresses):
        raise ValueError("Only loopback or private-network AI endpoints are allowed")
    return addresses


def validate_local_base_url(value: str) -> str:
    """Validate and normalize an HTTP(S) URL that resolves to a local destination."""
    value = (value or "").strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Local AI URL must start with http:// or https://")
    if parsed.username or parsed.password:
        raise ValueError("Put credentials in the API key field, not in the URL")
    if parsed.query or parsed.fragment:
        raise ValueError("Local AI URL must not contain a query string or fragment")

    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Local AI URL contains an invalid port") from exc
    hostname = parsed.hostname.rstrip(".").lower()
    if hostname in LOCAL_HOSTS:
        return value
    _resolve_allowed_addresses(hostname, port)
    return value


def config_from_settings(settings: dict) -> LocalLLMConfig:
    provider = settings.get("llm_provider") or "ollama"
    if provider not in ("ollama", "openai_compatible"):
        raise LocalLLMError(f"Unsupported local AI provider: {provider}")
    base_url = validate_local_base_url(
        settings.get("llm_base_url") or "http://host.docker.internal:11434"
    )
    model = (settings.get("llm_model") or "").strip()
    if not model:
        raise LocalLLMError("Choose a local AI model in Settings first.")
    return LocalLLMConfig(
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=(settings.get("llm_api_key") or "").strip(),
        timeout_seconds=max(5, min(600, int(settings.get("llm_timeout_seconds") or 60))),
        include_manual=bool(settings.get("llm_include_manual", True)),
    )


def _provider_endpoint(config: LocalLLMConfig) -> str:
    base = config.base_url.rstrip("/")
    if config.provider == "ollama":
        return base if base.endswith("/api/chat") else f"{base}/api/chat"
    return base if base.endswith("/chat/completions") else f"{base}/chat/completions"


def _models_endpoint(config: LocalLLMConfig) -> str:
    base = config.base_url.rstrip("/")
    if config.provider == "ollama":
        if base.endswith("/api/chat"):
            base = base[: -len("/api/chat")]
        return base if base.endswith("/api/tags") else f"{base}/api/tags"
    if base.endswith("/chat/completions"):
        base = base[: -len("/chat/completions")]
    return base if base.endswith("/models") else f"{base}/models"


def _open_json(request: urllib.request.Request, timeout_seconds: int) -> dict:
    parsed = urlparse(request.full_url)
    hostname = (parsed.hostname or "").rstrip(".").lower()
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        raise LocalLLMError("The local AI URL contains an invalid port.") from exc
    try:
        resolved_ip = _resolve_allowed_addresses(hostname, port)[0]
    except ValueError as exc:
        logger.error("Blocked local AI destination %s: %s", request.full_url, exc)
        raise LocalLLMError("The local AI destination is not an allowed private address.") from exc

    connection_class = (
        http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    )
    connection = connection_class(hostname, port, timeout=timeout_seconds)

    def create_pinned_connection(_address, timeout=None, source_address=None):
        return socket.create_connection(
            (resolved_ip, port),
            timeout if timeout is not None else timeout_seconds,
            source_address,
        )

    connection._create_connection = create_pinned_connection
    path = parsed.path or "/"
    if parsed.params:
        path = f"{path};{parsed.params}"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    headers = dict(request.header_items())
    host_header = f"[{hostname}]" if ":" in hostname else hostname
    default_port = 443 if parsed.scheme == "https" else 80
    headers["Host"] = host_header if port == default_port else f"{host_header}:{port}"
    try:
        connection.request(request.method, path, body=request.data, headers=headers)
        response = connection.getresponse()
        raw = response.read(MAX_LOCAL_AI_RESPONSE_BYTES + 1)
        if len(raw) > MAX_LOCAL_AI_RESPONSE_BYTES:
            raise LocalLLMError("The local AI response exceeded the allowed size.")
        if response.status < 200 or response.status >= 300:
            detail = ""
            try:
                body = json.loads(raw.decode("utf-8"))
                detail = body.get("error") or body.get("detail") or body.get("message") or ""
                if isinstance(detail, dict):
                    detail = detail.get("message") or str(detail)
            except Exception:
                detail = ""
            log_suffix = f": {str(detail)[:500]}" if detail else ""
            logger.error(
                "Local AI HTTP request failed: %s %s -> %s%s",
                request.method,
                request.full_url,
                response.status,
                log_suffix,
            )
            raise LocalLLMError(
                f"Local AI returned HTTP {response.status}. Check the Task Central log for details."
            )
        return json.loads(raw.decode("utf-8"))
    except LocalLLMError:
        raise
    except (TimeoutError, socket.timeout) as exc:
        logger.error(
            "Local AI request timed out: %s %s after %ss",
            request.method,
            request.full_url,
            timeout_seconds,
        )
        raise LocalLLMError("The local AI request timed out.") from exc
    except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
        logger.error(
            "Local AI connection failed: %s %s (%s)",
            request.method,
            request.full_url,
            exc,
        )
        raise LocalLLMError("Could not reach the local AI server. Check the Task Central log.") from exc
    except json.JSONDecodeError as exc:
        logger.error(
            "Local AI returned invalid JSON: %s %s",
            request.method,
            request.full_url,
        )
        raise LocalLLMError("The local AI server returned invalid JSON.") from exc
    finally:
        connection.close()


def _post_json(config: LocalLLMConfig, messages: list[dict[str, str]]) -> dict:
    endpoint = _provider_endpoint(config)
    if config.provider == "ollama":
        payload = {
            "model": config.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.2},
        }
    else:
        payload = {
            "model": config.model,
            "messages": messages,
            "stream": False,
            "temperature": 0.2,
        }
    headers = {"Content-Type": "application/json"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    return _open_json(request, config.timeout_seconds)


def list_local_llm_models(config: LocalLLMConfig) -> list[str]:
    """Return model identifiers exposed by the configured local provider."""
    headers = {"Accept": "application/json"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
    request = urllib.request.Request(
        _models_endpoint(config),
        headers=headers,
        method="GET",
    )
    body = _open_json(request, config.timeout_seconds)
    key = "models" if config.provider == "ollama" else "data"
    entries = body.get(key)
    if not isinstance(entries, list):
        raise LocalLLMError("The local AI server returned an unsupported model list.")

    models: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if config.provider == "ollama":
            value = entry.get("name") or entry.get("model")
        else:
            value = entry.get("id")
        if isinstance(value, str) and value.strip():
            models.add(value.strip())
    return sorted(models, key=str.casefold)[:500]


def _response_content(config: LocalLLMConfig, body: dict) -> str:
    if config.provider == "ollama":
        content = (body.get("message") or {}).get("content")
    else:
        choices = body.get("choices") or []
        content = (choices[0].get("message") or {}).get("content") if choices else None
    if not isinstance(content, str) or not content.strip():
        message = body.get("message")
        message_keys = sorted(message) if isinstance(message, dict) else []
        logger.error(
            "Local AI response had no usable content "
            "(provider=%s, response_keys=%s, message_keys=%s)",
            config.provider,
            sorted(body),
            message_keys,
        )
        raise LocalLLMError("The local AI server returned an empty or unsupported response.")
    return content.strip()


def _manual_path() -> Path | None:
    candidates = (
        Path("/app/MANUAL.md"),
        Path(__file__).resolve().parents[3] / "MANUAL.md",
    )
    return next((path for path in candidates if path.is_file()), None)


def relevant_manual_context(messages: list[dict[str, str]], max_chars: int = 28_000) -> str:
    """Select manual sections relevant to the recent user messages without a vector dependency."""
    path = _manual_path()
    if path is None:
        return ""
    text = path.read_text(encoding="utf-8")
    parts = re.split(r"(?m)(?=^## )", text)
    if len(parts) <= 1:
        return text[:max_chars]

    query = " ".join(
        message["content"] for message in messages[-6:] if message.get("role") == "user"
    ).lower()
    terms = {word for word in WORD_RE.findall(query) if word not in STOP_WORDS}
    intro = parts[0]
    guidance = next(
        (part for part in parts if part.startswith("## Guidance for AI assistants")), ""
    )
    ranked: list[tuple[int, int, str]] = []
    for index, part in enumerate(parts[1:]):
        if part == guidance:
            continue
        lowered = part.lower()
        heading = lowered.splitlines()[0] if lowered else ""
        score = sum(lowered.count(term) + (5 if term in heading else 0) for term in terms)
        ranked.append((score, -index, part))
    ranked.sort(reverse=True)
    selected = [intro, guidance]
    selected.extend(part for score, _, part in ranked[:5] if score > 0)
    if len(selected) == 2:
        selected.extend(part for _, _, part in ranked[:2])
    return "\n\n".join(part for part in selected if part)[:max_chars]


def chat_with_local_llm(
    config: LocalLLMConfig,
    messages: list[dict[str, str]],
    context_path: str | None = None,
) -> str:
    manual = relevant_manual_context(messages) if config.include_manual else ""
    system = (
        "You are the built-in Task Central assistant. Help the user operate and troubleshoot "
        "their Task Central homelab application. Use the supplied manual excerpts as the primary "
        "source of truth. Do not invent UI actions, settings, or commands. Clearly identify "
        "uncertainty, protect secrets, and warn before destructive actions."
    )
    if context_path:
        system += f"\nThe user is currently viewing application route: {context_path}"
    if manual:
        system += f"\n\nTASK CENTRAL MANUAL EXCERPTS:\n{manual}"
    body = _post_json(config, [{"role": "system", "content": system}, *messages])
    return _response_content(config, body)


def test_local_llm(config: LocalLLMConfig) -> str:
    messages = [
        {
            "role": "system",
            "content": "Reply with one short sentence confirming that the local AI connection works.",
        },
        {"role": "user", "content": "Connection test from Task Central."},
    ]
    return _response_content(config, _post_json(config, messages))
