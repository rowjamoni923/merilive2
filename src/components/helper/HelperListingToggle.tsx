import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface HelperListingToggleProps {
  helperId: string;
  initialListed: boolean;
  onChange?: (next: boolean) => void;
}

/**
 * Self-service show/hide toggle for L1-L5 traders.
 * Flips `topup_helpers.is_listed`; when OFF, the trader card no longer
 * appears on /recharge Verified Traders. Backend gate
 * (is_approved_topup_trader) is unaffected.
 */
export default function HelperListingToggle({
  helperId,
  initialListed,
  onChange,
}: HelperListingToggleProps) {
  const { toast } = useToast();
  const [listed, setListed] = useState<boolean>(!!initialListed);
  const [saving, setSaving] = useState(false);

  const handleToggle = async (next: boolean) => {
    if (saving) return;
    const prev = listed;
    setListed(next);
    setSaving(true);
    const { error } = await supabase
      .from("topup_helpers")
      .update({ is_listed: next })
      .eq("id", helperId);
    setSaving(false);
    if (error) {
      setListed(prev);
      toast({
        title: "Could not update",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    onChange?.(next);
    toast({
      title: next ? "You are now visible" : "You are now hidden",
      description: next
        ? "Users in your country can see you on the Recharge page."
        : "You no longer appear in the public Verified Traders list.",
    });
  };

  return (
    <div
      className={`relative rounded-2xl border p-3.5 shadow-sm transition-colors ${
        listed
          ? "border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50"
          : "border-slate-200/70 bg-gradient-to-br from-slate-50 via-white to-slate-100"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`shrink-0 grid place-items-center w-10 h-10 rounded-xl shadow-md ${
              listed
                ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                : "bg-gradient-to-br from-slate-400 to-slate-600 text-white"
            }`}
          >
            {listed ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-slate-900 leading-tight">
              Show me on Recharge page
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
              {listed
                ? "Visible to users in your country as a Verified Trader."
                : "Hidden — you will not appear in the Verified Traders list."}
            </p>
          </div>
        </div>

        {/* Premium professional toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={listed}
          disabled={saving}
          onClick={() => handleToggle(!listed)}
          className={`relative shrink-0 inline-flex h-8 w-[68px] items-center rounded-full border transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
            listed
              ? "bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2),0_2px_8px_rgba(16,185,129,0.45)] focus-visible:ring-emerald-400"
              : "bg-gradient-to-r from-slate-300 to-slate-400 border-slate-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] focus-visible:ring-slate-400"
          } ${saving ? "opacity-70 cursor-wait" : "cursor-pointer"}`}
        >
          <span
            className={`absolute text-[10px] font-extrabold tracking-wider transition-opacity ${
              listed ? "left-2 text-white opacity-100" : "left-2 text-transparent opacity-0"
            }`}
          >
            ON
          </span>
          <span
            className={`absolute text-[10px] font-extrabold tracking-wider transition-opacity ${
              !listed ? "right-2 text-white opacity-100" : "right-2 text-transparent opacity-0"
            }`}
          >
            OFF
          </span>
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.8)] transition-transform duration-300 ${
              listed ? "translate-x-[37px]" : "translate-x-1"
            } grid place-items-center`}
          >
            {saving ? (
              <Loader2 className="w-3 h-3 text-slate-500 animate-spin" />
            ) : listed ? (
              <Eye className="w-3 h-3 text-emerald-600" />
            ) : (
              <EyeOff className="w-3 h-3 text-slate-500" />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
