import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface PageSkeletonProps {
  className?: string;
  style?: CSSProperties;
  headerClassName?: string;
  rows?: number;
  hero?: boolean;
  tabs?: boolean;
}

/**
 * Textless, non-animated route surface. It prevents white/empty screens while
 * avoiding fake labels, fake buttons, spinners, or shimmer that can double-paint
 * over the real page.
 */
export function PageSkeleton({
  className = "min-h-screen bg-background",
  style,
  rows = 5,
  hero = false,
  tabs = false,
}: PageSkeletonProps) {
  return (
    <div
      className={cn("w-full overflow-hidden", className)}
      style={style}
      aria-hidden="true"
      data-page-root="instant-ready-shell"
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-24 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="h-10 w-10 rounded-full bg-muted/80" />
          <div className="h-8 flex-1 rounded-full bg-muted/60" />
          <div className="h-10 w-10 rounded-full bg-muted/80" />
        </div>

        {tabs ? (
          <div className="mb-4 grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-9 rounded-full bg-muted/70" />
            ))}
          </div>
        ) : null}

        {hero ? <div className="mb-5 aspect-[16/7] w-full rounded-2xl bg-muted/70" /> : null}

        <div className="space-y-3">
          {Array.from({ length: Math.max(1, rows) }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-2xl bg-card/80 p-3 shadow-sm ring-1 ring-border/50">
              <div className="h-12 w-12 shrink-0 rounded-full bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded-full bg-muted" />
                <div className="h-3 w-full rounded-full bg-muted/70" />
              </div>
              <div className="h-8 w-8 shrink-0 rounded-full bg-muted/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PageSkeleton;
