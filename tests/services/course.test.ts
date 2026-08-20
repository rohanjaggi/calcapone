import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  course: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { createCourse, listCourses, getCourse, deleteCourse, findCourse } from "@/lib/services/course";

const makeCourse = (id: string, code: string, name: string) => ({
  id,
  userId: "u1",
  code,
  name,
  color: null,
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

  it("lists courses ordered by code ascending", async () => {
    mockPrisma.course.findMany.mockResolvedValue([]);

    await listCourses("u1");

    expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { code: "asc" },
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

    it("returns null for a blank query", async () => {
      mockPrisma.course.findMany.mockResolvedValue([makeCourse("c1", "CS2040", "Data Structures")]);

      const result = await findCourse("u1", "   ");

      expect(result).toBeNull();
    });
  });
});
