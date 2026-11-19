import { LoadingPage, Skeleton } from "@/components/ui/skeleton";

export default function TodosLoading() {
  return (
    <LoadingPage label="Loading your tasks">
      {[3, 2].map((rows, i) => (
        <div key={i} className="pt-3">
          <Skeleton className="h-5 w-32 mb-3 ml-2" />
          <div className="bg-card border border-border rounded-[1.25rem] overflow-hidden">
            {Array.from({ length: rows }).map((_, r) => (
              <div key={r} className={`flex items-center gap-3.5 px-4 min-h-14 ${r ? "border-t border-border" : ""}`}>
                <Skeleton className="w-[22px] h-[22px] rounded-full" />
                <Skeleton className="h-4 flex-1 max-w-56" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </LoadingPage>
  );
}
