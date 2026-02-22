"""
Test script for Supabase workout logging.

Creates mock ExerciseLog data in the same format as the pose tracker
and sends it to Supabase. Run with: python test_supabase_log.py
"""

from supabase_store import SupabaseStore, ExerciseLog


def main() -> None:
    db = SupabaseStore()
    if not db.available:
        print("Supabase not configured. Set SUPABASE_URL and SUPABASE_KEY in .env")
        return

    # Mock bicep curl – 3 sets, 8 reps each, typical form scores
    bicep_log = ExerciseLog(exercise="bicep_curl", weight_lbs=20.0)
    bicep_log.set_reps = [8, 8, 8]
    bicep_log.all_scores = [
        85, 82, 78, 91, 88, 75, 80, 86,  # set 1
        79, 84, 72, 88, 85, 81, 77, 83,  # set 2
        76, 80, 68, 82, 79, 74, 71, 78,  # set 3
    ]
    bicep_log.injury_warnings = 0

    # Mock lateral raise – 2 sets, 10 reps, one bad rep
    raise_log = ExerciseLog(exercise="lateral_raise", weight_lbs=12.5)
    raise_log.set_reps = [10, 10]
    raise_log.all_scores = [
        88, 85, 90, 82, 86, 91, 84, 79, 87, 83,
        81, 78, 45, 85, 82, 80, 77, 84, 79, 76,
    ]
    raise_log.injury_warnings = 1

    print("Sending mock bicep curl log...")
    db.save_exercise_log_sync(bicep_log)

    print("Sending mock lateral raise log...")
    db.save_exercise_log_sync(raise_log)

    print("Done. Check your Supabase workout_logs table.")


if __name__ == "__main__":
    main()
