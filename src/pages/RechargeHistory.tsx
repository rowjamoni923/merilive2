import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X, Clock, Diamond, Gem, Wallet, Receipt, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/utils";
import { recordClientError } from "@/utils/clientErrorLog";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";
import { usePersistedCache } from "@/hooks/usePersistedCache";

 interface RechargeOrder {
  id: string;
  amount_usd?: number;
  diamond_amount?: number;
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
  const [ordersCache, setRechargeOrders, hadOrdersCache] = usePersistedCache<RechargeOrder[]>('rechargeHist:orders', null);
  const rechargeOrders = ordersCache ?? [];
  const [loading, setLoading] = useState(!hadOrdersCache);
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

  useAppSyncEvent(['helper_orders'], () => {
    if (currentUserId) void fetchRechargeOrders(currentUserId);
  }, Boolean(currentUserId));

  const fetchRechargeOrders = async (userId: string) => {
    try {
      if (!ordersCache) setLoading(true);
      // 1. Fetch helper orders
      const { data: helperOrders, error: helperError } = await supabase
        .from('helper_orders')
        .select(`
          id, diamond_amount, amount_usd, amount_local, currency_code,
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
          id, diamonds_received, amount, payment_method, status,
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
            .from('profiles_public')
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
        diamond_amount: order.diamond_amount,
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
        diamond_amount: txn.diamonds_received,
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
        return 'bg-gradient-to-r from-green-500 to-emerald-500 text-slate-800';
      case 'rejected':
      case 'failed':
        return 'bg-gradient-to-r from-red-500 to-rose-500 text-slate-800';
      default:
        return 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-800';
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
      {/* Premium 3D Gradient Header */}
      <div
        className="relative bg-gradient-to-br from-purple-600 via-fuchsia-600 to-rose-500 pb-7 overflow-hidden"
        style={{ boxShadow: '0 10px 28px -16px rgba(168,85,247,0.55)' }}
      >
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-pink-300/25 blur-3xl pointer-events-none" />

        <header className="relative safe-area-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-white bg-white/20 hover:bg-white/30 active:scale-95 hover:-translate-y-0.5 transition-all border border-white/25 w-10 h-10"
              style={{ boxShadow: '0 6px 16px -8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.35)' }}
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-5 h-5" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }} />
            </Button>
            <h1 className="text-xl font-bold text-white" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.35)' }}>Recharge History</h1>
          </div>
        </header>

        {/* 3D Stats Summary */}
        <div className="relative px-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div
              className="relative bg-gradient-to-br from-white/30 via-white/20 to-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/30 overflow-hidden"
              style={{ boxShadow: '0 10px 24px -12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)' }}
            >
              <div className="absolute -top-8 -right-8 w-20 h-20 rounded-full bg-amber-300/30 blur-2xl pointer-events-none" />
              <div className="relative flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-amber-400/30 border border-amber-200/40 flex items-center justify-center" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }}>
                  <Clock className="w-4 h-4 text-amber-100" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }} />
                </div>
                <span className="text-white/85 text-xs font-semibold uppercase tracking-wider" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>Pending</span>
              </div>
              <p className="relative text-3xl font-extrabold text-white" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.35)' }}>{pendingCount}</p>
            </div>
            <div
              className="relative bg-gradient-to-br from-white/30 via-white/20 to-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/30 overflow-hidden"
              style={{ boxShadow: '0 10px 24px -12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)' }}
            >
              <div className="absolute -top-8 -right-8 w-20 h-20 rounded-full bg-emerald-300/30 blur-2xl pointer-events-none" />
              <div className="relative flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-emerald-400/30 border border-emerald-200/40 flex items-center justify-center" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }}>
                  <Check className="w-4 h-4 text-emerald-100" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }} />
                </div>
                <span className="text-white/85 text-xs font-semibold uppercase tracking-wider" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>Processed</span>
              </div>
              <p className="relative text-3xl font-extrabold text-white" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.35)' }}>{completedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sunken Tab Track */}
      <div className="px-4 -mt-3 relative z-10">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList
            className="w-full bg-white border border-amber-200/60 rounded-2xl p-1 h-auto"
            style={{ boxShadow: '0 10px 24px -14px rgba(15,23,42,0.22), inset 0 2px 4px rgba(15,23,42,0.06)' }}
          >
            <TabsTrigger
              value="all"
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-[0_6px_16px_-6px_rgba(168,85,247,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]"
            >
              All ({rechargeOrders.length})
            </TabsTrigger>
            <TabsTrigger
              value="pending"
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-[0_6px_16px_-6px_rgba(245,158,11,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]"
            >
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-[0_6px_16px_-6px_rgba(16,185,129,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]"
            >
              Done ({completedCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
        {loading ? (
          <div className="space-y-3 py-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>

        ) : filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-pink-500/20 blur-2xl scale-125" />
              <div
                className="relative w-24 h-24 rounded-full bg-gradient-to-br from-white to-amber-50 border border-amber-200/70 flex items-center justify-center"
                style={{ boxShadow: '0 12px 28px -12px rgba(168,85,247,0.35), inset 0 2px 0 rgba(255,255,255,0.9), inset 0 -2px 6px rgba(168,85,247,0.08)' }}
              >
                <Receipt className="w-10 h-10 text-purple-500" style={{ filter: 'drop-shadow(0 2px 4px rgba(168,85,247,0.35))' }} />
              </div>
            </div>
            <p className="text-slate-700 font-bold text-lg">No recharge history</p>
            <p className="text-slate-500 text-sm mt-1">Your transactions will appear here</p>
            <Button
              className="mt-6 bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 text-white rounded-2xl px-6 h-12 font-semibold active:scale-95 hover:-translate-y-0.5 transition-all"
              style={{ boxShadow: '0 10px 24px -10px rgba(168,85,247,0.6), inset 0 1px 0 rgba(255,255,255,0.35)' }}
              onClick={() => navigate('/recharge')}
            >
              <Gem className="w-5 h-5 mr-2" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
              Recharge Now
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((request, index) => (
              <div
                key={request.id}
                className="relative bg-white rounded-2xl p-4 border border-amber-200/60 hover:border-purple-400/40 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                style={{ boxShadow: '0 8px 22px -14px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.9)', animationDelay: `${index * 50}ms` }}
              >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/40 to-transparent" />
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-100 via-pink-50 to-white border border-purple-200/60 flex items-center justify-center text-2xl"
                      style={{ boxShadow: '0 6px 16px -8px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -2px 4px rgba(168,85,247,0.08)' }}
                    >
                      {getPaymentMethodIcon(request.payment_method || '')}
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-800 text-lg leading-tight">
                        +{request.diamond_amount?.toLocaleString() || 0}
                        <span className="text-purple-500 ml-1">💎</span>
                      </p>
                      <p className="text-slate-500 text-sm font-medium">
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
