import { useState, useEffect } from "react";
import { ImageViewer, useImageViewer } from "@/components/ui/image-viewer";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Wallet, Bell, Clock, CheckCircle, XCircle, 
  Upload, Image, DollarSign, Banknote, CreditCard, Plus,
  ChevronRight, Phone, AlertCircle, Loader2, Gem, Crown,
  Building2, User, Camera, Send, Eye, Trash2, FileText, Package, Copy,
  Reply, MessageCircle, ImagePlus, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import Beans3DIcon from "@/components/common/Beans3DIcon";
import { resolveNetWithdrawalBeans, resolveNetWithdrawalLocal, resolveNetWithdrawalUsd } from "@/utils/agencyWithdrawalAmounts";
import { useCountryPaymentGateways } from "@/hooks/useCountryPaymentGateways";
import { recordClientError } from "@/utils/clientErrorLog";

interface PaymentMethod {
  id: string;
  payment_type: string;
  account_name: string;
  account_number: string;
  bank_name?: string;
  country_code?: string;
  is_default: boolean;
  is_active: boolean;
}

interface WithdrawalRequest {
  id: string;
  beans_amount: number;
  usd_amount: number;
  local_amount: number;
  currency_code: string;
  status: string;
  payment_method?: string;
  payment_screenshot_url?: string;
  diamond_reward: number;
  helper_notes?: string;
  created_at: string;
  agency?: { name: string; agency_code: string; logo_url?: string };
  host?: { display_name: string; avatar_url?: string };
}

interface AgencyWithdrawal {
  id: string;
  agency_id: string;
  amount: number;
  status: string;
  payment_method?: string;
  payment_details?: any;
  requested_at: string;
  processed_at?: string;
  country_code?: string;
  local_currency_amount?: number;
  currency_code?: string;
  helper_payment_screenshot?: string;
  helper_transaction_id?: string;
  helper_notes?: string;
  helper_net_reward?: number;
  diamond_reward?: number;
  platform_fee_amount?: number;
  helper_processed_at?: string | null;
  assigned_helper_id?: string | null;
  claim_locked_until?: string | null;
  locked_at?: string | null;
  locked_by_helper_name?: string | null;
  agency?: { name: string; agency_code: string; logo_url?: string; owner_id: string };
  assigned_helper?: { user_id: string; profiles?: { display_name: string } } | null;
}

interface HelperNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  data?: any;
}

interface CountryPaymentMethod {
  id: string;
  country_code: string;
  method_name: string;
  method_type: string;
  account_name: string;
  account_number: string;
  bank_name?: string;
  instructions?: string;
  logo_url?: string;
  is_active: boolean;
  merchant_number?: string;
  is_merchant?: boolean;
}

// Payment types will be loaded from admin-managed topup_payment_methods
interface TopupPaymentMethod {
  id: string;
  method_name: string;
  method_type: string;
  account_name: string;
  account_number: string;
  instructions: string | null;
  icon_url?: string | null;
}

interface CurrencyRate {
  country_code: string;
  currency_code: string;
  currency_symbol: string;
  rate_to_usd: number;
}

const CLAIM_LOCK_SECONDS = 30;

const getClaimLockExpiryMs = (withdrawal?: { claim_locked_until?: string | null } | null) => {
  if (!withdrawal?.claim_locked_until) return null;
  const expiry = new Date(withdrawal.claim_locked_until).getTime();
  return Number.isFinite(expiry) ? expiry : null;
};

const hasActiveClaimLock = (
  withdrawal?: { status?: string | null; assigned_helper_id?: string | null; claim_locked_until?: string | null } | null,
  now = Date.now()
) => {
  if (withdrawal?.status !== 'pending' || !withdrawal?.assigned_helper_id) return false;
  const expiry = getClaimLockExpiryMs(withdrawal);
  return expiry !== null && expiry > now;
};

const isWithdrawalAvailableForClaim = (
  withdrawal?: { status?: string | null; assigned_helper_id?: string | null; claim_locked_until?: string | null } | null,
  now = Date.now()
) => {
  if (withdrawal?.status !== 'pending') return false;
  return !withdrawal?.assigned_helper_id || !hasActiveClaimLock(withdrawal, now);
};

const Level5HelperDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const imageViewer = useImageViewer();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [helperData, setHelperData] = useState<any>(null);
  const [agencyDiamondBalance, setAgencyDiamondBalance] = useState<number>(0);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  
  // Read tab from URL params for notification deep linking
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') || "agency-withdrawals";
  const [activeTab, setActiveTab] = useState(initialTab);
  
  // Data states
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [agencyWithdrawals, setAgencyWithdrawals] = useState<AgencyWithdrawal[]>([]);
  const [countryPaymentMethods, setCountryPaymentMethods] = useState<CountryPaymentMethod[]>([]);
  const [assignedCountries, setAssignedCountries] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<HelperNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [helperOrders, setHelperOrders] = useState<any[]>([]);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [completedOrders, setCompletedOrders] = useState<any[]>([]);
  const [completedWithdrawals, setCompletedWithdrawals] = useState<AgencyWithdrawal[]>([]);
  const [adminMessages, setAdminMessages] = useState<any[]>([]);
  const [unreadAdminMessages, setUnreadAdminMessages] = useState(0);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [messageReplies, setMessageReplies] = useState<any[]>([]);
  const [replyContent, setReplyContent] = useState("");
  const [replyScreenshot, setReplyScreenshot] = useState<File | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  
  // Admin-managed payment methods & currency rates
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<TopupPaymentMethod[]>([]);
  const [currencyRates, setCurrencyRates] = useState<CurrencyRate[]>([]);
  
  // Dialog states
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showWithdrawalDialog, setShowWithdrawalDialog] = useState(false);
  const [showAgencyWithdrawalDialog, setShowAgencyWithdrawalDialog] = useState(false);
  const [showCountryPaymentDialog, setShowCountryPaymentDialog] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [selectedAgencyWithdrawal, setSelectedAgencyWithdrawal] = useState<AgencyWithdrawal | null>(null);
  const [claimingWithdrawalId, setClaimingWithdrawalId] = useState<string | null>(null); // Track which withdrawal is being claimed
  const [lockClock, setLockClock] = useState(() => Date.now());
  
  // Form states
  const [paymentType, setPaymentType] = useState("bkash");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [helperNotes, setHelperNotes] = useState("");
  const [helperTransactionId, setHelperTransactionId] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedPaymentCountry, setSelectedPaymentCountry] = useState(""); // Country for legacy payment method
  const [paymentLogoFile, setPaymentLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [methodInstructions, setMethodInstructions] = useState("");
  const [merchantNumber, setMerchantNumber] = useState("");
  const [gatewayDisplayMethod, setGatewayDisplayMethod] = useState("");
  const [gatewayDisplayNumber, setGatewayDisplayNumber] = useState("");
  const [isMerchant, setIsMerchant] = useState(false);

  // 🆕 Dynamic country-aware payment gateways (loads from `payment_gateways` table)
  const { gateways: countryGateways } = useCountryPaymentGateways(selectedCountry || null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setLockClock(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedAgencyWithdrawal?.id || !helperData?.id || !showAgencyWithdrawalDialog) return;

    const releaseClaim = () => {
      void supabase.rpc('release_agency_withdrawal_claim' as any, {
        _withdrawal_id: selectedAgencyWithdrawal.id,
        _helper_id: helperData.id,
      });
    };

    const handlePageHide = () => releaseClaim();

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      releaseClaim();
    };
  }, [selectedAgencyWithdrawal?.id, helperData?.id, showAgencyWithdrawalDialog]);

  // Real-time subscription - ALL helpers receive ALL withdrawal updates
  useEffect(() => {
    if (!helperData?.id) return;

    const channel = supabase
      .channel(`level5-helper-${helperData.id}`)
      // CRITICAL: Subscribe to topup_helpers for wallet_balance updates
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'topup_helpers', filter: `id=eq.${helperData.id}` },
        (payload) => {
          console.log('[Level5Helper] Helper data updated (wallet_balance etc):', payload.new);
          const newData = payload.new as any;
          if (newData && newData.is_active === false) {
            toast({ title: "Account Deactivated", description: "Your helper account has been deactivated by admin", variant: "destructive" });
            navigate('/profile');
            return;
          }
          setHelperData(newData);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'helper_withdrawal_requests', filter: `helper_id=eq.${helperData.id}` },
        () => loadWithdrawals()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'helper_notifications', filter: `helper_id=eq.${helperData.id}` },
        () => loadNotifications()
      )
      // CRITICAL: Subscribe to helper_orders for this helper - so new orders appear instantly
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'helper_orders', filter: `helper_id=eq.${helperData.id}` },
        (payload) => {
          console.log('[Level5Helper] Helper order updated:', payload.eventType, payload.new);
          loadHelperOrders();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'topup_payment_methods' },
        () => {
          console.log('[Level5Helper] Payment methods updated');
          loadAvailablePaymentMethods();
        }
      )
      // CRITICAL: Subscribe to all agency withdrawal changes.
      // Server-side trigger creates helper notifications instantly,
      // and this keeps the dashboard list in sync across all helpers.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agency_withdrawals' },
        () => {
          loadAgencyWithdrawals();
          loadCompletedHistory();
          loadNotifications();
        }
      )
      // ⚡ REALTIME: Admin messages - instant delivery, zero refresh
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'helper_admin_messages', filter: `helper_id=eq.${helperData.id}` },
        (payload) => {
          console.log('[Level5Helper] Admin message update:', payload.eventType);
          loadAdminMessages();
        }
      )
      // ⚡ REALTIME: Message replies - instant delivery, zero refresh
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'helper_message_replies' },
        (payload) => {
          console.log('[Level5Helper] Message reply update:', payload.eventType);
          // Refresh replies if viewing a message
          if (selectedMessage) {
            loadMessageReplies(selectedMessage.id);
          }
          loadAdminMessages();
        }
      )
      .subscribe();

    // Subscribe to agency diamond_balance updates for combined wallet display
    let agencyChannel: any = null;
    if (agencyId) {
      agencyChannel = supabase
        .channel(`level5-agency-${agencyId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'agencies', filter: `id=eq.${agencyId}` },
          (payload) => {
            setAgencyDiamondBalance((payload.new as any).diamond_balance || 0);
          }
        )
        .subscribe();
    }

    // ADDITIONAL: Auto-refresh every 10 seconds as a backup for realtime delays
    const refreshInterval = setInterval(() => {
      loadAgencyWithdrawals();
    }, 10000);

    return () => { 
      supabase.removeChannel(channel); 
      if (agencyChannel) supabase.removeChannel(agencyChannel);
      clearInterval(refreshInterval);
    };
  }, [helperData?.id, agencyId]);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }

      // Get helper data
      const { data: helper } = await supabase
        .from('topup_helpers')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!helper || helper.trader_level !== 5 || !helper.payroll_enabled || !helper.is_active) {
        toast({ title: "Access Denied", description: !helper?.is_active ? "Your helper account has been deactivated by admin" : "Level 5 with Payroll access required", variant: "destructive" });
        navigate('/helper-dashboard');
        return;
      }

      setHelperData(helper);

      // Load agency diamond_balance — combined with wallet_balance = total Trader Wallet
      const { data: agencyData } = await supabase
        .from('agencies')
        .select('id, diamond_balance')
        .eq('owner_id', user.id)
        .maybeSingle();
      
      if (agencyData) {
        setAgencyDiamondBalance(agencyData.diamond_balance || 0);
        setAgencyId(agencyData.id);
      }
      
      // Load assigned countries first
      const { data: assignedData } = await supabase
        .from('helper_assigned_countries')
        .select('country_code')
        .eq('helper_id', helper.id)
        .eq('is_active', true);
      
      const countries = (assignedData || []).map(a => a.country_code);
      setAssignedCountries(countries);
      
      await Promise.all([
        loadPaymentMethods(helper.id),
        loadWithdrawals(helper.id),
        loadAgencyWithdrawals(helper.id, countries),
        loadCountryPaymentMethods(helper.id),
        loadNotifications(helper.id),
        loadAvailablePaymentMethods(),
        loadCurrencyRates(),
        loadHelperOrders(helper.id),
        loadCompletedHistory(helper.id),
        loadAdminMessages(helper.id)
      ]);
    } catch (error) {
      console.error(error);
      recordClientError({ label: "Level5HelperDashboard.countries", message: error });
    } finally {
      setLoading(false);
    }
  };

  // Load agency withdrawals for Level 5 helpers
  // IMPORTANT: Filter by helper's country_code and exclude ePay withdrawals
  // ePay withdrawals go directly to Admin Panel, not to helpers
  const loadAgencyWithdrawals = async (helperId?: string, countries?: string[]) => {
    const id = helperId || helperData?.id;
    if (!id) return;
    
    try {
      // Get helper's country_code for filtering
      const { data: helperInfo } = await supabase
        .from('topup_helpers')
        .select('country_code')
        .eq('id', id)
        .single();
      
      const helperCountry = helperInfo?.country_code;
      
      if (!helperCountry) {
        console.log('[Level5Helper] No country_code set for helper, skipping withdrawal fetch');
        setAgencyWithdrawals([]);
        return;
      }
      
      // Fetch withdrawals that:
      // 1. Match helper's country (from payment_details)
      // 2. Are NOT ePay (ePay goes to Admin only)
      // 3. Are pending or processing
      const { data: allWithdrawals, error } = await supabase
        .from('agency_withdrawals')
        .select(`
          *,
          agency:agencies(name, agency_code, logo_url, owner_id),
          assigned_helper:topup_helpers!agency_withdrawals_assigned_helper_id_fkey(
            user_id,
            profiles:profiles!topup_helpers_user_id_fkey(display_name)
          )
        `)
        .in('status', ['pending', 'processing'])
        .order('requested_at', { ascending: true }); // Oldest first (FIFO)
      
      if (error) {
        console.error('[Level5Helper] Error loading withdrawals:', error);
        recordClientError({ label: "Level5HelperDashboard.helperCountry", message: error instanceof Error ? error.message : String(error) });
        return;
      }
      
      // Filter in-memory:
      // 1. Exclude ePay withdrawals (they go to Admin only)
      // 2. Only show withdrawals from helper's country
      // 3. Hide 'processing' withdrawals from other helpers (only show to assigned helper)
      const filteredWithdrawals = (allWithdrawals || []).filter((w: any) => {
        // Exclude ePay - these go directly to Admin Panel
        if (w.payment_method === 'epay') {
          return false;
        }
        
        // Check country from payment_details
        const withdrawalCountry = w.payment_details?.country_code || w.country_code;
        
        // Only show if country matches helper's country
        if (withdrawalCountry !== helperCountry) return false;
        
        // CRITICAL: If status is 'processing', only show to the assigned helper
        // Other helpers should NOT see it anymore
        if (w.status === 'processing' && w.assigned_helper_id !== id) {
          return false;
        }
        
        return true;
      });
      
      console.log('[Level5Helper] Loaded agency withdrawals:', filteredWithdrawals.length, 'for country:', helperCountry);
      setAgencyWithdrawals(filteredWithdrawals as AgencyWithdrawal[]);
    } catch (err) {
      console.error('[Level5Helper] Error in loadAgencyWithdrawals:', err);
      recordClientError({ label: "Level5HelperDashboard.withdrawalCountry", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const loadCountryPaymentMethods = async (helperId?: string) => {
    const id = helperId || helperData?.id;
    if (!id) return;
    
    const { data } = await supabase
      .from('helper_country_payment_methods')
      .select('*')
      .eq('helper_id', id)
      .eq('is_active', true)
      .order('country_code', { ascending: true });
    
    setCountryPaymentMethods((data || []) as CountryPaymentMethod[]);
  };

  const loadPaymentMethods = async (helperId?: string) => {
    const id = helperId || helperData?.id;
    if (!id) return;
    
    const { data } = await supabase
      .from('helper_payment_methods')
      .select('*')
      .eq('helper_id', id)
      .eq('is_active', true)
      .order('is_default', { ascending: false });
    
    setPaymentMethods(data || []);
  };

  const loadWithdrawals = async (helperId?: string) => {
    const id = helperId || helperData?.id;
    if (!id) return;
    
    const { data } = await supabase
      .from('helper_withdrawal_requests')
      .select(`
        *,
        agency:agencies(name, agency_code, logo_url),
        host:profiles!helper_withdrawal_requests_host_id_fkey(display_name, avatar_url)
      `)
      .eq('helper_id', id)
      .order('created_at', { ascending: false });
    
    setWithdrawalRequests((data || []) as WithdrawalRequest[]);
  };

  const loadNotifications = async (helperId?: string) => {
    const id = helperId || helperData?.id;
    if (!id) return;
    
    const { data } = await supabase
      .from('helper_notifications')
      .select('*')
      .eq('helper_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    setNotifications((data || []) as HelperNotification[]);
    setUnreadCount((data || []).filter(n => !n.is_read).length);
  };

  const loadAvailablePaymentMethods = async () => {
    console.log('[Level5Helper] Loading payment methods...');
    // topup_payment_methods canonical columns: name, method_type, payment_number,
    // payment_instructions, icon_url. (No method_name / account_name / instructions cols.)
    const { data, error } = await supabase
      .from('topup_payment_methods')
      .select('id, name, method_type, payment_number, payment_instructions, icon_url')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('[Level5Helper] Error loading payment methods:', error);
      recordClientError({ label: "Level5HelperDashboard.loadAvailablePaymentMethods", message: error instanceof Error ? error.message : String(error) });
    }

    // Normalize to the dashboard's TopupPaymentMethod shape so existing UI keeps working.
    const normalized = (data || []).map((m: any) => ({
      id: m.id,
      method_name: m.name,
      method_type: m.method_type,
      account_name: '',
      account_number: m.payment_number || '',
      instructions: m.payment_instructions || null,
      icon_url: m.icon_url || null,
    }));

    console.log('[Level5Helper] Payment methods loaded:', normalized.length, normalized.map((m: any) => m.method_name));
    setAvailablePaymentMethods(normalized as TopupPaymentMethod[]);
  };

  const loadCurrencyRates = async () => {
    const { data } = await supabase
      .from('currency_rates')
      .select('country_code, currency_code, currency_symbol, rate_to_usd')
      .eq('is_active', true);
    
    setCurrencyRates((data || []) as CurrencyRate[]);
  };

  const loadHelperOrders = async (helperId?: string) => {
    const id = helperId || helperData?.id;
    if (!id) return;
    
    const { data } = await supabase
      .from('helper_orders')
      .select(`
        *,
        user:profiles!helper_orders_user_id_fkey(display_name, avatar_url, app_uid)
      `)
      .eq('helper_id', id)
      .order('created_at', { ascending: false })
      .limit(100);
    
    setHelperOrders(data || []);
    setPendingOrdersCount((data || []).filter((o: any) => o.status === 'pending' || o.status === 'gateway_pending').length);
  };

  // Load helper order history and processed agency withdrawal history
  const loadCompletedHistory = async (helperId?: string) => {
    const id = helperId || helperData?.id;
    if (!id) return;
    
    // Load completed orders for this helper
    const { data: ordersData } = await supabase
      .from('helper_orders')
      .select(`
        *,
        user:profiles!helper_orders_user_id_fkey(display_name, avatar_url, app_uid)
      `)
      .eq('helper_id', id)
      .eq('status', 'completed')
      .order('processed_at', { ascending: false })
      .limit(50);
    
    setCompletedOrders(ordersData || []);
    
    // Load agency withdrawals handled by this helper for history/status tracking
    const { data: withdrawalsData } = await supabase
      .from('agency_withdrawals')
      .select(`
        *,
        agency:agencies(name, agency_code, logo_url, owner_id)
      `)
      .eq('assigned_helper_id', id)
      .in('status', ['processing', 'approved', 'completed', 'rejected'])
      .order('requested_at', { ascending: false })
      .limit(50);
    
    setCompletedWithdrawals((withdrawalsData || []) as AgencyWithdrawal[]);
  };

  // Load admin messages for inbox
  const loadAdminMessages = async (helperId?: string) => {
    const id = helperId || helperData?.id;
    if (!id) return;
    
    const { data } = await supabase
      .from('helper_admin_messages')
      .select('*')
      .eq('helper_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    setAdminMessages(data || []);
    setUnreadAdminMessages((data || []).filter((m: any) => !m.is_read).length);
  };

  // Mark admin messages as read
  const markAdminMessagesRead = async () => {
    if (!helperData?.id) return;
    
    const unreadIds = adminMessages.filter(m => !m.is_read).map(m => m.id);
    if (unreadIds.length === 0) return;
    
    await supabase
      .from('helper_admin_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds);
    
    setAdminMessages(prev => prev.map(m => ({ ...m, is_read: true })));
    setUnreadAdminMessages(0);
  };

  // Load replies for a message
  const loadMessageReplies = async (messageId: string) => {
    setLoadingReplies(true);
    try {
      const { data, error } = await supabase
        .from('helper_message_replies')
        .select('*')
        .eq('message_id', messageId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessageReplies(data || []);
    } catch (error: any) {
      console.error('Error loading replies:', error);
      recordClientError({ label: "Level5HelperDashboard.loadMessageReplies", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoadingReplies(false);
    }
  };

  // Send reply to admin message
  const handleSendReply = async () => {
    if (!selectedMessage || !replyContent.trim()) {
      toast({ title: "Error", description: "Please enter a reply message", variant: "destructive" });
      return;
    }

    setSendingReply(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let screenshotUrl = null;

      // Upload screenshot if provided
      if (replyScreenshot) {
        const fileExt = replyScreenshot.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('helper-screenshots')
          .upload(fileName, replyScreenshot);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('helper-screenshots')
          .getPublicUrl(fileName);
        
        screenshotUrl = urlData.publicUrl;
      }

      // Insert reply
      const { error } = await supabase
        .from('helper_message_replies')
        .insert({
          message_id: selectedMessage.id,
          sender_id: user.id,
          sender_type: 'helper',
          content: replyContent.trim(),
          screenshot_url: screenshotUrl
        });

      if (error) throw error;

      toast({ title: "✅ Reply Sent", description: "Your reply has been sent to admin" });
      setReplyContent("");
      setReplyScreenshot(null);
      loadMessageReplies(selectedMessage.id);
      
      // Update the message in the list to show it has replies
      setAdminMessages(prev => prev.map(m => 
        m.id === selectedMessage.id ? { ...m, has_replies: true, last_reply_at: new Date().toISOString() } : m
      ));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSendingReply(false);
    }
  };

  // Open message detail
  const openMessageDetail = (msg: any) => {
    setSelectedMessage(msg);
    loadMessageReplies(msg.id);
    
    // Mark as read if unread
    if (!msg.is_read) {
      supabase
        .from('helper_admin_messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', msg.id)
        .then(() => {
          setAdminMessages(prev => prev.map(m => 
            m.id === msg.id ? { ...m, is_read: true } : m
          ));
          setUnreadAdminMessages(prev => Math.max(0, prev - 1));
        });
    }
  };

  // Get payment type config for display
  const getPaymentTypeConfig = (type: string) => {
    const configs: Record<string, { icon: string; color: string; label: string }> = {
      'bkash': { icon: '📱', color: 'from-pink-500 to-pink-600', label: 'bKash' },
      'nagad': { icon: '💳', color: 'from-orange-500 to-orange-600', label: 'Nagad' },
      'rocket': { icon: '🚀', color: 'from-purple-500 to-purple-600', label: 'Rocket' },
      'bank': { icon: '🏦', color: 'from-blue-500 to-blue-600', label: 'Bank Transfer' },
      'crypto': { icon: '₿', color: 'from-yellow-500 to-yellow-600', label: 'Crypto' },
      'binance': { icon: '🔶', color: 'from-yellow-500 to-yellow-600', label: 'Binance Pay' },
      'epay': { icon: '💰', color: 'from-green-500 to-green-600', label: 'ePay' },
      'sslcommerz': { icon: '🔐', color: 'from-cyan-500 to-blue-600', label: 'SSLCommerz ⚡' },
      'aamarpay': { icon: '💰', color: 'from-teal-500 to-emerald-600', label: 'AamarPay ⚡' },
    };
    return configs[type.toLowerCase()] || { icon: '💳', color: 'from-gray-500 to-gray-600', label: type };
  };

  // Get currency rate for a country
  const getCurrencyForCountry = (countryCode: string) => {
    return currencyRates.find(r => r.country_code === countryCode) || {
      currency_code: 'USD',
      currency_symbol: '$',
      rate_to_usd: 1
    };
  };

  const handleAddPaymentMethod = async () => {
    if (!accountName || !accountNumber) {
      toast({ title: "Error", description: "Fill all required fields", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const targetCountry = selectedPaymentCountry || helperData.country_code || '';
      if (!targetCountry) {
        toast({ title: "Error", description: "Please select a country", variant: "destructive" });
        setProcessing(false);
        return;
      }
      const { error } = await supabase
        .from('helper_payment_methods')
        .insert({
          helper_id: helperData.id,
          country_code: targetCountry,
          payment_type: paymentType,
          account_name: accountName,
          account_number: accountNumber,
          bank_name: bankName || null,
          is_default: paymentMethods.length === 0,
          merchant_number: merchantNumber || null,
          is_merchant: isMerchant,
        });

      if (error) throw error;

      toast({ title: "Success!", description: "Payment method added" });
      setShowPaymentDialog(false);
      resetPaymentForm();
      loadPaymentMethods();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeletePaymentMethod = async (id: string) => {
    try {
      await supabase
        .from('helper_payment_methods')
        .update({ is_active: false })
        .eq('id', id);
      
      toast({ title: "Deleted", description: "Payment method removed" });
      loadPaymentMethods();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteCountryPaymentMethod = async (id: string) => {
    try {
      await supabase
        .from('helper_country_payment_methods')
        .update({ is_active: false })
        .eq('id', id);
      
      toast({ title: "Deleted", description: "Payment method removed" });
      loadCountryPaymentMethods();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleAddCountryPaymentMethod = async () => {
    // ✅ Generalized gateway detection: ANY integrated gateway from payment_gateways table
    const matchedIntegratedGateway = countryGateways.find(
      g => g.is_integrated && g.gateway_type === paymentType
    );
    const isGatewayType = !!matchedIntegratedGateway
      || ['zinipay', 'sslcommerz', 'aamarpay'].includes(paymentType);

    if (!selectedCountry) {
      toast({ title: "Error", description: "Please select a country", variant: "destructive" });
      return;
    }
    if (!isGatewayType && (!accountName || !accountNumber)) {
      toast({ title: "Error", description: "Fill all required fields", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      let logoUrl: string | null = null;
      
      // Upload logo if selected — MUST go to the PUBLIC `payment-logos` bucket
      // so the recharge page can render it. The `payment-proofs` bucket is private.
      if (paymentLogoFile) {
        setUploadingLogo(true);
        const fileName = `payment-logo-${helperData.id}-${Date.now()}.${paymentLogoFile.name.split('.').pop()}`;
        const { error: uploadError } = await supabase.storage
          .from('payment-logos')
          .upload(fileName, paymentLogoFile);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('payment-logos')
          .getPublicUrl(fileName);
        
        logoUrl = data.publicUrl;
        setUploadingLogo(false);
      }

      const isGateway = isGatewayType;
      const isLegacyGateway = ['sslcommerz', 'aamarpay', 'zinipay'].includes(paymentType);

      const gatewayDisplayMethodValue = gatewayDisplayMethod.trim();
      const gatewayDisplayNumberValue = gatewayDisplayNumber.trim();
      const gatewayPrimaryCredential = accountName.trim();
      const gatewaySecretCredential = accountNumber.trim();

      if (isGateway && (!gatewayDisplayMethodValue || !gatewayDisplayNumberValue)) {
        toast({ title: "Error", description: "Please select display method and enter display number", variant: "destructive" });
        setProcessing(false);
        return;
      }

      if (isGateway && !gatewayPrimaryCredential) {
        toast({ title: "Error", description: "Please enter gateway credentials", variant: "destructive" });
        setProcessing(false);
        return;
      }
      if (isGateway && paymentType !== 'zinipay' && !gatewaySecretCredential) {
        toast({ title: "Error", description: "Please enter gateway secret", variant: "destructive" });
        setProcessing(false);
        return;
      }

      const countryName = selectedCountry;
      const methodName = isGateway ? gatewayDisplayMethodValue : paymentType;
      const { error } = await supabase
        .from('helper_country_payment_methods')
        .insert({
          helper_id: helperData.id,
          country_code: selectedCountry,
          country_name: countryName,
          payment_method_name: methodName,
          method_name: methodName,
          method_type: isGateway ? 'auto_gateway' : paymentType,
          account_name: isGateway ? (paymentType === 'zinipay' ? gatewayDisplayMethodValue : gatewayPrimaryCredential) : accountName,
          account_number: isGateway ? gatewayDisplayNumberValue : accountNumber,
          bank_name: bankName || null,
          instructions: methodInstructions || null,
          logo_url: logoUrl || matchedIntegratedGateway?.logo_url || null,
          additional_info: isGateway ? {
            gateway_type: paymentType,
            gateway_name: matchedIntegratedGateway?.name || paymentType,
            // Legacy specific shapes (kept for backward compatibility with existing edge functions)
            ...(paymentType === 'sslcommerz' ? { store_id: gatewayPrimaryCredential, store_password: gatewaySecretCredential, is_sandbox: false } : {}),
            ...(paymentType === 'aamarpay' ? { store_id: gatewayPrimaryCredential, signature_key: gatewaySecretCredential, is_sandbox: false } : {}),
            ...(paymentType === 'zinipay' ? { zinipay_api_key: gatewayPrimaryCredential } : {}),
            // Generic credential shape for ALL other integrated gateways (PhonePe, GCash, MoMo, etc.)
            ...(!isLegacyGateway ? {
              api_key: gatewayPrimaryCredential,
              api_secret: gatewaySecretCredential,
              is_sandbox: false,
            } : {}),
            display_method: gatewayDisplayMethodValue,
            display_number: gatewayDisplayNumberValue,
            merchant_number: merchantNumber || null,
            is_merchant: true,
          } : {
            merchant_number: merchantNumber || null,
            is_merchant: isMerchant,
          },
        });

      if (error) throw error;

      toast({ title: "Success!", description: "Payment method added for " + selectedCountry });
      setShowCountryPaymentDialog(false);
      resetPaymentForm();
      setPaymentLogoFile(null);
      loadCountryPaymentMethods();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
      setUploadingLogo(false);
    }
  };

  // Handle clicking on agency withdrawal - with LOCKING mechanism
  const handleSelectAgencyWithdrawal = async (withdrawal: AgencyWithdrawal) => {
    // Set claiming state immediately to disable button
    setClaimingWithdrawalId(withdrawal.id);
    
    try {
      // CRITICAL: First check current state from database (not local state)
      const { data: currentState, error: checkError } = await supabase
        .from('agency_withdrawals')
        .select('status, assigned_helper_id, claim_locked_until')
        .eq('id', withdrawal.id)
        .single();
      
      if (checkError || !currentState) {
        toast({ 
          title: "Error", 
          description: "Could not verify withdrawal status", 
          variant: "destructive" 
        });
        loadAgencyWithdrawals();
        return;
      }

      if (currentState.status !== 'pending') {
        toast({ 
          title: "⚠️ Unavailable", 
          description: "This withdrawal is no longer available", 
          variant: "destructive" 
        });
        loadAgencyWithdrawals();
        loadCompletedHistory();
        return;
      }
      
      const lockIsActive = hasActiveClaimLock(currentState);

      if (lockIsActive && currentState.assigned_helper_id && currentState.assigned_helper_id !== helperData?.id) {
        toast({ 
          title: "⚠️ Already Claimed", 
          description: "Another helper already claimed this withdrawal. Refreshing list...", 
          variant: "destructive" 
        });
        loadAgencyWithdrawals(); // Refresh to show updated state
        return;
      }

      const { data: claimResult, error: claimError } = await supabase.rpc('claim_agency_withdrawal' as any, {
        _withdrawal_id: withdrawal.id,
        _helper_id: helperData.id,
        _lock_seconds: CLAIM_LOCK_SECONDS,
      });

      const claimResponse = claimResult as { success?: boolean; error?: string; claim_locked_until?: string | null } | null;

      if (claimError || !claimResponse?.success) {
        toast({ 
          title: "⚠️ Already Claimed", 
          description: claimResponse?.error || "Another helper just claimed this withdrawal. Refreshing list...", 
          variant: "destructive" 
        });
        loadAgencyWithdrawals();
        return;
      }

      withdrawal.assigned_helper_id = helperData.id;
      withdrawal.claim_locked_until = claimResponse.claim_locked_until || new Date(Date.now() + CLAIM_LOCK_SECONDS * 1000).toISOString();

      loadAgencyWithdrawals();
      
      setSelectedAgencyWithdrawal(withdrawal);
      setShowAgencyWithdrawalDialog(true);
    } finally {
      // Clear claiming state
      setClaimingWithdrawalId(null);
    }
  };
  
  // Handle closing the dialog - release lock if not submitted
  const handleCloseAgencyWithdrawalDialog = async () => {
    const withdrawalId = selectedAgencyWithdrawal?.id;

    if (withdrawalId && helperData?.id) {
      await supabase.rpc('release_agency_withdrawal_claim' as any, {
        _withdrawal_id: withdrawalId,
        _helper_id: helperData.id,
      });
    }
    
    setShowAgencyWithdrawalDialog(false);
    setSelectedAgencyWithdrawal(null);
    setScreenshotFile(null);
    setHelperNotes("");
    setHelperTransactionId("");
    loadAgencyWithdrawals(); // Refresh list
  };

  const handleProcessAgencyWithdrawal = async () => {
    if (!selectedAgencyWithdrawal || !screenshotFile) {
      toast({ title: "Error", description: "Upload payment screenshot", variant: "destructive" });
      return;
    }
    const trimmedTx = helperTransactionId.trim();
    if (trimmedTx.length < 4) {
      toast({ title: "Transaction ID required", description: "Enter the payment Transaction ID (min 4 characters)", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const { data: claimResult, error: claimError } = await supabase.rpc('claim_agency_withdrawal' as any, {
        _withdrawal_id: selectedAgencyWithdrawal.id,
        _helper_id: helperData.id,
        _lock_seconds: CLAIM_LOCK_SECONDS,
      });

      const claimResponse = claimResult as { success?: boolean; error?: string } | null;

      if (claimError || !claimResponse?.success) {
        toast({ 
          title: '⚠️ Cannot Process', 
          description: claimResponse?.error || 'This withdrawal has been claimed by another helper or already processed', 
          variant: 'destructive' 
        });
        handleCloseAgencyWithdrawalDialog();
        return;
      }
      
      const fileExt = screenshotFile.name.split('.').pop() || 'jpg';
      const fileName = `agency-withdrawal-${selectedAgencyWithdrawal.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(fileName, screenshotFile, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(fileName);

      const safeNotes = helperNotes.trim().slice(0, 500) || null;

      const { data: processResult, error: processError } = await supabase.rpc('helper_process_agency_withdrawal' as any, {
        _withdrawal_id: selectedAgencyWithdrawal.id,
        _helper_id: helperData.id,
        _screenshot_url: publicUrl,
        _transaction_id: trimmedTx,
        _notes: safeNotes,
      });

      if (processError) throw processError;

      const processResponse = processResult as { success?: boolean; error?: string } | null;
      if (!processResponse?.success) {
        throw new Error(processResponse?.error || 'Failed to process withdrawal');
      }

      // Send notification to agency owner that payment has been processed
      if (selectedAgencyWithdrawal.agency?.owner_id) {
        await supabase.rpc('send_notification', {
          p_user_id: selectedAgencyWithdrawal.agency.owner_id,
          p_type: 'withdrawal_approved',
          p_title: '✅ Withdrawal Approved!',
          p_message: 'Your withdrawal request has been approved and payment has been sent.',
          p_data: { 
            withdrawal_id: selectedAgencyWithdrawal.id,
            amount: selectedAgencyWithdrawal.amount,
            status: 'processing'
          }
        });
      }

      toast({ title: 'Success!', description: 'Payment submitted and sent for admin approval' });
      setShowAgencyWithdrawalDialog(false);
      setSelectedAgencyWithdrawal(null);
      setScreenshotFile(null);
      setHelperNotes("");
      setHelperTransactionId("");
      loadAgencyWithdrawals();
      loadCompletedHistory();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleProcessWithdrawal = async (action: 'mark_paid' | 'submit_screenshot') => {
    if (!selectedWithdrawal) return;

    setProcessing(true);
    try {
      if (action === 'mark_paid') {
        // Mark as paid and wait for screenshot
        await supabase
          .from('helper_withdrawal_requests')
          .update({ 
            status: 'paid',
            paid_at: new Date().toISOString(),
            helper_notes: helperNotes || null
          })
          .eq('id', selectedWithdrawal.id);

        toast({ title: "Marked as Paid", description: "Now upload the payment screenshot" });
      } else if (action === 'submit_screenshot') {
        if (!screenshotFile) {
          toast({ title: "Error", description: "Please upload payment screenshot", variant: "destructive" });
          return;
        }

        // Upload screenshot
        const fileName = `withdrawal-${selectedWithdrawal.id}-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(`withdrawal-proofs/${fileName}`, screenshotFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(`withdrawal-proofs/${fileName}`);

        // Update withdrawal with screenshot
        await supabase
          .from('helper_withdrawal_requests')
          .update({ 
            status: 'screenshot_submitted',
            payment_screenshot_url: publicUrl,
            submitted_at: new Date().toISOString(),
            helper_notes: helperNotes || null
          })
          .eq('id', selectedWithdrawal.id);

        toast({ title: "Screenshot Submitted!", description: "Waiting for admin approval" });
      }

      setShowWithdrawalDialog(false);
      setSelectedWithdrawal(null);
      setScreenshotFile(null);
      setHelperNotes("");
      loadWithdrawals();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const markNotificationsRead = async () => {
    if (!helperData?.id) return;
    
    await supabase
      .from('helper_notifications')
      .update({ is_read: true })
      .eq('helper_id', helperData.id)
      .eq('is_read', false);
    
    setUnreadCount(0);
  };

  const resetPaymentForm = () => {
    setPaymentType("bkash");
    setAccountName("");
    setAccountNumber("");
    setBankName("");
    setSelectedPaymentCountry("");
    setMerchantNumber("");
    setIsMerchant(false);
    setGatewayDisplayMethod("");
    setGatewayDisplayNumber("");
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { color: string; icon: any; label: string }> = {
      pending: { color: "bg-yellow-500", icon: Clock, label: "Pending" },
      paid: { color: "bg-blue-500", icon: DollarSign, label: "Paid" },
      screenshot_submitted: { color: "bg-purple-500", icon: Image, label: "Submitted" },
      approved: { color: "bg-green-500", icon: CheckCircle, label: "Approved" },
      rejected: { color: "bg-red-500", icon: XCircle, label: "Rejected" }
    };
    return configs[status] || configs.pending;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#F7F8FA] flex flex-col overflow-hidden">
      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'var(--content-bottom-padding)'
        }}
      >
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 p-4 rounded-b-3xl">
        <div className="flex items-center gap-3 mb-3">
 <Button variant="ghost" size="icon" className="text-white hover:bg-amber-50/80" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
 <h1 className="font-bold text-lg text-slate-900">Diamond Helper</h1>
 <p className="text-slate-700/75 text-xs">Level 5 • Payroll System</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
 className="text-white hover:bg-amber-50/80 relative"
            onClick={() => { setActiveTab("notifications"); markNotificationsRead(); }}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </Button>
        </div>

        {/* Stats - Mobile Optimized */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-amber-50/80 backdrop-blur-sm rounded-xl p-2 text-center">
 <p className="text-base font-bold text-slate-900">{agencyWithdrawals.length}</p>
 <p className="text-[9px] text-slate-700/60">Agency</p>
          </div>
          <div className="bg-amber-50/80 backdrop-blur-sm rounded-xl p-2 text-center">
 <p className="text-base font-bold text-slate-900">{withdrawalRequests.filter(w => w.status ==='pending').length}</p>
 <p className="text-[9px] text-slate-700/60">Pending</p>
          </div>
          <div className="bg-amber-50/80 backdrop-blur-sm rounded-xl p-2 text-center">
 <p className="text-base font-bold text-slate-900">{countryPaymentMethods.length}</p>
 <p className="text-[9px] text-slate-700/60">Methods</p>
          </div>
          <div className="bg-amber-50/80 backdrop-blur-sm rounded-xl p-2 text-center overflow-hidden">
 <p className="text-xs font-bold text-slate-900 truncate">
              {(() => {
                const totalWallet = (helperData?.wallet_balance || 0) + (agencyDiamondBalance || 0);
                return totalWallet >= 1000000
                  ? `${(totalWallet / 1000000).toFixed(1)}M`
                  : totalWallet >= 1000
                    ? `${(totalWallet / 1000).toFixed(0)}K`
                    : totalWallet.toLocaleString();
              })()}
            </p>
 <p className="text-[9px] text-slate-700/60">💎 Trader Wallet</p>
          </div>
        </div>

        <div className="mt-3">
          <Button
            onClick={() => navigate('/helper-dashboard')}
 className="w-full bg-amber-50/70 hover:bg-amber-50/90 text-slate-900 border border-slate-200/20"
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Open Manual Top-up
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="px-4 mt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-slate-50 rounded-xl p-1 grid grid-cols-5">
 <TabsTrigger value="agency-withdrawals" className="data-[state=active]:bg-orange-500 data-[state=active]:text-slate-900 rounded-lg text-[10px] px-1">
              <Building2 className="w-3 h-3 mr-0.5" />
              Agency
              {agencyWithdrawals.length > 0 && (
 <Badge className="ml-0.5 bg-red-500 text-slate-900 text-[8px] h-4 px-1">{agencyWithdrawals.length}</Badge>
              )}
            </TabsTrigger>
 <TabsTrigger value="orders" className="data-[state=active]:bg-blue-500 data-[state=active]:text-slate-900 rounded-lg text-[10px] px-1">
              <Package className="w-3 h-3 mr-0.5" />
              Orders
              {pendingOrdersCount > 0 && (
 <Badge className="ml-0.5 bg-red-500 text-slate-900 text-[8px] h-4 px-1">{pendingOrdersCount}</Badge>
              )}
            </TabsTrigger>
 <TabsTrigger value="country-methods" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:text-slate-900 rounded-lg text-[10px] px-1">
              <CreditCard className="w-3 h-3 mr-0.5" />
              Methods
            </TabsTrigger>
 <TabsTrigger value="history" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-sky-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:text-slate-900 rounded-lg text-[10px] px-1">
              <Clock className="w-3 h-3 mr-0.5" />
              History
            </TabsTrigger>
            <TabsTrigger 
              value="inbox" 
 className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-violet-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:text-slate-900 rounded-lg text-[10px] px-1 relative"
              onClick={() => markAdminMessagesRead()}
            >
              <Bell className="w-3 h-3 mr-0.5" />
              Inbox
              {unreadAdminMessages > 0 && (
 <Badge className="ml-0.5 bg-red-500 text-slate-900 text-[8px] h-4 px-1">{unreadAdminMessages}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Agency Withdrawals Tab */}
          <TabsContent value="agency-withdrawals" className="mt-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-900 font-semibold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-orange-600" />
                All Agency Withdrawals
              </h3>
              <Badge className="bg-emerald-50 text-emerald-600 text-xs">
                {agencyWithdrawals.filter(w => isWithdrawalAvailableForClaim(w, lockClock)).length} Available
              </Badge>
            </div>
            
            {/* Info Banner */}
            <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-xl p-3 border border-sky-200/30">
              <p className="text-sky-600 text-xs text-center">
                💡 All Level 5 Helpers can see all withdrawals • First-come-first-serve
              </p>
            </div>
            
            {agencyWithdrawals.length === 0 ? (
              <Card className="bg-white border-amber-200/60 shadow-sm">
                <CardContent className="p-8 text-center">
                  <Building2 className="w-12 h-12 mx-auto text-slate-500 mb-3" />
                  <p className="text-slate-700">No pending agency withdrawals</p>
                  <p className="text-xs text-slate-500 mt-1">
                    All withdrawals are cleared 🎉
                  </p>
                </CardContent>
              </Card>
            ) : (
              agencyWithdrawals.map((withdrawal) => {
                const isLocked = hasActiveClaimLock(withdrawal, lockClock);
                const isLockedByOther = isLocked && withdrawal.assigned_helper_id !== helperData?.id;
                const isLockedByMe = isLocked && withdrawal.assigned_helper_id === helperData?.id;
                const isProcessing = withdrawal.status === 'processing';
                const isAvailable = isWithdrawalAvailableForClaim(withdrawal, lockClock);
                
                // Get helper name who is processing
                const processingHelperName = withdrawal.assigned_helper?.profiles?.display_name || 'Another Helper';
                
                return (
                  <Card 
                    key={withdrawal.id}
                    className={cn(
                      "bg-white border-amber-200/60 shadow-sm transition-all",
                      isLockedByOther ? "border-orange-200/50" : "",
                      isLockedByMe && "border-l-4 border-l-cyan-500",
                      isProcessing && "border-l-4 border-l-blue-500"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-12 h-12 border-2 border-orange-200">
                          <AvatarImage src={withdrawal.agency?.logo_url} />
                          <AvatarFallback className="bg-orange-50">
                            <Building2 className="w-5 h-5 text-orange-600" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
 <p className="text-slate-900 font-semibold truncate">{withdrawal.agency?.name ||'Unknown Agency'}</p>
                          <p className="text-slate-700 text-xs">Code: {withdrawal.agency?.agency_code}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge className={cn(
                              "text-xs",
                              isAvailable ? "bg-yellow-500" : 
                              isLockedByOther ? "bg-orange-500 animate-pulse" :
                              isLockedByMe ? "bg-cyan-500" :
                              isProcessing ? "bg-blue-500" :
                              "bg-slate-300"
                            )}>
                              {isAvailable ? "🟡 Pending" :
                               isLockedByOther ? "⏳ Processing" : 
                               isLockedByMe ? "🔒 Your Claim" :
                               isProcessing ? "📤 Submitted" :
                               withdrawal.status}
                            </Badge>
                            {(withdrawal.country_code || (withdrawal.payment_details as any)?.country_code) && (
                              <Badge variant="outline" className="text-xs text-slate-700">
                                {(() => {
                                  const cc = withdrawal.country_code || (withdrawal.payment_details as any)?.country_code;
                                  const nameMap: Record<string, string> = { BD: 'Bangladesh', IN: 'India', PK: 'Pakistan', NP: 'Nepal', ID: 'Indonesia', PH: 'Philippines', MY: 'Malaysia', TH: 'Thailand', VN: 'Vietnam', LK: 'Sri Lanka', AE: 'UAE', SA: 'Saudi Arabia', US: 'USA', GB: 'UK' };
                                  return nameMap[cc] || cc;
                                })()}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-600 font-bold flex items-center justify-end gap-1">
                            <Beans3DIcon size={16} />
                            {resolveNetWithdrawalBeans(withdrawal).toLocaleString()}
                          </p>
                          {withdrawal.local_currency_amount && withdrawal.currency_code && (
                            <p className="text-slate-700 text-xs">
                              ≈ {withdrawal.currency_code} {withdrawal.local_currency_amount.toLocaleString()}
                            </p>
                          )}
                          <p className="text-slate-500 text-[10px]">
                            {format(new Date(withdrawal.requested_at), 'dd MMM')}
                          </p>
                        </div>
                      </div>
                      
                      {/* Claim & Process Button - Only show for available withdrawals */}
                      {isAvailable && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectAgencyWithdrawal(withdrawal);
                          }}
                          disabled={claimingWithdrawalId === withdrawal.id}
 className="w-full mt-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-semibold disabled:opacity-50"
                        >
                          {claimingWithdrawalId === withdrawal.id ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Claiming...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Claim & Process
                            </>
                          )}
                        </Button>
                      )}
                      
                      {/* Your Claim - Show button to continue processing */}
                      {isLockedByMe && withdrawal.status === 'pending' && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAgencyWithdrawal(withdrawal);
                            setShowAgencyWithdrawalDialog(true);
                          }}
 className="w-full mt-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Continue Processing
                        </Button>
                      )}
                      
                      {/* Show processing indicator with helper name */}
                      {isLockedByOther && (
                        <div className="mt-3 p-2 bg-orange-50 rounded-lg border border-orange-200/30">
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
                            <div className="text-center">
                              <p className="text-orange-600 text-xs font-medium">
                                Being processed by:
                              </p>
                              <p className="text-orange-600 text-sm font-bold">
                                {processingHelperName}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Show submitted status */}
                      {isProcessing && (
                        <div className="mt-3 p-2 bg-sky-50 rounded-lg border border-sky-200/30 text-center">
                          <p className="text-sky-700 text-xs flex items-center justify-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Submitted - Waiting for admin approval
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="mt-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-900 font-semibold text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-sky-700" />
                Payroll Orders
              </h3>
              <Badge className="bg-sky-50 text-sky-700 text-xs">
                {helperOrders.length} total
              </Badge>
            </div>
            
            {helperOrders.length === 0 ? (
              <Card className="bg-white border-amber-200/60 shadow-sm">
                <CardContent className="p-8 text-center">
                  <Package className="w-12 h-12 mx-auto text-slate-500 mb-3" />
                  <p className="text-slate-700">No orders yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Orders from users will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              helperOrders.map((order: any) => (
                <Card 
                  key={order.id}
                  className={cn(
                    "bg-white border-amber-200/60 shadow-sm",
                    order.status === 'pending' && "border-l-4 border-l-yellow-500",
                    order.status === 'completed' && "border-l-4 border-l-green-500",
                    order.status === 'cancelled' && "border-l-4 border-l-red-500"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10 border-2 border-sky-200">
                        <AvatarImage src={order.user?.avatar_url} />
                        <AvatarFallback className="bg-sky-50 text-sky-700">
                          {order.user?.display_name?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
 <p className="text-slate-900 font-medium truncate text-sm">
                            {order.user?.display_name || 'Unknown User'}
                          </p>
                          <Badge className={cn(
                            "text-[10px]",
                            order.status === 'pending' && "bg-yellow-500",
                            order.status === 'completed' && "bg-green-500",
                            order.status === 'cancelled' && "bg-red-500"
                          )}>
                            {order.status}
                          </Badge>
                        </div>
                        <p className="text-slate-700 text-xs">ID: {order.user?.app_uid}</p>
                        <p className="text-slate-500 text-[10px]">
                          {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-600 font-bold">{order.coin_amount?.toLocaleString()} 💎</p>
                        <p className="text-slate-700 text-xs">
                          {order.currency_code === 'BDT' ? 'Tk ' : '$'}{order.amount_local?.toFixed(0)}
                        </p>
                        <Badge variant="outline" className="text-[10px] text-slate-700 mt-1">
                          {order.payment_method}
                        </Badge>
                      </div>
                    </div>

                    {/* Transaction ID and Payment Details */}
                    {order.payment_details && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <div className="bg-amber-50/70 rounded-lg p-3">
                          <p className="text-slate-700 text-xs mb-2">📝 Payment Details</p>
                          {(order.payment_details.transaction_id || order.payment_details.user_transaction_id) && (
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-slate-500 text-xs">Transaction ID:</span>
                              <span className="text-amber-600 font-mono text-sm font-bold">
                                {order.payment_details.transaction_id || order.payment_details.user_transaction_id}
                              </span>
                            </div>
                          )}
                          {order.payment_details.manual_review_required && (
                            <div className="mb-2">
                              <span className="inline-block px-2 py-0.5 rounded bg-amber-50 border border-amber-500/40 text-amber-700 text-[10px] font-bold">
                                ⚠ MANUAL REVIEW (auto-verify missed)
                              </span>
                            </div>
                          )}
                          {order.payment_details.account_name && (
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-slate-500 text-xs">Paid to:</span>
 <span className="text-slate-900 text-xs">{order.payment_details.account_name}</span>
                            </div>
                          )}
                          {order.payment_details.account_number && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 text-xs">Number:</span>
                              <span className="text-emerald-600 text-xs font-mono">{order.payment_details.account_number}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* View Payment Proof if available */}
                    {order.user_payment_proof && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs text-sky-700 border-sky-200/50"
                          onClick={() => imageViewer.openImage(order.user_payment_proof)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View Payment Screenshot
                        </Button>
                      </div>
                    )}

                    {/* Process Order Buttons for Pending */}
                    {(order.status === 'pending' || order.status === 'gateway_pending') && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
                        <Button
                          size="sm"
 className="flex-1 bg-green-500 hover:bg-green-600 text-slate-900 text-xs"
                          onClick={async () => {
                            setProcessing(true);
                            try {
                              // 1) Atomically deduct from helper wallet first
                              const { data: deductResult, error: deductError } = await supabase
                                .rpc('deduct_helper_wallet', {
                                  _helper_id: order.helper_id,
                                  _amount: order.coin_amount,
                                  _update_total_sold: true,
                                });

                              if (deductError) {
                                console.error('Deduct RPC Error:', deductError);
                                recordClientError({ label: "Level5HelperDashboard.nameMap", message: deductError instanceof Error ? deductError.message : String(deductError) });
                                throw new Error('Failed to deduct helper wallet');
                              }

                              const deductData = deductResult as any;
                              if (deductData && deductData.success === false) {
                                throw new Error(deductData.error || 'Insufficient helper wallet balance');
                              }

                              // 2) Add diamonds to user
                              const { data: rpcResult, error: rpcError } = await supabase.rpc('helper_add_coins_to_user', {
                                _user_id: order.user_id,
                                _amount: order.coin_amount,
                              });

                              if (rpcError) {
                                console.error('Add Coins RPC Error:', rpcError);
                                recordClientError({ label: "Level5HelperDashboard.deductData", message: rpcError instanceof Error ? rpcError.message : String(rpcError) });
                                throw new Error('Failed to add diamonds to user');
                              }

                              const rpcData = rpcResult as any;
                              if (rpcData && rpcData.success === false) {
                                throw new Error(rpcData.error || 'Failed to add diamonds');
                              }

                              // 3) Mark order completed only after successful transfer
                              const { error: orderUpdateError } = await supabase
                                .from('helper_orders')
                                .update({ status: 'completed', processed_at: new Date().toISOString() })
                                .eq('id', order.id);

                              if (orderUpdateError) {
                                throw orderUpdateError;
                              }

                               // Send notification
                               await supabase.rpc('send_notification', {
                                 p_user_id: order.user_id,
                                 p_type: 'coin_purchase_helper',
                                 p_title: '💎 Diamonds Added!',
                                 p_message: `${order.coin_amount.toLocaleString()} diamonds have been added to your account. Recharge of $${order.amount_usd || 0} completed successfully.`,
                                 p_data: { amount: order.coin_amount, amount_usd: order.amount_usd, source: 'helper' }
                               });

                              toast({ title: "Success!", description: "Order completed and diamonds credited to user" });
                              loadHelperOrders();
                              loadData();
                            } catch (error: any) {
                              toast({ title: "Failed", description: error.message, variant: "destructive" });
                            } finally {
                              setProcessing(false);
                            }
                          }}
                          disabled={processing}
                        >
                          {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-rose-600 border-rose-200/50 hover:bg-rose-50 text-xs"
                          onClick={async () => {
                            setProcessing(true);
                            try {
                              await supabase
                                .from('helper_orders')
                                .update({ status: 'cancelled', processed_at: new Date().toISOString() })
                                .eq('id', order.id);

                              // Send notification
                              await supabase.rpc('send_notification', {
                                p_user_id: order.user_id,
                                p_type: 'order_cancelled',
                                p_title: '❌ Order Cancelled',
                                p_message: `Your order for ${order.coin_amount.toLocaleString()} diamonds has been cancelled`,
                                p_data: { order_id: order.id }
                              });

                              toast({ title: "Cancelled", description: "Order has been cancelled" });
                              loadHelperOrders();
                            } catch (error: any) {
                              toast({ title: "Failed", description: error.message, variant: "destructive" });
                            } finally {
                              setProcessing(false);
                            }
                          }}
                          disabled={processing}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Country Payment Methods Tab */}
          <TabsContent value="country-methods" className="mt-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-900 font-semibold text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                Country Payment Methods
              </h3>
              <Button 
                size="sm" 
                onClick={() => setShowCountryPaymentDialog(true)}
 className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 text-xs h-8"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Method
              </Button>
            </div>
            
            {countryPaymentMethods.length === 0 ? (
              <Card className="bg-white border-amber-200/60 shadow-sm">
                <CardContent className="p-8 text-center">
                  <CreditCard className="w-12 h-12 mx-auto text-slate-500 mb-3" />
                  <p className="text-slate-700">No payment methods added</p>
                  <p className="text-xs text-slate-500 mt-1">Add payment methods for your assigned countries</p>
                  <Button 
                    onClick={() => setShowCountryPaymentDialog(true)}
                    className="mt-4 bg-emerald-500 hover:bg-emerald-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Payment Method
                  </Button>
                </CardContent>
              </Card>
            ) : (
              // Group by country
              Object.entries(
                countryPaymentMethods.reduce((acc, method) => {
                  if (!acc[method.country_code]) acc[method.country_code] = [];
                  acc[method.country_code].push(method);
                  return acc;
                }, {} as Record<string, CountryPaymentMethod[]>)
              ).map(([country, methods]) => (
                <Card key={country} className="bg-white border-amber-200/60 shadow-sm">
                  <CardHeader className="pb-2">
 <CardTitle className="text-sm text-slate-900 flex items-center gap-2">
                      🌍 {country}
                      <Badge className="bg-slate-100 text-xs">{methods.length} methods</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {methods.map((method) => {
                      const config = getPaymentTypeConfig(method.method_type);
                      return (
                        <div 
                          key={method.id}
                          className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"
                        >
                          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-r", config.color)}>
                            <span className="text-lg">{config.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
 <p className="text-slate-900 font-medium text-sm">{method.method_name}</p>
                              {method.is_merchant && (
                                <Badge className="bg-amber-50 text-amber-700 text-[10px] px-1.5 py-0">⚡ Merchant</Badge>
                              )}
                            </div>
                            <p className="text-slate-700 text-xs truncate">{method.account_name}</p>
                            <p className="text-emerald-600 text-xs font-mono">{method.account_number}</p>
                            {method.merchant_number && (
                              <p className="text-amber-700 text-xs font-mono">Merchant: {method.merchant_number}</p>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDeleteCountryPaymentMethod(method.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals" className="mt-4 space-y-3">
            {withdrawalRequests.length === 0 ? (
              <Card className="bg-white border-amber-200/60 shadow-sm">
                <CardContent className="p-8 text-center">
                  <Banknote className="w-12 h-12 mx-auto text-slate-500 mb-3" />
                  <p className="text-slate-700">No withdrawal requests yet</p>
                  <p className="text-xs text-slate-500 mt-1">Requests will appear here when agencies submit withdrawals</p>
                </CardContent>
              </Card>
            ) : (
              withdrawalRequests.map((request) => {
                const statusConfig = getStatusBadge(request.status);
                const StatusIcon = statusConfig.icon;
                
                return (
                  <Card 
                    key={request.id}
                    className="bg-white border-amber-200/60 shadow-sm cursor-pointer hover:bg-amber-50/60 transition-all"
                    onClick={() => { setSelectedWithdrawal(request); setShowWithdrawalDialog(true); }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-12 h-12 border-2 border-slate-200">
                          <AvatarImage src={request.agency?.logo_url || request.host?.avatar_url} />
                          <AvatarFallback className="bg-slate-100">
                            {request.agency ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
 <p className="font-semibold text-slate-900 truncate">
                              {request.agency?.name || request.host?.display_name || 'Unknown'}
                            </p>
 <Badge className={cn("text-slate-900 text-[10px] px-2", statusConfig.color)}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-700">
                            {format(new Date(request.created_at), 'dd MMM yyyy, HH:mm')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600">${request.usd_amount}</p>
                          <p className="text-xs text-slate-700">
                            {request.currency_code} {request.local_amount?.toLocaleString()}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-500" />
                      </div>
                      
                      {request.diamond_reward > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200 flex items-center gap-2">
                          <Gem className="w-4 h-4 text-sky-600" />
                          <span className="text-xs text-sky-600">+{request.diamond_reward.toLocaleString()} diamonds reward</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Payment Methods Tab */}
          <TabsContent value="payments" className="mt-4 space-y-3">
            <Button
              onClick={() => setShowPaymentDialog(true)}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Payment Method
            </Button>

            {paymentMethods.length === 0 ? (
              <Card className="bg-white border-amber-200/60 shadow-sm">
                <CardContent className="p-8 text-center">
                  <CreditCard className="w-12 h-12 mx-auto text-slate-500 mb-3" />
                  <p className="text-slate-700">No payment methods added</p>
                  <p className="text-xs text-slate-500 mt-1">Add your payment methods to receive payments</p>
                </CardContent>
              </Card>
            ) : (
              paymentMethods.map((method) => {
                const typeConfig = getPaymentTypeConfig(method.payment_type);
                
                return (
                  <Card key={method.id} className="bg-white border-amber-200/60 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br text-xl flex-shrink-0",
                          typeConfig.color
                        )}>
                          {typeConfig.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
 <p className="font-semibold text-slate-900">{typeConfig.label}</p>
                              {method.country_code && (
                                <Badge className="bg-sky-50 text-sky-700 text-[10px]">{method.country_code}</Badge>
                              )}
                              {method.is_default && (
                                <Badge className="bg-emerald-50 text-emerald-600 text-[10px]">Default</Badge>
                              )}
                            </div>
                          
                          {/* Account Name with Copy */}
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-sm text-slate-700 truncate">{method.account_name}</p>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(method.account_name);
                                toast({ title: "Copied! ✅", description: "Account name copied" });
                              }}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-100 transition-colors flex-shrink-0"
                            >
                              <Copy className="w-3 h-3 text-emerald-600" />
                            </button>
                          </div>
                          
                          {/* Account Number with Copy */}
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-500 font-mono truncate">{method.account_number}</p>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(method.account_number);
                                toast({ title: "Copied! ✅", description: "Account number copied" });
                              }}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-100 transition-colors flex-shrink-0"
                            >
                              <Copy className="w-3 h-3 text-emerald-600" />
                            </button>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-rose-600 hover:text-red-600 hover:bg-rose-50 flex-shrink-0"
                          onClick={() => handleDeletePaymentMethod(method.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* History Tab - Completed Orders & Withdrawals */}
          <TabsContent value="history" className="mt-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-900 font-semibold text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-600" />
                Transaction History
              </h3>
              <Badge className="bg-cyan-100 text-sky-600 text-xs">
                {completedOrders.length + completedWithdrawals.length} records
              </Badge>
            </div>
            
            {completedOrders.length === 0 && completedWithdrawals.length === 0 ? (
              <Card className="bg-white border-amber-200/60 shadow-sm">
                <CardContent className="p-8 text-center">
                  <Clock className="w-12 h-12 mx-auto text-slate-500 mb-3" />
                  <p className="text-slate-700">No transaction history yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Your processing, completed, and rejected records will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Agency Withdrawal History */}
                {completedWithdrawals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-orange-600 font-medium">💰 Agency Withdrawal History</p>
                    {completedWithdrawals.map((withdrawal) => {
                      const displayStatus = withdrawal.status === 'approved' ? 'completed' : withdrawal.status;
                      const grossReward = Number(withdrawal.diamond_reward ?? 0);
                      const platformFeeAmount = Number(withdrawal.platform_fee_amount ?? 0);
                      const helperReward = Math.max(
                        0,
                        Number(withdrawal.helper_net_reward ?? (grossReward > 0 ? grossReward - platformFeeAmount : 0))
                      );
                      const transactionId = withdrawal.helper_transaction_id || withdrawal.payment_details?.helper_transaction_id;
                      const statusConfig = {
                        completed: {
                          card: 'border-l-green-500',
                          badge: 'bg-green-500',
                          amount: 'text-emerald-600',
                          label: 'Completed'
                        },
                        processing: {
                          card: 'border-l-blue-500',
                          badge: 'bg-blue-500',
                          amount: 'text-sky-700',
                          label: 'Processing'
                        },
                        rejected: {
                          card: 'border-l-red-500',
                          badge: 'bg-red-500',
                          amount: 'text-rose-600',
                          label: 'Rejected'
                        }
                      } as const;
                      const config = statusConfig[displayStatus as keyof typeof statusConfig] || statusConfig.processing;

                      return (
                        <Card key={withdrawal.id} className={cn("bg-white border-amber-200/60 shadow-sm border-l-4", config.card)}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10 border-2 border-slate-200">
                                <AvatarImage src={withdrawal.agency?.logo_url} />
                                <AvatarFallback className="bg-slate-100 text-orange-600">
                                  <Building2 className="w-4 h-4" />
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
 <p className="text-slate-900 font-medium text-sm truncate">
                                  {withdrawal.agency?.name || 'Agency'}
                                </p>
                                <p className="text-slate-700 text-[10px]">
                                  Code: {withdrawal.agency?.agency_code}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <Badge className={cn("text-[10px]", config.badge)}>{config.label}</Badge>
                                  {transactionId && (
                                    <span className="text-amber-600 text-[10px] font-mono truncate max-w-[130px]">
                                      TX: {transactionId}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={cn("font-bold text-sm", config.amount)}>
                                  {helperReward.toLocaleString()} 💎
                                </p>
                                <p className="text-sky-600 text-[10px]">Net diamonds after admin fee</p>
                                <p className="text-slate-500 text-[10px]">
                                  {format(new Date(withdrawal.processed_at || withdrawal.requested_at), 'dd MMM')}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
                
                {/* Completed Orders */}
                {completedOrders.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-sky-700 font-medium mt-4">📦 Payroll Orders</p>
                    {completedOrders.map((order) => (
                      <Card key={order.id} className="bg-white border-amber-200/60 shadow-sm border-l-4 border-l-green-500">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10 border-2 border-sky-200">
                              <AvatarImage src={order.user?.avatar_url} />
                              <AvatarFallback className="bg-sky-50 text-sky-700">
                                {order.user?.display_name?.charAt(0) || 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
 <p className="text-slate-900 font-medium text-sm truncate">
                                {order.user?.display_name || 'User'}
                              </p>
                              <p className="text-slate-700 text-[10px]">ID: {order.user?.app_uid}</p>
                              <Badge className="bg-green-500 text-[10px] mt-1">Completed</Badge>
                            </div>
                            <div className="text-right">
                              <p className="text-emerald-600 font-bold text-sm">
                                {order.coin_amount?.toLocaleString()} 💎
                              </p>
                              <p className="text-slate-700 text-xs">
                                {order.currency_code === 'BDT' ? 'Tk ' : '$'}{order.amount_local?.toFixed(0)}
                              </p>
                              <p className="text-slate-500 text-[10px]">
                                {order.processed_at ? format(new Date(order.processed_at), 'dd MMM') : ''}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Inbox Tab - Admin Messages */}
          <TabsContent value="inbox" className="mt-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-900 font-semibold text-sm flex items-center gap-2">
                <Bell className="w-4 h-4 text-violet-600" />
                Admin Messages
              </h3>
              <Badge className="bg-violet-50 text-violet-600 text-xs">
                {adminMessages.length} messages
              </Badge>
            </div>
            
            {adminMessages.length === 0 ? (
              <Card className="bg-white border-amber-200/60 shadow-sm">
                <CardContent className="p-8 text-center">
                  <Bell className="w-12 h-12 mx-auto text-slate-500 mb-3" />
                  <p className="text-slate-700">No messages from admin</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Important announcements will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              adminMessages.map((msg) => (
                <Card 
                  key={msg.id} 
                  onClick={() => openMessageDetail(msg)}
                  className={cn(
                    "bg-white border-amber-200/60 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors",
                    !msg.is_read && "border-l-4 border-l-purple-500",
                    msg.priority === 'urgent' && "border-l-4 border-l-red-500",
                    msg.priority === 'high' && "border-l-4 border-l-orange-500"
                  )}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                        msg.priority === 'urgent' ? "bg-rose-50" :
                        msg.priority === 'high' ? "bg-orange-50" : "bg-violet-50"
                      )}>
                        {msg.priority === 'urgent' ? (
                          <AlertCircle className="w-5 h-5 text-rose-500" />
                        ) : msg.priority === 'high' ? (
                          <AlertCircle className="w-5 h-5 text-orange-500" />
                        ) : (
                          <Crown className="w-5 h-5 text-violet-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
 <p className="font-semibold text-slate-900 text-sm">{msg.title}</p>
                          {msg.priority === 'urgent' && (
                            <Badge className="bg-red-500 text-[10px]">Urgent</Badge>
                          )}
                          {msg.priority === 'high' && (
                            <Badge className="bg-orange-500 text-[10px]">Important</Badge>
                          )}
                          {msg.has_replies && (
                            <Badge className="bg-emerald-50 text-emerald-600 text-[10px]">
                              <MessageCircle className="w-2 h-2 mr-0.5" />
                              Replied
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 mt-1 line-clamp-2">{msg.message}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] text-slate-500">
                            {format(new Date(msg.created_at), 'dd MMM yyyy, HH:mm')}
                          </p>
                          <div className="flex items-center gap-1 text-violet-600">
                            <Reply className="w-3 h-3" />
                            <span className="text-[10px]">Tap to reply</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Message Detail & Reply Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="bg-white border-slate-200 w-[calc(100%-2rem)] max-w-md max-h-[90vh] flex flex-col p-0 rounded-2xl mx-auto">
          {/* Compact Header */}
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                selectedMessage?.priority === 'urgent' ? "bg-rose-50" :
                selectedMessage?.priority === 'high' ? "bg-orange-50" : "bg-violet-50"
              )}>
                <Crown className={cn(
                  "w-4 h-4",
                  selectedMessage?.priority === 'urgent' ? "text-rose-500" :
                  selectedMessage?.priority === 'high' ? "text-orange-500" : "text-violet-500"
                )} />
              </div>
              <div className="flex-1 min-w-0">
 <DialogTitle className="text-slate-900 text-sm text-left truncate">
                  {selectedMessage?.title}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  {selectedMessage?.priority === 'urgent' && (
                    <Badge className="bg-red-500 text-[9px] px-1.5 py-0">Urgent</Badge>
                  )}
                  {selectedMessage?.priority === 'high' && (
                    <Badge className="bg-orange-500 text-[9px] px-1.5 py-0">Important</Badge>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {selectedMessage && format(new Date(selectedMessage.created_at), 'dd MMM yyyy, HH:mm')}
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable Chat Area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {/* Original Admin Message */}
            <div className="bg-purple-500/10 border border-violet-200/20 rounded-xl p-3 mr-8">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Crown className="w-3 h-3 text-violet-600" />
                <span className="text-[10px] text-violet-600 font-medium">Admin</span>
                <span className="text-[10px] text-slate-500">
                  {selectedMessage && format(new Date(selectedMessage.created_at), 'dd MMM, HH:mm')}
                </span>
              </div>
 <p className="text-slate-900 text-[13px] leading-relaxed whitespace-pre-wrap">{selectedMessage?.message}</p>
            </div>

            {/* Replies Thread */}
            {loadingReplies ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
              </div>
            ) : messageReplies.length > 0 ? (
              <div className="space-y-2">
                {messageReplies.map((reply) => (
                  <div 
                    key={reply.id}
                    className={cn(
                      "rounded-xl p-3",
                      reply.sender_type === 'helper' 
                        ? "bg-cyan-500/10 border border-sky-200/20 ml-8" 
                        : "bg-purple-500/10 border border-violet-200/20 mr-8"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {reply.sender_type === 'helper' ? (
                        <User className="w-3 h-3 text-sky-600" />
                      ) : (
                        <Crown className="w-3 h-3 text-violet-600" />
                      )}
                      <span className={cn(
                        "text-[10px] font-medium",
                        reply.sender_type === 'helper' ? "text-sky-600" : "text-violet-600"
                      )}>
                        {reply.sender_type === 'helper' ? 'You' : 'Admin'}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {format(new Date(reply.created_at), 'dd MMM, HH:mm')}
                      </span>
                    </div>
 <p className="text-slate-900 text-[13px] leading-relaxed whitespace-pre-wrap">{reply.content}</p>
                    {reply.screenshot_url && (
                      <div className="mt-2">
                        <a 
                          href={reply.screenshot_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-block"
                        >
                          <img 
                            src={reply.screenshot_url} 
                            alt="Screenshot" 
                            className="w-full max-w-[200px] h-auto max-h-32 rounded-lg border border-slate-200 hover:opacity-80 transition-opacity object-cover"
                          />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Reply Input - Fixed at Bottom */}
          <div className="p-3 border-t border-slate-200 bg-white/95">
            {/* Screenshot Preview */}
            {replyScreenshot && (
              <div className="relative inline-block mb-2">
                <img 
                  src={URL.createObjectURL(replyScreenshot)} 
                  alt="Screenshot preview" 
                  className="h-16 rounded-lg border border-slate-200"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReplyScreenshot(null)}
                  className="absolute -top-2 -right-2 h-5 w-5 p-0 bg-red-500 hover:bg-red-600 rounded-full"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
            
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Type your reply..."
 className="bg-slate-50 border-slate-200 text-slate-900 text-sm resize-none min-h-[44px] max-h-[80px] mb-2"
              rows={1}
            />
            
            <div className="flex items-center justify-between gap-2">
              <div>
                <input
                  type="file"
                  id="reply-screenshot"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setReplyScreenshot(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('reply-screenshot')?.click()}
                  className="border-slate-200 text-slate-500 hover:bg-slate-50 h-9 text-xs"
                >
                  <ImagePlus className="w-3.5 h-3.5 mr-1" />
                  Add Screenshot
                </Button>
              </div>
              <Button
                onClick={handleSendReply}
                disabled={sendingReply || !replyContent.trim()}
                size="sm"
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 h-9 px-4 text-xs"
              >
                {sendingReply ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 mr-1" />
                    Send Reply
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Payment Method Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="bg-white border-slate-200 max-w-md">
          <DialogHeader>
 <DialogTitle className="text-slate-900">Add Payment Method</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="text-slate-500">Country *</Label>
              <Select value={selectedPaymentCountry} onValueChange={setSelectedPaymentCountry}>
 <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-900 mt-1">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent className="bg-slate-50 border-slate-200">
                  {assignedCountries.length > 0 ? (
                    assignedCountries.map((code) => {
                      const rate = currencyRates.find(r => r.country_code === code);
                      return (
 <SelectItem key={code} value={code} className="text-slate-900">
                          {code} {rate ? `(${rate.currency_code})` : ''}
                        </SelectItem>
                      );
                    })
                  ) : (
 <SelectItem value={helperData?.country_code ||'BD'} className="text-slate-900">
                      {helperData?.country_code || 'BD'}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-500">Payment Type</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
 <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-900 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-50 border-slate-200">
                  {availablePaymentMethods.map((method) => {
                    const config = getPaymentTypeConfig(method.method_type);
                    return (
 <SelectItem key={method.id} value={method.method_type} className="text-slate-900">
                        <span className="flex items-center gap-2">
                          <span>{config.icon}</span>
                          <span>{method.method_name}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-500">Account Name *</Label>
              <Input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Enter account holder name"
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1"
              />
            </div>

            <div>
              <Label className="text-slate-500">Account Number *</Label>
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Enter account number"
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1"
              />
            </div>

            {paymentType === 'bank' && (
              <div>
                <Label className="text-slate-500">Bank Name</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Enter bank name"
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1"
                />
              </div>
            )}

            {/* Merchant Number Section - hide for auto gateways */}
            {!['zinipay', 'sslcommerz', 'aamarpay'].includes(paymentType) && (
            <div className="border border-amber-500/30 rounded-xl p-3 bg-amber-500/10">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="is-merchant-legacy"
                  checked={isMerchant}
                  onChange={(e) => setIsMerchant(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-200"
                />
                <Label htmlFor="is-merchant-legacy" className="text-amber-700 font-medium text-sm cursor-pointer">
                  ⚡ This is a Merchant Account (Auto-Verify)
                </Label>
              </div>
              {isMerchant && (
                <div className="mt-2">
                  <Label className="text-slate-500 text-xs">Merchant Number / API ID</Label>
                  <Input
                    value={merchantNumber}
                    onChange={(e) => setMerchantNumber(e.target.value)}
                    placeholder="Enter merchant number"
 className="bg-slate-50 border-amber-500/30 text-slate-900 mt-1"
                  />
                  <p className="text-xs text-amber-700/70 mt-1">
                    Payments to this merchant will be auto-verified
                  </p>
                </div>
              )}
            </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)} className="border-slate-200">
              Cancel
            </Button>
            <Button 
              onClick={handleAddPaymentMethod}
              disabled={processing}
              className="bg-cyan-500 hover:bg-cyan-600"
            >
              {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Method
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdrawal Detail Dialog */}
      <Dialog open={showWithdrawalDialog} onOpenChange={setShowWithdrawalDialog}>
        <DialogContent className="bg-white border-slate-200 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
 <DialogTitle className="text-slate-900">Withdrawal Details</DialogTitle>
          </DialogHeader>
          
          {selectedWithdrawal && (
            <div className="space-y-4">
              {/* Amount Info */}
              <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl p-4 border border-emerald-200/30">
                <div className="text-center">
                  <p className="text-3xl font-bold text-emerald-600">${selectedWithdrawal.usd_amount}</p>
                  <p className="text-sm text-slate-700 mt-1">
                    ≈ {selectedWithdrawal.currency_code} {selectedWithdrawal.local_amount?.toLocaleString()}
                  </p>
                </div>
                
                {selectedWithdrawal.diamond_reward > 0 && (
                  <div className="mt-3 pt-3 border-t border-emerald-200/30 flex items-center justify-center gap-2">
                    <Gem className="w-5 h-5 text-sky-600" />
                    <span className="text-sky-600 font-semibold">
                      +{selectedWithdrawal.diamond_reward.toLocaleString()} diamonds after approval
                    </span>
                  </div>
                )}
              </div>

              {/* Agency/Host Info */}
              <Card className="bg-white border-amber-200/60 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={selectedWithdrawal.agency?.logo_url || selectedWithdrawal.host?.avatar_url} />
                      <AvatarFallback className="bg-slate-100">
                        {selectedWithdrawal.agency ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                      </AvatarFallback>
                    </Avatar>
                    <div>
 <p className="font-semibold text-slate-900">
                        {selectedWithdrawal.agency?.name || selectedWithdrawal.host?.display_name}
                      </p>
                      {selectedWithdrawal.agency?.agency_code && (
                        <p className="text-xs text-slate-700">Code: {selectedWithdrawal.agency.agency_code}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Status */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-700">Status</span>
 <Badge className={cn("text-slate-900", getStatusBadge(selectedWithdrawal.status).color)}>
                  {getStatusBadge(selectedWithdrawal.status).label}
                </Badge>
              </div>

              {/* Actions based on status */}
              {selectedWithdrawal.status === 'pending' && (
                <>
                  <div>
                    <Label className="text-slate-500">Notes (Optional)</Label>
                    <Textarea
                      value={helperNotes}
                      onChange={(e) => setHelperNotes(e.target.value)}
                      placeholder="Add any notes..."
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1"
                      rows={2}
                    />
                  </div>
                  <Button 
                    onClick={() => handleProcessWithdrawal('mark_paid')}
                    disabled={processing}
                    className="w-full bg-blue-500 hover:bg-blue-600"
                  >
                    {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <DollarSign className="w-4 h-4 mr-2" />
                    Mark as Paid
                  </Button>
                </>
              )}

              {selectedWithdrawal.status === 'paid' && (
                <>
                  <div>
                    <Label className="text-slate-500">Upload Payment Screenshot *</Label>
                    <div className="mt-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="screenshot-upload"
                      />
                      <label 
                        htmlFor="screenshot-upload"
                        className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-sky-200 transition-colors"
                      >
                        {screenshotFile ? (
                          <div className="text-center">
                            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                            <p className="text-sm text-slate-700">{screenshotFile.name}</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <Camera className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                            <p className="text-sm text-slate-700">Click to upload screenshot</p>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>

                  <div>
                    <Label className="text-slate-500">Notes (Optional)</Label>
                    <Textarea
                      value={helperNotes}
                      onChange={(e) => setHelperNotes(e.target.value)}
                      placeholder="Add any notes..."
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1"
                      rows={2}
                    />
                  </div>

                  <Button 
                    onClick={() => handleProcessWithdrawal('submit_screenshot')}
                    disabled={processing || !screenshotFile}
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <Send className="w-4 h-4 mr-2" />
                    Submit for Approval
                  </Button>
                </>
              )}

              {selectedWithdrawal.status === 'screenshot_submitted' && (
                <div className="text-center p-4 bg-violet-50 rounded-xl border border-violet-200/30">
                  <Clock className="w-8 h-8 text-violet-600 mx-auto mb-2" />
                  <p className="text-violet-600 font-semibold">Waiting for Admin Approval</p>
                  <p className="text-xs text-violet-600 mt-1">You'll receive diamonds once approved</p>
                </div>
              )}

              {selectedWithdrawal.status === 'approved' && (
                <div className="text-center p-4 bg-emerald-50 rounded-xl border border-emerald-200/30">
                  <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="text-emerald-600 font-semibold">Approved!</p>
                  <p className="text-xs text-emerald-600 mt-1">
                    +{selectedWithdrawal.diamond_reward.toLocaleString()} diamonds credited
                  </p>
                </div>
              )}

              {selectedWithdrawal.payment_screenshot_url && (
                <div>
                  <Label className="text-slate-500">Payment Screenshot</Label>
                  <div className="mt-2 rounded-xl overflow-hidden">
                    <img 
                      src={selectedWithdrawal.payment_screenshot_url} 
                      alt="Payment proof" 
                      className="w-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Country Payment Method Dialog */}
      <Dialog open={showCountryPaymentDialog} onOpenChange={setShowCountryPaymentDialog}>
        <DialogContent className="bg-white border-slate-200 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
 <DialogTitle className="text-slate-900">Add Country Payment Method</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="text-slate-500">Select Country *</Label>
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
 <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-900 mt-1">
                  <SelectValue placeholder="Choose a country..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-50 border-slate-200 max-h-60">
                  {[
                    { code: 'BD', name: '🇧🇩 Bangladesh', currency: 'BDT' },
                    { code: 'IN', name: '🇮🇳 India', currency: 'INR' },
                    { code: 'PK', name: '🇵🇰 Pakistan', currency: 'PKR' },
                    { code: 'NP', name: '🇳🇵 Nepal', currency: 'NPR' },
                    { code: 'LK', name: '🇱🇰 Sri Lanka', currency: 'LKR' },
                    { code: 'MM', name: '🇲🇲 Myanmar', currency: 'MMK' },
                    { code: 'TH', name: '🇹🇭 Thailand', currency: 'THB' },
                    { code: 'VN', name: '🇻🇳 Vietnam', currency: 'VND' },
                    { code: 'ID', name: '🇮🇩 Indonesia', currency: 'IDR' },
                    { code: 'MY', name: '🇲🇾 Malaysia', currency: 'MYR' },
                    { code: 'PH', name: '🇵🇭 Philippines', currency: 'PHP' },
                    { code: 'SG', name: '🇸🇬 Singapore', currency: 'SGD' },
                    { code: 'KH', name: '🇰🇭 Cambodia', currency: 'KHR' },
                    { code: 'LA', name: '🇱🇦 Laos', currency: 'LAK' },
                    { code: 'AE', name: '🇦🇪 UAE', currency: 'AED' },
                    { code: 'SA', name: '🇸🇦 Saudi Arabia', currency: 'SAR' },
                    { code: 'KW', name: '🇰🇼 Kuwait', currency: 'KWD' },
                    { code: 'QA', name: '🇶🇦 Qatar', currency: 'QAR' },
                    { code: 'BH', name: '🇧🇭 Bahrain', currency: 'BHD' },
                    { code: 'OM', name: '🇴🇲 Oman', currency: 'OMR' },
                    { code: 'JO', name: '🇯🇴 Jordan', currency: 'JOD' },
                    { code: 'IQ', name: '🇮🇶 Iraq', currency: 'IQD' },
                    { code: 'LB', name: '🇱🇧 Lebanon', currency: 'LBP' },
                    { code: 'EG', name: '🇪🇬 Egypt', currency: 'EGP' },
                    { code: 'NG', name: '🇳🇬 Nigeria', currency: 'NGN' },
                    { code: 'KE', name: '🇰🇪 Kenya', currency: 'KES' },
                    { code: 'GH', name: '🇬🇭 Ghana', currency: 'GHS' },
                    { code: 'ZA', name: '🇿🇦 South Africa', currency: 'ZAR' },
                    { code: 'TZ', name: '🇹🇿 Tanzania', currency: 'TZS' },
                    { code: 'UG', name: '🇺🇬 Uganda', currency: 'UGX' },
                    { code: 'ET', name: '🇪🇹 Ethiopia', currency: 'ETB' },
                    { code: 'CM', name: '🇨🇲 Cameroon', currency: 'XAF' },
                    { code: 'SN', name: '🇸🇳 Senegal', currency: 'XOF' },
                    { code: 'CI', name: '🇨🇮 Ivory Coast', currency: 'XOF' },
                    { code: 'MA', name: '🇲🇦 Morocco', currency: 'MAD' },
                    { code: 'TN', name: '🇹🇳 Tunisia', currency: 'TND' },
                    { code: 'DZ', name: '🇩🇿 Algeria', currency: 'DZD' },
                    { code: 'TR', name: '🇹🇷 Turkey', currency: 'TRY' },
                    { code: 'RU', name: '🇷🇺 Russia', currency: 'RUB' },
                    { code: 'UA', name: '🇺🇦 Ukraine', currency: 'UAH' },
                    { code: 'GE', name: '🇬🇪 Georgia', currency: 'GEL' },
                    { code: 'AZ', name: '🇦🇿 Azerbaijan', currency: 'AZN' },
                    { code: 'UZ', name: '🇺🇿 Uzbekistan', currency: 'UZS' },
                    { code: 'KZ', name: '🇰🇿 Kazakhstan', currency: 'KZT' },
                    { code: 'BR', name: '🇧🇷 Brazil', currency: 'BRL' },
                    { code: 'MX', name: '🇲🇽 Mexico', currency: 'MXN' },
                    { code: 'AR', name: '🇦🇷 Argentina', currency: 'ARS' },
                    { code: 'CO', name: '🇨🇴 Colombia', currency: 'COP' },
                    { code: 'PE', name: '🇵🇪 Peru', currency: 'PEN' },
                    { code: 'CL', name: '🇨🇱 Chile', currency: 'CLP' },
                    { code: 'EC', name: '🇪🇨 Ecuador', currency: 'USD' },
                    { code: 'VE', name: '🇻🇪 Venezuela', currency: 'VES' },
                    { code: 'DO', name: '🇩🇴 Dominican Republic', currency: 'DOP' },
                    { code: 'US', name: '🇺🇸 United States', currency: 'USD' },
                    { code: 'CA', name: '🇨🇦 Canada', currency: 'CAD' },
                    { code: 'GB', name: '🇬🇧 United Kingdom', currency: 'GBP' },
                    { code: 'DE', name: '🇩🇪 Germany', currency: 'EUR' },
                    { code: 'FR', name: '🇫🇷 France', currency: 'EUR' },
                    { code: 'IT', name: '🇮🇹 Italy', currency: 'EUR' },
                    { code: 'ES', name: '🇪🇸 Spain', currency: 'EUR' },
                    { code: 'NL', name: '🇳🇱 Netherlands', currency: 'EUR' },
                    { code: 'PT', name: '🇵🇹 Portugal', currency: 'EUR' },
                    { code: 'BE', name: '🇧🇪 Belgium', currency: 'EUR' },
                    { code: 'AT', name: '🇦🇹 Austria', currency: 'EUR' },
                    { code: 'SE', name: '🇸🇪 Sweden', currency: 'SEK' },
                    { code: 'NO', name: '🇳🇴 Norway', currency: 'NOK' },
                    { code: 'DK', name: '🇩🇰 Denmark', currency: 'DKK' },
                    { code: 'FI', name: '🇫🇮 Finland', currency: 'EUR' },
                    { code: 'PL', name: '🇵🇱 Poland', currency: 'PLN' },
                    { code: 'CZ', name: '🇨🇿 Czech Republic', currency: 'CZK' },
                    { code: 'RO', name: '🇷🇴 Romania', currency: 'RON' },
                    { code: 'HU', name: '🇭🇺 Hungary', currency: 'HUF' },
                    { code: 'AU', name: '🇦🇺 Australia', currency: 'AUD' },
                    { code: 'NZ', name: '🇳🇿 New Zealand', currency: 'NZD' },
                    { code: 'JP', name: '🇯🇵 Japan', currency: 'JPY' },
                    { code: 'KR', name: '🇰🇷 South Korea', currency: 'KRW' },
                    { code: 'CN', name: '🇨🇳 China', currency: 'CNY' },
                    { code: 'HK', name: '🇭🇰 Hong Kong', currency: 'HKD' },
                    { code: 'TW', name: '🇹🇼 Taiwan', currency: 'TWD' },
                    { code: 'GLOBAL', name: '🌍 Global (ePay/Crypto)', currency: 'USD' },
                  ].map((country) => (
 <SelectItem key={country.code} value={country.code} className="text-slate-900">
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-500">Payment Method Type *</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
 <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-900 mt-1">
                  <SelectValue placeholder={selectedCountry ? "Select payment method..." : "Select a country first"} />
                </SelectTrigger>
                <SelectContent className="bg-slate-50 border-slate-200 max-h-72">
                  {/* ═══ AUTO PAYMENT GATEWAYS — country specific (from payment_gateways table) ═══ */}
                  {countryGateways.filter(g => g.is_integrated).length > 0 && (
                    <div className="px-2 py-1 text-[10px] text-amber-700 font-bold uppercase tracking-wider">
                      ⚡ Auto Gateways — {selectedCountry || 'Global'}
                    </div>
                  )}
                  {countryGateways
                    .filter(g => g.is_integrated)
                    .map(g => (
 <SelectItem key={g.id} value={g.gateway_type} className="text-slate-900">
                        ⚡ {g.name} <span className="text-[10px] text-amber-700/70 ml-1">(Auto Pay)</span>
                      </SelectItem>
                    ))}

                  {/* ═══ MANUAL METHODS — universal fallbacks (always visible) ═══ */}
                  <div className="px-2 py-1 text-[10px] text-slate-700 font-bold uppercase tracking-wider mt-1">
                    📝 Manual Methods
                  </div>
 <SelectItem value="bkash" className="text-slate-900">📱 bKash</SelectItem>
 <SelectItem value="nagad" className="text-slate-900">💳 Nagad</SelectItem>
 <SelectItem value="rocket" className="text-slate-900">🚀 Rocket</SelectItem>
 <SelectItem value="upay" className="text-slate-900">📲 Upay</SelectItem>
 <SelectItem value="bank" className="text-slate-900">🏦 Bank Transfer</SelectItem>
 <SelectItem value="upi" className="text-slate-900">📱 UPI (India)</SelectItem>
 <SelectItem value="paytm" className="text-slate-900">💰 Paytm</SelectItem>
 <SelectItem value="phonepe" className="text-slate-900">📱 PhonePe</SelectItem>
 <SelectItem value="gpay" className="text-slate-900">💳 Google Pay</SelectItem>
 <SelectItem value="jazzcash" className="text-slate-900">🎵 JazzCash</SelectItem>
 <SelectItem value="easypaisa" className="text-slate-900">💚 EasyPaisa</SelectItem>
 <SelectItem value="gcash" className="text-slate-900">💙 GCash</SelectItem>
 <SelectItem value="maya" className="text-slate-900">💜 Maya</SelectItem>
 <SelectItem value="grab" className="text-slate-900">🟢 GrabPay</SelectItem>
 <SelectItem value="momo" className="text-slate-900">💗 MoMo</SelectItem>
 <SelectItem value="ovo" className="text-slate-900">💜 OVO</SelectItem>
 <SelectItem value="dana" className="text-slate-900">🔵 DANA</SelectItem>
 <SelectItem value="gopay" className="text-slate-900">🟢 GoPay</SelectItem>
 <SelectItem value="mpesa" className="text-slate-900">🟢 M-Pesa</SelectItem>
 
 <SelectItem value="crypto" className="text-slate-900">₿ Crypto (USDT)</SelectItem>
 <SelectItem value="paypal" className="text-slate-900">💙 PayPal</SelectItem>
 <SelectItem value="wise" className="text-slate-900">💚 Wise</SelectItem>
 <SelectItem value="skrill" className="text-slate-900">💜 Skrill</SelectItem>
 <SelectItem value="payoneer" className="text-slate-900">🟠 Payoneer</SelectItem>
 
 <SelectItem value="alipay" className="text-slate-900">🔵 Alipay</SelectItem>
 <SelectItem value="wechat" className="text-slate-900">🟢 WeChat Pay</SelectItem>
 <SelectItem value="line_pay" className="text-slate-900">🟢 LINE Pay</SelectItem>
 <SelectItem value="truemoney" className="text-slate-900">🟠 TrueMoney</SelectItem>
 <SelectItem value="promptpay" className="text-slate-900">💙 PromptPay</SelectItem>
 <SelectItem value="touch_n_go" className="text-slate-900">🔵 Touch'n Go</SelectItem>
 <SelectItem value="duitnow" className="text-slate-900">💜 DuitNow</SelectItem>
 <SelectItem value="pix" className="text-slate-900">💚 PIX (Brazil)</SelectItem>
                </SelectContent>
              </Select>
              {!selectedCountry && (
                <p className="text-[10px] text-amber-700/80 mt-1">
                  💡 Select a country above to see available auto gateways for that region
                </p>
              )}
            </div>

            {!['zinipay', 'sslcommerz', 'aamarpay'].includes(paymentType) && (
              <div>
                <Label className="text-slate-500">Account Holder Name *</Label>
                <Input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Enter account holder name"
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1"
                />
              </div>
            )}

            {!['zinipay', 'sslcommerz', 'aamarpay'].includes(paymentType) && (
              <div>
                <Label className="text-slate-500">Account Number / Wallet *</Label>
                <Input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Enter account number or wallet address"
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1"
                />
              </div>
            )}

            {paymentType === 'bank' && (
              <div>
                <Label className="text-slate-500">Bank Name</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Enter bank name"
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1"
                />
              </div>
            )}

            {/* ═══ ZiniPay Gateway (Personal Account Auto Pay) ═══ */}
            {paymentType === 'zinipay' && (
              <div className="border border-emerald-200/30 rounded-xl p-3 bg-emerald-500/10 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">⚡</span>
                  <p className="text-emerald-600 font-semibold text-sm">ZiniPay Auto Pay Setup</p>
                </div>
                <p className="text-xs text-emerald-600/70 mb-2">
                  🎯 Auto payment using personal bKash/Nagad number. No merchant account needed!
                </p>

                {/* Display As */}
                <div>
                  <Label className="text-slate-500 text-xs">Display As (visible to users) *</Label>
                  <Select value={gatewayDisplayMethod} onValueChange={setGatewayDisplayMethod}>
 <SelectTrigger className="bg-slate-50 border-emerald-200/30 text-slate-900 mt-1">
                      <SelectValue placeholder="Select method..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-50 border-slate-200">
 <SelectItem value="bkash" className="text-slate-900">📱 bKash</SelectItem>
 <SelectItem value="nagad" className="text-slate-900">💳 Nagad</SelectItem>
 <SelectItem value="rocket" className="text-slate-900">🚀 Rocket</SelectItem>
 <SelectItem value="upay" className="text-slate-900">📲 Upay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Personal Number */}
                <div>
                  <Label className="text-slate-500 text-xs">Personal Number (visible to users) *</Label>
                  <Input
                    value={gatewayDisplayNumber}
                    onChange={(e) => setGatewayDisplayNumber(e.target.value)}
                    placeholder="e.g., 01700000000"
 className="bg-slate-50 border-emerald-200/30 text-slate-900 mt-1"
                  />
                </div>

                {/* ZiniPay API Key */}
                <div className="border-t border-emerald-200/20 pt-2 mt-2">
                  <p className="text-[10px] text-emerald-600/50 mb-2">🔒 ZiniPay Credentials (hidden from users)</p>
                </div>
                <div>
                  <Label className="text-slate-500 text-xs">ZiniPay API Key *</Label>
                  <Input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="zp_api_xxxxx"
 className="bg-slate-50 border-emerald-200/30 text-slate-900 mt-1"
                    type="password"
                  />
                </div>
                <div className="bg-yellow-500/10 border border-amber-200/30 rounded-lg p-2">
                  <p className="text-[10px] text-amber-600">
                    ⚠️ Create an account on zinipay.com, then go to Dashboard → Brands → copy the Brand Key/API Key. Add this number to your ZiniPay dashboard too!
                  </p>
                </div>
              </div>
            )}

            {/* ✨ Generic Gateway Form — for ALL country-specific integrated gateways
                (PhonePe IN, GCash PH, MoMo VN, eSewa NP, JazzCash PK, M-Pesa KE, etc.)
                Excludes the 3 legacy BD gateways which have their own dedicated forms above */}
            {(() => {
              const matched = countryGateways.find(g => g.is_integrated && g.gateway_type === paymentType);
              const isLegacy = ['zinipay', 'sslcommerz', 'aamarpay'].includes(paymentType);
              if (!matched || isLegacy) return null;
              return (
                <div className="border border-violet-200/30 rounded-xl p-3 bg-purple-500/10 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">⚡</span>
                    <p className="text-violet-600 font-semibold text-sm">{matched.name} Auto Pay Setup</p>
                  </div>
                  <p className="text-xs text-violet-600/70 mb-2">
                    🌍 Country: <strong>{selectedCountry}</strong> · Auto verification will credit diamonds instantly when payment confirms.
                  </p>

                  <div>
                    <Label className="text-slate-500 text-xs">Display As (visible to users) *</Label>
                    <Input
                      value={gatewayDisplayMethod}
                      onChange={(e) => setGatewayDisplayMethod(e.target.value)}
                      placeholder={`e.g., ${matched.name}`}
 className="bg-slate-50 border-violet-200/30 text-slate-900 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-500 text-xs">Display Number / Account (visible to users) *</Label>
                    <Input
                      value={gatewayDisplayNumber}
                      onChange={(e) => setGatewayDisplayNumber(e.target.value)}
                      placeholder="e.g., merchant phone, UPI ID, etc."
 className="bg-slate-50 border-violet-200/30 text-slate-900 mt-1"
                    />
                  </div>

                  <div className="border-t border-violet-200/20 pt-2 mt-2">
                    <p className="text-[10px] text-violet-600/50 mb-2">🔒 {matched.name} Credentials (hidden from users)</p>
                  </div>
                  <div>
                    <Label className="text-slate-500 text-xs">API Key / Merchant ID *</Label>
                    <Input
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="Enter API key or merchant ID"
 className="bg-slate-50 border-violet-200/30 text-slate-900 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-500 text-xs">API Secret / Salt Key *</Label>
                    <Input
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="Enter API secret or salt key"
 className="bg-slate-50 border-violet-200/30 text-slate-900 mt-1"
                      type="password"
                    />
                  </div>
                </div>
              );
            })()}

            {/* SSLCommerz / AamarPay Gateway Credentials */}
            {(paymentType === 'sslcommerz' || paymentType === 'aamarpay') && (
              <div className="border border-sky-200/30 rounded-xl p-3 bg-cyan-500/10 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{paymentType === 'sslcommerz' ? '🔐' : '💰'}</span>
                  <p className="text-sky-600 font-semibold text-sm">
                    {paymentType === 'sslcommerz' ? 'SSLCommerz' : 'AamarPay'} Gateway Setup
                  </p>
                </div>
                <p className="text-xs text-sky-600/70 mb-2">
                  ⚡ Auto Payment: Users pay via gateway. Diamonds credited instantly. Gateway name is hidden from users.
                </p>

                {/* Display As */}
                <div>
                  <Label className="text-slate-500 text-xs">Display As (User will see this) *</Label>
                  <Select value={gatewayDisplayMethod} onValueChange={setGatewayDisplayMethod}>
 <SelectTrigger className="bg-slate-50 border-sky-200/30 text-slate-900 mt-1">
                      <SelectValue placeholder="Select display method..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-50 border-slate-200">
 <SelectItem value="bkash" className="text-slate-900">📱 bKash</SelectItem>
 <SelectItem value="nagad" className="text-slate-900">💳 Nagad</SelectItem>
 <SelectItem value="rocket" className="text-slate-900">🚀 Rocket</SelectItem>
 <SelectItem value="upay" className="text-slate-900">📲 Upay</SelectItem>
 <SelectItem value="bank" className="text-slate-900">🏦 Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-500 text-xs">Display Number (shown to users) *</Label>
                  <Input
                    value={gatewayDisplayNumber}
                    onChange={(e) => setGatewayDisplayNumber(e.target.value)}
                    placeholder="e.g., 01700000000 (bKash/Nagad number)"
 className="bg-slate-50 border-sky-200/30 text-slate-900 mt-1"
                  />
                </div>

                <div className="border-t border-sky-200/20 pt-2 mt-2">
                  <p className="text-[10px] text-sky-600/50 mb-2">🔒 Gateway Credentials (hidden from users)</p>
                </div>
                <div>
                  <Label className="text-slate-500 text-xs">Store ID *</Label>
                  <Input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder={paymentType === 'sslcommerz' ? 'e.g., merilivestore' : 'e.g., aamarpaystore'}
 className="bg-slate-50 border-sky-200/30 text-slate-900 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-500 text-xs">
                    {paymentType === 'sslcommerz' ? 'Store Password *' : 'Signature Key *'}
                  </Label>
                  <Input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder={paymentType === 'sslcommerz' ? 'Enter store password' : 'Enter signature key'}
 className="bg-slate-50 border-sky-200/30 text-slate-900 mt-1"
                    type="password"
                  />
                </div>
                <div className="bg-yellow-500/10 border border-amber-200/30 rounded-lg p-2">
                  <p className="text-[10px] text-amber-600">
                    ⚠️ {paymentType === 'sslcommerz' 
                      ? 'Get credentials from sslcommerz.com → Merchant Panel → API/Integration' 
                      : 'Get credentials from aamarpay.com → Merchant Dashboard → API Keys'}
                  </p>
                </div>
              </div>
            )}

            <div>
              <Label className="text-slate-500">Instructions (Optional)</Label>
              <Textarea
                value={methodInstructions}
                onChange={(e) => setMethodInstructions(e.target.value)}
                placeholder="Any special instructions for payment..."
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1"
                rows={2}
              />
            </div>

            {/* Logo Upload */}
            <div>
              <Label className="text-slate-500">Payment Method Logo (Optional)</Label>
              <div className="mt-2 flex items-center gap-4">
                {paymentLogoFile ? (
                  <div className="relative">
                    <img 
                      src={URL.createObjectURL(paymentLogoFile)} 
                      alt="Logo preview" 
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setPaymentLogoFile(null)}
 className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-slate-900 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-16 h-16 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-pink-200 transition-colors">
                    <Upload className="w-5 h-5 text-slate-700" />
                    <span className="text-xs text-slate-700 mt-1">Logo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setPaymentLogoFile(file);
                      }}
                    />
                  </label>
                )}
                <p className="text-xs text-slate-500">
                  Upload a logo for this payment method (PNG, JPG)
                </p>
              </div>
            </div>

            {/* Merchant Number Section - hide for auto gateways */}
            {!['zinipay', 'sslcommerz', 'aamarpay'].includes(paymentType) && (
            <div className="border border-amber-500/30 rounded-xl p-3 bg-amber-500/10">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="is-merchant-country"
                  checked={isMerchant}
                  onChange={(e) => setIsMerchant(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-200"
                />
                <Label htmlFor="is-merchant-country" className="text-amber-700 font-medium text-sm cursor-pointer">
                  ⚡ This is a Merchant Account (Auto-Verify)
                </Label>
              </div>
              {isMerchant && (
                <div className="mt-2">
                  <Label className="text-slate-500 text-xs">Merchant Number / API ID</Label>
                  <Input
                    value={merchantNumber}
                    onChange={(e) => setMerchantNumber(e.target.value)}
                    placeholder="Enter merchant number"
 className="bg-slate-50 border-amber-500/30 text-slate-900 mt-1"
                  />
                  <p className="text-xs text-amber-700/70 mt-1">
                    Payments to this merchant will be auto-verified
                  </p>
                </div>
              )}
            </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setShowCountryPaymentDialog(false); resetPaymentForm(); setSelectedCountry(""); setMethodInstructions(""); }} className="border-slate-200">
              Cancel
            </Button>
            <Button 
              onClick={handleAddCountryPaymentMethod}
              disabled={processing || !selectedCountry || !accountName.trim() || (paymentType !== 'zinipay' && !accountNumber.trim())}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Method
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agency Withdrawal Dialog */}
      <Dialog open={showAgencyWithdrawalDialog} onOpenChange={(open) => {
        if (!open) {
          handleCloseAgencyWithdrawalDialog();
        }
      }}>
        <DialogContent className="bg-white border-slate-200 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
 <DialogTitle className="text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-600" />
              Agency Withdrawal
            </DialogTitle>
          </DialogHeader>
          
          {selectedAgencyWithdrawal && (
            <div className="space-y-4">
              {/* Agency Info */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Avatar className="w-14 h-14 border-2 border-orange-200">
                  <AvatarImage src={selectedAgencyWithdrawal.agency?.logo_url} />
                  <AvatarFallback className="bg-orange-50">
                    <Building2 className="w-6 h-6 text-orange-600" />
                  </AvatarFallback>
                </Avatar>
                <div>
 <p className="text-slate-900 font-semibold">{selectedAgencyWithdrawal.agency?.name}</p>
                  <p className="text-slate-700 text-sm">Code: {selectedAgencyWithdrawal.agency?.agency_code}</p>
                  <Badge className={cn(
                    "text-xs mt-1",
                    selectedAgencyWithdrawal.status === 'pending' ? "bg-yellow-500" : "bg-blue-500"
                  )}>
                    {selectedAgencyWithdrawal.status}
                  </Badge>
                </div>
              </div>

              {/* Amount Info - Local Amount (after fee) */}
              <div className="bg-gradient-to-br from-emerald-500/20 to-green-500/20 rounded-xl p-4 border border-emerald-200/30">
                <div className="text-center flex flex-col items-center">
                  <div className="flex items-center gap-2 justify-center">
                    <span className="text-3xl">💰</span>
                    <p className="text-3xl font-bold text-emerald-600">
                      {(() => {
                        const pd = selectedAgencyWithdrawal.payment_details as any;
                        const cc = pd?.currency_code || selectedAgencyWithdrawal.currency_code;
                        const symbolMap: Record<string, string> = { BDT: 'Tk ', INR: '₹', PKR: '₨', NPR: '₨', IDR: 'Rp', PHP: '₱', MYR: 'RM', THB: '฿', VND: '₫', LKR: 'Rs', AED: 'د.إ', SAR: '﷼', USD: '$', GBP: '£' };
                        const symbol = symbolMap[cc] || cc || '';
                        const netLocal = resolveNetWithdrawalLocal(selectedAgencyWithdrawal);
                        return `${symbol}${Number(netLocal).toLocaleString()}`;
                      })()}
                    </p>
                  </div>
                  <p className="text-slate-700 text-xs mt-1">Payable Amount After Fee</p>
                </div>
              </div>

              {/* Payment Details - Show Transaction ID and Account Info */}
              {selectedAgencyWithdrawal.payment_details && (
                <div className="bg-slate-50 rounded-xl p-4">
 <p className="text-slate-900 font-semibold mb-3 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-sky-600" />
                    📝 Payment Details
                  </p>
                  
                  {/* Transaction ID - Highlighted */}
                  {(selectedAgencyWithdrawal.payment_details as any)?.transaction_id && (
                    <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-lg p-3 mb-3 border border-amber-200/30">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-700 text-xs">Transaction ID:</span>
                        <span className="text-amber-600 font-mono text-lg font-bold">
                          {(selectedAgencyWithdrawal.payment_details as any).transaction_id}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Highlighted Payment Method Info - Country Name + Method + Time */}
                  <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-lg p-3 mb-3 border border-sky-200/30">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      {/* Country with Full Name */}
                      {(() => {
                        const cc = selectedAgencyWithdrawal.country_code || (selectedAgencyWithdrawal.payment_details as any)?.country_code;
                        const flagMap: Record<string, string> = { BD: '🇧🇩', IN: '🇮🇳', PK: '🇵🇰', NP: '🇳🇵', ID: '🇮🇩', PH: '🇵🇭', MY: '🇲🇾', TH: '🇹🇭', VN: '🇻🇳', LK: '🇱🇰', AE: '🇦🇪', SA: '🇸🇦', US: '🇺🇸', GB: '🇬🇧' };
                        const nameMap: Record<string, string> = { BD: 'Bangladesh', IN: 'India', PK: 'Pakistan', NP: 'Nepal', ID: 'Indonesia', PH: 'Philippines', MY: 'Malaysia', TH: 'Thailand', VN: 'Vietnam', LK: 'Sri Lanka', AE: 'UAE', SA: 'Saudi Arabia', US: 'USA', GB: 'UK' };
                        return (
                          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg">
                            <span className="text-lg">{flagMap[cc] || '🌍'}</span>
                            <span className="text-slate-900 font-bold">{nameMap[cc] || cc || 'Unknown'}</span>
                          </div>
                        );
                      })()}
                      
                      <span className="text-slate-700">•</span>
                      
                      {/* Payment Method Name */}
                      <div className="bg-gradient-to-r from-pink-500/30 to-purple-500/30 px-3 py-1.5 rounded-lg border border-pink-200/40">
                        <span className="text-pink-600 font-bold text-sm">
                          {selectedAgencyWithdrawal.payment_method || 'N/A'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Request Time */}
                    <div className="mt-2 text-center">
                      <span className="text-slate-700 text-xs">
                        🕐 {format(new Date(selectedAgencyWithdrawal.requested_at), 'dd MMM yyyy, hh:mm a')}
                      </span>
                    </div>
                  </div>
                  
                  {/* Account Details Grid */}
                  <div className="space-y-2 text-sm">
                    {/* Local Amount - FIRST */}
                    {(selectedAgencyWithdrawal.payment_details as any)?.local_amount && (
                      <div className="flex items-center justify-between bg-emerald-500/10 rounded-lg p-2 border border-emerald-200/20">
                        <span className="text-slate-700">Payable Local Amount:</span>
                        <span className="text-emerald-600 font-bold text-lg">
                          {(() => {
                            const pd = selectedAgencyWithdrawal.payment_details as any;
                            const cc = pd?.currency_code || selectedAgencyWithdrawal.currency_code;
                            const symbolMap: Record<string, string> = { BDT: 'Tk ', INR: '₹', PKR: '₨', NPR: '₨', IDR: 'Rp', PHP: '₱', MYR: 'RM', THB: '฿', VND: '₫', LKR: 'Rs' };
                            const symbol = symbolMap[cc] || '';
                            const netLocal = resolveNetWithdrawalLocal(selectedAgencyWithdrawal);
                            return `${symbol}${Number(netLocal).toLocaleString()}`;
                          })()}
                        </span>
                      </div>
                    )}
                    
                    {/* USD Amount */}
                    {(selectedAgencyWithdrawal.payment_details as any)?.usd_amount && (
                      <div className="flex items-center justify-between bg-amber-50/70 rounded-lg p-2">
                        <span className="text-slate-700">Payable USD Amount:</span>
                        <span className="text-sky-600 font-bold">
                          ${resolveNetWithdrawalUsd(selectedAgencyWithdrawal).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Account Name */}
                    {(selectedAgencyWithdrawal.payment_details as any)?.account_name && (
                      <div className="flex items-center justify-between bg-amber-50/70 rounded-lg p-2">
                        <span className="text-slate-700">Paid to:</span>
                        <span className="text-emerald-600 font-semibold">
                          {(selectedAgencyWithdrawal.payment_details as any).account_name}
                        </span>
                      </div>
                    )}
                    
                    {/* Account Number with Copy */}
                    {(selectedAgencyWithdrawal.payment_details as any)?.account_number && (
                      <div className="flex items-center justify-between bg-amber-50/70 rounded-lg p-2">
                        <span className="text-slate-700">Number:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600 font-mono font-semibold">
                            {(selectedAgencyWithdrawal.payment_details as any).account_number}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText((selectedAgencyWithdrawal.payment_details as any).account_number);
                              toast({ title: "✅ Copied!", description: "Number copied to clipboard" });
                            }}
                            className="p-1 bg-cyan-100 hover:bg-cyan-500/40 rounded-md transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5 text-sky-600" />
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Bank Name if exists */}
                    {(selectedAgencyWithdrawal.payment_details as any)?.bank_name && (
                      <div className="flex items-center justify-between bg-amber-50/70 rounded-lg p-2">
                        <span className="text-slate-700">Bank:</span>
 <span className="text-slate-900 font-medium">
                          {(selectedAgencyWithdrawal.payment_details as any).bank_name}
                        </span>
                      </div>
                    )}
                    
                    {/* Additional Info */}
                    {(selectedAgencyWithdrawal.payment_details as any)?.additional_info && (
                      <div className="bg-amber-50/70 rounded-lg p-2">
                        <span className="text-slate-700 text-xs block mb-1">Additional Info:</span>
 <span className="text-slate-900 text-sm">
                          {(selectedAgencyWithdrawal.payment_details as any).additional_info}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Agency's Payment Screenshot (if they uploaded one) */}
              {(selectedAgencyWithdrawal.payment_details as any)?.payment_screenshot_url && (
                <div className="bg-slate-50 rounded-xl p-4">
 <p className="text-slate-900 font-semibold mb-3 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-sky-700" />
                    📸 Agency Payment Screenshot
                  </p>
                  <div className="rounded-xl overflow-hidden border-2 border-sky-200/30">
                    <img 
                      src={(selectedAgencyWithdrawal.payment_details as any).payment_screenshot_url} 
                      alt="Agency payment proof" 
                      className="w-full object-cover cursor-pointer"
                      onClick={() => imageViewer.openImage((selectedAgencyWithdrawal.payment_details as any).payment_screenshot_url)}
                    />
                  </div>
                  <p className="text-xs text-slate-500 text-center mt-2">Click to view full size</p>
                </div>
              )}

              {/* Request Time */}
              <div className="text-center text-sm text-slate-700">
                Requested: {format(new Date(selectedAgencyWithdrawal.requested_at), 'dd MMM yyyy, hh:mm a')}
              </div>

              {/* Action Section for Pending */}
              {selectedAgencyWithdrawal.status === 'pending' && (
                <>
                  {/* Upload Screenshot */}
                  <div>
                    <Label className="text-slate-500">Upload Payment Screenshot *</Label>
                    <div className="mt-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="agency-screenshot-upload"
                      />
                      <label
                        htmlFor="agency-screenshot-upload"
                        className={cn(
                          "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all",
                          screenshotFile 
                            ? "border-emerald-200 bg-green-500/10" 
                            : "border-slate-200 hover:border-sky-200 bg-slate-50"
                        )}
                      >
                        {screenshotFile ? (
                          <div className="text-center">
                            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                            <p className="text-emerald-600 text-sm">{screenshotFile.name}</p>
                            <p className="text-xs text-slate-500">Click to change</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <Camera className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                            <p className="text-slate-700 text-sm">Select Screenshot</p>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* Transaction ID (required) */}
                  <div>
                    <Label className="text-slate-500">Transaction ID *</Label>
                    <Input
                      value={helperTransactionId}
                      onChange={(e) => setHelperTransactionId(e.target.value)}
                      placeholder="e.g. TRX123456789"
                      maxLength={120}
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1 font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Required — paste the payment reference / TX ID (min 4 characters)</p>
                  </div>

                  {/* Notes (optional) */}
                  <div>
                    <Label className="text-slate-500">Notes (optional)</Label>
                    <Textarea
                      value={helperNotes}
                      onChange={(e) => setHelperNotes(e.target.value)}
                      placeholder="Any additional info for admin..."
                      maxLength={500}
 className="bg-slate-50 border-slate-200 text-slate-900 mt-1"
                      rows={2}
                    />
                  </div>

                  <Button 
                    onClick={handleProcessAgencyWithdrawal}
                    disabled={processing || !screenshotFile || helperTransactionId.trim().length < 4}
                    className="w-full bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600"
                  >
                    {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <Send className="w-4 h-4 mr-2" />
                    Submit Payment - Send for Approval
                  </Button>

                  <p className="text-xs text-slate-500 text-center">
                    * Agency will receive automatic notification after payment submission
                  </p>
                </>
              )}

              {/* Processing Status */}
              {selectedAgencyWithdrawal.status === 'processing' && (
                <div className="text-center p-4 bg-sky-50 rounded-xl border border-sky-200/30">
                  <Clock className="w-8 h-8 text-sky-700 mx-auto mb-2" />
                  <p className="text-blue-600 font-semibold">Waiting for Admin Approval</p>
                  <p className="text-xs text-sky-700 mt-1">Agency has been notified</p>
                </div>
              )}

              {/* Payment Screenshot if exists */}
              {selectedAgencyWithdrawal.helper_payment_screenshot && (
                <div>
                  <Label className="text-slate-500">Payment Screenshot</Label>
                  <div className="mt-2 rounded-xl overflow-hidden border border-slate-200">
                    <img 
                      src={selectedAgencyWithdrawal.helper_payment_screenshot} 
                      alt="Payment proof" 
                      className="w-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>

      {/* In-app Image Viewer */}
      <ImageViewer
        src={imageViewer.viewerImage}
        open={imageViewer.isOpen}
        onClose={imageViewer.closeImage}
        alt="Payment Screenshot"
      />
    </div>
  );
};

export default Level5HelperDashboard;

