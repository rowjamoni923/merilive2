import { cn } from "@/lib/utils";

/** Static status primitive. Kept under the old name so legacy imports do not
 * show any spinner/loading animation after the no-loading UX mandate. */

export type PremiumSpinnerSize = "sm" | "md" | "lg" | "xl";

interface PremiumSpinnerProps {
  size?: PremiumSpinnerSize;
  className?: string;
  label?: string;
  /** Tailwind class for the label color. Defaults to text-muted-foreground */
  labelClassName?: string;
  /** Hide the inner core dot (useful for tiny inline spinners) */
  hideCore?: boolean;
}

const SIZE_PX: Record<PremiumSpinnerSize, number> = {
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
};

const STROKE: Record<PremiumSpinnerSize, number> = {
  sm: 2,
  md: 2.5,
  lg: 3,
  xl: 4,
};

export function PremiumSpinner({
  className,
  label,
  labelClassName,
}: PremiumSpinnerProps) {
  return (
    <div className={cn("inline-flex flex-col items-center justify-center", className)} role="status" aria-live="polite">
      {label && (
        <span
          className={cn(
            "text-xs font-medium tracking-wide",
            labelClassName ?? "text-muted-foreground"
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * Full-screen premium loader — use as a Suspense fallback or initial app loader.
 */
export function PremiumSpinnerScreen({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-[40vh] w-full flex items-center justify-center px-6",
        className
      )}
    >
      <PremiumSpinner size="lg" label={label} />
    </div>
  );
}

export default PremiumSpinner;
