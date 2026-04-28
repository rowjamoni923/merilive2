import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Package, Clock, Check, X, Search, 
  Eye, MessageCircle, Filter, RefreshCw, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import { adminSendNotification } from "@/utils/adminNotification";

interface HelperOrder {
  id: string;
  helper_id: string;
  user_id: string;
  coin_amount: number;
  amount_usd: number;
  amount_local: number;
  currency_code: string;
  payment_method: string;
  user_country_code: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  user?: { display_name: string; avatar_url: string; app_uid: string };
  helper?: { 
    id: string;
    user: { display_name: string; avatar_url: string; app_uid: string } 
  };
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

const AdminTraderOrders = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("pending");
  const [orders, setOrders] = useState<HelperOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<HelperOrder | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    todayTotal: 0
  });

  useAdminRealtime(['helper_orders'], () => fetchOrders());

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('helper_orders')
        .select(`
          *,
          user:profiles!helper_orders_user_id_fkey(display_name, avatar_url, app_uid),
          helper:topup_helpers!helper_orders_helper_id_fkey(
            id,
            user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setOrders(data || []);

      // Calculate stats
      const today = new Date().toDateString();
      const todayOrders = (data || []).filter(o => new Date(o.created_at).toDateString() === today);
      
      setStats({
        total: (data || []).length,
        pending: (data || []).filter(o => o.status === 'pending').length,
        completed: (data || []).filter(o => o.status === 'completed').length,
        cancelled: (data || []).filter(o => o.status === 'cancelled').length,
        todayTotal: todayOrders.reduce((sum, o) => sum + o.amount_usd, 0)
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessOrder = async (order: HelperOrder, action: 'complete' | 'cancel') => {
    try {
      // Update order status
      const { error } = await supabase
        .from('helper_orders')
        .update({ 
          status: action === 'complete' ? 'completed' : 'cancelled',
          processed_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;

      // If completing, add coins to user and deduct from helper
      if (action === 'complete') {
         // Add coins to user using atomic RPC function (bypasses RLS safely)
         const { error: rpcError } = await supabase.rpc('add_coins_to_user', {
           _user_id: order.user_id,
           _amount: order.coin_amount
         });
         
         if (rpcError) {
           console.error('RPC Error:', rpcError);
           throw new Error('Failed to add coins to user');
         }

        // Get current helper data with user info
        const { data: helperData } = await supabase
          .from('topup_helpers')
          .select('wallet_balance, total_sold, user:user_id(display_name, avatar_url)')
          .eq('id', order.helper_id)
          .single();

        await supabase
          .from('topup_helpers')
          .update({ 
            wallet_balance: (helperData?.wallet_balance || 0) - order.coin_amount,
            total_sold: (helperData?.total_sold || 0) + order.coin_amount
          })
          .eq('id', order.helper_id);

        // Send notification to user
        const coinAmount = order.coin_amount;
        const formattedAmount = coinAmount >= 100000 
          ? `${(coinAmount / 100000).toFixed(1)}L` 
        : coinAmount.toLocaleString();
        
        const helperUser = helperData?.user as any;
        await adminSendNotification(order.user_id, '💎 Diamonds Added!', `Received ${formattedAmount} diamonds from ${helperUser?.display_name || 'Diamond Trader'}!`, 'coin_purchase_helper')
      }

      toast({ 
        title: "Success", 
        description: action === 'complete' ? 'Order completed' : 'Order cancelled' 
      });
      fetchOrders();
      setSelectedOrder(null);
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    }
  };

  const getCountryFlag = (code: string) => {
    return COUNTRIES.find(c => c.code === code)?.flag || '🌍';
  };

  const filteredOrders = orders.filter(order => {
    const matchesTab = activeTab === 'all' || order.status === activeTab;
    const matchesSearch = !searchQuery || 
      order.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.user?.app_uid?.includes(searchQuery) ||
      (order.helper as any)?.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCountry = countryFilter === 'all' || order.user_country_code === countryFilter;
    return matchesTab && matchesSearch && matchesCountry;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate('/admin/coin-traders')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-bold text-xl text-white">Trader Orders</h1>
            <p className="text-white/80 text-sm">Manage all diamond orders</p>
          </div>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 ml-auto" onClick={fetchOrders}>
            <RefreshCw className="w-5 h-5" />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-2">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{stats.total}</p>
            <p className="text-white/80 text-xs">Total</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-yellow-200">{stats.pending}</p>
            <p className="text-white/80 text-xs">Pending</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-200">{stats.completed}</p>
            <p className="text-white/80 text-xs">Completed</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-red-200">{stats.cancelled}</p>
            <p className="text-white/80 text-xs">Cancelled</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">${stats.todayTotal.toFixed(0)}</p>
            <p className="text-white/80 text-xs">Today</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-xl shadow-md p-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search user or helper..." 
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
              <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
              <TabsTrigger value="pending" className="flex-1">Pending ({stats.pending})</TabsTrigger>
              <TabsTrigger value="completed" className="flex-1">Completed</TabsTrigger>
              <TabsTrigger value="cancelled" className="flex-1">Cancelled</TabsTrigger>
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
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map(order => (
              <Card key={order.id} className={`overflow-hidden border-l-4 ${
                order.status === 'pending' ? 'border-l-yellow-500' :
                order.status === 'completed' ? 'border-l-green-500' : 'border-l-red-500'
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* User */}
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={order.user?.avatar_url} />
                      <AvatarFallback>{order.user?.display_name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{order.user?.display_name}</h3>
                        <Badge className={`text-xs ${
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          order.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {order.status === 'pending' ? 'Pending' : 
                           order.status === 'completed' ? 'Completed' : 'Cancelled'}
                        </Badge>
                        <span className="text-sm">{getCountryFlag(order.user_country_code)}</span>
                      </div>
                      
                      <p className="text-sm text-slate-500">ID: {order.user?.app_uid}</p>
                      
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-lg font-bold text-emerald-600">{order.coin_amount.toLocaleString()} 💎</span>
                        <span className="text-sm text-slate-600">
                          {order.currency_code === 'BDT' ? '৳' : '$'}{order.amount_local.toFixed(0)}
                        </span>
                        <Badge variant="outline" className="text-xs">{order.payment_method}</Badge>
                      </div>
                      
                      {/* Helper info */}
                      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                        <span>Helper:</span>
                        <Avatar className="w-5 h-5">
                          <AvatarImage src={(order.helper as any)?.user?.avatar_url} />
                          <AvatarFallback className="text-xs">{(order.helper as any)?.user?.display_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span>{(order.helper as any)?.user?.display_name}</span>
                      </div>
                      
                      <p className="text-xs text-slate-400 mt-1">
                        {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
                      </p>
                    </div>

                    {/* Actions */}
                    {order.status === 'pending' && (
                      <div className="flex flex-col gap-1">
                        <Button 
                          size="sm"
                          className="bg-green-500 hover:bg-green-600"
                          onClick={() => handleProcessOrder(order, 'complete')}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200"
                          onClick={() => handleProcessOrder(order, 'cancel')}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminTraderOrders;