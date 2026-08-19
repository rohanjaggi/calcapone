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

import { executeToolCall } from "@/lib/services/execute-tool";

const baseUser = {
  googleRefreshToken: null,
  googleCalendarId: null,
  timezone: "UTC",
};

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
      expect(result).toBe("Created Task: <b>Write report</b> in Work");
    });

    it("creates a fallback category rather than refusing when the account has none", async () => {
      // Telegram-first users can't be told to go open a website to make a list first.
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
      expect(result).toContain("Buy milk");
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

      expect(result).toBe("Created Reminder: <b>Call dentist</b> in Work — 2026-08-20 07:00");
    });
  });

  describe("complete_item", () => {
    it("completes an item by fuzzy title match", async () => {
      mockListItems.mockResolvedValue([
        { id: "i1", title: "Write quarterly report", status: "pending" },
        { id: "i2", title: "Send invoice", status: "pending" },
      ]);
      mockUpdateItem.mockResolvedValue({});

      const result = await executeToolCall(
        "complete_item",
        { title: "quarterly" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).toHaveBeenCalledWith("i1", "u1", { status: "done" });
      expect(result).toBe("Completed: <b>Write quarterly report</b>");
    });

    it("returns not-found message when no match", async () => {
      mockListItems.mockResolvedValue([{ id: "i1", title: "Buy groceries", status: "pending" }]);

      const result = await executeToolCall(
        "complete_item",
        { title: "nonexistent task" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).not.toHaveBeenCalled();
      expect(result).toBe(`Couldn't find an open item matching "nonexistent task"`);
    });
  });

  describe("unknown tool", () => {
    it("returns null for unknown tool name", async () => {
      const result = await executeToolCall("unknown_tool", {}, "u1", baseUser);
      expect(result).toBeNull();
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
      expect(result).toContain("Write report");
    });

    it("returns helpful message when calendar not connected", async () => {
      mockListItems.mockResolvedValue([
        { id: "i1", title: "Write report", priority: "high", dueDate: "2026-05-18", status: "pending", remindAt: null },
      ]);

      const result = await executeToolCall("suggest_schedule", {}, "u1", baseUser);

      expect(result).toContain("Write report");
      expect(result).toContain("Connect Google Calendar");
    });
  });

  describe("update_item", () => {
    it("updates a matched item's dueDate", async () => {
      mockListItems.mockResolvedValue([
        { id: "i1", title: "Submit invoice", status: "pending" },
        { id: "i2", title: "Buy milk", status: "pending" },
      ]);
      mockUpdateItem.mockResolvedValue({ id: "i1", title: "Submit invoice" });

      const result = await executeToolCall(
        "update_item",
        { query: "invoice", due_date: "2026-05-20" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).toHaveBeenCalledWith("i1", "u1", { dueDate: "2026-05-20" });
      expect(result).toBe("Updated: <b>Submit invoice</b>");
    });

    it("returns error when no item matches query", async () => {
      mockListItems.mockResolvedValue([
        { id: "i1", title: "Write report", status: "pending" },
      ]);

      const result = await executeToolCall(
        "update_item",
        { query: "dentist appointment" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).not.toHaveBeenCalled();
      expect(result).toContain("Couldn't find an open item matching");
    });

    it("only sends fields that were provided", async () => {
      mockListItems.mockResolvedValue([
        { id: "i1", title: "Gym session", status: "pending" },
      ]);
      mockUpdateItem.mockResolvedValue({ id: "i1", title: "Gym session" });

      await executeToolCall(
        "update_item",
        { query: "gym", priority: "high" },
        "u1",
        baseUser
      );

      expect(mockUpdateItem).toHaveBeenCalledWith("i1", "u1", { priority: "high" });
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
      expect(result).toContain("Conflict detected");
      expect(result).toContain("Standup &lt;x&gt; (12:30–13:00)");
      expect(result).toContain('Reply "yes"');
      expect(mockCreateEvent).not.toHaveBeenCalled();
      // window is passed as real instants in the user's zone
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
      expect(result).toContain("Created calendar event: <b>Lunch</b> (2026-08-21 12:00–13:00)");
    });

    it("creates despite a conflict when confirm_conflict is true (no pre-check)", async () => {
      mockListItems.mockResolvedValue([]);
      mockCreateEvent.mockResolvedValue({ id: "new", title: "Lunch", startTime: args.start_time, endTime: args.end_time });
      const result = await executeToolCall("create_calendar_event", { ...args, confirm_conflict: true }, "u1", gcalUser);
      expect(mockGetEvents).not.toHaveBeenCalled();
      expect(mockCreateEvent).toHaveBeenCalled();
      expect(result).toContain("added despite the overlap");
    });

    it("interprets naive datetimes in the user's timezone", async () => {
      mockGetEvents.mockResolvedValue([]);
      mockListItems.mockResolvedValue([]);
      mockCreateEvent.mockResolvedValue({ id: "new", title: "Lunch", startTime: "x", endTime: "y" });
      await executeToolCall("create_calendar_event", { ...args, start_time: "2026-08-21T12:00:00", end_time: "2026-08-21T13:00:00" }, "u1", gcalUser);
      const [, , start] = mockGetEvents.mock.calls[0];
      expect(start.toISOString()).toBe("2026-08-21T04:00:00.000Z");
    });

    it("rejects an end before start", async () => {
      const result = await executeToolCall("create_calendar_event", { ...args, end_time: "2026-08-21T11:00:00+08:00" }, "u1", gcalUser);
      expect(result).toMatch(/end time must be after/);
    });
  });

  describe("argument guards", () => {
    // Tool schemas aren't strict, so a model can omit or mistype any field. These used to
    // throw a TypeError and surface to the user as "Sorry, I ran into an error".
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
      expect(typeof result).toBe("string");
      expect(result).toBeTruthy();
    });

    it("create_item still refuses a blank title", async () => {
      mockListCategories.mockResolvedValue([{ id: "c1", name: "Work" }]);
      const result = await executeToolCall("create_item", { title: "   " }, "u1", baseUser);
      expect(result).toBe("I need a title to create that.");
      expect(mockCreateItem).not.toHaveBeenCalled();
    });
  });

  describe("ambiguous titles", () => {
    const open = [
      { id: "1", title: "Call mom", status: "pending", categoryId: "c1", priority: "medium", googleEventId: null },
      { id: "2", title: "Call dentist", status: "pending", categoryId: "c1", priority: "medium", googleEventId: null },
    ];

    it("asks which task to complete instead of picking the first", async () => {
      mockListItems.mockResolvedValue(open);
      const result = await executeToolCall("complete_item", { title: "call" }, "u1", baseUser);
      expect(mockUpdateItem).not.toHaveBeenCalled();
      expect(result).toContain("matches 2 items");
      expect(result).toContain("Call mom");
      expect(result).toContain("Call dentist");
    });

    it("acts when an exact title disambiguates", async () => {
      mockListItems.mockResolvedValue(open);
      mockUpdateItem.mockResolvedValue({ id: "1", title: "Call mom" });
      const result = await executeToolCall("complete_item", { title: "Call mom" }, "u1", baseUser);
      expect(mockUpdateItem).toHaveBeenCalledWith("1", "u1", { status: "done" });
      expect(result).toBe("Completed: <b>Call mom</b>");
    });

    it("asks before deleting an ambiguous match", async () => {
      mockListItems.mockResolvedValue(open);
      const result = await executeToolCall("delete_item", { title: "call" }, "u1", baseUser);
      expect(mockDeleteItem).not.toHaveBeenCalled();
      expect(result).toContain("which one should I delete");
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
      expect(result).toBe("reconnect-please");
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
