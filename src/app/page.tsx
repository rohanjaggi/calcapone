import { requireUser } from "@/lib/auth";
import { getAgenda } from "@/lib/services/agenda";
import { todayInTz } from "@/lib/tz";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SearchDialog } from "@/components/search/search-dialog";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();

  // Settled once, on the server, in the user's zone -- both renders then agree on which
  // calendar day "today" is, even across a midnight boundary.
  const today = todayInTz(user.timezone);
  const agenda = await getAgenda(user.id, user.timezone, today);

  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <SearchDialog />
      </div>
      <DashboardClient
        userName={user.telegramUsername}
        timezone={user.timezone}
        today={today}
        agenda={agenda}
      />
    </>
  );
}
