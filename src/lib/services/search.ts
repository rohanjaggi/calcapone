import { prisma } from "@/lib/prisma";

type SearchResult = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: { name: string; color: string };
  dueDate: string | null;
  type: "task" | "reminder";
};

export async function searchItems(
  userId: string,
  query: string
): Promise<SearchResult[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const items = await prisma.item.findMany({
    where: {
      userId,
      parentId: null,
      OR: terms.flatMap((term) => [
        { title: { contains: term, mode: "insensitive" as const } },
        { description: { contains: term, mode: "insensitive" as const } },
      ]),
    },
    include: { category: true },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 20,
  });

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: { name: item.category.name, color: item.category.color ?? "#A8A29E" },
    dueDate: item.dueDate,
    type: item.remindAt ? "reminder" as const : "task" as const,
  }));
}
