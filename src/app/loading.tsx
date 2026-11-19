import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main className="safe-bottom" aria-busy="true" aria-label="Loading your day">
      {/* The sky arrives first, so the wait already looks like the page. */}
      <div className="sky-band px-6 pt-3 pb-14">
        <div className="h-11" />
        <div className="mt-5 flex items-end gap-4">
          <Skeleton className="h-28 w-32 rounded-2xl" />
          <Skeleton className="h-14 w-36 mb-4 rounded-xl" />
        </div>
        <Skeleton className="h-5 w-52 mt-5" />
      </div>
      <div className="px-4 mt-6 grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />
        ))}
      </div>
      <div className="px-4 mt-2">
        <Skeleton className="h-48 w-full rounded-[1.5rem]" />
      </div>
    </main>
  );
}
