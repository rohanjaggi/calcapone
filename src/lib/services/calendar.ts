// src/lib/services/calendar.ts
import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { decrypt } from "@/lib/encryption";
import { startOfDayInTz } from "@/lib/tz";

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

function sign(payload: string): string {
  return createHmac("sha256", getStateSecret()).update(payload).digest("hex");
}

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export type OAuthStatePayload = { userId: string; nonce: string; expiresAt: Date };

/**
 * OAuth `state`: `userId.nonce.expiry`, HMAC-signed.
 *
 * The user is carried *inside* the signed state rather than read from a session cookie,
 * because a Telegram Mini App hands the consent screen to the system browser (Google
 * rejects OAuth in embedded webviews) — a different cookie jar, so neither the session
 * nor a state cookie survives the round trip.
 *
 * CSRF protection: only this server can mint a state, minting requires an authenticated
 * session, the state expires in 10 minutes, and `nonce` is burned server-side on use so a
 * captured callback URL can't be replayed.
 */
export function createOAuthState(userId: string, now = Date.now()): { state: string; payload: OAuthStatePayload } {
  const nonce = randomBytes(16).toString("hex");
  const expiresAtMs = now + OAUTH_STATE_MAX_AGE_MS;
  const body = `${userId}.${nonce}.${expiresAtMs}`;
  return {
    state: `${body}.${sign(body)}`,
    payload: { userId, nonce, expiresAt: new Date(expiresAtMs) },
  };
}

/** Verify signature and expiry. Returns the payload, or null. Does *not* check replay — burn the nonce for that. */
export function parseOAuthState(state: string, now = Date.now()): OAuthStatePayload | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [userId, nonce, expiresAtRaw, signature] = parts;
  if (!userId || !nonce) return null;

  const expected = sign(`${userId}.${nonce}.${expiresAtRaw}`);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return null;
  if (expiresAtMs - now > OAUTH_STATE_MAX_AGE_MS + 60_000) return null; // clock skew guard

  return { userId, nonce, expiresAt: new Date(expiresAtMs) };
}

/**
 * Thrown when Google rejects the stored refresh token — the user revoked access, changed
 * their password, or the grant expired. Distinct from transient API failures because the
 * only fix is reconnecting, so callers surface it instead of silently no-oping.
 */
export class CalendarAuthError extends Error {
  constructor(message = "Google Calendar access was revoked") {
    super(message);
    this.name = "CalendarAuthError";
  }
}

function isInvalidGrant(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { message?: string; response?: { data?: { error?: string } } };
  if (err.response?.data?.error === "invalid_grant") return true;
  return typeof err.message === "string" && err.message.includes("invalid_grant");
}

/**
 * Access tokens, keyed by refresh token, for the life of this server instance.
 *
 * A client that holds only a refresh token spends a round-trip to Google minting an access
 * token *before* the call we actually care about — on a page render that doubles the wait.
 * Access tokens last about an hour, so hand the client a warm one and let google-auth-library
 * refresh (and re-fill this cache via its `tokens` event) when it runs out.
 */
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Refresh early so a call can't start with a token that expires mid-flight. */
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/** Fallback lifetime when Google doesn't tell us when the token expires. */
const TOKEN_ASSUMED_LIFETIME_MS = 55 * 60 * 1000;

function tokenCacheKey(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

/**
 * The Calendar API bound to a user's credentials, plus a `forget` to drop their cached
 * access token when the grant turns out to be dead.
 */
function authorizedCalendar(encryptedRefreshToken: string): {
  calendar: calendar_v3.Calendar;
  forget: () => void;
} {
  const refreshToken = decrypt(encryptedRefreshToken);
  if (!refreshToken) throw new Error("Could not decrypt refresh token");

  const key = tokenCacheKey(refreshToken);
  const client = getOAuthClient();

  client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    accessTokenCache.set(key, {
      token: tokens.access_token,
      expiresAt: tokens.expiry_date ?? Date.now() + TOKEN_ASSUMED_LIFETIME_MS,
    });
  });

  const cached = accessTokenCache.get(key);
  const usable = cached && cached.expiresAt - Date.now() > TOKEN_EXPIRY_MARGIN_MS;
  client.setCredentials({
    refresh_token: refreshToken,
    ...(usable ? { access_token: cached.token, expiry_date: cached.expiresAt } : {}),
  });

  return {
    calendar: google.calendar({ version: "v3", auth: client }),
    forget: () => accessTokenCache.delete(key),
  };
}

/** Run a Google Calendar call, converting a dead grant into a CalendarAuthError. */
async function withCalendar<T>(
  encryptedRefreshToken: string,
  fn: (calendar: calendar_v3.Calendar) => Promise<T>
): Promise<T> {
  const { calendar, forget } = authorizedCalendar(encryptedRefreshToken);
  try {
    return await fn(calendar);
  } catch (error) {
    if (isInvalidGrant(error)) {
      forget();
      throw new CalendarAuthError();
    }
    throw error;
  }
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
  accessTokenCache.delete(tokenCacheKey(refreshToken));
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
  return withCalendar(encryptedRefreshToken, async (calendar) => {
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
  });
}

export async function updateEvent(
  encryptedRefreshToken: string,
  calendarId: string,
  googleEventId: string,
  fields: { title?: string; startTime?: string; endTime?: string; description?: string; recurrence?: string[] | null },
  timezone?: string
) {
  const requestBody: Record<string, unknown> = {};
  if (fields.title !== undefined) requestBody.summary = fields.title;
  if (fields.description !== undefined) requestBody.description = fields.description;
  if (fields.startTime !== undefined) requestBody.start = { dateTime: fields.startTime, timeZone: timezone };
  if (fields.endTime !== undefined) requestBody.end = { dateTime: fields.endTime, timeZone: timezone };
  if (fields.recurrence !== undefined) requestBody.recurrence = fields.recurrence;

  return withCalendar(encryptedRefreshToken, async (calendar) => {
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
  });
}

export async function deleteEvent(
  encryptedRefreshToken: string,
  calendarId: string,
  googleEventId: string
) {
  await withCalendar(encryptedRefreshToken, (calendar) =>
    calendar.events.delete({
      calendarId: calendarId || "primary",
      eventId: googleEventId,
    })
  );
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
  return withCalendar(encryptedRefreshToken, async (calendar) => {
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
  });
}

/**
 * A change since the last sync: either the event's current state, or (`cancelled: true`) word
 * that it's gone. Google's cancelled-event payload is minimal — id and status, nothing else —
 * so every other field is null/false on a cancellation rather than stale carried-over data.
 */
export type SyncedEvent = {
  googleEventId: string;
  title: string;
  description: string | null;
  /** null for a cancelled/deleted event — the caller removes it from the mirror. */
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean;
  transparent: boolean;
  googleUpdatedAt: Date | null;
  cancelled: boolean;
};

/** Google's answer to an aged-out sync token — the only valid response is a fresh full sync. */
function isSyncTokenExpired(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: number | string; response?: { status?: number } };
  return err.response?.status === 410 || Number(err.code) === 410;
}

/**
 * An all-day date ("2026-08-20") carries no offset, so it means midnight in *some* zone —
 * Google's answer is the calendar's own zone (returned once per list response), not whatever
 * zone happens to be running this server. A `dateTime` already carries an explicit offset and
 * parses unambiguously on its own.
 */
function parseGoogleInstant(
  value: calendar_v3.Schema$EventDateTime | undefined,
  calendarTz: string
): Date | null {
  if (!value) return null;
  if (value.dateTime) return new Date(value.dateTime);
  if (value.date) return startOfDayInTz(value.date, calendarTz);
  return null;
}

/**
 * One page-walk of events.list, shared by the full and incremental passes — the only
 * difference Google sees between them is whether `syncToken` is on the request. `timeMin`,
 * `timeMax`, `orderBy` and `q` are deliberately never set here: Google rejects all of them
 * outright once a `syncToken` is present, and setting them only on the full pass would make
 * the two passes cover different event sets, defeating the point of a sync cursor.
 */
async function fetchEventChanges(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  syncToken: string | null
): Promise<{ events: SyncedEvent[]; nextSyncToken: string | null }> {
  const events: SyncedEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  let calendarTz = "UTC";

  do {
    const response = await calendar.events.list({
      calendarId: calendarId || "primary",
      singleEvents: true,
      showDeleted: true,
      maxResults: 2500,
      ...(syncToken ? { syncToken } : {}),
      ...(pageToken ? { pageToken } : {}),
    });

    calendarTz = response.data.timeZone ?? calendarTz;

    for (const event of response.data.items ?? []) {
      const cancelled = event.status === "cancelled";
      events.push({
        googleEventId: event.id!,
        title: event.summary ?? "(No title)",
        description: event.description ?? null,
        startsAt: cancelled ? null : parseGoogleInstant(event.start, calendarTz),
        endsAt: cancelled ? null : parseGoogleInstant(event.end, calendarTz),
        allDay: !cancelled && !event.start?.dateTime,
        transparent: event.transparency === "transparent",
        googleUpdatedAt: event.updated ? new Date(event.updated) : null,
        cancelled,
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
    // Only the last page carries this — grab it whenever it shows up rather than assuming
    // it's the final iteration, since an empty final page still needs to report it.
    if (response.data.nextSyncToken) nextSyncToken = response.data.nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

/**
 * One incremental sync pass. Pass the stored token; get back the changes since it was issued
 * plus the token for next time.
 *
 * No token in → full sync (there's nothing to diff against). A token that Google has since
 * aged out answers 410, and the only valid recovery is a full sync — `fullResync` tells the
 * caller these results can't be patched onto its existing mirror and the mirror has to be
 * rebuilt instead.
 */
export async function listEventChanges(
  encryptedRefreshToken: string,
  calendarId: string,
  syncToken: string | null
): Promise<{ events: SyncedEvent[]; nextSyncToken: string | null; fullResync: boolean }> {
  return withCalendar(encryptedRefreshToken, async (calendar) => {
    if (!syncToken) {
      const result = await fetchEventChanges(calendar, calendarId, null);
      return { ...result, fullResync: true };
    }

    try {
      const result = await fetchEventChanges(calendar, calendarId, syncToken);
      return { ...result, fullResync: false };
    } catch (error) {
      if (!isSyncTokenExpired(error)) throw error;
      const result = await fetchEventChanges(calendar, calendarId, null);
      return { ...result, fullResync: true };
    }
  });
}
