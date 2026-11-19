import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockReorderCategories = vi.fn();
const mockMaxSortOrder = vi.fn();
const mockUpdateItem = vi.fn();
const mockGetItem = vi.fn();
const mockCreateItem = vi.fn();
const mockUpdateCategory = vi.fn();
const mockCategoryFindFirst = vi.fn();
const mockUpdateUserSettings = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(() => Promise.resolve({ id: "user-1", timezone: "Asia/Singapore" })),
  getCurrentUser: vi.fn(() => Promise.resolve({ id: "user-1", timezone: "Asia/Singapore" })),
}));

vi.mock("@/lib/services/category", () => ({
  reorderCategories: (...args: unknown[]) => mockReorderCategories(...args),
  maxSortOrder: (...args: unknown[]) => mockMaxSortOrder(...args),
  createCategory: vi.fn(),
  listCategories: vi.fn(async () => [{ id: "c1", name: "General", color: null }]),
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  deleteCategory: vi.fn(),
}));

vi.mock("@/lib/services/item", () => ({
  updateItem: (...args: unknown[]) => mockUpdateItem(...args),
  getItem: (...args: unknown[]) => mockGetItem(...args),
  createItem: (...args: unknown[]) => mockCreateItem(...args),
  listItems: vi.fn(),
  OPEN_STATUSES: ["pending", "in_progress"],
  deleteItem: vi.fn(),
}));

vi.mock("@/lib/services/calendar", () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  getEvents: vi.fn(),
  getAuthUrl: vi.fn(),
  createOAuthState: vi.fn(),
  revokeRefreshToken: vi.fn(),
  CalendarAuthError: class extends Error {},
}));

vi.mock("@/lib/services/calendar-sync", () => ({ mirrorEvent: vi.fn(), unmirrorEvent: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { category: { findFirst: (...args: unknown[]) => mockCategoryFindFirst(...args) } },
}));

vi.mock("@/lib/services/user", () => ({
  updateUserSettings: (...args: unknown[]) => mockUpdateUserSettings(...args),
}));

import { reorderCategoriesAction, editItem, editCategory, addItem } from "@/app/actions";
import { saveNotifications } from "@/app/settings/actions";

describe("reorderCategoriesAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls reorderCategories service with user id and category ids", async () => {
    await reorderCategoriesAction(["cat-a", "cat-b", "cat-c"]);
    expect(mockReorderCategories).toHaveBeenCalledWith("user-1", ["cat-a", "cat-b", "cat-c"]);
  });
});

// Server actions take whatever the client posts — TypeScript types are not enforced at runtime.
describe("server actions at the trust boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves an item into a category the user owns", async () => {
    mockCategoryFindFirst.mockResolvedValue({ id: "cat-2" });
    await editItem("item-1", { categoryId: "cat-2" });
    expect(mockCategoryFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "cat-2", userId: "user-1" } }));
    expect(mockUpdateItem).toHaveBeenCalledWith("item-1", "user-1", expect.objectContaining({ categoryId: "cat-2" }));
  });

  it("refuses to move an item into someone else's category", async () => {
    mockCategoryFindFirst.mockResolvedValue(null);
    await expect(editItem("item-1", { categoryId: "their-cat" })).rejects.toThrow();
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("editItem drops fields the form never sends (e.g. userId, notificationStage)", async () => {
    mockUpdateItem.mockResolvedValue({});
    const crafted = { title: "x", userId: "owner-id", notificationStage: 0 } as unknown as Parameters<typeof editItem>[1];
    await editItem("item-1", crafted);
    const written = mockUpdateItem.mock.calls[0][2];
    expect(written).not.toHaveProperty("userId");
    expect(written).not.toHaveProperty("notificationStage");
    expect(written.title).toBe("x");
  });

  it("editItem refuses a reminder value that isn't a string instead of crashing", async () => {
    const crafted = { remindAt: { evil: true } } as unknown as Parameters<typeof editItem>[1];
    expect(await editItem("item-1", crafted)).toEqual({ error: expect.any(String) });
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("editCategory writes only name and color", async () => {
    const crafted = { name: "Work", userId: "owner-id" } as unknown as Parameters<typeof editCategory>[1];
    await editCategory("cat-1", crafted);
    expect(mockUpdateCategory).toHaveBeenCalledWith("cat-1", "user-1", { name: "Work", color: undefined });
  });

  it("saveNotifications cannot reset the trial quota", async () => {
    const crafted = {
      briefingEnabled: true,
      briefingTime: "08:00",
      weeklyDigestEnabled: false,
      quietStart: null,
      quietEnd: null,
      notifyMinPriority: "low",
      digestDay: 0,
      digestTime: "18:00",
      aiCallsCount: 0,
    } as unknown as Parameters<typeof saveNotifications>[0];
    await saveNotifications(crafted);
    expect(mockUpdateUserSettings.mock.calls[0][1]).not.toHaveProperty("aiCallsCount");
  });
});

describe("reminder times from the app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T02:00:00Z")); // 10:00 in Singapore
  });
  afterEach(() => vi.useRealTimers());

  it("refuses a reminder time that has already passed, with a message the sheet can show", async () => {
    const result = await editItem("item-1", { remindAt: "2026-11-19T09:00" });
    expect(result).toEqual({ error: "That reminder time has already passed." });
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("saves a new reminder time in the user's zone, restarting a repeating rule there", async () => {
    mockGetItem.mockResolvedValue({ status: "pending", recurrenceRule: "DTSTART:20261118T010000Z\nRRULE:FREQ=DAILY" });
    await editItem("item-1", { remindAt: "2026-11-20T08:00" });
    const written = mockUpdateItem.mock.calls[0][2];
    expect(written.remindAt).toEqual(new Date("2026-11-20T00:00:00Z"));
    expect(written.recurrenceRule).toContain("DTSTART:20261120T000000Z");
  });

  it("addItem refuses a reminder time that has already passed", async () => {
    const result = await addItem({ title: "Meds", categoryId: "c1", priority: "low", remindAt: "2026-11-19T07:00" });
    expect(result).toEqual({ error: "That reminder time has already passed." });
    expect(mockCreateItem).not.toHaveBeenCalled();
  });
});
