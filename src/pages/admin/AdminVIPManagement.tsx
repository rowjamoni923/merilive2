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
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">VIP & Noble System</h1>
            <p className="text-white/80">Manage VIP tiers, medals, and noble cards in one place</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-amber-500/10 to-yellow-600/5 border-amber-500/20">
          <CardContent className="p-4 text-center">
            <Crown className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <p className="text-2xl font-bold text-foreground">{stats.vipTiers}</p>
            <p className="text-xs text-muted-foreground">VIP Tiers</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-pink-600/5 border-purple-500/20">
          <CardContent className="p-4 text-center">
            <Medal className="w-8 h-8 mx-auto mb-2 text-purple-400" />
            <p className="text-2xl font-bold text-foreground">{stats.medals}</p>
            <p className="text-xs text-muted-foreground">VIP Medals</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-rose-500/10 to-pink-600/5 border-rose-500/20">
          <CardContent className="p-4 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-2 text-rose-400" />
            <p className="text-2xl font-bold text-foreground">{stats.nobleCards}</p>
            <p className="text-xs text-muted-foreground">Noble Cards</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-slate-900/50 p-1 h-auto">
          <TabsTrigger 
            value="tiers" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-black py-3"
          >
            <Crown className="w-4 h-4 mr-2" />
            VIP Tiers
          </TabsTrigger>
          <TabsTrigger 
            value="medals" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white py-3"
          >
            <Medal className="w-4 h-4 mr-2" />
            VIP Medals
          </TabsTrigger>
          <TabsTrigger 
            value="cards" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500 data-[state=active]:to-pink-500 data-[state=active]:text-white py-3"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Noble Cards
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
