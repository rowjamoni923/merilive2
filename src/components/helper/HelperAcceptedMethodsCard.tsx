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
    <Card className="bg-white/95 border border-amber-200/70 shadow-[0_4px_16px_rgba(146,64,14,0.08)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-slate-900 text-base flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-amber-600" />
          Accepted Payment Methods
          <Badge className="ml-auto bg-gradient-to-r from-amber-500 to-amber-600 text-white border-0 text-[10px] font-semibold">
            {acceptedSet.size} selected
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-slate-600 text-xs">
          Tick the methods you accept. Users will see these logos on your card in the Recharge page.
        </p>

        {(loading || gatewaysLoading) ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
          </div>
        ) : visibleGateways.length === 0 ? (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-center">
            <p className="text-amber-700 text-sm font-semibold">
              No payment gateways available for {helperCountryCode || "your country"}
            </p>
            <p className="text-slate-500 text-xs mt-1">Admin has not enabled any methods yet.</p>
          </div>
        ) : (
          // Single-column scrollable list — only ~1 row visible, scroll for the rest
          <div
            className="flex flex-col gap-2 max-h-[88px] overflow-y-auto pr-1 rounded-xl bg-slate-50/80 border border-slate-200 p-2 scroll-smooth snap-y snap-mandatory"
            style={{ scrollbarWidth: "thin" }}
          >
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
                    "relative w-full flex items-center gap-3 p-2.5 rounded-xl border-2 transition-all text-left snap-start",
                    checked
                      ? "bg-amber-50 border-amber-400 shadow-sm"
                      : "bg-white border-slate-200 hover:border-amber-300",
                    saving && "opacity-60"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    className="border-amber-400 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500 data-[state=checked]:text-white pointer-events-none"
                  />
                  <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                    {g.logo_url ? (
                      <img src={g.logo_url} alt={g.name} className="w-full h-full object-contain p-0.5" />
                    ) : (
                      <span className="text-base">💳</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 text-sm font-semibold truncate">{g.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {g.is_integrated ? (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-px">⚡ Auto</span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-px">📝 Manual</span>
                      )}
                      {(g.country_codes || []).includes("GLOBAL") && (
                        <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-px">🌍 Global</span>
                      )}
                    </div>
                  </div>
                  {checked && !saving && (
                    <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0" />
                  )}
                  {saving && <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        {!loading && !gatewaysLoading && visibleGateways.length > 1 && (
          <p className="text-[10px] text-slate-500 text-center">
            ↕ Scroll to see all {visibleGateways.length} methods
          </p>
        )}

        <div className="text-[11px] text-slate-700 bg-amber-50 rounded-lg p-2 border border-amber-200">
          💡 Logos automatically appear on your Recharge card so users instantly know which methods you support.
        </div>
      </CardContent>
    </Card>
  );
};

export default HelperAcceptedMethodsCard;
