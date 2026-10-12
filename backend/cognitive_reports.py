"""Cognitive performance reporting module.

Aggregates observed game and quiz scores from performance_data.json into daily
cognitive reports across four domains:
- Memory
- Attention
- Executive Function
- Recognition & Orientation

Scores describe observed task performance only and are not clinical diagnoses.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import random
from typing import Any


DOMAINS = (
    "Memory",
    "Attention",
    "Executive Function",
    "Recognition & Orientation",
)


def normalize_domain(domain: str | None) -> str | None:
    if not domain:
        return None
    if domain in ("Recognition and Orientation", "Recognition & Orientation"):
        return "Recognition & Orientation"
    return domain


GAME_REGISTRY: dict[str, dict[str, Any]] = {
    "story-builder": {
        "name": "Story Builder",
        "description": "Recall missing words from a short everyday story.",
        "primary_domain": "Memory",
        "secondary_domains": [],
        "playable": True,
        "domain_weights": {"Memory": 1.0},
    },
    "mole-path": {
        "name": "Mole Path",
        "description": "Remember and repeat a visual path in order.",
        "primary_domain": "Memory",
        "secondary_domains": [],
        "playable": True,
        "domain_weights": {"Memory": 1.0},
    },
    "word-association": {
        "name": "Word Association",
        "description": "Connect related words and concepts together.",
        "primary_domain": "Memory",
        "secondary_domains": [],
        "playable": False,
        "domain_weights": {"Memory": 1.0},
    },
    "odd-one-out": {
        "name": "Odd One Out",
        "description": "Find the item that doesn't belong in the group.",
        "primary_domain": "Attention",
        "secondary_domains": [],
        "playable": False,
        "domain_weights": {"Attention": 1.0},
    },
    "whack-a-mole": {
        "name": "Whack-a-Mole",
        "description": "Tap target moles while suppressing impulses for distractors.",
        "primary_domain": "Attention",
        "secondary_domains": [],
        "playable": False,
        "domain_weights": {"Attention": 1.0},
    },
    "attention-hunt": {
        "name": "Attention Hunt",
        "description": "Find target objects while ignoring similar distractors.",
        "primary_domain": "Attention",
        "secondary_domains": [],
        "playable": True,
        "domain_weights": {"Attention": 1.0},
    },
    "plan-the-day": {
        "name": "Plan the Day",
        "description": "Organize daily tasks in correct logical order.",
        "primary_domain": "Executive Function",
        "secondary_domains": [],
        "playable": True,
        "domain_weights": {"Executive Function": 1.0},
    },
    "sorting-station": {
        "name": "Sorting Station",
        "description": "Adapt to changing rules to sort items correctly.",
        "primary_domain": "Executive Function",
        "secondary_domains": [],
        "playable": True,
        "domain_weights": {"Executive Function": 1.0},
    },
    "map-navigator": {
        "name": "Map Navigator",
        "description": "Navigate routes and spatial directions accurately.",
        "primary_domain": "Recognition & Orientation",
        "secondary_domains": [],
        "playable": True,
        "domain_weights": {"Recognition & Orientation": 1.0},
    },
    "face-recognition": {
        "name": "Face Recognition",
        "description": "Select familiar faces seen in a personal video.",
        "primary_domain": "Recognition & Orientation",
        "secondary_domains": [],
        "playable": True,
        "domain_weights": {"Recognition & Orientation": 1.0},
    },
    "name-recognition": {
        "name": "Name Recall",
        "description": "Match a familiar name to the pictured person.",
        "primary_domain": "Recognition & Orientation",
        "secondary_domains": [],
        "playable": True,
        "domain_weights": {"Recognition & Orientation": 1.0},
    },
    "context-recall": {
        "name": "Personal Memory Questions",
        "description": "Recall details from personal video memories in open responses.",
        "primary_domain": "Memory",
        "secondary_domains": [],
        "playable": True,
        "domain_weights": {"Memory": 1.0},
    },
    "daily_recall": {
        "name": "Daily Recall",
        "description": "Personalized face recognition, name recall, and memories.",
        "primary_domain": "Recognition & Orientation",
        "secondary_domains": ["Memory"],
        "playable": True,
        "domain_weights": {"Recognition & Orientation": 0.5, "Memory": 0.5},
    },
    "my-day-recall": {
        "name": "My Day Recall",
        "description": "Planned personalized recall and recognition activity.",
        "primary_domain": "Memory",
        "secondary_domains": ["Recognition & Orientation"],
        "playable": False,
        "domain_weights": {},
        "task_domain_weights": {
            "free_recall": {"Memory": 1.0},
            "familiar_choice": {"Recognition & Orientation": 1.0},
            "mixed_recall_and_recognition": {"Memory": 0.5, "Recognition & Orientation": 0.5},
        },
    },
    "sequence-memory": {
        "name": "Sequence Memory",
        "description": "Planned sequence recall activity.",
        "primary_domain": "Memory",
        "secondary_domains": [],
        "playable": False,
        "domain_weights": {},
    },
    "pattern-switch": {
        "name": "Pattern Switch",
        "description": "Planned rule-switching and cognitive-flexibility activity.",
        "primary_domain": "Executive Function",
        "secondary_domains": [],
        "playable": False,
        "domain_weights": {},
    },
}

LEVEL_NAMES: dict[int, str] = {1: "Easy", 2: "Medium", 3: "Hard"}


def parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    val = value.strip()
    try:
        parsed = datetime.fromisoformat(val.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone()
    except (ValueError, AttributeError):
        return None


def record_day(record: dict[str, Any]) -> str | None:
    """Extract local calendar day YYYY-MM-DD from a record."""
    for field in ("date", "timestamp"):
        val = record.get(field)
        if not val or not isinstance(val, str):
            continue
        val = val.strip()
        if len(val) == 10 and val[4] == "-" and val[7] == "-":
            return val
        parsed = parse_iso(val)
        if parsed:
            return parsed.date().isoformat()
        if len(val) >= 10 and val[:4].isdigit() and val[4] == "-" and val[7] == "-":
            return val[:10]
    return None


def load_store(path: str | Path) -> dict[str, Any]:
    store_path = Path(path)
    if not store_path.exists():
        return {"scores": [], "game_scores": []}
    with store_path.open("r", encoding="utf-8") as source:
        data = json.load(source)
    if not isinstance(data, dict):
        raise ValueError("performance store has an invalid shape")
    data.setdefault("scores", [])
    data.setdefault("game_scores", [])
    return data


def get_active_days(performance_file: str | Path) -> list[str]:
    """Return all unique calendar days (YYYY-MM-DD) with recorded activity, newest first."""
    store = load_store(performance_file)
    days: set[str] = set()

    for item in store.get("scores", []):
        day = record_day(item)
        if day and isinstance(item.get("score"), (int, float)):
            days.add(day)

    for item in store.get("game_scores", []):
        day = record_day(item)
        if day and isinstance(item.get("score"), (int, float)):
            days.add(day)

    return sorted(days, reverse=True)


def get_daily_plan(date_str: str, games_file: str | Path = "games.json") -> dict[str, list[str]]:
    """Determine planned games for date_str from games.json, matching /daily-plan."""
    games_path = Path(games_file)
    games_list: list[dict[str, Any]] = []
    if games_path.exists():
        try:
            with games_path.open("r", encoding="utf-8") as f:
                games_list = json.load(f).get("games", [])
        except Exception:
            games_list = []

    rng = random.Random(date_str)
    plan: dict[str, list[str]] = {}
    for lvl, count in ((1, 1), (2, 2), (3, 2)):
        pool = [
            g["id"]
            for g in games_list
            if lvl in g.get("levels", []) and g.get("status") == "ready" and g["id"] != "daily_recall"
        ]
        plan[f"level{lvl}"] = rng.sample(pool, min(count, len(pool)))
    plan["level1"].insert(0, "daily_recall")
    return plan


def _extract_breakdown_value(breakdown: dict[str, Any] | None, *keys: str) -> float | None:
    if not isinstance(breakdown, dict):
        return None
    for k in keys:
        val = breakdown.get(k)
        if isinstance(val, (int, float)) and not isinstance(val, bool) and math.isfinite(val):
            return float(val)
    return None


def build_day_report(
    performance_data: dict[str, Any],
    date_str: str,
    games_file: str | Path = "games.json",
) -> dict[str, Any]:
    """Build a daily cognitive report for date_str from performance store data."""
    all_scores: list[dict[str, Any]] = performance_data.get("scores", [])
    all_game_scores: list[dict[str, Any]] = performance_data.get("game_scores", [])

    day_rows: list[dict[str, Any]] = []

    # 1. Process "scores" (Daily Recall and legacy / quiz records)
    for s in all_scores:
        if record_day(s) != date_str:
            continue
        ts = s.get("completed_at") or s.get("timestamp") or s.get("date") or ""
        lvl_num = s.get("level")
        diff_str = LEVEL_NAMES.get(lvl_num, "Easy") if isinstance(lvl_num, int) else "Easy"
        breakdown = s.get("breakdown")
        game_id = s.get("game_id")

        if breakdown or game_id == "daily_recall":
            a1 = _extract_breakdown_value(breakdown, "activity1", "activity1_faceRecognition")
            a2 = _extract_breakdown_value(breakdown, "activity2", "activity2_namePeople")
            a3 = _extract_breakdown_value(breakdown, "activity3", "activity3_contextQuestions")

            has_activities = False
            if a1 is not None:
                has_activities = True
                day_rows.append({
                    "game_id": "face-recognition",
                    "parent_game_id": "daily_recall",
                    "game_name": "Face Recognition",
                    "primary_domain": "Recognition & Orientation",
                    "score": round(a1),
                    "accuracy": round(a1) / 100.0,
                    "difficulty_level": diff_str,
                    "completed": True,
                    "completed_at": ts,
                    "started_at": s.get("started_at"),
                    "reaction_time_ms": s.get("reaction_time_ms"),
                    "attempts": s.get("attempts"),
                    "incorrect_answers": s.get("incorrect_answers"),
                    "false_selections": s.get("false_selections"),
                    "correct_answers": s.get("correct_answers"),
                    "total_questions": s.get("total_questions"),
                })
            if a2 is not None:
                has_activities = True
                day_rows.append({
                    "game_id": "name-recognition",
                    "parent_game_id": "daily_recall",
                    "game_name": "Name Recall",
                    "primary_domain": "Recognition & Orientation",
                    "score": round(a2),
                    "accuracy": round(a2) / 100.0,
                    "difficulty_level": diff_str,
                    "completed": True,
                    "completed_at": ts,
                    "started_at": s.get("started_at"),
                    "reaction_time_ms": s.get("reaction_time_ms"),
                    "attempts": s.get("attempts"),
                    "incorrect_answers": s.get("incorrect_answers"),
                    "false_selections": s.get("false_selections"),
                    "correct_answers": s.get("correct_answers"),
                    "total_questions": s.get("total_questions"),
                })
            if a3 is not None:
                has_activities = True
                day_rows.append({
                    "game_id": "context-recall",
                    "parent_game_id": "daily_recall",
                    "game_name": "Personal Memory Questions",
                    "primary_domain": "Memory",
                    "score": round(a3),
                    "accuracy": round(a3) / 100.0,
                    "difficulty_level": diff_str,
                    "completed": True,
                    "completed_at": ts,
                    "started_at": s.get("started_at"),
                    "reaction_time_ms": s.get("reaction_time_ms"),
                    "attempts": s.get("attempts"),
                    "incorrect_answers": s.get("incorrect_answers"),
                    "false_selections": s.get("false_selections"),
                    "correct_answers": s.get("correct_answers"),
                    "total_questions": s.get("total_questions"),
                })

            if not has_activities and isinstance(s.get("score"), (int, float)):
                # Daily recall with overall score but without individual activity breakdown
                day_rows.append({
                    "game_id": "daily_recall",
                    "parent_game_id": "daily_recall",
                    "game_name": "Daily Recall",
                    "primary_domain": "Recognition & Orientation",
                    "score": round(float(s["score"])),
                    "accuracy": round(float(s["score"])) / 100.0,
                    "difficulty_level": diff_str,
                    "completed": True,
                    "completed_at": ts,
                    "started_at": s.get("started_at"),
                })
        elif game_id and game_id in GAME_REGISTRY:
            # Regular game stored in scores
            score_val = s.get("score")
            if isinstance(score_val, (int, float)):
                reg = GAME_REGISTRY[game_id]
                day_rows.append({
                    "game_id": game_id,
                    "parent_game_id": game_id,
                    "game_name": reg["name"],
                    "primary_domain": normalize_domain(reg["primary_domain"]),
                    "score": round(float(score_val)),
                    "accuracy": s.get("accuracy", round(float(score_val)) / 100.0),
                    "difficulty_level": diff_str,
                    "completed": True,
                    "completed_at": ts,
                    "started_at": s.get("started_at"),
                })
        # Legacy rows without breakdown or game_id do not contribute to domain scores.

    # 2. Process "game_scores"
    for s in all_game_scores:
        if record_day(s) != date_str:
            continue
        game_id = s.get("game_id")
        score_val = s.get("score")
        if not game_id or not isinstance(score_val, (int, float)) or not (0 <= score_val <= 100):
            continue

        ts = s.get("completed_at") or s.get("timestamp") or s.get("date") or ""
        lvl_num = s.get("level")
        diff_str = LEVEL_NAMES.get(lvl_num, "Medium") if isinstance(lvl_num, int) else "Medium"
        reg = GAME_REGISTRY.get(game_id, {
            "name": game_id.replace("-", " ").title(),
            "primary_domain": normalize_domain(s.get("skill")) or "Memory",
        })

        metrics = s.get("metrics") or {}
        day_rows.append({
            "game_id": game_id,
            "parent_game_id": game_id,
            "game_name": reg["name"],
            "primary_domain": normalize_domain(reg["primary_domain"]),
            "score": round(float(score_val)),
            "accuracy": s.get("accuracy", metrics.get("accuracy", round(float(score_val)) / 100.0)),
            "difficulty_level": diff_str,
            "completed": True,
            "completed_at": ts,
            "started_at": s.get("started_at"),
            "reaction_time_ms": s.get("reaction_time_ms", metrics.get("reaction_time_ms")),
            "attempts": s.get("attempts", metrics.get("attempts")),
            "incorrect_answers": s.get("incorrect_answers", metrics.get("incorrect_answers")),
            "false_selections": s.get("false_selections", metrics.get("false_selections")),
            "correct_answers": s.get("correct_answers", metrics.get("correct_answers")),
            "total_questions": s.get("total_questions", metrics.get("total_questions")),
            "missed_targets": s.get("missed_targets", metrics.get("missed_targets")),
        })

    # 3. Select latest result per game_id
    latest_by_game: dict[str, dict[str, Any]] = {}
    for row in day_rows:
        gid = row["game_id"]
        if gid not in latest_by_game:
            latest_by_game[gid] = row
        else:
            prev_time = parse_iso(latest_by_game[gid].get("completed_at"))
            curr_time = parse_iso(row.get("completed_at"))
            if curr_time and (prev_time is None or curr_time >= prev_time):
                latest_by_game[gid] = row

    completed_rows = list(latest_by_game.values())

    # 4. Determine missing_games = activities in that day's /daily-plan that were NOT completed
    daily_plan = get_daily_plan(date_str, games_file)
    planned_game_ids: list[str] = []
    for lvl in ("level1", "level2", "level3"):
        for gid in daily_plan.get(lvl, []):
            if gid not in planned_game_ids:
                planned_game_ids.append(gid)

    # A planned game is completed if its game_id or any of its sub-activities were completed
    completed_parent_ids = {r.get("parent_game_id") for r in completed_rows}
    completed_game_ids = {r.get("game_id") for r in completed_rows}

    def is_planned_completed(planned_id: str) -> bool:
        if planned_id == "daily_recall":
            return (
                "daily_recall" in completed_parent_ids
                or "daily_recall" in completed_game_ids
                or bool({"face-recognition", "name-recognition", "context-recall"} & completed_game_ids)
            )
        return planned_id in completed_game_ids or planned_id in completed_parent_ids

    missing_games = [gid for gid in planned_game_ids if not is_planned_completed(gid)]
    games_available = len(planned_game_ids)
    games_completed = len([gid for gid in planned_game_ids if is_planned_completed(gid)])

    # 5. Domain scores: equal-weight average of games within each domain.
    # Domains with no completed games are null ("Not measured"), NEVER 0.
    domains: dict[str, dict[str, Any]] = {
        domain: {"score": None, "game_count": 0, "game_ids": [], "confidence": "no data"}
        for domain in DOMAINS
    }

    for domain in DOMAINS:
        domain_games = [r for r in completed_rows if r["primary_domain"] == domain]
        if not domain_games:
            continue
        scores = [float(r["score"]) for r in domain_games]
        domains[domain] = {
            "score": round(sum(scores) / len(scores)),
            "game_count": len(domain_games),
            "game_ids": [r["game_id"] for r in domain_games],
            "confidence": "limited observations" if len(domain_games) == 1 else "multiple games",
        }

    # 6. Real start/end times and duration
    starts = [parse_iso(r.get("started_at")) for r in completed_rows if r.get("started_at")]
    ends = [parse_iso(r.get("completed_at")) for r in completed_rows if r.get("completed_at")]
    valid_starts = [t for t in starts if t is not None]
    valid_ends = [t for t in ends if t is not None]

    min_start = min(valid_starts) if valid_starts else None
    max_end = max(valid_ends) if valid_ends else None

    duration_seconds: int | None = None
    if min_start and max_end and max_end > min_start:
        duration_seconds = max(0, int((max_end - min_start).total_seconds()))

    # 7. Status calculation
    if not completed_rows:
        status = "empty"
    elif not missing_games:
        status = "complete"
    else:
        status = "partial"

    return {
        "date": date_str,
        "status": status,
        "started_at": min_start.isoformat() if min_start else None,
        "completed_at": max_end.isoformat() if max_end else None,
        "duration_seconds": duration_seconds,
        "games_completed": games_completed,
        "games_available": games_available,
        "missing_games": missing_games,
        "domains": domains,
        "games": completed_rows,
        "aggregation_method": (
            "Latest result per distinct game that day; equal-weight average of games within each domain. "
            "Missing domains have no score assigned."
        ),
        "interpretation": "Scores describe observed activity performance only and are not clinical measurements.",
    }
