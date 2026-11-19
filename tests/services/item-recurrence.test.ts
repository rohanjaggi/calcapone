import { describe, it, expect, vi, beforeEach } from "vitest";

// createNextReminder is the cron's half of recurrence: when a repeating reminder fires, it
// makes the next occurrence. The series id must ride along (or "stop the daily meds reminder"
// can't reach occurrence two), and a run that already has a later occurrence must not get a
// second one — a snoozed reminder fires again after its successor already exists.

const mockPrisma = vi.hoisted(() => ({
  item: { create: vi.fn(), update: vi.fn(), count: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/services/embeddings", () => ({
  buildEmbeddingText: vi.fn(() => "text"),
  scheduleItemEmbedding: vi.fn(async () => {}),
}));

import { createNextReminder } from "@/lib/services/item";

const NOON_SGT = new Date("2026-06-15T04:00:00Z");

const firing = (over = {}) => ({
  id: "i1",
  userId: "u1",
  categoryId: "c1",
  seriesId: "series-1" as string | null,
  title: "CS2040 lecture",
  description: null,
  priority: "medium" as const,
  dueDate: null as string | null,
  dueTime: null,
  remindAt: NOON_SGT as Date | null,
  recurrenceRule: "FREQ=WEEKLY" as string | null,
  recurrenceEnd: null as Date | null,
  createdAt: new Date("2026-06-08T04:00:00Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.item.count.mockResolvedValue(0);
  mockPrisma.item.create.mockResolvedValue({ id: "i2", seriesId: "series-1", category: { name: "General" } });
});

describe("createNextReminder", () => {
  it("creates the next occurrence a week on, carrying the series id", async () => {
    await createNextReminder(firing(), "Asia/Singapore", NOON_SGT);

    expect(mockPrisma.item.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ seriesId: "series-1", remindAt: new Date("2026-06-22T04:00:00Z") }),
      })
    );
  });

  it("falls back to the item's own id as the series id when it had none yet", async () => {
    await createNextReminder(firing({ seriesId: null }), "Asia/Singapore", NOON_SGT);

    expect(mockPrisma.item.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ seriesId: "i1" }) })
    );
  });

  it("keeps a dated reminder's due date in step with the alarm, in the user's zone", async () => {
    // The next alarm, 23:30 UTC on the 21st, is 07:30 on the 22nd in Singapore.
    const late = new Date("2026-06-14T23:30:00Z");
    await createNextReminder(firing({ remindAt: late, dueDate: "2026-06-15" }), "Asia/Singapore", late);

    expect(mockPrisma.item.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dueDate: "2026-06-22" }) })
    );
  });

  it("does not make a second successor when this one's already exists (snoozed reminder)", async () => {
    mockPrisma.item.count.mockResolvedValue(1);
    const snoozedTo = new Date("2026-06-15T04:10:00Z");

    await createNextReminder(firing({ remindAt: snoozedTo }), "Asia/Singapore", snoozedTo);

    expect(mockPrisma.item.create).not.toHaveBeenCalled();
  });

  // Keyed on creation order, not on alarm time: a copy snoozed to tomorrow 09:00 sits *after*
  // tomorrow's 08:00 occurrence on the clock, but it is older, so it must not stop the 08:00
  // one from making the day after — or completing the snoozed copy would end the run.
  it("counts only occurrences created after this one as its successor", async () => {
    const item = firing();
    await createNextReminder(item, "Asia/Singapore", NOON_SGT);

    expect(mockPrisma.item.count).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        seriesId: "series-1",
        id: { not: "i1" },
        status: { not: "done" },
        createdAt: { gt: item.createdAt },
      },
    });
  });

  it("stops at the end of the run", async () => {
    await createNextReminder(firing({ recurrenceEnd: new Date("2026-06-20T00:00:00Z") }), "Asia/Singapore", NOON_SGT);
    expect(mockPrisma.item.create).not.toHaveBeenCalled();
  });

  it("does nothing for a one-off reminder", async () => {
    await createNextReminder(firing({ recurrenceRule: null }), "Asia/Singapore", NOON_SGT);
    expect(mockPrisma.item.count).not.toHaveBeenCalled();
    expect(mockPrisma.item.create).not.toHaveBeenCalled();
  });
});
