import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeCreds = { access_token?: string; refresh_token?: string; expiry_date?: number };

/** Hoisted with the mock factory, which vitest lifts above every import. */
const fake = vi.hoisted(() => {
  /** Credentials each OAuth2 client was handed, in construction order. */
  const credentialsPerClient: FakeCreds[] = [];
  /** How many times a client had to mint a fresh access token. */
  const counter = { refreshes: 0 };

  class FakeOAuth2 {
    credentials: FakeCreds = {};
    private listeners: Array<(tokens: FakeCreds) => void> = [];

    setCredentials(creds: FakeCreds) {
      this.credentials = creds;
      credentialsPerClient.push(creds);
    }

    on(_event: "tokens", listener: (tokens: FakeCreds) => void) {
      this.listeners.push(listener);
    }

    /** What google-auth-library does lazily when the client has no usable access token. */
    refreshIfNeeded(now: number) {
      if (this.credentials.access_token && (this.credentials.expiry_date ?? 0) > now) return;
      counter.refreshes += 1;
      const tokens: FakeCreds = { access_token: `token-${counter.refreshes}`, expiry_date: now + 3600_000 };
      this.credentials = { ...this.credentials, ...tokens };
      for (const listener of this.listeners) listener(tokens);
    }
  }

  return { credentialsPerClient, counter, FakeOAuth2 };
});

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: fake.FakeOAuth2 },
    calendar: ({ auth }: { auth: InstanceType<typeof fake.FakeOAuth2> }) => ({
      events: {
        list: async () => {
          auth.refreshIfNeeded(Date.now());
          return { data: { items: [], nextPageToken: null } };
        },
      },
    }),
  },
}));

vi.mock("@/lib/encryption", () => ({ decrypt: (value: string) => value }));

import { getEvents } from "@/lib/services/calendar";

const RANGE_START = new Date("2026-08-01T00:00:00Z");
const RANGE_END = new Date("2026-08-31T23:59:59Z");

describe("getEvents access token reuse", () => {
  beforeEach(() => {
    fake.credentialsPerClient.length = 0;
    fake.counter.refreshes = 0;
  });

  it("mints an access token once and reuses it for later calls", async () => {
    await getEvents("refresh-token-a", "primary", RANGE_START, RANGE_END);
    expect(fake.counter.refreshes).toBe(1);

    await getEvents("refresh-token-a", "primary", RANGE_START, RANGE_END);
    await getEvents("refresh-token-a", "primary", RANGE_START, RANGE_END);

    // Still one round-trip to Google for a token, not three.
    expect(fake.counter.refreshes).toBe(1);
    expect(fake.credentialsPerClient[1].access_token).toBe("token-1");
    expect(fake.credentialsPerClient[2].access_token).toBe("token-1");
  });

  it("keeps one user's token out of another user's client", async () => {
    await getEvents("refresh-token-b", "primary", RANGE_START, RANGE_END);
    await getEvents("refresh-token-c", "primary", RANGE_START, RANGE_END);

    expect(fake.counter.refreshes).toBe(2);
    const [first, second] = fake.credentialsPerClient;
    expect(first.refresh_token).toBe("refresh-token-b");
    expect(second.refresh_token).toBe("refresh-token-c");
    expect(second.access_token).toBeUndefined();
  });
});
