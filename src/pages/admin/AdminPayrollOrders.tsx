import ReportExportMenu from "@/components/admin/ReportExportMenu";
import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { ImageViewer, useImageViewer } from "@/components/ui/image-viewer";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SmartImage } from "@/components/ui/smart-image";
import { 
  ArrowLeft, Package, Clock, Check, X, Search, 
  Eye, RefreshCw, Globe, Image, ExternalLink, Copy,
  User, CreditCard, Calendar, Hash, AlertTriangle, Building2, Gem, DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import { adminSendNotification } from "@/utils/adminNotification";
import { recordAdminError } from "@/utils/adminErrorLog";
import { resolveAdminStorageImageUrl } from "@/utils/adminStorageImages";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
interface PaymentDetails {
  transaction_id?: string;
  method_type?: string;
  account_name?: string;
  account_number?: string;
  helper_transaction_id?: string;
  helper_payment_screenshot?: string;
  helper_notes?: string;
  helper_processed_at?: string;
  helper_payment_screenshot_signed?: string;
  // Fee details (admin only)
  withdrawal_fee_usd?: number;
  withdrawal_fee_beans?: number;
  withdrawal_fee_local?: number;
  fee_recipient?: string;
  // Net withdrawal amounts
  net_withdrawal_beans?: number;
  net_withdrawal_usd?: number;
  net_withdrawal_local?: number;
  // Other fields
  country_code?: string;
  currency_code?: string;
  local_amount?: number;
  exchange_rate?: number;
  usd_amount?: number;
}

interface PayrollOrder {
  id: string;
  helper_id: string;
  user_id: string;
  diamond_amount: number;
  amount_usd: number;
  amount_local: number;
  currency_code: string;
  payment_method: string;
  payment_details: PaymentDetails | null;
  user_country_code: string;
  user_payment_proof: string | null;
  status: string;
  helper_notes: string | null;
  created_at: string;
  processed_at: string | null;
  order_type: 'helper_order' | 'agency_withdrawal';
  user?: { display_name: string; avatar_url: string; app_uid: string; id: string };
  helper?: { 
    id: string;
    wallet_balance: number;
    total_sold: number;
    user: { display_name: string; avatar_url: string; app_uid: string; id: string } 
  };
  agency?: { name: string; agency_code: string; logo_url?: string; owner_id: string };
}

const COUNTRIES = [
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'US', name: 'USA', flag: '🇺🇸' },
];

const AdminPayrollOrders = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const imageViewer = useImageViewer();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("all");
  const [orders, setOrders] = useState<PayrollOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('order_id') || "");
  const [countryFilter, setCountryFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<PayrollOrder | null>(null);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [showProofImage, setShowProofImage] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    cancelled: 0,
    todayTotal: 0
  });

  useAdminRealtime(['helper_orders', 'agency_withdrawals'], () => fetchOrders());

  // Auto search if order_id is in URL
  useEffect(() => {
    const orderId = searchParams.get('order_id');
    if (orderId) {
      setSearchQuery(orderId);
    }
  }, [searchParams]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      // Fetch helper orders
      const { data: helperOrdersData, error: helperError } = await supabase
        .from('helper_orders')
        .select(`
          *,
          user:profiles!helper_orders_user_id_fkey(id, display_name, avatar_url, app_uid),
          helper:topup_helpers!helper_orders_helper_id_fkey(
            id,
            wallet_balance,
            total_sold,
            user:profiles!topup_helpers_user_id_fkey(id, display_name, avatar_url, app_uid)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (helperError) throw helperError;

      // Fetch agency withdrawals with status 'processing' (submitted by helper, waiting for admin)
      const { data: agencyWithdrawalsData, error: agencyError } = await supabase
        .from('agency_withdrawals')
        .select(`
          *,
          agency:agencies(name, agency_code, logo_url, owner_id),
          helper:topup_helpers!agency_withdrawals_assigned_helper_id_fkey(
            id,
            wallet_balance,
            total_sold,
            user:profiles!topup_helpers_user_id_fkey(id, display_name, avatar_url, app_uid)
          )
        `)
        .in('status', ['processing', 'approved', 'rejected'])
        .order('requested_at', { ascending: false })
        .limit(500);

      if (agencyError) throw agencyError;
      
      // Transform helper orders
      const helperOrders: PayrollOrder[] = await Promise.all((helperOrdersData || []).map(async (order) => {
        const paymentDetails = order.payment_details as PaymentDetails | null;
        const signedProof = await resolveAdminStorageImageUrl(order.user_payment_proof, 'payment-proofs');
        return {
          ...order,
          user_payment_proof: signedProof,
          order_type: 'helper_order' as const,
          payment_details: paymentDetails
        };
      }));

      // Transform agency withdrawals to match PayrollOrder interface
      const agencyOrders: PayrollOrder[] = await Promise.all((agencyWithdrawalsData || []).map(async (aw) => {
        const paymentDetails = (aw.payment_details as PaymentDetails | null) || null;
        const helperTransactionId = paymentDetails?.helper_transaction_id || null;
        const helperPaymentScreenshot = paymentDetails?.helper_payment_screenshot || null;
        const helperPaymentNotes = paymentDetails?.helper_notes || null;
        const signedProof = await resolveAdminStorageImageUrl(helperPaymentScreenshot, 'helper-screenshots');

        return {
          id: aw.id,
          helper_id: aw.assigned_helper_id || '',
          user_id: aw.agency?.owner_id || '',
          diamond_amount: aw.amount,
          amount_usd: aw.amount,
          amount_local: aw.local_currency_amount || aw.amount,
          currency_code: aw.currency_code || 'USD',
          payment_method: aw.payment_method || 'Agency Withdrawal',
          payment_details: paymentDetails ? { ...paymentDetails, helper_payment_screenshot_signed: signedProof || undefined } : null,
          user_country_code: aw.country_code || paymentDetails?.country_code || '',
          user_payment_proof: signedProof,
          status: aw.status,
          helper_notes: helperPaymentNotes,
          created_at: aw.requested_at,
          processed_at: aw.processed_at,
          order_type: 'agency_withdrawal' as const,
          helper: aw.helper,
          agency: aw.agency
        };
      }));

      // Combine and sort by date
      const allOrders = [...helperOrders, ...agencyOrders].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      setOrders(allOrders);

      // Pkg6: single server-side aggregation RPC (replaces 8 parallel COUNT queries)
      const { data: statsData } = await supabase.rpc('admin_payroll_orders_stats');
      const s = (statsData as any) || {};

      setStats({
        total: s.total || 0,
        pending: s.pending || 0,
        processing: s.processing || 0,
        completed: s.completed || 0,
        cancelled: s.cancelled || 0,
        todayTotal: s.todayTotal || 0
      });
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminPayrollOrders", message: formatAdminError(error)});
    } finally {
      setLoading(false);
    }
  };

  const getCountryFlag = (code: string) => {
    return COUNTRIES.find(c => c.code === code)?.flag || '🌍';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: text });
  };

  const handleProcessOrder = async (order: PayrollOrder, action: 'complete' | 'cancel') => {
    try {
      if (order.order_type === 'agency_withdrawal') {
        // Use the same RPC as AdminWithdrawals for consistent behavior
        const newStatus = action === 'complete' ? 'approved' : 'rejected';
        
        const { data, error } = await supabase.rpc("admin_process_withdrawal", {
          _withdrawal_id: order.id,
          _status: newStatus,
          _notes: null
        });

        if (error) throw error;
        const result = data as { success?: boolean; error?: string; message?: string } | null;
        if (result && result.success === false) {
          throw new Error(result.error || result.message || "Withdrawal processing failed");
        }

        // Send notification to agency owner (RPC only handles helper notifications)
        if (order.agency?.owner_id) {
          await adminSendNotification(order.agency.owner_id, action, action, action)
        }

      } else {
        // Handle regular helper orders
        const { data, error } = await supabase.rpc('process_helper_order_secure' as any, {
          _order_id: order.id,
          _action: action,
          _notes: `Processed from Admin Payroll Orders: ${action}`,
        });
        const result = data as any;
        if (error || !result?.success) {
          throw new Error(result?.error || error?.message || 'Failed to process helper order');
        }

        if (action === 'complete') {
          const diamondAmount = Number(result.creditedCoins || order.diamond_amount || 0);
          await adminSendNotification(order.user_id, '💎 Diamonds Added!', `Received ${diamondAmount.toLocaleString()} diamonds from ${order.helper?.user?.display_name || 'Payroll Helper'}!`, 'coin_purchase_helper')
        }
      }

      toast({ 
        title: "Success", 
        description: action === 'complete' ? 'Order completed' : 'Order cancelled' 
      });
      fetchOrders();
      setShowOrderDetail(false);
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesTab = activeTab === 'all' || 
      order.status === activeTab || 
      (activeTab === 'cancelled' && (order.status === 'failed' || order.status === 'rejected')) ||
      (activeTab === 'completed' && (order.status === 'completed' || order.status === 'approved'));
    const matchesSearch = !searchQuery || 
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.user?.app_uid?.includes(searchQuery) ||
      order.helper?.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.helper?.user?.app_uid?.includes(searchQuery) ||
      order.payment_details?.transaction_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.agency?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.agency?.agency_code?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCountry = countryFilter === 'all' || order.user_country_code === countryFilter;
    return matchesTab && matchesSearch && matchesCountry;
  });

  const getStatusBadge = (status: string, orderType: string) => {
    if (status === 'processing') {
      return <Badge className="bg-blue-100 text-blue-700">🔄 Processing</Badge>;
    }
    if (status === 'pending') {
      return <Badge className="bg-yellow-100 text-yellow-700">⏳ Pending</Badge>;
    }
    if (status === 'completed' || status === 'approved') {
      return <Badge className="bg-green-100 text-green-700">✅ Completed</Badge>;
    }
    return <Badge className="bg-red-100 text-red-700">❌ Cancelled</Badge>;
  };

  return (
    <>
    <div className="admin-pro-shell">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="text-slate-900 hover:bg-white/20" onClick={() => navigate('/admin/level5-helpers')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-bold text-xl text-slate-900">Payroll Orders History</h1>
            <p className="text-slate-700 text-sm">Complete payroll order history</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ReportExportMenu
              rows={orders as any}
              columns={[
                { key: "created_at", label: "Date", weight: 1.2, format: (v) => v ? new Date(String(v)).toLocaleString() : "—" },
                { key: "id", label: "Order ID", weight: 1.4 },
                { key: "user_id", label: "User", weight: 1.2, format: (_, r: any) => r.user?.display_name || r.user_id || "—" },
                { key: "helper_id", label: "Helper", weight: 1.2, format: (_, r: any) => r.helper?.user?.display_name || r.helper_id || "—" },
                { key: "amount", label: "Amount", weight: 1, format: (v) => v != null ? `$${Number(v).toFixed(2)}` : "—" },
                { key: "status", label: "Status", weight: 1 },
                { key: "user_country_code", label: "Country", weight: 0.7 },
              ]}
              meta={{
                title: "Payroll Orders Report",
                subtitle: `${orders.length} orders`,
                fileName: "payroll-orders",
                summary: [
                  { label: "Total", value: stats.total },
                  { label: "Completed", value: stats.completed },
                  { label: "Pending", value: stats.pending },
                  { label: "Today $", value: `$${stats.todayTotal.toFixed(0)}` },
                ],
              }}
            />
            <Button variant="ghost" size="icon" className="text-slate-900 hover:bg-white/20" onClick={fetchOrders}>
              <RefreshCw className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-6 gap-2">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-slate-700 text-xs">Total</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-yellow-200">{stats.pending}</p>
            <p className="text-slate-700 text-xs">Pending</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-200">{stats.processing}</p>
            <p className="text-slate-700 text-xs">Processing</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-200">{stats.completed}</p>
            <p className="text-slate-700 text-xs">Completed</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-red-200">{stats.cancelled}</p>
            <p className="text-slate-700 text-xs">Cancelled</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-slate-900">${stats.todayTotal.toFixed(0)}</p>
            <p className="text-slate-700 text-xs">Today</p>
          </div>
        </div>
      </div>

      {/* Search by Order ID */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-xl shadow-md p-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search by Order ID, User ID, Helper or Transaction ID..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                className="pl-10" 
              />
            </div>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-32">
                <Globe className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {COUNTRIES.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1 text-xs">All ({stats.total})</TabsTrigger>
              <TabsTrigger value="pending" className="flex-1 text-xs">Pending ({stats.pending})</TabsTrigger>
              <TabsTrigger value="processing" className="flex-1 text-xs">Processing ({stats.processing})</TabsTrigger>
              <TabsTrigger value="completed" className="flex-1 text-xs">Completed</TabsTrigger>
              <TabsTrigger value="cancelled" className="flex-1 text-xs">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Orders List */}
      <div className="px-4 mt-4 pb-20">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl">
            <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">No orders found</p>
            {searchQuery && (
              <p className="text-slate-400 text-sm mt-2">No orders matching "{searchQuery}"</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map(order => (
              <Card 
                key={order.id} 
                className={`overflow-hidden border-l-4 cursor-pointer hover:shadow-lg transition-shadow ${
                  order.status === 'pending' ? 'border-l-yellow-500' :
                  order.status === 'processing' ? 'border-l-blue-500' :
                  order.status === 'completed' || order.status === 'approved' ? 'border-l-green-500' : 'border-l-red-500'
                }`}
                onClick={() => { setSelectedOrder(order); setShowOrderDetail(true); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* User/Agency Avatar */}
                    <Avatar className="w-12 h-12">
                      {order.order_type === 'agency_withdrawal' ? (
                        <>
                          <UserAvatarImage src={order.agency?.logo_url} />
                          <AvatarFallback className="bg-purple-100">
                            <Building2 className="w-6 h-6 text-purple-600" />
                          </AvatarFallback>
                        </>
                      ) : (
                        <>
                          <UserAvatarImage seed={(((order.user) as any)?.id ?? ((order.user) as any)?.user_id ?? ((order.user) as any)?.host_id)} gender={((order.user) as any)?.gender} src={order.user?.avatar_url} />
                          <AvatarFallback>{order.user?.display_name?.charAt(0)}</AvatarFallback>
                        </>
                      )}
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {order.order_type === 'agency_withdrawal' ? (
                          <>
                            <h3 className="font-semibold truncate">{order.agency?.name}</h3>
                            <Badge className="bg-purple-100 text-purple-700 text-xs">
                              <Building2 className="w-3 h-3 mr-1" /> Agency
                            </Badge>
                          </>
                        ) : (
                          <h3 className="font-semibold truncate">{order.user?.display_name}</h3>
                        )}
                        {getStatusBadge(order.status, order.order_type)}
                        <span className="text-sm">{getCountryFlag(order.user_country_code)}</span>
                      </div>
                      
                      {/* Order ID */}
                      <div className="flex items-center gap-1 mt-1">
                        <Hash className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-500 font-mono">{order.id.slice(0, 8)}...</span>
                        {order.order_type === 'agency_withdrawal' && order.agency?.agency_code && (
                          <span className="text-xs bg-purple-50 text-purple-600 px-1 rounded">
                            {order.agency.agency_code}
                          </span>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-5 w-5" 
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(order.id); }}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-lg font-bold text-emerald-600">
                          {(order.diamond_amount ?? 0).toLocaleString()} {order.order_type === 'agency_withdrawal' ? 'Beans' : '💎'}
                        </span>
                        <span className="text-sm text-slate-600">
                          {order.currency_code === 'BDT' ? 'Tk ' : '$'}{(order.amount_local ?? 0).toFixed(0)}
                        </span>
                        <Badge variant="outline" className="text-xs">{order.payment_method}</Badge>
                        {order.user_payment_proof && (
                          <Badge className="bg-blue-100 text-blue-700 text-xs">
                            <Image className="w-3 h-3 mr-1" /> Screenshot
                          </Badge>
                        )}
                      </div>
                      
                      {/* Helper info */}
                      {order.helper?.user && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                          <span>Payroll Helper:</span>
                          <Avatar className="w-5 h-5">
                            <UserAvatarImage seed={(((order.helper?.user) as any)?.id ?? ((order.helper?.user) as any)?.user_id ?? ((order.helper?.user) as any)?.host_id)} gender={((order.helper?.user) as any)?.gender} src={order.helper?.user?.avatar_url} />
                            <AvatarFallback className="text-xs">{order.helper?.user?.display_name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{order.helper?.user?.display_name}</span>
                        </div>
                      )}
                      
                      <p className="text-xs text-slate-400 mt-1">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
                      </p>
                    </div>

                    {/* View Details */}
                    <Button variant="outline" size="sm" className="text-indigo-600 border-indigo-200">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={showOrderDetail} onOpenChange={setShowOrderDetail}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Order Details
            </DialogTitle>
            <DialogDescription>
              Complete order information and payment proof
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              {/* Order ID */}
              <div className="bg-slate-50 p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Order ID</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-slate-700 text-slate-200 px-2 py-1 rounded font-mono">
                      {selectedOrder.id}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(selectedOrder.id)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Status</span>
                {getStatusBadge(selectedOrder.status, selectedOrder.order_type)}
              </div>

              {/* Order Type Badge */}
              {selectedOrder.order_type === 'agency_withdrawal' && (
                <div className="bg-purple-500/10 p-3 rounded-lg border border-purple-500/30">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-purple-400" />
                    <div>
                      <p className="font-semibold text-purple-300">Agency Withdrawal</p>
                      <p className="text-sm text-purple-400">{selectedOrder.agency?.name} ({selectedOrder.agency?.agency_code})</p>
                    </div>
                  </div>
                </div>
              )}

              {/* User Info - Only for helper orders */}
              {selectedOrder.order_type === 'helper_order' && selectedOrder.user && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="w-4 h-4" /> User Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-12 h-12">
                        <UserAvatarImage seed={(((selectedOrder.user) as any)?.id ?? ((selectedOrder.user) as any)?.user_id ?? ((selectedOrder.user) as any)?.host_id)} gender={((selectedOrder.user) as any)?.gender} src={selectedOrder.user?.avatar_url} />
                        <AvatarFallback>{selectedOrder.user?.display_name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">{selectedOrder.user?.display_name}</p>
                        <p className="text-sm text-muted-foreground">ID: {selectedOrder.user?.app_uid}</p>
                        <p className="text-xs text-muted-foreground">{getCountryFlag(selectedOrder.user_country_code)} {selectedOrder.user_country_code}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Helper Info */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Payroll Helper Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <UserAvatarImage seed={(((selectedOrder.helper?.user) as any)?.id ?? ((selectedOrder.helper?.user) as any)?.user_id ?? ((selectedOrder.helper?.user) as any)?.host_id)} gender={((selectedOrder.helper?.user) as any)?.gender} src={selectedOrder.helper?.user?.avatar_url} />
                      <AvatarFallback>{selectedOrder.helper?.user?.display_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{selectedOrder.helper?.user?.display_name}</p>
                      <p className="text-sm text-muted-foreground">ID: {selectedOrder.helper?.user?.app_uid}</p>
                      <p className="text-xs text-muted-foreground">
                        Wallet: {selectedOrder.helper?.wallet_balance?.toLocaleString()} 💎 | 
                        Sold: {selectedOrder.helper?.total_sold?.toLocaleString()} 💎
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Details */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Payment Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Diamonds</p>
                      <p className="font-bold text-emerald-400 text-lg">{(selectedOrder.diamond_amount ?? 0).toLocaleString()} 💎</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Price</p>
                      <p className="font-bold">${(selectedOrder.amount_usd ?? 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Local Price</p>
                      <p className="font-semibold">
                        {selectedOrder.currency_code === 'BDT' ? 'Tk ' : selectedOrder.currency_code} 
                        {selectedOrder.amount_local.toFixed(0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Payment Method</p>
                      <p className="font-semibold">{selectedOrder.payment_method}</p>
                    </div>
                  </div>

                  {/* Transaction ID */}
                  {(selectedOrder.payment_details?.transaction_id || selectedOrder.payment_details?.helper_transaction_id) && (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Transaction ID</p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono flex-1 text-slate-200 break-all">
                          {selectedOrder.payment_details?.helper_transaction_id || selectedOrder.payment_details?.transaction_id}
                        </code>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(selectedOrder.payment_details?.helper_transaction_id || selectedOrder.payment_details?.transaction_id || '')}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Account Details */}
                  {selectedOrder.payment_details?.account_name && (
                    <div className="text-sm">
                      <p className="text-muted-foreground">Payment Account</p>
                      <p className="font-medium">{selectedOrder.payment_details.account_name}</p>
                      <p className="text-slate-300">{selectedOrder.payment_details.account_number}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Admin-Only: Withdrawal Fee Details */}
              {selectedOrder.order_type === 'agency_withdrawal' && selectedOrder.payment_details?.withdrawal_fee_usd && (
                <Card className="border-amber-500/30 bg-amber-500/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-amber-300">
                      <DollarSign className="w-4 h-4" /> Admin Fee (Admin Only)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-slate-50 rounded-lg p-3 border border-amber-500/20">
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Fee (USD)</p>
                          <p className="font-bold text-amber-400 text-lg">
                            ${selectedOrder.payment_details.withdrawal_fee_usd?.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Fee (Beans)</p>
                          <p className="font-bold text-amber-400 text-lg">
                            {selectedOrder.payment_details.withdrawal_fee_beans?.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Fee (Local)</p>
                          <p className="font-bold text-amber-400 text-lg">
                            {selectedOrder.payment_details.withdrawal_fee_local?.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 rounded-lg p-3 border border-green-500/20">
                      <p className="text-xs text-muted-foreground mb-1">Net Withdrawal (Payroll will pay)</p>
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-green-400 text-lg">
                          {selectedOrder.payment_details.net_withdrawal_beans?.toLocaleString()} Beans
                        </span>
                        <span className="text-green-400">
                          = ${selectedOrder.payment_details.net_withdrawal_usd?.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-amber-300 bg-amber-500/10 rounded p-2">
                      <strong>Note:</strong> This fee ({selectedOrder.payment_details.withdrawal_fee_beans?.toLocaleString()} Beans) 
                      has been deducted from the agency and is reserved for admin. Payroll staff cannot see or receive this fee.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment Screenshot */}
              {selectedOrder.user_payment_proof && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Image className="w-4 h-4" /> Payment Screenshot
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div 
                      className="relative rounded-lg overflow-hidden cursor-pointer group"
                      onClick={() => setShowProofImage(true)}
                    >
                      <SmartImage 
                        src={selectedOrder.user_payment_proof} 
                        alt="Payment Proof" 
                        className="w-full h-48 object-cover" fallbackSrc="/placeholder.svg" />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="w-8 h-8 text-slate-900" />
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2 w-full"
                      onClick={() => imageViewer.openImage(selectedOrder.user_payment_proof!)}
                    >
                      <Eye className="w-4 h-4 mr-2" /> View Full Size
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Timestamps */}
              <div className="text-sm space-y-2 bg-slate-50 p-3 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order Time</span>
                  <span>{format(new Date(selectedOrder.created_at), 'dd MMM yyyy, hh:mm:ss a')}</span>
                </div>
                {selectedOrder.processed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processed Time</span>
                    <span>{format(new Date(selectedOrder.processed_at), 'dd MMM yyyy, hh:mm:ss a')}</span>
                  </div>
                )}
              </div>

              {/* Helper Notes */}
              {selectedOrder.helper_notes && (
                <div className="bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/30">
                  <p className="text-sm text-yellow-300 font-medium mb-1">Helper Notes</p>
                  <p className="text-sm text-yellow-400">{selectedOrder.helper_notes}</p>
                </div>
              )}

              {/* Admin Actions for Pending/Processing Orders */}
              {(selectedOrder.status === 'pending' || selectedOrder.status === 'processing') && (
                <div className="flex gap-2 pt-2">
                  <Button 
                    className="flex-1 bg-green-500 hover:bg-green-600"
                    onClick={() => handleProcessOrder(selectedOrder, 'complete')}
                  >
                    <Check className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                    onClick={() => handleProcessOrder(selectedOrder, 'cancel')}
                  >
                    <X className="w-4 h-4 mr-2" /> Cancel
                  </Button>
                </div>
              )}

              {/* Diamond Reward Info for Agency Withdrawals */}
              {selectedOrder.order_type === 'agency_withdrawal' && selectedOrder.status === 'processing' && (
                <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/30">
                  <div className="flex items-center gap-2">
                    <Gem className="w-5 h-5 text-blue-400" />
                    <div className="text-sm text-blue-300">
                      <p className="font-medium">Upon approval, helper will receive</p>
                      <p>{Math.max(0, (selectedOrder.diamond_amount ?? 0) - 50000).toLocaleString()} 💎 Diamonds</p>
                      <p className="text-xs text-blue-400 mt-1">
                        (Total {(selectedOrder.diamond_amount ?? 0).toLocaleString()} - 50,000 system fee)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning for Complaints */}
              {(selectedOrder.status === 'completed' || selectedOrder.status === 'approved') && (
                <div className="bg-green-500/10 p-3 rounded-lg border border-green-500/30">
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5" />
                    <div className="text-sm text-green-300">
                      <p className="font-medium">This order is completed</p>
                      <p>If the user complains about this order, verify using the above information.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full Screen Image View */}
      <Dialog open={showProofImage} onOpenChange={setShowProofImage}>
        <DialogContent className="max-w-4xl p-0">
          {selectedOrder?.user_payment_proof && (
            <SmartImage 
              src={selectedOrder.user_payment_proof} 
              alt="Payment Proof Full" 
              className="w-full h-auto" fallbackSrc="/placeholder.svg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
      <ImageViewer src={imageViewer.viewerImage} open={imageViewer.isOpen} onClose={imageViewer.closeImage} alt="Payment Proof" />
    </>
  );
};

export default AdminPayrollOrders;
