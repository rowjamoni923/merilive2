import type { CSSProperties } from "react";

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
 * User mandate: no fake loading UI and no white/blank loading screen.
 * Kept as a compatibility component for 400+ surfaces, but it deliberately
 * renders nothing. The previous real screen is retained by BlankScreenGuard
 * during navigation instead of painting an alternate placeholder.
 */
export function PageSkeleton(_props: PageSkeletonProps) {
  return null;
}

export default PageSkeleton;
