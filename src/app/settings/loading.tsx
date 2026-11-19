import { LoadingPage, Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <LoadingPage label="Loading settings">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-[1.25rem]" />
      ))}
    </LoadingPage>
  );
}
