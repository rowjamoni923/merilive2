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
    <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-yellow-50 p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`shrink-0 grid place-items-center w-10 h-10 rounded-xl ${
              listed
                ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                : "bg-gradient-to-br from-slate-300 to-slate-500 text-white"
            }`}
          >
            {listed ? (
              <Eye className="w-5 h-5" />
            ) : (
              <EyeOff className="w-5 h-5" />
            )}
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
        <div className="shrink-0 flex items-center gap-2">
          {saving && (
            <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
          )}
          <Switch
            checked={listed}
            onCheckedChange={handleToggle}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
}
