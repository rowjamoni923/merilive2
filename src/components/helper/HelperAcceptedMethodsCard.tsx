import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountryPaymentGateways } from "@/hooks/useCountryPaymentGateways";

interface HelperAcceptedMethodsCardProps {
  helperId: string;
  helperCountryCode?: string | null;
}

interface AcceptedRow {
  id: string;
  gateway_id: string;
  is_enabled: boolean;
}

/**
 * Lets a Level 1-4 helper tick-mark which payment gateways they accept.
 * Only "integrated" gateways for the helper's country (plus GLOBAL) are listed.
 * The user's Recharge page reads from the same `helper_accepted_payment_methods` table
 * to display the corresponding logos on each helper card.
 */
export const HelperAcceptedMethodsCard = ({ helperId, helperCountryCode }: HelperAcceptedMethodsCardProps) => {
  const { toast } = useToast();
  const { gateways, loading: gatewaysLoading } = useCountryPaymentGateways(helperCountryCode || null);
  const [accepted, setAccepted] = useState<AcceptedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const loadAccepted = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("helper_accepted_payment_methods" as any)
      .select("id, gateway_id, is_enabled")
      .eq("helper_id", helperId);
    if (!error && data) {
      setAccepted(data as unknown as AcceptedRow[]);
    }
    setLoading(false);
  }, [helperId]);

  useEffect(() => {
    if (helperId) loadAccepted();
  }, [helperId, loadAccepted]);

  // Realtime sync
  useEffect(() => {
    if (!helperId) return;
    const channel = supabase
      .channel(`helper-accepted-${helperId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "helper_accepted_payment_methods", filter: `helper_id=eq.${helperId}` },
        () => loadAccepted()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [helperId, loadAccepted]);

  const acceptedSet = useMemo(
    () => new Set(accepted.filter((r) => r.is_enabled).map((r) => r.gateway_id)),
    [accepted]
  );

  // Filter to only integrated gateways (auto + manual that admin marked integrated)
  const visibleGateways = useMemo(
    () => gateways.filter((g) => g.is_active),
    [gateways]
  );

  const toggleGateway = async (gatewayId: string, currentlyChecked: boolean) => {
    setSavingIds((prev) => new Set(prev).add(gatewayId));
    try {
      if (currentlyChecked) {
        // Remove
        const { error } = await supabase
          .from("helper_accepted_payment_methods" as any)
          .delete()
          .eq("helper_id", helperId)
          .eq("gateway_id", gatewayId);
        if (error) throw error;
      } else {
        // Insert (or upsert if previously disabled)
        const { error } = await supabase
          .from("helper_accepted_payment_methods" as any)
          .upsert(
            { helper_id: helperId, gateway_id: gatewayId, is_enabled: true },
            { onConflict: "helper_id,gateway_id" }
          );
        if (error) throw error;
      }
      await loadAccepted();
    } catch (e: any) {
      toast({
        title: "Failed to update",
        description: e?.message || "Could not save your selection.",
        variant: "destructive",
      });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(gatewayId);
        return next;
      });
    }
  };

  return (
    <Card className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-cyan-400" />
          Accepted Payment Methods
          <Badge className="ml-auto bg-cyan-500/30 text-cyan-100 border-0 text-[10px]">
            {acceptedSet.size} selected
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-slate-700 text-xs">
          Tick the methods you accept. Users will see these logos on your card in the Recharge page.
        </p>

        {(loading || gatewaysLoading) ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
          </div>
        ) : visibleGateways.length === 0 ? (
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center">
            <p className="text-amber-400 text-sm font-medium">
              No payment gateways available for {helperCountryCode || "your country"}
            </p>
            <p className="text-slate-500 text-xs mt-1">Admin has not enabled any methods yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
            {visibleGateways.map((g) => {
              const checked = acceptedSet.has(g.id);
              const saving = savingIds.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  disabled={saving}
                  onClick={() => toggleGateway(g.id, checked)}
                  className={cn(
                    "relative flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-left",
                    checked
                      ? "bg-cyan-500/25 border-cyan-400 ring-2 ring-cyan-400/30"
                      : "bg-white/80 border-amber-200/60 hover:border-cyan-400/40",
                    saving && "opacity-60"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    className="border-cyan-300 data-[state=checked]:bg-cyan-400 data-[state=checked]:text-slate-900 pointer-events-none"
                  />
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    {g.logo_url ? (
                      <img src={g.logo_url} alt={g.name} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-base">💳</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-bold truncate">{g.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {g.is_integrated ? (
                        <span className="text-[9px] text-emerald-300">⚡ Auto</span>
                      ) : (
                        <span className="text-[9px] text-amber-300">📝 Manual</span>
                      )}
                      {(g.country_codes || []).includes("GLOBAL") && (
                        <span className="text-[9px] text-cyan-300">🌍</span>
                      )}
                    </div>
                  </div>
                  {checked && !saving && (
                    <CheckCircle2 className="absolute top-1 right-1 w-3.5 h-3.5 text-cyan-300" />
                  )}
                  {saving && <Loader2 className="absolute top-1 right-1 w-3.5 h-3.5 text-cyan-300 animate-spin" />}
                </button>
              );
            })}
          </div>
        )}

        <div className="text-[10px] text-cyan-200/70 bg-cyan-500/10 rounded-lg p-2 border border-cyan-500/20">
          💡 Logos automatically appear on your Recharge card so users instantly know which methods you support.
        </div>
      </CardContent>
    </Card>
  );
};

export default HelperAcceptedMethodsCard;
