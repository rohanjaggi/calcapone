import { getOrCreateDevUser } from "@/lib/dev-user";
import { listItems } from "@/lib/services/item";
import { prisma } from "@/lib/prisma";
import { CategoryDetailClient } from "@/components/category-detail/category-detail-client";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const user = await getOrCreateDevUser();

  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId: user.id },
  });
  if (!category) notFound();

  const items = await listItems(user.id, { categoryId });

  const serializedItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: { id: category.id, name: category.name, color: category.color ?? "#92785C" },
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    remindAt: item.remindAt?.toISOString() ?? null,
    recurring: item.recurring,
  }));

  return (
    <CategoryDetailClient
      category={{ id: category.id, name: category.name, color: category.color ?? "#92785C" }}
      items={serializedItems}
    />
  );
}
