import { describe, it, expect, beforeEach } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("session tokens", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("round-trips the user id", async () => {
    const token = await createSessionToken("user-1");
    expect(await verifySessionToken(token)).toBe("user-1");
  });

  it("rejects tampered / foreign / empty tokens", async () => {
    const token = await createSessionToken("user-1");
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBeNull();
    process.env.SESSION_SECRET = "another-secret-another-secret-another-secret";
    expect(await verifySessionToken(token)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("refuses to sign with a weak secret", async () => {
    process.env.SESSION_SECRET = "short";
    await expect(createSessionToken("u")).rejects.toThrow(/SESSION_SECRET/);
  });
});
