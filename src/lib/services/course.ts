import { prisma } from "@/lib/prisma";
import type { Course } from "@/generated/prisma/client";

export async function createCourse(data: {
  userId: string;
  code: string;
  name: string;
  color?: string | null;
}): Promise<Course> {
  return prisma.course.create({ data });
}

export async function listCourses(userId: string): Promise<Course[]> {
  return prisma.course.findMany({
    where: { userId },
    orderBy: { code: "asc" },
  });
}

export async function getCourse(id: string, userId: string): Promise<Course | null> {
  return prisma.course.findFirst({ where: { id, userId } });
}

export async function deleteCourse(id: string, userId: string): Promise<void> {
  await prisma.course.delete({ where: { id, userId } });
}

/**
 * Find the course a user meant from free text — "CS2040", "cs2040", "data structures".
 * Exact code match (case-insensitive) wins outright; otherwise falls back to a substring
 * match on code or name, and returns null when that is ambiguous rather than guessing.
 *
 * Loads the user's courses once and resolves in memory: there are only ever a handful, so
 * a round trip per candidate isn't worth it.
 */
export async function findCourse(userId: string, query: string): Promise<Course | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const courses = await listCourses(userId);

  const exact = courses.find((course) => course.code.toLowerCase() === q);
  if (exact) return exact;

  const candidates = courses.filter(
    (course) => course.code.toLowerCase().includes(q) || course.name.toLowerCase().includes(q)
  );
  return candidates.length === 1 ? candidates[0] : null;
}
