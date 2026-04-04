import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, ArrowUpDown, CreditCard, History, Calculator, Minus, DollarSign, Globe, MessageCircle, Globe2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Import existing components as tab content
import AdminCommissions from "./AdminCommissions";
import AdminWithdrawals from "./AdminWithdrawals";
import AdminPayrollOrders from "./AdminPayrollOrders";
import AdminTransferHistory from "./AdminTransferHistory";
import AdminBalanceDeduction from "./AdminBalanceDeduction";
import AdminCommissionCalculator from "./AdminCommissionCalculator";
import AdminCoins from "./AdminCoins";
import AdminHelperMessaging from "@/components/admin/AdminHelperMessaging";
import AdminEpayWithdrawals from "@/components/admin/AdminEpayWithdrawals";

const AdminFinance = () => {
  const [activeTab, setActiveTab] = useState("commissions");
  const [stats, setStats] = useState({
    pendingWithdrawals: 0,
    pendingPayroll: 0,
    todayTransfers: 0,
    totalDeductions: 0,
    pendingEpay: 0
  });

  useAdminRealtime(['agency_withdrawals', 'coin_transfers', 'payroll_requests'], () => fetchStats());

  const fetchStats = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    const [withdrawalsRes, transfersRes, epayRes] = await Promise.all([
      supabase.from('agency_withdrawals').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('coin_transfers').select('id', { count: 'exact' }).gte('created_at', today),
      supabase.from('agency_withdrawals').select('id', { count: 'exact' }).eq('status', 'pending').eq('payment_method', 'epay')
    ]);

    setStats({
      pendingWithdrawals: withdrawalsRes.count || 0,
      pendingPayroll: 0,
      todayTransfers: transfersRes.count || 0,
      totalDeductions: 0,
      pendingEpay: epayRes.count || 0
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-500 via-green-500 to-teal-600 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
            <DollarSign className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Finance Management</h1>
            <p className="text-white/80">Unified control for all financial operations</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-orange-500/10 to-amber-600/5 border-orange-500/20">
          <CardContent className="p-4 text-center">
            <Wallet className="w-8 h-8 mx-auto mb-2 text-orange-400" />
            <p className="text-2xl font-bold text-foreground">{stats.pendingWithdrawals}</p>
            <p className="text-xs text-muted-foreground">Pending Withdrawals</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-600/5 border-blue-500/20">
          <CardContent className="p-4 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-2 text-blue-400" />
            <p className="text-2xl font-bold text-foreground">{stats.pendingPayroll}</p>
            <p className="text-xs text-muted-foreground">Pending Payroll</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-600/5 border-green-500/20">
          <CardContent className="p-4 text-center">
            <ArrowUpDown className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-2xl font-bold text-foreground">{stats.todayTransfers}</p>
            <p className="text-xs text-muted-foreground">Today's Transfers</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-violet-600/5 border-purple-500/20">
          <CardContent className="p-4 text-center">
            <Calculator className="w-8 h-8 mx-auto mb-2 text-purple-400" />
            <p className="text-2xl font-bold text-foreground">{stats.pendingEpay}</p>
            <p className="text-xs text-muted-foreground">ePay Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8 bg-slate-900/50 p-1 h-auto">
          <TabsTrigger 
            value="commissions" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white py-2 text-xs"
          >
            <Calculator className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Commission</span>
          </TabsTrigger>
          <TabsTrigger 
            value="withdrawals" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-amber-500 data-[state=active]:text-black py-2 text-xs"
          >
            <Wallet className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Withdraw</span>
          </TabsTrigger>
          <TabsTrigger 
            value="payroll" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white py-2 text-xs"
          >
            <CreditCard className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Payroll</span>
          </TabsTrigger>
          <TabsTrigger 
            value="transfers" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white py-2 text-xs"
          >
            <History className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Transfers</span>
          </TabsTrigger>
          <TabsTrigger 
            value="currency" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-violet-500 data-[state=active]:text-white py-2 text-xs"
          >
            <Globe className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Currency</span>
          </TabsTrigger>
          <TabsTrigger 
            value="calculator" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-500 data-[state=active]:text-white py-2 text-xs"
          >
            <Calculator className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Calculator</span>
          </TabsTrigger>
          <TabsTrigger 
            value="deduction" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-rose-500 data-[state=active]:text-white py-2 text-xs"
          >
            <Minus className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Deduction</span>
          </TabsTrigger>
          <TabsTrigger 
            value="messaging" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white py-2 text-xs"
          >
            <MessageCircle className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">Helpers</span>
          </TabsTrigger>
          <TabsTrigger 
            value="epay" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-500 data-[state=active]:text-white py-2 text-xs relative"
          >
            <Globe2 className="w-4 h-4 mr-1" />
            <span className="hidden md:inline">ePay</span>
            {stats.pendingEpay > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center animate-pulse">
                {stats.pendingEpay}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="commissions" className="mt-0">
          <AdminCommissions />
        </TabsContent>

        <TabsContent value="withdrawals" className="mt-0">
          <AdminWithdrawals />
        </TabsContent>

        <TabsContent value="payroll" className="mt-0">
          <AdminPayrollOrders />
        </TabsContent>

        <TabsContent value="transfers" className="mt-0">
          <AdminTransferHistory />
        </TabsContent>

        <TabsContent value="currency" className="mt-0">
          <AdminCoins />
        </TabsContent>

        <TabsContent value="calculator" className="mt-0">
          <AdminCommissionCalculator />
        </TabsContent>

        <TabsContent value="deduction" className="mt-0">
          <AdminBalanceDeduction />
        </TabsContent>

        <TabsContent value="messaging" className="mt-0">
          <AdminHelperMessaging />
        </TabsContent>

        <TabsContent value="epay" className="mt-0">
          <AdminEpayWithdrawals />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminFinance;
