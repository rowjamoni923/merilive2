import { useState, useEffect } from "react";
import { usePersistedCache } from "@/hooks/usePersistedCache";
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
import { PageSkeleton } from "@/components/common/PageSkeleton";
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
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { enhanceThumbnail } from "@/utils/enhanceThumbnail";
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
  app_uid: string | null;
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
  type WalletSnapshot = {
    diamondBalance: number;
    agencyDiamondBalance: number;
    helperWalletBalance: number;
    profileCoins: number;
    beansBalance: number;
  };
  const [walletCache, setWalletCache, hadWalletCache] = usePersistedCache<WalletSnapshot>("agentWallet:balances", null);
  const [transfersCache, setTransfersCache, hadTransfersCache] = usePersistedCache<TransferRecord[]>("agentWallet:transfers", []);
  const diamondBalance = walletCache?.diamondBalance ?? 0;
  const agencyDiamondBalance = walletCache?.agencyDiamondBalance ?? 0;
  const helperWalletBalance = walletCache?.helperWalletBalance ?? 0;
  const profileCoins = walletCache?.profileCoins ?? 0;
  const beansBalance = walletCache?.beansBalance ?? 0;
  const transfers = transfersCache ?? [];
  const setTransfers = (next: TransferRecord[]) => setTransfersCache(next);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showExchange, setShowExchange] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [exchangeAmount, setExchangeAmount] = useState("");
  const [userId, setUserId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [searchResults, setSearchResults] = useState<FoundUser[]>([]);
  const [isLoading, setIsLoading] = useState(!(hadWalletCache && hadTransfersCache));

  // Helper to refresh all tiered balances
  const refreshBalances = async (uid: string) => {
    const [agencyRes, helperRes, profileRes] = await Promise.all([
      supabase.from("agencies").select("diamond_balance, wallet_balance").eq("owner_id", uid).maybeSingle(),
      supabase.from("topup_helpers").select("wallet_balance").eq("user_id", uid).eq("is_verified", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("profiles").select("diamonds, beans").eq("id", uid).single(),
    ]);

    const agencyDiamonds = agencyRes.data?.diamond_balance || 0;
    const helperWallet = helperRes.data?.wallet_balance || 0;
    const userDiamonds = profileRes.data?.diamonds || 0;
    const userBeans = profileRes.data?.beans || 0;

    setWalletCache({
      diamondBalance: agencyDiamonds + helperWallet + userDiamonds,
      agencyDiamondBalance: agencyDiamonds,
      helperWalletBalance: helperWallet,
      profileCoins: userDiamonds,
      beansBalance: userBeans,
    });
  };

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      // Use getSession() — reads from local storage (0ms) instead of
      // getUser() which makes a network round-trip to validate the JWT
      // (200-600ms on 4G). Wallet cold-open was waiting on that RTT
      // before any balance query could start.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
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


    // Zero-refresh policy: no visibility/tab-return refetch. Wallet mutations
    // refresh balances inline, and push events update cross-screen state.
    return undefined;

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
      .rpc("search_user_by_id", { _search_id: userId.trim().toUpperCase() });

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
        description: "Minimum 10,000 Diamonds required",
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

    // Use tiered transfer RPC (agency → helper wallet → personal diamonds)
    const { data: result, error } = await supabase
      .rpc("helper_transfer_diamonds_to_user", {
        _sender_id: (await supabase.auth.getSession()).data.session?.user?.id,
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
    const { data: { session: refreshSession } } = await supabase.auth.getSession();
    const currentUser = refreshSession?.user ?? null;

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
    const { data: { session: exchSession } } = await supabase.auth.getSession();
    const user = exchSession?.user ?? null;

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
      description: `${amount.toLocaleString()} beans converted to ${diamondsReward.toLocaleString()} Diamonds`,
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
    return <PageSkeleton className="bg-background" rows={5} hero />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-20 bg-gradient-to-r from-success-500 to-success-600 text-on-dark safe-area-top shadow-md">
        <div className="flex items-center h-14 px-2">
          <button 
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="w-11 h-11 flex items-center justify-center hover:bg-white/10 active:bg-white/20 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-11">Agent Wallet</h1>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {/* Balance Cards */}
        <div className="mx-4 mt-4 space-y-3">
        {/* Diamonds Balance */}
        <div className="bg-gradient-to-br from-success-500 to-success-600 rounded-2xl p-5 text-on-dark shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-5 h-5" />
            <span className="text-heading text-sm">Diamond Balance</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{diamondBalance.toLocaleString()}</span>
            <span className="text-heading">Diamonds</span>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <Button 
              onClick={() => setShowTransfer(true)}
              aria-label="Send Diamonds"
              className="h-11 bg-white/20 hover:bg-white/30 active:bg-white/25 backdrop-blur-sm"
            >
              <Send className="w-4 h-4 mr-2" />
              Send Diamonds
            </Button>
            <Button 
              variant="outline"
              aria-label="Transfer history"
              className="h-11 border-warning-200/60 text-heading bg-transparent hover:bg-white/10 active:bg-white/20"
              onClick={() => navigate("/transfer-history")}
            >
              <History className="w-4 h-4 mr-2" />
              History
            </Button>
          </div>
        </div>

        {/* Beans/Income Balance */}
        <div className="bg-gradient-to-br from-warning-500 to-warning-500 rounded-2xl p-5 text-on-dark shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Gem className="w-5 h-5" />
            <span className="text-heading text-sm">Income Balance (Beans)</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{beansBalance.toLocaleString()}</span>
            <span className="text-heading">Beans</span>
          </div>
          <p className="text-body text-xs mt-1">Commission earnings from hosts</p>

          <Button 
            onClick={() => setShowExchange(true)}
            aria-label="Exchange beans to Diamonds"
            className="w-full h-11 mt-4 bg-white/20 hover:bg-white/30 active:bg-white/25 backdrop-blur-sm"
          >
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            Exchange to Diamonds
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mx-4 mt-4">
        <Tabs defaultValue="transfer" className="w-full">
          <TabsList className="w-full grid grid-cols-2 h-12 p-1">
            <TabsTrigger value="transfer" aria-label="Quick transfer" className="h-10 text-sm">Quick Transfer</TabsTrigger>
            <TabsTrigger value="exchange" aria-label="Quick exchange" className="h-10 text-sm">Quick Exchange</TabsTrigger>
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
                    className="p-3 rounded-xl border border-gray-100 hover:border-success-300 hover:bg-success-50 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-center gap-1 text-warning-500 font-bold">
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
                    className="p-3 rounded-xl border border-gray-100 hover:border-warning-300 hover:bg-warning-50 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-center gap-1 text-warning-600 font-bold">
                      <Gem className="w-4 h-4" />
                      <span>{amount.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-body mt-1">→ 🪙 {amount.toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Info Cards */}
      <div className="mx-4 mt-4 space-y-3">
        <div className="bg-info-50 rounded-2xl p-4 border border-info-100">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-info-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-info-800">Exchange Info</h4>
              <ul className="text-sm text-info-700 mt-1 space-y-1">
                <li>• 1 Bean = 1 Diamond (1:1 ratio)</li>
                <li>• Minimum exchange: 10,000 beans</li>
                <li>• Beans come from host commissions</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-success-50 rounded-2xl p-4 border border-success-100">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-success-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-success-800">Transfer Info</h4>
              <ul className="text-sm text-success-700 mt-1 space-y-1">
                <li>• Send Diamonds to users by their ID</li>
                <li>• Minimum transfer: 10,000 Diamonds</li>
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
            className="text-sm text-success-600 font-medium"
          >
            View All
          </button>
        </div>
        
        {transfers.length === 0 ? (
          <div className="text-center py-8 text-body">
            <Send className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>No transfers yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transfers.slice(0, 5).map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <AvatarWithFrame
                  src={enhanceThumbnail(tx.receiver_avatar || "", { width: 96, quality: 82})}
                  name={(tx as any)?.display_name || (tx as any)?.agency_name || (tx as any)?.name || tx.receiver_name || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    {tx.receiver_name || "Unknown User"}
                  </p>
                  <p className="text-xs text-body">{formatDate(tx.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm text-warning-600">
                    -{tx.amount.toLocaleString()}
                  </p>
                  <Badge variant="outline" className="text-[10px] text-success-600 border-success-200">
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
            <DrawerTitle>Send Diamonds to User</DrawerTitle>
          </DrawerHeader>

          <div className="p-4 space-y-4 overflow-y-auto">
            {/* Current Balance */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm text-body">Available Diamonds</p>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-warning-500">🪙</span>
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
                <p className="text-xs text-body px-3 py-2 bg-gray-50">Select a user:</p>
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-t transition-colors"
                  >
                <AvatarWithFrame
                  src={enhanceThumbnail(user.avatar_url || "", { width: 96, quality: 82})}
                  name={(user as any)?.display_name || (user as any)?.agency_name || (user as any)?.name || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm">
                        {user.display_name || user.username || "Unknown"}
                        {user.is_verified && (
                          <CheckCircle2 className="w-4 h-4 text-info-500 inline ml-1" />
                        )}
                      </p>
                      <p className="text-xs text-body truncate">UID: {user.app_uid || user.id.slice(0, 8)}</p>
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
              <div className="flex items-center gap-3 p-3 bg-success-50 border border-success-200 rounded-xl">
                <AvatarWithFrame
                  src={enhanceThumbnail(foundUser.avatar_url || "", { width: 96, quality: 82})}
                  name={(foundUser as any)?.display_name || (foundUser as any)?.agency_name || (foundUser as any)?.name || "U"}
                  level={1}
                  size="sm"
                  showFrame={true}
                  showAnimation={false}
                />
                <div className="flex-1">
                  <p className="font-semibold text-success-800">
                    {foundUser.display_name || foundUser.username || "Unknown"}
                  </p>
                  <p className="text-sm text-success-600">UID: {foundUser.app_uid || foundUser.id.slice(0, 8)}</p>
                </div>
                <CheckCircle2 className="w-6 h-6 text-success-600" />
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
                  className={transferAmount === amount.toString() ? "border-success-500 bg-success-50" : ""}
                  disabled={diamondBalance < amount}
                >
                  {i === 3 ? "All" : amount.toLocaleString()}
                </Button>
              ))}
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-warning-50 rounded-xl">
              <AlertCircle className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
              <p className="text-sm text-warning-800">
                Please verify the user ID before transferring. Diamonds sent to wrong ID cannot be recovered.
              </p>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleTransfer}
              disabled={isProcessing || !foundUser}
              className="w-full h-12 bg-gradient-to-r from-success-500 to-success-600 hover:from-success-600 hover:to-success-700"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </span>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Diamonds
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
            <DrawerTitle>Exchange Beans to Diamonds</DrawerTitle>
          </DrawerHeader>

          <div className="p-4 space-y-4">
            {/* Current Beans Balance */}
            <div className="bg-gradient-to-br from-warning-50 to-warning-50 rounded-xl p-4 border border-warning-200">
              <p className="text-sm text-warning-700">Available Beans</p>
              <div className="flex items-center gap-2 mt-1">
                <Gem className="w-6 h-6 text-warning-500" />
                <span className="font-bold text-2xl text-warning-700">{beansBalance.toLocaleString()}</span>
              </div>
              <p className="text-xs text-warning-600 mt-1">From host commissions</p>
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
                <div className="flex items-center gap-2 mt-2 p-2 bg-success-50 rounded-lg">
                  <span className="text-sm text-body">You will receive:</span>
                  <span className="text-warning-500">🪙</span>
                  <span className="font-bold text-success-600">
                    {parseInt(exchangeAmount).toLocaleString()} Diamonds
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
                  className={exchangeAmount === amount.toString() ? "border-warning-500 bg-warning-50" : ""}
                  disabled={beansBalance < amount}
                >
                  {i === 3 ? "All" : amount.toLocaleString()}
                </Button>
              ))}
            </div>

            {/* Exchange Rate Info */}
            <div className="flex items-start gap-2 p-3 bg-info-50 rounded-xl">
              <Info className="w-5 h-5 text-info-500 shrink-0 mt-0.5" />
              <div className="text-sm text-info-700">
                <p className="font-medium">Exchange Rate: 1:1</p>
                <p>1 Bean = 1 Diamond</p>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleExchange}
              disabled={isProcessing || !exchangeAmount || parseInt(exchangeAmount) < 10000}
              className="w-full h-12 bg-gradient-to-r from-warning-500 to-warning-500 hover:from-warning-600 hover:to-warning-600"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </span>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Exchange to Diamonds
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
