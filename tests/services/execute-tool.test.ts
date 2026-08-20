import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListCategories = vi.hoisted(() => vi.fn());
const mockCreateCategory = vi.hoisted(() => vi.fn());
const mockCreateItem = vi.hoisted(() => vi.fn());
const mockListItems = vi.hoisted(() => vi.fn());
const mockUpdateItem = vi.hoisted(() => vi.fn());
const mockDeleteItem = vi.hoisted(() => vi.fn());
const mockGetEvents = vi.hoisted(() => vi.fn());
const mockCreateEvent = vi.hoisted(() => vi.fn());
const mockUpdateEvent = vi.hoisted(() => vi.fn());
const mockDeleteEvent = vi.hoisted(() => vi.fn());
const mockMarkDisconnected = vi.hoisted(() => vi.fn());
const mockSearchItems = vi.hoisted(() => vi.fn());
const MockCalendarAuthError = vi.hoisted(
  () =>
    class CalendarAuthError extends Error {
      constructor() {
        super("Google Calendar access was revoked");
        this.name = "CalendarAuthError";
      }
    }
);

vi.mock("@/lib/services/category", () => ({
  listCategories: mockListCategories,
  createCategory: mockCreateCategory,
}));

vi.mock("@/lib/services/item", () => ({
  createItem: mockCreateItem,
  listItems: mockListItems,
  updateItem: mockUpdateItem,
  OPEN_STATUSES: ["pending", "in_progress"],
  deleteItem: mockDeleteItem,
}));

vi.mock("@/lib/services/calendar", () => ({
  getEvents: mockGetEvents,
  createEvent: mockCreateEvent,
  updateEvent: mockUpdateEvent,
  deleteEvent: mockDeleteEvent,
  CalendarAuthError: MockCalendarAuthError,
}));

vi.mock("@/lib/services/calendar-link", () => ({
  markCalendarDisconnected: mockMarkDisconnected,
  CALENDAR_RECONNECT_MESSAGE: "reconnect-please",
}));

vi.mock("@/lib/services/search", () => ({
  searchItems: mockSearchItems,
}));

import { executeToolCall, FORCED_ITEM_ID } from "@/lib/services/execute-tool";

const baseUser = {
  googleRefreshToken: null,
  googleCalendarId: null,
  timezone: "UTC",
};

/**
 * Minimal item row matching what `listItems`/`getItem` would resolve, with sane defaults for
 * every field `execute-tool.ts` reads off an item (status, snapshot fields, etc.) so tests only
 * need to spell out what's relevant to them.
 */
type ItemFixture = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  categoryId: string;
  dueDate: string | null;
  dueTime: string | null;
  remindAt: Date | null;
  recurring: string;
  recurrenceRule: string | null;
  recurrenceEnd: Date | null;
  googleEventId: string | null;
  parentId: string | null;
  notificationStage: number;
};

function makeItem(overrides: Partial<ItemFixture> & { id: string; title: string }): ItemFixture {
  return {
    description: null,
    status: "pending",
    priority: "medium",
    categoryId: "c1",
    dueDate: null,
    dueTime: null,
    remindAt: null,
    recurring: "none",
    recurrenceRule: null,
    recurrenceEnd: null,
    googleEventId: null,
    parentId: null,
    notificationStage: 0,
    ...overrides,
  };
}

type SearchResultFixture = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: { id: string; name: string; color: string };
  dueDate: string | null;
  type: "task" | "reminder";
};

function makeSearchResult(overrides: Partial<SearchResultFixture> & { id: string; title: string }): SearchResultFixture {
  return {
    description: null,
    status: "pending",
    priority: "medium",
    category: { id: "c1", name: "Work", color: "#4A6FA5" },
    dueDate: null,
    type: "task",
    ...overrides,
  };
}

describe("executeToolCall", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("create_item", () => {
    it("creates an item with existing category lookup", async () => {
      const cat = { id: "c1", name: "Work" };
      mockListCategories.mockResolvedValue([cat]);
      mockCreateItem.mockResolvedValue({ id: "i1", title: "Write report", remindAt: null });

      const result = await executeToolCall(
        "create_item",
        { title: "Write report", category: "Work", priority: "high" },
        "u1",
        baseUser
      );

      expect(mockCreateCategory).not.toHaveBeenCalled();
      expect(mockCreateItem).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u1", categoryId: "c1", title: "Write report", priority: "high" })
      );
      expect(result.text).toBe("Created Task: <b>Write report</b> in Work");
      expect(result.echo).toBe(true);
    });

    it("creates a fallback category rather than refusing when the account has none", async () => {
      mockListCategories.mockResolvedValue([]);
      mockCreateCategory.mockResolvedValue({ id: "c-new", name: "General" });
      mockCreateItem.mockResolvedValue({ id: "i1", title: "Buy milk", remindAt: null });

      const result = await executeToolCall(
        "create_item",
        { title: "Buy milk", category: "Personal" },
        "u1",
        baseUser
      );

      expect(mockCreateCategory).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u1", name: "General" })
      );
      expect(mockCreateItem).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "c-new", title: "Buy milk" })
      );
      expect(result.text).toContain("Buy milk");
      expect(result.echo).toBe(true);
    });

    it("labels item as Reminder when remindAt is set", async () => {
      const cat = { id: "c1", name: "Work" };
      mockListCategories.mockResolvedValue([cat]);
      mockCreateItem.mockResolvedValue({ id: "i3", title: "Call dentist", remindAt: new Date("2026-08-20T07:00:00Z") });

      const result = await executeToolCall(
        "create_item",
        { title: "Call dentist", category: "Work" },
        "u1",
        baseUser
      );

      expect(result.text).toBe("Created Reminder: <b>Call dentist</b> in Work — 2026-08-20 07:00");
    });

    it("records an undo that deletes the newly created item", async () => {
      mockListCategories.mockResolvedValue([{ id: "c1", name: "Work" }]);
      mockCreateItem.mockResolvedValue({ id: "i9", title: "Write report", remindAt: null });

      const result = await executeToolCall(
        "create_item",
        { title: "Write report", category: "Work" },
        "u1",
        baseUser
      );

      expect(result.undo?.inverse).toEqual({ op: "delete_item", itemId: "i9" });
    });

    it("rejects a malformed due date and marks the call as failed", async () => {
      mockListCategories.mockResolvedValue([{ id: "c1", name: "Work" }]);

      const result = await executeToolCall(
        "create_item",
        { title: "Task", due_date: "not-a-date" },
        "u1",
        baseUser
      );

      expect(mockCreateItem).not.toHaveBeenCalled();
      expect(result.failed).toBe(true);
      expect(result.echo).toBe(true);
      expect(result.text).toMatch(/couldn't understand that due date/i);
    });
  });

  describe("list_items", () => {
    it("returns items with echo:false (a read, not a receipt)", async () => {
      mockListCategories.mockResolvedValue([]);
      mockListItems.mockResolvedValue([makeItem({ id: "i1", title: "Write report" })]);

      const result = await executeToolCall("list_items", {}, "u1", baseUser);

      expect(result.echo).toBe(false);
      expect(result.text).toContain("Write report");
    });

    it("numbers itemIds in exactly the order the lines are printed", async () => {
      mockListCategories.mockResolvedValue([]);
      const items = [
        makeItem({ id: "id-a", title: "Alpha task" }),
        makeItem({ id: "id-b", title: "Beta task" }),
        makeItem({ id: "id-c", title: "Gamma task" }),
      ];
      mockListItems.mockResolvedValue(items);

      const result = await executeToolCall("list_items", {}, "u1", baseUser);

      expect(result.text).not.toBeNull();
      const lines = (result.text as string).split("\n");
      expect(lines).toHaveLength(3);
      expect(result.itemIds).toEqual(["id-a", "id-b", "id-c"]);
      lines.forEach((line, i) => {
        expect(line).toBe(`${i + 1}. 📋 [pending] ${items[i].title}`);
        expect(result.itemIds?.[i]).toBe(items[i].id);
      });
    });

    it("returns 'No items found.' with no itemIds when there are none", async () => {
      mockListCategories.mockResolvedValue([]);
      mockListItems.mockResolvedValue([]);

      const result = await executeToolCall("list_items", {}, "u1", baseUser);

      expect(result.text).toBe("No items found.");
      expect(result.echo).toBe(false);
      expect(result.itemIds).toBeUndefined();
    });
  });

  describe("complete_item", () => {
    it("completes an item by fuzzy title match", async () => {
      mockListItems.mockResolvedValue([
        makeItem({ id: "i1", title: "Write quarterly report" }),
        makeItem({ id: "i2", title: "Send invoice" }),
      ]);
      mockUpdateItem.mockResolvedValue({});

      const result = await executeToolCall(
        "complete_item",
        { title: "quarterly" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).toHaveBeenCalledWith("i1", "u1", { status: "done" });
      expect(result.text).toBe("Completed: <b>Write quarterly report</b>");
      expect(result.echo).toBe(true);
    });

    it("returns not-found message when no match, as a failed outcome", async () => {
      mockListItems.mockResolvedValue([makeItem({ id: "i1", title: "Buy groceries" })]);

      const result = await executeToolCall(
        "complete_item",
        { title: "nonexistent task" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).not.toHaveBeenCalled();
      expect(result.text).toBe(`Couldn't find an open item matching "nonexistent task"`);
      expect(result.failed).toBe(true);
    });

    it("records the pre-completion status so undo can restore it", async () => {
      mockListItems.mockResolvedValue([makeItem({ id: "i1", title: "Write quarterly report", status: "in_progress" })]);
      mockUpdateItem.mockResolvedValue({});

      const result = await executeToolCall("complete_item", { title: "quarterly" }, "u1", baseUser);

      expect(result.undo?.inverse).toEqual({
        op: "restore_item",
        itemId: "i1",
        fields: { status: "in_progress" },
      });
    });
  });

  describe("delete_item", () => {
    it("deletes the matched item", async () => {
      mockListItems.mockResolvedValue([makeItem({ id: "i1", title: "Team sync" })]);
      mockDeleteItem.mockResolvedValue({});

      const result = await executeToolCall("delete_item", { title: "Team sync" }, "u1", baseUser);

      expect(mockDeleteItem).toHaveBeenCalledWith("i1", "u1");
      expect(result.text).toBe("Deleted: <b>Team sync</b>");
      expect(result.echo).toBe(true);
    });

    it("clears googleEventId on the undo snapshot even though the deleted item had one", async () => {
      mockListItems.mockResolvedValue([makeItem({ id: "i1", title: "Team sync", googleEventId: "gcal-123" })]);
      mockDeleteItem.mockResolvedValue({});

      const result = await executeToolCall("delete_item", { title: "Team sync" }, "u1", baseUser);

      expect(result.undo?.inverse).toEqual({
        op: "recreate_item",
        itemId: "i1",
        data: expect.objectContaining({ googleEventId: null }),
      });
    });
  });

  describe("update_item", () => {
    it("updates a matched item's dueDate", async () => {
      mockListItems.mockResolvedValue([
        makeItem({ id: "i1", title: "Submit invoice" }),
        makeItem({ id: "i2", title: "Buy milk" }),
      ]);
      mockUpdateItem.mockResolvedValue({ id: "i1", title: "Submit invoice" });

      const result = await executeToolCall(
        "update_item",
        { query: "invoice", due_date: "2026-05-20" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).toHaveBeenCalledWith("i1", "u1", { dueDate: "2026-05-20" });
      expect(result.text).toBe("Updated: <b>Submit invoice</b>");
      expect(result.echo).toBe(true);
    });

    it("returns error when no item matches query, as a failed outcome", async () => {
      mockListItems.mockResolvedValue([makeItem({ id: "i1", title: "Write report" })]);

      const result = await executeToolCall(
        "update_item",
        { query: "dentist appointment" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).not.toHaveBeenCalled();
      expect(result.text).toContain("Couldn't find an open item matching");
      expect(result.failed).toBe(true);
    });

    it("only sends fields that were provided", async () => {
      mockListItems.mockResolvedValue([makeItem({ id: "i1", title: "Gym session" })]);
      mockUpdateItem.mockResolvedValue({ id: "i1", title: "Gym session" });

      await executeToolCall(
        "update_item",
        { query: "gym", priority: "high" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).toHaveBeenCalledWith("i1", "u1", { priority: "high" });
    });

    it("captures the item's full prior state for undo, with remindAt as an ISO string (not a Date)", async () => {
      const remindAt = new Date("2026-05-01T09:00:00Z");
      const recurrenceEnd = new Date("2026-12-31T00:00:00Z");
      const original = makeItem({
        id: "i1",
        title: "Submit invoice",
        description: "Q2 invoice",
        status: "pending",
        priority: "medium",
        categoryId: "c1",
        dueDate: "2026-05-10",
        dueTime: "09:00",
        remindAt,
        recurring: "weekly",
        recurrenceRule: "FREQ=WEEKLY",
        recurrenceEnd,
        googleEventId: "gcal-9",
        parentId: null,
        notificationStage: 1,
      });
      mockListItems.mockResolvedValue([original]);
      mockUpdateItem.mockResolvedValue({ id: "i1", title: "Submit invoice" });

      const result = await executeToolCall(
        "update_item",
        { query: "invoice", due_date: "2026-05-20" },
        "u1",
        baseUser
      );

      expect(result.undo?.inverse).toEqual({
        op: "restore_item",
        itemId: "i1",
        fields: {
          title: "Submit invoice",
          description: "Q2 invoice",
          status: "pending",
          priority: "medium",
          categoryId: "c1",
          dueDate: "2026-05-10",
          dueTime: "09:00",
          remindAt: remindAt.toISOString(),
          recurring: "weekly",
          recurrenceRule: "FREQ=WEEKLY",
          recurrenceEnd: recurrenceEnd.toISOString(),
          googleEventId: "gcal-9",
          parentId: null,
          notificationStage: 1,
        },
      });

      const inverse = result.undo?.inverse as { fields: { remindAt: unknown; recurrenceEnd: unknown } };
      expect(typeof inverse.fields.remindAt).toBe("string");
      expect(typeof inverse.fields.recurrenceEnd).toBe("string");
    });
  });

  describe("get_calendar", () => {
    it("returns events with echo:false (model-only)", async () => {
      const gcalUser = { googleRefreshToken: "token", googleCalendarId: "primary", timezone: "UTC" };
      mockGetEvents.mockResolvedValue([
        { title: "Standup", startTime: "2026-06-15T10:00:00Z", endTime: "2026-06-15T10:30:00Z", allDay: false },
      ]);

      const result = await executeToolCall(
        "get_calendar",
        { start_date: "2026-06-15", end_date: "2026-06-16" },
        "u1",
        gcalUser
      );

      expect(result.echo).toBe(false);
      expect(result.text).toContain("Standup");
    });
  });

  describe("create_calendar_event", () => {
    const gcalUser = { googleRefreshToken: "enc", googleCalendarId: "primary", timezone: "Asia/Singapore" };
    const args = { title: "Lunch", start_time: "2026-08-21T12:00:00+08:00", end_time: "2026-08-21T13:00:00+08:00" };

    it("reports a conflict with a timed overlapping event and does not create", async () => {
      mockGetEvents.mockResolvedValue([
        { id: "e1", title: "Standup <x>", startTime: "2026-08-21T12:30:00+08:00", endTime: "2026-08-21T13:00:00+08:00", description: null, allDay: false, transparency: "opaque" },
      ]);
      const result = await executeToolCall("create_calendar_event", args, "u1", gcalUser);
      expect(result.text).toContain("Conflict detected");
      expect(result.text).toContain("Standup &lt;x&gt;");
      expect(result.text).toContain("12:30");
      expect(result.text).toContain("13:00");
      expect(result.text).toContain('Say "yes"');
      expect(result.failed).toBe(true);
      expect(result.echo).toBe(true);
      expect(mockCreateEvent).not.toHaveBeenCalled();
      const [, , start, end, tz] = mockGetEvents.mock.calls[0];
      expect(start.toISOString()).toBe("2026-08-21T04:00:00.000Z");
      expect(end.toISOString()).toBe("2026-08-21T05:00:00.000Z");
      expect(tz).toBe("Asia/Singapore");
    });

    it("ignores all-day and transparent events when checking conflicts", async () => {
      mockGetEvents.mockResolvedValue([
        { id: "e1", title: "Birthday", startTime: "2026-08-21", endTime: "2026-08-22", description: null, allDay: true, transparency: "transparent" },
        { id: "e2", title: "OOO marker", startTime: "2026-08-21T09:00:00+08:00", endTime: "2026-08-21T18:00:00+08:00", description: null, allDay: false, transparency: "transparent" },
      ]);
      mockListItems.mockResolvedValue([]);
      mockCreateEvent.mockResolvedValue({ id: "new", title: "Lunch", startTime: args.start_time, endTime: args.end_time });
      const result = await executeToolCall("create_calendar_event", args, "u1", gcalUser);
      expect(mockCreateEvent).toHaveBeenCalled();
      expect(result.text).toContain("Created calendar event: <b>Lunch</b>");
      expect(result.text).toContain("2026-08-21");
      expect(result.text).toContain("12:00");
      expect(result.text).toContain("13:00");
      expect(result.echo).toBe(true);
    });

    it("creates despite a conflict when confirm_conflict is true (no pre-check)", async () => {
      mockListItems.mockResolvedValue([]);
      mockCreateEvent.mockResolvedValue({ id: "new", title: "Lunch", startTime: args.start_time, endTime: args.end_time });
      const result = await executeToolCall("create_calendar_event", { ...args, confirm_conflict: true }, "u1", gcalUser);
      expect(mockGetEvents).not.toHaveBeenCalled();
      expect(mockCreateEvent).toHaveBeenCalled();
      expect(result.text).toContain("added despite the overlap");
    });

    it("interprets naive datetimes in the user's timezone", async () => {
      mockGetEvents.mockResolvedValue([]);
      mockListItems.mockResolvedValue([]);
      mockCreateEvent.mockResolvedValue({ id: "new", title: "Lunch", startTime: "x", endTime: "y" });
      await executeToolCall("create_calendar_event", { ...args, start_time: "2026-08-21T12:00:00", end_time: "2026-08-21T13:00:00" }, "u1", gcalUser);
      const [, , start] = mockGetEvents.mock.calls[0];
      expect(start.toISOString()).toBe("2026-08-21T04:00:00.000Z");
    });

    it("rejects an end before start, as a failed outcome", async () => {
      const result = await executeToolCall("create_calendar_event", { ...args, end_time: "2026-08-21T11:00:00+08:00" }, "u1", gcalUser);
      expect(result.text).toMatch(/end time must be after/);
      expect(result.failed).toBe(true);
    });
  });

  describe("create_category", () => {
    it("creates a category and echoes the receipt to the user", async () => {
      mockCreateCategory.mockResolvedValue({ id: "c9", name: "Fitness" });

      const result = await executeToolCall("create_category", { name: "Fitness" }, "u1", baseUser);

      expect(mockCreateCategory).toHaveBeenCalledWith({ userId: "u1", name: "Fitness", color: null });
      expect(result.text).toBe("Created category: <b>Fitness</b>");
      expect(result.echo).toBe(true);
      expect(result.undo?.inverse).toEqual({ op: "delete_category", categoryId: "c9" });
    });
  });

  describe("list_categories", () => {
    it("returns categories with echo:false", async () => {
      mockListCategories.mockResolvedValue([{ id: "c1", name: "Work" }, { id: "c2", name: "Personal" }]);

      const result = await executeToolCall("list_categories", {}, "u1", baseUser);

      expect(result.echo).toBe(false);
      expect(result.text).toBe("- Work\n- Personal");
    });
  });

  describe("decompose_task", () => {
    it("creates one item per subtask and records an undo that deletes them all", async () => {
      const parent = makeItem({ id: "p1", title: "Plan launch", categoryId: "catX", priority: "high" });
      mockListItems.mockResolvedValue([parent]);
      mockCreateItem
        .mockResolvedValueOnce({ id: "s1", title: "Write copy" })
        .mockResolvedValueOnce({ id: "s2", title: "Design assets" });

      const result = await executeToolCall(
        "decompose_task",
        { parent_title: "Plan launch", subtasks: [{ title: "Write copy" }, { title: "Design assets" }] },
        "u1",
        baseUser
      );

      expect(mockCreateItem).toHaveBeenCalledTimes(2);
      expect(mockCreateItem).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ categoryId: "catX", title: "Write copy", parentId: "p1" })
      );
      expect(mockCreateItem).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ categoryId: "catX", title: "Design assets", parentId: "p1" })
      );
      expect(result.echo).toBe(true);
      expect(result.text).toBe("Decomposed <b>Plan launch</b> into 2 subtasks:\n• Write copy\n• Design assets");
      expect(result.undo?.inverse).toEqual({
        op: "sequence",
        ops: [
          { op: "delete_item", itemId: "s1" },
          { op: "delete_item", itemId: "s2" },
        ],
      });
    });

    it("refuses (failed) when no valid subtasks are given", async () => {
      mockListItems.mockResolvedValue([makeItem({ id: "p1", title: "Plan launch" })]);

      const result = await executeToolCall(
        "decompose_task",
        { parent_title: "Plan launch", subtasks: [] },
        "u1",
        baseUser
      );

      expect(mockCreateItem).not.toHaveBeenCalled();
      expect(result.failed).toBe(true);
    });
  });

  describe("search_items", () => {
    it("returns results with echo:false (a read, not a receipt)", async () => {
      mockSearchItems.mockResolvedValue([makeSearchResult({ id: "r1", title: "Alpha result" })]);

      const result = await executeToolCall("search_items", { query: "alpha" }, "u1", baseUser);

      expect(result.echo).toBe(false);
      expect(result.text).toContain("Alpha result");
    });

    it("numbers itemIds in exactly the order the lines are printed", async () => {
      const results = [
        makeSearchResult({ id: "r-a", title: "Alpha result" }),
        makeSearchResult({ id: "r-b", title: "Beta result" }),
        makeSearchResult({ id: "r-c", title: "Gamma result" }),
      ];
      mockSearchItems.mockResolvedValue(results);

      const result = await executeToolCall("search_items", { query: "result" }, "u1", baseUser);

      expect(result.text).not.toBeNull();
      const lines = (result.text as string).split("\n");
      expect(lines).toHaveLength(3);
      expect(result.itemIds).toEqual(["r-a", "r-b", "r-c"]);
      lines.forEach((line, i) => {
        expect(line).toBe(`${i + 1}. 📋 ○ ${results[i].title} — Work`);
        expect(result.itemIds?.[i]).toBe(results[i].id);
      });
    });
  });

  describe("suggest_schedule", () => {
    it("returns schedule suggestion when calendar connected", async () => {
      const userWithCalendar = {
        googleRefreshToken: "enc-token",
        googleCalendarId: "primary",
        timezone: "UTC",
      };
      mockListItems.mockResolvedValue([
        { id: "i1", title: "Write report", priority: "high", dueDate: "2026-05-18", status: "pending", remindAt: null },
      ]);
      mockGetEvents.mockResolvedValue([
        { title: "Standup", startTime: "2026-05-18T10:00:00Z", endTime: "2026-05-18T10:30:00Z" },
      ]);

      const result = await executeToolCall("suggest_schedule", {}, "u1", userWithCalendar);

      expect(mockListItems).toHaveBeenCalledWith("u1", { status: "pending" });
      expect(result.text).toContain("Write report");
      expect(result.echo).toBe(false);
    });

    it("returns helpful message when calendar not connected", async () => {
      mockListItems.mockResolvedValue([
        { id: "i1", title: "Write report", priority: "high", dueDate: "2026-05-18", status: "pending", remindAt: null },
      ]);

      const result = await executeToolCall("suggest_schedule", {}, "u1", baseUser);

      expect(result.text).toContain("Write report");
      expect(result.text).toContain("connect Google Calendar");
    });
  });

  describe("unknown tool", () => {
    it("returns a null, non-echoed outcome for an unknown tool name", async () => {
      const result = await executeToolCall("unknown_tool", {}, "u1", baseUser);
      expect(result.text).toBeNull();
      expect(result.echo).toBe(false);
    });
  });

  describe("argument guards", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["complete_item", {}],
      ["complete_item", { title: 42 }],
      ["delete_item", {}],
      ["update_item", {}],
      ["update_item", { query: "   " }],
      ["decompose_task", {}],
      ["search_items", {}],
      ["create_category", {}],
      ["get_calendar", { start_date: "2026-06-15" }],
    ];

    it.each(cases)("%s answers instead of throwing when args are missing (%o)", async (tool, args) => {
      mockListItems.mockResolvedValue([]);
      mockListCategories.mockResolvedValue([{ id: "c1", name: "Work" }]);
      const result = await executeToolCall(tool, args, "u1", {
        ...baseUser,
        googleRefreshToken: "token",
      });
      expect(typeof result.text).toBe("string");
      expect(result.text).toBeTruthy();
      expect(result.echo).toBe(true);
    });

    it("create_item still refuses a blank title", async () => {
      mockListCategories.mockResolvedValue([{ id: "c1", name: "Work" }]);
      const result = await executeToolCall("create_item", { title: "   " }, "u1", baseUser);
      expect(result.text).toBe("I need a title to create that.");
      expect(result.echo).toBe(true);
      expect(mockCreateItem).not.toHaveBeenCalled();
    });
  });

  describe("disambiguation", () => {
    const openCallItems = [
      makeItem({ id: "1", title: "Call mom" }),
      makeItem({ id: "2", title: "Call dentist" }),
    ];

    it("complete_item asks which task instead of picking the first, and does not mutate", async () => {
      mockListItems.mockResolvedValue(openCallItems);
      const args = { title: "call", note: "extra" };

      const result = await executeToolCall("complete_item", args, "u1", baseUser);

      expect(mockUpdateItem).not.toHaveBeenCalled();
      expect(result.text).toContain("matches 2 items");
      expect(result.echo).toBe(true);
      expect(result.choose).toEqual({
        tool: "complete_item",
        args,
        candidates: [
          { id: "1", title: "Call mom" },
          { id: "2", title: "Call dentist" },
        ],
      });
    });

    it("acts when an exact title disambiguates", async () => {
      mockListItems.mockResolvedValue(openCallItems);
      mockUpdateItem.mockResolvedValue({ id: "1", title: "Call mom" });

      const result = await executeToolCall("complete_item", { title: "Call mom" }, "u1", baseUser);

      expect(mockUpdateItem).toHaveBeenCalledWith("1", "u1", { status: "done" });
      expect(result.text).toBe("Completed: <b>Call mom</b>");
    });

    it("delete_item asks before deleting an ambiguous match, and does not mutate", async () => {
      mockListItems.mockResolvedValue(openCallItems);

      const result = await executeToolCall("delete_item", { title: "call" }, "u1", baseUser);

      expect(mockDeleteItem).not.toHaveBeenCalled();
      expect(result.text).toContain("which one should I delete");
      expect(result.choose?.tool).toBe("delete_item");
      expect(result.choose?.candidates).toEqual([
        { id: "1", title: "Call mom" },
        { id: "2", title: "Call dentist" },
      ]);
    });

    it("update_item asks before updating an ambiguous match, and does not mutate", async () => {
      mockListItems.mockResolvedValue(openCallItems);
      const args = { query: "call", priority: "high" };

      const result = await executeToolCall("update_item", args, "u1", baseUser);

      expect(mockUpdateItem).not.toHaveBeenCalled();
      expect(result.text).toContain("which one should I update");
      expect(result.choose?.tool).toBe("update_item");
      expect(result.choose?.args).toEqual(args);
    });

    it("caps candidates at 5 even when more items match", async () => {
      const manyOpen = Array.from({ length: 6 }, (_, i) => makeItem({ id: `call-${i}`, title: `Call ${i}` }));
      mockListItems.mockResolvedValue(manyOpen);

      const result = await executeToolCall("complete_item", { title: "call" }, "u1", baseUser);

      expect(result.choose?.candidates).toHaveLength(5);
      expect(result.choose?.candidates).toEqual(
        manyOpen.slice(0, 5).map((item) => ({ id: item.id, title: item.title }))
      );
    });
  });

  describe("forced item id (FORCED_ITEM_ID)", () => {
    const openCallItems = [
      makeItem({ id: "1", title: "Call mom" }),
      makeItem({ id: "2", title: "Call dentist" }),
    ];

    it("bypasses title matching and acts on exactly the forced item, even when the title is ambiguous", async () => {
      mockListItems.mockResolvedValue(openCallItems);
      mockUpdateItem.mockResolvedValue({ id: "2", title: "Call dentist" });

      const result = await executeToolCall(
        "complete_item",
        { title: "call", [FORCED_ITEM_ID]: "2" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).toHaveBeenCalledWith("2", "u1", { status: "done" });
      expect(result.text).toBe("Completed: <b>Call dentist</b>");
      expect(result.choose).toBeUndefined();
    });

    it("reports a forced id that isn't a candidate as gone, rather than acting on the wrong item", async () => {
      mockListItems.mockResolvedValue(openCallItems);

      const result = await executeToolCall(
        "complete_item",
        { title: "call mom", [FORCED_ITEM_ID]: "does-not-exist" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).not.toHaveBeenCalled();
      expect(result.text).toBe("That item no longer exists.");
    });
  });

  describe("revoked Google grant", () => {
    it("clears the link and tells the user to reconnect", async () => {
      mockListItems.mockResolvedValue([]);
      mockGetEvents.mockRejectedValue(new MockCalendarAuthError());

      const result = await executeToolCall(
        "get_calendar",
        { start_date: "2026-06-15", end_date: "2026-06-16" },
        "u1",
        { ...baseUser, googleRefreshToken: "token" }
      );

      expect(mockMarkDisconnected).toHaveBeenCalledWith("u1");
      expect(result.text).toBe("reconnect-please");
      expect(result.echo).toBe(true);
    });

    it("lets other calendar failures propagate to the caller's error handling", async () => {
      mockListItems.mockResolvedValue([]);
      mockGetEvents.mockRejectedValue(new Error("503 backend error"));

      await expect(
        executeToolCall(
          "get_calendar",
          { start_date: "2026-06-15", end_date: "2026-06-16" },
          "u1",
          { ...baseUser, googleRefreshToken: "token" }
        )
      ).rejects.toThrow("503 backend error");
      expect(mockMarkDisconnected).not.toHaveBeenCalled();
    });
  });
});
