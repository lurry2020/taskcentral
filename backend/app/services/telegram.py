"""Minimal Telegram Bot API client (stdlib only, no extra dependency)."""

import json
import logging
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)


def send_telegram_message(token: str, chat_id: str, text: str) -> tuple[bool, str]:
    """Send a message via the Telegram Bot API. Returns (ok, human message)."""
    token = (token or "").strip()
    chat_id = (chat_id or "").strip()
    if not token or not chat_id:
        return False, "A Telegram bot token and chat ID are both required."

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text}).encode("utf-8")
    request = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
        if body.get("ok"):
            return True, "Message sent."
        return False, body.get("description", "Telegram rejected the request.")
    except urllib.error.HTTPError as exc:
        detail = str(exc)
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("description", detail)
        except Exception:  # pragma: no cover - best-effort error parsing
            pass
        return False, f"Telegram error: {detail}"
    except Exception as exc:  # network / timeout / DNS
        return False, f"Could not reach Telegram: {exc}"
