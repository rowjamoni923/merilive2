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

export function PremiumSpinner({
  className,
}: PremiumSpinnerProps) {
  return <span className={cn("inline-block h-0 w-0 overflow-hidden", className)} aria-hidden="true" />;
}

/**
 * Full-screen premium loader — use as a Suspense fallback or initial app loader.
 */
export function PremiumSpinnerScreen({
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-[40vh] w-full bg-background px-6",
        className
      )}
      data-page-root="instant-static-status"
    />
  );
}

export default PremiumSpinner;
