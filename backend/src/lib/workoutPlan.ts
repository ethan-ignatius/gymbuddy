import type { User } from "@prisma/client";
import type { WorkoutPlan, WorkoutBlock } from "../types/workout.js";

function fatLossTemplate(userId: string): WorkoutPlan {
  return {
    userId,
    daysPerWeek: 4,
    blocks: [
      {
        name: "Full Body A",
        focus: "fat_loss",
        exercises: [
          { name: "Goblet Squat", sets: 3, reps: "12-15", restSec: 45 },
          { name: "Push-up", sets: 3, reps: "10-12", restSec: 45 },
          { name: "Romanian Deadlift", sets: 3, reps: "12-15", restSec: 45 },
          { name: "Dumbbell Row", sets: 3, reps: "10-12", restSec: 45 },
          { name: "Plank", sets: 3, reps: "30-45s", restSec: 30 },
        ],
      },
      {
        name: "Full Body B",
        focus: "fat_loss",
        exercises: [
          { name: "Leg Press", sets: 3, reps: "12-15", restSec: 45 },
          { name: "Dumbbell Press", sets: 3, reps: "10-12", restSec: 45 },
          { name: "Leg Curl", sets: 3, reps: "12-15", restSec: 45 },
          { name: "Lat Pulldown", sets: 3, reps: "10-12", restSec: 45 },
          { name: "Mountain Climbers", sets: 3, reps: "30s", restSec: 30 },
        ],
      },
      {
        name: "Full Body C",
        focus: "fat_loss",
        exercises: [
          { name: "Lunge", sets: 3, reps: "10-12 each", restSec: 45 },
          { name: "Incline DB Press", sets: 3, reps: "10-12", restSec: 45 },
          { name: "Hip Thrust", sets: 3, reps: "12-15", restSec: 45 },
          { name: "Cable Row", sets: 3, reps: "10-12", restSec: 45 },
          { name: "Dead Bug", sets: 3, reps: "10 each", restSec: 30 },
        ],
      },
      {
        name: "Full Body D",
        focus: "fat_loss",
        exercises: [
          { name: "Box Jump", sets: 3, reps: "8", restSec: 60 },
          { name: "Overhead Press", sets: 3, reps: "10-12", restSec: 45 },
          { name: "Bulgarian Split Squat", sets: 3, reps: "8-10 each", restSec: 45 },
          { name: "Face Pull", sets: 3, reps: "12-15", restSec: 45 },
          { name: "Bicycle Crunch", sets: 3, reps: "15 each", restSec: 30 },
        ],
      },
    ],
  };
}

function strengthSizeTemplate(userId: string): WorkoutPlan {
  return {
    userId,
    daysPerWeek: 4,
    blocks: [
      {
        name: "Upper A",
        focus: "strength_and_size",
        exercises: [
          { name: "Bench Press", sets: 4, reps: "8-10", restSec: 90 },
          { name: "Barbell Row", sets: 4, reps: "8-10", restSec: 90 },
          { name: "Overhead Press", sets: 3, reps: "8-10", restSec: 75 },
          { name: "Lat Pulldown", sets: 3, reps: "10-12", restSec: 60 },
          { name: "Bicep Curl", sets: 3, reps: "10-12", restSec: 60 },
          { name: "Tricep Pushdown", sets: 3, reps: "10-12", restSec: 60 },
        ],
      },
      {
        name: "Lower A",
        focus: "strength_and_size",
        exercises: [
          { name: "Squat", sets: 4, reps: "8-10", restSec: 90 },
          { name: "Romanian Deadlift", sets: 4, reps: "8-10", restSec: 90 },
          { name: "Leg Press", sets: 3, reps: "10-12", restSec: 75 },
          { name: "Leg Curl", sets: 3, reps: "10-12", restSec: 60 },
          { name: "Calf Raise", sets: 3, reps: "12-15", restSec: 45 },
        ],
      },
      {
        name: "Upper B",
        focus: "strength_and_size",
        exercises: [
          { name: "Incline Dumbbell Press", sets: 4, reps: "8-10", restSec: 90 },
          { name: "Pull-up / Assisted Pull-up", sets: 4, reps: "8-10", restSec: 90 },
          { name: "Dumbbell Shoulder Press", sets: 3, reps: "8-10", restSec: 75 },
          { name: "Cable Row", sets: 3, reps: "10-12", restSec: 60 },
          { name: "Hammer Curl", sets: 3, reps: "10-12", restSec: 60 },
          { name: "Skull Crusher", sets: 3, reps: "10-12", restSec: 60 },
        ],
      },
      {
        name: "Lower B",
        focus: "strength_and_size",
        exercises: [
          { name: "Deadlift", sets: 4, reps: "6-8", restSec: 120 },
          { name: "Front Squat", sets: 3, reps: "8-10", restSec: 90 },
          { name: "Leg Extension", sets: 3, reps: "10-12", restSec: 60 },
          { name: "Leg Curl", sets: 3, reps: "10-12", restSec: 60 },
          { name: "Calf Raise", sets: 3, reps: "12-15", restSec: 45 },
        ],
      },
    ],
  };
}

function pureStrengthTemplate(userId: string): WorkoutPlan {
  return {
    userId,
    daysPerWeek: 3,
    blocks: [
      {
        name: "Strength A",
        focus: "strength",
        exercises: [
          { name: "Squat", sets: 5, reps: "5", restSec: 180 },
          { name: "Bench Press", sets: 5, reps: "5", restSec: 180 },
          { name: "Barbell Row", sets: 5, reps: "5", restSec: 120 },
        ],
      },
      {
        name: "Strength B",
        focus: "strength",
        exercises: [
          { name: "Deadlift", sets: 5, reps: "5", restSec: 180 },
          { name: "Overhead Press", sets: 5, reps: "5", restSec: 180 },
          { name: "Pull-up", sets: 3, reps: "5-8", restSec: 120 },
        ],
      },
      {
        name: "Strength C",
        focus: "strength",
        exercises: [
          { name: "Squat", sets: 5, reps: "5", restSec: 180 },
          { name: "Bench Press", sets: 5, reps: "5", restSec: 180 },
          { name: "Romanian Deadlift", sets: 3, reps: "8", restSec: 120 },
        ],
      },
    ],
  };
}

export function generateWorkoutPlan(user: User): WorkoutPlan {
  switch (user.goal) {
    case "lose_fat":
      return fatLossTemplate(user.id);
    case "strength_and_size":
      return strengthSizeTemplate(user.id);
    case "strength_without_size":
      return pureStrengthTemplate(user.id);
    default:
      return strengthSizeTemplate(user.id);
  }
}
