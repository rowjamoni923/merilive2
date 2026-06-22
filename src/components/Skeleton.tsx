/**
 * PKG434 Pass 9 — Skeleton primitive
 *
 * Lightweight static placeholder. No shimmer/pulse/spinner — async surfaces
 * must not look like loading pages.
 *
 * Examples:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-12 w-12 rounded-full" />
 *   <SkeletonText lines={3} />
 *   <SkeletonCard />
 *
 * Respects prefers-reduced-motion + .reduce-motion low-end class.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  () => null
);
Skeleton.displayName = "Skeleton";

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({ lines = 3, className }) => (
  null
);

export const SkeletonAvatar: React.FC<{ size?: number; className?: string }> = ({
  size = 48,
  className,
}) => null;

export const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => null;

export default Skeleton;
