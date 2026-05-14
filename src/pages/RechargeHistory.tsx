import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X, Clock, Diamond, Gem, Wallet, Receipt, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { recordClientError } from "@/utils/clientErrorLog";

 interface RechargeOrder {
  id: string;
  amount_usd?: number;
  coin_amount?: number;
  payment_method?: string;
  status: string;
  created_at: string;
  processed_at?: string | null;
  transaction_id?: string | null;
  payment_proof_url?: string | null;
  helper_id?: string;
  helper_name?: string | null;
  source?: 'helper_order' | 'google_play' | 'admin';
}

const RechargeHistory = () => {
  const navigate = useNavigate();
   const [rechargeOrders, setRechargeOrders] = useState<RechargeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "completed">("all");

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      setCurrentUserId(user.id);
       await fetchRechargeOrders(user.id);
    };
    
    init();
  }, [navigate]);

  // Real-time subscription for instant updates
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`recharge-history-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
           table: 'helper_orders',
          filter: `user_id=eq.${currentUserId}`
        },
        (payload) => {
           console.log('Helper order update:', payload);
           // Refetch to ensure data consistency
           fetchRechargeOrders(currentUserId);
        }
      )
      .subscribe((status) => {
        console.log('Recharge history subscription:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const fetchRechargeOrders = async (userId: string) => {
    try {
      // 1. Fetch helper orders
      const { data: helperOrders, error: helperError } = await supabase
        .from('helper_orders')
        .select(`
          id, coin_amount, amount_usd, amount_local, currency_code,
          payment_method, status, created_at, processed_at,
          user_payment_proof, helper_id
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (helperError) console.error('Error fetching helper orders:', helperError);

      // 2. Fetch Google Play / other recharge transactions
      const { data: rechargeTxns, error: rechargeError } = await supabase
        .from('recharge_transactions')
        .select(`
          id, coins_received, amount, payment_method, status,
          created_at, completed_at, transaction_id, purchase_source,
          google_order_id
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (rechargeError) console.error('Error fetching recharge transactions:', rechargeError);

      // 3. Fetch helper names via topup_helpers -> profiles
      const helperIds = [...new Set((helperOrders || []).filter(o => o.helper_id).map(o => o.helper_id!))];
      const helperNameMap = new Map<string, string>();

      if (helperIds.length > 0) {
        const { data: helpers } = await supabase
          .from('topup_helpers')
          .select('id, user_id')
          .in('id', helperIds);

        if (helpers && helpers.length > 0) {
          const { data: helperProfiles } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', helpers.map(h => h.user_id));

          const profileMap = new Map(helperProfiles?.map(p => [p.id, p.display_name]) || []);
          helpers.forEach(h => {
            helperNameMap.set(h.id, profileMap.get(h.user_id) || 'Helper');
          });
        }
      }

      // 4. Transform helper orders
      const fromHelpers: RechargeOrder[] = (helperOrders || []).map((order: any) => ({
        id: order.id,
        coin_amount: order.coin_amount,
        amount_usd: order.amount_usd,
        status: order.status === 'cancelled' ? 'rejected' : order.status,
        created_at: order.created_at,
        processed_at: order.processed_at,
        payment_proof_url: order.user_payment_proof,
        payment_method: order.payment_method || 'Helper',
        helper_id: order.helper_id,
        helper_name: order.helper_id ? helperNameMap.get(order.helper_id) || 'Helper' : null,
        source: 'helper_order' as const,
      }));

      // 5. Transform Google Play / gateway transactions
      const fromGoogle: RechargeOrder[] = (rechargeTxns || []).map((txn: any) => ({
        id: txn.id,
        coin_amount: txn.coins_received,
        amount_usd: txn.amount,
        status: txn.status,
        created_at: txn.created_at,
        processed_at: txn.completed_at,
        transaction_id: txn.google_order_id || txn.transaction_id,
        payment_method: txn.purchase_source === 'google_play' ? 'Google Play' : (txn.payment_method || 'Gateway'),
        source: 'google_play' as const,
      }));

      // 6. Merge & sort
      const allOrders = [...fromHelpers, ...fromGoogle].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setRechargeOrders(allOrders);
    } catch (error) {
      console.error('Error fetching recharge orders:', error);
      recordClientError({ label: "RechargeHistory.allOrders", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return <Check className="w-4 h-4" />;
      case 'rejected':
      case 'failed':
        return <X className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return 'bg-gradient-to-r from-green-500 to-emerald-500 text-white';
      case 'rejected':
      case 'failed':
        return 'bg-gradient-to-r from-red-500 to-rose-500 text-white';
      default:
        return 'bg-gradient-to-r from-amber-500 to-orange-500 text-white';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return 'Completed';
      case 'rejected':
        return 'Rejected';
      case 'failed':
        return 'Failed';
      case 'pending':
        return 'Pending';
      case 'processing':
        return 'Processing';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods: Record<string, string> = {
      'bkash': 'bKash',
      'nagad': 'Nagad',
      'rocket': 'Rocket',
      'card': 'Card',
      'google': 'Google Pay',
      'bank': 'Bank Transfer',
      'helper': 'Helper Wallet'
    };
    return methods[method?.toLowerCase()] || method || 'Unknown';
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method?.toLowerCase()) {
      case 'bkash':
        return '💳';
      case 'nagad':
        return '📱';
      case 'rocket':
        return '🚀';
      case 'bank':
        return '🏦';
      default:
        return '💰';
    }
  };

  // Filter requests based on active tab
   const filteredRequests = rechargeOrders.filter(req => {
    if (activeTab === "all") return true;
    if (activeTab === "pending") return ['pending', 'processing', 'gateway_pending'].includes(req.status);
    if (activeTab === "completed") return ['completed', 'approved', 'rejected', 'failed', 'cancelled'].includes(req.status);
    return true;
  });

   const pendingCount = rechargeOrders.filter(r => ['pending', 'processing', 'gateway_pending'].includes(r.status)).length;
   const completedCount = rechargeOrders.filter(r => ['completed', 'approved', 'rejected', 'failed', 'cancelled'].includes(r.status)).length;

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-amber-50 via-amber-50 to-orange-50 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-rose-500 pb-6">
        <header className="safe-area-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-white hover:bg-white/20"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold text-white">Recharge History</h1>
          </div>
        </header>

        {/* Stats Summary */}
        <div className="px-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-amber-200/60">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-300" />
                <span className="text-slate-600 text-xs">Pending</span>
              </div>
              <p className="text-2xl font-bold text-white">{pendingCount}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-amber-200/60">
              <div className="flex items-center gap-2 mb-1">
                <Check className="w-4 h-4 text-green-300" />
                <span className="text-slate-600 text-xs">Processed</span>
              </div>
              <p className="text-2xl font-bold text-white">{completedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 -mt-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="w-full bg-white/80 backdrop-blur-sm border border-amber-200/60 rounded-2xl p-1 h-auto">
            <TabsTrigger 
              value="all" 
              className="flex-1 rounded-xl py-2.5 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white"
            >
               All ({rechargeOrders.length})
            </TabsTrigger>
            <TabsTrigger 
              value="pending" 
              className="flex-1 rounded-xl py-2.5 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white"
            >
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger 
              value="completed" 
              className="flex-1 rounded-xl py-2.5 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white"
            >
              Done ({completedCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-full bg-white/80 flex items-center justify-center mb-4">
              <Receipt className="w-10 h-10 text-slate-500" />
            </div>
            <p className="text-slate-400 font-medium text-lg">No recharge history</p>
            <p className="text-slate-500 text-sm mt-1">Your transactions will appear here</p>
            <Button 
              className="mt-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-xl px-6 h-12"
              onClick={() => navigate('/recharge')}
            >
              <Gem className="w-5 h-5 mr-2" />
              Recharge Now
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((request, index) => (
              <div
                key={request.id}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-amber-200/60 hover:border-purple-500/30 transition-all duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center text-2xl">
                       {getPaymentMethodIcon(request.payment_method || '')}
                    </div>
                    <div>
                      <p className="font-bold text-white text-lg">
                        +{request.coin_amount?.toLocaleString() || 0} 
                        <span className="text-purple-400 ml-1">💎</span>
                      </p>
                      <p className="text-slate-400 text-sm">
                        {request.source === 'google_play' 
                          ? '🟢 Google Play' 
                          : request.helper_name 
                            ? `👤 ${request.helper_name}` 
                            : getPaymentMethodLabel(request.payment_method || '')}
                      </p>
                    </div>
                  </div>
                  <Badge className={cn("text-xs font-medium px-3 py-1 rounded-full", getStatusStyles(request.status))}>
                    {getStatusIcon(request.status)}
                    <span className="ml-1">{getStatusLabel(request.status)}</span>
                  </Badge>
                </div>

                <div className="mt-4 pt-3 border-t border-amber-200/60 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Calendar className="w-4 h-4" />
                    {formatDate(request.created_at)}
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
                      ${request.amount_usd?.toLocaleString() || 0}
                    </span>
                  </div>
                </div>

                {request.transaction_id && (
                  <div className="mt-2 text-xs text-slate-500">
                    TXN: {request.transaction_id}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default RechargeHistory;
