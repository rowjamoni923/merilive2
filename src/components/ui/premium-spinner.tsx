import { cn } from "@/lib/utils";

/**
 * Premium Spinner — luxurious dual-ring loader with gradient shimmer.
 *
 * Drop-in replacement for the boring border-spin loaders sprinkled across the
 * app. Uses brand violet/fuchsia gradient with a subtle pulse glow.
 *
 * Sizes: sm (16px) | md (24px) | lg (40px) | xl (64px)
 *
 * Usage:
 *   <PremiumSpinner />                  // default md
 *   <PremiumSpinner size="lg" />        // larger
 *   <PremiumSpinner label="Loading…" /> // with label below
 */

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
  size = "md",
  className,
  label,
  labelClassName,
  hideCore = false,
}: PremiumSpinnerProps) {
  const px = SIZE_PX[size];
  const stroke = STROKE[size];
  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Show ~70% of the ring as the spinning arc, ~30% as gap
  const dash = circumference * 0.7;
  const gap = circumference * 0.3;

  return (
    <div className={cn("inline-flex flex-col items-center justify-center gap-2.5", className)}>
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: px, height: px }}
        role="status"
        aria-live="polite"
        aria-label={label || "Loading"}
      >
        {/* Soft glow halo */}
        <span
          className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500/40 via-fuchsia-500/30 to-pink-500/40 blur-md opacity-70 animate-pulse"
          aria-hidden
        />

        {/* Faint background ring */}
        <svg
          width={px}
          height={px}
          viewBox={`0 0 ${px} ${px}`}
          className="absolute inset-0"
          aria-hidden
        >
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-white/[0.08] dark:stroke-white/[0.06]"
          />
        </svg>

        {/* Spinning gradient arc */}
        <svg
          width={px}
          height={px}
          viewBox={`0 0 ${px} ${px}`}
          className="relative animate-spin"
          style={{ animationDuration: "0.9s" }}
          aria-hidden
        >
          <defs>
            <linearGradient id={`premium-spinner-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(262 83% 65%)" />
              <stop offset="50%" stopColor="hsl(292 84% 60%)" />
              <stop offset="100%" stopColor="hsl(330 81% 60%)" />
            </linearGradient>
          </defs>
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke={`url(#premium-spinner-${size})`}
            strokeDasharray={`${dash} ${gap}`}
            transform={`rotate(-90 ${px / 2} ${px / 2})`}
          />
        </svg>

        {/* Inner pulsing core dot */}
        {!hideCore && size !== "sm" && (
          <span
            className="absolute rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 shadow-[0_0_12px_rgba(168,85,247,0.6)] animate-pulse"
            style={{
              width: Math.max(4, px * 0.18),
              height: Math.max(4, px * 0.18),
            }}
            aria-hidden
          />
        )}
      </div>

      {label && (
        <span
          className={cn(
            "text-xs font-medium tracking-wide animate-pulse",
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
