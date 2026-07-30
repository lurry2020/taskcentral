"""Safe ICMP reachability checks for stored machine IP addresses."""

from __future__ import annotations

import ipaddress
import os
import re
import subprocess
from dataclasses import dataclass
from typing import Literal


PING_TIME_RE = re.compile(r"time[=<]\s*([0-9.]+)\s*ms", re.IGNORECASE)


@dataclass(frozen=True)
class PingResult:
    status: Literal["online", "offline", "unknown"]
    latency_ms: float | None
    message: str


def ping_ip_address(value: str, timeout_seconds: int = 2) -> PingResult:
    """Ping one validated IP without invoking a shell."""
    try:
        address = str(ipaddress.ip_address(value))
    except ValueError:
        return PingResult("unknown", None, "The stored IP address is invalid.")

    timeout_seconds = max(1, min(10, int(timeout_seconds)))
    command = [
        "ping",
        "-n",
        "-c",
        "1",
        "-W",
        str(timeout_seconds),
        "-w",
        str(timeout_seconds + 1),
        address,
    ]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds + 2,
            check=False,
            env={**os.environ, "LC_ALL": "C"},
        )
    except FileNotFoundError:
        return PingResult("unknown", None, "The backend ping utility is unavailable.")
    except subprocess.TimeoutExpired:
        return PingResult("offline", None, "No ICMP echo reply was received.")
    except OSError:
        return PingResult("unknown", None, "The ping check could not be completed.")

    if completed.returncode != 0:
        error = completed.stderr.lower()
        if "operation not permitted" in error or "permission denied" in error:
            return PingResult(
                "unknown",
                None,
                "The backend does not have permission to send ICMP echo requests.",
            )
        return PingResult("offline", None, "No ICMP echo reply was received.")

    match = PING_TIME_RE.search(completed.stdout)
    latency_ms = float(match.group(1)) if match else None
    message = (
        f"ICMP echo reply received in {latency_ms:g} ms."
        if latency_ms is not None
        else "ICMP echo reply received."
    )
    return PingResult("online", latency_ms, message)
