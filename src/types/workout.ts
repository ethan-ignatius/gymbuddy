import type { User } from "@prisma/client";

export type Goal = "lose_fat" | "strength_and_size" | "strength_without_size";

export type Exercise = {
  name: string;
  sets: number;
  reps: string; // e.g. "8-10" or "5"
  restSec?: number;
  notes?: string;
};

export type WorkoutBlock = {
  name: string;
  focus: string;
  exercises: Exercise[];
};

export type WorkoutPlan = {
  userId: string;
  daysPerWeek: number;
  blocks: WorkoutBlock[];
};

export type UserWithGoal = Pick<User, "id" | "goal">;
