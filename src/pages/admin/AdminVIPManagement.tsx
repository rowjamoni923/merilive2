import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, Medal, CreditCard, Gem, Sparkles } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

// Import existing components as tab content
import AdminVIPPrivileges from "./AdminVIPPrivileges";
import AdminVIPMedals from "./AdminVIPMedals";
import AdminNobleCards from "./AdminNobleCards";

const AdminVIPManagement = () => {
  const [activeTab, setActiveTab] = useState("tiers");
  const [stats, setStats] = useState({
    vipTiers: 0,
    medals: 0,
    nobleCards: 0,
    activeVIPs: 0
  });

  useAdminRealtime(['vip_tiers', 'level_privileges'], () => fetchStats());

  const fetchStats = async () => {
    const [tiersRes, medalsRes, cardsRes] = await Promise.all([
      supabase.from('vip_tiers').select('id', { count: 'exact' }),
      supabase.from('level_privileges').select('id', { count: 'exact' }).eq('privilege_type', 'vip_medal'),
      supabase.from('level_privileges').select('id', { count: 'exact' }).eq('privilege_type', 'noble_card')
    ]);

    // Fetch active VIP users count
    let activeVIPsCount = 0;
    try {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).gt('vip_tier', 0);
      activeVIPsCount = count || 0;
    } catch (e) { /* column might not exist */ }

    setStats({
      vipTiers: tiersRes.count || 0,
      medals: medalsRes.count || 0,
      nobleCards: cardsRes.count || 0,
      activeVIPs: activeVIPsCount
    });
  };

  return (
    <div className="admin-pro-shell space-y-6">
      {/* Header — Cloud White */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
            <Crown className="w-7 h-7 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">VIP & Noble System</h1>
            <p className="text-sm text-slate-500">Manage VIP tiers, medals, and noble cards in one place</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Crown, label: 'VIP Tiers', value: stats.vipTiers, tint: 'bg-amber-50 border-amber-100 text-amber-600' },
          { icon: Medal, label: 'VIP Medals', value: stats.medals, tint: 'bg-violet-50 border-violet-100 text-violet-600' },
          { icon: CreditCard, label: 'Noble Cards', value: stats.nobleCards, tint: 'bg-rose-50 border-rose-100 text-rose-600' },
        ].map(({ icon: Icon, label, value, tint }) => (
          <Card key={label} className="border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_3px_rgba(15,23,42,0.06)]">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${tint}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-slate-100 border border-slate-200 p-1 h-auto">
          <TabsTrigger value="tiers" className="data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm text-slate-600 py-2.5">
            <Crown className="w-4 h-4 mr-2" />VIP Tiers
          </TabsTrigger>
          <TabsTrigger value="medals" className="data-[state=active]:bg-white data-[state=active]:text-violet-600 data-[state=active]:shadow-sm text-slate-600 py-2.5">
            <Medal className="w-4 h-4 mr-2" />VIP Medals
          </TabsTrigger>
          <TabsTrigger value="cards" className="data-[state=active]:bg-white data-[state=active]:text-rose-600 data-[state=active]:shadow-sm text-slate-600 py-2.5">
            <CreditCard className="w-4 h-4 mr-2" />Noble Cards
          </TabsTrigger>
        </TabsList>


        <TabsContent value="tiers" className="mt-0">
          <AdminVIPPrivileges />
        </TabsContent>

        <TabsContent value="medals" className="mt-0">
          <AdminVIPMedals />
        </TabsContent>

        <TabsContent value="cards" className="mt-0">
          <AdminNobleCards />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminVIPManagement;
