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

function CategorySkeleton({ delay }: { delay: number }) {
  return (
    <div
      className="bg-card border border-border/50 rounded-xl overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
        <Shimmer className="w-2.5 h-2.5 rounded-full" />
        <Shimmer className="h-4 w-24" />
        <div className="flex-1" />
        <Shimmer className="h-3 w-12" />
      </div>
      <div className="space-y-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-t border-border/30 first:border-t-0">
            <Shimmer className="w-[18px] h-[18px] rounded-full" />
            <Shimmer className="h-4 flex-1" />
            <Shimmer className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TodosLoading() {
  return (
    <main className="safe-bottom pb-8">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <Shimmer className="h-3 w-16 mb-2" />
        <Shimmer className="h-9 w-24" />
      </div>

      {/* Category cards */}
      <div className="px-5 mt-4 space-y-4">
        <CategorySkeleton delay={0} />
        <CategorySkeleton delay={100} />
      </div>
    </main>
  );
}
