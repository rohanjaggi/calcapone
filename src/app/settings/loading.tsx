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

function SettingsCardSkeleton() {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-5 space-y-4">
      <Shimmer className="h-5 w-32" />
      <Shimmer className="h-10 w-full rounded-xl" />
      <Shimmer className="h-10 w-full rounded-xl" />
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <main className="safe-bottom pb-8">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <Shimmer className="h-3 w-24 mb-2" />
        <Shimmer className="h-9 w-28" />
      </div>

      {/* Settings cards */}
      <div className="px-5 mt-4 space-y-4">
        <SettingsCardSkeleton />
        <SettingsCardSkeleton />
        <SettingsCardSkeleton />
      </div>
    </main>
  );
}
