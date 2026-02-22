"""
Supabase integration for persisting workout performance data.

Expects SUPABASE_URL and SUPABASE_KEY in .env.  Falls back gracefully
(prints a warning) when credentials are missing.

Table schema (create in Supabase SQL editor):

    create table workout_logs (
        id uuid default gen_random_uuid() primary key,
        created_at timestamptz default now(),
        exercise text not null,
        sets_completed int not null,
        total_reps int not null,
        weight_lbs float,
        avg_score float,
        best_score int,
        worst_score int,
        scores jsonb,
        injury_warnings int default 0
    );
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


@dataclass
class ExerciseLog:
    """Accumulates performance data across all sets of one exercise."""
    exercise: str
    weight_lbs: float | None = None
    set_reps: list[int] = field(default_factory=list)
    all_scores: list[int] = field(default_factory=list)
    injury_warnings: int = 0

    def record_set(self, trackers: dict) -> None:
        for t in trackers.values():
            self.all_scores.extend(t.rep_scores)
            if t.injury_warning:
                self.injury_warnings += 1
        total = sum(t.reps for t in trackers.values())
        self.set_reps.append(total)

    @property
    def total_reps(self) -> int:
        return sum(self.set_reps)

    @property
    def avg_score(self) -> float:
        return sum(self.all_scores) / len(self.all_scores) if self.all_scores else 0.0

    @property
    def best_score(self) -> int:
        return max(self.all_scores) if self.all_scores else 0

    @property
    def worst_score(self) -> int:
        return min(self.all_scores) if self.all_scores else 0

    def to_row(self) -> dict:
        return {
            "exercise": self.exercise,
            "sets_completed": len(self.set_reps),
            "total_reps": self.total_reps,
            "weight_lbs": self.weight_lbs,
            "avg_score": round(self.avg_score, 1),
            "best_score": self.best_score,
            "worst_score": self.worst_score,
            "scores": self.all_scores,
            "injury_warnings": self.injury_warnings,
        }


class SupabaseStore:
    """Non-blocking Supabase writer for workout logs."""

    def __init__(self) -> None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            print(
                "Warning: SUPABASE_URL / SUPABASE_KEY not set – "
                "workout logging disabled."
            )
            self._client = None
            return

        from supabase import create_client
        self._client = create_client(url, key)
        print("Supabase store ready.")

    @property
    def available(self) -> bool:
        return self._client is not None

    def save_exercise_log(self, log: ExerciseLog) -> None:
        if not self._client:
            return
        row = log.to_row()
        threading.Thread(
            target=self._insert, args=(row,), daemon=True,
        ).start()

    def save_exercise_log_sync(self, log: ExerciseLog) -> None:
        """Synchronous save for testing. Blocks until insert completes."""
        if not self._client:
            return
        self._insert(log.to_row())

    def _insert(self, row: dict) -> None:
        try:
            self._client.table("workout_logs").insert(row).execute()
            print(f"[supabase] Saved: {row['exercise']} – "
                  f"{row['total_reps']} reps, avg {row['avg_score']}")
        except Exception as exc:
            print(f"[supabase] Error saving log: {exc}")
