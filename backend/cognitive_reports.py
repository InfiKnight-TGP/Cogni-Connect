"""Registry, validation, JSON persistence, and session report calculations.

Scores describe observed activity performance only. They are not clinical
measurements. Domain aggregation uses the latest completed result per distinct
game in a session, then an equal-weight mean across eligible games.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import tempfile
import threading
from typing import Any, Iterator
from uuid import UUID, uuid4


DOMAINS = (
    "Memory",
    "Attention",
    "Executive Function",
    "Recognition and Orientation",
)


GAME_REGISTRY: dict[str, dict[str, Any]] = {
    "story-builder": {
        "name": "Story Builder",
        "description": "Recall missing words from a short everyday story.",
        "primary_domain": "Memory",
        "secondary_domains": [],
        "implemented": True,
        "playable": True,
        "route": "/games/story-builder",
        "metrics": ["correct_answers", "total_questions", "accuracy"],
        "domain_weights": {"Memory": 1.0},
    },
    "mole-path": {
        "name": "Mole Path",
        "description": "Remember and repeat a visual path in order.",
        "primary_domain": "Memory",
        "secondary_domains": [],
        "implemented": True,
        "playable": True,
        "route": "/games/mole-path",
        "metrics": ["longest_path", "difficulty_level"],
        "domain_weights": {"Memory": 1.0},
    },
    "attention-hunt": {
        "name": "Attention Hunt",
        "description": "Find target objects while ignoring similar distractors.",
        "primary_domain": "Attention",
        "secondary_domains": [],
        "implemented": True,
        "playable": True,
        "route": "/games/attention-hunt",
        "metrics": ["correct_answers", "total_questions", "false_selections", "missed_targets"],
        "domain_weights": {"Attention": 1.0},
    },
    "face-recognition": {
        "name": "Facial Recognition",
        "description": "Select familiar faces seen in a personal video.",
        "primary_domain": "Recognition and Orientation",
        "secondary_domains": [],
        "implemented": True,
        "playable": True,
        "route": "/quiz",
        "metrics": ["correct_answers", "total_questions", "missed_targets", "false_selections"],
        "domain_weights": {"Recognition and Orientation": 1.0},
    },
    "name-recognition": {
        "name": "Name Recall",
        "description": "Match a familiar name to the pictured person.",
        "primary_domain": "Recognition and Orientation",
        "secondary_domains": [],
        "implemented": True,
        "playable": True,
        "route": "/quiz",
        "metrics": ["correct_answers", "total_questions", "attempts", "false_selections"],
        "domain_weights": {"Recognition and Orientation": 1.0},
    },
    "context-recall": {
        "name": "Personal Memory Questions",
        "description": "Recall details from personal video memories in open responses.",
        "primary_domain": "Memory",
        "secondary_domains": [],
        "implemented": True,
        "playable": True,
        "route": "/quiz",
        "metrics": ["accuracy", "total_questions", "question_scores"],
        "domain_weights": {"Memory": 1.0},
    },
    "my-day-recall": {
        "name": "My Day Recall",
        "description": "Planned personalized recall and recognition activity.",
        "primary_domain": "Memory",
        "secondary_domains": ["Recognition and Orientation"],
        "implemented": False,
        "playable": False,
        "route": None,
        "metrics": [],
        "domain_weights": {},
        "task_domain_weights": {
            "free_recall": {"Memory": 1.0},
            "familiar_choice": {"Recognition and Orientation": 1.0},
            "mixed_recall_and_recognition": {"Memory": 0.5, "Recognition and Orientation": 0.5},
        },
    },
    "sequence-memory": {
        "name": "Sequence Memory",
        "description": "Planned sequence recall activity.",
        "primary_domain": "Memory",
        "secondary_domains": [],
        "implemented": False,
        "playable": False,
        "route": None,
        "metrics": [],
        "domain_weights": {},
    },
    "pattern-switch": {
        "name": "Pattern Switch",
        "description": "Planned rule-switching and cognitive-flexibility activity.",
        "primary_domain": "Executive Function",
        "secondary_domains": [],
        "implemented": False,
        "playable": False,
        "route": None,
        "metrics": [],
        "domain_weights": {},
    },
}

SCHEMA_VERSION = 2
_thread_lock = threading.RLock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _number(value: Any, field: str, minimum: float = 0, maximum: float | None = None) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{field} must be a finite number")
    if value < minimum or (maximum is not None and value > maximum):
        raise ValueError(f"{field} is outside the allowed range")
    return float(value)


def validate_session_id(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("session_id is required")
    try:
        return str(UUID(value))
    except (ValueError, AttributeError):
        raise ValueError("session_id must be a UUID") from None


def _lock_file(path: Path):
    """Acquire a cross-process lock for JSON read/modify/write cycles."""
    lock_path = path.with_suffix(path.suffix + ".lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("a+b")
    try:
        if os.name == "nt":
            import msvcrt

            handle.seek(0)
            if lock_path.stat().st_size == 0:
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        return handle
    except Exception:
        handle.close()
        raise


def _unlock_file(handle) -> None:
    try:
        if os.name == "nt":
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    finally:
        handle.close()


@contextmanager
def _store_lock(path: Path) -> Iterator[None]:
    with _thread_lock:
        handle = _lock_file(path)
        try:
            yield
        finally:
            _unlock_file(handle)


def load_store(path: str | Path) -> dict[str, Any]:
    store_path = Path(path)
    if not store_path.exists():
        return {"schema_version": SCHEMA_VERSION, "scores": []}
    with store_path.open("r", encoding="utf-8") as source:
        data = json.load(source)
    if not isinstance(data, dict) or not isinstance(data.get("scores", []), list):
        raise ValueError("performance store has an invalid shape")
    data.setdefault("scores", [])
    data.setdefault("schema_version", 1)
    return data


def _atomic_write(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as target:
            json.dump(data, target, indent=2, ensure_ascii=False)
            target.write("\n")
            temp_name = target.name
            target.flush()
            os.fsync(target.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def normalize_game_result(payload: dict[str, Any]) -> dict[str, Any]:
    game_id = payload.get("game_id")
    if not isinstance(game_id, str) or game_id not in GAME_REGISTRY:
        raise ValueError("game_id is unknown")
    game = GAME_REGISTRY[game_id]
    if not game["implemented"] or not game["playable"]:
        raise ValueError("game is not currently playable")
    if payload.get("completed") is not True:
        raise ValueError("only completed games can be recorded")

    score = _number(payload.get("score"), "score", 0, 100)
    if score is None:
        raise ValueError("score is required")
    metrics = payload.get("metrics") or {}
    breakdown = payload.get("breakdown") or {}
    if not isinstance(metrics, dict) or not isinstance(breakdown, dict):
        raise ValueError("metrics and breakdown must be objects")
    raw = {**breakdown, **metrics}
    aliases = {
        "correct_answers": ("correctAnswers", "correctTargets"),
        "total_questions": ("totalQuestions", "totalBlanks", "totalTargets"),
        "incorrect_answers": ("incorrectAnswers", "wrongTaps"),
        "false_selections": ("falseSelections", "wrongTaps"),
        "missed_targets": ("missedTargets",),
        "longest_path": ("longestPath",),
    }
    for field, names in aliases.items():
        if field not in raw:
            for alias in names:
                if alias in raw:
                    raw[field] = raw[alias]
                    break

    session_id = validate_session_id(payload.get("session_id"))
    started_at = payload.get("started_at")
    completed_at = payload.get("completed_at") or _now_iso()
    if started_at is not None and _parse_iso(started_at) is None:
        raise ValueError("started_at must be an ISO timestamp")
    if _parse_iso(completed_at) is None:
        raise ValueError("completed_at must be an ISO timestamp")

    accuracy = _number(payload.get("accuracy", raw.get("accuracy")), "accuracy", 0, 1)
    integer_fields = (
        "correct_answers", "total_questions", "incorrect_answers", "attempts",
        "missed_targets", "false_selections", "reaction_time_ms", "completion_time_seconds",
    )
    normalized_metrics: dict[str, Any] = {}
    for field in integer_fields:
        value = payload.get(field, raw.get(field))
        number = _number(value, field, 0)
        if number is not None and not number.is_integer():
            raise ValueError(f"{field} must be an integer")
        normalized_metrics[field] = int(number) if number is not None else None
    longest_path = _number(raw.get("longest_path"), "longest_path", 0)
    normalized_metrics["longest_path"] = int(longest_path) if longest_path is not None else None
    if accuracy is None and normalized_metrics["correct_answers"] is not None and normalized_metrics["total_questions"]:
        accuracy = normalized_metrics["correct_answers"] / normalized_metrics["total_questions"]
    if normalized_metrics["correct_answers"] is not None and normalized_metrics["total_questions"] is not None:
        if normalized_metrics["correct_answers"] > normalized_metrics["total_questions"]:
            raise ValueError("correct_answers cannot exceed total_questions")
        if normalized_metrics["incorrect_answers"] is None:
            normalized_metrics["incorrect_answers"] = normalized_metrics["total_questions"] - normalized_metrics["correct_answers"]
    if normalized_metrics["missed_targets"] is None and "correctTargets" in raw and "totalTargets" in raw:
        normalized_metrics["missed_targets"] = max(0, int(raw["totalTargets"]) - int(raw["correctTargets"]))

    domain_weights = dict(game["domain_weights"])
    task_mode = payload.get("task_mode")
    task_weights = game.get("task_domain_weights", {}).get(task_mode)
    if task_mode and task_weights is None:
        raise ValueError("task_mode is not supported for this game")
    if task_weights:
        domain_weights = dict(task_weights)

    start_dt = _parse_iso(started_at)
    complete_dt = _parse_iso(completed_at)
    if normalized_metrics["completion_time_seconds"] is None and start_dt and complete_dt:
        normalized_metrics["completion_time_seconds"] = max(0, int((complete_dt - start_dt).total_seconds()))

    record_id = payload.get("record_id") or str(uuid4())
    if not isinstance(record_id, str) or len(record_id) > 128:
        raise ValueError("record_id must be a string of at most 128 characters")
    record: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "record_id": record_id,
        "session_id": session_id,
        # The app has no authenticated patient identity yet; never trust a client-supplied ID.
        "user_id": None,
        "subject_id": None,
        "caregiver_id": None,
        "consent_id": None,
        "game_id": game_id,
        "game_name": game["name"],
        "primary_domain": game["primary_domain"],
        "secondary_domains": game["secondary_domains"],
        "domain_weights": domain_weights,
        "task_mode": task_mode,
        "score": round(score),
        "accuracy": accuracy,
        **normalized_metrics,
        "difficulty_level": payload.get("difficulty_level"),
        "completed": True,
        "started_at": started_at,
        "completed_at": completed_at,
        "session_started_at": payload.get("session_started_at") or started_at,
        "date": payload.get("date") or completed_at,
        "timestamp": completed_at,
        "breakdown": raw,
    }
    question_scores = raw.get("question_scores")
    if isinstance(question_scores, list) and all(isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item) for item in question_scores):
        record["question_scores"] = [float(item) for item in question_scores]
    return record


def save_record(path: str | Path, payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    store_path = Path(path)
    record = normalize_game_result(payload) if payload.get("game_id") else None
    if record is None:
        score = _number(payload.get("score"), "score", 0, 100)
        if score is None:
            raise ValueError("score is required")
        completed_at = payload.get("date") or _now_iso()
        record = {
            "score": round(score),
            "date": completed_at,
            "timestamp": _now_iso(),
            "breakdown": payload.get("breakdown", {}),
        }

    with _store_lock(store_path):
        store = load_store(store_path)
        if record.get("record_id"):
            for existing in store["scores"]:
                if existing.get("record_id") == record["record_id"]:
                    return existing, False
        store["schema_version"] = SCHEMA_VERSION
        store["scores"].append(record)
        _atomic_write(store_path, store)
    return record, True


def get_session_records(path: str | Path, session_id: str) -> list[dict[str, Any]]:
    normalized_id = validate_session_id(session_id)
    return [
        item for item in load_store(path)["scores"]
        if item.get("session_id") == normalized_id and item.get("completed") is True and item.get("game_id") in GAME_REGISTRY
    ]


def _latest_per_game(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for record in records:
        game_id = record.get("game_id")
        if not isinstance(game_id, str):
            continue
        previous = latest.get(game_id)
        current_time = _parse_iso(record.get("completed_at") or record.get("timestamp"))
        previous_time = _parse_iso((previous or {}).get("completed_at") or (previous or {}).get("timestamp"))
        if previous is None or (current_time and (previous_time is None or current_time >= previous_time)):
            latest[game_id] = record
    return list(latest.values())


def build_session_report(records: list[dict[str, Any]], session_id: str) -> dict[str, Any]:
    normalized_id = validate_session_id(session_id)
    completed = _latest_per_game([
        record for record in records
        if record.get("session_id") == normalized_id and record.get("completed") is True
        and record.get("game_id") in GAME_REGISTRY
        and GAME_REGISTRY[record["game_id"]]["playable"]
        and isinstance(record.get("score"), (int, float))
        and 0 <= record["score"] <= 100
    ])
    available_ids = [game_id for game_id, game in GAME_REGISTRY.items() if game["playable"]]
    domains: dict[str, dict[str, Any]] = {
        domain: {"score": None, "game_count": 0, "game_ids": [], "confidence": "no data"}
        for domain in DOMAINS
    }
    domain_values: dict[str, list[tuple[float, float, str]]] = {domain: [] for domain in DOMAINS}

    for record in completed:
        game = GAME_REGISTRY[record["game_id"]]
        weights = record.get("domain_weights") or game["domain_weights"]
        for domain, weight in weights.items():
            if domain not in domain_values or not isinstance(weight, (int, float)) or weight <= 0:
                continue
            domain_values[domain].append((float(record["score"]), float(weight), record["game_id"]))

    for domain in DOMAINS:
        values = domain_values[domain]
        if not values:
            continue
        weight_total = sum(weight for _, weight, _ in values)
        domains[domain] = {
            "score": round(sum(score * weight for score, weight, _ in values) / weight_total),
            "game_count": len(values),
            "game_ids": [game_id for _, _, game_id in values],
            "confidence": "limited observations" if len(values) == 1 else "multiple games",
        }

    score_values = [float(record["score"]) for record in completed]
    started = [_parse_iso(record.get("session_started_at") or record.get("started_at")) for record in completed]
    completed_at = [_parse_iso(record.get("completed_at") or record.get("timestamp")) for record in completed]
    starts = [item for item in started if item is not None]
    ends = [item for item in completed_at if item is not None]
    start_time = min(starts) if starts else None
    end_time = max(ends) if ends else None
    duration = None
    if start_time and end_time:
        duration = max(0, int((end_time - start_time).total_seconds()))
    count = len(completed)
    return {
        "schema_version": SCHEMA_VERSION,
        "session_id": normalized_id,
        "user_id": next((item.get("user_id") for item in completed if item.get("user_id")), None),
        "subject_id": next((item.get("subject_id") for item in completed if item.get("subject_id")), None),
        "caregiver_id": next((item.get("caregiver_id") for item in completed if item.get("caregiver_id")), None),
        "consent_id": next((item.get("consent_id") for item in completed if item.get("consent_id")), None),
        "started_at": start_time.isoformat() if start_time else None,
        "completed_at": end_time.isoformat() if end_time else None,
        "duration_seconds": duration,
        "status": "complete" if count == len(available_ids) else "partial" if count else "empty",
        "games_completed": count,
        "games_available": len(available_ids),
        "missing_games": [game_id for game_id in available_ids if game_id not in {item["game_id"] for item in completed}],
        "overall_observed_score": round(sum(score_values) / len(score_values)) if score_values else None,
        "domains": domains,
        "games": completed,
        "aggregation_method": "latest completed result per unique game; equal game weight within each domain, with task-specific weights only when the activity explicitly identifies its task mode",
        "interpretation": "Scores summarize observed activity performance in this session and are not clinical measurements.",
    }


def build_history(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    session_ids: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        session_id = record.get("session_id")
        if isinstance(session_id, str) and record.get("completed") is True:
            session_ids.setdefault(session_id, []).append(record)
    reports = [build_session_report(session_records, session_id) for session_id, session_records in session_ids.items()]
    return sorted(reports, key=lambda report: report.get("completed_at") or "", reverse=True)
