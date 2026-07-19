import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Gem,
  Diamond,
  ArrowRightLeft,
  Calculator,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  Send,
  History
} from "lucide-react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { supabase } from "@/integrations/supabase/client";
import { getAppSetting, invalidateAppSetting } from "@/utils/appSettingsCache";
import { recordClientError } from "@/utils/clientErrorLog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Agency {
  id: string;
  name: string;
  beans_balance: number;
  wallet_balance: number;
  diamond_balance: number;
}

interface ExchangeSettings {
  beans_to_diamonds_rate: number;
  exchange_fee_percent: number;
  min_exchange_amount: number;
}

interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  app_uid: string | null;
}

interface TargetAgency {
  id: string;
  name: string;
  agency_code: string;
  owner_id: string;
  owner_name: string | null;
  owner_app_uid: string | null;
  diamond_balance: number;
}

interface Transaction {
  id: string;
  transaction_type: string;
  beans_amount: number;
  diamond_amount: number;
  fee_amount: number;
  created_at: string;
  user_id: string | null;
}

const AGENCY_EXCHANGE_MIN_BEANS = 100000;

const normalizeExchangeSettings = (settings?: Record<string, unknown>): ExchangeSettings => {
  const beansToDiamondsRate = Number(settings?.beans_to_diamonds_rate ?? 1);
  const exchangeFeePercent = Number(settings?.exchange_fee_percent ?? 25);
  const minExchangeAmount = Number(settings?.min_exchange_amount ?? AGENCY_EXCHANGE_MIN_BEANS);

  return {
    beans_to_diamonds_rate: beansToDiamondsRate > 0 ? beansToDiamondsRate : 1,
    exchange_fee_percent: exchangeFeePercent >= 0 ? exchangeFeePercent : 25,
    min_exchange_amount: Math.max(
      AGENCY_EXCHANGE_MIN_BEANS,
      minExchangeAmount > 0 ? minExchangeAmount : AGENCY_EXCHANGE_MIN_BEANS
    )
  };
};

const AgencyDiamondExchange = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [ownerBeans, setOwnerBeans] = useState<number>(0); // Agency's beans_balance (NOT from gift_transactions)
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [exchangeSettings, setExchangeSettings] = useState<ExchangeSettings>(normalizeExchangeSettings());
  
  // Exchange state (Beans to Diamonds)
  const [beansAmount, setBeansAmount] = useState<string>("");
  const [diamondsToGet, setDiamondsToGet] = useState<number>(0);
  const [feeAmount, setFeeAmount] = useState<number>(0);
  
  // Send diamonds state
  const [activeTab, setActiveTab] = useState<"exchange" | "send">("exchange");
  const [sendSubTab, setSendSubTab] = useState<"user" | "agency">("user");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [diamondsToSend, setDiamondsToSend] = useState<string>("");
  
  // Agency-to-Agency transfer state
  const [agencySearchQuery, setAgencySearchQuery] = useState("");
  const [selectedTargetAgency, setSelectedTargetAgency] = useState<TargetAgency | null>(null);
  const [isSearchingAgency, setIsSearchingAgency] = useState(false);
  
  // Recent transactions
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  
  // Confirmation dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"exchange" | "send" | "sendAgency">("exchange");

  useEffect(() => {
    fetchData();
  }, []);

  // Pkg83-ext: removed agency/profile/exchange-settings postgres_changes
  // channels (agencies/profiles/app_settings not in publication). Pkg37
  // admin_broadcast pushes diamond_exchange edits; own balances refresh on
  // visibility + after mutations.
  useEffect(() => {
    if (!agency?.id || !ownerId) return;
    const refreshOwn = async () => {
      const [{ data: a }, { data: p }] = await Promise.all([
        supabase.from('agencies').select('beans_balance, diamond_balance, wallet_balance').eq('id', agency.id).maybeSingle(),
        supabase.from('profiles').select('beans').eq('id', ownerId).maybeSingle(),
      ]);
      if (a) setAgency(prev => prev ? { ...prev, beans_balance: a.beans_balance || 0, diamond_balance: a.diamond_balance || 0, wallet_balance: a.wallet_balance || 0 } : null);
      if (p) setOwnerBeans(Math.max(0, Number((p as any).beans || 0)));
    };
    // No-auto-refresh: removed visibility refetch. Realtime / own-beans-updated push changes.
    return () => { /* noop */ };
  }, [agency?.id, ownerId]);

  // Exchange settings — Pkg37 admin_broadcast push
  useEffect(() => {
    const onAdmin = async (e: Event) => {
      const detail = (e as CustomEvent<{ table?: string }>).detail;
      if (detail?.table !== 'app_settings') return;
      // Bust cache so we read the latest admin value (agency-specific, fall back to shared)
      invalidateAppSetting('agency_diamond_exchange');
      invalidateAppSetting('diamond_exchange');
      const value =
        (await getAppSetting<Record<string, unknown>>('agency_diamond_exchange', { maxAgeMs: 0 })) ||
        (await getAppSetting<Record<string, unknown>>('diamond_exchange', { maxAgeMs: 0 }));
      if (value) setExchangeSettings(normalizeExchangeSettings(value));
    };
    window.addEventListener('admin-table-update', onAdmin as EventListener);
    return () => window.removeEventListener('admin-table-update', onAdmin as EventListener);
  }, []);



  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      setOwnerId(user.id);

      // Fetch agency data AND owner's personal beans in parallel
      const [{ data: agencyData, error: agencyError }, { data: profileData }] = await Promise.all([
        supabase
          .from("agencies")
          .select("id, name, beans_balance, wallet_balance, diamond_balance")
          .eq("owner_id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("beans")
          .eq("id", user.id)
          .maybeSingle()
      ]);

      if (agencyError || !agencyData) {
        navigate("/create-agency");
        return;
      }

      setAgency({
        ...agencyData,
        beans_balance: agencyData.beans_balance || 0,
        wallet_balance: agencyData.wallet_balance || 0,
        diamond_balance: agencyData.diamond_balance || 0
      });

      // CRITICAL FIX: My Beans = profiles.beans (personal), NOT agency wallet_balance (Total Beans)
      setOwnerBeans(Math.max(0, Number(profileData?.beans || 0)));

      // Fetch agency-specific exchange settings (rate + 25% fee); fall back to user setting
      const settingsValue =
        (await getAppSetting<Record<string, unknown>>('agency_diamond_exchange', { maxAgeMs: 0 })) ||
        (await getAppSetting<Record<string, unknown>>('diamond_exchange', { maxAgeMs: 0 }));
      if (settingsValue) {
        setExchangeSettings(normalizeExchangeSettings(settingsValue));
      }


      // Fetch recent transactions
      const { data: transactionsData } = await supabase
        .from("agency_diamond_transactions")
        .select("*")
        .eq("agency_id", agencyData.id)
        .order("created_at", { ascending: false })
        .limit(10);

      setRecentTransactions(transactionsData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      recordClientError({ label: "AgencyDiamondExchange.settings", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate beans to diamonds exchange
  // Beans convert 1:1 to diamonds first, then 25% fee is deducted from diamonds
  // Example: 100,000 beans → 100,000 diamonds → 25% fee (25,000) → 75,000 diamonds
  useEffect(() => {
    const beans = parseInt(beansAmount) || 0;
    // Step 1: Convert beans to gross diamonds at the configured agency rate
    const rawDiamonds = Math.floor(beans / exchangeSettings.beans_to_diamonds_rate);
    // Step 2: Fee is deducted from diamonds
    const fee = Math.floor(rawDiamonds * exchangeSettings.exchange_fee_percent / 100);
    const finalDiamonds = rawDiamonds - fee;
    
    setFeeAmount(fee);
    setDiamondsToGet(finalDiamonds);
  }, [beansAmount, exchangeSettings]);
  
  // Total beans to be deducted = entered beans (fee is already included inside)
  const totalBeansNeeded = parseInt(beansAmount) || 0;
  const minimumExchangeAmount = Math.max(AGENCY_EXCHANGE_MIN_BEANS, exchangeSettings.min_exchange_amount || 0);

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles_public")
        .select("id, display_name, avatar_url, username, app_uid")
        .or(`app_uid.ilike.%${query}%,display_name.ilike.%${query}%,username.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error("Search error:", error);
      recordClientError({ label: "AgencyDiamondExchange.searchUsers", message: error instanceof Error ? error.message : String(error) });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search agencies by owner's App UID
  const searchAgencyByOwnerUID = async () => {
    if (agencySearchQuery.length < 3) {
      toast({
        title: "Invalid UID",
        description: "Please enter at least 3 characters",
        variant: "destructive"
      });
      return;
    }

    setIsSearchingAgency(true);
    setSelectedTargetAgency(null);

    try {
      const { data: ownerRows, error: ownerError } = await supabase.rpc('search_user_by_app_uid', {
        _app_uid: agencySearchQuery.trim().toUpperCase()
      });

      const ownerData = Array.isArray(ownerRows) ? ownerRows[0] : null;

      if (ownerError || !ownerData) {
        toast({
          title: "User Not Found",
          description: "No user found with this App UID",
          variant: "destructive"
        });
        setIsSearchingAgency(false);
        return;
      }

      // Then find their agency
      const { data: agencyData, error: agencyError } = await supabase
        .from("agencies_public")
        .select("id, name, agency_code, owner_id, diamond_balance")
        .eq("owner_id", ownerData.id)
        .eq("is_active", true)
        .maybeSingle();

      if (agencyError || !agencyData) {
        toast({
          title: "No Agency Found",
          description: "This user does not own an agency",
          variant: "destructive"
        });
        setIsSearchingAgency(false);
        return;
      }

      // Check if trying to send to own agency
      if (agencyData.id === agency?.id) {
        toast({
          title: "Invalid Target",
          description: "You cannot send diamonds to your own agency",
          variant: "destructive"
        });
        setIsSearchingAgency(false);
        return;
      }

      setSelectedTargetAgency({
        id: agencyData.id,
        name: agencyData.name,
        agency_code: agencyData.agency_code,
        owner_id: agencyData.owner_id,
        owner_name: ownerData.display_name,
        owner_app_uid: ownerData.app_uid,
        diamond_balance: agencyData.diamond_balance || 0
      });
    } catch (error) {
      console.error("Agency search error:", error);
      recordClientError({ label: "AgencyDiamondExchange.searchAgencyByOwnerUID", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Search Error",
        description: "Failed to search agency",
        variant: "destructive"
      });
    } finally {
      setIsSearchingAgency(false);
    }
  };

  const handleSendDiamondsToAgency = async () => {
    if (!agency || !selectedTargetAgency) return;
    
    const diamonds = parseInt(diamondsToSend) || 0;
    
    if (diamonds <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid diamond amount",
        variant: "destructive"
      });
      return;
    }

    if (diamonds > agency.diamond_balance) {
      toast({
        title: "Insufficient Diamonds",
        description: `You have ${agency.diamond_balance.toLocaleString()} diamonds`,
        variant: "destructive"
      });
      return;
    }

    setConfirmAction("sendAgency");
    setShowConfirmDialog(true);
  };

  const handleExchange = async () => {
    if (!agency) return;
    
    const beans = parseInt(beansAmount) || 0;
    
    if (beans < minimumExchangeAmount) {
      toast({
        title: "Minimum Amount",
        description: `Minimum ${minimumExchangeAmount.toLocaleString()} beans required for exchange`,
        variant: "destructive"
      });
      return;
    }

    if (beans > ownerBeans) {
      toast({
        title: "Insufficient Balance",
        description: `You need ${beans.toLocaleString()} beans. You have ${ownerBeans.toLocaleString()}`,
        variant: "destructive"
      });
      return;
    }

    setConfirmAction("exchange");
    setShowConfirmDialog(true);
  };

  const handleSendDiamonds = async () => {
    if (!agency || !selectedUser) return;
    
    const diamonds = parseInt(diamondsToSend) || 0;
    
    if (diamonds <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid diamond amount",
        variant: "destructive"
      });
      return;
    }

    if (diamonds > agency.diamond_balance) {
      toast({
        title: "Insufficient Diamonds",
        description: `You have ${agency.diamond_balance.toLocaleString()} diamonds`,
        variant: "destructive"
      });
      return;
    }

    setConfirmAction("send");
    setShowConfirmDialog(true);
  };

  const processTransaction = async () => {
    if (!agency || !ownerId) return;
    
    setIsProcessing(true);
    
    try {
      if (confirmAction === "exchange") {
        const beans = parseInt(beansAmount) || 0;
        
        // Check personal My Beans (profiles.beans), NOT agency beans_balance
        if (ownerBeans < beans) {
          toast({
            title: "Insufficient My Beans",
            description: `You need ${beans.toLocaleString()} beans but only have ${ownerBeans.toLocaleString()} My Beans`,
            variant: "destructive",
          });
          setIsProcessing(false);
          return;
        }
        
        console.log('Starting exchange via unified RPC:', { ownerId, beans, diamondsToGet, feeAmount });
        
        // Use unified RPC - deducts from profiles.beans, credits agency diamond_balance
        const { data: result, error: rpcError } = await supabase.rpc('exchange_user_beans_to_diamonds', {
          _user_id: ownerId,
          _beans_amount: beans,
          _diamonds_reward: diamondsToGet,
          _tier_id: null
        });

        if (rpcError) {
          console.error('RPC error:', rpcError);
          recordClientError({ label: "AgencyDiamondExchange.beans", message: rpcError instanceof Error ? rpcError.message : String(rpcError) });
          toast({ title: "Exchange Failed", description: rpcError.message, variant: "destructive" });
          setIsProcessing(false);
          return;
        }

        const exchangeResult = result as any;
        if (!exchangeResult?.success) {
          toast({ title: "Exchange Failed", description: exchangeResult?.error || 'Unknown error', variant: "destructive" });
          setIsProcessing(false);
          return;
        }

        // Update local state - beans from personal bucket, diamonds to agency
        const newPersonalBeans = exchangeResult.new_beans ?? (ownerBeans - beans);
        setOwnerBeans(newPersonalBeans);
        
        if (agency && exchangeResult.destination === 'trader_wallet_agency') {
          setAgency({ 
            ...agency, 
            diamond_balance: (agency.diamond_balance || 0) + diamondsToGet
          });
        }
        
        // Create notification for the exchange - ONLY after successful update
        await supabase.from('notifications').insert({
          user_id: ownerId,
          type: 'diamond_exchange',
          title: 'Exchange Successful! ✨',
          message: `Converted ${beans.toLocaleString()} beans to ${diamondsToGet.toLocaleString()} diamonds.`,
          data: { beans: beans, diamonds: diamondsToGet, fee: feeAmount }
        });
        
        toast({
          title: "Exchange Successful! ✨",
          description: `Converted ${beans.toLocaleString()} beans to ${diamondsToGet.toLocaleString()} diamonds (Fee: ${feeAmount.toLocaleString()})`,
        });
        
        setBeansAmount("");
        
        // Refresh transactions
        const { data: transactionsData } = await supabase
          .from("agency_diamond_transactions")
          .select("*")
          .eq("agency_id", agency.id)
          .order("created_at", { ascending: false })
          .limit(10);
        setRecentTransactions(transactionsData || []);
      } else if (confirmAction === "send" && selectedUser) {
        const diamonds = Math.floor(parseInt(diamondsToSend) || 0);
        
        // Use atomic RPC to deduct from agency AND add to user
        const { data: result, error: rpcError } = await (supabase as any).rpc('agency_send_diamonds_to_user', {
          _agency_id: agency.id,
          _receiver_id: selectedUser.id,
          _amount: diamonds
        });

        if (rpcError) throw rpcError;
        const rpcResult = result as any;
        if (!rpcResult?.success) {
          throw new Error(rpcResult?.error || 'Transfer failed');
        }

        setAgency({ 
          ...agency, 
          diamond_balance: rpcResult.new_agency_balance
        });
        
        toast({
          title: "Transfer Successful! 💎",
          description: `Sent ${diamonds.toLocaleString()} diamonds to ${selectedUser.display_name || selectedUser.app_uid}'s top-up balance`,
        });
        
        setDiamondsToSend("");
        setSelectedUser(null);
        setSearchQuery("");
        fetchData(); // Refresh transactions
      } else if (confirmAction === "sendAgency" && selectedTargetAgency) {
        // AGENCY TRANSFER: sender agency diamond balance funds the target agency owner's trader wallet.
        const diamonds = Math.floor(parseInt(diamondsToSend) || 0);
        
        // Use atomic RPC for agency-to-agency transfer
        const { data: result, error: rpcError } = await (supabase as any).rpc('agency_send_diamonds_to_agency', {
          _sender_agency_id: agency.id,
          _target_agency_id: selectedTargetAgency.id,
          _amount: diamonds
        });

        if (rpcError) throw rpcError;
        const rpcResult = result as any;
        if (!rpcResult?.success) {
          throw new Error(rpcResult?.error || 'Transfer failed');
        }

        setAgency({ 
          ...agency, 
          diamond_balance: rpcResult.new_sender_balance
        });
        
        toast({
          title: "Transfer Successful! 💎",
          description: `Sent ${diamonds.toLocaleString()} diamonds to ${selectedTargetAgency.owner_name || selectedTargetAgency.name}'s trader wallet`,
        });
        
        setDiamondsToSend("");
        setSelectedTargetAgency(null);
        setAgencySearchQuery("");
        fetchData(); // Refresh transactions
      }
    } catch (error) {
      console.error("Transaction error:", error);
      recordClientError({ label: "AgencyDiamondExchange.rpcResult", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Transfer Failed",
        description: error instanceof Error ? error.message : "Failed to complete transaction",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
      setShowConfirmDialog(false);
    }
  };

  if (isLoading) {
    return (
      <PageSkeleton
 className="fixed inset-0 flex flex-col bg-gradient-to-b from-amber-50 via-background to-background overflow-hidden"
        headerClassName="bg-gradient-to-r from-amber-500 to-orange-600"
        tabs
      />
    );
  }

  if (!agency) {
    return (
      <PageSkeleton
 className="fixed inset-0 flex flex-col bg-gradient-to-b from-amber-50 via-background to-background overflow-hidden"
        headerClassName="bg-gradient-to-r from-amber-500 to-orange-600"
        rows={4}
        tabs
      />
    );
  }

  return (
 <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-amber-50 via-background to-background ">
      {/* Premium gradient header */}
      <header className="flex-shrink-0 sticky top-0 z-40 safe-area-top">
        <div
          className="relative bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white"
          style={{ boxShadow: '0 8px 24px -8px rgba(245,158,11,0.45)' }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.35), transparent 60%), radial-gradient(circle at 90% 100%, rgba(244,63,94,0.45), transparent 60%)',
            }}
            aria-hidden
          />
          <div className="relative flex items-center h-14 px-4">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 -ml-1 rounded-full bg-white/15 backdrop-blur-xl flex items-center justify-center transition-all hover:bg-white/25 hover:-translate-y-0.5 active:scale-95"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 10px -4px rgba(0,0,0,0.25)' }}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1
              className="flex-1 text-center text-lg font-bold tracking-tight pr-10"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.25)' }}
            >
              Diamond Exchange
            </h1>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {/* Balance Cards */}
        <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
        {/* Agency Beans Balance */}
        <div
          className="relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 transition-all hover:-translate-y-0.5"
          style={{
            boxShadow:
              '0 14px 32px -10px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -3px 8px rgba(0,0,0,0.15)',
          }}
        >
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/15 rounded-full blur-2xl" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-orange-300/30 rounded-full blur-2xl" />
          <div className="relative">
            <div
              className="w-10 h-10 mb-2 bg-white/25 backdrop-blur-sm rounded-xl flex items-center justify-center"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }}
            >
              <Gem className="w-5 h-5" />
            </div>
            <p className="text-white/90 text-[11px] font-medium uppercase tracking-wide">Total Beans</p>
            <p className="text-2xl font-extrabold mt-0.5" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
              {(agency.beans_balance || 0).toLocaleString()}
            </p>
            <p className="text-white/75 text-[10px] mt-1">Exchangeable to Diamonds</p>
          </div>
        </div>

        {/* Diamond Balance */}
        <div
          className="relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-br from-sky-400 via-cyan-500 to-blue-600 transition-all hover:-translate-y-0.5"
          style={{
            boxShadow:
              '0 14px 32px -10px rgba(14,165,233,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -3px 8px rgba(0,0,0,0.15)',
          }}
        >
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/15 rounded-full blur-2xl" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-cyan-300/30 rounded-full blur-2xl" />
          <div className="relative">
            <div
              className="w-10 h-10 mb-2 bg-white/25 backdrop-blur-sm rounded-xl flex items-center justify-center"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }}
            >
              <Diamond className="w-5 h-5" />
            </div>
            <p className="text-white/90 text-[11px] font-medium uppercase tracking-wide">Diamond Balance</p>
            <p className="text-2xl font-extrabold mt-0.5" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
              {agency.diamond_balance.toLocaleString()}
            </p>
            <p className="text-white/75 text-[10px] mt-1">Ready to spend</p>
          </div>
        </div>
      </div>

      {/* Exchange Info */}
      <div
        className="mx-4 mt-3 bg-card rounded-2xl p-3.5 border border-border"
        style={{ boxShadow: '0 6px 16px -8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.5)' }}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Exchange Rate</span>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-foreground">{exchangeSettings.beans_to_diamonds_rate} Beans = 1</span>
            <Diamond className="w-4 h-4 text-sky-500" />
          </div>
        </div>
        <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-border/60">
          <span className="text-muted-foreground">Exchange Fee</span>
          <span className="font-bold text-rose-500">{exchangeSettings.exchange_fee_percent}%</span>
        </div>
      </div>

      {/* Sunken-track tabs */}
      <div
        className="mx-4 mt-4 grid grid-cols-2 gap-1 p-1 rounded-2xl bg-muted/60 border border-border/60"
        style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(255,255,255,0.4)' }}
      >
        <button
          onClick={() => setActiveTab("exchange")}
          className={`h-11 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === "exchange"
              ? "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-md"
              : "text-muted-foreground hover:text-foreground"
          }`}
          style={activeTab === "exchange" ? { boxShadow: '0 4px 10px -2px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,255,255,0.35)' } : undefined}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Beans → Diamond
        </button>
        <button
          onClick={() => setActiveTab("send")}
          className={`h-11 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === "send"
              ? "bg-gradient-to-br from-sky-500 via-cyan-500 to-blue-600 text-white shadow-md"
              : "text-muted-foreground hover:text-foreground"
          }`}
          style={activeTab === "send" ? { boxShadow: '0 4px 10px -2px rgba(14,165,233,0.45), inset 0 1px 0 rgba(255,255,255,0.35)' } : undefined}
        >
          <Send className="w-4 h-4" />
          Send Diamond
        </button>
      </div>

      {/* Exchange Tab */}
      {activeTab === "exchange" && (
        <div className="mx-4 mt-4 space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-warning-200 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-slate-800">
              <Calculator className="w-5 h-5 text-warning-600" />
              Convert Beans to Diamonds
            </h3>
            
            <div className="space-y-4">
              <div>
                <Label className="text-slate-500">Beans Amount</Label>
                <div className="relative mt-2">
                  <Gem className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warning-600" />
                  <Input
                    type="number"
                    placeholder="Enter beans amount"
                    value={beansAmount}
                    onChange={(e) => setBeansAmount(e.target.value)}
                    className="pl-10 text-lg h-12 bg-white border-warning-200 text-slate-800 placeholder:text-slate-500"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Minimum: {minimumExchangeAmount.toLocaleString()} | My Beans: {ownerBeans.toLocaleString()}
                </p>
              </div>

              {/* Calculator Preview - Updated */}
              <div className="bg-gradient-to-r from-warning-500/10 to-warning-500/10 rounded-xl p-4 border border-warning-500/20">
                <div className="space-y-2.5">
                  {/* Beans for conversion */}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Beans Amount:</span>
                    <span className="font-semibold text-slate-800">{(parseInt(beansAmount) || 0).toLocaleString()}</span>
                  </div>
                  
                  {/* Conversion calculation */}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Conversion ({exchangeSettings.beans_to_diamonds_rate}:1):</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-info-600">{diamondsToGet.toLocaleString()}</span>
                      <Diamond className="w-3.5 h-3.5 text-info-600" />
                    </div>
                  </div>
                  
                  {/* Fee deducted */}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Fee ({exchangeSettings.exchange_fee_percent}%):</span>
                    <span className="text-danger-600 font-semibold">-{feeAmount.toLocaleString()} Diamonds</span>
                  </div>

                  {/* Beans after fee */}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Gross Diamonds:</span>
                    <span className="font-semibold text-slate-800">{Math.floor((parseInt(beansAmount) || 0) / exchangeSettings.beans_to_diamonds_rate).toLocaleString()}</span>
                  </div>
                  
                  <div className="border-t border-warning-200/60 pt-3 mt-2 space-y-2">
                    {/* Total beans deducted */}
                    <div className="flex justify-between items-center text-sm bg-white rounded-lg px-3 py-2">
                      <span className="text-slate-600">Total Beans Deducted:</span>
                      <span className="font-bold text-warning-600 text-base">{totalBeansNeeded.toLocaleString()}</span>
                    </div>
                    
                    {/* Diamonds to receive */}
                    <div className="flex justify-between items-center bg-gradient-to-r from-info-500/20 to-info-500/20 rounded-lg px-3 py-2">
                      <span className="text-slate-800 font-medium">You Will Receive:</span>
                      <div className="flex items-center gap-2">
                        <Diamond className="w-6 h-6 text-info-600" />
                        <span className="text-2xl font-bold text-info-600">{diamondsToGet.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Insufficient Balance Warning */}
              {totalBeansNeeded > ownerBeans && beansAmount && parseInt(beansAmount) > 0 && (
                <div className="flex items-center gap-2 p-3 bg-danger-50 rounded-lg border border-danger-200">
                  <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0" />
                  <p className="text-sm text-danger-700">
                    Insufficient My Beans. Required: {totalBeansNeeded.toLocaleString()} | Available: {ownerBeans.toLocaleString()}
                  </p>
                </div>
              )}

              {/* Convert Button */}
              <Button
                onClick={handleExchange}
                disabled={!beansAmount || (parseInt(beansAmount) || 0) < minimumExchangeAmount || totalBeansNeeded > ownerBeans}
                className={`w-full h-12 text-white font-semibold text-sm ${
                  totalBeansNeeded > ownerBeans || !beansAmount || (parseInt(beansAmount) || 0) < minimumExchangeAmount
                    ? 'bg-gray-500/50 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-r from-warning-500 to-warning-600 hover:from-warning-600 hover:to-warning-700'
                }`}
              >
                <ArrowRightLeft className="w-5 h-5 mr-2" />
                {diamondsToGet > 0 ? (
                  <span>Convert {totalBeansNeeded.toLocaleString()} Beans → {diamondsToGet} 💎</span>
                ) : (
                  <span>Convert Beans → Diamonds</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send Diamonds Tab */}
      {activeTab === "send" && (
        <div className="mx-4 mt-4 space-y-4">
          {/* Sub-tabs: User Top-up | Agency */}
          <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => {
                setSendSubTab("user");
                setSelectedTargetAgency(null);
                setAgencySearchQuery("");
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                sendSubTab === "user"
                  ? "bg-gradient-to-r from-info-500 to-info-600 text-white shadow-lg"
                  : "text-slate-500 hover:text-slate-700 hover:bg-warning-50"
              }`}
            >
              <Users className="w-4 h-4" />
              User Top-up
            </button>
            <button
              onClick={() => {
                setSendSubTab("agency");
                setSelectedUser(null);
                setSearchQuery("");
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                sendSubTab === "agency"
                  ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg"
                  : "text-slate-500 hover:text-slate-700 hover:bg-warning-50"
              }`}
            >
              <Diamond className="w-4 h-4" />
              Trader Wallet
            </button>
          </div>

          {/* USER TOP-UP SUB-TAB */}
          {sendSubTab === "user" && (
            <div className="bg-white rounded-2xl p-5 border border-warning-200 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-slate-800">
                <Send className="w-5 h-5 text-info-600" />
                Send Gem to User Top-up
              </h3>
              
              <div className="space-y-4">
                {/* User Search */}
                <div>
                  <Label className="text-slate-500">Search user by App UID</Label>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <Input
                      type="text"
                      placeholder="Enter App UID or name"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-white border-warning-200 text-slate-800 placeholder:text-slate-500"
                    />
                  </div>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && !selectedUser && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {searchResults.map((user) => (
                      <div
                        key={user.id}
                        onClick={() => {
                          setSelectedUser(user);
                          setSearchQuery("");
                          setSearchResults([]);
                        }}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-warning-50 transition-colors"
                      >
                        <Avatar className="w-10 h-10 border border-warning-200/60">
                          <AvatarImage src={enhanceThumbnail(user.avatar_url || "", { width: 96, quality: 82 })} />
                          <AvatarFallback className="bg-gradient-to-br from-info-500 to-info-500 text-white">
                            {user.display_name?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-800">{user.display_name || "Unknown"}</p>
                          <p className="text-xs text-white/80">
                            UID: {user.app_uid || user.id.slice(0, 8)}
                          </p>
                        </div>
                        <Badge className="bg-info-100 text-info-700 border-info-500/30">
                          UID
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected User */}
                {selectedUser && (
                  <div className="bg-gradient-to-r from-info-500/10 to-info-500/10 rounded-xl p-4 border border-info-500/20">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-12 h-12 border-2 border-info-400">
                        <AvatarImage src={enhanceThumbnail(selectedUser.avatar_url || "", { width: 96, quality: 82 })} />
                        <AvatarFallback className="bg-gradient-to-br from-info-500 to-info-500 text-white">
                          {selectedUser.display_name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800">{selectedUser.display_name || "Unknown"}</p>
                        <p className="text-xs text-white/80">
                          UID: {selectedUser.app_uid || selectedUser.id.slice(0, 8)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedUser(null)}
                        className="text-danger-600 hover:text-danger-700 hover:bg-danger-500/10"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Diamond Amount */}
                {selectedUser && (
                  <>
                    <div>
                      <Label className="text-slate-500">Diamond Amount</Label>
                      <div className="relative mt-2">
                        <Diamond className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-info-600" />
                        <Input
                          type="number"
                          placeholder="Enter diamond amount"
                          value={diamondsToSend}
                          onChange={(e) => setDiamondsToSend(e.target.value)}
                          className="pl-10 text-lg h-12 bg-white border-warning-200 text-slate-800 placeholder:text-slate-500"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Agency wallet: {agency.diamond_balance.toLocaleString()} 💎
                      </p>
                    </div>

                    {/* Transfer Preview */}
                    <div className="bg-gradient-to-r from-info-500/10 to-info-500/10 rounded-xl p-4 border border-info-500/20">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Sending to top-up:</span>
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            <Diamond className="w-4 h-4 text-info-600" />
                            {(parseInt(diamondsToSend) || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">User:</span>
                          <span className="font-semibold text-slate-800">{selectedUser.display_name || selectedUser.app_uid}</span>
                        </div>
                        <div className="border-t border-warning-200/60 pt-2 mt-2">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-800 font-medium">Balance after sending:</span>
                            <span className="text-lg font-bold text-info-600">
                              {Math.max(0, agency.diamond_balance - (parseInt(diamondsToSend) || 0)).toLocaleString()} 💎
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {(parseInt(diamondsToSend) || 0) > agency.diamond_balance && (
                      <div className="flex items-center gap-2 p-3 bg-danger-500/10 rounded-lg border border-danger-500/20">
                        <AlertCircle className="w-5 h-5 text-danger-600" />
                        <p className="text-sm text-danger-600">You don't have enough diamonds</p>
                      </div>
                    )}

                    <Button
                      onClick={handleSendDiamonds}
                      disabled={!diamondsToSend || (parseInt(diamondsToSend) || 0) > agency.diamond_balance || (parseInt(diamondsToSend) || 0) <= 0}
                      className="w-full h-12 bg-gradient-to-r from-info-500 to-info-600 hover:from-info-600 hover:to-info-700 text-white font-semibold"
                    >
                      <Send className="w-5 h-5 mr-2" />
                      Send {(parseInt(diamondsToSend) || 0).toLocaleString()} Gem
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* AGENCY SUB-TAB */}
          {sendSubTab === "agency" && (
            <div className="bg-white rounded-2xl p-5 border border-warning-200 shadow-sm">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-slate-800">
                <Diamond className="w-5 h-5 text-brand-600" />
                Send Gem to Trader Wallet
              </h3>
              <p className="text-xs text-slate-500 -mt-2 mb-4">
                Agency transfer goes directly to the target owner’s Trader Wallet
              </p>
              
              <div className="space-y-4">
                {/* Agency Search by Owner UID */}
                <div>
                  <Label className="text-slate-500">Search Agency by Owner's App UID</Label>
                  <p className="text-xs text-slate-500 mb-2">Enter the agency owner's user ID to find their agency</p>
                  <div className="flex gap-2 mt-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <Input
                        type="text"
                        placeholder="Enter Owner's App UID"
                        value={agencySearchQuery}
                        onChange={(e) => setAgencySearchQuery(e.target.value)}
                        className="pl-10 bg-white border-warning-200 text-slate-800 placeholder:text-slate-500"
                      />
                    </div>
                    <Button
                      onClick={searchAgencyByOwnerUID}
                      disabled={isSearchingAgency || agencySearchQuery.length < 3}
                      className="bg-brand-500 hover:bg-brand-600"
                    >
                      {isSearchingAgency ? (
                        <div className="w-4 h-4 border-2 border-warning-200/60 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Selected Agency */}
                {selectedTargetAgency && (
                  <div className="bg-gradient-to-r from-brand-500/10 to-brand-500/10 rounded-xl p-4 border border-brand-500/20">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-500 rounded-xl flex items-center justify-center">
                        <Diamond className="w-6 h-6 text-slate-800" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800">{selectedTargetAgency.name}</p>
                        <p className="text-xs text-slate-500">
                          Code: {selectedTargetAgency.agency_code}
                        </p>
                        <p className="text-xs text-brand-700 mt-0.5">
                          Owner: {selectedTargetAgency.owner_name || 'Unknown'} ({selectedTargetAgency.owner_app_uid})
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTargetAgency(null)}
                        className="text-danger-600 hover:text-danger-700 hover:bg-danger-500/10"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Diamond Amount for Agency */}
                {selectedTargetAgency && (
                  <>
                    <div>
                      <Label className="text-slate-500">Diamond Amount</Label>
                      <div className="relative mt-2">
                        <Diamond className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-600" />
                        <Input
                          type="number"
                          placeholder="Enter diamond amount"
                          value={diamondsToSend}
                          onChange={(e) => setDiamondsToSend(e.target.value)}
                          className="pl-10 text-lg h-12 bg-white border-warning-200 text-slate-800 placeholder:text-slate-500"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Your Balance: {agency.diamond_balance.toLocaleString()} 💎
                      </p>
                    </div>

                    {/* Transfer Preview */}
                    <div className="bg-gradient-to-r from-brand-500/10 to-brand-500/10 rounded-xl p-4 border border-brand-500/20">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Sending:</span>
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            <Diamond className="w-4 h-4 text-brand-600" />
                            {(parseInt(diamondsToSend) || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Agency Owner:</span>
                          <span className="font-semibold text-slate-800">{selectedTargetAgency.name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Destination:</span>
                          <span className="font-semibold text-brand-700">Trader Wallet</span>
                        </div>
                        <div className="border-t border-warning-200/60 pt-2 mt-2">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-800 font-medium">Your balance after:</span>
                            <span className="text-lg font-bold text-brand-600">
                              {Math.max(0, agency.diamond_balance - (parseInt(diamondsToSend) || 0)).toLocaleString()} 💎
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {(parseInt(diamondsToSend) || 0) > agency.diamond_balance && (
                      <div className="flex items-center gap-2 p-3 bg-danger-500/10 rounded-lg border border-danger-500/20">
                        <AlertCircle className="w-5 h-5 text-danger-600" />
                        <p className="text-sm text-danger-600">You don't have enough diamonds</p>
                      </div>
                    )}

                    <Button
                      onClick={handleSendDiamondsToAgency}
                      disabled={!diamondsToSend || (parseInt(diamondsToSend) || 0) > agency.diamond_balance || (parseInt(diamondsToSend) || 0) <= 0}
                      className="w-full h-12 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-semibold"
                    >
                      <Send className="w-5 h-5 mr-2" />
                      Send {(parseInt(diamondsToSend) || 0).toLocaleString()} Gem → Trader Wallet
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <div className="mx-4 mt-6">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-slate-800">
            <History className="w-5 h-5 text-brand-600" />
            Recent Transactions
          </h3>
          <div className="bg-white rounded-xl border border-warning-200 shadow-sm divide-y divide-slate-200">
            {recentTransactions.slice(0, 5).map((tx) => (
              <div key={tx.id} className="p-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  tx.transaction_type === 'exchange' 
                    ? 'bg-warning-100' 
                    : 'bg-info-100'
                }`}>
                  {tx.transaction_type === 'exchange' ? (
                    <ArrowRightLeft className="w-5 h-5 text-warning-600" />
                  ) : (
                    <Send className="w-5 h-5 text-info-600" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-slate-800 text-sm font-medium">
                    {tx.transaction_type === 'exchange' ? 'Beans → Diamond' : 'Diamond Sent'}
                  </p>
                  <p className="text-slate-500 text-xs">
                    {new Date(tx.created_at).toLocaleString('en-US')}
                  </p>
                </div>
                <div className="text-right">
                  {tx.transaction_type === 'exchange' ? (
                    <>
                      <p className="text-warning-600 text-sm font-medium">-{tx.beans_amount.toLocaleString()} Beans</p>
                      <p className="text-info-600 text-xs">+{tx.diamond_amount.toLocaleString()} 💎</p>
                    </>
                  ) : (
                    <p className="text-info-600 text-sm font-medium">-{tx.diamond_amount.toLocaleString()} 💎</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="bg-white border-warning-200/60 text-slate-800">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "exchange" ? "Confirm Conversion" : 
               confirmAction === "sendAgency" ? "Confirm Agency Transfer" : "Confirm Transfer"}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              {confirmAction === "exchange" ? (
                <div className="mt-4 space-y-2">
                  <p>Are you sure?</p>
                  <div className="bg-warning-500/10 p-4 rounded-lg border border-warning-500/20">
                    <div className="flex items-center justify-between">
                      <div className="text-center">
                        <p className="text-warning-600 font-bold text-xl">{(parseInt(beansAmount) || 0).toLocaleString()}</p>
                        <p className="text-slate-500 text-xs">Beans</p>
                      </div>
                      <ArrowRightLeft className="w-6 h-6 text-slate-500" />
                      <div className="text-center">
                        <p className="text-info-600 font-bold text-xl">{diamondsToGet.toLocaleString()}</p>
                        <p className="text-slate-500 text-xs">Diamonds</p>
                      </div>
                    </div>
                    <p className="text-xs text-danger-600 mt-2 text-center">Fee: {feeAmount.toLocaleString()} Beans</p>
                  </div>
                </div>
              ) : confirmAction === "sendAgency" && selectedTargetAgency ? (
                <div className="mt-4 space-y-2">
                  <p>Are you sure?</p>
                  <div className="bg-brand-500/10 p-4 rounded-lg border border-brand-500/20">
                    <p className="text-sm text-slate-800">
                      Sending <span className="font-semibold text-brand-600">{(parseInt(diamondsToSend) || 0).toLocaleString()}</span> diamonds to{" "}
                      <span className="font-semibold">{selectedTargetAgency.owner_name || selectedTargetAgency.name}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Code: {selectedTargetAgency.agency_code}</p>
                    <p className="text-xs text-brand-700 mt-2">
                      ✨ Funds will go to <strong>{selectedTargetAgency.owner_name || 'Owner'}'s Trader Wallet</strong>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <p>Are you sure?</p>
                  <div className="bg-info-500/10 p-4 rounded-lg border border-info-500/20">
                    <p className="text-sm text-slate-800">
                      Sending <span className="font-semibold text-info-600">{(parseInt(diamondsToSend) || 0).toLocaleString()}</span> diamonds to{" "}
                      <span className="font-semibold">{selectedUser?.display_name || selectedUser?.app_uid}</span>
                    </p>
                    <p className="text-xs text-info-700 mt-1">Destination: user top-up balance</p>
                    <p className="text-xs text-slate-500 mt-1">UID: {selectedUser?.app_uid || selectedUser?.id.slice(0, 8)}</p>
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} className="border-warning-200/60 text-slate-800 hover:bg-warning-50">
              Cancel
            </Button>
            <Button 
              onClick={processTransaction} 
              disabled={isProcessing}
              className={
                confirmAction === "exchange" ? "bg-warning-500 hover:bg-warning-600" : 
                confirmAction === "sendAgency" ? "bg-brand-500 hover:bg-brand-600" : 
                "bg-info-500 hover:bg-info-600"
              }
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-warning-200/60 border-t-white rounded-full animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default AgencyDiamondExchange;
