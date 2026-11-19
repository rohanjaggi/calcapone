import { requireUser } from "@/lib/auth";
import { listItemsForBoard, toClientItem } from "@/lib/services/item";
import { listCategories } from "@/lib/services/category";
import { todayInTz } from "@/lib/tz";
import { CalendarClient } from "@/components/calendar/calendar-client";
import { SkyStyle } from "@/components/sky/sky-style";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await requireUser();
  const [items, categories] = await Promise.all([
    listItemsForBoard(user.id, { days: 14, take: 50 }),
    listCategories(user.id),
  ]);

  return (
    <>
      <SkyStyle timezone={user.timezone} />
      <CalendarClient
        items={items.map((item) => toClientItem(item, user.timezone))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color ?? "#92785C" }))}
        hasGoogleCalendar={!!user.googleRefreshToken}
        timezone={user.timezone}
        today={todayInTz(user.timezone)}
      />
    </>
  );
}
