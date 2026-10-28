"""Atomic JSON file writing helper with Windows file-lock retry support."""
import json
import os
import time
import uuid
from pathlib import Path


def atomic_write_json(path, data, indent=2, ensure_ascii=False):
    """
    Atomically write data as JSON to path via a temporary file in the same directory.
    Flushes and fsyncs the buffer, then calls os.replace onto the target.
    Retries os.replace up to 10 times with a 20 ms sleep ONLY on PermissionError, then raises.
    Always deletes the temporary file on failure. Never swallows other errors.
    """
    target = Path(path) if not isinstance(path, Path) else path
    target.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=indent, ensure_ascii=ensure_ascii)
            f.flush()
            os.fsync(f.fileno())
        for attempt in range(10):
            try:
                os.replace(temp_path, target)
                break
            except PermissionError:
                if attempt == 9:
                    raise
                time.sleep(0.02)
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass
