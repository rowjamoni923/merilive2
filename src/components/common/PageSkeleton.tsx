import { Skeleton as SkeletonPrim } from "@/components/Skeleton";

interface PageSkeletonProps {
  /** Optional gradient/background class applied to the outer shell. */
  className?: string;
  /** Optional gradient header class. Defaults to a neutral muted bar. */
  headerClassName?: string;
  /** Number of list-row skeletons to render. */
  rows?: number;
  /** Show a hero card above the list rows. */
  hero?: boolean;
  /** Show a pill-tab strip under the header. */
  tabs?: boolean;
}

/**
 * Full-screen shimmer skeleton used as a cold-load placeholder for
 * heavy pages while their data is loading. Pure presentational.
 */
export function PageSkeleton({
  className = "fixed inset-0 flex flex-col bg-background overflow-hidden",
  headerClassName = "bg-card border-b border-border",
  rows = 6,
  hero = true,
  tabs = false,
}: PageSkeletonProps) {
  return (
    <div className={className} aria-busy="true">
      <div className={`flex-shrink-0 ${headerClassName}`}>
        <div className="flex items-center gap-3 px-4 py-3 safe-area-top">
          <SkeletonPrim className="w-9 h-9 rounded-full bg-white/30" />
          <SkeletonPrim className="h-5 w-32 bg-white/30" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-4 py-4 space-y-4">
        {hero ? <SkeletonPrim className="h-32 w-full rounded-2xl" /> : null}
        {tabs ? (
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonPrim key={i} className="h-9 w-20 rounded-full flex-shrink-0" />
            ))}
          </div>
        ) : null}
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border"
          >
            <SkeletonPrim className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <SkeletonPrim className="h-4 w-1/3" />
              <SkeletonPrim className="h-3 w-1/2" />
            </div>
            <SkeletonPrim className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default PageSkeleton;
