import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface PageSkeletonProps {
  className?: string;
  style?: CSSProperties;
  /** Deprecated — kept for API compatibility. No fake rows/hero/tabs are rendered. */
  headerClassName?: string;
  rows?: number;
  hero?: boolean;
  tabs?: boolean;
}

/**
 * Plain painted surface. NO fake header, NO fake rows, NO fake tabs, NO shimmer.
 * Just a solid background that matches the app so the real UI can paint over it
 * without any "double UI" artifact.
 */
export function PageSkeleton({ className = "min-h-screen bg-background", style }: PageSkeletonProps) {
  return (
    <div
      className={cn("w-full", className)}
      style={style}
      aria-hidden="true"
      data-page-root="instant-ready-shell"
    />
  );
}

export default PageSkeleton;
