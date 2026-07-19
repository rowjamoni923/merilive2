import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ArrowRight, FileSearch } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Pkg82 — Admin Audit ID Search
 *
 * Lets an admin paste an `AUDIT:VT-*` code (copied from a user-facing
 * Diamond Store empty-state diagnostic card) and jump straight to the
 * relevant admin diagnostic section. Each target page can read
 * `?audit=<ID>` from the URL and scroll/highlight the matching section.
 */

type AuditTarget = {
  id: string;
  label: string;
  description: string;
  path: string; // includes ?audit=... + #anchor
};

const AUDIT_TARGETS: AuditTarget[] = [
  {
    id: "VT-NO-DATA",
    label: "No Verified Trader data",
    description: "topup_helpers table empty or all rows hidden",
    path: "/admin/diamond-traders?audit=VT-NO-DATA#audit-no-data",
  },
  {
    id: "VT-COUNTRY-MISMATCH",
    label: "Country mismatch",
    description: "No traders match the user's country code",
    path: "/admin/diamond-traders?audit=VT-COUNTRY-MISMATCH#audit-country",
  },
  {
    id: "VT-INACTIVE-UNVERIFIED",
    label: "Inactive / unverified",
    description: "Traders exist but is_active/is_verified are false",
    path: "/admin/diamond-traders?audit=VT-INACTIVE-UNVERIFIED#audit-status",
  },
  {
    id: "VT-WALLET-THRESHOLD",
    label: "Wallet below tier-min",
    description: "wallet_balance lower than topup_trader_tier_min_wallet",
    path: "/admin/pricing-hub?tab=helper&audit=VT-WALLET-THRESHOLD#audit-wallet",
  },
  {
    id: "VT-FILTER-SUMMARY",
    label: "Combined filter summary",
    description: "Overview of every applied filter for the user",
    path: "/admin/diamond-traders?audit=VT-FILTER-SUMMARY#audit-summary",
  },
];

const normalize = (raw: string) =>
  raw
    .trim()
    .toUpperCase()
    .replace(/^AUDIT\s*[:\-]\s*/i, "")
    .replace(/\s+/g, "");

export const AuditIdSearch = ({ compact = false }: { compact?: boolean }) => {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = normalize(value);
    if (!q) return AUDIT_TARGETS;
    return AUDIT_TARGETS.filter(
      (t) =>
        t.id.includes(q) ||
        t.label.toUpperCase().includes(q) ||
        t.description.toUpperCase().includes(q),
    );
  }, [value]);

  const jump = (target: AuditTarget) => {
    setOpen(false);
    setValue("");
    navigate(target.path);
    toast({
      title: `Opening ${target.id}`,
      description: target.label,
    });
  };

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Shift+A to focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = normalize(value);
    if (!q) return;
    // Exact ID match → jump immediately
    const exact = AUDIT_TARGETS.find((t) => t.id === q);
    if (exact) return jump(exact);
    // Single fuzzy match → jump
    if (matches.length === 1) return jump(matches[0]);
    // Otherwise leave dropdown open
    setOpen(true);
    if (matches.length === 0) {
      toast({
        title: "No matching audit ID",
        description: `“${value}” doesn't match any known diagnostic.`,
        variant: "destructive",
      });
    }
  };

  return (
    <div ref={wrapRef} className={cn("relative", compact ? "w-full" : "w-full max-w-md")}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <FileSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/70" />
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Audit ID… e.g. VT-WALLET-THRESHOLD"
            className="pl-9 pr-9 h-9 bg-amber-500/[0.04] border-amber-500/20 text-white text-sm placeholder:text-amber-200/40 focus:bg-amber-500/[0.06] focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 rounded-xl font-mono"
            aria-label="Search by audit ID"
          />
          {value ? (
            <button
              type="button"
              onClick={() => {
                setValue("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              aria-label="Clear"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          ) : (
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-amber-400/20 bg-amber-500/10 text-[10px] text-amber-200/70 font-mono">
              ⇧A
            </kbd>
          )}
        </div>
      </form>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 mt-1.5 w-full rounded-xl border border-amber-400/20 bg-[#0c0c14]/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-white/[0.04] flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/70">
                Diagnostic audit IDs
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {matches.length}/{AUDIT_TARGETS.length}
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {matches.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-500">
                  No matching audit ID
                </div>
              ) : (
                matches.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => jump(t)}
                    className="w-full text-left px-3 py-2 hover:bg-amber-500/[0.06] focus:bg-amber-500/[0.08] focus:outline-none transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-[11px] font-mono font-bold text-amber-300">
                            AUDIT:{t.id}
                          </code>
                        </div>
                        <div className="text-xs text-white/90 mt-0.5 truncate">
                          {t.label}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {t.description}
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-300 mt-1 shrink-0" />
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="px-3 py-1.5 border-t border-white/[0.04] text-[10px] text-slate-600 flex items-center gap-1.5">
              <Search className="w-3 h-3" />
              Paste a code copied from a Diamond Store diagnostic card.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AuditIdSearch;
