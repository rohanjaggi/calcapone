import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { user: { count: mockCount } } }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/keepalive/route";

const SECRET = "test-cron-secret";

const request = (token: string | null = SECRET) =>
  new NextRequest("http://localhost/api/cron/keepalive", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("GET /api/cron/keepalive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CRON_SECRET = SECRET;
    mockCount.mockResolvedValue(3);
  });

  it("refuses requests without the cron secret", async () => {
    const res = await GET(request(null));
    expect(res.status).toBe(401);
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("touches the database so Supabase sees activity", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockCount).toHaveBeenCalledOnce();
  });

  it("reports 503 when the database is down, so the cron run shows as failed", async () => {
    mockCount.mockRejectedValue(new Error("Tenant or user not found"));
    const res = await GET(request());
    expect(res.status).toBe(503);
  });
});
