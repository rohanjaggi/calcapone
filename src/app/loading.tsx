function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-lg bg-muted/60 ${className ?? ""}`}
      style={{
        backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s ease-in-out infinite",
      }}
    />
  );
}

export default function DashboardLoading() {
  return (
    <main className="safe-bottom pb-8">
      {/* Greeting */}
      <div className="px-5 pt-6 pb-4">
        <Shimmer className="h-3 w-24 mb-2" />
        <Shimmer className="h-9 w-48" />
      </div>

      {/* Stats row */}
      <div className="px-5 pb-4 flex gap-3">
        <Shimmer className="h-16 flex-1 rounded-xl" />
        <Shimmer className="h-16 flex-1 rounded-xl" />
        <Shimmer className="h-16 flex-1 rounded-xl" />
      </div>

      {/* AI Input */}
      <div className="px-5 pb-4">
        <Shimmer className="h-12 w-full rounded-xl" />
      </div>

      {/* Timeline */}
      <div className="px-5 space-y-3">
        <Shimmer className="h-4 w-28 mb-2" />
        <Shimmer className="h-14 w-full rounded-xl" />
        <Shimmer className="h-14 w-full rounded-xl" />
        <Shimmer className="h-14 w-full rounded-xl" />
      </div>
    </main>
  );
}
