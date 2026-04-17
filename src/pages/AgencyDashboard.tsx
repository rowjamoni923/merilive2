import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
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
import { getCachedUser } from "@/utils/cachedAuth";
import { HostsIcon3D, WithdrawIcon3D, RankingIcon3D, HelperIcon3D, DiamondExchangeIcon3D, PolicyIcon3D, HistoryIcon3D } from "@/components/agency/Premium3DIcons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Area, AreaChart } from "recharts";
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

// Helper for formatting numbers with English numerals
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

interface AgencyHost {
  id: string;
  host_id: string;
  joined_at: string;
  status: string;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
    is_online: boolean | null;
    total_earnings: number | null;
    is_verified: boolean | null;
  } | null;
}

interface PerformanceData {
  total_income: number;
  new_hosts_count: number;
  total_host_hours: number;
  golden_host_income: number;
}

interface SubAgent {
  id: string;
  user_id: string;
  referral_code: string;
  commission_rate: number;
  total_referrals: number;
  total_earnings: number;
  status: string;
  joined_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

const CHART_COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

interface WithdrawalHistory {
  id: string;
  amount: number;
  status: string;
  payment_method: string;
  requested_at: string;
  helper_processed_at?: string | null;
  payment_details?: {
    country_code?: string;
    currency_code?: string;
    local_amount?: number;
  } | null;
}

const AgencyDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [actualCommissionRate, setActualCommissionRate] = useState<number>(0);
  const [levelTierInfo, setLevelTierInfo] = useState<LevelTier | null>(null);
  const [hosts, setHosts] = useState<AgencyHost[]>([]);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalHistory[]>([]);
  const [showWithdrawalHistory, setShowWithdrawalHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [subAgentLink, setSubAgentLink] = useState("");
  const [hostJoinLink, setHostJoinLink] = useState("");
  const [coinsToUsdRate, setCoinsToUsdRate] = useState(9000); // 9000 beans = $1 (as per policy)
  const [localExchangeRate, setLocalExchangeRate] = useState(1); // Default USD rate
  const [localCurrency, setLocalCurrency] = useState({ code: 'USD', symbol: '$', flag: '🇺🇸' });
  const [userCountryCode, setUserCountryCode] = useState('US');
  const [hasHelperAccess, setHasHelperAccess] = useState(false);
  const [isLevel5Helper, setIsLevel5Helper] = useState(false);
  const [helperPendingApplication, setHelperPendingApplication] = useState(false);
  const [showHelperDialog, setShowHelperDialog] = useState(false);
  const [helperContactInfo, setHelperContactInfo] = useState<{whatsapp?: string; email?: string; telegram?: string} | null>(null);
  const [applyingForHelper, setApplyingForHelper] = useState(false);
  const [helperPendingCount, setHelperPendingCount] = useState(0);
  const prevHelperPendingCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [pendingHosts, setPendingHosts] = useState<any[]>([]);
  const [approvingHostId, setApprovingHostId] = useState<string | null>(null);
  const [rejectingHostId, setRejectingHostId] = useState<string | null>(null);
  
  // Host earnings and agency commission tracking
  const [totalHostEarningsFromTransfers, setTotalHostEarningsFromTransfers] = useState(0);
  const [totalAgencyCommission, setTotalAgencyCommission] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0); // Track total withdrawn amounts
  const [ownerPersonalBeans, setOwnerPersonalBeans] = useState(0); // Agency owner's personal beans from gifts/calls
  
  // Parent agency info (if this is a sub-agency)
  const [parentAgency, setParentAgency] = useState<ParentAgencyInfo | null>(null);
  const [showParentContactModal, setShowParentContactModal] = useState(false);
  const [showSubAgentsPanel, setShowSubAgentsPanel] = useState(false);
  const [subAgencyCount, setSubAgencyCount] = useState(0);
  const [subAgencies, setSubAgencies] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Initialize notification sound
  useEffect(() => {
    // Create audio element for notification sound
    audioRef.current = new Audio('data:audio/wav;base64,UklGRl9vT19telefonering/2FBBQw==');
    // Use a simple beep sound created via Web Audio API
    return () => {
      if (audioRef.current) {
        audioRef.current = null;
      }
    };
  }, []);

  // Play notification sound function
  const playNotificationSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // Frequency in Hz
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      // Play second beep
      setTimeout(() => {
        const oscillator2 = audioContext.createOscillator();
        const gainNode2 = audioContext.createGain();
        
        oscillator2.connect(gainNode2);
        gainNode2.connect(audioContext.destination);
        
        oscillator2.frequency.value = 1000;
        oscillator2.type = 'sine';
        
        gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator2.start(audioContext.currentTime);
        oscillator2.stop(audioContext.currentTime + 0.3);
      }, 200);
    } catch (error) {
      console.log('Could not play notification sound:', error);
    }
  }, []);

  // Watch for helper pending count changes and play sound
  useEffect(() => {
    if (helperPendingCount > prevHelperPendingCountRef.current && prevHelperPendingCountRef.current !== 0) {
      // New request arrived, play sound
      playNotificationSound();
    }
    prevHelperPendingCountRef.current = helperPendingCount;
  }, [helperPendingCount, playNotificationSound]);
  
  // Country flags mapping
  const countryFlags: Record<string, string> = {
    'BD': '🇧🇩', 'US': '🇺🇸', 'IN': '🇮🇳', 'PK': '🇵🇰', 'NP': '🇳🇵',
    'AE': '🇦🇪', 'SA': '🇸🇦', 'KW': '🇰🇼', 'QA': '🇶🇦', 'OM': '🇴🇲',
    'MY': '🇲🇾', 'SG': '🇸🇬', 'GB': '🇬🇧', 'AU': '🇦🇺', 'CA': '🇨🇦',
    'EU': '🇪🇺', 'JP': '🇯🇵', 'KR': '🇰🇷'
  };

  useEffect(() => {
    const fetchData = async () => {
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

        if (agencyError) {
          console.error('[AgencyDashboard] Error fetching agency:', agencyError);
        }
        if (!agencyData) {
          navigate("/agency");
          return;
        }

        setAgency(agencyData);
        setCurrentUserId(user.id);

        // Generate sub-agent link AND host join link (dynamic import but non-blocking)
        import('@/utils/shareLinks').then(({ generateSubAgentLink, generateAgencyJoinLink }) => {
          setSubAgentLink(generateSubAgentLink(agencyData.agency_code));
          setHostJoinLink(generateAgencyJoinLink(agencyData.agency_code));
        });

        // ===== BATCH 1: All independent queries in parallel =====
        const [
          parentRes,
          ownerHelperRes,
          hostsRes,
          pendingHostsRes,
          perfHistoryRes,
          perfWeeklyRes,
          subAgenciesRes,
          subAgentsRes,
          beansRateRes,
          userProfileRes,
          helperRes,
          contactSettingsRes,
          withdrawalRes,
          transfersRes
        ] = await Promise.all([
          // 1. Parent agency
          agencyData.parent_agency_id
            ? supabase.from("agencies").select("id, name, agency_code, level, owner_id").eq("id", agencyData.parent_agency_id).maybeSingle()
            : Promise.resolve({ data: null }),
          // 2. Owner helper data
          supabase.from("topup_helpers").select("trader_level, payroll_enabled, is_verified, is_active").eq("user_id", user.id).maybeSingle(),
          // 3. Active Hosts
          supabase.from("agency_hosts").select("id, host_id, joined_at, status").eq("agency_id", agencyData.id).eq("status", "active"),
          // 3b. Pending Hosts
          supabase.from("agency_hosts").select("id, host_id, joined_at, status").eq("agency_id", agencyData.id).eq("status", "pending"),
          // 4. Performance history (daily)
          supabase.from("agency_performance").select("*").eq("agency_id", agencyData.id).eq("period_type", "daily").order("period_start", { ascending: true }).limit(7),
          // 5. Performance weekly
          supabase.from("agency_performance").select("total_income, new_hosts_count, total_host_hours, golden_host_income").eq("agency_id", agencyData.id).eq("period_type", "weekly").order("period_start", { ascending: false }).limit(1).maybeSingle(),
          // 6. Sub-agencies count
          supabase.from("agencies").select("id, name, agency_code, level, total_hosts, created_at, owner_id").eq("parent_agency_id", agencyData.id).eq("is_active", true),
          // 7. Sub-agents
          supabase.from("sub_agents").select("*").eq("agency_id", agencyData.id).eq("status", "active"),
          // 8. Beans rate
          supabase.from("app_settings").select("setting_value").eq("setting_key", "beans_to_usd_rate").maybeSingle(),
          // 9. User profile (country + personal beans)
          supabase.from('profiles').select('country_code, country_flag, beans').eq('id', user.id).single(),
          // 10. Helper data
          supabase.from("topup_helpers").select("id, is_verified, is_active, trader_level, payroll_enabled").eq("user_id", user.id).maybeSingle(),
          // 11. Helper contact settings
          supabase.from("app_settings").select("setting_value").eq("setting_key", "helper_contact_info").maybeSingle(),
          // 12. Withdrawals
          supabase.from('agency_withdrawals').select('id, amount, status, payment_method, requested_at, helper_processed_at, payment_details').eq('agency_id', agencyData.id).order('requested_at', { ascending: false }),
          // 13. Transfers (weekly host earnings + agency commission)
          supabase.from('agency_earnings_transfers').select('gift_earnings, call_earnings, amount, commission_rate').eq('agency_id', agencyData.id),
        ]);

        // ===== BATCH 2: All secondary queries in parallel =====
        const hostsData = hostsRes.data || [];
        const pendingHostsData = pendingHostsRes.data || [];
        const hostIds = hostsData.map(h => h.host_id);
        const pendingHostIds = pendingHostsData.map(h => h.host_id);
        const subAgentsData = subAgentsRes.data || [];
        const subAgentUserIds = subAgentsData.map(sa => sa.user_id);
        const countryCode = userProfileRes.data?.country_code || '';
        setOwnerPersonalBeans(Number(userProfileRes.data?.beans) || 0);
        // Map A1-A5 codes to DB tier level_codes for proper lookup
        const levelToTierMap: Record<string, string> = {
          'A1': 'bronze', 'A2': 'silver', 'A3': 'gold', 'A4': 'platinum', 'A5': 'diamond'
        };
        const effectiveLevel = agencyData.level || 'A1';
        const effectiveTierCode = levelToTierMap[effectiveLevel] || effectiveLevel;
        const helperData = helperRes.data;

        const [
          parentOwnerRes,
          tierRes,
          hostProfilesRes,
          pendingHostProfilesRes,
          subAgentProfilesRes,
          currencyRes,
          helperTopupCountRes,
          helperWithdrawalCountRes,
        ] = await Promise.all([
          // Parent owner profile
          parentRes.data?.owner_id
            ? supabase.from("profiles").select("display_name, avatar_url").eq("id", parentRes.data.owner_id).maybeSingle()
            : Promise.resolve({ data: null }),
          // Level tier
          supabase.from("agency_level_tiers").select("level_code, level_name, commission_rate, badge_color").eq("level_code", effectiveTierCode).eq("is_active", true).maybeSingle(),
          // Host profiles
          hostIds.length > 0
            ? supabase.from("profiles").select("id, display_name, avatar_url, is_online, total_earnings, is_verified").in("id", hostIds)
            : Promise.resolve({ data: [] }),
          // Pending host profiles
          pendingHostIds.length > 0
            ? supabase.from("profiles").select("id, display_name, avatar_url, app_uid").in("id", pendingHostIds)
            : Promise.resolve({ data: [] }),
          // Sub-agent profiles
          subAgentUserIds.length > 0
            ? supabase.from("profiles").select("id, display_name, avatar_url").in("id", subAgentUserIds)
            : Promise.resolve({ data: [] }),
          // Currency rate
          countryCode
            ? supabase.from('currency_rates').select('*').eq('country_code', countryCode).eq('is_active', true).single()
            : Promise.resolve({ data: null }),
          // Helper pending topup count
          helperData?.is_verified
            ? supabase.from("helper_orders").select("*", { count: 'exact', head: true }).eq("helper_id", helperData.id).eq("status", "pending")
            : Promise.resolve({ count: 0 }),
          // Helper pending withdrawal count
          helperData?.is_verified && helperData?.trader_level === 5 && helperData?.payroll_enabled
            ? supabase.from("agency_withdrawals").select("*", { count: 'exact', head: true }).eq("status", "pending")
            : Promise.resolve({ count: 0 }),
        ]);

        // ===== Process parent agency =====
        if (parentRes.data) {
          setParentAgency({
            ...parentRes.data,
            owner_profile: parentOwnerRes.data ? { ...parentOwnerRes.data, uid: null } : undefined
          });
        }

        // ===== Process level tier =====
        // Payroll-enabled agencies (Level 5 Helper) get 12% commission override
        const isPayrollAgency = ownerHelperRes.data?.is_verified && ownerHelperRes.data?.is_active && ownerHelperRes.data?.trader_level === 5 && ownerHelperRes.data?.payroll_enabled;
        const payrollCommissionRate = 12; // A5 Legend rate for payroll agencies
        
        if (tierRes.data) {
          const effectiveCommission = isPayrollAgency ? Math.max(tierRes.data.commission_rate, payrollCommissionRate) : tierRes.data.commission_rate;
          setActualCommissionRate(effectiveCommission);
          setLevelTierInfo(tierRes.data);
          const updates: Record<string, any> = {};
          if (agencyData.commission_rate !== effectiveCommission) updates.commission_rate = effectiveCommission;
          if (agencyData.level !== effectiveLevel) updates.level = effectiveLevel;
          if (Object.keys(updates).length > 0) {
            supabase.from("agencies").update(updates).eq("id", agencyData.id);
            setAgency(prev => prev ? { ...prev, ...updates } : prev);
          }
        } else {
          setActualCommissionRate(isPayrollAgency ? payrollCommissionRate : (agencyData.commission_rate || 0));
        }

        // ===== Process hosts =====
        const actualHostCount = hostsData.length;
        setHosts(hostsData.map(host => ({
          ...host,
          profile: (hostProfilesRes.data as any[])?.find((p: any) => p.id === host.host_id) || null
        })));
        if (agencyData.total_hosts !== actualHostCount) {
          supabase.from("agencies").update({ total_hosts: actualHostCount }).eq("id", agencyData.id);
          setAgency(prev => prev ? { ...prev, total_hosts: actualHostCount } : prev);
        }

        // ===== Process pending hosts =====
        setPendingHosts(pendingHostsData.map(host => ({
          ...host,
          profile: (pendingHostProfilesRes.data as any[])?.find((p: any) => p.id === host.host_id) || null
        })));

        // ===== Process sub-agencies =====
        const subAgenciesData = subAgenciesRes.data || [];
        const actualAgentCount = subAgenciesData.length;
        setSubAgencies(subAgenciesData);
        setSubAgencyCount(actualAgentCount);
        if (agencyData.total_agents !== actualAgentCount) {
          supabase.from("agencies").update({ total_agents: actualAgentCount }).eq("id", agencyData.id);
          setAgency(prev => prev ? { ...prev, total_agents: actualAgentCount } : prev);
        }

        // ===== Process performance history =====
        if (perfHistoryRes.data && perfHistoryRes.data.length > 0) {
          setWeeklyData(perfHistoryRes.data.map(p => ({
            date: new Date(p.period_start).toLocaleDateString('en-US', { weekday: 'short' }),
            income: p.total_income || 0,
            hours: p.total_host_hours || 0,
            hosts: p.new_hosts_count || 0
          })));
        } else {
          const days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
          setWeeklyData(days.map(day => ({ date: day, income: 0, hours: 0, hosts: 0 })));
        }

        if (perfWeeklyRes.data) setPerformance(perfWeeklyRes.data);
        // subAgencyCount already set above

        // ===== Process sub-agents =====
        setSubAgents(subAgentsData.map(sa => ({
          ...sa,
          profile: (subAgentProfilesRes.data as any[])?.find((p: any) => p.id === sa.user_id)
        })));

        // ===== Process beans rate =====
        if (beansRateRes.data?.setting_value) {
          const rateSettings = beansRateRes.data.setting_value as { rate?: number };
          if (rateSettings?.rate) setCoinsToUsdRate(rateSettings.rate);
        }

        // ===== Process country/currency =====
        setUserCountryCode(countryCode);
        if (currencyRes.data) {
          setLocalExchangeRate(currencyRes.data.rate_to_usd);
          setLocalCurrency({ code: currencyRes.data.currency_code, symbol: currencyRes.data.currency_symbol, flag: countryFlags[countryCode] || '🌍' });
        }

        // ===== Process helper access =====
        if (helperData) {
          if (helperData.is_verified && helperData.is_active) {
            setHasHelperAccess(true);
            if (helperData.trader_level === 5 && helperData.payroll_enabled) {
              setIsLevel5Helper(true);
            }
            setHelperPendingCount((helperTopupCountRes.count || 0) + (helperWithdrawalCountRes.count || 0));
          } else {
            setHelperPendingApplication(true);
          }
        }

        if (contactSettingsRes.data?.setting_value) {
          setHelperContactInfo(contactSettingsRes.data.setting_value as {whatsapp?: string; email?: string; telegram?: string});
        }

        // ===== Process withdrawals =====
        if (withdrawalRes.data) {
          setWithdrawals((withdrawalRes.data as WithdrawalHistory[]).slice(0, 10));
          const withdrawnTotal = withdrawalRes.data
            .filter(w => ['pending', 'processing', 'approved', 'completed'].includes(w.status))
            .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
          setTotalWithdrawn(withdrawnTotal);
        }

        // ===== Calculate total from weekly transfers =====
        const transfersData = transfersRes.data || [];
        const totalGrossEarnings = transfersData.reduce((sum, t) => sum + (Number(t.gift_earnings) || 0) + (Number(t.call_earnings) || 0), 0);
        // Calculate commission using each transfer's commission_rate
        const totalCommission = transfersData.reduce((sum, t) => {
          const gross = (Number(t.gift_earnings) || 0) + (Number(t.call_earnings) || 0);
          const rate = Number(t.commission_rate) || 0;
          return sum + Math.round(gross * rate / 100);
        }, 0);

        // Total Beans = gross host earnings (what shows as agency total)
        setTotalHostEarningsFromTransfers(totalGrossEarnings);
        // Agency Commission = calculated from commission_rate per transfer
        setTotalAgencyCommission(totalCommission);
      } catch (error) {
        console.error('[AgencyDashboard] Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Debounced refetch to prevent multiple rapid calls
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefetch = () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(() => fetchData(), 500);
    };

    // Real-time subscriptions for instant updates
    const channel = supabase
      .channel('agency-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agencies' },
        async (payload) => {
          if (payload.new && (payload.new as any).id === agency?.id) {
            setAgency(payload.new as Agency);
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_hosts' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_performance' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_diamond_transactions' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_withdrawals' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_level_tiers' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, debouncedRefetch)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'topup_helpers' },
        (payload) => {
          const newData = payload.new as any;
          if (newData?.is_verified && newData?.is_active) {
            setHasHelperAccess(true);
            if (newData.trader_level === 5 && newData.payroll_enabled) {
              setIsLevel5Helper(true);
            }
          } else if (newData && !newData.is_active) {
            setHasHelperAccess(false);
            setIsLevel5Helper(false);
          }
          debouncedRefetch();
        }
      )
      .subscribe();

    return () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      supabase.removeChannel(channel);
    };
  }, [navigate, agency?.id]);

  // ===== Approve/Reject Host Handlers =====
  const handleApproveHost = async (hostId: string) => {
    if (!agency) return;
    setApprovingHostId(hostId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.rpc('approve_host_request' as any, {
        _agency_id: agency.id,
        _host_id: hostId,
        _approver_id: user.id,
      });
      if (error) throw error;
      if (data) {
        toast({ title: "✅ Host Approved", description: "Host has been added to your agency!" });
        const approvedHost = pendingHosts.find(h => h.host_id === hostId);
        setPendingHosts(prev => prev.filter(h => h.host_id !== hostId));
        setHosts(prev => [...prev, { host_id: hostId, status: 'active', joined_at: new Date().toISOString(), id: '', profile: approvedHost?.profile }]);
        
        // Notify the host about approval
        import('@/utils/agencyNotifications').then(({ notifyHostApprovalResult }) => {
          notifyHostApprovalResult(hostId, agency.name, true);
        });
      } else {
        toast({ title: "Error", description: "Failed to approve host", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to approve", variant: "destructive" });
    } finally {
      setApprovingHostId(null);
    }
  };

  const handleRejectHost = async (hostId: string) => {
    if (!agency) return;
    setRejectingHostId(hostId);
    try {
      const { error } = await supabase
        .from('agency_hosts')
        .update({ status: 'rejected' })
        .eq('agency_id', agency.id)
        .eq('host_id', hostId)
        .eq('status', 'pending');
      if (error) throw error;
      toast({ title: "Host Rejected", description: "Request has been rejected" });
      setPendingHosts(prev => prev.filter(h => h.host_id !== hostId));
      
      // Notify the host about rejection
      import('@/utils/agencyNotifications').then(({ notifyHostApprovalResult }) => {
        notifyHostApprovalResult(hostId, agency.name, false);
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to reject", variant: "destructive" });
    } finally {
      setRejectingHostId(null);
    }
  };

  const copyAgencyCode = () => {
    if (agency) {
      navigator.clipboard.writeText(agency.agency_code);
      setCopiedCode(true);
      toast({ title: "Copied!", description: "Agency code copied to clipboard" });
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const copySubAgentLink = () => {
    navigator.clipboard.writeText(subAgentLink);
    toast({ title: "✅ Link Copied", description: "Sub-agent referral link copied" });
  };

  const copyHostJoinLink = () => {
    navigator.clipboard.writeText(hostJoinLink);
    toast({ title: "✅ Link Copied", description: "Host join link copied" });
  };

  const shareSubAgentLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `${agency?.name} - Become a Sub-Agent`,
        text: `Join my agency as a sub-agent and earn!`,
        url: subAgentLink
      });
    } else {
      copySubAgentLink();
    }
  };

  const shareHostJoinLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `${agency?.name} - Join as Host`,
        text: `Join my agency as a host and start earning!`,
        url: hostJoinLink
      });
    } else {
      copyHostJoinLink();
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  if (isLoading) {
    return <LoadingSpinner fullScreen text="Loading Dashboard..." />;
  }

  if (!agency) {
    return null;
  }

  const totalHostEarnings = hosts.reduce((sum, h) => sum + (h.profile?.total_earnings || 0), 0);
  const onlineHosts = hosts.filter(h => h.profile?.is_online).length;
  const totalSubAgentEarnings = subAgents.reduce((sum, sa) => sum + (sa.total_earnings || 0), 0);
  
  // Total Beans = wallet_balance (host earnings transferred to agency + agency commission)
  // This is the agency's withdrawable pool from host activities
  const agencyBeansBalance = agency.wallet_balance || 0;
  
  // Correct USD calculation: beans / rate = USD
  const usdValue = agencyBeansBalance / coinsToUsdRate;
  const localValue = usdValue * localExchangeRate;

  const getLevelInfo = (level: string) => {
    // Use database tier info if available, otherwise fallback to defaults
    const tierName = levelTierInfo?.level_name || '';
    
    switch (level) {
      case "A5": return { color: "from-purple-500 to-pink-500", icon: "👑", name: tierName || "Legend" };
      case "A4": return { color: "from-yellow-400 to-amber-500", icon: "🌟", name: tierName || "Elite" };
      case "A3": return { color: "from-gray-300 to-gray-400", icon: "✨", name: tierName || "Pro" };
      case "A2": return { color: "from-orange-400 to-red-400", icon: "🔥", name: tierName || "Rising" };
      case "A1": return { color: "from-slate-400 to-slate-500", icon: "⭐", name: tierName || "Starter" };
      default: return { color: "from-gray-400 to-gray-500", icon: "📌", name: tierName || "Basic" };
    }
  };

  // Use dynamic tier info from database if available
  const levelInfo = {
    ...getLevelInfo(agency.level || "A1"),
    name: levelTierInfo?.level_name || getLevelInfo(agency.level || "A1").name
  };

  const pieData = [
    { name: 'Host Commission', value: Math.floor(totalHostEarnings * 0.7) },
    { name: 'Sub-Agent Commission', value: totalSubAgentEarnings },
    { name: 'Wallet Balance', value: agencyBeansBalance }
  ];

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Modern Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 flex-shrink-0 safe-area-top">
        <div className="flex items-center justify-between h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Agency Dashboard
          </h1>
          <button 
            onClick={() => navigate("/agent-rank")}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <Trophy className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'var(--content-bottom-padding)'
        }}
      >

      {/* Agency Hero Card - Compact */}
      <div className="mx-3 -mt-0 relative">
        <div className={`bg-gradient-to-br ${levelInfo.color} rounded-2xl p-3 text-white shadow-xl relative overflow-hidden`}>
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-lg" />
          
          <div className="relative z-10">
            <div className="flex items-start gap-3">
              {agency.logo_url ? (
                <img 
                  src={agency.logo_url} 
                  alt={agency.name}
                  className="w-12 h-12 rounded-xl object-cover border-2 border-white/30 shadow-lg"
                />
              ) : (
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30">
                  <Building2 className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-lg">{levelInfo.icon}</span>
                  <div className={`bg-gradient-to-r ${levelInfo.color} px-2.5 py-0.5 rounded-full shadow-lg border border-white/30`}>
                    <span className="text-[11px] font-extrabold tracking-wide drop-shadow-md">
                      {agency.level} • {levelInfo.name}
                    </span>
                  </div>
                </div>
                <h2 className="text-lg font-bold truncate">{agency.name}</h2>
                <p className="text-white/80 text-xs flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  <span className="font-semibold">{actualCommissionRate}%</span> Commission Rate
                </p>
              </div>
            </div>

            {/* Agency Code Card - Compact */}
            <div className="mt-3 bg-white/15 backdrop-blur-sm rounded-xl p-2.5 flex items-center justify-between border border-white/20">
              <div>
                <p className="text-white/70 text-[10px] uppercase tracking-wide">Agency Code</p>
                <p className="font-mono font-bold text-base tracking-wider">{agency.agency_code}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyAgencyCode}
                className="text-white hover:bg-white/20 h-8 w-8 p-0 rounded-lg"
              >
                {copiedCode ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Quick Stats Grid - Mobile Optimized */}
            <div className="grid grid-cols-4 gap-1 mt-2">
              <button 
                onClick={() => navigate("/agency-host-management")}
                className="bg-white/15 backdrop-blur-sm rounded-lg p-1.5 text-center border border-white/10 hover:bg-white/25 transition-all active:scale-95 relative"
              >
                <Users className="w-3.5 h-3.5 mx-auto mb-0.5" />
                <p className="text-sm font-bold">{hosts.length || agency.total_hosts}</p>
                <p className="text-[7px] text-white/70 uppercase">Hosts</p>
                {pendingHosts.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {pendingHosts.length}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setShowSubAgentsPanel(true)}
                className="bg-white/15 backdrop-blur-sm rounded-lg p-1.5 text-center border border-white/10 hover:bg-white/25 transition-all active:scale-95"
              >
                <UserPlus className="w-3.5 h-3.5 mx-auto mb-0.5" />
                <p className="text-sm font-bold">{subAgencyCount || subAgents.length}</p>
                <p className="text-[7px] text-white/70 uppercase">Agents</p>
              </button>
              <div 
                className="bg-white/15 backdrop-blur-sm rounded-lg p-1.5 text-center border border-white/10 overflow-hidden"
              >
                <Diamond className="w-3.5 h-3.5 mx-auto mb-0.5" />
                <p className="text-xs font-bold truncate">
                  {agencyBeansBalance >= 1000000 
                    ? `${(agencyBeansBalance / 1000000).toFixed(1)}M`
                    : `${(agencyBeansBalance / 1000).toFixed(0)}K`}
                </p>
                <p className="text-[7px] text-white/70 uppercase">Beans</p>
              </div>
              <button 
                onClick={() => navigate("/agency-host-management?filter=online")}
                className="bg-white/15 backdrop-blur-sm rounded-lg p-1.5 text-center border border-white/10 hover:bg-white/25 transition-all active:scale-95"
              >
                <Activity className="w-3.5 h-3.5 mx-auto mb-0.5 text-green-300" />
                <p className="text-sm font-bold text-green-300">{onlineHosts}</p>
                <p className="text-[7px] text-white/70 uppercase">Online</p>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 7-Day Host Requirement Warning - Hidden for payroll-enabled agencies */}
      {agency && !isLevel5Helper && (() => {
        const createdAt = new Date(agency.created_at);
        const now = new Date();
        const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(0, 30 - daysSinceCreation);
        const activeHostCount = hosts.filter(h => h.status === 'active').length;
        const progress = Math.min((activeHostCount / 10) * 100, 100);
        
        if (activeHostCount < 10 && daysRemaining > 0) {
          return (
            <div className="mx-3 mt-2">
              <div className={`rounded-2xl p-3 border shadow-lg ${
                daysRemaining <= 5 
                  ? 'bg-gradient-to-r from-red-900/80 to-red-800/60 border-red-500/40' 
                  : daysRemaining <= 10 
                    ? 'bg-gradient-to-r from-amber-900/80 to-orange-800/60 border-amber-500/40'
                    : 'bg-gradient-to-r from-blue-900/80 to-indigo-800/60 border-blue-500/40'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    daysRemaining <= 5 ? 'bg-red-500/30' : daysRemaining <= 10 ? 'bg-amber-500/30' : 'bg-blue-500/30'
                  }`}>
                    <Clock className={`w-4 h-4 ${
                      daysRemaining <= 5 ? 'text-red-400' : daysRemaining <= 10 ? 'text-amber-400' : 'text-blue-400'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-xs font-bold">
                      ⚠️ {daysRemaining} Days Remaining
                    </p>
                    <p className="text-white/60 text-[10px]">
                      Minimum 10 active hosts required within 30 days
                    </p>
                  </div>
                  <div className={`text-lg font-black ${
                    daysRemaining <= 5 ? 'text-red-400' : daysRemaining <= 10 ? 'text-amber-400' : 'text-blue-400'
                  }`}>
                    {activeHostCount}/10
                  </div>
                </div>
                <Progress value={progress} className="h-2 bg-white/10" />
                <p className="text-white/50 text-[9px] mt-1.5 text-center">
                  {daysRemaining <= 5 
                    ? '⛔ Agency will be auto-deactivated if target not met!'
                    : `Add ${10 - activeHostCount} more hosts to secure your agency`
                  }
                </p>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Pending Host Requests */}
      {pendingHosts.length > 0 && (
        <div className="mx-3 mt-2">
          <div className="rounded-2xl bg-gradient-to-r from-amber-900/80 to-orange-800/60 border border-amber-500/40 p-3 shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-amber-500/30 rounded-full flex items-center justify-center">
                <Bell className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <p className="font-bold text-amber-100 text-sm">
                  🔔 {pendingHosts.length} Pending Host Request{pendingHosts.length > 1 ? 's' : ''}
                </p>
                <p className="text-[10px] text-amber-300/70">Approve or reject host join requests</p>
              </div>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pendingHosts.map((ph) => (
                <div key={ph.id} className="flex items-center justify-between bg-black/20 rounded-xl p-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-9 h-9 border-2 border-amber-500/40">
                      <AvatarImage src={ph.profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-amber-500/20 text-amber-200 text-xs">
                        {ph.profile?.display_name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-white text-sm font-medium">{ph.profile?.display_name || 'Unknown'}</p>
                      <p className="text-amber-300/60 text-[10px]">
                        {ph.profile?.app_uid ? `UID: ${ph.profile.app_uid}` : ''} • {new Date(ph.joined_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleApproveHost(ph.host_id)}
                      disabled={approvingHostId === ph.host_id || rejectingHostId === ph.host_id}
                      className="bg-green-600 hover:bg-green-500 text-white h-7 px-3 text-xs rounded-lg"
                    >
                      {approvingHostId === ph.host_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRejectHost(ph.host_id)}
                      disabled={approvingHostId === ph.host_id || rejectingHostId === ph.host_id}
                      className="text-red-400 hover:bg-red-500/20 h-7 px-2 text-xs rounded-lg"
                    >
                      {rejectingHostId === ph.host_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Parent Agency Card (if sub-agency) */}
      {parentAgency && (
        <div className="mx-4 mt-2">
          <Card className="bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 border-0 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="p-3 relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-white/70 text-[10px] uppercase tracking-wide">Parent Agency</p>
                    <p className="font-bold">{parentAgency.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className="bg-white/20 text-white text-[10px] h-4 px-1.5">
                        {parentAgency.level}
                      </Badge>
                      <span className="text-xs text-white/70">{parentAgency.agency_code}</span>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => setShowParentContactModal(true)}
                  size="sm"
                  className="bg-white/20 hover:bg-white/30 text-white border-0 h-8"
                >
                  <MessageCircle className="w-4 h-4 mr-1" />
                  Contact
                </Button>
              </div>
              
              {parentAgency.owner_profile && (
                <div className="mt-2 bg-white/10 rounded-lg p-2 flex items-center gap-2">
                  <Avatar className="w-8 h-8 border border-white/30">
                    <AvatarImage src={parentAgency.owner_profile.avatar_url || ""} />
                    <AvatarFallback className="bg-white/20 text-white text-xs">
                      {parentAgency.owner_profile.display_name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {parentAgency.owner_profile.display_name || "Agency Owner"}
                    </p>
                    <p className="text-[10px] text-white/60">Agency Owner</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Earnings Card - Compact */}
      <div className="mx-4 mt-2">
        <Card className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 border-0 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
          
          <CardContent className="p-3 relative z-10">
            {/* Total Beans (Host Earnings + Commission combined) */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white/80 text-[10px] uppercase tracking-wide">Total Beans</p>
                  <p className="text-xl font-bold">{fmtNum(agencyBeansBalance)}</p>
                  <p className="text-[9px] text-white/60">Withdrawable balance</p>
                </div>
              </div>
              <div className="text-right bg-white/20 backdrop-blur-sm rounded-lg p-2">
                <p className="text-white/80 text-[10px] flex items-center gap-0.5 justify-end">
                  <DollarSign className="w-2.5 h-2.5" />
                  USD Value
                </p>
                <p className="text-lg font-bold text-green-200">
                  ${usdValue.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Local Currency Value - Compact */}
            <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 mb-1.5 border border-white/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{localCurrency.flag}</span>
                  <span className="text-xs text-white/80">{localCurrency.code} Value</span>
                </div>
                <span className="text-sm font-bold text-cyan-200">
                  {localCurrency.symbol}{localValue.toFixed(2)}
                </span>
              </div>
            </div>
            
            {/* Exchange Rate Info - Compact */}
            <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 flex items-center justify-between mb-2 border border-white/20">
              <div className="flex items-center gap-1.5">
                <ArrowRightLeft className="w-3 h-3 text-white/70" />
                <span className="text-xs text-white/80">Exchange Rate</span>
              </div>
              <span className="text-[10px] font-semibold">
                {fmtNum(coinsToUsdRate)} Beans = $1 | $1 = {localCurrency.symbol}{localExchangeRate.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => navigate("/agency-withdrawal")}
                className="bg-white/20 hover:bg-white/30 text-white border-0 h-9 text-xs"
              >
                <Wallet className="w-4 h-4 mr-1.5" />
                Withdraw
              </Button>
              <Button
                onClick={() => setShowWithdrawalHistory(!showWithdrawalHistory)}
                className={`${showWithdrawalHistory ? 'bg-white/40' : 'bg-white/20'} hover:bg-white/30 text-white border-0 h-9 text-xs`}
              >
                <Calendar className="w-4 h-4 mr-1.5" />
                History
              </Button>
            </div>

            {/* Inline Withdrawal History */}
            {showWithdrawalHistory && (
              <div className="mt-3 bg-slate-900/90 backdrop-blur-md rounded-xl p-3 border border-slate-700/50 max-h-64 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-white/90">Withdrawal History</h4>
                  <button 
                    onClick={() => navigate("/agency-transfer-history")}
                    className="text-[10px] text-cyan-300 hover:underline"
                  >
                    View All →
                  </button>
                </div>
                
                {withdrawals.length === 0 ? (
                  <div className="text-center py-4 text-white/60 text-xs">
                    No withdrawal history yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {withdrawals.slice(0, 5).map((w) => (
                      <div 
                        key={w.id}
                        className="bg-slate-800/80 rounded-lg p-2.5 flex items-center justify-between border border-slate-700/40"
                      >
                        <div className="flex items-center gap-2">
                          {(() => {
                            const displayStatus = ((w as any).helper_processed_at && w.status === 'processing') || w.status === 'approved'
                              ? 'completed'
                              : w.status;
                            return (
                              <>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  displayStatus === 'completed' ? 'bg-green-500/30' :
                                  displayStatus === 'pending' ? 'bg-yellow-500/30' :
                                  displayStatus === 'processing' ? 'bg-blue-500/30' :
                                  displayStatus === 'rejected' ? 'bg-red-500/30' : 'bg-gray-500/30'
                                }`}>
                                  {displayStatus === 'completed' ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                                  ) : displayStatus === 'pending' ? (
                                    <Clock className="w-4 h-4 text-yellow-400" />
                                  ) : displayStatus === 'processing' ? (
                                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-400" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-white">
                                    {(w.amount / coinsToUsdRate).toFixed(2)} USD
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {w.payment_method?.toUpperCase()} • {new Date(w.requested_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                        {(() => {
                          const displayStatus = ((w as any).helper_processed_at && w.status === 'processing') || w.status === 'approved'
                            ? 'completed'
                            : w.status;
                          return (
                            <Badge className={`text-[10px] ${
                              displayStatus === 'completed' ? 'bg-green-500/20 text-green-400' :
                              displayStatus === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                              displayStatus === 'processing' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-red-500/20 text-red-400'
                            } border-0`}>
                              {displayStatus}
                            </Badge>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payroll Helper Guide Card */}
      <div className="mx-4 mt-3">
        <div 
          onClick={() => navigate('/payroll-helper-guide')}
          className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl p-3 cursor-pointer hover:from-indigo-500/30 hover:to-purple-500/30 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">📖 Payroll Helper Guide</p>
              <p className="text-white/60 text-[11px]">Learn roles, benefits & diamond trading</p>
            </div>
            <ArrowRight className="w-4 h-4 text-white/50" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mx-4 mt-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Quick Actions</h3>
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={() => navigate("/agency-host-management")}
            className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <HostsIcon3D />
            <span className="text-xs font-medium mt-1">Hosts</span>
          </button>
          <button
            onClick={() => navigate("/agency-withdrawal")}
            className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <WithdrawIcon3D />
            <span className="text-xs font-medium mt-1">Withdraw</span>
          </button>
          <button
            onClick={() => navigate("/agent-rank")}
            className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <RankingIcon3D />
            <span className="text-xs font-medium mt-1">Ranking</span>
          </button>
          <button
            onClick={() => {
              if (hasHelperAccess) {
                navigate(isLevel5Helper ? "/level5-helper-dashboard" : "/helper-dashboard");
              } else {
                setShowHelperDialog(true);
              }
            }}
            className={`bg-gradient-to-br ${hasHelperAccess ? 'from-green-500 to-emerald-500' : helperPendingApplication ? 'from-yellow-500 to-orange-500' : 'from-purple-500 to-pink-500'} rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform relative flex flex-col items-center justify-center`}
          >
            {hasHelperAccess && helperPendingCount > 0 && (
              <div className="absolute -top-2 -right-2 min-w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold px-1.5 shadow-lg animate-pulse border-2 border-white">
                {helperPendingCount > 99 ? '99+' : helperPendingCount}
              </div>
            )}
            {helperPendingApplication && !hasHelperAccess && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
            )}
            <HelperIcon3D />
            <span className="text-xs font-medium mt-1">
              {hasHelperAccess ? 'Helper' : helperPendingApplication ? 'Pending' : 'Helper'}
            </span>
          </button>
        </div>
        
        {/* Second Row - Diamond Exchange, Policy & History */}
        <div className="grid grid-cols-3 gap-3 mt-3">
          <button
            onClick={() => navigate("/agency-coin-exchange")}
            className="bg-gradient-to-br from-amber-500 to-red-500 rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <DiamondExchangeIcon3D />
            <span className="text-xs font-medium mt-1">Diamond Exchange</span>
          </button>
          <button
            onClick={() => navigate("/agency-policy")}
            className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <PolicyIcon3D />
            <span className="text-xs font-medium mt-1">Policy</span>
          </button>
          <button
            onClick={() => navigate("/agency-transfer-history")}
            className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <HistoryIcon3D />
            <span className="text-xs font-medium mt-1">History</span>
          </button>
        </div>

        {/* Third Row - Coin Trader, Commission, Agent Wallet, Sub-Agent */}
        <div className="grid grid-cols-4 gap-3 mt-3">
          <button
            onClick={() => navigate("/agency-coin-trader")}
            className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <ArrowRightLeft className="w-7 h-7 drop-shadow-md" />
            <span className="text-xs font-medium mt-1">Coin Trader</span>
          </button>
          <button
            onClick={() => navigate("/agency-commission-history")}
            className="bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <Percent className="w-7 h-7 drop-shadow-md" />
            <span className="text-xs font-medium mt-1">Commission</span>
          </button>
          <button
            onClick={() => navigate("/agent-wallet")}
            className="bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <Wallet className="w-7 h-7 drop-shadow-md" />
            <span className="text-xs font-medium mt-1">Agent Wallet</span>
          </button>
          <button
            onClick={() => navigate("/become-sub-agent")}
            className="bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl p-4 text-white text-center shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <UserPlus className="w-7 h-7 drop-shadow-md" />
            <span className="text-xs font-medium mt-1">Sub-Agent</span>
          </button>
        </div>
      </div>

      {/* Agency Information Card */}
      <div className="mx-4 mt-4">
        <Card className="border-0 shadow-md bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              Agency Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <Hash className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Agency Code</p>
                  <p className="font-bold">{agency.agency_code}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                  <Star className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Agency Level</p>
                  <p className="font-bold">{agency.level || 'A1'} - {levelInfo.name}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Host Commission Rate</p>
                  <p className="font-bold">{actualCommissionRate || 0}%</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-bold">{formatDate(agency.created_at)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section */}
      <div className="mx-4 mt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4 bg-muted/50 p-1 rounded-2xl h-12">
            <TabsTrigger value="overview" className="text-xs rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <BarChart3 className="w-4 h-4 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="hosts" className="text-xs rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Users className="w-4 h-4 mr-1" />
              Hosts
            </TabsTrigger>
            <TabsTrigger value="subagents" className="text-xs rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <UserPlus className="w-4 h-4 mr-1" />
              Agents
            </TabsTrigger>
            <TabsTrigger value="charts" className="text-xs rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <TrendingUp className="w-4 h-4 mr-1" />
              Charts
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Weekly Income Chart */}
            <Card className="border-0 shadow-md bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  Weekly Income
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyData}>
                      <defs>
                        <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px'
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="income" 
                        stroke="#8b5cf6" 
                        strokeWidth={3}
                        fill="url(#incomeGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Performance Stats */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-0 shadow-md bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20">
                <CardContent className="p-4">
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-800/50 rounded-xl flex items-center justify-center mb-2">
                    <Gift className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                    {fmtNum(performance?.total_income || 0)}
                  </p>
                  <p className="text-sm text-purple-600 dark:text-purple-400">Weekly Income</p>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-md bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
                <CardContent className="p-4">
                  <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-800/50 rounded-xl flex items-center justify-center mb-2">
                    <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                    {performance?.new_hosts_count || 0}
                  </p>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">New Hosts</p>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-md bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
                <CardContent className="p-4">
                  <div className="w-10 h-10 bg-amber-100 dark:bg-amber-800/50 rounded-xl flex items-center justify-center mb-2">
                    <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                    {(performance?.total_host_hours || 0).toFixed(1)}h
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">Live Hours</p>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-md bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20">
                <CardContent className="p-4">
                  <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-800/50 rounded-xl flex items-center justify-center mb-2">
                    <Crown className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                    {fmtNum(performance?.golden_host_income || 0)}
                  </p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">Golden Income</p>
                </CardContent>
              </Card>
            </div>

            {/* Statistics Card */}
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  Total Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-muted-foreground">Total Host Earnings</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmtNum(totalHostEarnings)}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-muted-foreground">Your Commission ({actualCommissionRate}%)</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">
                    {fmtNum(Math.floor(totalHostEarnings * actualCommissionRate / 100))}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border">
                  <span className="text-muted-foreground">Sub-Agent Commission</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{fmtNum(totalSubAgentEarnings)}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-muted-foreground">Agency Created</span>
                  <span className="font-medium">{formatDate(agency.created_at)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Withdrawal History */}
            <Card className="border-0 shadow-md bg-gradient-to-br from-slate-800 to-slate-900">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2 text-white">
                    <div className="w-10 h-10 bg-indigo-500/30 rounded-xl flex items-center justify-center">
                      <Clock className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <span>Withdrawal History</span>
                      <p className="text-xs font-normal text-slate-400">{withdrawals.length} total requests</p>
                    </div>
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => navigate('/agency-withdrawal')}
                    className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20"
                  >
                    View All
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {withdrawals.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Wallet className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No withdrawal history yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {withdrawals.slice(0, 5).map((withdrawal) => {
                      const wCurrency = withdrawal.payment_details?.currency_code || 'BDT';
                      const localAmt = withdrawal.payment_details?.local_amount || 0;
                      
                      // For agency view: if helper has processed payment, show as "approved"
                      const displayStatus = ((withdrawal.status === 'processing' && withdrawal.helper_processed_at) || withdrawal.status === 'approved')
                        ? 'completed'
                        : withdrawal.status;
                      
                      const statusConfig: Record<string, { iconBg: string; text: string }> = {
                        completed: { iconBg: 'bg-emerald-500', text: 'text-emerald-400' },
                        pending: { iconBg: 'bg-amber-500', text: 'text-amber-400' },
                        processing: { iconBg: 'bg-blue-500', text: 'text-blue-400' },
                        rejected: { iconBg: 'bg-red-500', text: 'text-red-400' },
                        approved: { iconBg: 'bg-emerald-500', text: 'text-emerald-400' }
                      };
                      const config = statusConfig[displayStatus] || statusConfig.pending;
                      
                      const countryFlag = withdrawal.payment_details?.country_code === 'BD' ? '🇧🇩' :
                        withdrawal.payment_details?.country_code === 'IN' ? '🇮🇳' :
                        withdrawal.payment_details?.country_code === 'PK' ? '🇵🇰' :
                        withdrawal.payment_details?.country_code === 'NP' ? '🇳🇵' : '🌍';
                      
                      return (
                        <div 
                          key={withdrawal.id}
                          onClick={() => navigate('/agency-withdrawal')}
                          className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/50 hover:bg-slate-700/70 transition-colors cursor-pointer"
                        >
                          {/* Status Icon */}
                          <div className={`w-12 h-12 rounded-xl ${config.iconBg} flex items-center justify-center shadow-lg shrink-0`}>
                            {displayStatus === 'pending' && <Clock className="w-6 h-6 text-white" />}
                            {displayStatus === 'processing' && <Loader2 className="w-6 h-6 text-white animate-spin" />}
                            {displayStatus === 'completed' && <CheckCircle2 className="w-6 h-6 text-white" />}
                            {displayStatus === 'approved' && <CheckCircle2 className="w-6 h-6 text-white" />}
                            {displayStatus === 'rejected' && <Clock className="w-6 h-6 text-white" />}
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{countryFlag}</span>
                              <span className="text-white font-bold">{fmtNum(withdrawal.amount)}</span>
                              <span className="text-slate-400 text-sm">Beans</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="bg-gradient-to-r from-pink-500/30 to-purple-500/30 text-pink-300 px-2 py-0.5 rounded-md text-xs font-medium border border-pink-500/30">
                                {withdrawal.payment_method?.toUpperCase()}
                              </span>
                              <span className="text-slate-500">•</span>
                              <span className="text-slate-400 text-xs">
                                {new Date(withdrawal.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                          
                          {/* Amount & Status */}
                          <div className="text-right shrink-0">
                            <p className={`font-bold ${config.text}`}>
                              {wCurrency === 'BDT' ? '৳' : wCurrency === 'INR' ? '₹' : '$'}{localAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </p>
                            <p className={`text-xs font-medium ${config.text} capitalize`}>
                              {displayStatus}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Hosts Tab */}
          <TabsContent value="hosts" className="mt-4 space-y-4">
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                    <Crown className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  Top Performers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {hosts
                  .sort((a, b) => (b.profile?.total_earnings || 0) - (a.profile?.total_earnings || 0))
                  .slice(0, 5)
                  .map((host, index) => (
                    <div 
                      key={host.id}
                      className="flex items-center gap-3 py-3 border-b border-border last:border-0"
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400' :
                        index === 1 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' :
                        index === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {index + 1}
                      </span>
                      <Avatar className="w-10 h-10 border-2 border-border">
                        <AvatarImage src={host.profile?.avatar_url || ""} />
                        <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{host.profile?.display_name || "Host"}</p>
                          {host.profile?.is_online && (
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          )}
                          {host.profile?.is_verified && (
                            <CheckCircle2 className="w-4 h-4 text-blue-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">Joined: {formatDate(host.joined_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-600 dark:text-emerald-400">{fmtNum(host.profile?.total_earnings || 0)}</p>
                        <p className="text-xs text-muted-foreground">Earnings</p>
                      </div>
                    </div>
                  ))}
                
                {hosts.length === 0 && (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-3">
                      <Users className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">No hosts yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Host Invite Link Card */}
            <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800/50 rounded-xl flex items-center justify-center">
                    <LinkIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-blue-800 dark:text-blue-200">Host Invite Link</h3>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Share to recruit new hosts</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={copyHostJoinLink}
                    variant="outline" 
                    className="flex-1 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                  <Button 
                    onClick={shareHostJoinLink}
                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={() => navigate("/agency-host-management")}
              className="w-full h-12 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 rounded-xl"
            >
              <Users className="w-5 h-5 mr-2" />
              Manage All Hosts
            </Button>
          </TabsContent>

          {/* Sub-Agents Tab */}
          <TabsContent value="subagents" className="mt-4 space-y-4">
            <Card className="border-0 shadow-md bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-orange-100 dark:bg-orange-800/50 rounded-xl flex items-center justify-center">
                    <LinkIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-orange-800 dark:text-orange-200">Referral Link</h3>
                    <p className="text-xs text-orange-600 dark:text-orange-400">Share to add sub-agents</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={copySubAgentLink}
                    variant="outline" 
                    className="flex-1 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                  <Button 
                    onClick={shareSubAgentLink}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{subAgents.length}</p>
                  <p className="text-sm text-muted-foreground">Total Sub-Agents</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">{fmtNum(totalSubAgentEarnings)}</p>
                  <p className="text-sm text-muted-foreground">Total Commission</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sub-Agent List</CardTitle>
              </CardHeader>
              <CardContent>
                {subAgents.length > 0 ? (
                  <div className="space-y-3">
                    {subAgents.map((sa) => (
                      <div key={sa.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                        <Avatar className="w-10 h-10 border-2 border-border">
                          <AvatarImage src={sa.profile?.avatar_url || ""} />
                          <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{sa.profile?.display_name || "Sub-Agent"}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Code: {sa.referral_code}</span>
                            <span>•</span>
                            <span>{sa.total_referrals} Referrals</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600 dark:text-green-400">{fmtNum(sa.total_earnings)}</p>
                          <p className="text-xs text-muted-foreground">{sa.commission_rate}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-3">
                      <UserPlus className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">No sub-agents yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Share the link above</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sub-Agencies List */}
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  Sub-Agencies ({subAgencyCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {subAgencies.length > 0 ? (
                  <div className="space-y-3">
                    {subAgencies.map((sa: any) => (
                      <div key={sa.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{sa.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{sa.agency_code}</span>
                            <span>•</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{sa.level || 'A1'}</Badge>
                            <span>•</span>
                            <span>{sa.total_hosts || 0} Hosts</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <div className="w-14 h-14 mx-auto bg-muted rounded-full flex items-center justify-center mb-3">
                      <Building2 className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">No sub-agencies yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Share the referral link to recruit</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20">
              <CardContent className="p-4">
                <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-3 flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Commission Structure
                </h3>
                <ul className="text-sm text-purple-700 dark:text-purple-300 space-y-2">
                  <li className="flex items-center justify-between py-2 border-b border-purple-200 dark:border-purple-800">
                    <span>Sub-Agent Base Commission:</span>
                    <span className="font-bold">2%</span>
                  </li>
                  <li className="flex items-center justify-between py-2 border-b border-purple-200 dark:border-purple-800">
                    <span>Top Performer Bonus:</span>
                    <span className="font-bold">+1%</span>
                  </li>
                  <li className="flex items-center justify-between py-2">
                    <span>10+ Referral Bonus:</span>
                    <span className="font-bold">+0.5%</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Charts Tab */}
          <TabsContent value="charts" className="mt-4 space-y-4">
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  Income Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="income" 
                        stroke="#8b5cf6" 
                        strokeWidth={3}
                        dot={{ fill: '#8b5cf6', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  Live Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                      <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px'
                        }}
                      />
                      <Bar dataKey="hours" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  Earnings Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 mt-3 flex-wrap">
                  {pieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: CHART_COLORS[index] }}
                      />
                      <span className="text-muted-foreground">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
              <CardContent className="p-4">
                <h3 className="font-semibold text-green-800 dark:text-green-200 mb-3 flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Compared to Last Week
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/60 dark:bg-white/10 rounded-xl p-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
                      <TrendingUp className="w-5 h-5" />
                      <span className="text-xl font-bold">+12%</span>
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">Income Growth</p>
                  </div>
                  <div className="bg-white/60 dark:bg-white/10 rounded-xl p-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400">
                      <TrendingUp className="w-5 h-5" />
                      <span className="text-xl font-bold">+8%</span>
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Host Activity</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Helper Dialog - Different views based on status */}
      <Dialog open={showHelperDialog} onOpenChange={setShowHelperDialog}>
        <DialogContent className="max-w-sm mx-auto max-h-[85vh] overflow-y-auto">
          {helperPendingApplication && !hasHelperAccess ? (
            // Pending Application View
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  Application Pending
                </DialogTitle>
                <DialogDescription>
                  Your helper application is being reviewed by admin.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 mt-4">
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl p-6 text-center border border-yellow-200">
                  <div className="w-16 h-16 mx-auto bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                    <Clock className="w-8 h-8 text-yellow-600" />
                  </div>
                  <h3 className="font-bold text-yellow-800 text-lg">Under Review</h3>
                  <p className="text-sm text-yellow-700 mt-2">
                    Your application to become a Helper/Diamond Trader is currently under review. 
                    You will be notified once approved.
                  </p>
                </div>
                
                <div className="bg-muted rounded-xl p-4">
                  <h4 className="font-semibold text-sm mb-2">What happens next?</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Admin will review your application</li>
                    <li>• You'll receive a notification when approved</li>
                    <li>• Once approved, you can start selling diamonds</li>
                  </ul>
                </div>
              </div>
            </>
          ) : (
            // Not Applied Yet - Show Application Form using the dedicated component
            <HelperApplicationForm 
              agencyId={agency?.id}
              onSuccess={() => {
                setShowHelperDialog(false);
                setHelperPendingApplication(true);
              }}
              onClose={() => setShowHelperDialog(false)}
            />
          )}

          <Button 
            variant="outline" 
            className="w-full mt-4"
            onClick={() => setShowHelperDialog(false)}
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>

      {/* Parent Agency Contact Modal */}
      <Dialog open={showParentContactModal} onOpenChange={setShowParentContactModal}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              Contact Parent Agency
            </DialogTitle>
            <DialogDescription>
              Communicate with your parent agency owner
            </DialogDescription>
          </DialogHeader>
          
          {parentAgency && (
            <div className="space-y-4 mt-4">
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-4 border border-purple-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-lg text-purple-800">{parentAgency.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-100 text-purple-700 text-xs">
                        {parentAgency.level}
                      </Badge>
                      <span className="text-xs text-purple-600">{parentAgency.agency_code}</span>
                    </div>
                  </div>
                </div>

                {parentAgency.owner_profile && (
                  <div className="bg-white rounded-xl p-3 flex items-center gap-3">
                    <Avatar className="w-12 h-12 border-2 border-purple-200">
                      <AvatarImage src={parentAgency.owner_profile.avatar_url || ""} />
                      <AvatarFallback className="bg-purple-100 text-purple-700">
                        {parentAgency.owner_profile.display_name?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">{parentAgency.owner_profile.display_name || "Agency Owner"}</p>
                      <p className="text-xs text-gray-500">Agency Owner</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Button
                  onClick={() => {
                    navigate(`/chat?user=${parentAgency.owner_id}`);
                    setShowParentContactModal(false);
                  }}
                  className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Message
                </Button>
                <Button
                  onClick={() => {
                    navigate(`/profile/${parentAgency.owner_id}`);
                    setShowParentContactModal(false);
                  }}
                  variant="outline"
                  className="w-full"
                >
                  <User className="w-4 h-4 mr-2" />
                  View Profile
                </Button>
              </div>

              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <p className="text-xs text-amber-700">
                  💡 <strong>Tip:</strong> Your parent agency earns commission from your agency. 
                  Contact them for any issues or support.
                </p>
              </div>
            </div>
          )}

          <Button 
            variant="outline" 
            className="w-full mt-4"
            onClick={() => setShowParentContactModal(false)}
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>

      {/* Sub-Agents Panel */}
      <SubAgentsPanel 
        agencyId={agency.id}
        agencyCode={agency.agency_code}
        isOpen={showSubAgentsPanel}
        onClose={() => setShowSubAgentsPanel(false)}
      />

      {/* Payroll Helper Welcome Modal (one-time for new agencies) */}
      {currentUserId && agency && (
        <PayrollHelperWelcomeModal 
          agencyId={agency.id}
          userId={currentUserId}
        />
      )}
      </div>
    </div>
  );
};

export default AgencyDashboard;
