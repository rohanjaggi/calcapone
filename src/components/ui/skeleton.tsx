/** A placeholder block with a slow light pass; the shapes stand in for the page that's coming. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`shimmer rounded-lg ${className}`} />;
}

/** The shared frame for every route's loading state: a title, then the page's own shapes. */
export function LoadingPage({ children, label }: { children?: React.ReactNode; label: string }) {
  return (
    <main className="safe-bottom" aria-busy="true" aria-label={label}>
      <div className="px-6 pt-7">
        <Skeleton className="h-10 w-40 rounded-xl" />
        <Skeleton className="h-4 w-28 mt-3" />
      </div>
      <div className="px-4 mt-6 space-y-3">{children}</div>
    </main>
  );
}
