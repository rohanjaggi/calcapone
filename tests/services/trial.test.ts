import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: vi.fn(), updateMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { checkAndConsumeTrialQuota, getTrialDailyLimit } from "@/lib/services/trial";

const base = { id: "u1", telegramId: BigInt(42), timezone: "Asia/Singapore", aiApiKey: null, aiCallsDate: null, aiCallsCount: 0 };
const now = new Date("2026-08-20T02:00:00Z"); // 10:00 SGT on 2026-08-20

describe("trial quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TRIAL_DAILY_LIMIT;
    process.env.TELEGRAM_USER_ID = "999";
  });

  it("exempts BYOK users and the owner", async () => {
    expect(await checkAndConsumeTrialQuota({ ...base, aiApiKey: "enc" }, now)).toEqual({ allowed: true, remaining: null });
    expect(await checkAndConsumeTrialQuota({ ...base, telegramId: BigInt(999) }, now)).toEqual({ allowed: true, remaining: null });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("resets the counter on a new day (user tz)", async () => {
    const r = await checkAndConsumeTrialQuota({ ...base, aiCallsDate: "2026-08-19", aiCallsCount: 30 }, now);
    expect(r).toEqual({ allowed: true, remaining: getTrialDailyLimit() - 1 });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { aiCallsDate: "2026-08-20", aiCallsCount: 1 } });
  });

  it("increments atomically while under the limit", async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
    const r = await checkAndConsumeTrialQuota({ ...base, aiCallsDate: "2026-08-20", aiCallsCount: 5 }, now);
    expect(r).toEqual({ allowed: true, remaining: 24 });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", aiCallsDate: "2026-08-20", aiCallsCount: { lt: 30 } },
      data: { aiCallsCount: { increment: 1 } },
    });
  });

  it("blocks once the limit is reached", async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });
    const r = await checkAndConsumeTrialQuota({ ...base, aiCallsDate: "2026-08-20", aiCallsCount: 30 }, now);
    expect(r).toEqual({ allowed: false, limit: 30 });
  });

  it("honours TRIAL_DAILY_LIMIT", () => {
    process.env.TRIAL_DAILY_LIMIT = "5";
    expect(getTrialDailyLimit()).toBe(5);
    process.env.TRIAL_DAILY_LIMIT = "garbage";
    expect(getTrialDailyLimit()).toBe(30);
  });
});
