import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Native-feel Textarea. Defaults `enterKeyHint="enter"` so the Android keyboard
 * shows a real ↵ Enter (newline) key instead of "Done" closing the keyboard
 * mid-sentence. Caller can always override — Quick-Send composers usually pass
 * `enterKeyHint="send"` themselves.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, enterKeyHint, ...props }, ref) => {
    return (
      <textarea
        enterKeyHint={enterKeyHint ?? "enter"}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-6 md:text-sm md:leading-5 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
