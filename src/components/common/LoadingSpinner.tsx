import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  text?: string;
  fullScreen?: boolean;
  className?: string;
  variant?: "default" | "overlay" | "inline";
}

const spinnerSizes = {
  sm: "w-6 h-6 border-2",
  md: "w-10 h-10 border-[3px]",
  lg: "w-14 h-14 border-[3px]",
  xl: "w-18 h-18 border-4",
};

const textSizes = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};

/**
 * Ultra-lightweight loading spinner
 * Pure CSS - no images, no glow, no blur, instant render
 */
export const LoadingSpinner = ({
  size = "md",
  text,
  fullScreen = false,
  className,
  variant = "default",
}: LoadingSpinnerProps) => {
  const spinnerContent = (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div
        className={cn("rounded-full animate-spin", spinnerSizes[size])}
        style={{
          borderColor: "hsl(var(--primary) / 0.2)",
          borderTopColor: "hsl(var(--primary))",
          animationDuration: "0.6s",
        }}
      />
      {text && (
        <span className={cn("text-muted-foreground font-medium", textSizes[size])}>
          {text}
        </span>
      )}
    </div>
  );

  if (variant === "overlay") {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
        {spinnerContent}
      </div>
    );
  }

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {spinnerContent}
      </div>
    );
  }

  return spinnerContent;
};

// Simple inline loading for buttons etc
export const InlineLoader = ({ className }: { className?: string }) => (
  <div
    className={cn("w-4 h-4 rounded-full border-2 animate-spin", className)}
    style={{
      borderColor: "currentColor",
      borderTopColor: "transparent",
      animationDuration: "0.6s",
    }}
  />
);

export default LoadingSpinner;
