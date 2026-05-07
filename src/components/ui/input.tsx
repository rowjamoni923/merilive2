import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Premium luxury input: glass surface, subtle border, gold focus ring, larger touch target
          "flex h-12 w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2.5 text-base text-foreground",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.25)]",
          "ring-offset-background transition-all duration-200",
          "placeholder:text-muted-foreground/60",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "hover:border-white/20 hover:bg-white/[0.07]",
          "focus-visible:outline-none focus-visible:border-amber-400/50 focus-visible:ring-2 focus-visible:ring-amber-400/30 focus-visible:ring-offset-0 focus-visible:bg-white/[0.08]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
