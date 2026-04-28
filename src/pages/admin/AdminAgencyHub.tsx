import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, FileText, Users, Crown, Star, Clock, History, ExternalLink } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

// Agency Hub now owns ONLY agency-specific sections (Agencies + Policy).
// Helper Management, Level 5 Helpers → Trader Hub
// Transfer Scheduler, Transfer History → Finance Hub
// Cross-hub links are surfaced as quick-access buttons below.
import AdminAgencies from "./AdminAgencies";
import AdminAgencyPolicy from "./AdminAgencyPolicy";

const AdminAgencyHub = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("agencies");
  const [stats, setStats] = useState({
    totalAgencies: 0,
    activeAgencies: 0,
    totalHelpers: 0,
    level5Helpers: 0,
    inactiveAgencies: 0,
    pendingWithdrawals: 0
  });

  useAdminRealtime(['agencies', 'agency_earnings_transfers', 'agency_hosts', 'topup_helpers'], () => fetchStats(), { enableRealtimeRefresh: true });

  useEffect(() => {
    fetchStats();
  }, []);

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
            <p className="text-white/80">Agencies & Policy Management</p>
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

      {/* Quick Cross-Hub Links (single source of truth) */}
      <Card className="bg-slate-900/40 border-slate-700/50">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Related Sections (managed in other hubs)</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/helper-management')}>
              <Crown className="w-4 h-4 mr-2" /> Helpers <ExternalLink className="w-3 h-3 ml-2 opacity-60" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/level5-helpers')}>
              <Star className="w-4 h-4 mr-2" /> Level 5 Helpers <ExternalLink className="w-3 h-3 ml-2 opacity-60" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/transfer-scheduler')}>
              <Clock className="w-4 h-4 mr-2" /> Transfer Scheduler <ExternalLink className="w-3 h-3 ml-2 opacity-60" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/transfer-history')}>
              <History className="w-4 h-4 mr-2" /> Transfer History <ExternalLink className="w-3 h-3 ml-2 opacity-60" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs — agency-specific only */}
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
            value="policy" 
            className="min-w-fit data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-500 data-[state=active]:text-white py-3 text-xs px-4"
          >
            <FileText className="w-4 h-4 mr-1" />
            Policy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agencies" className="mt-0">
          <AdminAgencies />
        </TabsContent>

        <TabsContent value="policy" className="mt-0">
          <AdminAgencyPolicy />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAgencyHub;
