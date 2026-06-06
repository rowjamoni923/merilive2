/**
 * PKG434 Pass 9 — Skeleton primitive
 *
 * Lightweight skeleton placeholder with smooth shimmer (driven by CSS in
 * index.css: `.pkg434-skel`). Use anywhere a list/card/avatar is loading.
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
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("pkg434-skel", className)}
      {...props}
    />
  )
);
Skeleton.displayName = "Skeleton";

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({ lines = 3, className }) => (
  <div className={cn("flex flex-col gap-2", className)}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
      />
    ))}
  </div>
);

export const SkeletonAvatar: React.FC<{ size?: number; className?: string }> = ({
  size = 48,
  className,
}) => (
  <Skeleton
    className={cn("rounded-full", className)}
    style={{ width: size, height: size }}
  />
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("flex items-center gap-3 p-3", className)}>
    <SkeletonAvatar />
    <div className="flex-1">
      <Skeleton className="h-4 w-2/3 mb-2" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  </div>
);

export default Skeleton;
