"""Logging helpers shared by the MultiAnno backend.

The backend is frequently used with local and network-mounted datasets.  A
request can therefore spend a long time in an operating-system file call.  We
keep both a console log and a rotating file log so that a missing END record
identifies the operation that is still blocked.
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import contextmanager
from contextvars import ContextVar
from logging.handlers import RotatingFileHandler
from pathlib import Path
from time import perf_counter
from typing import Iterator


_REQUEST_ID: ContextVar[str] = ContextVar("multianno_request_id", default="-")
_CONFIGURED = False
_LOGGER_NAME = "multianno"


class _RequestIdFilter(logging.Filter):
    """Attach the current HTTP request id to every application log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not getattr(record, "request_id", None):
            record.request_id = _REQUEST_ID.get()
        return True


def configure_logging() -> Path | None:
    """Configure console and rotating file logging once per process."""

    global _CONFIGURED
    if _CONFIGURED:
        configured_path = os.getenv("MULTIANNO_LOG_FILE")
        return Path(configured_path) if configured_path else None

    level_name = os.getenv("MULTIANNO_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logger = logging.getLogger(_LOGGER_NAME)
    logger.setLevel(level)
    logger.propagate = False

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | req=%(request_id)s | "
        "%(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    request_filter = _RequestIdFilter()

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    console_handler.addFilter(request_filter)
    logger.addHandler(console_handler)

    log_path: Path | None = None
    configured_file = os.getenv("MULTIANNO_LOG_FILE")
    try:
        log_path = Path(configured_file) if configured_file else Path(__file__).resolve().parents[1] / "logs" / "backend.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_path,
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        file_handler.addFilter(request_filter)
        logger.addHandler(file_handler)
    except OSError as exc:
        # Console logging must still work when the log directory is not
        # writable, for example when the application is copied read-only.
        logger.warning("FILE_LOG_UNAVAILABLE path=%s error=%s", log_path, exc)
        log_path = None

    _CONFIGURED = True
    logger.info("LOGGER_READY level=%s file=%s", level_name, log_path or "disabled")
    return log_path


def get_logger(name: str = "backend") -> logging.Logger:
    """Return an application logger that inherits the shared handlers."""

    return logging.getLogger(f"{_LOGGER_NAME}.{name}")


def set_request_id(request_id: str):
    return _REQUEST_ID.set(request_id)


def reset_request_id(token) -> None:
    _REQUEST_ID.reset(token)


def current_request_id() -> str:
    return _REQUEST_ID.get()


def shorten(value: object, limit: int = 2000) -> str:
    """Make request/error values safe to place in one log line."""

    text = str(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}...<truncated {len(text) - limit} chars>"


@contextmanager
def log_timing(
    logger: logging.Logger,
    operation: str,
    **fields: object,
) -> Iterator[None]:
    """Log START/END (or ERROR) and elapsed time for one backend operation."""

    field_text = " ".join(
        f"{key}={shorten(value, 500)}" for key, value in fields.items()
    )
    suffix = f" {field_text}" if field_text else ""
    started = perf_counter()
    logger.info("%s_START%s", operation, suffix)
    try:
        yield
    except Exception:
        logger.exception(
            "%s_ERROR duration_ms=%.1f%s",
            operation,
            (perf_counter() - started) * 1000,
            suffix,
        )
        raise
    else:
        logger.info(
            "%s_END duration_ms=%.1f%s",
            operation,
            (perf_counter() - started) * 1000,
            suffix,
        )
