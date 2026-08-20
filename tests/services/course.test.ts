import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  course: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  item: {
    count: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  createCourse,
  listCourses,
  getCourse,
  deleteCourse,
  findCourse,
  setCourseArchived,
  countCourseItems,
} from "@/lib/services/course";

const makeCourse = (id: string, code: string, name: string, archived = false) => ({
  id,
  userId: "u1",
  code,
  name,
  color: null,
  archived,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("CourseService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a course", async () => {
    const input = { userId: "u1", code: "CS2040", name: "Data Structures" };
    mockPrisma.course.create.mockResolvedValue(makeCourse("c1", "CS2040", "Data Structures"));

    const result = await createCourse(input);

    expect(result.code).toBe("CS2040");
    expect(mockPrisma.course.create).toHaveBeenCalledWith({ data: input });
  });

  it("lists only active courses by default, active before archived then by code", async () => {
    mockPrisma.course.findMany.mockResolvedValue([]);

    await listCourses("u1");

    expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", archived: false },
      orderBy: [{ archived: "asc" }, { code: "asc" }],
    });
  });

  it("includes archived courses when asked", async () => {
    mockPrisma.course.findMany.mockResolvedValue([]);

    await listCourses("u1", { includeArchived: true });

    expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: [{ archived: "asc" }, { code: "asc" }],
    });
  });

  it("gets a course scoped to its owner", async () => {
    mockPrisma.course.findFirst.mockResolvedValue(makeCourse("c1", "CS2040", "Data Structures"));

    const result = await getCourse("c1", "u1");

    expect(mockPrisma.course.findFirst).toHaveBeenCalledWith({ where: { id: "c1", userId: "u1" } });
    expect(result?.code).toBe("CS2040");
  });

  it("returns null when the course isn't found", async () => {
    mockPrisma.course.findFirst.mockResolvedValue(null);

    const result = await getCourse("missing", "u1");

    expect(result).toBeNull();
  });

  it("archives a course scoped to its owner", async () => {
    mockPrisma.course.update.mockResolvedValue(makeCourse("c1", "CS2040", "Data Structures", true));

    const result = await setCourseArchived("c1", "u1", true);

    expect(mockPrisma.course.update).toHaveBeenCalledWith({
      where: { id: "c1", userId: "u1" },
      data: { archived: true },
    });
    expect(result.archived).toBe(true);
  });

  it("unarchives a course", async () => {
    mockPrisma.course.update.mockResolvedValue(makeCourse("c1", "CS2040", "Data Structures", false));

    const result = await setCourseArchived("c1", "u1", false);

    expect(mockPrisma.course.update).toHaveBeenCalledWith({
      where: { id: "c1", userId: "u1" },
      data: { archived: false },
    });
    expect(result.archived).toBe(false);
  });

  it("counts the items still tagged with a course", async () => {
    mockPrisma.item.count.mockResolvedValue(12);

    const result = await countCourseItems("c1", "u1");

    expect(mockPrisma.item.count).toHaveBeenCalledWith({ where: { courseId: "c1", userId: "u1" } });
    expect(result).toBe(12);
  });

  it("deletes a course scoped to its owner", async () => {
    mockPrisma.course.delete.mockResolvedValue(makeCourse("c1", "CS2040", "Data Structures"));

    await deleteCourse("c1", "u1");

    expect(mockPrisma.course.delete).toHaveBeenCalledWith({ where: { id: "c1", userId: "u1" } });
  });

  describe("findCourse", () => {
    it("an exact code match wins outright, even over a substring hit on another course's name", async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        makeCourse("c1", "CS2040", "Data Structures"),
        // Name deliberately contains the query string — exact code match must still win.
        makeCourse("c2", "CS2103", "CS2040 Advanced Software Engineering"),
      ]);

      const result = await findCourse("u1", "CS2040");

      expect(result?.id).toBe("c1");
    });

    it("matches the code case-insensitively", async () => {
      mockPrisma.course.findMany.mockResolvedValue([makeCourse("c1", "CS2040", "Data Structures")]);

      const result = await findCourse("u1", "cs2040");

      expect(result?.id).toBe("c1");
    });

    it("resolves a single unambiguous substring match on the name", async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        makeCourse("c1", "CS2040", "Data Structures"),
        makeCourse("c2", "MA1521", "Calculus"),
      ]);

      const result = await findCourse("u1", "structures");

      expect(result?.id).toBe("c1");
    });

    it("returns null on an ambiguous substring match", async () => {
      mockPrisma.course.findMany.mockResolvedValue([
        makeCourse("c1", "CS2040", "Data Structures"),
        makeCourse("c2", "CS2030", "Data Analytics"),
      ]);

      const result = await findCourse("u1", "data");

      expect(result).toBeNull();
    });

    it("returns null when nothing matches", async () => {
      mockPrisma.course.findMany.mockResolvedValue([makeCourse("c1", "CS2040", "Data Structures")]);

      const result = await findCourse("u1", "physics");

      expect(result).toBeNull();
    });

    it("resolves an archived course, so /due and /exams still answer for last semester", async () => {
      mockPrisma.course.findMany.mockResolvedValue([makeCourse("c1", "CS2040", "Data Structures", true)]);

      const result = await findCourse("u1", "CS2040");

      expect(result?.id).toBe("c1");
      expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
        orderBy: [{ archived: "asc" }, { code: "asc" }],
      });
    });

    it("returns null for a blank query", async () => {
      mockPrisma.course.findMany.mockResolvedValue([makeCourse("c1", "CS2040", "Data Structures")]);

      const result = await findCourse("u1", "   ");

      expect(result).toBeNull();
    });
  });
});
