import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Native-Android-feel Input.
 * Auto-derives mobile keyboard hints (`inputMode`, `enterKeyHint`, `autoCapitalize`,
 * `autoCorrect`, `spellCheck`, `autoComplete`) from the `type` prop so every input
 * across the app shows the right keyboard (email / tel / numeric / search / etc.)
 * without each call-site repeating the same attributes.
 *
 * Any prop the caller passes ALWAYS wins — defaults only fill the gaps.
 * Pure presentation: zero behavior change for desktop browsers; massive feel
 * upgrade on mobile (correct keyboard, no spurious auto-cap, SMS one-time-code
 * autofill, Enter-key label, etc.).
 */
type InputType = React.ComponentProps<"input">["type"];

function deriveNativeHints(type: InputType): Partial<React.ComponentProps<"input">> {
  switch (type) {
    case "email":
      return {
        inputMode: "email",
        autoComplete: "email",
        autoCapitalize: "off",
        autoCorrect: "off",
        spellCheck: false,
        enterKeyHint: "next",
      };
    case "tel":
      return {
      };
    case "url":
      return {
      };
    case "search":
      return {
      };
    case "number":
      return {
      };
    case "password":
      return {
      };
    default:
      return {};
  }
}

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const hints = React.useMemo(() => deriveNativeHints(type), [type]);
    return (
      <input
        type={type}
        // Defaults first, caller props override — exactly the precedence we want.
        {...hints}
        className={cn(
          // Premium luxury input: glass surface, subtle border, gold focus ring, larger touch target
          // Standardized typography: 16px/24px mobile (no iOS zoom), 14px/20px md+
          "flex h-12 w-full rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2.5 text-base leading-6 md:text-sm md:leading-5 text-foreground",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.25)]",
          "ring-offset-background transition-all duration-200",
          "placeholder:text-muted-foreground/60",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "hover:border-white/20 hover:bg-white/[0.07]",
          "focus-visible:outline-none focus-visible:border-amber-400/50 focus-visible:ring-2 focus-visible:ring-amber-400/30 focus-visible:ring-offset-0 focus-visible:bg-white/[0.08]",
          "disabled:cursor-not-allowed disabled:opacity-50",
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
