import logging
from pathlib import Path

from app.config import Settings
from app.logging_config import configure_logging


def test_configure_logging_writes_to_project_log_and_is_idempotent(tmp_path: Path):
    settings = Settings(
        log_dir=str(tmp_path),
        log_level="INFO",
        log_max_bytes=1024,
        log_backup_count=2,
    )
    root_logger = logging.getLogger()
    uvicorn_logger = logging.getLogger("uvicorn")

    handler = configure_logging(settings)
    assert handler is not None
    assert configure_logging(settings) is handler

    try:
        logging.getLogger("taskcentral.test").error("persistent logging works")
        handler.flush()
        assert "persistent logging works" in (tmp_path / "taskcentral.log").read_text()
    finally:
        root_logger.removeHandler(handler)
        if handler in uvicorn_logger.handlers:
            uvicorn_logger.removeHandler(handler)
        handler.close()
