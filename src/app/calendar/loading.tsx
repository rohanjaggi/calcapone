import { LoadingPage, Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <LoadingPage label="Loading your calendar">
      <Skeleton className="h-[22rem] w-full rounded-[1.5rem]" />
      <Skeleton className="h-36 w-full rounded-[1.5rem]" />
    </LoadingPage>
  );
}
