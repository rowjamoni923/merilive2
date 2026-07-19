import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Coins,
  TrendingUp,
  TrendingDown,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShoppingCart,
  Banknote,
  Users,
  History,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  diamond_balance: number;
}

interface HelperData {
  id: string;
  wallet_balance: number;
  is_verified: boolean;
}

interface TradeSettings {
  buy_rate: number; // How many beans per dollar when buying from users
  sell_rate: number; // How many beans per dollar when selling to users
  min_trade_amount: number;
}

interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  app_uid: string | null;
}

interface TradeHistory {
  id: string;
  receiver_id: string;
  amount: number;
  sender_type: string;
  created_at: string;
  user?: UserProfile;
}

const AgencyDiamondTrader = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [helperData, setHelperData] = useState<HelperData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tradeSettings, setTradeSettings] = useState<TradeSettings>({
    buy_rate: 9500, // Buy from users at slightly lower rate
    sell_rate: 10500, // Sell to users at slightly higher rate
    min_trade_amount: 1000
  });
  
  // Trade state
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [tradeAmount, setTradeAmount] = useState<string>("");
  const [tradeHistory, setTradeHistory] = useState<TradeHistory[]>([]);
  
  // Official diamond purchase state
  const [buyDiamondsAmount, setBuyCoinsAmount] = useState<string>("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'epay' | 'binance' | null>(null);
  const [showBuyConfirmDialog, setShowBuyConfirmDialog] = useState(false);
  const [isBuyProcessing, setIsBuyProcessing] = useState(false);
  
  // Confirmation dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showHelperUpgradeDialog, setShowHelperUpgradeDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Trader Wallet gate: agency must own at least Level 1 Helper (verified topup_helper)
  const hasLevel1Helper = !!helperData && helperData.is_verified === true;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      setCurrentUserId(user.id);

      // Fetch agency
      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .select('id, name, diamond_balance')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (agencyError || !agencyData) {
        toast({
          title: "No Agency",
          description: "You don't have an agency",
          variant: "destructive"
        });
        navigate('/agency');
        return;
      }

      setAgency(agencyData);

      // Fetch helper/trader data for wallet balance
      const { data: helper } = await supabase
        .from('topup_helpers')
        .select('id, wallet_balance, is_verified')
        .eq('user_id', user.id)
        .maybeSingle();

      if (helper) {
        setHelperData(helper);
      }

      // Fetch trade settings
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'coin_trade_settings')
        .maybeSingle();

      if (settingsData?.setting_value) {
        setTradeSettings(settingsData.setting_value as unknown as TradeSettings);
      }

      // Fetch trade history
      const { data: historyData } = await supabase
        .from('diamond_transfers')
        .select('*')
        .eq('sender_id', agencyData.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (historyData) {
        // Fetch user details for history
        const userIds = historyData.map(h => h.receiver_id);
        const { data: users } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, username, app_uid, diamonds')
          .in('id', userIds);

        const enrichedHistory = historyData.map(h => ({
          ...h,
          user: users?.find(u => u.id === h.receiver_id)
        }));

        setTradeHistory(enrichedHistory as TradeHistory[]);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      recordClientError({ label: "AgencyDiamondTrader.enrichedHistory", message: error instanceof Error ? error.message : String(error) });
      toast({
      });
    } finally {
      setIsLoading(false);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles_public')
        .select('id, display_name, avatar_url, username, app_uid')
        .or(`app_uid.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%,username.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
      recordClientError({ label: "AgencyDiamondTrader.searchUsers", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        searchUsers();
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const calculateTrade = () => {
    const amount = parseFloat(tradeAmount) || 0;
    if (activeTab === "buy") {
      // Buying diamonds from user - agency pays, user loses diamonds
      const dollarValue = amount / tradeSettings.buy_rate;
      return { beans: amount, dollars: dollarValue };
    } else {
      // Selling diamonds to user - user pays, agency loses diamonds
      const dollarValue = amount / tradeSettings.sell_rate;
      return { beans: amount, dollars: dollarValue };
    }
  };

  const handleTrade = async () => {
    if (!agency || !selectedUser) return;

    const amount = parseFloat(tradeAmount);
    if (isNaN(amount) || amount < tradeSettings.min_trade_amount) {
      toast({
      });
      return;
    }

    // Trader Wallet gate: only Level 1+ Helpers can recharge users via Trader Wallet
    if (activeTab === "sell" && !hasLevel1Helper) {
      setShowConfirmDialog(false);
      setShowHelperUpgradeDialog(true);
      return;
    }

    // Combined balance for sell validation
    const totalAvailable = (agency?.diamond_balance ?? 0) + (helperData?.wallet_balance ?? 0);

    if (activeTab === "sell" && amount > totalAvailable) {
      toast({
      });
      return;
    }

    setIsProcessing(true);
    try {
      if (activeTab === "buy") {
        // Agency buys diamonds from user - ATOMIC operations
        // 1. ATOMIC: Deduct from user's diamonds with FOR UPDATE locking
        const { data: deductResult, error: deductError } = await supabase
          .rpc('deduct_diamonds_from_user', {
            p_user_id: selectedUser.id,
            p_amount: Math.floor(amount)
          });

        if (deductError) throw deductError;
        const deductData = deductResult as { success: boolean; error?: string };
        if (!deductData.success) {
          throw new Error(deductData.error || 'Failed to deduct from user');
        }

        // 2. ATOMIC: Add to agency wallet (helper-safe)
        const { data: addAgencyResult, error: addAgencyError } = await supabase
          .rpc('helper_add_diamonds_to_agency', {
            _agency_id: agency.id,
            _amount: Math.floor(amount)
          });

        if (addAgencyError) throw addAgencyError;
        const addAgencyData = addAgencyResult as any;
        if (addAgencyData && addAgencyData.success === false) {
          throw new Error(addAgencyData.error || 'Failed to add to agency');
        }

        // 3. Record transaction
        await supabase
          .from('diamond_transfers')
          .insert({
            sender_id: agency.id,
            receiver_id: selectedUser.id,
            amount: Math.floor(amount),
            sender_type: 'agency_buy',
            note: `Agency bought ${Math.floor(amount)} diamonds from user`
          });

        toast({ title: "Diamonds purchased successfully" });

      } else {
        if (!currentUserId) {
          throw new Error('Not authenticated');
        }

        // Agency sells diamonds to user through the locked transfer RPC.
        // This deducts agency/helper/user balance and credits the receiver atomically.
        const senderType = (agency?.diamond_balance ?? 0) >= amount ? 'agency_to_user' : 'trader_to_user';
        const { data: transferResult, error: transferError } = await supabase
          .rpc('helper_transfer_diamonds_to_user', {
            _sender_id: currentUserId,
            _receiver_id: selectedUser.id,
            _sender_type: senderType
          });

        if (transferError) throw transferError;
        const transferData = transferResult as any;
        if (!transferData?.success) {
          throw new Error(transferData?.error || 'Failed to transfer diamonds to user');
        }

        // 3. Record transaction
        await supabase
          .from('diamond_transfers')
          .insert({
          });

        toast({ title: "Diamonds sold successfully" });
      }

      // Reset and refresh
      setShowConfirmDialog(false);
      setSelectedUser(null);
      setTradeAmount("");
      setSearchQuery("");
      setSearchResults([]);
      loadData();

    } catch (error: any) {
      console.error('Trade error:', error);
      recordClientError({ label: "AgencyDiamondTrader.addUserData", message: error instanceof Error ? error.message : String(error) });
      toast({
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle official diamond purchase order
  const handleOfficialBuyOrder = async () => {
    if (!agency || !buyDiamondsAmount || !selectedPaymentMethod) return;

    const amount = parseFloat(buyDiamondsAmount);
    if (isNaN(amount) || amount < tradeSettings.min_trade_amount) {
      toast({
      });
      return;
    }

    setIsBuyProcessing(true);
    try {
      const dollarAmount = amount / tradeSettings.buy_rate;
      
      // Create a pending order in helper_orders for admin to process
      const { error } = await supabase
        .from('helper_orders')
        .insert({
          user_id: agency.id, // Agency as user for this context
          helper_id: agency.id, // Will be reassigned by admin
          diamond_amount: amount,
          amount_usd: dollarAmount,
          amount_local: dollarAmount,
          currency_code: 'USD',
          payment_method: selectedPaymentMethod,
          status: 'pending',
          helper_notes: `Official diamond purchase by agency: ${agency.name}`
        });

      if (error) throw error;

      toast({
      });

      // Reset form
      setShowBuyConfirmDialog(false);
      setBuyCoinsAmount("");
      setSelectedPaymentMethod(null);

    } catch (error) {
      console.error('Order error:', error);
      recordClientError({ label: "AgencyDiamondTrader.dollarAmount", message: error instanceof Error ? error.message : String(error) });
      toast({
      });
    } finally {
      setIsBuyProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return <PageSkeleton className="bg-background" rows={5} hero />;
  }

  const tradeCalc = calculateTrade();

  return (
 <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-emerald-50/40 via-background to-background ">
      {/* Premium gradient header */}
      <header className="flex-shrink-0 sticky top-0 z-40 safe-area-top">
        <div
          className="relative bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white"
          style={{ boxShadow: '0 8px 24px -8px rgba(16,185,129,0.5)' }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.35), transparent 60%), radial-gradient(circle at 90% 100%, rgba(20,184,166,0.5), transparent 60%)',
            }}
            aria-hidden
          />
          <div className="relative px-4 py-3 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-xl text-white hover:bg-white/25 border-0 transition-all hover:-translate-y-0.5 active:scale-95"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 10px -4px rgba(0,0,0,0.25)' }}
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold tracking-tight" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
                Diamond Trader
              </h1>
              <p className="text-xs text-white/85">{agency?.name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <main className="px-4 py-4 space-y-4">
        {/* Premium Trader Wallet card */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-emerald-500 via-green-600 to-teal-600"
          style={{
            boxShadow:
              '0 16px 36px -10px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -3px 8px rgba(0,0,0,0.15)',
          }}
        >
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-teal-300/25 rounded-full blur-3xl" />
          <div className="relative flex items-center gap-4">
            <div
              className="w-16 h-16 bg-white/25 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 6px 14px -4px rgba(0,0,0,0.25)' }}
            >
              <Coins className="w-8 h-8" />
            </div>
            <div className="min-w-0">
              <p className="text-white/85 text-xs font-medium uppercase tracking-wider">Trader Wallet</p>
              <p className="text-3xl font-extrabold mt-0.5" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                {((helperData?.wallet_balance ?? 0) + (agency?.diamond_balance ?? 0)).toLocaleString()}
              </p>
              <p className="text-[11px] text-white/80 mt-1">
                Helper {(helperData?.wallet_balance ?? 0).toLocaleString()} • Agency {(agency?.diamond_balance ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Trade Rates */}
        <div className="grid grid-cols-2 gap-3">
          <div
 className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 border border-sky-200/60 transition-all hover:-translate-y-0.5"
            style={{ boxShadow: '0 8px 20px -10px rgba(14,165,233,0.35), inset 0 1px 0 rgba(255,255,255,0.5)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white" style={{ boxShadow: '0 4px 10px -2px rgba(14,165,233,0.5)' }}>
                <ShoppingCart className="w-4 h-4" />
              </div>
 <span className="text-xs text-sky-700 font-semibold uppercase tracking-wide">Buy Rate</span>
            </div>
 <p className="text-2xl font-extrabold text-sky-700 ">{tradeSettings.buy_rate.toLocaleString()}</p>
 <p className="text-[11px] text-sky-600/80 ">Diamonds / $1</p>
          </div>
          <div
 className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 border border-emerald-200/60 transition-all hover:-translate-y-0.5"
            style={{ boxShadow: '0 8px 20px -10px rgba(16,185,129,0.35), inset 0 1px 0 rgba(255,255,255,0.5)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center text-white" style={{ boxShadow: '0 4px 10px -2px rgba(16,185,129,0.5)' }}>
                <Banknote className="w-4 h-4" />
              </div>
 <span className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Sell Rate</span>
            </div>
 <p className="text-2xl font-extrabold text-emerald-700 ">{tradeSettings.sell_rate.toLocaleString()}</p>
 <p className="text-[11px] text-emerald-600/80 ">Diamonds / $1</p>
          </div>
        </div>

        {/* Trade Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "buy" | "sell")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="buy" className="gap-2">
                <TrendingDown className="w-4 h-4" />
                Buy Diamonds
              </TabsTrigger>
              <TabsTrigger value="sell" className="gap-2">
                <TrendingUp className="w-4 h-4" />
                Sell Diamonds
              </TabsTrigger>
            </TabsList>

            <TabsContent value="buy" className="p-4 space-y-4">
              <div className="bg-gradient-to-r from-success-50 to-success-50 rounded-lg p-4 text-sm text-success-800 border border-success-200">
                <div className="flex items-center gap-2 mb-2">
                  <Coins className="w-5 h-5 text-success-600" />
                  <span className="font-semibold">Official Diamond Purchase</span>
                </div>
                <p className="text-success-600">Add diamonds to your agency wallet. Pay via ePay or Binance.</p>
              </div>

              {/* Diamond Purchase Input */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">How many diamonds do you want to buy?</Label>
                <div className="relative">
                  <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-warning-500" />
                  <Input
                    type="number"
                    placeholder="e.g. 100000"
                    value={buyDiamondsAmount}
                    onChange={(e) => setBuyCoinsAmount(e.target.value)}
                    className="pl-10 text-lg h-12 font-medium"
                  />
                </div>
                
                {/* Quick Amount Buttons */}
                <div className="flex flex-wrap gap-2">
                  {[50000, 100000, 200000, 500000, 1000000].map((amount) => (
                    <Button
                      key={amount}
                      variant="outline"
                      size="sm"
                      onClick={() => setBuyCoinsAmount(amount.toString())}
                      className={`text-xs ${buyDiamondsAmount === amount.toString() ? 'border-primary bg-primary/10' : ''}`}
                    >
                      {(amount / 1000).toLocaleString()}K
                    </Button>
                  ))}
                </div>
              </div>

              {/* Price Calculator */}
              {buyDiamondsAmount && parseFloat(buyDiamondsAmount) > 0 && (
                <Card className="bg-gradient-to-br from-warning-50 to-warning-50 border-warning-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-warning-700 font-medium">Price Calculation</span>
                      <Badge className="bg-warning-100 text-warning-800 border-warning-300">
                        {tradeSettings.buy_rate.toLocaleString()} Diamonds/$1
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center py-2 border-b border-warning-200">
                        <span className="text-warning-600">Diamond Amount:</span>
                        <span className="font-bold text-lg text-warning-800">
                          {parseFloat(buyDiamondsAmount).toLocaleString()} <span className="text-sm">Diamonds</span>
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center py-2 border-b border-warning-200">
                        <span className="text-warning-600">Rate per 100K:</span>
                        <span className="font-semibold text-warning-700">
                          ${((100000 / tradeSettings.buy_rate)).toFixed(2)} / 100K
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-warning-700 font-medium">Total Payment:</span>
                        <div className="text-right">
                          <p className="font-bold text-2xl text-success-600">
                            ${(parseFloat(buyDiamondsAmount) / tradeSettings.buy_rate).toFixed(2)}
                          </p>
                          <p className="text-xs text-warning-600">USD</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment Methods */}
              {buyDiamondsAmount && parseFloat(buyDiamondsAmount) >= tradeSettings.min_trade_amount && (
                <div className="space-y-3">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-success-600" />
                    Select Payment Method
                  </Label>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* ePay Option */}
                    <div
                      onClick={() => setSelectedPaymentMethod('epay')}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedPaymentMethod === 'epay' 
                          ? 'border-brand-500 bg-brand-50' 
                          : 'border-muted hover:border-brand-300'
                      }`}
                    >
                      <div className="text-center">
                        <div className={`w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center ${
                          selectedPaymentMethod === 'epay' ? 'bg-brand-500' : 'bg-brand-100'
                        }`}>
                          <span className={`text-xl font-bold ${selectedPaymentMethod === 'epay' ? 'text-slate-800' : 'text-brand-600'}`}>e</span>
                        </div>
                        <p className="font-semibold text-sm">ePay</p>
                        <p className="text-xs text-muted-foreground">E-Payment</p>
                      </div>
                    </div>

                    {/* Binance Option */}
                    <div
                      onClick={() => setSelectedPaymentMethod('binance')}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedPaymentMethod === 'binance' 
                          ? 'border-warning-500 bg-warning-50' 
                          : 'border-muted hover:border-warning-300'
                      }`}
                    >
                      <div className="text-center">
                        <div className={`w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center ${
                          selectedPaymentMethod === 'binance' ? 'bg-warning-500' : 'bg-warning-100'
                        }`}>
                          <span className={`text-xl font-bold ${selectedPaymentMethod === 'binance' ? 'text-slate-800' : 'text-warning-600'}`}>₿</span>
                        </div>
                        <p className="font-semibold text-sm">Binance</p>
                        <p className="text-xs text-muted-foreground">Crypto</p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Info */}
                  {selectedPaymentMethod && (
                    <Card className={`${
                      selectedPaymentMethod === 'epay' ? 'bg-brand-50 border-brand-200' : 'bg-warning-50 border-warning-200'
                    }`}>
                      <CardContent className="p-4">
                        <div className="text-center mb-3">
                          <p className={`font-medium ${selectedPaymentMethod === 'epay' ? 'text-brand-700' : 'text-warning-700'}`}>
                            {selectedPaymentMethod === 'epay' ? 'ePay Payment Details' : 'Binance Pay Details'}
                          </p>
                        </div>
                        
                        <div className={`p-3 rounded-lg mb-3 ${
                          selectedPaymentMethod === 'epay' ? 'bg-brand-100' : 'bg-warning-100'
                        }`}>
                          <p className="text-xs text-muted-foreground mb-1">Make payment to this ID:</p>
                          <p className="font-mono font-bold text-lg">
                            {selectedPaymentMethod === 'epay' ? 'epay@official.com' : 'binance@official.com'}
                          </p>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Amount:</span>
                            <span className="font-bold">${(parseFloat(buyDiamondsAmount) / tradeSettings.buy_rate).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Diamonds you'll get:</span>
                            <span className="font-bold text-warning-600">{parseFloat(buyDiamondsAmount).toLocaleString()}</span>
                          </div>
                        </div>
                        
                        <div className="mt-4 p-3 bg-white/50 rounded-lg border border-dashed">
                          <p className="text-xs text-center text-muted-foreground">
                            After payment, your order will be processed manually. Diamonds are usually added within 1-2 hours.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Submit Order Button */}
                  <Button
                    className={`w-full h-12 text-base ${
                      selectedPaymentMethod === 'epay' 
                        ? 'bg-brand-600 hover:bg-brand-700' 
                        : selectedPaymentMethod === 'binance'
                        ? 'bg-warning-500 hover:bg-warning-600 text-black'
                        : ''
                    }`}
                    onClick={() => setShowBuyConfirmDialog(true)}
                    disabled={!selectedPaymentMethod || !buyDiamondsAmount}
                  >
                    <ShoppingCart className="w-5 h-5 mr-2" />
                    Order Now - ${(parseFloat(buyDiamondsAmount || '0') / tradeSettings.buy_rate).toFixed(2)}
                  </Button>
                </div>
              )}

              {/* Minimum Amount Notice */}
              {buyDiamondsAmount && parseFloat(buyDiamondsAmount) > 0 && parseFloat(buyDiamondsAmount) < tradeSettings.min_trade_amount && (
                <div className="bg-danger-50 border border-danger-200 rounded-lg p-3 text-sm text-danger-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Minimum {tradeSettings.min_trade_amount.toLocaleString()} Diamonds required
                </div>
              )}
            </TabsContent>

            <TabsContent value="sell" className="p-4 space-y-4">
              <div className="bg-success-50 rounded-lg p-3 text-sm text-success-700">
                <TrendingUp className="w-4 h-4 inline mr-2" />
                Sell Diamonds to users and receive payment
              </div>

              {/* User Search */}
              <div className="space-y-2">
                <Label>Search User (App UID / Name)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by App UID or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Search Results */}
              {searching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}

              {searchResults.length > 0 && !selectedUser && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => {
                        setSelectedUser(user);
                        setSearchResults([]);
                      }}
                      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted"
                    >
                <AvatarWithFrame
                  src={enhanceThumbnail(user.avatar_url || undefined, { width: 96, quality: 82})}
                  name={(user as any)?.display_name || (user as any)?.agency_name || (user as any)?.name || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
                      <div className="flex-1">
                        <p className="font-medium">{user.display_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">UID: {user.app_uid}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected User */}
              {selectedUser && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                <AvatarWithFrame
                  src={enhanceThumbnail(selectedUser.avatar_url || undefined, { width: 96, quality: 82})}
                  name={(selectedUser as any)?.display_name || (selectedUser as any)?.agency_name || (selectedUser as any)?.name || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
                      <div>
                        <p className="font-semibold">{selectedUser.display_name}</p>
                        <p className="text-xs text-muted-foreground">UID: {selectedUser.app_uid}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedUser(null)}
                    >
                      Change
                    </Button>
                  </div>
                </div>
              )}

              {/* Trade Amount */}
              {selectedUser && (
                <div className="space-y-2">
                  <Label>Diamond Amount</Label>
                  <Input
                    type="number"
                    placeholder="How many Diamonds to sell"
                    value={tradeAmount}
                    onChange={(e) => setTradeAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Trader Wallet: {((agency?.diamond_balance || 0) + (helperData?.wallet_balance || 0)).toLocaleString()}
                  </p>
                  {tradeAmount && (
                    <div className="bg-success-50 rounded-lg p-3">
                      <div className="flex justify-between text-sm">
                        <span>Diamonds:</span>
                        <span className="font-bold">{parseFloat(tradeAmount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span>Dollar Value:</span>
                        <span className="font-bold text-success-600">${tradeCalc.dollars.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sell Button */}
              {selectedUser && (
                <Button
                  className="w-full bg-success-600 hover:bg-success-700"
                  onClick={() => {
                    if (!hasLevel1Helper) {
                      setShowHelperUpgradeDialog(true);
                      return;
                    }
                    setShowConfirmDialog(true);
                  }}
                  disabled={!tradeAmount || parseFloat(tradeAmount) < tradeSettings.min_trade_amount || parseFloat(tradeAmount) > ((agency?.diamond_balance || 0) + (helperData?.wallet_balance || 0))}
                >
                  <Banknote className="w-4 h-4 mr-2" />
                  Sell Diamonds
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </Card>

        {/* Trade History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-5 h-5 text-muted-foreground" />
              Trade History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tradeHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Coins className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No trade history</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tradeHistory.map((trade) => (
                  <div 
                    key={trade.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        trade.sender_type === 'agency_buy' ? 'bg-info-100' : 'bg-success-100'
                      }`}>
                        {trade.sender_type === 'agency_buy' ? (
                          <ArrowDownRight className="w-5 h-5 text-info-600" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-success-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {trade.sender_type === 'agency_buy' ? 'Buy' : 'Sell'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {trade.user?.display_name || "Unknown"} · {formatDate(trade.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${trade.sender_type === 'agency_buy' ? 'text-info-600' : 'text-success-600'}`}>
                        {trade.sender_type === 'agency_buy' ? '+' : '-'}{trade.amount.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Diamonds</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {activeTab === "buy" ? "Confirm Diamond Purchase" : "Confirm Diamond Sale"}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to complete this trade?
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-muted rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b">
                <AvatarWithFrame
                  src={enhanceThumbnail(selectedUser?.avatar_url || undefined, { width: 96, quality: 82})}
                  name={(selectedUser as any)?.display_name || (selectedUser as any)?.agency_name || (selectedUser as any)?.name || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
              <div>
                <p className="font-medium">{selectedUser?.display_name}</p>
                <p className="text-xs text-muted-foreground">UID: {selectedUser?.app_uid}</p>
              </div>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">Diamond Amount:</span>
              <span className="font-bold">{parseFloat(tradeAmount || '0').toLocaleString()} Diamonds</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dollar Value:</span>
              <span className="font-bold text-success-600">${tradeCalc.dollars.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type:</span>
              <Badge className={activeTab === "buy" ? "bg-info-100 text-info-700" : "bg-success-100 text-success-700"}>
                {activeTab === "buy" ? "Buy" : "Sell"}
              </Badge>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={handleTrade} disabled={isProcessing}>
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Official Diamond Purchase Confirm Dialog */}
      <Dialog open={showBuyConfirmDialog} onOpenChange={setShowBuyConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-success-600" />
              Confirm Diamond Order
            </DialogTitle>
            <DialogDescription>
              Please review the details before submitting your order
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-gradient-to-br from-success-50 to-success-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-success-200">
              <span className="text-success-700">Diamond Amount:</span>
              <span className="font-bold text-lg text-success-800">
                {parseFloat(buyDiamondsAmount || '0').toLocaleString()} Diamonds
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-success-700">Payment Method:</span>
              <Badge className={`${
                selectedPaymentMethod === 'epay' 
                  ? 'bg-brand-100 text-brand-700' 
                  : 'bg-warning-100 text-warning-700'
              }`}>
                {selectedPaymentMethod === 'epay' ? 'ePay' : 'Binance Pay'}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center pt-2 border-t border-success-200">
              <span className="text-success-700 font-medium">Total Payment:</span>
              <span className="font-bold text-xl text-success-600">
                ${(parseFloat(buyDiamondsAmount || '0') / tradeSettings.buy_rate).toFixed(2)}
              </span>
            </div>
          </div>
          
          <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 text-sm text-warning-700">
            <p className="font-medium mb-1">Important:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Send the exact amount to the payment ID</li>
              <li>Wait after making the payment</li>
              <li>Diamonds are usually added within 1-2 hours</li>
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBuyConfirmDialog(false)} disabled={isBuyProcessing}>
              Cancel
            </Button>
            <Button 
              onClick={handleOfficialBuyOrder}
              disabled={isBuyProcessing}
              className={`${
                selectedPaymentMethod === 'epay' 
                  ? 'bg-brand-600 hover:bg-brand-700' 
                  : 'bg-warning-500 hover:bg-warning-600 text-black'
              }`}
            >
              {isBuyProcessing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Submit Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Helper Upgrade Required Dialog */}
      <Dialog open={showHelperUpgradeDialog} onOpenChange={setShowHelperUpgradeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-warning-500" />
              Upgrade Required
            </DialogTitle>
            <DialogDescription>
              Trader Wallet recharge is available only for verified Helpers.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-warning-300/40 bg-gradient-to-br from-warning-50 to-warning-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-warning-800">
              Become a Level 1 Helper
            </p>
            <p className="text-xs text-warning-700/80 leading-relaxed">
              Your Trader Wallet is automatically created with your agency, but to use it for recharging users you must first take the Helper Section. Once your Level 1 Helper application is approved, the Trader Wallet will be fully unlocked.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowHelperUpgradeDialog(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-warning-500 to-warning-500 hover:from-warning-600 hover:to-warning-600 text-white"
              onClick={() => {
                setShowHelperUpgradeDialog(false);
                navigate('/helper-dashboard');
              }}
            >
              Apply Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default AgencyDiamondTrader;
