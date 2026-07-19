import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Coins, Users, Package, Activity, CreditCard, Wallet, DollarSign, Settings, Phone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

// Import existing components
import AdminCoinTraders from "./AdminCoinTraders";
import AdminTraderOrders from "./AdminTraderOrders";
import AdminTraderTransactions from "./AdminTraderTransactions";
import AdminTopupPaymentMethods from "./AdminTopupPaymentMethods";
import AdminManualTopup from "./AdminManualTopup";
import AdminCoins from "./AdminCoins";
import AdminTopupSystem from "./AdminTopupSystem";
import AdminPaymentGateways from "./AdminPaymentGateways";
import AdminHelperPaymentMethods from "@/components/admin/AdminHelperPaymentMethods";
 import AdminUserBeansExchange from "./AdminUserBeansExchange";

/**
 * UNIFIED DIAMOND TRADER HUB
 * 
 * Consolidates all diamond/trader related admin pages:
 * - Diamond Traders (helper management)
 * - Trader Orders (user purchase orders)
 * - Trader Transactions (all transactions)
 * - Payment Methods (topup payment options)
 * - Manual Topup (admin diamond addition)
 * 
 * Single Source of Truth: Edit here = Updates everywhere
 */
export default function AdminDiamondTraderHub() {
  const [activeTab, setActiveTab] = useState("traders");
  const [stats, setStats] = useState({
    activeHelpers: 0,
    pendingOrders: 0,
    todayTransactions: 0,
    paymentMethods: 0,
    helperPaymentMethods: 0
  });

  useAdminRealtime(['topup_helpers', 'helper_orders', 'helper_transactions', 'topup_payment_methods'], () => fetchStats());

  const fetchStats = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    const [helpersRes, ordersRes, txnRes, methodsRes, helperMethodsRes] = await Promise.all([
      supabase.from('topup_helpers').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('is_verified', true),
      supabase.from('helper_orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('helper_transactions').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('topup_payment_methods').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('helper_country_payment_methods').select('id', { count: 'exact', head: true }).eq('is_active', true)
    ]);

    setStats({
      activeHelpers: helpersRes.count || 0,
      pendingOrders: ordersRes.count || 0,
      todayTransactions: txnRes.count || 0,
      paymentMethods: methodsRes.count || 0,
      helperPaymentMethods: helperMethodsRes.count || 0
    });
  };

  return (
    <div className="admin-pro-shell space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
            <Coins className="w-6 h-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Diamond Trader Hub</h1>
            <p className="text-slate-400 text-sm">
              Manage traders, orders, transactions & payment methods
            </p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-white/50 border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Users className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Active Helpers</p>
              <p className="text-slate-900 font-bold text-xl">{stats.activeHelpers}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white/50 border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Package className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Pending Orders</p>
              <p className="text-slate-900 font-bold text-xl">{stats.pendingOrders}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white/50 border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Today's Txns</p>
              <p className="text-slate-900 font-bold text-xl">{stats.todayTransactions}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white/50 border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <CreditCard className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Payment Methods</p>
              <p className="text-slate-900 font-bold text-xl">{stats.paymentMethods}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white/80 border border-slate-200 p-1 h-auto flex-wrap">
          <TabsTrigger 
            value="traders" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white gap-2"
          >
            <Users className="w-4 h-4" />
            Diamond Traders
          </TabsTrigger>
          <TabsTrigger 
            value="orders" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-500 data-[state=active]:to-amber-500 data-[state=active]:text-white gap-2"
          >
            <Package className="w-4 h-4" />
            Orders
            {stats.pendingOrders > 0 && (
              <Badge className="bg-yellow-500/30 text-yellow-300 ml-1">{stats.pendingOrders}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="transactions" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-500 data-[state=active]:text-white gap-2"
          >
            <Activity className="w-4 h-4" />
            Transactions
          </TabsTrigger>
          <TabsTrigger 
            value="payment-methods" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-violet-500 data-[state=active]:text-white gap-2"
          >
            <CreditCard className="w-4 h-4" />
            Payment Methods
          </TabsTrigger>
          <TabsTrigger 
            value="manual-topup" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-500 data-[state=active]:text-white gap-2"
          >
            <Wallet className="w-4 h-4" />
            Manual Topup
          </TabsTrigger>
          <TabsTrigger 
            value="coin-packages" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-500 data-[state=active]:text-white gap-2"
          >
            <Coins className="w-4 h-4" />
            Packages
          </TabsTrigger>
          <TabsTrigger 
            value="topup-system" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-green-500 data-[state=active]:text-white gap-2"
          >
            <DollarSign className="w-4 h-4" />
            Topup Sys
          </TabsTrigger>
          <TabsTrigger 
            value="gateways" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-rose-500 data-[state=active]:text-white gap-2"
          >
            <Settings className="w-4 h-4" />
            Gateways
          </TabsTrigger>
          <TabsTrigger 
            value="helper-methods" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-teal-500 data-[state=active]:text-white gap-2"
          >
            <Phone className="w-4 h-4" />
            L5 Methods
            {stats.helperPaymentMethods > 0 && (
              <Badge className="bg-cyan-500/30 text-cyan-300 ml-1">{stats.helperPaymentMethods}</Badge>
            )}
          </TabsTrigger>
           <TabsTrigger 
             value="user-exchange" 
             className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white gap-2"
           >
             <Coins className="w-4 h-4" />
             User Exchange
           </TabsTrigger>
        </TabsList>

        <TabsContent value="traders" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <Users className="w-5 h-5 text-green-400" />
                Diamond Traders
                <Badge variant="outline" className="ml-2 text-green-400 border-green-500/50">
                  Helper Management
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminCoinTraders />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <Package className="w-5 h-5 text-yellow-400" />
                Trader Orders
                <Badge variant="outline" className="ml-2 text-yellow-400 border-yellow-500/50">
                  Purchase Orders
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminTraderOrders />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <Activity className="w-5 h-5 text-blue-400" />
                Trader Transactions
                <Badge variant="outline" className="ml-2 text-blue-400 border-blue-500/50">
                  All Activity
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminTraderTransactions />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment-methods" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <CreditCard className="w-5 h-5 text-purple-400" />
                Payment Methods
                <Badge variant="outline" className="ml-2 text-purple-400 border-purple-500/50">
                  Topup Options
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminTopupPaymentMethods />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual-topup" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <Wallet className="w-5 h-5 text-orange-400" />
                Manual Topup
                <Badge variant="outline" className="ml-2 text-orange-400 border-orange-500/50">
                  Admin Action
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminManualTopup />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coin-packages" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <Coins className="w-5 h-5 text-cyan-400" />
                Diamond Packages
                <Badge variant="outline" className="ml-2 text-cyan-400 border-cyan-500/50">
                  Pricing
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminCoins />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="topup-system" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <DollarSign className="w-5 h-5 text-teal-400" />
                Top-up System
                <Badge variant="outline" className="ml-2 text-teal-400 border-teal-500/50">
                  Management
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminTopupSystem />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gateways" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <Settings className="w-5 h-5 text-pink-400" />
                Payment Gateways
                <Badge variant="outline" className="ml-2 text-pink-400 border-pink-500/50">
                  Config
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminPaymentGateways />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="helper-methods" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <Phone className="w-5 h-5 text-cyan-400" />
                Level 5 Helper Payment Methods
                <Badge variant="outline" className="ml-2 text-cyan-400 border-cyan-500/50">
                  Recharge Panel
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminHelperPaymentMethods />
            </CardContent>
          </Card>
        </TabsContent>
 
         <TabsContent value="user-exchange" className="mt-0">
           <Card className="bg-white/30 border-slate-200">
             <CardHeader className="pb-2">
               <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                 <Coins className="w-5 h-5 text-amber-400" />
                 User Beans Exchange Rates
                 <Badge variant="outline" className="ml-2 text-amber-400 border-amber-500/50">
                   Regular Users
                 </Badge>
               </CardTitle>
             </CardHeader>
             <CardContent className="p-0">
               <AdminUserBeansExchange />
             </CardContent>
           </Card>
         </TabsContent>
      </Tabs>
    </div>
  );
}
