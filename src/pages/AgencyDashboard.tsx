import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { 
  ArrowLeft, 
  Users,
  Coins,
  Copy,
  Diamond,
  Trophy,
  Sparkles,
  Settings,
  Building2,
  Zap,
  Percent,
  FileText,
  ArrowRight,
  Wallet,
  History,
  Banknote,
  BadgeDollarSign,
  Gem
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUser } from "@/utils/cachedAuth";
import { HostsIcon3D, WithdrawIcon3D, RankingIcon3D, HelperIcon3D, DiamondExchangeIcon3D, PolicyIcon3D, HistoryIcon3D } from "@/components/agency/Premium3DIcons";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import HelperApplicationForm from "@/components/helper/HelperApplicationForm";
import SubAgentsPanel from "@/components/agency/SubAgentsPanel";
import PayrollHelperWelcomeModal from "@/components/agency/PayrollHelperWelcomeModal";
import { formatNumber as formatNum } from "@/utils/formatNumber";

const fmtNum = (num: number | null | undefined) => formatNum(num);

interface Agency {
  id: string;
  name: string;
  agency_code: string;
  level: string;
  wallet_balance: number;
  total_hosts: number;
  total_agents: number;
  commission_rate: number;
  created_at: string;
  logo_url: string | null;
  diamond_balance?: number;
  beans_balance?: number;
  parent_agency_id?: string | null;
}

interface ParentAgencyInfo {
  id: string;
  name: string;
  agency_code: string;
  level: string;
  owner_id: string;
  owner_profile?: {
    display_name: string | null;
    avatar_url: string | null;
    uid: string | null;
  };
}

interface LevelTier {
  level_code: string;
  level_name: string;
  commission_rate: number;
  badge_color: string;
}

interface WithdrawalHistory {
  id: string;
  amount: number;
  status: string;
  payment_method: string;
  requested_at: string;
}

const AgencyDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [actualCommissionRate, setActualCommissionRate] = useState<number>(0);
  const [levelTierInfo, setLevelTierInfo] = useState<LevelTier | null>(null);
  const [hostsCount, setHostsCount] = useState(0);
  const [subAgentsCount, setSubAgentsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [coinsToUsdRate, setCoinsToUsdRate] = useState(9000); 
  const [localExchangeRate, setLocalExchangeRate] = useState(1);
  const [localCurrency, setLocalCurrency] = useState({ code: 'USD', symbol: '$', flag: '🇺🇸' });
  const [hasHelperAccess, setHasHelperAccess] = useState(false);
  const [isLevel5Helper, setIsLevel5Helper] = useState(false);
  const [helperPendingApplication, setHelperPendingApplication] = useState(false);
  const [showHelperDialog, setShowHelperDialog] = useState(false);
  const [helperPendingCount, setHelperPendingCount] = useState(0);
  const [parentAgency, setParentAgency] = useState<ParentAgencyInfo | null>(null);
  const [showSubAgentsPanel, setShowSubAgentsPanel] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const user = await getCachedUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: agencyData, error: agencyError } = await supabase
        .from("agencies")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (agencyError || !agencyData) {
        navigate("/agency");
        return;
      }

      setAgency(agencyData);
      setCurrentUserId(user.id);
      localStorage.removeItem('meri_agency_redirecting');

      const [
        parentRes,
        helperRes,
        hostsCountRes,
        subAgentsCountRes,
        beansRateRes,
        userProfileRes,
        tierRes
      ] = await Promise.all([
        agencyData.parent_agency_id
          ? supabase.from("agencies").select("id, name, agency_code, level, owner_id").eq("id", agencyData.parent_agency_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("topup_helpers").select("trader_level, payroll_enabled, is_verified, is_active, id").eq("user_id", user.id).maybeSingle(),
        supabase.from("agency_hosts").select("*", { count: 'exact', head: true }).eq("agency_id", agencyData.id).eq("status", "active"),
        supabase.from("agencies").select("*", { count: 'exact', head: true }).eq("parent_agency_id", agencyData.id).eq("is_active", true),
        supabase.from("app_settings").select("setting_value").eq("setting_key", "beans_to_usd_rate").maybeSingle(),
        supabase.from('profiles').select('country_code').eq('id', user.id).single(),
        supabase.from("agency_level_tiers").select("level_code, level_name, commission_rate, badge_color").eq("level_code", agencyData.level || 'A1').eq("is_active", true).maybeSingle(),
      ]);

      if (parentRes.data) {
        const { data: parentOwner } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", parentRes.data.owner_id).maybeSingle();
        setParentAgency({
          ...parentRes.data,
          owner_profile: parentOwner ? { ...parentOwner, uid: null } : undefined
        });
      }

      const helperData = helperRes.data;
      if (helperData) {
        if (helperData.is_verified && helperData.is_active) {
          setHasHelperAccess(true);
          if (helperData.trader_level === 5 && helperData.payroll_enabled) {
            setIsLevel5Helper(true);
          }
          // Fetch pending counts
          const [topupCount, withdrawalCount] = await Promise.all([
            supabase.from("helper_orders").select("*", { count: 'exact', head: true }).eq("helper_id", helperData.id).eq("status", "pending"),
            supabase.from("agency_withdrawals").select("*", { count: 'exact', head: true }).eq("status", "pending")
          ]);
          setHelperPendingCount((topupCount.count || 0) + (withdrawalCount.count || 0));
        } else {
          setHelperPendingApplication(true);
        }
      }

      setHostsCount(hostsCountRes.count || 0);
      setSubAgentsCount(subAgentsCountRes.count || 0);

      if (beansRateRes.data?.setting_value) {
        const val = beansRateRes.data.setting_value as any;
        setCoinsToUsdRate(val.rate || 9000);
      }

      if (userProfileRes.data?.country_code) {
        const { data: currencyRes } = await supabase.from('currency_rates').select('*').eq('country_code', userProfileRes.data.country_code).eq('is_active', true).maybeSingle();
        if (currencyRes) {
          setLocalExchangeRate(currencyRes.rate_to_usd || 1);
          setLocalCurrency({ 
            code: currencyRes.currency_code || 'USD', 
            symbol: currencyRes.currency_symbol || '$',
            flag: currencyRes.country_code === 'BD' ? '🇧🇩' : '🌍'
          });
        }
      }

      if (tierRes.data) {
        setLevelTierInfo(tierRes.data);
        setActualCommissionRate(tierRes.data.commission_rate || 0);
      }

    } catch (error) {
      console.error('[AgencyDashboard] Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchData();
    const cleanup = subscribeToTables(
      "agency_dashboard_sync",
      ["agencies", "agency_hosts", "app_settings", "topup_helpers", "agency_withdrawals"],
      () => fetchData()
    );
    return () => cleanup();
  }, [fetchData]);

  const copyAgencyCode = () => {
    if (agency) {
      navigator.clipboard.writeText(agency.agency_code);
      setCopiedCode(true);
      toast({ title: "Copied!", description: "Agency code copied" });
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  if (isLoading) return <LoadingSpinner fullScreen text="Loading Dashboard..." />;
  if (!agency) return null;

  const agencyBeansBalance = agency.wallet_balance || 0;
  const usdValue = agencyBeansBalance / coinsToUsdRate;
  const localValue = usdValue * localExchangeRate;

  const getLevelInfo = (level: string) => {
    switch (level) {
      case "A5": return { color: "from-purple-600 to-pink-600", icon: "👑", name: "Legend" };
      case "A4": return { color: "from-amber-400 to-orange-500", icon: "🌟", name: "Elite" };
      case "A3": return { color: "from-blue-500 to-cyan-500", icon: "✨", name: "Pro" };
      case "A2": return { color: "from-emerald-500 to-teal-600", icon: "🔥", name: "Rising" };
      default: return { color: "from-slate-400 to-slate-500", icon: "⭐", name: "Starter" };
    }
  };
  const levelInfo = getLevelInfo(agency.level || "A1");

  return (
    <div className="agency-official-shell min-h-screen flex flex-col pb-20">
      <header className="agency-official-header sticky top-0 z-50 safe-area-top">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto w-full">
          <button onClick={() => navigate(-1)} className="agency-official-icon-button" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="agency-official-title">
            <Sparkles className="w-5 h-5" />
            Agency Dashboard
          </h1>
          <button onClick={() => navigate("/settings")} className="agency-official-icon-button" aria-label="Settings">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 pt-4 space-y-4">
        <section className="agency-official-hero">
          <div className="relative z-10 flex items-start gap-4">
            <div className="agency-official-logo">
              {agency.logo_url ? <img src={agency.logo_url} alt={`${agency.name} logo`} /> : <Building2 className="w-8 h-8" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="agency-official-pin">📌</span>
                <span className="agency-official-level">{(levelTierInfo?.level_name || agency.level || levelInfo.name).toLowerCase()} • {agency.level || 'A1'}</span>
              </div>
              <h2 className="agency-official-name">{agency.name}</h2>
              <p className="agency-official-rate">% {actualCommissionRate}% Commission Rate</p>
            </div>
          </div>

          <button onClick={copyAgencyCode} className="agency-official-code" aria-label="Copy agency code">
            <span>
              <small>Agency Code</small>
              <strong>{agency.agency_code}</strong>
            </span>
            <Copy className="w-5 h-5" />
          </button>

          <div className="agency-official-stat-grid">
            <div className="agency-official-stat">
              <Users className="w-5 h-5" />
              <strong>{hostsCount}</strong>
              <span>Hosts</span>
            </div>
            <div className="agency-official-stat">
              <Building2 className="w-5 h-5" />
              <strong>{subAgentsCount}</strong>
              <span>Agents</span>
            </div>
            <div className="agency-official-stat">
              <Diamond className="w-5 h-5" />
              <strong>{fmtNum(agencyBeansBalance)}</strong>
              <span>Beans</span>
            </div>
            <div className="agency-official-stat">
              <Zap className="w-5 h-5" />
              <strong>Online</strong>
              <span>Status</span>
            </div>
          </div>
        </section>

        <section className="agency-official-finance">
          <button onClick={() => navigate('/agency-commission-history')} className="agency-official-beans-row">
            <span className="agency-official-beans-icon"><Coins className="w-6 h-6" /></span>
            <span className="min-w-0 flex-1">
              <small>Total Beans ›</small>
              <strong>{fmtNum(agencyBeansBalance)}</strong>
              <em>Tap to view commission history</em>
            </span>
            <span className="agency-official-usd">
              <small>USD Value</small>
              <strong>${usdValue.toFixed(2)}</strong>
            </span>
          </button>

          <div className="agency-official-rate-row">
            <span>{localCurrency.flag} {localCurrency.code} Value</span>
            <strong>{localCurrency.symbol}{localValue.toFixed(2)}</strong>
          </div>
          <div className="agency-official-rate-row">
            <span>⇄ Exchange Rate</span>
            <strong>{fmtNum(coinsToUsdRate)} Beans = $1 | $1 = {localCurrency.symbol}{localExchangeRate.toFixed(2)}</strong>
          </div>

          <div className="agency-official-finance-actions">
            <button onClick={() => navigate('/agency-withdrawal')}><Wallet className="w-5 h-5" />Withdraw</button>
            <button onClick={() => navigate('/agency-transfer-history')}><History className="w-5 h-5" />History</button>
          </div>
        </section>

        <button onClick={() => navigate('/payroll-helper-guide')} className="agency-official-guide">
          <span className="agency-official-guide-icon"><FileText className="w-6 h-6" /></span>
          <span className="min-w-0 flex-1">
            <strong>Payroll Helper Guide</strong>
            <small>Learn roles, benefits & diamond trading</small>
          </span>
          <ArrowRight className="w-6 h-6" />
        </button>

        <section className="space-y-3">
          <h3 className="agency-official-section-title">Quick Actions</h3>
          <div className="agency-official-actions-grid">
            <button onClick={() => navigate("/agency-host-management")} className="agency-action-blue">
              <HostsIcon3D />
              <span>Hosts</span>
            </button>
            <button onClick={() => navigate("/agency-withdrawal")} className="agency-action-teal">
              <WithdrawIcon3D />
              <span>Withdraw</span>
            </button>
            <button onClick={() => setShowSubAgentsPanel(true)} className="agency-action-orange">
              <RankingIcon3D />
              <span>Ranking</span>
            </button>
            <button onClick={() => hasHelperAccess ? navigate(isLevel5Helper ? "/level5-helper-dashboard" : "/helper-dashboard") : setShowHelperDialog(true)} className="agency-action-cyan relative">
              {hasHelperAccess && helperPendingCount > 0 && <em>{helperPendingCount}</em>}
              <HelperIcon3D />
              <span>Helper</span>
            </button>
            <button onClick={() => navigate("/agency-coin-exchange")} className="agency-action-red">
              <DiamondExchangeIcon3D />
              <span>Diamond Exchange</span>
            </button>
            <button onClick={() => navigate("/agency-policy")} className="agency-action-blue">
              <PolicyIcon3D />
              <span>Policy</span>
            </button>
            <button onClick={() => navigate("/agency-transfer-history")} className="agency-action-purple">
              <HistoryIcon3D />
              <span>History</span>
            </button>
          </div>
        </section>

        {parentAgency && (
          <div className="agency-official-parent-card">
            <div className="agency-official-parent-avatar">{parentAgency.name.charAt(0)}</div>
            <div className="min-w-0 flex-1">
              <small>Managed By</small>
              <strong>{parentAgency.name}</strong>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/chat?user=${parentAgency.owner_id}`)}>Chat Owner</Button>
          </div>
        )}
      </main>

      {/* Helper Dialog */}
      <Dialog open={showHelperDialog} onOpenChange={setShowHelperDialog}>
        <DialogContent className="sm:max-w-[425px] bg-white dark:bg-slate-950 border-0 rounded-[2.5rem] p-0 overflow-hidden shadow-2xl">
          <HelperApplicationForm 
            agencyId={agency?.id}
            onSuccess={() => {
              setShowHelperDialog(false);
              setHelperPendingApplication(true);
              toast({ title: "Application Submitted", description: "Admin will review your request" });
            }}
            onClose={() => setShowHelperDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Sub-Agents Panel */}
      <SubAgentsPanel 
        agencyId={agency.id}
        agencyCode={agency.agency_code}
        isOpen={showSubAgentsPanel}
        onClose={() => setShowSubAgentsPanel(false)}
      />

      {/* Welcome Modal */}
      {currentUserId && agency && (
        <PayrollHelperWelcomeModal 
          agencyId={agency.id}
          userId={currentUserId}
        />
      )}
    </div>
  );
};

export default AgencyDashboard;
