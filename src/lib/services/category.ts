import { prisma } from "@/lib/prisma";

export async function createCategory(data: {
  userId: string;
  name: string;
  color?: string | null;
  sortOrder?: number;
}) {
  return prisma.category.create({ data });
}

export async function listCategories(userId: string) {
  return prisma.category.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function maxSortOrder(userId: string): Promise<number> {
  const result = await prisma.category.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  return result._max.sortOrder ?? -1;
}

export async function reorderCategories(userId: string, categoryIds: string[]) {
  await prisma.$transaction(
    categoryIds.map((id, index) =>
      prisma.category.update({
        where: { id, userId },
        data: { sortOrder: index },
      })
    )
  );
}

export async function updateCategory(id: string, userId: string, data: { name?: string; color?: string | null }) {
  return prisma.category.update({
    where: { id, userId },
    data,
  });
}

export async function deleteCategory(id: string, userId: string) {
  return prisma.category.delete({
    where: { id, userId },
  });
}
