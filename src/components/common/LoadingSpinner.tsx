import { cn } from "@/lib/utils";
import { PremiumSpinner, type PremiumSpinnerSize } from "@/components/ui/premium-spinner";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  text?: string;
  fullScreen?: boolean;
  className?: string;
  variant?: "default" | "overlay" | "inline";
}

const SIZE_MAP: Record<NonNullable<LoadingSpinnerProps["size"]>, PremiumSpinnerSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
};

/**
 * App-wide premium loader. Backwards-compatible API — every page using
 * <LoadingSpinner /> automatically gets the luxurious dual-ring design.
 */
export const LoadingSpinner = ({
  size = "md",
  text,
  fullScreen = false,
  className,
  variant = "default",
}: LoadingSpinnerProps) => {
  const spinner = (
    <PremiumSpinner size={SIZE_MAP[size]} label={text} className={className} />
  );

  if (variant === "overlay") {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
        {spinner}
      </div>
    );
  }

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {spinner}
      </div>
    );
  }

  return spinner;
};

/** Tiny inline loader for buttons. Inherits current text color. */
export const InlineLoader = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin align-[-2px]",
      className
    )}
    style={{ animationDuration: "0.7s" }}
    aria-hidden
  />
);

export default LoadingSpinner;

