import { prisma } from "@/lib/prisma";

export async function createCategory(data: {
  userId: string;
  name: string;
  color?: string | null;
}) {
  return prisma.category.create({ data });
}

export async function listCategories(userId: string) {
  return prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
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
