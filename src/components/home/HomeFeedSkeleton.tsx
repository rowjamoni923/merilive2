import { cn } from "@/lib/utils";

export function HostCardSkeleton() {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[24px] bg-slate-100 animate-pulse">
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      <div className="absolute bottom-3 left-3 right-3 space-y-2">
        <div className="h-4 w-2/3 rounded bg-white/20" />
        <div className="h-3 w-1/3 rounded bg-white/20" />
      </div>
    </div>
  );
}

export function HomeFeedSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <HostCardSkeleton key={i} />
      ))}
    </div>
  );
}
