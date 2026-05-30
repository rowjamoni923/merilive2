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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 pb-20">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 safe-area-top shadow-sm">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto w-full">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-800 dark:text-white" />
          </button>
          <h1 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-500" />
            Agency Center
          </h1>
          <button onClick={() => navigate("/settings")} className="p-2 -mr-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors">
            <Settings className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 pt-4 space-y-5">
        {/* Agency Hero Card */}
        <div className={`relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br ${levelInfo.color} p-6 shadow-2xl shadow-brand-500/20 text-white`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />
          
          <div className="relative z-10 flex items-center gap-4 mb-6">
            <Avatar className="w-16 h-16 border-4 border-white/20 shadow-xl">
              <AvatarImage src={agency.logo_url || ""} />
              <AvatarFallback className="bg-white/20 text-white text-xl font-bold">{agency.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{levelInfo.icon}</span>
                <Badge className="bg-white/20 text-white border-0 font-black text-[10px] px-2 py-0.5 uppercase tracking-wider">
                  Level {agency.level || 'A1'} • {levelTierInfo?.level_name || levelInfo.name}
                </Badge>
              </div>
              <h2 className="text-xl font-black truncate tracking-tight">{agency.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <code className="bg-black/20 px-2 py-0.5 rounded text-xs font-mono border border-white/10">ID: {agency.agency_code}</code>
                <button onClick={copyAgencyCode} className="p-1 hover:bg-white/20 rounded transition-colors"><Copy className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 relative z-10">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
              <p className="text-white/60 text-[10px] uppercase font-black tracking-widest mb-1">Active Hosts</p>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-200" />
                <p className="text-lg font-black">{hostsCount}</p>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
              <p className="text-white/60 text-[10px] uppercase font-black tracking-widest mb-1">My Rate</p>
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-brand-200" />
                <p className="text-lg font-black">{actualCommissionRate}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Stats Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Financial Overview</h3>
            <Badge variant="outline" className="text-[9px] border-slate-200 dark:border-white/10 font-bold uppercase tracking-wider">Zero Refresh</Badge>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <Card className="border-0 bg-white dark:bg-slate-900 shadow-xl shadow-brand-500/5 rounded-3xl overflow-hidden group">
              <CardContent className="p-0">
                <div className="bg-gradient-to-r from-brand-600 to-indigo-600 p-5 text-white flex justify-between items-center">
                  <div>
                    <p className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-1">Total Beans</p>
                    <h3 className="text-3xl font-black tracking-tighter">{fmtNum(agencyBeansBalance)}</h3>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                    <Coins className="w-7 h-7 text-white" />
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between bg-slate-50 dark:bg-black/20">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">USD Value</p>
                      <p className="text-sm font-black text-slate-700 dark:text-slate-200">${usdValue.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-white/5" />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-info-100 dark:bg-info-900/30 flex items-center justify-center">
                      <span className="text-xs font-black text-info-600">{localCurrency.flag}</span>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{localCurrency.code} Value</p>
                      <p className="text-sm font-black text-slate-700 dark:text-slate-200">{localCurrency.symbol}{localValue.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Quick Actions Grid */}
        <section className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-1">Quick Management</h3>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => navigate("/agency-host-management")} className="flex flex-col items-start p-5 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 shadow-xl shadow-brand-500/5 active:scale-95 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-950 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><HostsIcon3D /></div>
              <h4 className="font-black text-slate-800 dark:text-white">Host List</h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Manage Performance</p>
            </button>
            <button onClick={() => navigate("/agency-withdrawal")} className="flex flex-col items-start p-5 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 shadow-xl shadow-brand-500/5 active:scale-95 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><WithdrawIcon3D /></div>
              <h4 className="font-black text-slate-800 dark:text-white">Withdraw</h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Salary Payment</p>
            </button>
            <button onClick={() => setShowSubAgentsPanel(true)} className="flex flex-col items-start p-5 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 shadow-xl shadow-brand-500/5 active:scale-95 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><RankingIcon3D /></div>
              <h4 className="font-black text-slate-800 dark:text-white">Sub-Agents</h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Team Management</p>
            </button>
            <button 
              onClick={() => {
                if (hasHelperAccess) navigate(isLevel5Helper ? "/level5-helper-dashboard" : "/helper-dashboard");
                else setShowHelperDialog(true);
              }}
              className="flex flex-col items-start p-5 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 shadow-xl shadow-brand-500/5 active:scale-95 transition-all group relative"
            >
              {hasHelperAccess && helperPendingCount > 0 && (
                <span className="absolute top-4 right-4 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-lg border-2 border-white dark:border-slate-900 animate-pulse">{helperPendingCount}</span>
              )}
              <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><HelperIcon3D /></div>
              <h4 className="font-black text-slate-800 dark:text-white">{hasHelperAccess ? 'Helper Hub' : 'Become Helper'}</h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{hasHelperAccess ? 'Trading Panel' : 'Application'}</p>
            </button>
          </div>
        </section>

        {/* Secondary Grid */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => navigate("/agency-coin-exchange")} className="flex flex-col items-center p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 active:scale-95 transition-all group">
            <div className="w-10 h-10 mb-2 group-hover:scale-110 transition-transform"><DiamondExchangeIcon3D /></div>
            <span className="text-[9px] font-black uppercase tracking-tighter text-slate-500">Exchange</span>
          </button>
          <button onClick={() => navigate("/agency-policy")} className="flex flex-col items-center p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 active:scale-95 transition-all group">
            <div className="w-10 h-10 mb-2 group-hover:scale-110 transition-transform"><PolicyIcon3D /></div>
            <span className="text-[9px] font-black uppercase tracking-tighter text-slate-500">Policy</span>
          </button>
          <button onClick={() => navigate("/agency-transfer-history")} className="flex flex-col items-center p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 active:scale-95 transition-all group">
            <div className="w-10 h-10 mb-2 group-hover:scale-110 transition-transform"><HistoryIcon3D /></div>
            <span className="text-[9px] font-black uppercase tracking-tighter text-slate-500">History</span>
          </button>
        </div>

        {/* PREMIUM Payroll Helper Guide Card - Fix Color & Design */}
        <div 
          onClick={() => navigate('/payroll-helper-guide')}
          className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-600 via-indigo-600 to-brand-700 p-6 shadow-2xl shadow-brand-500/20 active:scale-[0.98] transition-all group cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-white/20 transition-colors" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg border border-white/20 group-hover:rotate-6 transition-transform">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-black text-lg tracking-tight leading-tight flex items-center gap-2">
                Payroll Helper Guide
                <Badge className="bg-white/20 text-white border-0 text-[8px] px-1.5 h-4 font-black uppercase tracking-widest">Official</Badge>
              </h3>
              <p className="text-white/80 text-[11px] font-bold mt-1 uppercase tracking-[0.1em]">Complete A-Z Training & Guidelines</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:translate-x-1 transition-all">
              <ArrowRight className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Parent Agency Mini Card */}
        {parentAgency && (
          <div className="bg-slate-100 dark:bg-white/5 rounded-3xl p-4 flex items-center justify-between border border-slate-200 dark:border-white/5">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10 border border-white/20">
                <AvatarImage src={parentAgency.owner_profile?.avatar_url || ""} />
                <AvatarFallback className="bg-brand-500 text-white font-bold">{parentAgency.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Managed By</p>
                <h5 className="text-sm font-black text-slate-700 dark:text-slate-200">{parentAgency.name}</h5>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/chat?user=${parentAgency.owner_id}`)} className="rounded-full h-8 px-3 text-[10px] font-black uppercase bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-white/5">Chat Owner</Button>
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
