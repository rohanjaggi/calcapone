import { describe, it, expect, vi, beforeEach } from "vitest";

const mockValidateInitData = vi.hoisted(() => vi.fn());
const mockFindOrCreateUser = vi.hoisted(() => vi.fn());
const mockCreateSessionToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/telegram-auth", () => ({
  validateInitData: mockValidateInitData,
  displayNameFor: () => "tester",
}));
vi.mock("@/lib/services/user", () => ({ findOrCreateUser: mockFindOrCreateUser }));
vi.mock("@/lib/auth/session", () => ({
  createSessionToken: mockCreateSessionToken,
  SESSION_COOKIE: "cal_session",
  sessionCookieOptions: () => ({ httpOnly: true, path: "/" }),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/telegram/miniapp/route";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/auth/telegram/miniapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/auth/telegram/miniapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockValidateInitData.mockReturnValue({ id: 42, username: "tester" });
    mockFindOrCreateUser.mockResolvedValue({ id: "user-1" });
    mockCreateSessionToken.mockResolvedValue("token");
  });

  it("rejects initData that fails validation with 401", async () => {
    mockValidateInitData.mockReturnValue(null);
    const res = await POST(request({ initData: "bad" }));
    expect(res.status).toBe(401);
  });

  it("sets the session cookie on success", async () => {
    const res = await POST(request({ initData: "good" }));
    expect(res.status).toBe(200);
    expect(res.cookies.get("cal_session")?.value).toBe("token");
  });

  it("answers 503 (not a bare 500) when the database is unreachable", async () => {
    mockFindOrCreateUser.mockRejectedValue(new Error("Tenant or user not found"));
    const res = await POST(request({ initData: "good" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});
