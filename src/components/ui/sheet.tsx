import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-[9998] bg-slate-900/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-[9999] gap-4 bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] backdrop-blur-2xl p-6 shadow-[0_-12px_60px_-8px_rgba(180,140,60,0.25)] border-amber-200/60 transition ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-250 data-[state=open]:duration-350",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b rounded-b-3xl pt-[max(env(safe-area-inset-top),24px)] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t rounded-t-3xl pb-[max(env(safe-area-inset-bottom),24px)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r rounded-r-3xl pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),16px)] pl-[max(env(safe-area-inset-left),0px)] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l rounded-l-3xl pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),16px)] pr-[max(env(safe-area-inset-right),0px)] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = "right", className, children, style, ...props }, ref) => {
    // Keyboard-aware positioning. On-screen keyboard height lives in --kb-h
    // (set by useKeyboardInsets). For bottom sheets we translate the panel
    // upward by --kb-h so its content (composer / form / OTP) stays above the
    // keyboard. For side sheets we just trim max-height so internal scroll
    // areas can reach the focused field. Side='top' is unaffected.
    const kbStyle: React.CSSProperties =
      side === "bottom"
        ? {
            transform: "translateY(calc(var(--kb-h, 0px) * -1))",
            maxHeight: "calc(100dvh - var(--kb-h, 0px) - 16px)",
            transition: "transform 200ms ease-out, max-height 200ms ease-out",
          }
        : side === "left" || side === "right"
          ? {
              maxHeight: "calc(100dvh - var(--kb-h, 0px))",
              transition: "max-height 200ms ease-out",
            }
          : {};
    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={ref}
          className={cn(sheetVariants({ side }), className)}
          style={{ ...kbStyle, ...style }}
          {...props}
        >
          {children}
          <SheetPrimitive.Close
            aria-label="Close panel"
            className="absolute right-3 top-3 z-20 w-9 h-9 rounded-full flex items-center justify-center overflow-hidden transition-transform duration-150 ease-out hover:scale-105 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(245,245,250,0.96))",
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 4px 14px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.95)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <X className="h-4 w-4 text-slate-700" strokeWidth={2.4} />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
