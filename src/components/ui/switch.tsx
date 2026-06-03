import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * Premium Switch — Apple/iOS-class toggle.
 * Glossy gradient track, 3D thumb with inner highlight, tactile active scale,
 * soft glow when checked, accessible focus ring. Used app-wide
 * (Settings, Notifications, Privacy, Profile go-live, Live host controls, etc.).
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Base track
      "peer relative inline-flex h-7 w-[52px] shrink-0 cursor-pointer items-center rounded-full",
      "border border-black/5 transition-all duration-300 ease-out",
      // Unchecked — soft pearl track with inset depth
      "data-[state=unchecked]:bg-gradient-to-b data-[state=unchecked]:from-slate-200 data-[state=unchecked]:to-slate-300",
      "data-[state=unchecked]:shadow-[inset_0_2px_4px_rgba(0,0,0,0.12),inset_0_-1px_0_rgba(255,255,255,0.6)]",
      // Checked — luminous brand gradient with soft outer glow
      "data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-500 data-[state=checked]:via-pink-500 data-[state=checked]:to-purple-600",
      "data-[state=checked]:shadow-[0_0_0_1px_rgba(168,85,247,0.35),0_6px_18px_-6px_rgba(236,72,153,0.55),inset_0_1px_0_rgba(255,255,255,0.25)]",
      "data-[state=checked]:border-transparent",
      // Focus / disabled
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Press feedback
      "active:scale-[0.97]",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Glossy 3D thumb
        "pointer-events-none block h-6 w-6 rounded-full",
        "bg-gradient-to-b from-white to-slate-50",
        "shadow-[0_2px_4px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(0,0,0,0.05)]",
        "ring-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        "data-[state=checked]:translate-x-[24px] data-[state=unchecked]:translate-x-[2px]",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
