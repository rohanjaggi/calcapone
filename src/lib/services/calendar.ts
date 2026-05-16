// src/lib/services/calendar.ts
import { google } from "googleapis";
import { decrypt } from "@/lib/encryption";

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
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

export async function exchangeCode(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function createEvent(
  encryptedRefreshToken: string,
  calendarId: string,
  event: { title: string; startTime: string; endTime: string; description?: string }
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
      start: { dateTime: event.startTime },
      end: { dateTime: event.endTime },
    },
  });

  return {
    id: response.data.id!,
    title: response.data.summary ?? event.title,
    startTime: response.data.start?.dateTime ?? event.startTime,
    endTime: response.data.end?.dateTime ?? event.endTime,
  };
}

export async function getEvents(
  encryptedRefreshToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
) {
  const refreshToken = decrypt(encryptedRefreshToken);
  if (!refreshToken) throw new Error("Could not decrypt refresh token");

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: client });
  const response = await calendar.events.list({
    calendarId: calendarId || "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (response.data.items ?? []).map((event) => ({
    id: event.id!,
    title: event.summary ?? "(No title)",
    startTime: event.start?.dateTime ?? event.start?.date ?? "",
    endTime: event.end?.dateTime ?? event.end?.date ?? "",
    description: event.description ?? null,
  }));
}
