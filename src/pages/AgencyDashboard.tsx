import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  ArrowLeft, 
  Building2,
  Users,
  Wallet,
  TrendingUp,
  Crown,
  Clock,
  Gift,
  Coins,
  Copy,
  CheckCircle2,
  User,
  Loader2,
  ChevronRight,
  BarChart3,
  Share2,
  Link as LinkIcon,
  UserPlus,
  TrendingDown,
  Calendar,
  DollarSign,
  Diamond,
  ArrowRightLeft,
  Trophy,
  Sparkles,
  Eye,
  Settings,
  Bell,
  Shield,
  Star,
  Activity,
  Zap,
  Target,
  Award,
  Headphones,
  MessageCircle,
  Phone,
  Send,
  Hash,
  XCircle,
  Percent,
  FileText,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { getCurrencyRateForCountry } from "@/utils/currencyRatesCache";
import { getCachedUser } from "@/utils/cachedAuth";
import { HostsIcon3D, WithdrawIcon3D, RankingIcon3D, HelperIcon3D, DiamondExchangeIcon3D, PolicyIcon3D, HistoryIcon3D } from "@/components/agency/Premium3DIcons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import HelperApplicationForm from "@/components/helper/HelperApplicationForm";
import SubAgentsPanel from "@/components/agency/SubAgentsPanel";
import PayrollHelperWelcomeModal from "@/components/agency/PayrollHelperWelcomeModal";
import { formatNumber as formatNum } from "@/utils/formatNumber";
import { recordClientError } from "@/utils/clientErrorLog";

const fmtNum = (num: number | null | undefined) => formatNum(num);

const premiumCardClass = "relative overflow-hidden group p-5 rounded-3xl border border-white/10 bg-gradient-to-br transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-black/20 cursor-pointer";

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

const AgencyDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [showHelperForm, setShowHelperForm] = useState(false);
  const [helperData, setHelperData] = useState<any>(null);
  const [isHelperLoading, setIsHelperLoading] = useState(true);
  const [showPayrollWelcome, setShowPayrollWelcome] = useState(false);
  const [searchParams] = useSearchParams();

  const handleCopyCode = () => {
    if (!agency?.agency_code) return;
    navigator.clipboard.writeText(agency.agency_code);
    toast({
      title: "Success",
      description: "Agency code copied to clipboard",
    });
  };

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const fetchData = async () => {
      const user = await getCachedUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Initial Fetch
      const { data: agencyData, error } = await supabase
        .from("agencies")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching agency:", error);
        setIsLoading(false);
        return;
      }

      if (!agencyData) {
        navigate("/agency");
        return;
      }

      setAgency(agencyData);
      setIsLoading(false);

      // Subscribe for Zero Refresh Instant Updates
      cleanup = subscribeToTables(
        ["agencies"],
        (payload) => {
          if (payload.new && payload.new.owner_id === user.id) {
            setAgency(prev => ({ ...prev, ...payload.new }));
          }
        },
        "agency_dashboard_sync"
      );

      // Check Helper Status
      const { data: helperStatus } = await supabase
        .from("topup_helpers")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      
      setHelperData(helperStatus);
      setIsHelperLoading(false);

      if (searchParams.get("welcome") === "helper") {
        setShowPayrollWelcome(true);
      }
    };

    fetchData();
    return () => cleanup?.();
  }, [navigate, searchParams]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
        <Loader2 className="w-12 h-12 text-brand-500 animate-spin mb-4" />
        <p className="text-slate-400 font-medium">Loading Dashboard...</p>
      </div>
    );
  }

  if (!agency) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24 overflow-x-hidden">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 safe-area-top">
        <div className="flex items-center h-16 px-4 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center font-bold text-lg tracking-tight">
            Agency Management
          </div>
          <button onClick={() => navigate("/settings")} className="p-2 -mr-2 hover:bg-white/10 rounded-full transition-colors">
            <Settings className="w-6 h-6 text-slate-400" />
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {/* Agency Info Card */}
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-600 via-brand-500 to-indigo-600 p-6 shadow-2xl shadow-brand-500/20">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />
          
          <div className="relative flex items-center gap-4 mb-6">
            <div className="relative">
              <Avatar className="w-20 h-20 border-4 border-white/20 shadow-xl ring-4 ring-black/10">
                <AvatarImage src={agency.logo_url || undefined} />
                <AvatarFallback className="bg-white/20 text-white text-2xl font-bold">
                  {agency.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <Badge className="absolute -bottom-1 -right-1 bg-yellow-400 text-black border-2 border-white font-black px-2 py-0.5 text-[10px] uppercase shadow-lg">
                Level {agency.level}
              </Badge>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-black truncate drop-shadow-md tracking-tight">{agency.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-white/80 text-sm font-mono flex items-center gap-1 bg-black/20 px-2 py-0.5 rounded-full border border-white/10">
                  <Hash className="w-3.5 h-3.5" />
                  {agency.agency_code}
                </p>
                <button onClick={handleCopyCode} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3 relative">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
              <p className="text-white/60 text-[10px] uppercase font-black tracking-widest mb-1">Total Hosts</p>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-200" />
                <p className="text-xl font-black">{fmtNum(agency.total_hosts)}</p>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
              <p className="text-white/60 text-[10px] uppercase font-black tracking-widest mb-1">Rate</p>
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-brand-200" />
                <p className="text-xl font-black">{agency.commission_rate}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Overview (Zero Refresh Sync) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
              <Wallet className="w-5 h-5 text-brand-400" />
              Financial Stats
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/50 rounded-3xl p-5 border border-white/5 space-y-1 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-brand-500/5 rounded-full translate-x-1/2 -translate-y-1/2 blur-xl group-hover:bg-brand-500/10 transition-colors" />
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Wallet Balance</p>
              <div className="flex items-baseline gap-1">
                <p className="text-2xl font-black text-white">{fmtNum(agency.wallet_balance)}</p>
                <span className="text-slate-500 text-[10px] font-bold">USD</span>
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-3xl p-5 border border-white/5 space-y-1 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-full translate-x-1/2 -translate-y-1/2 blur-xl group-hover:bg-indigo-500/10 transition-colors" />
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Beans Balance</p>
              <div className="flex items-baseline gap-1">
                <p className="text-2xl font-black text-indigo-400">{fmtNum(agency.beans_balance || 0)}</p>
                <span className="text-slate-500 text-[10px] font-bold">BN</span>
              </div>
            </div>
          </div>
        </section>

        {/* Premium Actions Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div 
            onClick={() => navigate("/agency-host-management")}
            className={`${premiumCardClass} from-slate-900 to-slate-900/80 hover:from-brand-900/20 hover:to-brand-900/10 border-brand-500/20`}
          >
            <HostsIcon3D />
            <h3 className="font-black text-lg mt-4 mb-1">Host List</h3>
            <p className="text-slate-400 text-xs leading-tight">Manage and track host performance</p>
            <ArrowRight className="absolute bottom-5 right-5 w-5 h-5 text-brand-500/50 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
          </div>

          <div 
            onClick={() => navigate("/agency-withdrawal")}
            className={`${premiumCardClass} from-slate-900 to-slate-900/80 hover:from-success-900/20 hover:to-success-900/10 border-success-500/20`}
          >
            <WithdrawIcon3D />
            <h3 className="font-black text-lg mt-4 mb-1">Withdraw</h3>
            <p className="text-slate-400 text-xs leading-tight">Fast payment to your local account</p>
            <ArrowRight className="absolute bottom-5 right-5 w-5 h-5 text-success-500/50 group-hover:text-success-400 group-hover:translate-x-1 transition-all" />
          </div>

          <div 
            onClick={() => navigate("/agency-commission-history")}
            className={`${premiumCardClass} from-slate-900 to-slate-900/80 hover:from-indigo-900/20 hover:to-indigo-900/10 border-indigo-500/20`}
          >
            <RankingIcon3D />
            <h3 className="font-black text-lg mt-4 mb-1">Ranking</h3>
            <p className="text-slate-400 text-xs leading-tight">Agency leaderboard & rewards</p>
            <ArrowRight className="absolute bottom-5 right-5 w-5 h-5 text-indigo-500/50 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
          </div>

          <div 
            onClick={() => setShowHelperForm(true)}
            className={`${premiumCardClass} from-slate-900 to-slate-900/80 hover:from-orange-900/20 hover:to-orange-900/10 border-orange-500/20`}
          >
            <HelperIcon3D />
            <h3 className="font-black text-lg mt-4 mb-1">Helper</h3>
            <p className="text-slate-400 text-xs leading-tight">Become a top-up & payment partner</p>
            <ArrowRight className="absolute bottom-5 right-5 w-5 h-5 text-orange-500/50 group-hover:text-orange-400 group-hover:translate-x-1 transition-all" />
          </div>

          <div 
            onClick={() => navigate("/agency-coin-exchange")}
            className={`${premiumCardClass} from-slate-900 to-slate-900/80 hover:from-amber-900/20 hover:to-amber-900/10 border-amber-500/20`}
          >
            <DiamondExchangeIcon3D />
            <h3 className="font-black text-lg mt-4 mb-1">Exchange</h3>
            <p className="text-slate-400 text-xs leading-tight">Convert beans to diamonds instantly</p>
            <ArrowRight className="absolute bottom-5 right-5 w-5 h-5 text-amber-500/50 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
          </div>

          <div 
            onClick={() => navigate("/agency-policy")}
            className={`${premiumCardClass} from-slate-900 to-slate-900/80 hover:from-slate-800 hover:to-slate-800/80 border-slate-700/50`}
          >
            <PolicyIcon3D />
            <h3 className="font-black text-lg mt-4 mb-1">Policy</h3>
            <p className="text-slate-400 text-xs leading-tight">Official rules & agency guidelines</p>
            <ArrowRight className="absolute bottom-5 right-5 w-5 h-5 text-slate-500/50 group-hover:text-slate-300 group-hover:translate-x-1 transition-all" />
          </div>
        </div>

        {/* Sub-Agents Panel Integration */}
        <SubAgentsPanel agencyId={agency.id} />

        {/* History Action */}
        <div 
          onClick={() => navigate("/agency-transfer-history")}
          className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-3xl border border-white/5 active:scale-95 transition-transform cursor-pointer"
        >
          <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center">
            <HistoryIcon3D />
          </div>
          <div className="flex-1">
            <h4 className="font-bold">Transaction History</h4>
            <p className="text-slate-500 text-xs">All deposits, withdrawals & exchanges</p>
          </div>
          <ChevronRight className="text-slate-600" />
        </div>
      </div>

      {/* Navigation Bar Spacing */}
      <div className="h-10" />

      {/* Helper Application Modal */}
      <Dialog open={showHelperForm} onOpenChange={setShowHelperForm}>
        <DialogContent className="sm:max-w-[425px] bg-slate-950 border-slate-900 p-0 overflow-hidden">
          <HelperApplicationForm 
            onSuccess={() => {
              setShowHelperForm(false);
              toast({
                title: "Application Submitted",
                description: "Our team will review your helper application within 24 hours.",
              });
            }} 
          />
        </DialogContent>
      </Dialog>

      {/* Payroll Helper Welcome Modal */}
      <PayrollHelperWelcomeModal 
        isOpen={showPayrollWelcome} 
        onClose={() => setShowPayrollWelcome(false)} 
      />
    </div>
  );
};

export default AgencyDashboard;