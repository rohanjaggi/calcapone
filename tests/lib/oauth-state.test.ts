import { describe, it, expect, beforeAll } from "vitest";
import { createOAuthState, parseOAuthState } from "@/lib/services/calendar";

const USER = "11111111-2222-3333-4444-555555555555";

describe("OAuth state", () => {
  beforeAll(() => {
    process.env.OAUTH_STATE_SECRET = "test-oauth-secret-value";
  });

  it("round-trips the user id and a fresh nonce", () => {
    const now = Date.now();
    const { state, payload } = createOAuthState(USER, now);
    expect(payload.userId).toBe(USER);
    const parsed = parseOAuthState(state, now + 1000);
    expect(parsed).not.toBeNull();
    expect(parsed!.userId).toBe(USER);
    expect(parsed!.nonce).toBe(payload.nonce);
  });

  it("issues a different nonce every time", () => {
    const a = createOAuthState(USER);
    const b = createOAuthState(USER);
    expect(a.payload.nonce).not.toBe(b.payload.nonce);
    expect(a.state).not.toBe(b.state);
  });

  it("rejects a state whose user id was swapped", () => {
    const { state } = createOAuthState(USER);
    const [, nonce, exp, sig] = state.split(".");
    const forged = `99999999-2222-3333-4444-555555555555.${nonce}.${exp}.${sig}`;
    expect(parseOAuthState(forged)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const { state } = createOAuthState(USER);
    const parts = state.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].slice(-2) === "00" ? "01" : "00");
    expect(parseOAuthState(parts.join("."))).toBeNull();
  });

  it("rejects an expired state", () => {
    const now = Date.now();
    const { state } = createOAuthState(USER, now);
    expect(parseOAuthState(state, now + 11 * 60 * 1000)).toBeNull();
  });

  it("rejects an expiry further out than the maximum lifetime", () => {
    const now = Date.now();
    const { state } = createOAuthState(USER, now + 60 * 60 * 1000);
    expect(parseOAuthState(state, now)).toBeNull();
  });

  it("rejects malformed states", () => {
    expect(parseOAuthState("")).toBeNull();
    expect(parseOAuthState("a.b.c")).toBeNull();
    expect(parseOAuthState("a.b.c.d.e")).toBeNull();
    expect(parseOAuthState(`.${"n"}.${Date.now() + 1000}.ff`)).toBeNull();
  });

  it("rejects a state signed with a different secret", () => {
    const { state } = createOAuthState(USER);
    process.env.OAUTH_STATE_SECRET = "a-completely-different-secret";
    expect(parseOAuthState(state)).toBeNull();
    process.env.OAUTH_STATE_SECRET = "test-oauth-secret-value";
  });
});
