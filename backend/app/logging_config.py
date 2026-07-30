"""Persistent, size-limited application logging."""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config import Settings


LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


def configure_logging(settings: Settings) -> RotatingFileHandler | None:
    """Keep console logging and optionally add the project-mounted log file."""
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(level=level, format=LOG_FORMAT)
    logging.getLogger().setLevel(level)

    log_dir = settings.resolved_log_dir
    if log_dir is None:
        return None

    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = (log_dir / "taskcentral.log").resolve()
    root_logger = logging.getLogger()

    for handler in root_logger.handlers:
        if (
            isinstance(handler, RotatingFileHandler)
            and Path(handler.baseFilename).resolve() == log_path
        ):
            return handler

    handler = RotatingFileHandler(
        log_path,
        maxBytes=max(1, settings.log_max_bytes),
        backupCount=max(1, settings.log_backup_count),
        encoding="utf-8",
    )
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root_logger.addHandler(handler)

    # Uvicorn owns its own non-propagating logger. Attach the same file handler
    # so startup failures and server errors are preserved without enabling the
    # noisy per-request access log.
    uvicorn_logger = logging.getLogger("uvicorn")
    if handler not in uvicorn_logger.handlers:
        uvicorn_logger.addHandler(handler)

    return handler
