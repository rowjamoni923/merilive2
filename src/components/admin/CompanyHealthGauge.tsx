import { useEffect, useState } from "react";
import { Activity, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  startDate: string;
  endDate: string;
  refreshKey: number;
}

interface Health {
  company_profit_usd: number;
  total_payouts_usd: number;
  net_balance_usd: number;
  health_percent: number;
  status: "healthy" | "good" | "caution" | "warning" | "critical";
}

const fmtUsd = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0);

const STATUS_STYLE: Record<
  Health["status"],
  { color: string; bg: string; ring: string; label: string; Icon: any }
> = {
  healthy: { color: "#10b981", bg: "from-emerald-500/20 to-emerald-500/5", ring: "ring-emerald-500/40", label: "HEALTHY", Icon: ShieldCheck },
  good: { color: "#84cc16", bg: "from-lime-500/20 to-lime-500/5", ring: "ring-lime-500/40", label: "GOOD", Icon: TrendingUp },
  caution: { color: "#eab308", bg: "from-yellow-500/20 to-yellow-500/5", ring: "ring-yellow-500/40", label: "CAUTION", Icon: Activity },
  warning: { color: "#f97316", bg: "from-orange-500/20 to-orange-500/5", ring: "ring-orange-500/40", label: "WARNING", Icon: AlertTriangle },
  critical: { color: "#ef4444", bg: "from-red-500/20 to-red-500/5", ring: "ring-red-500/40", label: "CRITICAL", Icon: TrendingDown },
};

export default function CompanyHealthGauge({ startDate, endDate, refreshKey }: Props) {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const startTs = new Date(`${startDate}T00:00:00`).toISOString();
        const endTs = new Date(`${endDate}T23:59:59.999`).toISOString();
        const { data: rows, error } = await supabase.rpc("compute_company_health", {
          p_start: startTs,
          p_end: endTs,
        });
        if (error) throw error;
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!cancelled && row) {
          setData({
            company_profit_usd: Number(row.company_profit_usd) || 0,
            total_payouts_usd: Number(row.total_payouts_usd) || 0,
            net_balance_usd: Number(row.net_balance_usd) || 0,
            health_percent: Number(row.health_percent) || 0,
            status: (row.status || "healthy") as Health["status"],
          });
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, refreshKey]);

  if (loading) {
    return (
      <Card className="bg-[#0c0c14] border-white/[0.06]">
        <CardContent className="p-5">
          <Skeleton className="h-32 w-full bg-white/5" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const st = STATUS_STYLE[data.status];
  const Icon = st.Icon;
  const pct = Math.max(0, Math.min(100, data.health_percent));
  const circumference = 2 * Math.PI * 52;
  const dashOffset = circumference - (pct / 100) * circumference;
  const profitTrending = data.net_balance_usd >= 0;

  return (
    <Card className={`bg-[#0c0c14] border-white/[0.06] ring-1 ${st.ring} overflow-hidden`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${st.bg} pointer-events-none opacity-50`} />
      <CardContent className="relative p-5">
        <div className="flex flex-col md:flex-row items-center gap-6">
          {/* Circular gauge */}
          <div className="relative w-32 h-32 flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" stroke="#ffffff15" strokeWidth="10" fill="none" />
              <circle
                cx="60"
                cy="60"
                r="52"
                stroke={st.color}
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 600ms ease, stroke 300ms ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-3xl font-bold" style={{ color: st.color }}>
                {pct.toFixed(0)}%
              </div>
              <div className="text-[9px] uppercase tracking-wider text-white/50 mt-0.5">
                Health
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 w-full">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-4 w-4" style={{ color: st.color }} />
              <span
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: st.color }}
              >
                Company {st.label}
              </span>
              <span className="ml-auto text-[10px] text-white/50">
                {profitTrending ? "▲ Profit > Payouts" : "▼ Payouts > Profit"}
              </span>
            </div>
            <h3 className="text-lg md:text-xl font-bold text-white mb-3">
              Company Profit vs Total Payouts
            </h3>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg bg-black/40 border border-white/[0.08] p-3">
                <div className="text-[10px] uppercase tracking-wider text-emerald-300/70">
                  Company Profit
                </div>
                <div className="text-base md:text-lg font-bold text-emerald-300 mt-1">
                  {fmtUsd(data.company_profit_usd)}
                </div>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/[0.08] p-3">
                <div className="text-[10px] uppercase tracking-wider text-rose-300/70">
                  Total Payouts
                </div>
                <div className="text-base md:text-lg font-bold text-rose-300 mt-1">
                  {fmtUsd(data.total_payouts_usd)}
                </div>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/[0.08] p-3">
                <div className="text-[10px] uppercase tracking-wider text-white/60">
                  Net Balance
                </div>
                <div
                  className="text-base md:text-lg font-bold mt-1"
                  style={{ color: profitTrending ? "#10b981" : "#ef4444" }}
                >
                  {fmtUsd(data.net_balance_usd)}
                </div>
              </div>
            </div>

            {/* Bar comparison */}
            <div className="mt-4">
              <div className="flex justify-between text-[10px] text-white/50 mb-1">
                <span>Profit share</span>
                <span>Payout share</span>
              </div>
              <div className="h-2 w-full rounded-full bg-rose-500/20 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${st.color}, ${st.color}cc)`,
                  }}
                />
              </div>
              <div className="text-[10px] text-white/40 mt-2 leading-relaxed">
                Formula: profit ÷ (profit + payouts) × 100 — 100% = company keeps everything, 50% = profit equals payouts, &lt;30% = payouts dominating.
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
