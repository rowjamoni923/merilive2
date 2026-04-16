import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Wallet,
  Send,
  History,
  CheckCircle2,
  Info,
  User,
  Search,
  AlertCircle,
  Loader2,
  ArrowRightLeft,
  Gem
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TransferRecord {
  id: string;
  receiver_id: string;
  receiver_name: string | null;
  receiver_avatar: string | null;
  amount: number;
  note: string | null;
  status: string;
  created_at: string;
}

interface FoundUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_host: boolean | null;
  is_verified: boolean | null;
}

const quickTransferAmounts = [10000, 50000, 100000];
const quickExchangeAmounts = [10000, 50000, 100000, 500000];

const AgentWallet = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [diamondBalance, setDiamondBalance] = useState(0); // REAL: agency diamond_balance + helper wallet + profile coins
  const [agencyDiamondBalance, setAgencyDiamondBalance] = useState(0);
  const [helperWalletBalance, setHelperWalletBalance] = useState(0);
  const [profileCoins, setProfileCoins] = useState(0);
  const [beansBalance, setBeansBalance] = useState(0); // Income in beans
  const [showTransfer, setShowTransfer] = useState(false);
  const [showExchange, setShowExchange] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [exchangeAmount, setExchangeAmount] = useState("");
  const [userId, setUserId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [searchResults, setSearchResults] = useState<FoundUser[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to refresh all tiered balances
  const refreshBalances = async (uid: string) => {
    const [agencyRes, helperRes, profileRes] = await Promise.all([
      supabase.from("agencies").select("diamond_balance, wallet_balance").eq("owner_id", uid).maybeSingle(),
      supabase.from("topup_helpers").select("wallet_balance").eq("user_id", uid).eq("is_verified", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("profiles").select("coins, beans").eq("id", uid).single(),
    ]);

    const agencyDiamonds = agencyRes.data?.diamond_balance || 0;
    const helperWallet = helperRes.data?.wallet_balance || 0;
    const userCoins = profileRes.data?.coins || 0;
    const userBeans = profileRes.data?.beans || 0;

    setAgencyDiamondBalance(agencyDiamonds);
    setHelperWalletBalance(helperWallet);
    setProfileCoins(userCoins);
    setDiamondBalance(agencyDiamonds + helperWallet + userCoins);
    setBeansBalance(userBeans);
  };

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      await refreshBalances(user.id);

      // Beans already fetched by refreshBalances above

      // Fetch transfer history
      const { data: historyData } = await supabase
        .rpc("get_agency_transfer_history", { _limit: 10 });

      if (historyData) {
        setTransfers(historyData as TransferRecord[]);
      }

      setIsLoading(false);
    };

    fetchData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("agency-wallet-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agencies" },
        async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await refreshBalances(user.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "coin_transfers" },
        async () => {
          const { data: historyData } = await supabase
            .rpc("get_agency_transfer_history", { _limit: 10 });
          if (historyData) {
            setTransfers(historyData as TransferRecord[]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  const handleSearchUser = async () => {
    if (!userId.trim()) {
      toast({
        title: "Error",
        description: "Please enter a user ID or username",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setFoundUser(null);
    setSearchResults([]);

    const { data, error } = await supabase
      .rpc("search_user_by_id", { _search_query: userId.trim() });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to search user",
        variant: "destructive",
      });
      setIsSearching(false);
      return;
    }

    if (data && data.length > 0) {
      setSearchResults(data as FoundUser[]);
    } else {
      toast({
        title: "Not Found",
        description: "No user found with this ID",
        variant: "destructive",
      });
    }
    setIsSearching(false);
  };

  const handleSelectUser = (user: FoundUser) => {
    setFoundUser(user);
    setSearchResults([]);
  };

  const handleTransfer = async () => {
    const amount = parseInt(transferAmount);
    
    if (!amount || amount < 10000) {
      toast({
        title: "Error",
        description: "Minimum 10,000 coins required",
        variant: "destructive",
      });
      return;
    }

    if (amount > diamondBalance) {
      toast({
        title: "Error",
        description: "Insufficient balance",
        variant: "destructive",
      });
      return;
    }

    if (!foundUser) {
      toast({
        title: "Error",
        description: "Please search and select a user first",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    // Use tiered transfer RPC (agency → helper wallet → personal coins)
    const { data: result, error } = await supabase
      .rpc("helper_transfer_coins_to_user", {
        _sender_id: (await supabase.auth.getUser()).data.user?.id,
        _receiver_id: foundUser.id,
        _amount: amount,
        _sender_type: agencyDiamondBalance >= amount ? 'agency_to_user' : 'trader_to_user',
      });

    const transferResult = result as any;
    if (error || (transferResult && !transferResult.success)) {
      toast({
        title: "Error",
        description: transferResult?.error || error?.message || "Transfer failed",
        variant: "destructive",
      });
      setIsProcessing(false);
      return;
    }
    
    toast({
      title: "Success!",
      description: `${amount.toLocaleString()} diamonds sent to ${foundUser.display_name || foundUser.username}`,
    });
    
    // Refresh real balances from DB
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) await refreshBalances(currentUser.id);
    
    setIsProcessing(false);
    setShowTransfer(false);
    setTransferAmount("");
    setUserId("");
    setFoundUser(null);
    setSearchResults([]);
  };

  const handleExchange = async () => {
    const amount = parseInt(exchangeAmount);
    
    if (!amount || amount < 10000) {
      toast({
        title: "Error",
        description: "Minimum 10,000 beans required",
        variant: "destructive",
      });
      return;
    }

    if (amount > beansBalance) {
      toast({
        title: "Error",
        description: "Insufficient beans balance",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsProcessing(false);
      return;
    }

    // Use atomic RPC for beans → diamonds exchange
    const feePercent = 25;
    const diamondsReward = Math.floor(amount * (100 - feePercent) / 100);
    
    const { data: result, error } = await supabase
      .rpc("exchange_user_beans_to_diamonds", {
        _user_id: user.id,
        _beans_amount: amount,
        _diamonds_reward: diamondsReward,
      });

    const exchangeResult = result as any;
    if (error || (exchangeResult && !exchangeResult.success)) {
      toast({
        title: "Error",
        description: exchangeResult?.error || error?.message || "Exchange failed",
        variant: "destructive",
      });
      setIsProcessing(false);
      return;
    }

    // Refresh real balances from DB
    await refreshBalances(user.id);
    
    toast({
      title: "Success!",
      description: `${amount.toLocaleString()} beans converted to ${amount.toLocaleString()} coins`,
    });
    
    setIsProcessing(false);
    setShowExchange(false);
    setExchangeAmount("");
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      year: "numeric"
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-emerald-500 to-teal-600 text-white safe-area-top">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">Agent Wallet</h1>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {/* Balance Cards */}
        <div className="mx-4 mt-4 space-y-3">
        {/* Coins Balance */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-5 h-5" />
            <span className="text-white/80 text-sm">Diamond Balance</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{diamondBalance.toLocaleString()}</span>
            <span className="text-white/80">Diamonds</span>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <Button 
              onClick={() => setShowTransfer(true)}
              className="bg-white/20 hover:bg-white/30 backdrop-blur-sm"
            >
              <Send className="w-4 h-4 mr-2" />
              Send Coins
            </Button>
            <Button 
              variant="outline"
              className="border-white/30 text-white bg-transparent hover:bg-white/10"
              onClick={() => navigate("/transfer-history")}
            >
              <History className="w-4 h-4 mr-2" />
              History
            </Button>
          </div>
        </div>

        {/* Beans/Income Balance */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Gem className="w-5 h-5" />
            <span className="text-white/80 text-sm">Income Balance (Beans)</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{beansBalance.toLocaleString()}</span>
            <span className="text-white/80">Beans</span>
          </div>
          <p className="text-white/70 text-xs mt-1">Commission earnings from hosts</p>

          <Button 
            onClick={() => setShowExchange(true)}
            className="w-full mt-4 bg-white/20 hover:bg-white/30 backdrop-blur-sm"
          >
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            Exchange to Coins
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mx-4 mt-4">
        <Tabs defaultValue="transfer" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="transfer">Quick Transfer</TabsTrigger>
            <TabsTrigger value="exchange">Quick Exchange</TabsTrigger>
          </TabsList>

          <TabsContent value="transfer" className="mt-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border">
              <div className="grid grid-cols-3 gap-2">
                {quickTransferAmounts.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => {
                      setTransferAmount(amount.toString());
                      setShowTransfer(true);
                    }}
                    disabled={diamondBalance < amount}
                    className="p-3 rounded-xl border border-gray-100 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-center gap-1 text-yellow-500 font-bold">
                      <span>🪙</span>
                      <span>{amount.toLocaleString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="exchange" className="mt-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border">
              <div className="grid grid-cols-2 gap-2">
                {quickExchangeAmounts.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => {
                      setExchangeAmount(amount.toString());
                      setShowExchange(true);
                    }}
                    disabled={beansBalance < amount}
                    className="p-3 rounded-xl border border-gray-100 hover:border-amber-300 hover:bg-amber-50 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-center gap-1 text-amber-600 font-bold">
                      <Gem className="w-4 h-4" />
                      <span>{amount.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">→ 🪙 {amount.toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Info Cards */}
      <div className="mx-4 mt-4 space-y-3">
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-800">Exchange Info</h4>
              <ul className="text-sm text-blue-700 mt-1 space-y-1">
                <li>• 1 Bean = 1 Coin (1:1 ratio)</li>
                <li>• Minimum exchange: 10,000 beans</li>
                <li>• Beans come from host commissions</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-emerald-800">Transfer Info</h4>
              <ul className="text-sm text-emerald-700 mt-1 space-y-1">
                <li>• Send coins to users by their ID</li>
                <li>• Minimum transfer: 10,000 coins</li>
                <li>• Instant transfer</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transfers */}
      <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm border mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Recent Transfers</h3>
          <button 
            onClick={() => navigate("/transfer-history")}
            className="text-sm text-emerald-600 font-medium"
          >
            View All
          </button>
        </div>
        
        {transfers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Send className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>No transfers yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transfers.slice(0, 5).map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={tx.receiver_avatar || ""} />
                  <AvatarFallback>
                    <User className="w-5 h-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    {tx.receiver_name || "Unknown User"}
                  </p>
                  <p className="text-xs text-gray-500">{formatDate(tx.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm text-orange-600">
                    -{tx.amount.toLocaleString()}
                  </p>
                  <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">
                    <CheckCircle2 className="w-3 h-3 mr-0.5" />
                    Completed
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transfer Drawer */}
      <Drawer open={showTransfer} onOpenChange={setShowTransfer}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="border-b pb-4">
            <DrawerTitle>Send Coins to User</DrawerTitle>
          </DrawerHeader>

          <div className="p-4 space-y-4 overflow-y-auto">
            {/* Current Balance */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm text-gray-600">Available Coins</p>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-yellow-500">🪙</span>
                <span className="font-bold text-lg">{diamondBalance.toLocaleString()}</span>
              </div>
            </div>

            {/* User ID Search */}
            <div>
              <Label className="text-sm font-medium">User ID / Username</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Enter user ID or username"
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    setFoundUser(null);
                    setSearchResults([]);
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleSearchUser}
                  disabled={isSearching}
                  variant="outline"
                  className="px-4"
                >
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="border rounded-xl overflow-hidden">
                <p className="text-xs text-gray-500 px-3 py-2 bg-gray-50">Select a user:</p>
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-t transition-colors"
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={user.avatar_url || ""} />
                      <AvatarFallback>
                        <User className="w-5 h-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm">
                        {user.display_name || user.username || "Unknown"}
                        {user.is_verified && (
                          <CheckCircle2 className="w-4 h-4 text-blue-500 inline ml-1" />
                        )}
                      </p>
                      <p className="text-xs text-gray-500 truncate">ID: {user.id.slice(0, 8)}...</p>
                    </div>
                    {user.is_host && (
                      <Badge variant="secondary" className="text-xs">Host</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Found User Display */}
            {foundUser && (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                <Avatar className="w-12 h-12 border-2 border-green-300">
                  <AvatarImage src={foundUser.avatar_url || ""} />
                  <AvatarFallback>
                    <User className="w-6 h-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-semibold text-green-800">
                    {foundUser.display_name || foundUser.username || "Unknown"}
                  </p>
                  <p className="text-sm text-green-600">ID: {foundUser.id.slice(0, 8)}...</p>
                </div>
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
            )}

            {/* Diamond Amount */}
            <div>
              <Label className="text-sm font-medium">Diamond Amount</Label>
              <Input
                type="number"
                placeholder="Minimum 10,000"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex gap-2 flex-wrap">
              {[10000, 50000, 100000, diamondBalance].map((amount, i) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setTransferAmount(amount.toString())}
                  className={transferAmount === amount.toString() ? "border-emerald-500 bg-emerald-50" : ""}
                  disabled={diamondBalance < amount}
                >
                  {i === 3 ? "All" : amount.toLocaleString()}
                </Button>
              ))}
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-xl">
              <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800">
                Please verify the user ID before transferring. Coins sent to wrong ID cannot be recovered.
              </p>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleTransfer}
              disabled={isProcessing || !foundUser}
              className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </span>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Coins
                </>
              )}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Exchange Drawer */}
      <Drawer open={showExchange} onOpenChange={setShowExchange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="border-b pb-4">
            <DrawerTitle>Exchange Beans to Coins</DrawerTitle>
          </DrawerHeader>

          <div className="p-4 space-y-4">
            {/* Current Beans Balance */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
              <p className="text-sm text-amber-700">Available Beans</p>
              <div className="flex items-center gap-2 mt-1">
                <Gem className="w-6 h-6 text-amber-500" />
                <span className="font-bold text-2xl text-amber-700">{beansBalance.toLocaleString()}</span>
              </div>
              <p className="text-xs text-amber-600 mt-1">From host commissions</p>
            </div>

            {/* Exchange Amount */}
            <div>
              <Label className="text-sm font-medium">Beans Amount</Label>
              <Input
                type="number"
                placeholder="Minimum 10,000"
                value={exchangeAmount}
                onChange={(e) => setExchangeAmount(e.target.value)}
                className="mt-1"
              />
              {parseInt(exchangeAmount) > 0 && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-emerald-50 rounded-lg">
                  <span className="text-sm text-gray-600">You will receive:</span>
                  <span className="text-yellow-500">🪙</span>
                  <span className="font-bold text-emerald-600">
                    {parseInt(exchangeAmount).toLocaleString()} Coins
                  </span>
                </div>
              )}
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex gap-2 flex-wrap">
              {[10000, 50000, 100000, beansBalance].map((amount, i) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setExchangeAmount(amount.toString())}
                  className={exchangeAmount === amount.toString() ? "border-amber-500 bg-amber-50" : ""}
                  disabled={beansBalance < amount}
                >
                  {i === 3 ? "All" : amount.toLocaleString()}
                </Button>
              ))}
            </div>

            {/* Exchange Rate Info */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl">
              <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium">Exchange Rate: 1:1</p>
                <p>1 Bean = 1 Coin</p>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleExchange}
              disabled={isProcessing || !exchangeAmount || parseInt(exchangeAmount) < 10000}
              className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </span>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Exchange to Coins
                </>
              )}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
      </div>
    </div>
  );
};

export default AgentWallet;
