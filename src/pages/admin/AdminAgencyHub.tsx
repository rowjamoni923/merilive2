import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, FileText, Clock, History, Users, Crown, Star, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Import existing components as tab content
import AdminAgencies from "./AdminAgencies";
import AdminAgencyPolicy from "./AdminAgencyPolicy";
import AdminTransferScheduler from "./AdminTransferScheduler";
import AdminTransferHistory from "./AdminTransferHistory";
import AdminHelperManagement from "./AdminHelperManagement";
import AdminLevel5Helpers from "./AdminLevel5Helpers";

const AdminAgencyHub = () => {
  const [activeTab, setActiveTab] = useState("agencies");
  const [stats, setStats] = useState({
    totalAgencies: 0,
    activeAgencies: 0,
    totalHelpers: 0,
    level5Helpers: 0,
    inactiveAgencies: 0,
    pendingWithdrawals: 0
  });

  useAdminRealtime(['agencies', 'agency_earnings_transfers', 'agency_hosts', 'topup_helpers'], () => fetchStats());

  const fetchStats = async () => {
    try {
      const [agenciesRes, activeRes, inactiveRes, withdrawalRes] = await Promise.all([
        supabase.from('agencies').select('id', { count: 'exact', head: true }),
        supabase.from('agencies').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('agencies').select('id', { count: 'exact', head: true }).eq('is_active', false),
        supabase.from('agency_withdrawals').select('id', { count: 'exact', head: true }).in('status', ['pending', 'processing'])
      ]);

      const helpersQuery = supabase.from('topup_helpers' as any).select('*', { count: 'exact', head: true }).eq('is_active', true);
      const level5Query = supabase.from('topup_helpers' as any).select('*', { count: 'exact', head: true }).eq('trader_level', 5);
      
      const [helpersRes, level5Res] = await Promise.all([helpersQuery, level5Query]);

      setStats({
        totalAgencies: agenciesRes.count || 0,
        activeAgencies: activeRes.count || 0,
        totalHelpers: (helpersRes as any).count || 0,
        level5Helpers: (level5Res as any).count || 0,
        inactiveAgencies: inactiveRes.count || 0,
        pendingWithdrawals: withdrawalRes.count || 0
      });
    } catch (error) {
      console.error('Error fetching agency hub stats:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Agency Management Hub</h1>
            <p className="text-white/80">Agency, Helper & Commission Management</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4 text-center">
            <Building2 className="w-8 h-8 mx-auto mb-2 text-blue-400" />
            <p className="text-2xl font-bold text-foreground">{stats.totalAgencies}</p>
            <p className="text-xs text-muted-foreground">Total Agencies</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-2xl font-bold text-foreground">{stats.activeAgencies}</p>
            <p className="text-xs text-muted-foreground">Active Agencies</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4 text-center">
            <Crown className="w-8 h-8 mx-auto mb-2 text-purple-400" />
            <p className="text-2xl font-bold text-foreground">{stats.totalHelpers}</p>
            <p className="text-xs text-muted-foreground">Active Helpers</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4 text-center">
            <Star className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <p className="text-2xl font-bold text-foreground">{stats.level5Helpers}</p>
            <p className="text-xs text-muted-foreground">Level 5 Helpers</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto scrollbar-hide bg-slate-900/50 p-1 h-auto">
          <TabsTrigger 
            value="agencies" 
            className="min-w-fit data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-500 data-[state=active]:text-white py-3 text-xs px-4 relative"
          >
            <Building2 className="w-4 h-4 mr-1" />
            Agencies
            {stats.inactiveAgencies > 0 && (
              <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] h-5 min-w-5 flex items-center justify-center p-0">
                {stats.inactiveAgencies}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="helpers" 
            className="min-w-fit data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white py-3 text-xs px-4"
          >
            <Crown className="w-4 h-4 mr-1" />
            Helpers
          </TabsTrigger>
          <TabsTrigger 
            value="level5" 
            className="min-w-fit data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white py-3 text-xs px-4"
          >
            <Star className="w-4 h-4 mr-1" />
            Level 5
          </TabsTrigger>
          <TabsTrigger 
            value="policy" 
            className="min-w-fit data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-500 data-[state=active]:text-white py-3 text-xs px-4"
          >
            <FileText className="w-4 h-4 mr-1" />
            Policy
          </TabsTrigger>
          <TabsTrigger 
            value="scheduler" 
            className="min-w-fit data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white py-3 text-xs px-4"
          >
            <Clock className="w-4 h-4 mr-1" />
            Schedule
          </TabsTrigger>
          <TabsTrigger 
            value="history" 
            className="min-w-fit data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-rose-500 data-[state=active]:text-white py-3 text-xs px-4"
          >
            <History className="w-4 h-4 mr-1" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agencies" className="mt-0">
          <AdminAgencies />
        </TabsContent>

        <TabsContent value="helpers" className="mt-0">
          <AdminHelperManagement />
        </TabsContent>

        <TabsContent value="level5" className="mt-0">
          <AdminLevel5Helpers />
        </TabsContent>

        <TabsContent value="policy" className="mt-0">
          <AdminAgencyPolicy />
        </TabsContent>

        <TabsContent value="scheduler" className="mt-0">
          <AdminTransferScheduler />
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <AdminTransferHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAgencyHub;
