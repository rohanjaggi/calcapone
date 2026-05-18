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

export default function CalendarLoading() {
  return (
    <main className="safe-bottom pb-8">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <Shimmer className="h-3 w-20 mb-2" />
        <Shimmer className="h-9 w-32" />
      </div>

      {/* Month nav */}
      <div className="px-5 mt-4 flex items-center justify-between">
        <Shimmer className="h-5 w-5 rounded-full" />
        <Shimmer className="h-5 w-32" />
        <Shimmer className="h-5 w-5 rounded-full" />
      </div>

      {/* Weekday headers */}
      <div className="px-5 mt-4 grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Shimmer key={i} className="h-3 w-6 mx-auto" />
        ))}
      </div>

      {/* Calendar grid */}
      <div className="px-5 mt-2 grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <Shimmer key={i} className="h-9 w-9 rounded-full mx-auto" />
        ))}
      </div>

      {/* Events for day */}
      <div className="px-5 mt-6 space-y-3">
        <Shimmer className="h-4 w-36" />
        <Shimmer className="h-14 w-full rounded-xl" />
        <Shimmer className="h-14 w-full rounded-xl" />
      </div>
    </main>
  );
}
