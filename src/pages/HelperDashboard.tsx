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
    { diamonds: 4000000, label: "40 Lakh", color: "from-amber-500 to-orange-500" },
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

  // Search agency by code
  const handleSearchAgency = async () => {
    if (!transferSearchQuery.trim()) return;
    
    setTransferSearching(true);
    setSearchedAgency(null);
    
    try {
      const { data, error } = await supabase
        .from('agencies_public')
        .select('id, name, agency_code, diamond_balance, owner_id')
        .or(`agency_code.eq.${transferSearchQuery.trim().toUpperCase()},owner_id.eq.${transferSearchQuery.trim()}`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Get owner name
        const { data: owner } = await supabase
          .from('profiles_public')
          .select('display_name')
          .eq('id', data.owner_id)
          .maybeSingle();
        
        setSearchedAgency({
          id: data.id,
          name: data.name,
          agency_code: data.agency_code,
          wallet_balance: data.diamond_balance || 0,
          owner_id: data.owner_id,
          owner_name: owner?.display_name || 'Unknown'
        });
      } else {
        toast({ title: "Not Found", description: "No agency found with this code", variant: "destructive" });
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col"
    >
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 p-4 safe-area-top">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-bold text-lg text-white">Trader Dashboard</h1>
            <p className="text-white/80 text-xs">Level Upgrade & Manual Top-up</p>
          </div>
          {/* Level Badge */}
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r shadow-lg",
            levelBadge.color
          )}>
            <LevelIcon className="w-4 h-4 text-white" />
            <span className="text-white text-xs font-bold">Lv.{helperData?.trader_level || 1}</span>
          </div>
        </div>

        {/* Wallet Card */}
        <div 
          className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 cursor-pointer hover:bg-white/25 transition-all"
          onClick={() => setShowTransferModal(true)}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-xs">Trader Wallet</p>
              <p className="text-2xl font-bold text-white">
                {((helperData?.wallet_balance || 0) + (agencyDiamondBalance || 0)).toLocaleString()} 💎
              </p>
              {agencyDiamondBalance > 0 && (
                <p className="text-white/60 text-[10px] mt-0.5">
                  Helper {(helperData?.wallet_balance || 0).toLocaleString()} + Agency {agencyDiamondBalance.toLocaleString()}
                </p>
              )}
              <p className="text-emerald-200 text-xs mt-1 flex items-center gap-1">
                <Send className="w-3 h-3" />
                Tap to transfer to User or Agency
              </p>
            </div>
            <div className="bg-white/20 rounded-xl p-3">
              <Wallet className="w-7 h-7 text-white" />
            </div>
          </div>
          
          {/* Level Progress with Animation */}
          {nextLevel && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-white/70 mb-1">
                <span>Level {helperData?.trader_level || 1}</span>
                <span>Level {nextLevel.level_number}</span>
              </div>
              <div className="relative h-2.5 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${levelProgress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                </div>
              </div>
              <div className="flex justify-between items-center mt-1">
                <p className="text-[10px] text-white/60">
                  ${currentCost.toFixed(0)} / ${nextLevelCost.toFixed(0)}
                </p>
                <Badge className="text-[9px] bg-white/20 text-white border-0">
                  {levelProgress.toFixed(0)}%
                </Badge>
              </div>
            </div>
          )}
          
          {/* Max Level Indicator */}
          {!nextLevel && helperData?.trader_level === 5 && (
            <div className="mt-3">
              <div className="flex items-center justify-center gap-2 py-2 bg-gradient-to-r from-cyan-500/30 to-blue-500/30 rounded-lg">
                <Gem className="w-4 h-4 text-cyan-300" />
                <span className="text-white text-xs font-semibold">Maximum Level Achieved!</span>
              </div>
            </div>
          )}
        </div>

        {/* Transfer History Button */}
        {transferHistory.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowTransferHistory(true); }}
            className="w-full mt-2 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white/80 text-xs flex items-center justify-center gap-2 transition-all"
          >
            <History className="w-3.5 h-3.5" />
            View Transfer History ({transferHistory.length})
          </button>
        )}

        {/* WhatsApp Number Setting */}
        <div className="mt-3 bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-green-400/20">
          <div className="flex items-center gap-2 mb-2">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-green-400" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <div>
              <p className="text-white font-semibold text-sm">WhatsApp Number</p>
              <p className="text-white/60 text-[10px]">Visible to users in Recharge section</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="+880XXXXXXXXXX"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-green-400/50"
            />
            <button
              onClick={saveWhatsappNumber}
              disabled={savingWhatsapp || !whatsappNumber.trim()}
              className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-xs font-bold disabled:opacity-50 hover:shadow-lg transition-all active:scale-95"
            >
              {savingWhatsapp ? '...' : 'Save'}
            </button>
          </div>
        </div>

        {helperData?.trader_level === 5 && helperData?.payroll_enabled && (
          <div 
            onClick={() => navigate('/level5-helper-dashboard')}
            className="mt-3 bg-gradient-to-r from-purple-500/30 to-pink-500/30 backdrop-blur-sm rounded-xl p-3 border border-purple-400/30 cursor-pointer hover:bg-purple-500/40 transition-all"
          >
            <div className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-purple-300" />
              <div>
                <p className="text-white font-semibold text-sm">💎 Level 5 Dashboard</p>
                <p className="text-purple-200 text-xs">Access payroll & withdrawal processing</p>
              </div>
              <ArrowLeft className="w-4 h-4 text-white/70 rotate-180 ml-auto" />
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'var(--content-bottom-padding)'
        }}
      >
      {/* Main Content */}
      <div className="px-4 mt-4 space-y-4">
      {/* Payroll Helper Guide Card */}
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


        
        {/* Pending Upgrade Requests */}
        {pendingRequests.length > 0 && (
          <Card className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Pending Upgrade Requests
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-48 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              {pendingRequests.map((req) => (
                <div key={req.id} className="bg-slate-800/50 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-medium">Level {req.requested_level} Upgrade</p>
                    <p className="text-slate-400 text-xs">${req.amount_usd} • {req.payment_method}</p>
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-400">{req.status}</Badge>
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
            <CardTitle className="text-white text-base flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Manual Top-up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-white/80 text-sm">
              Add diamonds to your wallet by sending payment
            </p>
            
            {/* Level-based pricing info */}
            {levelPricing && (
              <div className="p-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl border border-purple-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gem className="w-4 h-4 text-purple-400" />
                    <span className="text-white text-sm font-medium">Your Level {helperData?.trader_level || 1} Rate</span>
                  </div>
                  <Badge className="bg-purple-500/30 text-purple-300">
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
              <div className="space-y-4 bg-slate-800/50 rounded-xl p-4">
                {/* Level pricing reminder */}
                {levelPricing && (
                  <div className="text-center p-2 bg-slate-700/50 rounded-lg">
                    <p className="text-xs text-slate-400">
                      Level {helperData?.trader_level || 1} Rate: <span className="text-emerald-400 font-semibold">{levelPricing.diamond_amount.toLocaleString()} 💎 = ${levelPricing.price_usd}</span>
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
                        ? "bg-slate-700 border-cyan-500 ring-2 ring-cyan-500/20"
                        : selectedDiamondPackage
                        ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500/50"
                        : "bg-slate-700/50 border-slate-600 hover:border-cyan-500/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                        <Gem className="w-5 h-5 text-white" />
                      </div>
                      {selectedDiamondPackage ? (
                        <div className="text-left">
                          <span className="text-white font-bold text-base">
                            {formatDiamonds(selectedDiamondPackage)} 💎
                          </span>
                          <p className="text-emerald-400 text-sm font-medium">
                            ${calculateUSD(selectedDiamondPackage).toFixed(2)} USD
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-medium">Select Diamond Package 💎</span>
                      )}
                    </div>
                    <div className={cn(
                      "w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center transition-transform duration-200",
                      showDiamondPackages && "rotate-180"
                    )}>
                      <ArrowLeft className="w-4 h-4 text-white -rotate-90" />
                    </div>
                  </button>
                  
                  {/* Dropdown List */}
                  {showDiamondPackages && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-slate-800 border-2 border-cyan-500/50 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                      <div className="max-h-80 overflow-y-auto">
                        {diamondPackages.map((pkg, index) => (
                          <button
                            key={pkg.diamonds}
                            onClick={() => {
                              handleSelectPackage(pkg.diamonds);
                              setShowDiamondPackages(false);
                            }}
                            className={cn(
                              "w-full p-3 flex items-center gap-3 transition-all border-b border-slate-700 last:border-b-0",
                              selectedDiamondPackage === pkg.diamonds
                                ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30"
                                : "hover:bg-slate-700/70"
                            )}
                          >
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center text-xl",
                              `bg-gradient-to-r ${pkg.color}`
                            )}>
                              💎
                            </div>
                            <div className="flex-1 text-left">
                              <span className="text-white font-bold text-sm">{pkg.label}</span>
                              <p className="text-slate-400 text-xs">
                                {pkg.diamonds.toLocaleString()} diamonds
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-emerald-400 font-bold text-sm">
                                ${calculateUSD(pkg.diamonds).toFixed(2)}
                              </span>
                              {selectedDiamondPackage === pkg.diamonds && (
                                <div className="mt-1 flex justify-end">
                                  <CheckCircle className="w-4 h-4 text-cyan-400" />
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
                <div className="border-t border-slate-700 pt-4">
                  <button
                    onClick={() => {
                      setShowCustomAmount(!showCustomAmount);
                      setSelectedDiamondPackage(null);
                    }}
                    className={cn(
                      "w-full p-3 rounded-xl border-2 border-dashed transition-all",
                      showCustomAmount
                        ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500"
                        : "bg-slate-700/30 border-slate-600 hover:border-purple-500/50"
                    )}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Crown className="w-5 h-5 text-purple-400" />
                      <span className="text-white font-semibold">Custom Amount</span>
                      <span className="text-slate-400 text-xs">(50 Lakh+)</span>
                    </div>
                  </button>
                  
                  {showCustomAmount && (
                    <div className="mt-3 space-y-2">
                      <Input
                        type="text"
                        placeholder="Enter diamonds (min: 5,00,000)"
                        value={customDiamondAmount}
                        onChange={(e) => handleCustomAmountChange(e.target.value)}
                        className="bg-slate-700 border-purple-500/50 text-white text-center text-lg font-bold"
                      />
                      {parseInt(customDiamondAmount.replace(/,/g, '')) >= 500000 && (
                        <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/30">
                          <p className="text-purple-300 text-sm text-center">
                            💎 {formatDiamonds(parseInt(customDiamondAmount.replace(/,/g, '')))} = ${calculateUSD(parseInt(customDiamondAmount.replace(/,/g, ''))).toFixed(2)}
                          </p>
                        </div>
                      )}
                      {customDiamondAmount && parseInt(customDiamondAmount.replace(/,/g, '')) < 500000 && (
                        <p className="text-red-400 text-xs text-center">
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
                      <span className="text-white/80 text-sm">You will receive:</span>
                      <div className="text-right">
                        <p className="text-white font-bold text-lg">
                          {formatDiamonds(selectedDiamondPackage || parseInt(customDiamondAmount.replace(/,/g, '')))} 💎
                        </p>
                        <p className="text-emerald-400 text-xs">
                          ${calculateUSD(selectedDiamondPackage || parseInt(customDiamondAmount.replace(/,/g, ''))).toFixed(2)} USD
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-white text-sm">Payment Method</Label>
                  {paymentMethods.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {paymentMethods.map((method) => {
                          const getMethodIcon = (type: string) => {
                            const lower = type.toLowerCase();
                            if (lower.includes('binance') || lower.includes('crypto')) return '🟡';
                            if (lower.includes('epay') || lower.includes('ewallet')) return '💚';
                            if (lower.includes('bank')) return '🏦';
                            return '💳';
                          };
                          
                          return (
                            <button
                              key={method.id}
                              onClick={() => {
                                setTopupPaymentMethod(method.method_name);
                                setSelectedPaymentMethod(method);
                              }}
                              className={cn(
                                "p-3 rounded-lg border text-sm transition-all flex items-center gap-2",
                                topupPaymentMethod === method.method_name
                                  ? "bg-emerald-500 border-emerald-400 text-white"
                                  : "bg-slate-700 border-slate-600 text-slate-300 hover:border-emerald-500"
                              )}
                            >
                              {method.logo_url ? (
                                <img src={method.logo_url} alt={method.method_name} className="w-6 h-6 rounded object-contain bg-white/10" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                              ) : (
                                <span className="text-lg">{getMethodIcon(method.method_type)}</span>
                              )}
                              <span>{method.method_name}</span>
                            </button>
                          );
                        })}
                      </div>
                      
                      {/* Show selected payment method details with Copy buttons */}
                      {selectedPaymentMethod && (
                        <div className="mt-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                          <p className="text-emerald-400 font-semibold text-sm mb-3">{selectedPaymentMethod.method_name}</p>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 text-xs">Account Name:</span>
                              <div className="flex items-center gap-2">
                                <span className="text-white text-sm">{selectedPaymentMethod.account_name}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(selectedPaymentMethod.account_name);
                                    toast({ title: "Copied! ✅", description: "Account name copied" });
                                  }}
                                  className="p-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                                >
                                  <Copy className="w-3.5 h-3.5 text-emerald-400" />
                                </button>
                              </div>
                            </div>
                            
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 text-xs">ID/Number:</span>
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-300 font-mono text-sm">{selectedPaymentMethod.account_number}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(selectedPaymentMethod.account_number);
                                    toast({ title: "Copied! ✅", description: "Account ID/Number copied" });
                                  }}
                                  className="p-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                                >
                                  <Copy className="w-3.5 h-3.5 text-emerald-400" />
                                </button>
                              </div>
                            </div>
                            
                            {selectedPaymentMethod.bank_name && (
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs">Bank:</span>
                                <span className="text-slate-300 text-sm">{selectedPaymentMethod.bank_name}</span>
                              </div>
                            )}
                          </div>
                          
                          {selectedPaymentMethod.instructions && (
                            <p className="text-slate-400 text-xs mt-3 italic border-t border-emerald-500/20 pt-2">
                              {selectedPaymentMethod.instructions}
                            </p>
                          )}
                          
                          {/* Copy All Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const text = `${selectedPaymentMethod.method_name}\nAccount: ${selectedPaymentMethod.account_name}\nID/Number: ${selectedPaymentMethod.account_number}${selectedPaymentMethod.bank_name ? `\nBank: ${selectedPaymentMethod.bank_name}` : ''}${selectedPaymentMethod.instructions ? `\nInstructions: ${selectedPaymentMethod.instructions}` : ''}`;
                              navigator.clipboard.writeText(text);
                              toast({ title: "All details copied! ✅", description: "Payment details copied to clipboard" });
                            }}
                            className="w-full mt-3 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy All Details
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-2 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center">
                      <p className="text-amber-400 text-sm font-medium">⚠️ No payment methods available</p>
                      <p className="text-slate-400 text-xs mt-1">Please contact admin to configure payment methods</p>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-white text-sm">
                    Transaction ID <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    placeholder="Enter transaction ID (Required)"
                    value={topupTransactionId}
                    onChange={(e) => setTopupTransactionId(e.target.value)}
                    className={cn(
                      "bg-slate-700 border-slate-600 text-white mt-1",
                      !topupTransactionId.trim() && topupAmount ? "border-red-500/50" : ""
                    )}
                  />
                  {!topupTransactionId.trim() && topupAmount && (
                    <p className="text-red-400 text-xs mt-1">Transaction ID is required</p>
                  )}
                </div>

                <div>
                  <Label className="text-white text-sm">
                    Payment Screenshot <span className="text-red-400">*</span>
                  </Label>
                  <div className="mt-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setTopupProof(e.target.files?.[0] || null)}
                      className="hidden"
                      id="topup-proof"
                    />
                    <label
                      htmlFor="topup-proof"
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border border-dashed cursor-pointer hover:bg-slate-700",
                        !topupProof && topupAmount 
                          ? "border-red-500/50 bg-red-500/10" 
                          : "border-slate-600 bg-slate-700/50"
                      )}
                    >
                      <Upload className={cn("w-5 h-5", topupProof ? "text-emerald-400" : "text-slate-400")} />
                      <span className={cn("text-sm", topupProof ? "text-emerald-400" : "text-slate-400")}>
                        {topupProof ? `✓ ${topupProof.name}` : "Upload payment proof (Required)"}
                      </span>
                    </label>
                    {!topupProof && topupAmount && (
                      <p className="text-red-400 text-xs mt-1">Payment screenshot is required</p>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-white text-sm">Note (Optional)</Label>
                  <Textarea
                    placeholder="Any additional details..."
                    value={topupNote}
                    onChange={(e) => setTopupNote(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white mt-1"
                    rows={2}
                  />
                </div>

                {/* Validation Summary */}
                {(selectedDiamondPackage || (customDiamondAmount && parseInt(customDiamondAmount.replace(/,/g, '')) >= 500000)) && (
                  <div className={cn(
                    "p-3 rounded-lg border",
                    validatePaymentInfo().valid 
                      ? "bg-emerald-500/10 border-emerald-500/30" 
                      : "bg-amber-500/10 border-amber-500/30"
                  )}>
                    <p className={cn(
                      "text-xs font-medium",
                      validatePaymentInfo().valid ? "text-emerald-400" : "text-amber-400"
                    )}>
                      {validatePaymentInfo().valid 
                        ? "✓ All required information provided" 
                        : `⚠ ${validatePaymentInfo().message}`}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowTopupForm(false)}
                    className="flex-1 border-slate-600 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleManualTopup}
                    disabled={processing || !validatePaymentInfo().valid}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500"
                  >
                    {processing ? "Submitting..." : "Submit Request"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trader Levels */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
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
                        ? "bg-slate-700/50 border-slate-600"
                        : "bg-slate-800/50 border-slate-700 opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-r",
                        badge.color
                      )}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-white font-bold">{level.level_name}</p>
                          {isCurrent && (
                            <Badge className="bg-green-500 text-white text-[10px]">Current</Badge>
                          )}
                        </div>
                        <p className="text-slate-400 text-xs">{level.description}</p>
                        {level.level_number === 5 && (
                          <p className="text-purple-400 text-xs mt-1 flex items-center gap-1">
                            <Banknote className="w-3 h-3" />
                            Payroll System Access
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {level.upgrade_cost_usd > 0 ? (
                        <>
                          <p className="text-white font-bold">${level.upgrade_cost_usd}</p>
                          <p className="text-slate-400 text-xs">Upgrade Cost</p>
                        </>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/50">Free</Badge>
                      )}
                    </div>
                  </div>
                  
                  {/* Level Details - Commission & Withdrawal Limits */}
                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-700/50">
                    <div>
                      <p className="text-slate-500 text-xs">Commission</p>
                      <p className="text-cyan-400 font-bold">{level.commission_rate || 0}%</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Withdrawal Limits</p>
                      {level.min_withdrawal_amount > 0 || level.max_withdrawal_amount > 0 ? (
                        <p className="text-emerald-400 font-medium text-xs">
                          ${level.min_withdrawal_amount?.toLocaleString() || 0} - ${level.max_withdrawal_amount?.toLocaleString() || 0}
                        </p>
                      ) : (
                        <p className="text-slate-400 text-xs">Not Available</p>
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
                      <p className="text-emerald-300 text-xs">
                        💡 Use <strong>Manual Top-up</strong> above to add ${level.upgrade_cost_usd} to your wallet and upgrade to this level automatically.
                      </p>
                    </div>
                  )}
                  
                  {/* Status Indicators */}
                  {hasPendingRequest && (
                    <div className="mt-3 p-2 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <span className="text-amber-400 text-xs">Upgrade request pending...</span>
                      </div>
                      <Badge className="bg-amber-500/30 text-amber-300 text-[10px]">Pending</Badge>
                    </div>
                  )}
                  
                  {hasApprovedRequest && !isCurrent && (
                    <div className="mt-3 p-2 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-green-400 text-xs">Upgrade approved! Level updated.</span>
                      </div>
                      <Badge className="bg-green-500/30 text-green-300 text-[10px]">Approved</Badge>
                    </div>
                  )}
                  
                  {level.level_number === 5 && isCurrent && (
                    <div className="mt-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                      <p className="text-purple-300 text-xs">
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
                        <div className="mt-3 p-2 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-400" />
                            <span className="text-amber-400 text-xs">Payroll application pending...</span>
                          </div>
                          <Badge className="bg-amber-500/30 text-amber-300 text-[10px]">Pending</Badge>
                        </div>
                      )}
                      
                      {/* Rejected */}
                      {helperData?.payroll_status === 'rejected' && !helperData?.payroll_enabled && (
                        <div className="mt-3 space-y-2">
                          <div className="p-2 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center gap-2">
                            <span className="text-red-400 text-xs">❌ Application rejected. You can apply again.</span>
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
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Crown className="w-5 h-5 text-purple-400" />
              Apply for {selectedUpgradeLevel?.level_name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Upgrade Cost</span>
                <span className="text-2xl font-bold text-white">${selectedUpgradeLevel?.upgrade_cost_usd}</span>
              </div>
            </div>

            <div>
              <Label className="text-white text-sm">Payment Method</Label>
              {paymentMethods.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {paymentMethods.map((method) => {
                    const getMethodIcon = (type: string) => {
                      const lower = type.toLowerCase();
                      if (lower.includes('binance')) return '🟡';
                      if (lower.includes('epay')) return '💚';
                      if (lower.includes('crypto')) return '₿';
                      if (lower.includes('bank')) return '🏦';
                      return '💳';
                    };
                    
                    return (
                      <button
                        key={method.id}
                        onClick={() => {
                          setPaymentMethod(method.method_name);
                          setSelectedPaymentMethod(method);
                        }}
                        className={cn(
                          "p-3 rounded-lg border text-sm transition-all flex items-center gap-2",
                          paymentMethod === method.method_name
                            ? "bg-purple-500 border-purple-400 text-white"
                            : "bg-slate-800 border-slate-700 text-slate-300 hover:border-purple-500"
                        )}
                      >
                        {method.logo_url ? (
                          <img src={method.logo_url} alt={method.method_name} className="w-6 h-6 rounded object-contain bg-white/10" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <span className="text-lg">{getMethodIcon(method.method_type)}</span>
                        )}
                        <span>{method.method_name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 p-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-sm">
                  No payment methods available. Please contact admin.
                </div>
              )}
              
              {/* Show selected payment method details */}
              {selectedPaymentMethod && (
                <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30">
                  <p className="text-xs text-purple-300 mb-2">Pay to this account:</p>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-xs">Account:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">{selectedPaymentMethod.account_name}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedPaymentMethod.account_name);
                            toast({ title: "Copied! ✅", description: "Account name copied to clipboard" });
                          }}
                          className="p-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                        >
                          <Copy className="w-3 h-3 text-purple-400" />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-xs">ID/Number:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-mono">{selectedPaymentMethod.account_number}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedPaymentMethod.account_number);
                            toast({ title: "Copied! ✅", description: "Account ID/Number copied to clipboard" });
                          }}
                          className="p-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                        >
                          <Copy className="w-3 h-3 text-purple-400" />
                        </button>
                      </div>
                    </div>
                    {selectedPaymentMethod.instructions && (
                      <p className="text-xs text-slate-400 mt-2 italic">{selectedPaymentMethod.instructions}</p>
                    )}
                  </div>
                  
                  {/* Copy All Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const text = `${selectedPaymentMethod.method_name}\nAccount: ${selectedPaymentMethod.account_name}\nID/Number: ${selectedPaymentMethod.account_number}${selectedPaymentMethod.instructions ? `\nInstructions: ${selectedPaymentMethod.instructions}` : ''}`;
                      navigator.clipboard.writeText(text);
                      toast({ title: "All details copied! ✅", description: "Payment details copied to clipboard" });
                    }}
                    className="w-full mt-3 border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy All Payment Details
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label className="text-white text-sm">Transaction ID</Label>
              <Input
                placeholder="Enter transaction ID"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-white text-sm">Payment Screenshot</Label>
              <div className="mt-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPaymentProof(e.target.files?.[0] || null)}
                  className="hidden"
                  id="payment-proof"
                />
                <label
                  htmlFor="payment-proof"
                  className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-slate-700 bg-slate-800/50 cursor-pointer hover:bg-slate-800"
                >
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-slate-400 text-sm">
                    {paymentProof ? paymentProof.name : "Upload payment proof"}
                  </span>
                </label>
              </div>
            </div>

            <div>
              <Label className="text-white text-sm">Note (Optional)</Label>
              <Textarea
                placeholder="Any additional details..."
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white mt-1"
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setShowUpgradeModal(false)}
                className="flex-1 border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleApplyUpgrade}
                disabled={processing}
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
              >
                {processing ? (uploadingProof ? "Uploading..." : "Submitting...") : "Submit Application"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payroll Application Modal */}
      <Dialog open={showPayrollModal} onOpenChange={setShowPayrollModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Banknote className="w-5 h-5 text-purple-400" />
              Apply for Payroll Access
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl p-4 border border-purple-500/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                  <Gem className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold">Level 5 Payroll Benefits</p>
                  <p className="text-purple-300 text-xs">Exclusive for Diamond Traders</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  Process agency withdrawal requests
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  Handle 5,000 - 100,000 beans transactions
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  Earn commission on every transaction
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  Access to Level 5 Dashboard
                </li>
              </ul>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4">
              <p className="text-slate-400 text-sm">
                By applying for payroll access, you agree to process withdrawal requests promptly and maintain a professional standard of service.
              </p>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowPayrollModal(false)}
                className="flex-1 border-slate-600 text-slate-300"
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
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Send className="w-5 h-5 text-emerald-400" />
              Transfer Diamonds
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Current Balance */}
            <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl p-3 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <span className="text-white/80 text-sm">Trader Wallet</span>
                <span className="text-emerald-400 font-bold text-lg">
                  {((helperData?.wallet_balance || 0) + (agencyDiamondBalance || 0)).toLocaleString()} 💎
                </span>
              </div>
              {agencyDiamondBalance > 0 && (
                <p className="text-white/50 text-[10px] mt-1">
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
              <TabsList className="w-full bg-slate-800">
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
                  <Label className="text-white text-sm">Search by App UID</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="Enter App UID (e.g. ABC123)"
                      value={transferSearchQuery}
                      onChange={(e) => setTransferSearchQuery(e.target.value.toUpperCase())}
                      className="bg-slate-800 border-slate-600 text-white uppercase"
                    />
                    <Button 
                      onClick={handleSearchUser}
                      disabled={transferSearching || !transferSearchQuery.trim()}
                      className="bg-cyan-500 hover:bg-cyan-600"
                    >
                      {transferSearching ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* User Found */}
                {searchedUser && (
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-cyan-500/30">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar className="w-12 h-12 border-2 border-cyan-500">
                        <AvatarImage src={searchedUser.avatar_url} />
                        <AvatarFallback className="bg-cyan-500">
                          <User className="w-5 h-5 text-white" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-white font-semibold">{searchedUser.display_name}</p>
                        <p className="text-slate-400 text-xs">ID: {searchedUser.app_uid}</p>
                        <p className="text-cyan-400 text-xs">Balance: {searchedUser.coins?.toLocaleString() || 0} 💎</p>
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <Label className="text-white text-sm">Diamond Amount</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount to transfer"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        className="bg-slate-700 border-slate-600 text-white text-lg font-bold"
                      />
                    </div>

                    <Button 
                      onClick={handleTransferToUser}
                      disabled={transferProcessing || !transferAmount || parseInt(transferAmount) <= 0}
                      className="w-full mt-4 bg-gradient-to-r from-cyan-500 to-blue-500 h-11"
                    >
                      {transferProcessing ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                {/* Search by Agency Code */}
                <div>
                  <Label className="text-white text-sm">Search by Agency Code</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="Enter Agency Code"
                      value={transferSearchQuery}
                      onChange={(e) => setTransferSearchQuery(e.target.value.toUpperCase())}
                      className="bg-slate-800 border-slate-600 text-white uppercase"
                    />
                    <Button 
                      onClick={handleSearchAgency}
                      disabled={transferSearching || !transferSearchQuery.trim()}
                      className="bg-purple-500 hover:bg-purple-600"
                    >
                      {transferSearching ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Agency Found */}
                {searchedAgency && (
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-purple-500/30">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-white font-semibold">{searchedAgency.name}</p>
                        <p className="text-slate-400 text-xs">Code: {searchedAgency.agency_code}</p>
                        <p className="text-purple-400 text-xs">Balance: {searchedAgency.wallet_balance?.toLocaleString() || 0} 💎</p>
                        {searchedAgency.owner_name && (
                          <p className="text-slate-500 text-xs">Owner: {searchedAgency.owner_name}</p>
                        )}
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <Label className="text-white text-sm">Diamond Amount</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount to transfer"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        className="bg-slate-700 border-slate-600 text-white text-lg font-bold"
                      />
                    </div>

                    <Button 
                      onClick={handleTransferToAgency}
                      disabled={transferProcessing || !transferAmount || parseInt(transferAmount) <= 0}
                      className="w-full mt-4 bg-gradient-to-r from-purple-500 to-pink-500 h-11"
                    >
                      {transferProcessing ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                      <Gem className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-semibold">Self Recharge</p>
                      <p className="text-emerald-300 text-xs">Transfer from wallet to your own diamond balance</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white text-sm">Diamond Amount</Label>
                    <Input
                      type="number"
                      placeholder="Enter amount"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white text-lg font-bold"
                    />
                  </div>

                  <Button 
                    onClick={handleSelfRecharge}
                    disabled={transferProcessing || !transferAmount || parseInt(transferAmount) <= 0}
                    className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 h-11"
                  >
                    {transferProcessing ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <History className="w-5 h-5 text-cyan-400" />
              Transfer History
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {transferHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
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
                          <User className="w-4 h-4 text-white" />
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-white" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium text-sm truncate">
                          {transfer.sender_type === 'trader_to_user' 
                            ? transfer.receiver?.display_name || 'Unknown User'
                            : transfer.agency?.name || 'Unknown Agency'
                          }
                        </p>
                        <Badge 
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            transfer.sender_type === 'trader_to_user' 
                              ? "bg-cyan-500/20 text-cyan-300"
                              : "bg-purple-500/20 text-purple-300"
                          )}
                        >
                          {transfer.sender_type === 'trader_to_user' ? 'User' : 'Agency'}
                        </Badge>
                      </div>
                      <p className="text-slate-400 text-xs">
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
                      <p className="text-emerald-400 font-bold">
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
    </div>
  );
};

export default HelperDashboard;
