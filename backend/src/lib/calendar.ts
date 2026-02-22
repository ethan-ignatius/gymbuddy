import { google, calendar_v3 } from "googleapis";
import type { User } from "@prisma/client";
import { getAuthenticatedClient } from "./googleAuth.js";
import { prisma } from "./db.js";

/** Thrown when Google OAuth token is invalid/expired; user must reconnect. */
export class GoogleCalendarAuthError extends Error {
  constructor(message = "Google Calendar connection expired. Please reconnect in settings.") {
    super(message);
    this.name = "GoogleCalendarAuthError";
  }
}

function isOAuthInvalidError(err: unknown): boolean {
  const e = err as { response?: { data?: { error?: string } }; code?: number };
  return (
    e?.response?.data?.error === "unauthorized_client" ||
    e?.response?.data?.error === "invalid_grant" ||
    e?.code === 401
  );
}

export type CalendarEventInput = {
  start: Date;
  end: Date;
  title: string;
  description?: string;
};

export type BusySlot = {
  start: Date;
  end: Date;
  id?: string;
};

function getCalendar(user: User): calendar_v3.Calendar | null {
  if (!user.googleAccessToken) return null;
  const auth = getAuthenticatedClient(
    user.googleAccessToken,
    user.googleRefreshToken
  );

  auth.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await prisma.user.update({
        where: { id: user.id },
        data: { googleAccessToken: tokens.access_token },
      });
    }
  });

  return google.calendar({ version: "v3", auth });
}

export async function listEvents(
  user: User,
  timeMin: Date,
  timeMax: Date
): Promise<BusySlot[]> {
  const cal = getCalendar(user);
  if (!cal) return [];

  const res = await cal.events.list({
    calendarId: user.googleCalendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items ?? [])
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      start: new Date(e.start!.dateTime!),
      end: new Date(e.end!.dateTime!),
      id: e.id ?? undefined,
    }));
}

export async function createCalendarEvent(
  user: User,
  event: CalendarEventInput
): Promise<string | null> {
  const cal = getCalendar(user);
  if (!cal) {
    console.log("[Calendar stub] Would create:", event.title, event.start);
    return null;
  }

  try {
    const res = await cal.events.insert({
      calendarId: user.googleCalendarId,
      requestBody: {
        summary: event.title,
        description: event.description,
        start: { dateTime: event.start.toISOString() },
        end: { dateTime: event.end.toISOString() },
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 15 }],
        },
      },
    });
    return res.data.id ?? null;
  } catch (err) {
    if (isOAuthInvalidError(err)) {
      throw new GoogleCalendarAuthError();
    }
    throw err;
  }
}

export async function updateEvent(
  user: User,
  eventId: string,
  updates: Partial<CalendarEventInput>
): Promise<void> {
  const cal = getCalendar(user);
  if (!cal) return;

  const body: calendar_v3.Schema$Event = {};
  if (updates.title) body.summary = updates.title;
  if (updates.description) body.description = updates.description;
  if (updates.start) body.start = { dateTime: updates.start.toISOString() };
  if (updates.end) body.end = { dateTime: updates.end.toISOString() };

  await cal.events.patch({
    calendarId: user.googleCalendarId,
    eventId,
    requestBody: body,
  });
}

export async function deleteEvent(
  user: User,
  eventId: string
): Promise<void> {
  const cal = getCalendar(user);
  if (!cal) return;
  await cal.events.delete({
    calendarId: user.googleCalendarId,
    eventId,
  });
}
