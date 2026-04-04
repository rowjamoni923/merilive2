import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: 
          "bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:brightness-110 rounded-xl border border-white/10",
        destructive: 
          "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:brightness-110 rounded-xl border border-white/10",
        outline: 
          "border-2 border-purple-500/50 bg-transparent text-purple-400 hover:bg-purple-500/10 hover:border-purple-400 hover:text-purple-300 rounded-xl backdrop-blur-sm",
        secondary: 
          "bg-gradient-to-r from-slate-700 to-slate-800 text-white shadow-lg hover:from-slate-600 hover:to-slate-700 rounded-xl border border-white/10",
        ghost: 
          "hover:bg-white/10 hover:text-white rounded-xl text-white/70",
        link: 
          "text-purple-400 underline-offset-4 hover:underline hover:text-purple-300",
        premium:
          "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 text-black font-bold shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:brightness-110 rounded-xl border border-yellow-300/30",
        glow:
          "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] rounded-xl border border-purple-400/30",
      },
      size: {
        default: "h-11 px-6 py-2.5",
        sm: "h-9 rounded-lg px-4 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        xl: "h-14 rounded-2xl px-10 text-lg",
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
