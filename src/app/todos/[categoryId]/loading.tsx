import { LoadingPage, Skeleton } from "@/components/ui/skeleton";

export default function CategoryLoading() {
  return (
    <LoadingPage label="Loading this list">
      <div className="bg-card border border-border rounded-[1.25rem] overflow-hidden">
        {Array.from({ length: 4 }).map((_, r) => (
          <div key={r} className={`flex items-center gap-3.5 px-4 min-h-14 ${r ? "border-t border-border" : ""}`}>
            <Skeleton className="w-[22px] h-[22px] rounded-full" />
            <Skeleton className="h-4 flex-1 max-w-60" />
          </div>
        ))}
      </div>
    </LoadingPage>
  );
}
