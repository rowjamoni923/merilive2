import type { CSSProperties } from "react";

interface PageSkeletonProps {
  className?: string;
  style?: CSSProperties;
  headerClassName?: string;
  rows?: number;
  hero?: boolean;
  tabs?: boolean;
}

/**
 * Invisible placeholder surface kept only to satisfy boot/blank-screen
 * detection (`data-page-root`). It deliberately renders NO fake UI so the
 * real page never "double-paints" over a different-looking shell.
 */
export function PageSkeleton({
  className = "fixed inset-0 bg-background",
  style,
}: PageSkeletonProps) {
  return (
    <div
      className={className}
      style={style}
      aria-hidden="true"
      data-page-root="instant-ready-shell"
    />
  );
}

export default PageSkeleton;
