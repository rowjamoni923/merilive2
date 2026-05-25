import { useEffect, useState } from "react";
import { Wallet, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface HelperPaymentMethodsCardProps {
  helperId: string;
  /** Navigates here when user taps "Manage" or "Add" (used only if onManage is not provided). */
  manageHref?: string;
  /** Preferred: fire a local handler (e.g. open an inline add/manage dialog).
   *  When provided, navigation is skipped. */
  onManage?: () => void;
  /** Bump this number from the parent after add/delete to force the list to refresh. */
  refreshKey?: number;
  showManage?: boolean;
}

interface Row {
  id: string;
  country_code: string;
  method_name: string;
  method_type: string;
  account_number: string | null;
  logo_url: string | null;
  is_active: boolean;
}

/**
 * Premium card listing every payment method a Trader accepts, grouped by country,
 * with the admin-uploaded logo. Used in both L1–L4 (HelperDashboard) and
 * L5 (Level5HelperDashboard) so users see at-a-glance how this trader takes payment.
 *
 * Data source: `helper_country_payment_methods` (active rows only).
 */
export default function HelperPaymentMethodsCard({
  helperId,
  manageHref = "/level5-helper-dashboard?tab=country-methods&action=add",
  onManage,
  refreshKey = 0,
  showManage = true,
}: HelperPaymentMethodsCardProps) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const handleManage = () => {
    if (onManage) onManage();
    else navigate(manageHref);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!helperId) return;
      const { data } = await supabase
        .from("helper_country_payment_methods")
        .select("id, country_code, method_name, method_type, account_number, logo_url, is_active")
        .eq("helper_id", helperId)
        .eq("is_active", true)
        .order("country_code", { ascending: true });
      if (!alive) return;
      setRows((data || []) as Row[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [helperId, refreshKey]);

  // Group by country
  const byCountry = rows.reduce<Record<string, Row[]>>((acc, r) => {
    (acc[r.country_code] ||= []).push(r);
    return acc;
  }, {});
  const countries = Object.keys(byCountry);

  return (
    <div
      className="relative rounded-[22px] p-[1.5px] overflow-hidden"
      style={{
        background:
          "conic-gradient(from 140deg at 50% 50%, #fde68a 0deg, #b45309 70deg, #fbbf24 130deg, #92400e 200deg, #fde68a 260deg, #d97706 320deg, #fde68a 360deg)",
        boxShadow: "0 18px 40px -22px rgba(146,64,14,0.55)",
      }}
    >
      <div
        className="relative rounded-[20px] p-4"
        style={{
          background:
            "radial-gradient(140% 100% at 0% 0%, #FFFEF8 0%, #FFFBEC 55%, #FFF5D6 100%)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-amber-400 to-amber-600 shadow-md shadow-amber-500/30">
              <Wallet className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-extrabold text-amber-900 leading-tight">
                Accepted Payment Methods
              </p>
              <p className="text-[10px] text-amber-700/80 leading-tight mt-0.5">
                Shown to users who recharge through you
              </p>
            </div>
          </div>
          {showManage && (
            <button
              type="button"
              onClick={handleManage}
              className="text-[11px] font-bold text-amber-700 hover:text-amber-900 px-2 py-1 rounded-lg hover:bg-amber-100/60 transition-colors"
            >
              Manage
            </button>
          )}
        </div>

        {/* Body */}
        {loading ? (
          <div className="h-16 rounded-xl bg-amber-100/40 animate-pulse" />
        ) : countries.length === 0 ? (
          <button
            type="button"
            onClick={handleManage}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add your first payment method
          </button>
        ) : (
          <div className="space-y-3">
            {countries.map((cc) => (
              <div key={cc}>
                <p className="text-[10px] font-bold text-amber-700/70 uppercase tracking-wider mb-1.5">
                  {cc}
                </p>
                <div className="flex flex-wrap gap-2">
                  {byCountry[cc].map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white border border-amber-200 shadow-sm"
                    >
                      {m.logo_url ? (
                        <img
                          src={m.logo_url}
                          alt={m.method_name}
                          className="w-6 h-6 rounded-full object-cover border border-amber-100"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 grid place-items-center text-white text-[10px] font-extrabold">
                          {m.method_name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                      )}
                      <span className="text-[11px] font-bold text-slate-800">
                        {m.method_name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
