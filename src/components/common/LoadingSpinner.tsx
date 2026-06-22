import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  text?: string;
  fullScreen?: boolean;
  className?: string;
  variant?: "default" | "overlay" | "inline";
}

/**
 * App-wide loading placeholder kept for backward compatibility.
 * User mandate: no visible spinners/loading pages. Async work must keep the
 * current painted surface; this component renders only optional static text.
 */
export const LoadingSpinner = ({
  fullScreen = false,
  variant = "default",
}: LoadingSpinnerProps) => {
  const staticStatus = null;

  if (variant === "overlay") {
    return staticStatus;
  }

  if (fullScreen) {
    return <div className="min-h-screen bg-background" data-page-root="instant-static-status">{staticStatus}</div>;
  }

  return staticStatus;
};

/** Tiny inline loader replacement for buttons: no visual spinner. */
export const InlineLoader = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-block w-0 h-0 overflow-hidden align-[-2px]",
      className
    )}
    aria-hidden
  />
);

export default LoadingSpinner;

