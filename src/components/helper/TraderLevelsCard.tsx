import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Crown, Award, Star, Trophy, Gem, Shield, Clock, CheckCircle, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";

interface TraderLevel {
  id: string;
  level_number: number;
  level_name: string;
  upgrade_cost_usd: number;
  min_withdrawal_amount: number;
  max_withdrawal_amount: number;
  commission_rate: number;
  badge_color?: string;
  is_active?: boolean;
}

interface UpgradeRequest {
  id: string;
  requested_level: number;
  status: "pending" | "processing" | "approved" | "rejected";
}

interface Props {
  currentLevel: number;
  helperId?: string | null;
  /** Optional override: when present (HelperDashboard L1-L4), open custom modal instead of inline pay flow */
  onApplyLevel?: (level: TraderLevel) => void;
}

const LEVEL_ICONS: Record<number, any> = {
  1: Shield,
  2: Award,
  3: Star,
  4: Trophy,
  5: Gem,
  6: Crown,
};

const LEVEL_COLORS: Record<number, string> = {
  1: "from-slate-400 to-slate-500",
  2: "from-emerald-400 to-emerald-600",
  3: "from-blue-400 to-blue-600",
  4: "from-purple-400 to-purple-600",
  5: "from-amber-400 to-amber-600",
  6: "from-violet-600 to-fuchsia-600",
};

export default function TraderLevelsCard({ currentLevel, helperId, onApplyLevel }: Props) {
  const navigate = useNavigate();
  const [levels, setLevels] = useState<TraderLevel[]>([]);
  const [pending, setPending] = useState<UpgradeRequest[]>([]);

  const fetchLevels = async () => {
    const { data } = await supabase
      .from("trader_level_tiers")
      .select("*")
      .eq("is_active", true)
      .order("level_number", { ascending: true });
    setLevels((data as any) || []);
  };

  const fetchPending = async () => {
    if (!helperId) return;
    const { data } = await supabase
      .from("helper_upgrade_requests" as any)
      .select("id, requested_level, status")
      .eq("helper_id", helperId)
      .order("created_at", { ascending: false });
    setPending(((data as any) || []) as UpgradeRequest[]);
  };

  useEffect(() => {
    fetchLevels();
    fetchPending();
  }, [helperId]);

  useAppSyncEvent(["trader_level_tiers", "helper_upgrade_requests"], () => {
    fetchLevels();
    fetchPending();
  });

  return (
    <Card className="bg-white border-amber-200/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-slate-900 text-base flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-violet-600" />
          Trader Levels
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {levels.map((level) => {
          const Icon = LEVEL_ICONS[level.level_number] || Shield;
          const colorClass = LEVEL_COLORS[level.level_number] || "from-slate-400 to-slate-500";
          const isCurrent = level.level_number === currentLevel;
          const isUnlocked = level.level_number <= currentLevel;
          const canUpgrade = level.level_number === currentLevel + 1;

          const req = pending.find((r) => r.requested_level === level.level_number);
          const hasPending = req && (req.status === "pending" || req.status === "processing");
          const hasApproved = req && req.status === "approved";

          return (
            <div
              key={level.level_number}
              className={cn(
                "p-4 rounded-xl border transition-all",
                isCurrent
                  ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-violet-200/50"
                  : isUnlocked
                  ? "bg-slate-50 border-slate-200"
                  : "bg-white border-amber-200/60 shadow-sm opacity-60"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-r",
                      colorClass
                    )}
                  >
                    <Icon className="w-6 h-6 text-white drop-shadow" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-slate-900 font-bold">{level.level_name}</p>
                      {isCurrent && (
                        <Badge className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-[10px] border-0 shadow-sm">
                          Current
                        </Badge>
                      )}
                    </div>
                    {level.level_number === 5 && (
                      <p className="text-violet-600 text-xs mt-1 flex items-center gap-1">
                        <Banknote className="w-3 h-3" />
                        Payroll System Access
                      </p>
                    )}
                    {level.level_number === 6 && (
                      <p className="text-fuchsia-600 text-xs mt-1 flex items-center gap-1">
                        <Crown className="w-3 h-3" />
                        Country Super Admin · Contract Tier
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {level.upgrade_cost_usd > 0 ? (
                    <>
                      <p className="text-slate-900 font-bold">
                        ${level.upgrade_cost_usd.toLocaleString()}
                      </p>
                      <p className="text-slate-700 text-xs">Upgrade Cost</p>
                    </>
                  ) : (
                    <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200/50">Free</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                <div>
                  <p className="text-slate-500 text-xs">Commission</p>
                  <p className="text-sky-600 font-bold">{level.commission_rate || 0}%</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Withdrawal Limits</p>
                  {level.min_withdrawal_amount > 0 || level.max_withdrawal_amount > 0 ? (
                    <p className="text-emerald-600 font-medium text-xs">
                      ${(level.min_withdrawal_amount || 0).toLocaleString()} - $
                      {(level.max_withdrawal_amount || 0).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-slate-700 text-xs">Not Available</p>
                  )}
                </div>
              </div>

              {/* L2-L4: hint to use top-up */}
              {canUpgrade && !hasPending && level.level_number >= 2 && level.level_number <= 4 && (
                <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 border border-white/20 shadow-md">
                  <p className="text-white text-xs leading-relaxed">
                    💡 Use <strong className="text-amber-100">Manual Top-up</strong> to add $
                    {level.upgrade_cost_usd} and auto-upgrade to this level.
                  </p>
                </div>
              )}

              {/* L5: manual application via callback (only on HelperDashboard) */}
              {canUpgrade && !hasPending && level.level_number === 5 && onApplyLevel && (
                <Button
                  onClick={() => onApplyLevel(level)}
                  className="w-full mt-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white h-10"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Apply for Level 5 - ${level.upgrade_cost_usd}
                </Button>
              )}

              {/* L6: Country Super Admin contract flow */}
              {canUpgrade && !hasPending && level.level_number === 6 && (
                <div className="mt-3 space-y-2">
                  <div className="p-3 rounded-lg bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 border border-white/20 shadow-md">
                    <p className="text-white text-xs leading-relaxed">
                      <strong className="text-amber-200">Country Super Admin (L6 Contract):</strong>{" "}
                      Sign the official agreement, upload NID, and deposit $
                      {level.upgrade_cost_usd.toLocaleString()} to manage your country's payroll and
                      earn {level.commission_rate}% on every withdrawal.
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate("/super-admin/apply")}
                    className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white h-10"
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    Apply for Level 6 — Country Super Admin
                  </Button>
                </div>
              )}

              {/* L6 locked for L1-L4 */}
              {level.level_number === 6 && !canUpgrade && !isUnlocked && currentLevel < 5 && (
                <div className="mt-3 p-2 rounded-lg bg-slate-100 border border-slate-200">
                  <p className="text-slate-600 text-xs text-center">
                    🔒 Reach Level 5 first to unlock the Country Super Admin contract.
                  </p>
                </div>
              )}

              {hasPending && (
                <div className="mt-3 p-2 rounded-lg bg-amber-50 border border-amber-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span className="text-amber-700 text-xs">Upgrade request pending...</span>
                  </div>
                  <Badge className="bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 text-[10px] border-0">
                    Pending
                  </Badge>
                </div>
              )}

              {hasApproved && !isCurrent && (
                <div className="mt-3 p-2 rounded-lg bg-emerald-50 border border-emerald-200/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-600 text-xs">Upgrade approved!</span>
                  </div>
                  <Badge className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-[10px] border-0">
                    Approved
                  </Badge>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
