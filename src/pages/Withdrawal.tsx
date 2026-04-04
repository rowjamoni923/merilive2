import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Coins, Wallet, CheckCircle, AlertCircle, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WithdrawalHistory {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  payment_method: string;
}

const Withdrawal = () => {
  const navigate = useNavigate();
  const [beans, setBeans] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bkash");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<WithdrawalHistory[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Conversion rate: 100 beans = 1 BDT
  const BEANS_TO_BDT_RATE = 100;
  const MIN_WITHDRAWAL = 1000; // Minimum 1000 beans

  useEffect(() => {
    fetchData();
    
    // Real-time subscription for withdrawals
    const withdrawalChannel = supabase
      .channel('withdrawal-realtime-sync')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'coin_transfers' 
      }, () => {
        console.log('[Withdrawal] Transfers updated - refetching');
        fetchData();
      })
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'gift_transactions' 
      }, () => {
        console.log('[Withdrawal] Gifts updated - refetching');
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(withdrawalChannel);
    };
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setUserId(user.id);

    // Fetch beans (total earnings from gifts received)
    const { data: earnings } = await supabase
      .from("gift_transactions")
      .select("coin_amount")
      .eq("receiver_id", user.id);

    const totalBeans = earnings?.reduce((sum, e) => sum + e.coin_amount, 0) || 0;
    
    // Subtract already withdrawn beans (would need a withdrawals table)
    // For now, we'll track this via total_earnings in profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("total_earnings")
      .eq("id", user.id)
      .single();

    // Available beans = total received - total withdrawn (stored in total_earnings for now)
    setBeans(totalBeans);

    // Fetch withdrawal history (simulated from coin_transfers for now)
    const { data: transfers } = await supabase
      .from("coin_transfers")
      .select("*")
      .eq("sender_id", user.id)
      .eq("sender_type", "withdrawal")
      .order("created_at", { ascending: false })
      .limit(10);

    if (transfers) {
      setHistory(transfers.map(t => ({
        id: t.id,
        amount: t.amount,
        status: t.status,
        created_at: t.created_at,
        payment_method: t.note || "bkash"
      })));
    }
  };

  const handleWithdraw = async () => {
    const amount = parseInt(withdrawAmount);

    if (!amount || amount < MIN_WITHDRAWAL) {
      toast.error(`Minimum ${MIN_WITHDRAWAL} beans required for withdrawal`);
      return;
    }

    if (amount > beans) {
      toast.error("Insufficient beans");
      return;
    }

    if (!accountNumber.trim()) {
      toast.error("Please enter account number");
      return;
    }

    if (!accountName.trim()) {
      toast.error("Please enter account name");
      return;
    }

    setLoading(true);

    try {
      // Record withdrawal request
      const { error } = await supabase.from("coin_transfers").insert({
        sender_id: userId,
        receiver_id: userId, // Self for withdrawal
        amount: amount,
        sender_type: "withdrawal",
        status: "pending",
        note: `${paymentMethod}|${accountNumber}|${accountName}`
      });

      if (error) throw error;

      // Update local state
      setBeans(prev => prev - amount);
      setWithdrawAmount("");
      setAccountNumber("");
      setAccountName("");

      toast.success(`${amount} beans withdrawal request submitted!`);
      
      // Refresh history
      const { data: transfers } = await supabase
        .from("coin_transfers")
        .select("*")
        .eq("sender_id", userId)
        .eq("sender_type", "withdrawal")
        .order("created_at", { ascending: false })
        .limit(10);

      if (transfers) {
        setHistory(transfers.map(t => ({
          id: t.id,
          amount: t.amount,
          status: t.status,
          created_at: t.created_at,
          payment_method: t.note?.split("|")[0] || "bkash"
        })));
      }
    } catch (error) {
      console.error("Withdrawal error:", error);
      toast.error("Withdrawal failed");
    } finally {
      setLoading(false);
    }
  };

  const bdtAmount = Math.floor(parseInt(withdrawAmount || "0") / BEANS_TO_BDT_RATE);

  const paymentMethods = [
    { id: "bkash", name: "bKash", icon: "📱", color: "from-pink-500 to-pink-600" },
    { id: "nagad", name: "Nagad", icon: "💳", color: "from-orange-500 to-orange-600" },
    { id: "rocket", name: "Rocket", icon: "🚀", color: "from-purple-500 to-purple-600" },
    { id: "bank", name: "Bank", icon: "🏦", color: "from-blue-500 to-blue-600" },
  ];

  const quickAmounts = [1000, 2000, 5000, 10000, 20000];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500"><Clock className="w-3 h-3 mr-1" /> Processing</Badge>;
      case "failed":
        return <Badge className="bg-red-500"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-amber-100 via-amber-50 to-background overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4 safe-area-top">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Beans Withdrawal</h1>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
      {/* Balance Card */}
      <div className="px-4 -mt-2">
        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white p-6 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm opacity-80">Available Beans</p>
              <p className="text-3xl font-bold">{beans.toLocaleString()}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/20">
            <p className="text-sm opacity-80">
              ≈ ৳{(beans / BEANS_TO_BDT_RATE).toLocaleString()} BDT
            </p>
            <p className="text-xs opacity-60 mt-1">
              Rate: {BEANS_TO_BDT_RATE} beans = 1 BDT
            </p>
          </div>
        </Card>
      </div>

      {/* Withdrawal Form */}
      <div className="px-4 mt-6 space-y-4">
        <h2 className="font-semibold text-lg">Withdraw</h2>

        {/* Amount Input */}
        <div className="space-y-2">
          <Label>Beans Amount</Label>
          <div className="relative">
            <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-500" />
            <Input
              type="number"
              placeholder="Enter beans amount"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="pl-10 text-lg h-12"
            />
          </div>
          {withdrawAmount && (
            <p className="text-sm text-muted-foreground">
              = ৳{bdtAmount.toLocaleString()} BDT
            </p>
          )}
        </div>

        {/* Quick Amount Buttons */}
        <div className="flex flex-wrap gap-2">
          {quickAmounts.map((amount) => (
            <Button
              key={amount}
              variant={withdrawAmount === amount.toString() ? "default" : "outline"}
              size="sm"
              onClick={() => setWithdrawAmount(amount.toString())}
              className={withdrawAmount === amount.toString() ? "bg-amber-500 hover:bg-amber-600" : ""}
            >
              {amount.toLocaleString()}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWithdrawAmount(beans.toString())}
          >
            All
          </Button>
        </div>

        {/* Payment Method */}
        <div className="space-y-2">
          <Label>Payment Method</Label>
          <div className="grid grid-cols-4 gap-2">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => setPaymentMethod(method.id)}
                className={`p-3 rounded-xl border-2 transition-all ${
                  paymentMethod === method.id
                    ? "border-amber-500 bg-amber-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <span className="text-2xl block text-center">{method.icon}</span>
                <span className="text-xs block text-center mt-1">{method.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Account Details */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Account Number</Label>
            <Input
              placeholder="01XXXXXXXXX"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Account Name</Label>
            <Input
              placeholder="Enter name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>
        </div>

        {/* Submit Button */}
        <Button
          className="w-full h-12 bg-gradient-to-r from-amber-500 to-amber-600 text-lg font-semibold"
          onClick={handleWithdraw}
          disabled={loading || !withdrawAmount || parseInt(withdrawAmount) < MIN_WITHDRAWAL}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Withdraw
            </span>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Minimum {MIN_WITHDRAWAL.toLocaleString()} beans required for withdrawal
        </p>
      </div>

      {/* Withdrawal History */}
      {history.length > 0 && (
        <div className="px-4 mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">Withdrawal History</h2>
          </div>

          <div className="space-y-2">
            {history.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                      <Coins className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold">{item.amount.toLocaleString()} Beans</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString("en-US")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(item.status)}
                    <p className="text-xs text-muted-foreground mt-1 capitalize">
                      {item.payment_method}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="px-4 mt-6">
        <Card className="p-4 bg-amber-50 border-amber-200">
          <h3 className="font-semibold text-amber-800 mb-2">📌 Important Information</h3>
          <ul className="text-sm text-amber-700 space-y-1">
            <li>• Withdrawal processing may take 24-48 hours</li>
            <li>• Please enter correct account number</li>
            <li>• Minimum {MIN_WITHDRAWAL.toLocaleString()} beans can be withdrawn</li>
            <li>• No charges per transaction</li>
          </ul>
        </Card>
      </div>
      </div>
    </div>
  );
};

export default Withdrawal;
