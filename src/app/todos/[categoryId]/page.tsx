import { requireUser } from "@/lib/auth";
import { listItemsForBoard, toClientItem } from "@/lib/services/item";
import { prisma } from "@/lib/prisma";
import { listCategories } from "@/lib/services/category";
import { CategoryDetailClient } from "@/components/category-detail/category-detail-client";
import { notFound } from "next/navigation";
import { SkyStyle } from "@/components/sky/sky-style";
import { todayInTz } from "@/lib/tz";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const user = await requireUser();

  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId: user.id },
  });
  if (!category) notFound();

  const [items, allCategories] = await Promise.all([
    listItemsForBoard(user.id, { days: 14, take: 50, categoryId }),
    listCategories(user.id),
  ]);

  const serializedItems = items.map((item) => toClientItem(item, user.timezone));

  return (
    <>
      <SkyStyle timezone={user.timezone} />
      <CategoryDetailClient
        category={{ id: category.id, name: category.name, color: category.color ?? "#92785C" }}
        items={serializedItems}
        today={todayInTz(user.timezone)}
        lists={allCategories.map((c) => ({ id: c.id, name: c.name, color: c.color ?? "#92785C" }))}
      />
    </>
  );
}
