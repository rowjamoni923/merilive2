import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pkg420 — Unified premium close/exit button used across the app.
 *
 * Features:
 * - 36px tap target (Apple HIG minimum) with CSS press/hover feedback
 * - Built-in double-fire guard: disables itself for `lockMs` after first click
 *   so leave-room / end-stream RPCs never fire twice from a frantic double-tap
 * - Three visual variants: `dark` (default, on video/live), `glass` (on light
 *   surfaces / dialogs), and `solid` (high-contrast on busy backgrounds)
 * - Always requires `aria-label` for screen readers
 */

type Variant = "dark" | "glass" | "solid";

interface PremiumCloseButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  onClick?: (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => void | Promise<void>;
  variant?: Variant;
  size?: number; // pixel size, default 36
  iconSize?: number; // pixel size of X icon, default 16
  lockMs?: number; // disable window after click, default 700ms
  "aria-label": string;
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  dark: {
    background:
      "radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.18) 0%, rgba(40,30,55,0.85) 45%, rgba(10,8,20,0.95) 100%)",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow:
      "0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 4px rgba(0,0,0,0.3)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  },
  glass: {
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.85), rgba(245,245,250,0.9))",
    boxShadow:
      "0 4px 14px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
  },
  solid: {
    background: "linear-gradient(135deg, rgba(0,0,0,0.7), rgba(20,15,35,0.8))",
    boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
  },
};

export const PremiumCloseButton = React.forwardRef<
  HTMLButtonElement,
  PremiumCloseButtonProps
>(
  (
    {
      onClick,
      variant = "dark",
      size = 36,
      iconSize = 16,
      lockMs = 700,
      className,
      style,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const [busy, setBusy] = React.useState(false);
    const busyRef = React.useRef(false);
    const timerRef = React.useRef<number | null>(null);

    React.useEffect(
      () => () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      },
      [],
    );

    const handleClick = React.useCallback(
      async (e: React.MouseEvent<HTMLButtonElement>) => {
        if (busyRef.current || disabled) return;
        busyRef.current = true;
        setBusy(true);
        try {
          await onClick?.(e);
        } finally {
          timerRef.current = window.setTimeout(() => {
            busyRef.current = false;
            setBusy(false);
            timerRef.current = null;
          }, lockMs);
        }
      },
      [onClick, lockMs, disabled],
    );

    const isGlass = variant === "glass";
    const iconColor = isGlass ? "text-slate-700" : "text-white";

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={cn(
          "relative rounded-full flex items-center justify-center overflow-hidden",
          "transition-transform duration-150 ease-out hover:scale-105 active:scale-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-0",
          "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100",
          className,
        )}
        style={{
          width: size,
          height: size,
          ...variantStyles[variant],
          ...style,
        }}
        {...rest}
      >
        {!isGlass && (
          <span
            aria-hidden
            className="absolute inset-x-1 top-0.5 h-2 rounded-full pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.32), transparent)",
            }}
          />
        )}
        <X
          className={cn("relative z-10", iconColor)}
          style={{ width: iconSize, height: iconSize }}
          strokeWidth={2.4}
        />
        <span className="sr-only">{rest["aria-label"]}</span>
      </button>
    );
  },
);
PremiumCloseButton.displayName = "PremiumCloseButton";

export default PremiumCloseButton;
