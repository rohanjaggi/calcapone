import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListCategories = vi.hoisted(() => vi.fn());
const mockCreateCategory = vi.hoisted(() => vi.fn());
const mockCreateItem = vi.hoisted(() => vi.fn());
const mockListItems = vi.hoisted(() => vi.fn());
const mockUpdateItem = vi.hoisted(() => vi.fn());
const mockDeleteItem = vi.hoisted(() => vi.fn());
const mockGetEvents = vi.hoisted(() => vi.fn());
const mockCreateEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/category", () => ({
  listCategories: mockListCategories,
  createCategory: mockCreateCategory,
}));

vi.mock("@/lib/services/item", () => ({
  createItem: mockCreateItem,
  listItems: mockListItems,
  updateItem: mockUpdateItem,
  deleteItem: mockDeleteItem,
}));

vi.mock("@/lib/services/calendar", () => ({
  getEvents: mockGetEvents,
  createEvent: mockCreateEvent,
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
      expect(result).toBe("Created Task: **Write report** in Work");
    });

    it("creates a new category if not found", async () => {
      mockListCategories.mockResolvedValue([]);
      const newCat = { id: "c2", name: "Personal" };
      mockCreateCategory.mockResolvedValue(newCat);
      mockCreateItem.mockResolvedValue({ id: "i2", title: "Buy milk", remindAt: null });

      const result = await executeToolCall(
        "create_item",
        { title: "Buy milk", category: "Personal" },
        "u1",
        baseUser
      );

      expect(mockCreateCategory).toHaveBeenCalledWith({ userId: "u1", name: "Personal" });
      expect(result).toBe("Created Task: **Buy milk** in Personal");
    });

    it("labels item as Reminder when remindAt is set", async () => {
      const cat = { id: "c1", name: "Work" };
      mockListCategories.mockResolvedValue([cat]);
      mockCreateItem.mockResolvedValue({ id: "i3", title: "Call dentist", remindAt: new Date() });

      const result = await executeToolCall(
        "create_item",
        { title: "Call dentist", category: "Work" },
        "u1",
        baseUser
      );

      expect(result).toBe("Created Reminder: **Call dentist** in Work");
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
      expect(result).toBe("Completed: **Write quarterly report**");
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
      expect(result).toBe(`Couldn't find an item matching "nonexistent task"`);
    });
  });

  describe("unknown tool", () => {
    it("returns null for unknown tool name", async () => {
      const result = await executeToolCall("unknown_tool", {}, "u1", baseUser);
      expect(result).toBeNull();
    });
  });
});
