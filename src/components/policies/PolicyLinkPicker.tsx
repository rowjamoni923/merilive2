import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link2, Check } from "lucide-react";
import { POLICY_LEVELS, policyPublicUrl, type PolicyLevelCode } from "@/lib/policyLevels";
import { toast } from "sonner";

interface Props {
  /** When provided, the chosen link is appended to the current text via this setter. */
  onInsert?: (snippet: string) => void;
  /** "html" inserts an anchor tag, "plain" inserts the raw URL. Default: plain. */
  format?: "html" | "plain";
  size?: "sm" | "default";
  label?: string;
  className?: string;
}

export default function PolicyLinkPicker({
  onInsert,
  format = "plain",
  size = "sm",
  label = "Attach Policy",
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const handlePick = async (code: PolicyLevelCode, displayName: string) => {
    const url = policyPublicUrl(code);
    const snippet =
      format === "html"
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${displayName} — Policy</a>`
        : `${displayName} — Policy: ${url}`;

    if (onInsert) {
      onInsert(snippet);
    } else {
      try {
        await navigator.clipboard.writeText(snippet);
        toast.success("Policy link copied");
      } catch {
        toast.error("Could not copy");
      }
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          className={className}
        >
          <Link2 className="w-3.5 h-3.5 mr-1.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 bg-popover border-border/40" align="end">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
          Insert level policy link
        </p>
        <div className="grid gap-1">
          {POLICY_LEVELS.map((lvl) => (
            <button
              key={lvl.code}
              type="button"
              onClick={() => handlePick(lvl.code, lvl.shortName)}
              className="flex items-center justify-between gap-2 px-2 py-2 rounded-md hover:bg-accent text-left transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${lvl.badge}`}
                >
                  {lvl.code}
                </span>
                <span className="text-sm truncate">{lvl.shortName}</span>
              </span>
              <Check className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
