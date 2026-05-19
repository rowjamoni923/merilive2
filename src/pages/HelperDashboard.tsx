import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Wallet, Star, Crown, TrendingUp, Shield, Gem, Banknote, CheckCircle,
  Upload, DollarSign, Clock, Send, FileText, Search, User, Building2, ArrowRight, History, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useRealtimeHelperLevelProgress } from "@/hooks/useRealtimeHelperLevel";
import { HelperAcceptedMethodsCard } from "@/components/helper/HelperAcceptedMethodsCard";
import SwiftPayDepositModal from "@/components/recharge/SwiftPayDepositModal";
import { recordClientError } from "@/utils/clientErrorLog";

interface TraderLevel {
  level_number: number;
  level_name: string;
  upgrade_cost_usd: number;
  min_withdrawal_amount: number;
  max_withdrawal_amount: number;
  commission_rate: number;
  badge_color: string;
  description: string;
}

interface UpgradeRequest {
  id: string;
  requested_level: number;
  amount_usd: number;
  payment_method: string;
  payment_proof_url: string | null;
  status: 'pending' | 'processing' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at?: string;
}

interface PaymentMethod {
  id: string;
  method_name: string;
  method_type: string;
  account_name: string;
  account_number: string;
  bank_name: string | null;
  instructions: string | null;
  min_amount: number;
  max_amount: number;
  logo_url: string | null;
  country_codes: string[] | null;
}

// Normalize topup_payment_methods row → legacy PaymentMethod shape used by the UI
const normalizePaymentMethod = (row: any): PaymentMethod => ({
  id: row.id,
  method_name: row.name ?? row.method_name ?? '',
  method_type: row.method_type ?? '',
  account_name: row.account_name ?? '',
  account_number: row.payment_number ?? row.account_number ?? '',
  bank_name: row.bank_name ?? null,
  instructions: row.payment_instructions ?? row.instructions ?? null,
  min_amount: row.min_amount ?? 0,
  max_amount: row.max_amount ?? 0,
  logo_url: row.logo_url ?? row.icon_url ?? null,
  country_codes: Array.isArray(row.country_codes) ? row.country_codes : null,
});

const getHelperPackageLevel = (pkg: { display_order?: number | null; description?: string | null }, index: number) => {
  const descriptionMatch = pkg.description?.match(/level\s*(\d+)/i);
  return pkg.display_order || (descriptionMatch ? Number(descriptionMatch[1]) : index + 1);
};

// Strict country filter — empty/null country_codes = global (e.g. crypto/USDT).
const filterMethodsByCountry = (methods: PaymentMethod[], countryCode: string | null | undefined): PaymentMethod[] => {
  const cc = (countryCode || '').toUpperCase().trim();
  if (!cc) return methods.filter((m) => !m.country_codes || m.country_codes.length === 0);
  return methods.filter((m) => {
    if (!m.country_codes || m.country_codes.length === 0) return true; // global
    return m.country_codes.map((c) => String(c).toUpperCase()).includes(cc);
  });
};

const HelperDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [helperData, setHelperData] = useState<any>(null);
  const [helperId, setHelperId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [userFaceVerified, setUserFaceVerified] = useState(false);
  const [agencyDiamondBalance, setAgencyDiamondBalance] = useState(0);
  const [showCryptoTopupModal, setShowCryptoTopupModal] = useState(false);
  
  // Real-time level progress hook
  const { 
    progress: levelProgress, 
    currentCost, 
    nextLevelCost,
    helperData: realtimeHelperData 
  } = useRealtimeHelperLevelProgress(helperId);
  
  // Trader levels
  const [traderLevels, setTraderLevels] = useState<TraderLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState<TraderLevel | null>(null);
  const [nextLevel, setNextLevel] = useState<TraderLevel | null>(null);
  
  // Upgrade modal state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUpgradeLevel, setSelectedUpgradeLevel] = useState<TraderLevel | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [showUpgradeCryptoModal, setShowUpgradeCryptoModal] = useState(false);
  const [upgradeDiamondsPerUsd, setUpgradeDiamondsPerUsd] = useState<number>(7000);
  
  // Payroll application modal state
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [payrollProcessing, setPayrollProcessing] = useState(false);
  
  // Manual top-up state
  const [showTopupForm, setShowTopupForm] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupPaymentMethod, setTopupPaymentMethod] = useState<string>("");
  const [topupProof, setTopupProof] = useState<File | null>(null);
  const [topupTransactionId, setTopupTransactionId] = useState("");
  const [topupNote, setTopupNote] = useState("");
  
  // Diamond packages state
  const [selectedDiamondPackage, setSelectedDiamondPackage] = useState<number | null>(null);
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [showDiamondPackages, setShowDiamondPackages] = useState(false);
  const [customDiamondAmount, setCustomDiamondAmount] = useState("");
  
  // Payment methods from database
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  
  // Pending requests
  const [pendingRequests, setPendingRequests] = useState<UpgradeRequest[]>([]);
  
  // Level-based diamond pricing from database
  const [levelPricing, setLevelPricing] = useState<{
    diamond_amount: number;
    price_usd: number;
  } | null>(null);

  // Transfer to User/Agency state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTab, setTransferTab] = useState<"user" | "agency" | "self">("user");
  const [transferSearchQuery, setTransferSearchQuery] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferSearching, setTransferSearching] = useState(false);
  const [transferProcessing, setTransferProcessing] = useState(false);
  const [searchedUser, setSearchedUser] = useState<{
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
  } | null>(null);
  const [searchedAgency, setSearchedAgency] = useState<{
    id: string;
    name: string | null;
    agency_code: string | null;
    wallet_balance: number | null;
    owner_id: string | null;
    owner_name?: string | null;
  } | null>(null);

  // Transfer history state
  const [transferHistory, setTransferHistory] = useState<Array<{
    id: string;
    amount: number;
    sender_type: string;
    note: string;
    created_at: string;
    receiver?: {
      display_name: string;
      avatar_url: string;
      app_uid?: string;
    };
    agency?: {
      name: string;
      agency_code: string;
    };
  }>>([]);
  const [showTransferHistory, setShowTransferHistory] = useState(false);
  
  // WhatsApp number state
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('coin_packages')
        .select('coins_amount, bonus_coins, price_usd')
        .eq('is_active', true);
      if (data && data.length) {
        const best = Math.max(
          ...data.map((p: any) => ((p.coins_amount ?? 0) + (p.bonus_coins ?? 0)) / Math.max(Number(p.price_usd) || 1, 0.01))
        );
        if (Number.isFinite(best) && best > 0) setUpgradeDiamondsPerUsd(Math.floor(best));
      }
    })();
  }, []);
  
  // Sync realtime helper data
  useEffect(() => {
    if (realtimeHelperData) {
      setHelperData((prev: any) => ({ ...prev, ...realtimeHelperData }));
    }
  }, [realtimeHelperData]);

  // Function to refetch trader levels
  const refetchTraderLevels = async () => {
    console.log('[HelperDashboard] Refetching trader levels...');
    const { data: levels, error } = await supabase
      .from('trader_level_tiers')
      .select('*')
      .eq('is_active', true)
      .order('level_number', { ascending: true });

    if (error) {
      console.error('[HelperDashboard] Error fetching trader levels:', error);
      recordClientError({ label: "HelperDashboard.refetchTraderLevels", message: error instanceof Error ? error.message : String(error) });
      return;
    }

    if (levels) {
      console.log('[HelperDashboard] Trader levels updated:', levels.map(l => ({
        level: l.level_number,
        cost: l.upgrade_cost_usd,
        commission: l.commission_rate,
        min: l.min_withdrawal_amount,
        max: l.max_withdrawal_amount
      })));
      setTraderLevels(levels);
      if (helperData) {
        const current = levels.find(l => l.level_number === (helperData.trader_level || 1));
        const next = levels.find(l => l.level_number === (helperData.trader_level || 1) + 1);
        setCurrentLevel(current || null);
        setNextLevel(next || null);
      }
    }
  };

  // Real-time subscription for instant updates
  useEffect(() => {
    if (!helperData?.id) return;

    const channel = supabase
      .channel(`helper-dashboard-${helperData.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topup_helpers',
          filter: `id=eq.${helperData.id}`
        },
        (payload) => {
          console.log('[HelperDashboard] Helper data updated:', payload.new);
          const newData = payload.new as any;
          if (newData && newData.is_active === false) {
            toast({ title: "Account Deactivated", description: "Your helper account has been deactivated by admin", variant: "destructive" });
            navigate('/profile');
            return;
          }
          setHelperData(newData);
          
          // Instantly update level when trader_level changes (e.g., after recharge/upgrade)
          if (newData?.trader_level) {
            setTraderLevels(prevLevels => {
              const current = prevLevels.find(l => l.level_number === newData.trader_level);
              const next = prevLevels.find(l => l.level_number === newData.trader_level + 1);
              setCurrentLevel(current || null);
              setNextLevel(next || null);
              return prevLevels;
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agencies',
          filter: `owner_id=eq.${helperData.user_id}`
        },
        (payload) => {
          const newAgency = payload.new as any;
          setAgencyDiamondBalance(Number(newAgency?.diamond_balance || 0));
        }
      )
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'helper_upgrade_requests',
          filter: `helper_id=eq.${helperData.id}`
        },
        (payload) => {
          console.log('[HelperDashboard] Upgrade request changed:', payload);
          fetchPendingRequests(helperData.id);
        }
      )
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'trader_level_tiers'
        },
        (payload) => {
          console.log('[HelperDashboard] Trader level tiers updated:', payload.eventType);
          refetchTraderLevels();
        }
      )
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'topup_payment_methods'
        },
        async (payload) => {
          console.log('[HelperDashboard] Payment methods updated:', payload.eventType);
          const { data: methods } = await supabase
            .from('topup_payment_methods' as any)
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });
          
          if (methods) {
            const normalized = (methods as any[]).map(normalizePaymentMethod);
            const cc = (helperData as any)?.country_code || null;
            const filtered = filterMethodsByCountry(normalized, cc);
            setPaymentMethods(filtered);
            console.log('[HelperDashboard] Payment methods refreshed:', filtered.length, 'country:', cc);
          }
        }
      )
      .subscribe((status) => {
        console.log('[HelperDashboard] Realtime subscription:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [helperData?.id, helperData?.country_code]);

  // Separate fetch function that accepts helper_id directly - fetch ALL requests including approved
  const fetchPendingRequests = async (helperId: string) => {
    const { data } = await supabase
      .from('helper_upgrade_requests' as any)
      .select('*')
      .eq('helper_id', helperId)
      .order('created_at', { ascending: false });
    
    console.log('[HelperDashboard] Fetched upgrade requests:', data);
    setPendingRequests((data as unknown as UpgradeRequest[]) || []);
  };

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }

      // Check user's face verification status
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_face_verified')
        .eq('id', user.id)
        .single();
      
      setUserFaceVerified(profile?.is_face_verified || false);

      // Get helper data
      const { data: helper } = await supabase
        .from('topup_helpers')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!helper || !helper.is_verified || !helper.is_active) {
        toast({ title: "Access Denied", description: helper && !helper.is_active ? "Your helper account has been deactivated by admin" : "You are not a verified diamond trader", variant: "destructive" });
        navigate('/profile');
        return;
      }

      setHelperData(helper);
      setHelperId(helper.id);
      // Load WhatsApp number from contact_info
      const ci = helper.contact_info as any;
      setWhatsappNumber(ci?.whatsapp || ci?.whatsapp_number || helper.order_notification_phone || '');
      const { data: levels } = await supabase
        .from('trader_level_tiers')
        .select('*')
        .eq('is_active', true)
        .order('level_number', { ascending: true });

      if (levels) {
        setTraderLevels(levels);
        const current = levels.find(l => l.level_number === (helper.trader_level || 1));
        const next = levels.find(l => l.level_number === (helper.trader_level || 1) + 1);
        setCurrentLevel(current || null);
        setNextLevel(next || null);
      }

      // Load payment methods from database
      console.log('[HelperDashboard] Loading payment methods...');
      const { data: methods, error: methodsError } = await supabase
        .from('topup_payment_methods' as any)
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      if (methodsError) {
        console.error('[HelperDashboard] Error loading payment methods:', methodsError);
        recordClientError({ label: "HelperDashboard.next", message: methodsError instanceof Error ? methodsError.message : String(methodsError) });
      }
      
      if (methods) {
        const normalized = (methods as any[]).map(normalizePaymentMethod);
        const cc = (helper as any)?.country_code || null;
        const filtered = filterMethodsByCountry(normalized, cc);
        console.log('[HelperDashboard] Payment methods loaded:', filtered.length, 'country:', cc, filtered.map((m) => m.method_name));
        setPaymentMethods(filtered);
        if (filtered.length > 0) {
          setTopupPaymentMethod(filtered[0].method_name);
          setSelectedPaymentMethod(filtered[0]);
        }
      } else {
        console.log('[HelperDashboard] No payment methods found');
      }

      // Load level-based diamond pricing for this helper's level
      const { data: pricingRows } = await supabase
        .from('helper_diamond_packages')
        .select('diamond_amount, price_usd, display_order, description')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      const pricing = (pricingRows || []).find((pkg, index) => getHelperPackageLevel(pkg, index) === (helper.trader_level || 1)) || pricingRows?.[0];

      if (pricing) {
        setLevelPricing(pricing);
        console.log('[HelperDashboard] Level pricing loaded:', pricing);
      }

      // Load ALL upgrade requests (including approved) using helper.id directly
      const { data: requestsData } = await supabase
        .from('helper_upgrade_requests' as any)
        .select('*')
        .eq('helper_id', helper.id)
        .order('created_at', { ascending: false });
      
      console.log('[HelperDashboard] Initial upgrade requests:', requestsData);
      setPendingRequests((requestsData as unknown as UpgradeRequest[]) || []);

      // Load agency diamond balance for combined trader wallet
      const { data: agencyData } = await supabase
        .from('agencies')
        .select('diamond_balance')
        .eq('owner_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      setAgencyDiamondBalance(agencyData?.diamond_balance || 0);

      // Load transfer history
      await loadTransferHistory(user.id);

    } catch (error) {
      console.error(error);
      recordClientError({ label: "HelperDashboard.pricing", message: error });
    } finally {
      setLoading(false);
    }
  };

  // Load transfer history
  const loadTransferHistory = async (userId: string) => {
    try {
      const { data: transfers } = await supabase
        .from('coin_transfers')
        .select('*')
        .eq('sender_id', userId)
        .in('sender_type', ['trader_to_user', 'trader_to_agency'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (transfers && transfers.length > 0) {
        // Get unique receiver IDs for users
        const userReceiverIds = transfers
          .filter(t => t.sender_type === 'trader_to_user')
          .map(t => t.receiver_id);
        
        // Get unique receiver IDs for agencies
        const agencyReceiverIds = transfers
          .filter(t => t.sender_type === 'trader_to_agency')
          .map(t => t.receiver_id);

        // Fetch user details
        let usersMap: Record<string, any> = {};
        if (userReceiverIds.length > 0) {
          const { data: users } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, app_uid')
            .in('id', userReceiverIds);
          
          users?.forEach(u => { usersMap[u.id] = u; });
        }

        // Fetch agency details
        let agenciesMap: Record<string, any> = {};
        if (agencyReceiverIds.length > 0) {
          const { data: agencies } = await supabase
            .from('agencies')
            .select('id, name, agency_code')
            .in('id', agencyReceiverIds);
          
          agencies?.forEach(a => { agenciesMap[a.id] = a; });
        }

        // Enrich transfers
        const enrichedTransfers = transfers.map(t => ({
          ...t,
          receiver: t.sender_type === 'trader_to_user' ? usersMap[t.receiver_id] : undefined,
          agency: t.sender_type === 'trader_to_agency' ? agenciesMap[t.receiver_id] : undefined
        }));

        setTransferHistory(enrichedTransfers);
      }
    } catch (error) {
      console.error('Error loading transfer history:', error);
      recordClientError({ label: "HelperDashboard.enrichedTransfers", message: error instanceof Error ? error.message : String(error) });
    }
  };

  // Legacy function - kept for compatibility but uses helperData state
  const loadPendingRequests = async () => {
    if (!helperData?.id) return;
    await fetchPendingRequests(helperData.id);
  };

  // Save WhatsApp number to contact_info
  const saveWhatsappNumber = async () => {
    if (!helperData?.id) return;
    setSavingWhatsapp(true);
    try {
      const existingContactInfo = (helperData.contact_info as any) || {};
      const updatedContactInfo = { ...existingContactInfo, whatsapp: whatsappNumber.trim() };
      const { error } = await supabase
        .from('topup_helpers')
        .update({ contact_info: updatedContactInfo })
        .eq('id', helperData.id);
      if (error) throw error;
      setHelperData((prev: any) => ({ ...prev, contact_info: updatedContactInfo }));
      toast({ title: "✅ WhatsApp Number Saved", description: "Your WhatsApp number is now visible to users in the Recharge section." });
    } catch (err) {
      console.error('Error saving WhatsApp:', err);
      recordClientError({ label: "HelperDashboard.updatedContactInfo", message: err instanceof Error ? err.message : String(err) });
      toast({ title: "Error", description: "Failed to save WhatsApp number", variant: "destructive" });
    } finally {
      setSavingWhatsapp(false);
    }
  };

  const uploadPaymentProof = async (file: File, type: 'upgrade' | 'topup'): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${helperData.id}/${type}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(fileName);

      return data.publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      recordClientError({ label: "HelperDashboard.fileName", message: error instanceof Error ? error.message : String(error) });
      return null;
    }
  };

  const handleApplyUpgrade = async () => {
    if (!selectedUpgradeLevel) return;
    
    setProcessing(true);
    try {
      let proofUrl = null;
      if (paymentProof) {
        setUploadingProof(true);
        proofUrl = await uploadPaymentProof(paymentProof, 'upgrade');
        setUploadingProof(false);
      }

      const { error } = await supabase
        .from('helper_upgrade_requests' as any)
        .insert({
          helper_id: helperData.id,
          user_id: helperData.user_id,
          requested_level: selectedUpgradeLevel.level_number,
          amount_usd: selectedUpgradeLevel.upgrade_cost_usd,
          payment_method: paymentMethod,
          payment_proof_url: proofUrl,
          transaction_id: transactionId || null,
          notes: paymentNote || null,
          status: 'pending'
        });

      if (error) throw error;

      toast({ 
        title: "Application Submitted! ✅", 
        description: `Your upgrade request for Level ${selectedUpgradeLevel.level_number} is being reviewed` 
      });
      
      // Reset form
      setShowUpgradeModal(false);
      setSelectedUpgradeLevel(null);
      setPaymentProof(null);
      setTransactionId("");
      setPaymentNote("");
      loadPendingRequests();
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  // Diamond packages (5 lakh to 50 lakh)
  const diamondPackages = [
    { diamonds: 500000, label: "5 Lakh", color: "from-emerald-500 to-teal-500" },
    { diamonds: 1000000, label: "10 Lakh", color: "from-cyan-500 to-blue-500" },
    { diamonds: 1500000, label: "15 Lakh", color: "from-blue-500 to-indigo-500" },
    { diamonds: 2000000, label: "20 Lakh", color: "from-indigo-500 to-purple-500" },
    { diamonds: 2500000, label: "25 Lakh", color: "from-purple-500 to-pink-500" },
    { diamonds: 3000000, label: "30 Lakh", color: "from-pink-500 to-rose-500" },
    { diamonds: 3500000, label: "35 Lakh", color: "from-rose-500 to-red-500" },
    { diamonds: 4000000, label: "40 Lakh", color: "from-orange-500 to-orange-500" },
    { diamonds: 4500000, label: "45 Lakh", color: "from-yellow-500 to-amber-500" },
    { diamonds: 5000000, label: "50 Lakh", color: "from-emerald-400 to-cyan-400" },
  ];

  // Calculate USD from diamonds using level-based pricing
  // Example: Level 1 = 80,000 💎 for $17, so 5 Lakh = (500000 / 80000) * 17 = $106.25
  const calculateUSD = (diamonds: number): number => {
    if (levelPricing && levelPricing.diamond_amount > 0) {
      // Calculate proportionally based on level pricing
      // If 80,000 diamonds = $17, then X diamonds = (X / 80000) * 17
      return (diamonds / levelPricing.diamond_amount) * levelPricing.price_usd;
    }
    // Fallback: 100 diamonds = $1
    return diamonds / 100;
  };

  // Format number in lakh
  const formatDiamonds = (num: number): string => {
    if (num >= 100000) {
      return (num / 100000).toFixed(1).replace('.0', '') + ' Lakh';
    }
    return num.toLocaleString();
  };

  // Handle diamond package selection
  const handleSelectPackage = (diamonds: number) => {
    setSelectedDiamondPackage(diamonds);
    setShowCustomAmount(false);
    setCustomDiamondAmount("");
    setTopupAmount(calculateUSD(diamonds).toFixed(2));
  };

  // Handle custom amount selection
  const handleCustomAmountChange = (value: string) => {
    const numValue = parseInt(value.replace(/,/g, '')) || 0;
    setCustomDiamondAmount(value);
    if (numValue >= 500000) {
      setSelectedDiamondPackage(null);
      setTopupAmount(calculateUSD(numValue).toFixed(2));
    }
  };

  // Validation function for mandatory payment info
  const validatePaymentInfo = (): { valid: boolean; message: string } => {
    const diamonds = selectedDiamondPackage || parseInt(customDiamondAmount.replace(/,/g, '')) || 0;
    if (diamonds < 500000) {
      return { valid: false, message: "Minimum purchase is 5 Lakh diamonds" };
    }
    if (!selectedPaymentMethod) {
      return { valid: false, message: "Please select a payment method" };
    }
    if (!topupTransactionId.trim()) {
      return { valid: false, message: "Transaction ID is required" };
    }
    if (!topupProof) {
      return { valid: false, message: "Payment screenshot is required" };
    }
    return { valid: true, message: "" };
  };

  const handleManualTopup = async () => {
    const validation = validatePaymentInfo();
    if (!validation.valid) {
      toast({ title: "Missing Information", description: validation.message, variant: "destructive" });
      return;
    }
    
    setProcessing(true);
    try {
      let proofUrl = null;
      if (topupProof) {
        proofUrl = await uploadPaymentProof(topupProof, 'topup');
      }

      if (!proofUrl) {
        toast({ title: "Upload Failed", description: "Failed to upload payment proof. Please try again.", variant: "destructive" });
        setProcessing(false);
        return;
      }

      const diamonds = selectedDiamondPackage || parseInt(customDiamondAmount.replace(/,/g, '')) || 0;
      const usdAmount = calculateUSD(diamonds);

      const { error } = await supabase
        .from('helper_topup_requests' as any)
        .insert({
          helper_id: helperData.id,
          user_id: helperData.user_id,
          amount_usd: usdAmount,
          coin_amount: diamonds,
          payment_method: topupPaymentMethod,
          payment_proof_url: proofUrl,
          transaction_id: topupTransactionId.trim(),
          notes: topupNote || null,
          status: 'pending'
        });

      if (error) throw error;

      toast({ 
        title: "Top-up Request Submitted! ✅",
        description: `Your request for ${formatDiamonds(diamonds)} 💎 ($${usdAmount.toLocaleString()}) is being processed` 
      });
      
      // Reset form
      setShowTopupForm(false);
      setTopupAmount("");
      setTopupProof(null);
      setTopupTransactionId("");
      setTopupNote("");
      setSelectedDiamondPackage(null);
      setShowCustomAmount(false);
      setCustomDiamondAmount("");
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  // Search user by App UID
  const handleSearchUser = async () => {
    if (!transferSearchQuery.trim()) return;
    
    setTransferSearching(true);
    setSearchedUser(null);
    
    try {
      const { data, error } = await supabase.rpc('search_user_by_app_uid', {
        _app_uid: transferSearchQuery.trim().toUpperCase()
      });

      if (error) throw error;
      
      const foundUser = Array.isArray(data) ? data[0] : null;

      if (foundUser) {
        setSearchedUser(foundUser);
      } else {
        toast({ title: "Not Found", description: "No user found with this App UID", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setTransferSearching(false);
    }
  };

  // Search agency by owner's App UID, with agency-code fallback
  const handleSearchAgency = async () => {
    if (!transferSearchQuery.trim()) return;
    
    setTransferSearching(true);
    setSearchedAgency(null);
    
    try {
      const normalizedQuery = transferSearchQuery.trim().toUpperCase();
      const { data: ownerRows, error: ownerSearchError } = await supabase.rpc('search_user_by_app_uid', {
        _app_uid: normalizedQuery
      });
      if (ownerSearchError) throw ownerSearchError;

      const ownerByUid = Array.isArray(ownerRows) ? ownerRows[0] : null;
      const agencyQuery = supabase
        .from('agencies_public')
        .select('id, name, agency_code, diamond_balance, owner_id')
        .eq(ownerByUid ? 'owner_id' : 'agency_code', ownerByUid?.id || normalizedQuery)
        .limit(1)
        .maybeSingle();

      const { data, error } = await agencyQuery;

      if (error) throw error;
      
      if (data) {
        // Get owner name
        const owner = ownerByUid || (data.owner_id ? await supabase
          .from('profiles_public')
          .select('display_name')
          .eq('id', data.owner_id)
          .maybeSingle()
          .then(({ data }) => data) : null);
        
        setSearchedAgency({
          id: data.id,
          name: data.name,
          agency_code: data.agency_code,
          wallet_balance: data.diamond_balance || 0,
          owner_id: data.owner_id,
          owner_name: owner?.display_name || 'Unknown'
        });
      } else {
        toast({ title: "Not Found", description: "No agency found with this owner UID", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setTransferSearching(false);
    }
  };

  // Transfer diamonds to user - uses tiered deduction (agency → wallet → profile)
  const handleTransferToUser = async () => {
    if (!searchedUser || !helperData) return;
    
    // Check face verification requirement
    if (!userFaceVerified) {
      toast({ 
        title: "Face Verification Required!", 
        description: "You must complete face verification to transfer beans.", 
        variant: "destructive" 
      });
      navigate('/face-verification');
      return;
    }
    
    const amount = parseInt(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid diamond amount", variant: "destructive" });
      return;
    }
    
    setTransferProcessing(true);
    try {
      // Use tiered deduction RPC: agency → helper wallet → profile coins
      // CRITICAL: Use 'agency_to_user' so RPC tries agency balance first, then helper wallet, then personal coins
      const { data: result, error } = await supabase
        .rpc('helper_transfer_coins_to_user', {
          _sender_id: helperData.user_id,
          _receiver_id: searchedUser.id,
          _amount: amount,
          _sender_type: 'agency_to_user'
        });

      if (error) throw error;
      const resultData = result as any;
      if (resultData && resultData.success === false) {
        throw new Error(resultData.error || 'Transfer failed');
      }

      toast({ 
        title: "Transfer Successful! ✅", 
        description: `${amount.toLocaleString()} 💎 sent to ${searchedUser.display_name}` 
      });

      // Refresh helper data + agency balance
      const [{ data: refreshed }, { data: refreshedAgency }] = await Promise.all([
        supabase.from('topup_helpers').select('wallet_balance').eq('id', helperData.id).single(),
        supabase.from('agencies').select('diamond_balance').eq('owner_id', helperData.user_id).eq('is_active', true).maybeSingle(),
      ]);
      if (refreshed) {
        setHelperData((prev: any) => ({ ...prev, wallet_balance: refreshed.wallet_balance }));
      }
      setAgencyDiamondBalance(refreshedAgency?.diamond_balance || 0);
      
      // Reset
      setShowTransferModal(false);
      setTransferSearchQuery("");
      setTransferAmount("");
      setSearchedUser(null);
    } catch (error: any) {
      toast({ title: "Transfer Failed", description: error.message, variant: "destructive" });
    } finally {
      setTransferProcessing(false);
    }
  };

  // Transfer diamonds to agency - uses tiered deduction
  const handleTransferToAgency = async () => {
    if (!searchedAgency || !helperData) return;
    
    if (!userFaceVerified) {
      toast({ title: "Face Verification Required!", description: "You must complete face verification to transfer beans.", variant: "destructive" });
      navigate('/face-verification');
      return;
    }
    
    const amount = parseInt(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid diamond amount", variant: "destructive" });
      return;
    }
    
    setTransferProcessing(true);
    try {
      // Use atomic agency-to-agency transfer RPC (tiered deduction: agency → helper wallet → profile coins)
      const { data: result, error } = await supabase
        .rpc('helper_transfer_diamonds_to_agency', {
          _sender_id: helperData.user_id,
          _target_agency_id: searchedAgency.id,
          _amount: amount,
          _sender_type: 'agency_to_agency'
        });

      if (error) throw error;
      const resultData = result as any;
      if (resultData && resultData.success === false) {
        throw new Error(resultData.error || 'Transfer failed');
      }

      toast({ 
        title: "Transfer Successful! ✅", 
        description: `${amount.toLocaleString()} 💎 sent to ${searchedAgency.name}` 
      });

      // Refresh helper data + agency balance
      const [{ data: refreshed }, { data: refreshedAgency }] = await Promise.all([
        supabase.from('topup_helpers').select('wallet_balance').eq('id', helperData.id).single(),
        supabase.from('agencies').select('diamond_balance').eq('owner_id', helperData.user_id).eq('is_active', true).maybeSingle(),
      ]);
      if (refreshed) {
        setHelperData((prev: any) => ({ ...prev, wallet_balance: refreshed.wallet_balance }));
      }
      setAgencyDiamondBalance(refreshedAgency?.diamond_balance || 0);
      
      setShowTransferModal(false);
      setTransferSearchQuery("");
      setTransferAmount("");
      setSearchedAgency(null);
    } catch (error: any) {
      toast({ title: "Transfer Failed", description: error.message, variant: "destructive" });
    } finally {
      setTransferProcessing(false);
    }
  };

  // Self-recharge: transfer diamonds to own account
  const handleSelfRecharge = async () => {
    if (!helperData) return;
    
    const amount = parseInt(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid diamond amount", variant: "destructive" });
      return;
    }
    
    setTransferProcessing(true);
    try {
      // Use unified atomic self-recharge RPC (tiered: helper wallet → agency → rollback)
      const { data: result, error } = await supabase
        .rpc('helper_transfer_diamonds_to_self', {
          _user_id: helperData.user_id,
          _amount: amount,
        });

      if (error) throw error;
      const resultData = result as any;
      if (resultData && resultData.success === false) {
        throw new Error(resultData.error || 'Self recharge failed');
      }

      toast({ 
        title: "Self Recharge Successful! ✅", 
        description: `${amount.toLocaleString()} 💎 added to your account` 
      });

      // Update local state from RPC response
      if (resultData.new_wallet_balance !== undefined) {
        setHelperData((prev: any) => ({ ...prev, wallet_balance: resultData.new_wallet_balance }));
      }
      if (resultData.new_agency_balance !== undefined) {
        setAgencyDiamondBalance(resultData.new_agency_balance);
      }
      
      setShowTransferModal(false);
      setTransferAmount("");
    } catch (error: any) {
      toast({ title: "Self Recharge Failed", description: error.message, variant: "destructive" });
    } finally {
      setTransferProcessing(false);
    }
  };


  const getLevelBadge = (level: number) => {
    const badges = {
      1: { icon: Star, color: "from-amber-600 to-amber-700", label: "Bronze" },
      2: { icon: Star, color: "from-slate-400 to-slate-500", label: "Silver" },
      3: { icon: Crown, color: "from-yellow-400 to-yellow-500", label: "Gold" },
      4: { icon: Shield, color: "from-slate-300 to-slate-400", label: "Platinum" },
      5: { icon: Gem, color: "from-cyan-400 to-blue-500", label: "Diamond" }
    };
    return badges[level as keyof typeof badges] || badges[1];
  };

  const levelBadge = getLevelBadge(helperData?.trader_level || 1);
  const LevelIcon = levelBadge.icon;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA]">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 overflow-y-auto overscroll-contain"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, #FFFBF2 0%, #FAF5EA 45%, #F5EFDF 100%)",
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'var(--content-bottom-padding)',
      }}
    >
      {/* ============ LUXURIOUS HEADER ============ */}
      <div
        className="relative px-4 pt-4 pb-5 safe-area-top overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #FFFEF8 0%, #FFFBEC 60%, #FFF5D6 100%)",
          borderBottom: "1px solid rgba(251,191,36,0.45)",
          boxShadow: "0 12px 28px -18px rgba(146,64,14,0.25), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        {/* ambient blooms */}
        <div className="pointer-events-none absolute -top-24 -left-12 w-64 h-64 bg-amber-500/15 rounded-full blur-[70px]" />
        <div className="pointer-events-none absolute -top-24 -right-12 w-64 h-64 bg-fuchsia-600/12 rounded-full blur-[70px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.06] to-transparent" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(251,191,36,0.55), transparent)",
          }}
        />

        {/* Top bar */}
        <div className="relative flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-amber-900 hover:bg-amber-200/40 rounded-full" onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1
              className="font-black text-[18px] tracking-tight bg-clip-text text-transparent leading-none"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, #92400e 0%, #b45309 35%, #d97706 75%, #92400e 100%)",
                filter: "drop-shadow(0 1px 2px rgba(245,158,11,0.35))",
              }}
            >
              Trader Dashboard
            </h1>
            <p className="text-amber-800/80 text-[10px] tracking-[0.2em] uppercase mt-1">
              Level Upgrade · Manual Top-up
            </p>
          </div>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{
              background:
                "linear-gradient(180deg, #fde68a 0%, #f59e0b 50%, #92400e 100%)",
              boxShadow:
                "0 8px 20px -8px rgba(245,158,11,0.6), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(120,53,15,0.5)",
            }}
          >
            <LevelIcon className="w-4 h-4 text-amber-950" />
            <span className="text-amber-950 text-xs font-black tabular-nums">
              Lv.{helperData?.trader_level || 1}
            </span>
          </div>
        </div>

        {/* ============ PREMIUM WALLET CARD ============ */}
        <div
          className="relative cursor-pointer rounded-[22px] p-[1.5px] transition-transform active:scale-[0.99]"
          style={{
            background:
              "conic-gradient(from 140deg at 50% 50%, #fde68a 0deg, #b45309 70deg, #fbbf24 130deg, #92400e 200deg, #fde68a 260deg, #d97706 320deg, #fde68a 360deg)",
            boxShadow:
              "0 22px 48px -18px rgba(0,0,0,0.75), 0 0 60px rgba(245,158,11,0.18)",
          }}
          onClick={() => setShowTransferModal(true)}
        >
          <div
            className="relative rounded-[20px] p-4 overflow-hidden"
            style={{
              background:
                "radial-gradient(140% 100% at 0% 0%, #FFFEF8 0%, #FFFBEC 55%, #FFF5D6 100%)",
            }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/[0.10] to-transparent" />
            <div className="pointer-events-none absolute -bottom-12 -right-12 w-44 h-44 rounded-full bg-amber-500/15 blur-3xl" />

            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-amber-800/85 text-[10px] font-bold uppercase tracking-[0.22em]">
                  Trader Wallet
                </p>
                <p
                  className="mt-1 text-[28px] font-black leading-none tabular-nums bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(180deg, #b45309 0%, #d97706 50%, #92400e 100%)",
                    filter: "drop-shadow(0 2px 6px rgba(245,158,11,0.35))",
                  }}
                >
                  {(
                    (helperData?.wallet_balance || 0) +
                    (agencyDiamondBalance || 0)
                  ).toLocaleString()}{" "}
                  <span className="text-[20px]">💎</span>
                </p>
                {agencyDiamondBalance > 0 && (
                  <p className="text-slate-600 text-[10px] mt-1.5 leading-tight">
                    Helper{" "}
                    <span className="text-amber-700/80 font-semibold tabular-nums">
                      {(helperData?.wallet_balance || 0).toLocaleString()}
                    </span>{" "}
                    + Agency{" "}
                    <span className="text-amber-700/80 font-semibold tabular-nums">
                      {agencyDiamondBalance.toLocaleString()}
                    </span>
                  </p>
                )}
                <p className="text-emerald-700 text-[11px] mt-2 flex items-center gap-1.5 font-medium">
                  <Send className="w-3 h-3" />
                  Tap to transfer to User or Agency
                </p>
              </div>
              <div
                className="shrink-0 grid place-items-center w-14 h-14 rounded-2xl"
                style={{
                  background:
                    "linear-gradient(180deg, #fde68a 0%, #f59e0b 50%, #92400e 100%)",
                  boxShadow:
                    "0 10px 22px -8px rgba(245,158,11,0.6), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 0 rgba(120,53,15,0.55)",
                }}
              >
                <Wallet className="w-7 h-7 text-amber-950" />
              </div>
            </div>

            {nextLevel && (
              <div className="relative mt-4">
                <div className="flex justify-between text-[10px] mb-1.5 font-bold tracking-wider uppercase">
                  <span className="text-amber-700/85">
                    Lv.{helperData?.trader_level || 1}
                  </span>
                  <span className="text-amber-800/80">
                    Lv.{nextLevel.level_number}
                  </span>
                </div>
                <div
                  className="relative h-2.5 rounded-full overflow-hidden"
                  style={{
                    background: "rgba(146,64,14,0.10)",
                    boxShadow:
                      "inset 0 1px 2px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(251,191,36,0.12)",
                  }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out"
                    style={{
                      width: `${levelProgress}%`,
                      background:
                        "linear-gradient(90deg, #fde68a 0%, #f59e0b 50%, #b45309 100%)",
                      boxShadow:
                        "0 0 14px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.45)",
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse" />
                  </div>
                </div>
                <div className="flex justify-between items-center mt-1.5">
                  <p className="text-[10px] text-slate-500 tabular-nums font-medium">
                    ${currentCost.toFixed(0)} / ${nextLevelCost.toFixed(0)}
                  </p>
                  <Badge
                    className="text-[9px] border-0 font-black tabular-nums px-2 py-0.5"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(251,191,36,0.25), rgba(180,83,9,0.10))",
                      border: "1px solid rgba(251,191,36,0.35)",
                      color: "#92400e",
                    }}
                  >
                    {levelProgress.toFixed(0)}%
                  </Badge>
                </div>
              </div>
            )}

            {!nextLevel && helperData?.trader_level === 5 && (
              <div className="relative mt-4">
                <div
                  className="flex items-center justify-center gap-2 py-2 rounded-xl"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(251,191,36,0.18), rgba(180,83,9,0.08))",
                    border: "1px solid rgba(251,191,36,0.35)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
                  }}
                >
                  <Gem className="w-4 h-4 text-amber-700" />
                  <span className="text-amber-900 text-xs font-bold tracking-wide uppercase">
                    Maximum Level Achieved
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {transferHistory.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowTransferHistory(true);
            }}
            className="w-full mt-2.5 py-2 rounded-xl text-amber-700/80 text-[11px] font-semibold tracking-wide flex items-center justify-center gap-2 transition-all hover:text-amber-900"
            style={{
              background:
                "linear-gradient(180deg, rgba(251,191,36,0.18), rgba(251,191,36,0.06))",
              border: "1px solid rgba(251,191,36,0.18)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <History className="w-3.5 h-3.5" />
            View Transfer History ({transferHistory.length})
          </button>
        )}

        <div
          className="relative mt-3 rounded-2xl p-3.5 overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(16,185,129,0.10), rgba(6,78,59,0.04))",
            border: "1px solid rgba(16,185,129,0.28)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 22px -16px rgba(16,185,129,0.4)",
          }}
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <div
              className="grid place-items-center w-8 h-8 rounded-xl"
              style={{
                background:
                  "linear-gradient(180deg, #34d399 0%, #059669 100%)",
                boxShadow:
                  "0 6px 14px -6px rgba(16,185,129,0.6), inset 0 1px 0 rgba(255,255,255,0.4)",
              }}
            >
              <svg
                viewBox="0 0 24 24"
 className="w-4 h-4 text-slate-900"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-emerald-700 font-bold text-[13px] leading-none">
                WhatsApp Number
              </p>
              <p className="text-emerald-600 text-[10px] mt-1 tracking-wide">
                Visible to users in Recharge section
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="+880XXXXXXXXXX"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              className="flex-1 rounded-xl px-3 py-2 text-amber-50 text-sm placeholder:text-slate-600 focus:outline-none transition-colors"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(16,185,129,0.30)",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4)",
              }}
            />
            <button
              onClick={saveWhatsappNumber}
              disabled={savingWhatsapp || !whatsappNumber.trim()}
              className="px-4 py-2 rounded-xl text-emerald-950 text-xs font-black tracking-wider uppercase disabled:opacity-50 active:scale-95 transition-transform"
              style={{
                background:
                  "linear-gradient(180deg, #6ee7b7 0%, #10b981 50%, #047857 100%)",
                boxShadow:
                  "0 8px 18px -8px rgba(16,185,129,0.6), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(6,78,59,0.55)",
              }}
            >
              {savingWhatsapp ? "..." : "Save"}
            </button>
          </div>
        </div>

        {helperData?.trader_level === 5 && helperData?.payroll_enabled && (
          <div
            onClick={() => navigate("/level5-helper-dashboard")}
            className="relative mt-3 rounded-2xl p-3.5 cursor-pointer overflow-hidden active:scale-[0.99] transition-transform"
            style={{
              background:
                "linear-gradient(135deg, rgba(168,85,247,0.22), rgba(236,72,153,0.16))",
              border: "1px solid rgba(168,85,247,0.40)",
              boxShadow:
                "0 14px 30px -16px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.10)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="grid place-items-center w-10 h-10 rounded-xl shrink-0"
                style={{
                  background:
                    "linear-gradient(180deg, #c4b5fd 0%, #8b5cf6 50%, #6d28d9 100%)",
                  boxShadow:
                    "0 6px 14px -6px rgba(139,92,246,0.7), inset 0 1px 0 rgba(255,255,255,0.45)",
                }}
              >
                <Banknote className="w-5 h-5 text-purple-50" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-purple-50 font-bold text-sm leading-none">
                  💎 Level 5 Dashboard
                </p>
                <p className="text-purple-200/75 text-[11px] mt-1">
                  Access payroll & withdrawal processing
                </p>
              </div>
              <ArrowLeft className="w-4 h-4 text-purple-100/70 rotate-180 shrink-0" />
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="px-4 mt-4 space-y-4">
      {/* Payroll Helper Guide Card */}
        <div 
          onClick={() => navigate('/payroll-helper-guide')}
          className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl p-3 cursor-pointer hover:from-indigo-500/30 hover:to-purple-500/30 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
 <FileText className="w-5 h-5 text-slate-900" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-800 font-semibold text-sm">📖 Payroll Helper Guide</p>
              <p className="text-slate-500 text-[11px]">Learn roles, benefits & diamond trading</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600" />
          </div>
        </div>


        
        {/* Pending Upgrade Requests */}
        {pendingRequests.length > 0 && (
          <Card className="bg-gradient-to-r from-orange-500/20 to-orange-500/20 border-amber-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-800 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-700" />
                Pending Upgrade Requests
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-48 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              {pendingRequests.map((req) => (
                <div key={req.id} className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-slate-800 text-sm font-medium">Level {req.requested_level} Upgrade</p>
                    <p className="text-slate-600 text-xs">${req.amount_usd} • {req.payment_method}</p>
                  </div>
                  <Badge className="bg-amber-100 text-amber-700">{req.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Accepted Payment Methods (tick-mark for users to see logos in Recharge) */}
        {helperId && (helperData?.trader_level || 1) < 5 && (
          <HelperAcceptedMethodsCard
            helperId={helperId}
            helperCountryCode={helperData?.country_code || null}
          />
        )}

        {/* Manual Top-up Section */}
        <Card className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-emerald-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-800 text-base flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-700" />
              Manual Top-up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-slate-600 text-sm">
              Add diamonds to your wallet by sending payment
            </p>
            
            {/* Level-based pricing info */}
            {levelPricing && (
              <div className="p-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl border border-purple-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gem className="w-4 h-4 text-purple-700" />
                    <span className="text-slate-800 text-sm font-medium">Your Level {helperData?.trader_level || 1} Rate</span>
                  </div>
                  <Badge className="bg-purple-500/30 text-purple-700">
                    {levelPricing.diamond_amount.toLocaleString()} 💎 = ${levelPricing.price_usd}
                  </Badge>
                </div>
              </div>
            )}
            
            {!showTopupForm ? (
              <Button 
                onClick={() => setShowTopupForm(true)}
 className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white h-11"
              >
                <Send className="w-4 h-4 mr-2" />
                Request Manual Top-up
              </Button>
            ) : (
              <div className="space-y-4 bg-slate-50 rounded-xl p-4">
                {/* Level pricing reminder */}
                {levelPricing && (
                  <div className="text-center p-2 bg-slate-100 rounded-lg">
                    <p className="text-xs text-white/80">
                      Level {helperData?.trader_level || 1} Rate: <span className="text-emerald-700 font-semibold">{levelPricing.diamond_amount.toLocaleString()} 💎 = ${levelPricing.price_usd}</span>
                    </p>
                  </div>
                )}
                
                {/* Diamond Packages Dropdown - Country Selector Style */}
                <div className="relative">
                  <button
                    onClick={() => setShowDiamondPackages(!showDiamondPackages)}
                    className={cn(
                      "w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between",
                      showDiamondPackages
                        ? "bg-slate-200 border-cyan-500 ring-2 ring-cyan-500/20"
                        : selectedDiamondPackage
                        ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500/50"
                        : "bg-slate-100 border-slate-300 hover:border-cyan-500/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
 <Gem className="w-5 h-5 text-slate-900" />
                      </div>
                      {selectedDiamondPackage ? (
                        <div className="text-left">
                          <span className="text-slate-800 font-bold text-base">
                            {formatDiamonds(selectedDiamondPackage)} 💎
                          </span>
                          <p className="text-emerald-700 text-sm font-medium">
                            ${calculateUSD(selectedDiamondPackage).toFixed(2)} USD
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-500 font-medium">Select Diamond Package 💎</span>
                      )}
                    </div>
                    <div className={cn(
                      "w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center transition-transform duration-200",
                      showDiamondPackages && "rotate-180"
                    )}>
 <ArrowLeft className="w-4 h-4 text-slate-900 -rotate-90" />
                    </div>
                  </button>
                  
                  {/* Dropdown List */}
                  {showDiamondPackages && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-slate-100 border-2 border-cyan-500/50 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                      <div className="max-h-80 overflow-y-auto">
                        {diamondPackages.map((pkg, index) => (
                          <button
                            key={pkg.diamonds}
                            onClick={() => {
                              handleSelectPackage(pkg.diamonds);
                              setShowDiamondPackages(false);
                            }}
                            className={cn(
                              "w-full p-3 flex items-center gap-3 transition-all border-b border-slate-200 last:border-b-0",
                              selectedDiamondPackage === pkg.diamonds
                                ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30"
                                : "hover:bg-slate-100"
                            )}
                          >
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center text-xl",
                              `bg-gradient-to-r ${pkg.color}`
                            )}>
                              💎
                            </div>
                            <div className="flex-1 text-left">
                              <span className="text-slate-800 font-bold text-sm">{pkg.label}</span>
                              <p className="text-slate-600 text-xs">
                                {pkg.diamonds.toLocaleString()} diamonds
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-emerald-700 font-bold text-sm">
                                ${calculateUSD(pkg.diamonds).toFixed(2)}
                              </span>
                              {selectedDiamondPackage === pkg.diamonds && (
                                <div className="mt-1 flex justify-end">
                                  <CheckCircle className="w-4 h-4 text-cyan-700" />
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Custom Amount Option */}
                <div className="border-t border-slate-200 pt-4">
                  <button
                    onClick={() => {
                      setShowCustomAmount(!showCustomAmount);
                      setSelectedDiamondPackage(null);
                    }}
                    className={cn(
                      "w-full p-3 rounded-xl border-2 border-dashed transition-all",
                      showCustomAmount
                        ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500"
                        : "bg-slate-100 border-slate-300 hover:border-purple-500/50"
                    )}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Crown className="w-5 h-5 text-purple-700" />
                      <span className="text-slate-800 font-semibold">Custom Amount</span>
                      <span className="text-slate-600 text-xs">(50 Lakh+)</span>
                    </div>
                  </button>
                  
                  {showCustomAmount && (
                    <div className="mt-3 space-y-2">
                      <Input
                        type="text"
                        placeholder="Enter diamonds (min: 5,00,000)"
                        value={customDiamondAmount}
                        onChange={(e) => handleCustomAmountChange(e.target.value)}
                        className="bg-white border-purple-300 text-slate-800 text-center text-lg font-bold"
                      />
                      {parseInt(customDiamondAmount.replace(/,/g, '')) >= 500000 && (
                        <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/30">
                          <p className="text-purple-700 text-sm text-center">
                            💎 {formatDiamonds(parseInt(customDiamondAmount.replace(/,/g, '')))} = ${calculateUSD(parseInt(customDiamondAmount.replace(/,/g, ''))).toFixed(2)}
                          </p>
                        </div>
                      )}
                      {customDiamondAmount && parseInt(customDiamondAmount.replace(/,/g, '')) < 500000 && (
                        <p className="text-red-700 text-xs text-center">
                          ⚠️ Minimum 5 Lakh (500,000) diamonds required
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Amount Summary */}
                {(selectedDiamondPackage || (customDiamondAmount && parseInt(customDiamondAmount.replace(/,/g, '')) >= 500000)) && (
                  <div className="p-3 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl border border-emerald-500/30">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 text-sm">You will receive:</span>
                      <div className="text-right">
                        <p className="text-slate-800 font-bold text-lg">
                          {formatDiamonds(selectedDiamondPackage || parseInt(customDiamondAmount.replace(/,/g, '')))} 💎
                        </p>
                        <p className="text-emerald-700 text-xs">
                          ${calculateUSD(selectedDiamondPackage || parseInt(customDiamondAmount.replace(/,/g, ''))).toFixed(2)} USD
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Auto Crypto Gateway (replaces Binance/ePay manual flow) */}
                <div className="rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-yellow-50 p-3">
                  <p className="text-amber-800 text-xs font-semibold mb-1">⚡ Instant Auto Top-Up</p>
                  <p className="text-slate-600 text-[11px] mb-2">
                    Pay with USDT / BTC / BNB / ETH — diamonds credit to your Trader Wallet automatically on blockchain confirmation. No proof upload, no admin wait.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowTopupForm(false)}
                    className="flex-1 border-slate-300 text-slate-500"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      const coins = selectedDiamondPackage || parseInt((customDiamondAmount || '').replace(/,/g, '')) || 0;
                      if (!coins || coins < 500000) {
                        toast({ title: "Select amount", description: "Choose a package or enter a custom amount (min 5,00,000)", variant: "destructive" });
                        return;
                      }
                      if (!helperId) {
                        toast({ title: "Helper not loaded", description: "Please refresh the page", variant: "destructive" });
                        return;
                      }
                      setShowCryptoTopupModal(true);
                    }}
                    disabled={!(selectedDiamondPackage || (customDiamondAmount && parseInt(customDiamondAmount.replace(/,/g, '')) >= 500000))}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-900 font-bold"
                  >
                    ⚡ Pay with Crypto
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Crypto Auto Top-Up Modal (helper trader wallet mode) */}
        {helperId && (
          <SwiftPayDepositModal
            open={showCryptoTopupModal}
            onOpenChange={setShowCryptoTopupModal}
            packages={[]}
            mode="helper"
            helperId={helperId}
            helperCustomCoins={selectedDiamondPackage || parseInt((customDiamondAmount || '').replace(/,/g, '')) || 0}
            helperCustomPriceUsd={Number(calculateUSD(selectedDiamondPackage || parseInt((customDiamondAmount || '').replace(/,/g, '')) || 0).toFixed(2))}
            onCredited={(coins) => {
              setHelperData((prev: any) => prev ? { ...prev, wallet_balance: (Number(prev.wallet_balance) || 0) + coins } : prev);
              setShowTopupForm(false);
              setSelectedDiamondPackage(null);
              setCustomDiamondAmount('');
            }}
          />
        )}

        {/* Trader Levels */}
        <Card className="bg-white border-amber-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-800 text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-700" />
              Trader Levels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {traderLevels.map((level) => {
              const badge = getLevelBadge(level.level_number);
              const Icon = badge.icon;
              const isCurrent = level.level_number === (helperData?.trader_level || 1);
              const isUnlocked = level.level_number <= (helperData?.trader_level || 1);
              const canUpgrade = level.level_number === (helperData?.trader_level || 1) + 1;
              
              // Get the request for this specific level
              const levelRequest = pendingRequests.find(r => r.requested_level === level.level_number);
              const hasPendingRequest = levelRequest && (levelRequest.status === 'pending' || levelRequest.status === 'processing');
              const hasApprovedRequest = levelRequest && levelRequest.status === 'approved';
              
              return (
                <div
                  key={level.level_number}
                  className={cn(
                    "p-4 rounded-xl border transition-all",
                    isCurrent 
                      ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/50" 
                      : isUnlocked
                        ? "bg-slate-100 border-slate-300"
                        : "bg-white border-amber-200/60 shadow-sm opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-r",
                        badge.color
                      )}>
 <Icon className="w-6 h-6 text-slate-900" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-800 font-bold">{level.level_name}</p>
                          {isCurrent && (
 <Badge className="bg-green-500 text-slate-900 text-[10px]">Current</Badge>
                          )}
                        </div>
                        <p className="text-slate-600 text-xs">{level.description}</p>
                        {level.level_number === 5 && (
                          <p className="text-purple-700 text-xs mt-1 flex items-center gap-1">
                            <Banknote className="w-3 h-3" />
                            Payroll System Access
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {level.upgrade_cost_usd > 0 ? (
                        <>
                          <p className="text-slate-800 font-bold">${level.upgrade_cost_usd}</p>
                          <p className="text-slate-600 text-xs">Upgrade Cost</p>
                        </>
                      ) : (
                        <Badge className="bg-green-100 text-green-700 border-green-500/50">Free</Badge>
                      )}
                    </div>
                  </div>
                  
                  {/* Level Details - Commission & Withdrawal Limits */}
                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                    <div>
                      <p className="text-slate-500 text-xs">Commission</p>
                      <p className="text-cyan-700 font-bold">{level.commission_rate || 0}%</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Withdrawal Limits</p>
                      {level.min_withdrawal_amount > 0 || level.max_withdrawal_amount > 0 ? (
                        <p className="text-emerald-700 font-medium text-xs">
                          ${level.min_withdrawal_amount?.toLocaleString() || 0} - ${level.max_withdrawal_amount?.toLocaleString() || 0}
                        </p>
                      ) : (
                        <p className="text-slate-600 text-xs">Not Available</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Upgrade Button - Show for next level only */}
                  {/* Level 1-4: Direct upgrade via Manual Top-up, Level 5: Requires Application */}
                  {canUpgrade && !hasPendingRequest && level.level_number === 5 && (
                    <Button 
                      onClick={() => {
                        setSelectedUpgradeLevel(level);
                        setShowUpgradeModal(true);
                      }}
 className="w-full mt-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white h-10"
                    >
                      <Crown className="w-4 h-4 mr-2" />
                      Apply for Level 5 - ${level.upgrade_cost_usd}
                    </Button>
                  )}
                  
                  {/* For levels 2-4: Show info that they can upgrade via manual top-up */}
                  {canUpgrade && !hasPendingRequest && level.level_number >= 2 && level.level_number <= 4 && (
                    <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <p className="text-emerald-700 text-xs">
                        💡 Use <strong>Manual Top-up</strong> above to add ${level.upgrade_cost_usd} to your wallet and upgrade to this level automatically.
                      </p>
                    </div>
                  )}
                  
                  {/* Status Indicators */}
                  {hasPendingRequest && (
                    <div className="mt-3 p-2 rounded-lg bg-amber-100 border border-amber-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-700" />
                        <span className="text-amber-700 text-xs">Upgrade request pending...</span>
                      </div>
                      <Badge className="bg-amber-500/30 text-amber-700 text-[10px]">Pending</Badge>
                    </div>
                  )}
                  
                  {hasApprovedRequest && !isCurrent && (
                    <div className="mt-3 p-2 rounded-lg bg-green-100 border border-green-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-700" />
                        <span className="text-green-700 text-xs">Upgrade approved! Level updated.</span>
                      </div>
                      <Badge className="bg-green-500/30 text-green-700 text-[10px]">Approved</Badge>
                    </div>
                  )}
                  
                  {level.level_number === 5 && isCurrent && (
                    <div className="mt-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                      <p className="text-purple-700 text-xs">
                        <strong>Payroll Benefits:</strong> Receive agency withdrawal requests (5,000 - 100,000 beans) and earn commission on every transaction.
                      </p>
                      
                      {/* Not applied yet */}
                      {!helperData?.payroll_status && !helperData?.payroll_enabled && (
                        <Button 
                          onClick={() => setShowPayrollModal(true)}
 className="w-full mt-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white h-9 text-xs"
                        >
                          <Crown className="w-3 h-3 mr-1" />
                          Apply for Payroll Access
                        </Button>
                      )}
                      
                      {/* Pending approval */}
                      {helperData?.payroll_status === 'pending' && !helperData?.payroll_enabled && (
                        <div className="mt-3 p-2 rounded-lg bg-amber-100 border border-amber-500/30 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-700" />
                            <span className="text-amber-700 text-xs">Payroll application pending...</span>
                          </div>
                          <Badge className="bg-amber-500/30 text-amber-700 text-[10px]">Pending</Badge>
                        </div>
                      )}
                      
                      {/* Rejected */}
                      {helperData?.payroll_status === 'rejected' && !helperData?.payroll_enabled && (
                        <div className="mt-3 space-y-2">
                          <div className="p-2 rounded-lg bg-red-100 border border-red-500/30 flex items-center gap-2">
                            <span className="text-red-700 text-xs">❌ Application rejected. You can apply again.</span>
                          </div>
                          <Button 
                            onClick={() => setShowPayrollModal(true)}
 className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white h-9 text-xs"
                          >
                            <Crown className="w-3 h-3 mr-1" />
                            Re-apply for Payroll Access
                          </Button>
                        </div>
                      )}
                      
                      {/* Approved - Show dashboard access */}
                      {helperData?.payroll_enabled && (
                        <Button 
                          onClick={() => navigate('/level5-helper-dashboard')}
 className="w-full mt-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white h-9 text-xs"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Open Level 5 Dashboard
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Upgrade Application Modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="bg-white border-slate-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-800 flex items-center gap-2">
              <Crown className="w-5 h-5 text-purple-700" />
              Apply for {selectedUpgradeLevel?.level_name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Upgrade Cost</span>
                <span className="text-2xl font-bold text-amber-700">${selectedUpgradeLevel?.upgrade_cost_usd}</span>
              </div>
            </div>

            {/* Auto Crypto Gateway — replaces manual ePay/Binance flow */}
            <div className="rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-yellow-50 p-3">
              <p className="text-amber-800 text-xs font-semibold mb-1">⚡ Instant Auto-Verified Payment</p>
              <p className="text-slate-600 text-[11px]">
                Pay with USDT / BTC / BNB / ETH — your Level {selectedUpgradeLevel?.level_number} application is auto-submitted the moment the blockchain confirms. No screenshot, no transaction ID, no admin wait.
              </p>
              {selectedUpgradeLevel && selectedUpgradeLevel.upgrade_cost_usd > 0 && (
                <p className="text-emerald-700 text-[11px] mt-2">
                  You will also receive ≈ {Math.floor(selectedUpgradeLevel.upgrade_cost_usd * upgradeDiamondsPerUsd).toLocaleString()} 💎 diamonds in your account.
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowUpgradeModal(false)}
                className="flex-1 border-slate-200 text-slate-500"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedUpgradeLevel || !selectedUpgradeLevel.upgrade_cost_usd) {
                    toast({ title: "Invalid level", description: "Upgrade cost not configured", variant: "destructive" });
                    return;
                  }
                  setShowUpgradeCryptoModal(true);
                }}
                disabled={processing}
                className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-900 font-bold"
              >
                ⚡ Pay ${selectedUpgradeLevel?.upgrade_cost_usd} with Crypto
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payroll Application Modal */}
      <Dialog open={showPayrollModal} onOpenChange={setShowPayrollModal}>
        <DialogContent className="bg-white border-slate-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-800 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-purple-700" />
              Apply for Payroll Access
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl p-4 border border-purple-500/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
 <Gem className="w-6 h-6 text-slate-900" />
                </div>
                <div>
                  <p className="text-slate-800 font-bold">Level 5 Payroll Benefits</p>
                  <p className="text-purple-700 text-xs">Exclusive for Diamond Traders</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-slate-500">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-700" />
                  Process agency withdrawal requests
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-700" />
                  Handle 5,000 - 100,000 beans transactions
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-700" />
                  Earn commission on every transaction
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-700" />
                  Access to Level 5 Dashboard
                </li>
              </ul>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-slate-600 text-sm">
                By applying for payroll access, you agree to process withdrawal requests promptly and maintain a professional standard of service.
              </p>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowPayrollModal(false)}
                className="flex-1 border-slate-300 text-slate-500"
              >
                Cancel
              </Button>
              <Button 
                onClick={async () => {
                  setPayrollProcessing(true);
                  try {
                    // Submit payroll application (pending status)
                    const { error } = await supabase
                      .from('topup_helpers')
                      .update({ 
                        payroll_status: 'pending',
                        payroll_applied_at: new Date().toISOString()
                      })
                      .eq('id', helperData?.id);

                    if (error) throw error;

                    // Update local state
                    setHelperData((prev: any) => ({ ...prev, payroll_status: 'pending', payroll_applied_at: new Date().toISOString() }));
                    
                    toast({ 
                      title: "Application Submitted! ✅", 
                      description: "Your payroll access request is pending admin approval" 
                    });
                    
                    setShowPayrollModal(false);
                  } catch (error: any) {
                    toast({ title: "Failed", description: error.message, variant: "destructive" });
                  } finally {
                    setPayrollProcessing(false);
                  }
                }}
                disabled={payrollProcessing}
 className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
              >
                {payrollProcessing ? "Submitting..." : "Submit Application"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer to User/Agency Modal */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="bg-white border-slate-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-800 flex items-center gap-2">
              <Send className="w-5 h-5 text-emerald-700" />
              Transfer Diamonds
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Current Balance */}
            <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl p-3 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 text-sm">Trader Wallet</span>
                <span className="text-emerald-700 font-bold text-lg">
                  {((helperData?.wallet_balance || 0) + (agencyDiamondBalance || 0)).toLocaleString()} 💎
                </span>
              </div>
              {agencyDiamondBalance > 0 && (
                <p className="text-slate-600 text-[10px] mt-1">
                  Helper {(helperData?.wallet_balance || 0).toLocaleString()} + Agency {agencyDiamondBalance.toLocaleString()}
                </p>
              )}
            </div>

            {/* Tabs */}
            <Tabs value={transferTab} onValueChange={(v) => {
              setTransferTab(v as "user" | "agency" | "self");
              setTransferSearchQuery("");
              setSearchedUser(null);
              setSearchedAgency(null);
            }}>
              <TabsList className="w-full bg-slate-100">
                <TabsTrigger value="user" className="flex-1 gap-1 text-xs data-[state=active]:bg-cyan-500">
                  <User className="w-3.5 h-3.5" />
                  User
                </TabsTrigger>
                <TabsTrigger value="agency" className="flex-1 gap-1 text-xs data-[state=active]:bg-purple-500">
                  <Building2 className="w-3.5 h-3.5" />
                  Agency
                </TabsTrigger>
                <TabsTrigger value="self" className="flex-1 gap-1 text-xs data-[state=active]:bg-emerald-500">
                  <Gem className="w-3.5 h-3.5" />
                  Self
                </TabsTrigger>
              </TabsList>

              <TabsContent value="user" className="mt-4 space-y-4">
                {/* Search by App UID */}
                <div>
                  <Label className="text-slate-800 text-sm">Search by App UID</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="Enter App UID (e.g. ABC123)"
                      value={transferSearchQuery}
                      onChange={(e) => setTransferSearchQuery(e.target.value.toUpperCase())}
                      className="bg-white border-slate-300 text-slate-800 uppercase"
                    />
                    <Button 
                      onClick={handleSearchUser}
                      disabled={transferSearching || !transferSearchQuery.trim()}
                      className="bg-cyan-500 hover:bg-cyan-600"
                    >
                      {transferSearching ? (
 <div className="w-4 h-4 border-2 border-slate-200 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* User Found */}
                {searchedUser && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-cyan-500/30">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar className="w-12 h-12 border-2 border-cyan-500">
                        <AvatarImage src={searchedUser.avatar_url} />
                        <AvatarFallback className="bg-cyan-500">
 <User className="w-5 h-5 text-slate-900" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-slate-800 font-semibold">{searchedUser.display_name}</p>
                        <p className="text-slate-600 text-xs">ID: {searchedUser.app_uid}</p>
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm">Diamond Amount</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount to transfer"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        className="bg-white border-slate-300 text-slate-800 text-lg font-bold"
                      />
                    </div>

                    <Button 
                      onClick={handleTransferToUser}
                      disabled={transferProcessing || !transferAmount || parseInt(transferAmount) <= 0}
                      className="w-full mt-4 bg-gradient-to-r from-cyan-500 to-blue-500 h-11"
                    >
                      {transferProcessing ? (
                        <div className="flex items-center gap-2">
 <div className="w-4 h-4 border-2 border-slate-200 border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4" />
                          Send {transferAmount ? parseInt(transferAmount).toLocaleString() : 0} 💎
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      )}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="agency" className="mt-4 space-y-4">
                {/* Search by Agency Owner UID */}
                <div>
                  <Label className="text-slate-800 text-sm">Search Agency by Owner's App UID</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="Enter Owner's App UID"
                      value={transferSearchQuery}
                      onChange={(e) => setTransferSearchQuery(e.target.value.toUpperCase())}
                      className="bg-white border-slate-300 text-slate-800 uppercase"
                    />
                    <Button 
                      onClick={handleSearchAgency}
                      disabled={transferSearching || !transferSearchQuery.trim()}
                      className="bg-purple-500 hover:bg-purple-600"
                    >
                      {transferSearching ? (
 <div className="w-4 h-4 border-2 border-slate-200 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Agency Found */}
                {searchedAgency && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-purple-500/30">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
 <Building2 className="w-6 h-6 text-slate-900" />
                      </div>
                      <div>
                        <p className="text-slate-800 font-semibold">{searchedAgency.name}</p>
                        <p className="text-slate-600 text-xs">Code: {searchedAgency.agency_code}</p>
                        <p className="text-purple-700 text-xs">Balance: {searchedAgency.wallet_balance?.toLocaleString() || 0} 💎</p>
                        {searchedAgency.owner_name && (
                          <p className="text-slate-500 text-xs">Owner: {searchedAgency.owner_name}</p>
                        )}
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm">Diamond Amount</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount to transfer"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        className="bg-white border-slate-300 text-slate-800 text-lg font-bold"
                      />
                    </div>

                    <Button 
                      onClick={handleTransferToAgency}
                      disabled={transferProcessing || !transferAmount || parseInt(transferAmount) <= 0}
                      className="w-full mt-4 bg-gradient-to-r from-purple-500 to-pink-500 h-11"
                    >
                      {transferProcessing ? (
                        <div className="flex items-center gap-2">
 <div className="w-4 h-4 border-2 border-slate-200 border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4" />
                          Send {transferAmount ? parseInt(transferAmount).toLocaleString() : 0} 💎
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      )}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="self" className="mt-4 space-y-4">
                <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl p-4 border border-emerald-500/30">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
 <Gem className="w-6 h-6 text-slate-900" />
                    </div>
                    <div>
                      <p className="text-slate-800 font-semibold">Self Recharge</p>
                      <p className="text-emerald-700 text-xs">Transfer from wallet to your own diamond balance</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm">Diamond Amount</Label>
                    <Input
                      type="number"
                      placeholder="Enter amount"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="bg-white border-slate-300 text-slate-800 text-lg font-bold"
                    />
                  </div>

                  <Button 
                    onClick={handleSelfRecharge}
                    disabled={transferProcessing || !transferAmount || parseInt(transferAmount) <= 0}
                    className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 h-11"
                  >
                    {transferProcessing ? (
                      <div className="flex items-center gap-2">
 <div className="w-4 h-4 border-2 border-slate-200 border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Gem className="w-4 h-4" />
                        Add {transferAmount ? parseInt(transferAmount).toLocaleString() : 0} 💎 to My Account
                      </div>
                    )}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer History Modal */}
      <Dialog open={showTransferHistory} onOpenChange={setShowTransferHistory}>
        <DialogContent className="bg-white border-slate-200 max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-slate-800 flex items-center gap-2">
              <History className="w-5 h-5 text-cyan-700" />
              Transfer History
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {transferHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-600">
                No transfer history yet
              </div>
            ) : (
              transferHistory.map((transfer) => (
                <div 
                  key={transfer.id}
                  className={cn(
                    "p-3 rounded-xl border",
                    transfer.sender_type === 'trader_to_user' 
                      ? "bg-cyan-500/10 border-cyan-500/30"
                      : "bg-purple-500/10 border-purple-500/30"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {transfer.sender_type === 'trader_to_user' ? (
                      <Avatar className="w-10 h-10 border-2 border-cyan-500">
                        <AvatarImage src={transfer.receiver?.avatar_url} />
                        <AvatarFallback className="bg-cyan-500">
 <User className="w-4 h-4 text-slate-900" />
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
 <Building2 className="w-5 h-5 text-slate-900" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-slate-800 font-medium text-sm truncate">
                          {transfer.sender_type === 'trader_to_user' 
                            ? transfer.receiver?.display_name || 'Unknown User'
                            : transfer.agency?.name || 'Unknown Agency'
                          }
                        </p>
                        <Badge 
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            transfer.sender_type === 'trader_to_user' 
                              ? "bg-cyan-100 text-cyan-600"
                              : "bg-purple-100 text-purple-700"
                          )}
                        >
                          {transfer.sender_type === 'trader_to_user' ? 'User' : 'Agency'}
                        </Badge>
                      </div>
                      <p className="text-slate-600 text-xs">
                        {transfer.sender_type === 'trader_to_user' 
                          ? `ID: ${transfer.receiver?.app_uid || 'N/A'}`
                          : `Code: ${transfer.agency?.agency_code || 'N/A'}`
                        }
                      </p>
                      <p className="text-slate-500 text-[10px]">
                        {new Date(transfer.created_at).toLocaleString()}
                      </p>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-emerald-700 font-bold">
                        -{transfer.amount.toLocaleString()}
                      </p>
                      <p className="text-slate-500 text-xs">💎</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HelperDashboard;
