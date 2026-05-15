import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm leading-5 font-semibold ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 disabled:saturate-[0.6] disabled:shadow-none disabled:brightness-95 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white shadow-[0_8px_24px_-8px_rgba(168,85,247,0.45),inset_0_1px_0_rgba(255,255,255,0.18)] hover:shadow-[0_12px_28px_-8px_rgba(168,85,247,0.6),inset_0_1px_0_rgba(255,255,255,0.22)] hover:brightness-110 focus-visible:ring-purple-400/70 rounded-xl border border-white/15",
        destructive:
          "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-[0_8px_24px_-8px_rgba(244,63,94,0.45),inset_0_1px_0_rgba(255,255,255,0.18)] hover:shadow-[0_12px_28px_-8px_rgba(244,63,94,0.6)] hover:brightness-110 focus-visible:ring-rose-400/70 rounded-xl border border-white/15",
        outline:
          "border-2 border-purple-500/50 bg-transparent text-purple-400 hover:bg-purple-500/10 hover:border-purple-400 hover:text-purple-300 hover:shadow-[0_6px_18px_-8px_rgba(168,85,247,0.35)] focus-visible:ring-purple-400/70 focus-visible:border-purple-400 rounded-xl backdrop-blur-sm",
        secondary:
          "bg-gradient-to-r from-slate-700 to-slate-800 text-white shadow-[0_6px_18px_-6px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] hover:from-slate-600 hover:to-slate-700 hover:shadow-[0_10px_24px_-8px_rgba(15,23,42,0.6),inset_0_1px_0_rgba(255,255,255,0.16)] focus-visible:ring-slate-400/70 rounded-xl border border-white/10",
        ghost:
          "hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:ring-white/40 rounded-xl text-white/70",
        link:
          "text-purple-400 underline-offset-4 hover:underline hover:text-purple-300 focus-visible:underline focus-visible:text-purple-300 focus-visible:ring-purple-400/60 rounded",
        premium:
          "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 text-black font-bold shadow-[0_8px_24px_-8px_rgba(245,158,11,0.5),inset_0_1px_0_rgba(255,255,255,0.45)] hover:shadow-[0_12px_28px_-8px_rgba(245,158,11,0.7)] hover:brightness-110 focus-visible:ring-amber-400/80 rounded-xl border border-yellow-300/40",
        glow:
          "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.4),inset_0_1px_0_rgba(255,255,255,0.18)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] focus-visible:ring-pink-400/70 focus-visible:shadow-[0_0_30px_rgba(236,72,153,0.6)] rounded-xl border border-purple-400/30",
        // ───── New premium tier (Plan Phase 1) ─────
        luxury:
          "bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 text-amber-950 font-bold tracking-wide rounded-xl border border-amber-300/60 shadow-[0_10px_28px_-10px_rgba(217,119,6,0.55),inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(0,0,0,0.15)] hover:from-amber-200 hover:via-amber-400 hover:to-amber-600 hover:shadow-[0_14px_32px_-10px_rgba(217,119,6,0.7),inset_0_1px_0_rgba(255,255,255,0.6)] focus-visible:ring-amber-300/80 focus-visible:border-amber-200",
        glass:
          "bg-white/10 text-white font-semibold rounded-xl border border-white/25 backdrop-blur-md shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-white/15 hover:border-white/40 focus-visible:bg-white/15 focus-visible:ring-white/50 focus-visible:border-white/50",
        "outline-premium":
          "bg-transparent text-foreground font-semibold rounded-xl border-2 border-amber-400/60 hover:border-amber-400 hover:bg-amber-400/10 hover:text-amber-100 hover:shadow-[0_6px_18px_-8px_rgba(245,158,11,0.4)] focus-visible:border-amber-300 focus-visible:bg-amber-400/10 focus-visible:ring-amber-300/70 transition-colors",
      },
      size: {
        default: "h-11 px-6 py-2.5",
        sm: "h-9 rounded-lg px-4 text-xs leading-4",
        lg: "h-12 rounded-xl px-8 text-base leading-6",
        xl: "h-14 rounded-2xl px-10 text-lg leading-7",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const clickGuardRef = React.useRef(false);

    const guardedOnClick = React.useMemo(() => {
      if (!onClick || asChild) return onClick;
      return (e: React.MouseEvent<HTMLButtonElement>) => {
        if (clickGuardRef.current) return;
        clickGuardRef.current = true;
        try {
          const result = onClick(e) as unknown;
          if (result && typeof result === 'object' && typeof (result as Promise<unknown>).finally === 'function') {
            (result as Promise<unknown>).finally(() => { clickGuardRef.current = false; });
          } else {
            requestAnimationFrame(() => { clickGuardRef.current = false; });
          }
        } catch {
          clickGuardRef.current = false;
        }
      };
    }, [onClick, asChild]);

    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} onClick={guardedOnClick} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
