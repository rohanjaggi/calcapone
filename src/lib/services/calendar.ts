// src/lib/services/calendar.ts
import { google } from "googleapis";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { decrypt } from "@/lib/encryption";

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getStateSecret(): string {
  const key = process.env.OAUTH_STATE_SECRET || process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY (or OAUTH_STATE_SECRET) required for OAuth state signing");
  return key;
}

export const OAUTH_STATE_COOKIE = "gcal_oauth_state";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", getStateSecret()).update(payload).digest("hex");
}

/**
 * OAuth `state`: random nonce + issue time, HMAC-signed. The nonce is also stored in an
 * HttpOnly cookie so the callback can prove the browser that started the flow is the one
 * finishing it (login-CSRF protection). The user is taken from the session, never from state.
 */
export function createOAuthState(now = Date.now()): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${nonce}.${now}`;
  return { state: `${payload}.${sign(payload)}`, nonce };
}

export function verifyOAuthState(state: string, cookieNonce: string | undefined, now = Date.now()): boolean {
  if (!cookieNonce) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, issuedAtRaw, signature] = parts;
  const payload = `${nonce}.${issuedAtRaw}`;
  const expected = sign(payload);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || now - issuedAt > OAUTH_STATE_MAX_AGE_MS || issuedAt - now > 60_000) return false;
  const n1 = Buffer.from(nonce);
  const n2 = Buffer.from(cookieNonce);
  return n1.length === n2.length && timingSafeEqual(n1, n2);
}

export function getAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state,
  });
}

/** Best-effort revocation at Google so a disconnected token can't be reused. */
export async function revokeRefreshToken(encryptedRefreshToken: string): Promise<void> {
  const refreshToken = decrypt(encryptedRefreshToken);
  if (!refreshToken) return;
  const client = getOAuthClient();
  try {
    await client.revokeToken(refreshToken);
  } catch (error) {
    console.error("[calendar] revokeToken failed:", error instanceof Error ? error.message : error);
  }
}

export async function exchangeCode(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function createEvent(
  encryptedRefreshToken: string,
  calendarId: string,
  event: { title: string; startTime: string; endTime: string; description?: string; recurrence?: string[] },
  timezone?: string
) {
  const refreshToken = decrypt(encryptedRefreshToken);
  if (!refreshToken) throw new Error("Could not decrypt refresh token");

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: client });
  const response = await calendar.events.insert({
    calendarId: calendarId || "primary",
    requestBody: {
      summary: event.title,
      description: event.description,
      start: { dateTime: event.startTime, timeZone: timezone },
      end: { dateTime: event.endTime, timeZone: timezone },
      ...(event.recurrence && { recurrence: event.recurrence }),
    },
  });

  return {
    id: response.data.id!,
    title: response.data.summary ?? event.title,
    startTime: response.data.start?.dateTime ?? event.startTime,
    endTime: response.data.end?.dateTime ?? event.endTime,
  };
}

export async function updateEvent(
  encryptedRefreshToken: string,
  calendarId: string,
  googleEventId: string,
  fields: { title?: string; startTime?: string; endTime?: string; description?: string; recurrence?: string[] | null },
  timezone?: string
) {
  const refreshToken = decrypt(encryptedRefreshToken);
  if (!refreshToken) throw new Error("Could not decrypt refresh token");

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: client });

  const requestBody: Record<string, unknown> = {};
  if (fields.title !== undefined) requestBody.summary = fields.title;
  if (fields.description !== undefined) requestBody.description = fields.description;
  if (fields.startTime !== undefined) requestBody.start = { dateTime: fields.startTime, timeZone: timezone };
  if (fields.endTime !== undefined) requestBody.end = { dateTime: fields.endTime, timeZone: timezone };
  if (fields.recurrence !== undefined) requestBody.recurrence = fields.recurrence;

  const response = await calendar.events.patch({
    calendarId: calendarId || "primary",
    eventId: googleEventId,
    requestBody,
  });

  return {
    id: response.data.id!,
    title: response.data.summary ?? fields.title ?? "",
    startTime: response.data.start?.dateTime ?? fields.startTime ?? "",
    endTime: response.data.end?.dateTime ?? fields.endTime ?? "",
  };
}

export async function deleteEvent(
  encryptedRefreshToken: string,
  calendarId: string,
  googleEventId: string
) {
  const refreshToken = decrypt(encryptedRefreshToken);
  if (!refreshToken) throw new Error("Could not decrypt refresh token");

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: client });
  await calendar.events.delete({
    calendarId: calendarId || "primary",
    eventId: googleEventId,
  });
}

export type CalendarEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description: string | null;
  allDay: boolean;
  /** "transparent" = shows as free (e.g. birthdays, OOO markers) */
  transparency: "opaque" | "transparent";
};

export async function getEvents(
  encryptedRefreshToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  timeZone?: string
): Promise<CalendarEvent[]> {
  const refreshToken = decrypt(encryptedRefreshToken);
  if (!refreshToken) throw new Error("Could not decrypt refresh token");

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: client });
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const response = await calendar.events.list({
      calendarId: calendarId || "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
      ...(timeZone ? { timeZone } : {}),
      ...(pageToken ? { pageToken } : {}),
    });
    for (const event of response.data.items ?? []) {
      if (event.status === "cancelled") continue;
      const allDay = !event.start?.dateTime;
      events.push({
        id: event.id!,
        title: event.summary ?? "(No title)",
        startTime: event.start?.dateTime ?? event.start?.date ?? "",
        endTime: event.end?.dateTime ?? event.end?.date ?? "",
        description: event.description ?? null,
        allDay,
        transparency: event.transparency === "transparent" ? "transparent" : "opaque",
      });
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}
