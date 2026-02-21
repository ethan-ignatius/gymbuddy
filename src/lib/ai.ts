import OpenAI from "openai";
import type { User } from "@prisma/client";
import { prisma, saveScheduledWorkout } from "./db.js";
import { generateWorkoutPlan } from "./workoutPlan.js";
import * as calendar from "./calendar.js";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const WORKOUT_DURATION_MIN = 60;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "schedule_workout",
      description:
        "Schedule a new workout on the user's Google Calendar. A 15-minute reminder is automatically set.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
          time: {
            type: "string",
            description: "Start time in HH:MM 24-hour format",
          },
          duration_minutes: {
            type: "number",
            description: "Duration in minutes (default 60)",
          },
          workout_name: {
            type: "string",
            description:
              "Name/type of workout (e.g. 'Upper Body', 'Leg Day'). Infer from user's plan if not specified.",
          },
        },
        required: ["date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_workout",
      description:
        "Move an existing workout to a new date/time. Updates the Google Calendar event. A 15-minute reminder is kept.",
      parameters: {
        type: "object",
        properties: {
          workout_id: {
            type: "string",
            description: "ID of the workout to reschedule (from the schedule list)",
          },
          new_date: {
            type: "string",
            description: "New date in YYYY-MM-DD format",
          },
          new_time: {
            type: "string",
            description: "New start time in HH:MM 24-hour format",
          },
        },
        required: ["workout_id", "new_date", "new_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_workout",
      description: "Cancel an upcoming workout and remove it from Google Calendar.",
      parameters: {
        type: "object",
        properties: {
          workout_id: {
            type: "string",
            description: "ID of the workout to cancel",
          },
        },
        required: ["workout_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_workout_complete",
      description:
        "Mark a workout as completed. If no workout_id given, marks the most recent/current one.",
      parameters: {
        type: "object",
        properties: {
          workout_id: {
            type: "string",
            description:
              "ID of the workout. Omit to auto-select the nearest upcoming workout.",
          },
        },
        required: [],
      },
    },
  },
];

async function getUserContext(user: User): Promise<string> {
  const plan = generateWorkoutPlan(user);
  const now = new Date();

  const workouts = await prisma.scheduledWorkout.findMany({
    where: {
      userId: user.id,
      status: { in: ["scheduled", "rescheduled"] },
      startTime: { gte: new Date(now.getTime() - 2 * 60 * 60_000) },
    },
    orderBy: { startTime: "asc" },
    take: 20,
  });

  const scheduleStr =
    workouts
      .map(
        (w) =>
          `- [id: ${w.id}] ${w.workoutBlockName}: ${w.startTime.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} at ${w.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} (${w.status})`
      )
      .join("\n") || "No upcoming workouts scheduled.";

  const planStr = plan.blocks
    .map(
      (b) =>
        `${b.name}:\n${b.exercises.map((e) => `  - ${e.name}: ${e.sets}x${e.reps}`).join("\n")}`
    )
    .join("\n\n");

  return `USER PROFILE:
- Goal: ${user.goal}
- Height: ${user.heightCm}cm, Weight: ${user.weightKg}kg
- Preferred days: ${user.preferredDays ?? "not set"}
- Preferred time: ${user.preferredTime ?? "not set"}
- Travel time to gym: ${user.gymTravelMin} min

UPCOMING WORKOUTS (use the [id: ...] to reference workouts in tool calls):
${scheduleStr}

WORKOUT PLAN (blocks rotate each session):
${planStr}`;
}

async function executeScheduleWorkout(
  user: User,
  args: { date: string; time: string; duration_minutes?: number; workout_name?: string }
): Promise<string> {
  const duration = args.duration_minutes || WORKOUT_DURATION_MIN;
  const name = args.workout_name || "Workout";

  const start = new Date(`${args.date}T${args.time}:00`);
  const end = new Date(start.getTime() + duration * 60_000);

  if (isNaN(start.getTime())) {
    return JSON.stringify({ success: false, error: "Invalid date or time format." });
  }

  const rangeStart = new Date(start.getTime() - user.gymTravelMin * 60_000);
  const rangeEnd = new Date(end.getTime() + user.gymTravelMin * 60_000);
  const busySlots = await calendar.listEvents(user, rangeStart, rangeEnd);
  const hasConflict = busySlots.some(
    (s) => s.start < rangeEnd && s.end > rangeStart
  );

  if (hasConflict) {
    return JSON.stringify({
      success: false,
      error: "That time slot conflicts with an existing calendar event.",
    });
  }

  const eventId = await calendar.createCalendarEvent(user, {
    start,
    end,
    title: `Gym – ${name}`,
    description: "Scheduled by GymBuddy\n\nYou'll get a reminder 15 minutes before.",
  });

  await saveScheduledWorkout({
    userId: user.id,
    workoutBlockName: name,
    startTime: start,
    endTime: end,
    calendarEventId: eventId ?? undefined,
    status: "scheduled",
  });

  return JSON.stringify({
    success: true,
    workout_name: name,
    day: start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
    time: start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    reminder: "15 minutes before",
  });
}

async function executeRescheduleWorkout(
  user: User,
  args: { workout_id: string; new_date: string; new_time: string }
): Promise<string> {
  const workout = await prisma.scheduledWorkout.findUnique({
    where: { id: args.workout_id },
  });

  if (!workout || workout.userId !== user.id) {
    return JSON.stringify({ success: false, error: "Workout not found." });
  }

  const duration = workout.endTime.getTime() - workout.startTime.getTime();
  const newStart = new Date(`${args.new_date}T${args.new_time}:00`);
  const newEnd = new Date(newStart.getTime() + duration);

  if (isNaN(newStart.getTime())) {
    return JSON.stringify({ success: false, error: "Invalid date or time format." });
  }

  if (workout.calendarEventId) {
    await calendar.deleteEvent(user, workout.calendarEventId);
  }

  const eventId = await calendar.createCalendarEvent(user, {
    start: newStart,
    end: newEnd,
    title: `Gym – ${workout.workoutBlockName}`,
    description: "Rescheduled by GymBuddy\n\nYou'll get a reminder 15 minutes before.",
  });

  await prisma.scheduledWorkout.update({
    where: { id: args.workout_id },
    data: {
      startTime: newStart,
      endTime: newEnd,
      calendarEventId: eventId,
      status: "rescheduled",
      reminderSent: false,
    },
  });

  return JSON.stringify({
    success: true,
    workout_name: workout.workoutBlockName,
    old_time: workout.startTime.toLocaleDateString("en-US", {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    }),
    new_day: newStart.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
    new_time: newStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    reminder: "15 minutes before",
  });
}

async function executeCancelWorkout(
  user: User,
  args: { workout_id: string }
): Promise<string> {
  const workout = await prisma.scheduledWorkout.findUnique({
    where: { id: args.workout_id },
  });

  if (!workout || workout.userId !== user.id) {
    return JSON.stringify({ success: false, error: "Workout not found." });
  }

  if (workout.calendarEventId) {
    await calendar.deleteEvent(user, workout.calendarEventId);
  }

  await prisma.scheduledWorkout.update({
    where: { id: args.workout_id },
    data: { status: "cancelled" },
  });

  return JSON.stringify({
    success: true,
    cancelled: workout.workoutBlockName,
    was_on: workout.startTime.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  });
}

async function executeMarkComplete(
  user: User,
  args: { workout_id?: string }
): Promise<string> {
  let workout;

  if (args.workout_id) {
    workout = await prisma.scheduledWorkout.findUnique({
      where: { id: args.workout_id },
    });
  } else {
    workout = await prisma.scheduledWorkout.findFirst({
      where: {
        userId: user.id,
        status: { in: ["scheduled", "rescheduled"] },
        startTime: { lte: new Date(Date.now() + 3 * 60 * 60_000) },
      },
      orderBy: { startTime: "asc" },
    });
  }

  if (!workout || workout.userId !== user.id) {
    return JSON.stringify({ success: false, error: "No workout found to mark as complete." });
  }

  await prisma.scheduledWorkout.update({
    where: { id: workout.id },
    data: { status: "completed" },
  });

  return JSON.stringify({
    success: true,
    completed: workout.workoutBlockName,
  });
}

type ToolHandler = (user: User, args: Record<string, unknown>) => Promise<string>;

const toolHandlers: Record<string, ToolHandler> = {
  schedule_workout: executeScheduleWorkout as ToolHandler,
  reschedule_workout: executeRescheduleWorkout as ToolHandler,
  cancel_workout: executeCancelWorkout as ToolHandler,
  mark_workout_complete: executeMarkComplete as ToolHandler,
};

export async function getAiResponse(
  user: User,
  message: string
): Promise<string | null> {
  if (!openai) return null;

  const context = await getUserContext(user);
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are GymBuddy, a friendly and motivating gym buddy who texts your user. You're knowledgeable about fitness, nutrition, and recovery. Keep responses SHORT (2-4 sentences max) since these are text messages. Be casual, supportive, and encouraging — like a real friend who's into fitness.

Today is ${todayStr}.

You can manage the user's workout schedule using the provided tools. When the user mentions ANYTHING about their schedule — adding workouts, changing times, moving sessions, cancelling, or completing workouts — use the appropriate tool to update their Google Calendar. Every calendar event automatically gets a 15-minute reminder.

${context}

IMPORTANT RULES:
- Keep responses under 280 characters when possible
- Be conversational, not robotic
- Use simple language
- When the user mentions schedule changes, USE THE TOOLS — don't just talk about it
- After a tool call succeeds, confirm the change naturally (day, time, reminder)
- If a tool call fails, explain why and suggest alternatives
- Don't use emojis unless they do first
- When scheduling, infer the next workout block from the plan rotation if the user doesn't specify one`,
    },
    { role: "user", content: message },
  ];

  let response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages,
    tools,
  });

  let choice = response.choices[0];
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (
    choice?.finish_reason === "tool_calls" &&
    choice.message.tool_calls &&
    iterations < MAX_ITERATIONS
  ) {
    iterations++;
    messages.push(choice.message);

    for (const toolCall of choice.message.tool_calls) {
      let result: string;
      try {
        if (toolCall.type !== "function") {
          result = JSON.stringify({ success: false, error: "Unsupported tool type" });
        } else {
          const args = JSON.parse(toolCall.function.arguments);
          const handler = toolHandlers[toolCall.function.name];
          result = handler
            ? await handler(user, args)
            : JSON.stringify({ success: false, error: "Unknown tool" });
        }
      } catch (err) {
        result = JSON.stringify({
          success: false,
          error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      messages,
      tools,
    });
    choice = response.choices[0];
  }

  return choice?.message?.content ?? null;
}
