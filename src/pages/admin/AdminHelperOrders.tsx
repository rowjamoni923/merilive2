import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { SmartImage } from "@/components/ui/smart-image";
import { 
  ArrowLeft, 
  Search, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  User,
  Package,
  Calendar,
  Eye,
  RefreshCw,
  Filter,
  MoreVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import { UserAvatarImage } from "@/components/admin/UserAvatarImage";
interface HelperOrder {
  id: string;
  helper_id: string;
  user_id: string;
  diamond_amount: number;
  amount_usd: number;
  amount_local: number;
  currency_code: string;
  payment_method: string;
  status: string;
  user_payment_proof: string | null;
  helper_notes: string | null;
  processed_at: string | null;
  created_at: string;
  user_country_code: string | null;
  helper?: {
    wallet_balance: number;
    user?: {
      display_name: string;
      avatar_url: string;
      app_uid: string;
    };
  };
  };
}

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-yellow-500 bg-yellow-500/10", label: "Pending" },
  processing: { icon: RefreshCw, color: "text-blue-500 bg-blue-500/10", label: "Processing" },
  completed: { icon: CheckCircle, color: "text-green-500 bg-green-500/10", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-500 bg-red-500/10", label: "Failed" },
  cancelled: { icon: XCircle, color: "text-gray-500 bg-gray-500/10", label: "Cancelled" },
  unpaid: { icon: AlertTriangle, color: "text-orange-500 bg-orange-500/10", label: "Unpaid" },
};

const AdminHelperOrders = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orders, setOrders] = useState<HelperOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<HelperOrder | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);

  useAdminRealtime(['helper_orders'], () => fetchOrders());

  useEffect(() => {
    void fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('helper_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const helperIds = [...new Set((data || []).map((order: any) => order.helper_id).filter(Boolean))];
      const customerIds = [...new Set((data || []).map((order: any) => order.user_id || order.customer_id).filter(Boolean))];

      let helperMap = new Map<string, any>();
      let profileMap = new Map<string, any>();

      if (helperIds.length > 0) {
        const { data: helpers, error: helpersError } = await supabase
          .from('topup_helpers')
          .select('id, user_id, wallet_balance')
          .in('id', helperIds);

        if (helpersError) throw helpersError;
        (helpers || []).forEach((helper) => helperMap.set(helper.id, helper));
      }

      const profileIds = [...new Set([
        ...customerIds,
        ...Array.from(helperMap.values()).map((helper: any) => helper.user_id).filter(Boolean),
      ])];

      if (profileIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, app_uid')
          .in('id', profileIds);

        if (profilesError) throw profilesError;
        (profiles || []).forEach((profile) => profileMap.set(profile.id, profile));
      }

      const normalizedOrders = (data || []).map((order: any) => {
        const helper = helperMap.get(order.helper_id);
        const customerId = order.user_id || order.customer_id;

        return {
          ...order,
          user: customerId ? profileMap.get(customerId) || null : null,
          helper: helper
            ? {
                ...helper,
              }
            : null,
        };
      });

      setOrders(normalizedOrders as HelperOrder[]);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHelperOrders.ErrorFetchingOrders", message: formatAdminError(error)});
      toast({
        title: "Error",
        description: "Failed to load orders",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('helper_orders')
        .update({ 
          status: newStatus,
          processed_at: newStatus === 'completed' || newStatus === 'failed' ? new Date().toISOString() : null
        })
        .eq('id', orderId);

      if (error) throw error;

      toast({
      });
      fetchOrders();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHelperOrders.ErrorUpdatingOrder", message: formatAdminError(error)});
      toast({
      });
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.user?.app_uid?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.helper?.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = selectedStatus === "all" || order.status === selectedStatus;
    
    return matchesSearch && matchesStatus;
  });

  const unpaidCount = orders.filter(o => o.status === 'pending' || o.status === 'unpaid').length;
  const failedCount = orders.filter(o => o.status === 'failed').length;

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={cn("gap-1", config.color)}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="admin-pro-shell">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Helper Orders</h1>
            <p className="text-xs text-muted-foreground">Track order payments and helper performance</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Alert Badges */}
        {(unpaidCount > 0 || failedCount > 0) && (
          <div className="flex gap-2 flex-wrap">
            {unpaidCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span className="text-sm text-orange-500 font-medium">{unpaidCount} Pending/Unpaid</span>
              </div>
            )}
            {failedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-500 font-medium">{failedCount} Failed</span>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders..."
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="w-4 h-4" />
          </Button>
        </div>

        {/* Status Tabs */}
        <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
          <TabsList className="w-full md:grid md:grid-cols-5 h-auto inline-flex md:inline-grid overflow-x-auto whitespace-nowrap">
            <TabsTrigger value="all" className="text-xs py-2">All</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs py-2">Pending</TabsTrigger>
            <TabsTrigger value="processing" className="text-xs py-2">Processing</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs py-2">Completed</TabsTrigger>
            <TabsTrigger value="failed" className="text-xs py-2">Failed</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Orders List */}
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No orders found</p>
              </div>
            ) : (
              filteredOrders.map((order) => (
                <div key={order.id} className="bg-card border rounded-xl p-4 space-y-3">
                  {/* Order Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        #{order.id.slice(0, 8)}
                      </span>
                      {getStatusBadge(order.status)}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setSelectedOrder(order);
                          setShowOrderModal(true);
                        }}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateOrderStatus(order.id, 'completed')}>
                          <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                          Mark Completed
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateOrderStatus(order.id, 'failed')}>
                          <XCircle className="w-4 h-4 mr-2 text-red-500" />
                          Mark Failed
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateOrderStatus(order.id, 'unpaid')}>
                          <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" />
                          Mark Unpaid
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* User & Helper Info */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <UserAvatarImage seed={(((order.user) as any)?.id ?? ((order.user) as any)?.user_id ?? ((order.user) as any)?.host_id)} gender={((order.user) as any)?.gender} src={order.user?.avatar_url} />
                        <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{order.user?.display_name || 'User'}</p>
                        <p className="text-xs text-muted-foreground">Buyer</p>
                      </div>
                    </div>

                    <div className="text-muted-foreground">→</div>

                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <UserAvatarImage seed={(((order.helper?.user) as any)?.id ?? ((order.helper?.user) as any)?.user_id ?? ((order.helper?.user) as any)?.host_id)} gender={((order.helper?.user) as any)?.gender} src={order.helper?.user?.avatar_url} />
                        <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                      </Avatar>
                      <div className="text-right">
                        <p className="text-sm font-medium">{order.helper?.user?.display_name || 'Helper'}</p>
                        <p className="text-xs text-muted-foreground">Helper</p>
                      </div>
                    </div>
                  </div>

                  {/* Order Details */}
                  <div className="grid grid-cols-3 gap-2 text-center bg-muted/30 rounded-lg p-2">
                    <div>
                      <p className="text-lg font-bold text-primary">{(order.diamond_amount ?? 0).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Diamonds</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">
                        {order.currency_code === 'BDT' ? 'Tk ' : '$'}
                        {order.amount_local?.toLocaleString() || order.amount_usd}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{order.currency_code || 'USD'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{order.payment_method || 'N/A'}</p>
                      <p className="text-[10px] text-muted-foreground">Method</p>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Order Detail Modal */}
      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="max-w-md w-screen sm:w-auto h-[100dvh] sm:h-auto rounded-none sm:rounded-lg max-h-[100dvh] sm:max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Order ID</p>
                  <p className="font-mono text-xs">{selectedOrder.id.slice(0, 16)}...</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getStatusBadge(selectedOrder.status)}
                </div>
                <div>
                  <p className="text-muted-foreground">Diamonds</p>
                  <p className="font-bold">{(selectedOrder.diamond_amount ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-bold">
                    {selectedOrder.currency_code === 'BDT' ? 'Tk ' : '$'}
                    {selectedOrder.amount_local?.toLocaleString() || selectedOrder.amount_usd}
                  </p>
                </div>
              </div>

              {selectedOrder.user_payment_proof && (
                <div>
                  <p className="text-muted-foreground text-sm mb-2">Payment Proof</p>
                  <SmartImage 
                    src={selectedOrder.user_payment_proof} 
                    alt="Payment proof"
                    className="w-full rounded-lg border" fallbackSrc="/placeholder.svg" />
                </div>
              )}

              {selectedOrder.helper_notes && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Helper Notes</p>
                  <p className="text-sm bg-muted p-2 rounded">{selectedOrder.helper_notes}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    updateOrderStatus(selectedOrder.id, 'completed');
                    setShowOrderModal(false);
                  }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Complete
                </Button>
                <Button
                  className="flex-1"
                  variant="destructive"
                  onClick={() => {
                    updateOrderStatus(selectedOrder.id, 'failed');
                    setShowOrderModal(false);
                  }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Mark Failed
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminHelperOrders;
