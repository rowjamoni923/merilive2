import type { CSSProperties } from "react";

interface PageSkeletonProps {
  /** Optional gradient/background class applied to the outer shell. */
  className?: string;
  /** Optional inline style on the outer shell (e.g. gradient backgrounds). */
  style?: CSSProperties;
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
 * Real-looking static app surface used while async data settles.
 * It must never look like a loading/skeleton page.
 */
export function PageSkeleton({
  className = "fixed inset-0 flex flex-col bg-background overflow-hidden",
  style,
  headerClassName = "bg-card border-b border-border",
  rows = 6,
  hero = true,
  tabs = false,
}: PageSkeletonProps) {
  return (
    <div className={className} style={style} aria-busy="false" data-page-root="instant-ready-shell">
      <div className={`flex-shrink-0 ${headerClassName}`}>
        <div className="flex items-center gap-3 px-4 py-3 safe-area-top">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-sm font-black text-white">M</div>
          <div className="text-lg font-black tracking-normal text-foreground">meriLIVE</div>
          <div className="ml-auto flex items-center gap-2 text-lg"><span>🔍</span><span>💬</span></div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-4 py-4 space-y-4">
        {hero ? (
          <div className="rounded-2xl bg-gradient-to-r from-pink-500 to-amber-400 p-4 text-white shadow-sm">
            <div className="text-xl font-black tracking-normal">Live now</div>
            <div className="text-sm font-semibold text-white/85">Discover hosts and rooms instantly</div>
          </div>
        ) : null}
        {tabs ? (
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 w-20 flex-shrink-0 rounded-full bg-card px-3 py-2 text-center text-xs font-bold text-muted-foreground shadow-sm">{['Live','Party','Chat','Gift','VIP'][i]}</div>
            ))}
          </div>
        ) : null}
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border"
          >
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-base">{['🎥','🎉','💬','🎁','👤','⭐'][i % 6]}</div>
            <div className="flex-1 space-y-2">
              <div className="text-sm font-bold text-foreground">{['Live room','Party room','Message','Gift store','Creator','Rewards'][i % 6]}</div>
              <div className="text-xs text-muted-foreground">Ready</div>
            </div>
            <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Open</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PageSkeleton;
