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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  coins: number;
}

interface TradeHistory {
  id: string;
  receiver_id: string;
  amount: number;
  sender_type: string;
  created_at: string;
  user?: UserProfile;
}

const AgencyCoinTrader = () => {
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
  const [buyCoinsAmount, setBuyCoinsAmount] = useState<string>("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'epay' | 'binance' | null>(null);
  const [showBuyConfirmDialog, setShowBuyConfirmDialog] = useState(false);
  const [isBuyProcessing, setIsBuyProcessing] = useState(false);
  
  // Confirmation dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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
        .from('coin_transfers')
        .select('*')
        .eq('sender_id', agencyData.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (historyData) {
        // Fetch user details for history
        const userIds = historyData.map(h => h.receiver_id);
        const { data: users } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, username, app_uid, coins')
          .in('id', userIds);

        const enrichedHistory = historyData.map(h => ({
          ...h,
          user: users?.find(u => u.id === h.receiver_id)
        }));

        setTradeHistory(enrichedHistory as TradeHistory[]);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      recordClientError({ label: "AgencyCoinTrader.enrichedHistory", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive"
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
        .from('profiles')
        .select('id, display_name, avatar_url, username, app_uid, coins')
        .or(`app_uid.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%,username.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
      recordClientError({ label: "AgencyCoinTrader.searchUsers", message: error instanceof Error ? error.message : String(error) });
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
      // Buying coins from user - agency pays, user loses coins
      const dollarValue = amount / tradeSettings.buy_rate;
      return { beans: amount, dollars: dollarValue };
    } else {
      // Selling coins to user - user pays, agency loses coins
      const dollarValue = amount / tradeSettings.sell_rate;
      return { beans: amount, dollars: dollarValue };
    }
  };

  const handleTrade = async () => {
    if (!agency || !selectedUser) return;

    const amount = parseFloat(tradeAmount);
    if (isNaN(amount) || amount < tradeSettings.min_trade_amount) {
      toast({
        title: "Error",
        description: `Minimum ${tradeSettings.min_trade_amount} coins required`,
        variant: "destructive"
      });
      return;
    }

    // Combined balance for sell validation
    const totalAvailable = (agency?.wallet_balance ?? 0) + (helperData?.wallet_balance ?? 0);

    if (activeTab === "sell" && amount > totalAvailable) {
      toast({
        title: "Error",
        description: "Insufficient coins in your wallet",
        variant: "destructive"
      });
      return;
    }

    if (activeTab === "buy" && amount > (selectedUser.coins || 0)) {
      toast({
        title: "Error",
        description: "User doesn't have enough coins",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    try {
      if (activeTab === "buy") {
        // Agency buys coins from user - ATOMIC operations
        // 1. ATOMIC: Deduct from user's coins with FOR UPDATE locking
        const { data: deductResult, error: deductError } = await supabase
          .rpc('deduct_coins_from_user', {
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
          .from('coin_transfers')
          .insert({
            sender_id: agency.id,
            receiver_id: selectedUser.id,
            amount: Math.floor(amount),
            sender_type: 'agency_buy',
            note: `Agency bought ${Math.floor(amount)} coins from user`
          });

        toast({ title: "✅ Coins purchased successfully" });

      } else {
        // Agency sells coins to user - ATOMIC two-tier deduction
        // 1. ATOMIC: Deduct from agency wallet (agency first, then helper if needed)
        const { data: deductResult, error: deductError } = await supabase
          .rpc('deduct_agency_wallet', {
            p_agency_id: agency.id,
            p_amount: Math.floor(amount)
          });

        if (deductError) throw deductError;
        const deductData = deductResult as { success: boolean; error?: string };
        if (!deductData.success) {
          throw new Error(deductData.error || 'Failed to deduct from wallet');
        }

        // 2. ATOMIC: Add to user's coins (helper-safe)
        const { data: addUserResult, error: addUserError } = await supabase
          .rpc('helper_add_coins_to_user', {
            _user_id: selectedUser.id,
            _amount: Math.floor(amount)
          });

        if (addUserError) throw addUserError;
        const addUserData = addUserResult as any;
        if (addUserData && addUserData.success === false) {
          throw new Error(addUserData.error || 'Failed to add coins to user');
        }

        // 3. Record transaction
        await supabase
          .from('coin_transfers')
          .insert({
            sender_id: agency.id,
            receiver_id: selectedUser.id,
            amount: Math.floor(amount),
            sender_type: 'agency_sell',
            note: `Agency sold ${Math.floor(amount)} coins to user`
          });

        toast({ title: "✅ Coins sold successfully" });
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
      recordClientError({ label: "AgencyCoinTrader.addUserData", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Error",
        description: error?.message || "Failed to process trade",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle official diamond purchase order
  const handleOfficialBuyOrder = async () => {
    if (!agency || !buyCoinsAmount || !selectedPaymentMethod) return;

    const amount = parseFloat(buyCoinsAmount);
    if (isNaN(amount) || amount < tradeSettings.min_trade_amount) {
      toast({
        title: "Error",
        description: `Minimum ${tradeSettings.min_trade_amount} coins to buy`,
        variant: "destructive"
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
          coin_amount: amount,
          amount_usd: dollarAmount,
          amount_local: dollarAmount,
          currency_code: 'USD',
          payment_method: selectedPaymentMethod,
          status: 'pending',
          helper_notes: `Official diamond purchase by agency: ${agency.name}`
        });

      if (error) throw error;

      toast({
        title: "✅ Order Submitted!",
        description: `Order for ${amount.toLocaleString()} coins is being processed.`,
      });

      // Reset form
      setShowBuyConfirmDialog(false);
      setBuyCoinsAmount("");
      setSelectedPaymentMethod(null);

    } catch (error) {
      console.error('Order error:', error);
      recordClientError({ label: "AgencyCoinTrader.dollarAmount", message: error instanceof Error ? error.message : String(error) });
      toast({
        title: "Error",
        description: "Failed to submit order",
        variant: "destructive"
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const tradeCalc = calculateTrade();

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-40 bg-gradient-to-r from-emerald-600 to-teal-600 text-white safe-area-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Diamond Trader</h1>
            <p className="text-xs text-white/70">{agency?.name}</p>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        <main className="px-4 py-4 space-y-4">
        {/* Wallet Balance - Show helperData balance if available, else agency balance */}
        <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                <Coins className="w-7 h-7" />
              </div>
              <div>
                <p className="text-white/80 text-sm">Agency Wallet</p>
                <p className="text-3xl font-bold">
                  {((helperData?.wallet_balance ?? 0) + (agency?.wallet_balance ?? 0)).toLocaleString()}
                </p>
                <p className="text-xs text-white/60">Diamonds</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trade Rates */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-blue-600 font-medium">Buy Rate</span>
              </div>
              <p className="text-lg font-bold text-blue-700">{tradeSettings.buy_rate.toLocaleString()}</p>
              <p className="text-xs text-blue-500">Diamonds / $1</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Banknote className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-600 font-medium">Sell Rate</span>
              </div>
              <p className="text-lg font-bold text-green-700">{tradeSettings.sell_rate.toLocaleString()}</p>
              <p className="text-xs text-green-500">Diamonds / $1</p>
            </CardContent>
          </Card>
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
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg p-4 text-sm text-emerald-800 border border-emerald-200">
                <div className="flex items-center gap-2 mb-2">
                  <Coins className="w-5 h-5 text-emerald-600" />
                  <span className="font-semibold">Official Diamond Purchase</span>
                </div>
                <p className="text-emerald-600">Add diamonds to your agency wallet. Pay via ePay or Binance.</p>
              </div>

              {/* Diamond Purchase Input */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">How many diamonds do you want to buy?</Label>
                <div className="relative">
                  <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-500" />
                  <Input
                    type="number"
                    placeholder="e.g. 100000"
                    value={buyCoinsAmount}
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
                      className={`text-xs ${buyCoinsAmount === amount.toString() ? 'border-primary bg-primary/10' : ''}`}
                    >
                      {(amount / 1000).toLocaleString()}K
                    </Button>
                  ))}
                </div>
              </div>

              {/* Price Calculator */}
              {buyCoinsAmount && parseFloat(buyCoinsAmount) > 0 && (
                <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-amber-700 font-medium">Price Calculation</span>
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                        {tradeSettings.buy_rate.toLocaleString()} Diamonds/$1
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center py-2 border-b border-amber-200">
                        <span className="text-amber-600">Diamond Amount:</span>
                        <span className="font-bold text-lg text-amber-800">
                          {parseFloat(buyCoinsAmount).toLocaleString()} <span className="text-sm">Diamonds</span>
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center py-2 border-b border-amber-200">
                        <span className="text-amber-600">Rate per 100K:</span>
                        <span className="font-semibold text-amber-700">
                          ${((100000 / tradeSettings.buy_rate)).toFixed(2)} / 100K
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-amber-700 font-medium">Total Payment:</span>
                        <div className="text-right">
                          <p className="font-bold text-2xl text-green-600">
                            ${(parseFloat(buyCoinsAmount) / tradeSettings.buy_rate).toFixed(2)}
                          </p>
                          <p className="text-xs text-amber-600">USD</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment Methods */}
              {buyCoinsAmount && parseFloat(buyCoinsAmount) >= tradeSettings.min_trade_amount && (
                <div className="space-y-3">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-green-600" />
                    Select Payment Method
                  </Label>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* ePay Option */}
                    <div
                      onClick={() => setSelectedPaymentMethod('epay')}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedPaymentMethod === 'epay' 
                          ? 'border-purple-500 bg-purple-50' 
                          : 'border-muted hover:border-purple-300'
                      }`}
                    >
                      <div className="text-center">
                        <div className={`w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center ${
                          selectedPaymentMethod === 'epay' ? 'bg-purple-500' : 'bg-purple-100'
                        }`}>
                          <span className={`text-xl font-bold ${selectedPaymentMethod === 'epay' ? 'text-white' : 'text-purple-600'}`}>e</span>
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
                          ? 'border-yellow-500 bg-yellow-50' 
                          : 'border-muted hover:border-yellow-300'
                      }`}
                    >
                      <div className="text-center">
                        <div className={`w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center ${
                          selectedPaymentMethod === 'binance' ? 'bg-yellow-500' : 'bg-yellow-100'
                        }`}>
                          <span className={`text-xl font-bold ${selectedPaymentMethod === 'binance' ? 'text-white' : 'text-yellow-600'}`}>₿</span>
                        </div>
                        <p className="font-semibold text-sm">Binance</p>
                        <p className="text-xs text-muted-foreground">Crypto</p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Info */}
                  {selectedPaymentMethod && (
                    <Card className={`${
                      selectedPaymentMethod === 'epay' ? 'bg-purple-50 border-purple-200' : 'bg-yellow-50 border-yellow-200'
                    }`}>
                      <CardContent className="p-4">
                        <div className="text-center mb-3">
                          <p className={`font-medium ${selectedPaymentMethod === 'epay' ? 'text-purple-700' : 'text-yellow-700'}`}>
                            {selectedPaymentMethod === 'epay' ? 'ePay Payment Details' : 'Binance Pay Details'}
                          </p>
                        </div>
                        
                        <div className={`p-3 rounded-lg mb-3 ${
                          selectedPaymentMethod === 'epay' ? 'bg-purple-100' : 'bg-yellow-100'
                        }`}>
                          <p className="text-xs text-muted-foreground mb-1">Make payment to this ID:</p>
                          <p className="font-mono font-bold text-lg">
                            {selectedPaymentMethod === 'epay' ? 'epay@official.com' : 'binance@official.com'}
                          </p>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Amount:</span>
                            <span className="font-bold">${(parseFloat(buyCoinsAmount) / tradeSettings.buy_rate).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Coins you'll get:</span>
                            <span className="font-bold text-amber-600">{parseFloat(buyCoinsAmount).toLocaleString()}</span>
                          </div>
                        </div>
                        
                        <div className="mt-4 p-3 bg-white/50 rounded-lg border border-dashed">
                          <p className="text-xs text-center text-muted-foreground">
                            ⚠️ After payment, your order will be processed manually. Coins are usually added within 1-2 hours.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Submit Order Button */}
                  <Button
                    className={`w-full h-12 text-base ${
                      selectedPaymentMethod === 'epay' 
                        ? 'bg-purple-600 hover:bg-purple-700' 
                        : selectedPaymentMethod === 'binance'
                        ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
                        : ''
                    }`}
                    onClick={() => setShowBuyConfirmDialog(true)}
                    disabled={!selectedPaymentMethod || !buyCoinsAmount}
                  >
                    <ShoppingCart className="w-5 h-5 mr-2" />
                    Order Now - ${(parseFloat(buyCoinsAmount || '0') / tradeSettings.buy_rate).toFixed(2)}
                  </Button>
                </div>
              )}

              {/* Minimum Amount Notice */}
              {buyCoinsAmount && parseFloat(buyCoinsAmount) > 0 && parseFloat(buyCoinsAmount) < tradeSettings.min_trade_amount && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Minimum {tradeSettings.min_trade_amount.toLocaleString()} coins required
                </div>
              )}
            </TabsContent>

            <TabsContent value="sell" className="p-4 space-y-4">
              <div className="bg-green-50 rounded-lg p-3 text-sm text-green-700">
                <TrendingUp className="w-4 h-4 inline mr-2" />
                Sell coins to users and receive payment
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
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>{user.display_name?.charAt(0) || "U"}</AvatarFallback>
                      </Avatar>
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
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={selectedUser.avatar_url || undefined} />
                        <AvatarFallback>{selectedUser.display_name?.charAt(0) || "U"}</AvatarFallback>
                      </Avatar>
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
                    placeholder="How many coins to sell"
                    value={tradeAmount}
                    onChange={(e) => setTradeAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your wallet: {(agency?.wallet_balance || 0).toLocaleString()} Diamonds
                  </p>
                  {tradeAmount && (
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="flex justify-between text-sm">
                        <span>Coins:</span>
                        <span className="font-bold">{parseFloat(tradeAmount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span>Dollar Value:</span>
                        <span className="font-bold text-green-600">${tradeCalc.dollars.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sell Button */}
              {selectedUser && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={!tradeAmount || parseFloat(tradeAmount) < tradeSettings.min_trade_amount || parseFloat(tradeAmount) > (agency?.wallet_balance || 0)}
                >
                  <Banknote className="w-4 h-4 mr-2" />
                  Sell Coins
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
                        trade.sender_type === 'agency_buy' ? 'bg-blue-100' : 'bg-green-100'
                      }`}>
                        {trade.sender_type === 'agency_buy' ? (
                          <ArrowDownRight className="w-5 h-5 text-blue-600" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-green-600" />
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
                      <p className={`font-bold ${trade.sender_type === 'agency_buy' ? 'text-blue-600' : 'text-green-600'}`}>
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
              <Avatar>
                <AvatarImage src={selectedUser?.avatar_url || undefined} />
                <AvatarFallback>{selectedUser?.display_name?.charAt(0) || "U"}</AvatarFallback>
              </Avatar>
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
              <span className="font-bold text-green-600">${tradeCalc.dollars.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type:</span>
              <Badge className={activeTab === "buy" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}>
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
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
              Confirm Diamond Order
            </DialogTitle>
            <DialogDescription>
              Please review the details before submitting your order
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-emerald-200">
              <span className="text-emerald-700">Diamond Amount:</span>
              <span className="font-bold text-lg text-emerald-800">
                {parseFloat(buyCoinsAmount || '0').toLocaleString()} Diamonds
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-emerald-700">Payment Method:</span>
              <Badge className={`${
                selectedPaymentMethod === 'epay' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {selectedPaymentMethod === 'epay' ? 'ePay' : 'Binance Pay'}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center pt-2 border-t border-emerald-200">
              <span className="text-emerald-700 font-medium">Total Payment:</span>
              <span className="font-bold text-xl text-green-600">
                ${(parseFloat(buyCoinsAmount || '0') / tradeSettings.buy_rate).toFixed(2)}
              </span>
            </div>
          </div>
          
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            <p className="font-medium mb-1">📌 Important:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Send the exact amount to the payment ID</li>
              <li>Wait after making the payment</li>
              <li>Coins are usually added within 1-2 hours</li>
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
                  ? 'bg-purple-600 hover:bg-purple-700' 
                  : 'bg-yellow-500 hover:bg-yellow-600 text-black'
              }`}
            >
              {isBuyProcessing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Submit Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default AgencyCoinTrader;
