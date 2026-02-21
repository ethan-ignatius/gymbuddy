import { PrismaClient } from "@prisma/client";
import type { SignupPayload } from "../validation/signup.js";
import type { User } from "@prisma/client";

const prisma = new PrismaClient();

export type ScheduledWorkoutInput = {
  userId: string;
  workoutBlockName: string;
  startTime: Date;
  endTime: Date;
  calendarEventId?: string;
  status?: string;
};

export async function createUser(data: SignupPayload): Promise<User> {
  return prisma.user.create({
    data: {
      email: data.email,
      phoneNumber: data.phoneNumber,
      carrierGateway: data.carrier,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      goal: data.goal,
      gymTravelMin: data.gymTravelMinutes,
    },
  });
}

export async function saveScheduledWorkout(w: ScheduledWorkoutInput) {
  return prisma.scheduledWorkout.create({
    data: {
      userId: w.userId,
      workoutBlockName: w.workoutBlockName,
      startTime: w.startTime,
      endTime: w.endTime,
      calendarEventId: w.calendarEventId ?? null,
      status: w.status ?? "scheduled",
    },
  });
}

export async function getNextWorkoutForUser(userId: string) {
  return prisma.scheduledWorkout.findFirst({
    where: {
      userId,
      status: { in: ["scheduled", "rescheduled"] },
      startTime: { gte: new Date() },
    },
    orderBy: { startTime: "asc" },
  });
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
  });
}

export async function getUserByPhone(phoneNumber: string) {
  return prisma.user.findUnique({
    where: { phoneNumber },
  });
}

export { prisma };
