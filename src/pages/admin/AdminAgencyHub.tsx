import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, FileText, Users, Crown, Star, Clock, History, ExternalLink } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

import { formatAdminError } from "@/utils/formatAdminError";
// Agency Hub now owns ONLY agency-specific sections (Agencies + Policy).
// Helper Management, Level 5 Helpers → Trader Hub
// Transfer Scheduler, Transfer History → Finance Hub
// Cross-hub links are surfaced as quick-access buttons below.
import AdminAgencies from "./AdminAgencies";
import AdminAgencyPolicy from "./AdminAgencyPolicy";
import { recordAdminError } from "@/utils/adminErrorLog";

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

  useAdminRealtime(['agencies', 'agency_earnings_transfers', 'agency_hosts', 'topup_helpers'], () => fetchStats());

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Pkg6: single server-side aggregation RPC
      const { data, error } = await supabase.rpc('admin_agency_overview_stats');
      if (error) throw error;
      const s = (data as any) || {};
      setStats({
        totalAgencies: s.totalAgencies || 0,
        activeAgencies: s.activeAgencies || 0,
        totalHelpers: s.totalHelpers || 0,
        level5Helpers: s.level5Helpers || 0,
        inactiveAgencies: s.inactiveAgencies || 0,
        pendingWithdrawals: s.pendingWithdrawals || 0
      });
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminAgencyHub.ErrorFetchingAgencyHubStats", message: formatAdminError(error)});
    }
  };

  return (
    <div className="admin-pro-shell space-y-6">
      {/* Cloud White Header */}
      <div className="flex items-center gap-3 bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
          <Building2 className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Agency Management Hub</h1>
          <p className="text-xs md:text-sm text-slate-500 font-medium">Agencies &amp; policy management</p>
        </div>
      </div>

      {/* Cloud White Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "Total Agencies", value: stats.totalAgencies, Icon: Building2, tint: "bg-blue-50 border-blue-100 text-blue-600" },
          { label: "Active Agencies", value: stats.activeAgencies, Icon: Users, tint: "bg-emerald-50 border-emerald-100 text-emerald-600" },
          { label: "Active Helpers", value: stats.totalHelpers, Icon: Crown, tint: "bg-violet-50 border-violet-100 text-violet-600" },
          { label: "Level 5 Helpers", value: stats.level5Helpers, Icon: Star, tint: "bg-amber-50 border-amber-100 text-amber-600" },
        ].map(({ label, value, Icon, tint }) => (
          <Card key={label} className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 text-center">
              <div className={`w-10 h-10 mx-auto mb-2 rounded-xl border flex items-center justify-center ${tint}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-[11px] md:text-xs font-semibold uppercase tracking-wide text-slate-500 mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Cross-Hub Links (single source of truth) */}
      <Card className="admin-surface/40 admin-border/50">
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
        <TabsList className="flex w-full overflow-x-auto scrollbar-hide admin-surface/50 p-1 h-auto">
          <TabsTrigger 
            value="agencies" 
            className="min-w-fit data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-500 data-[state=active]:text-white py-3 text-xs px-4 relative"
          >
            <Building2 className="w-4 h-4 mr-1" />
            Agencies
            {stats.inactiveAgencies > 0 && (
              <Badge className="absolute -top-1 -right-1 admin-bg-danger text-white text-[10px] h-5 min-w-5 flex items-center justify-center p-0">
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
