import { useState, MouseEvent } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CopyableUidProps {
  value: string | number | null | undefined;
  /** Label prefix, default "UID". Pass "" to render just the value. */
  label?: string;
  /** Fallback text when value is empty. Default "—". */
  fallback?: string;
  className?: string;
  /** Hide the icon (still copies on click). */
  hideIcon?: boolean;
}

/**
 * Click-to-copy inline UID display.
 * Use everywhere an admin sees a UID/identifier so they can click to copy.
 */
export const CopyableUid = ({
  value,
  label = "UID",
  fallback = "—",
  className,
  hideIcon = false,
}: CopyableUidProps) => {
  const [copied, setCopied] = useState(false);
  const str = value === null || value === undefined || value === "" ? "" : String(value);
  const display = str || fallback;
  const prefix = label ? `${label}: ` : "";

  const handleCopy = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!str) {
      toast.error(`No ${label || "value"} to copy`);
      return;
    }
    try {
      await navigator.clipboard.writeText(str);
      setCopied(true);
      toast.success(`${label || "Value"} copied: ${str}`);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = str;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        toast.success(`${label || "Value"} copied`);
        setTimeout(() => setCopied(false), 1400);
      } catch {
        toast.error("Copy failed");
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={str ? `Click to copy ${label || "value"}: ${str}` : "Nothing to copy"}
      className={cn(
        "inline-flex items-center gap-1 cursor-pointer select-none rounded px-1 -mx-1 py-0 transition-colors hover:bg-amber-500/10 active:bg-amber-500/20 disabled:opacity-50",
        "font-mono",
        className,
      )}
      disabled={!str}
    >
      <span>{prefix}{display}</span>
      {!hideIcon && str && (
        copied
          ? <Check className="w-3 h-3 opacity-80 text-emerald-400 flex-shrink-0" />
          : <Copy className="w-3 h-3 opacity-50 group-hover:opacity-100 flex-shrink-0" />
      )}
    </button>
  );
};

export default CopyableUid;
