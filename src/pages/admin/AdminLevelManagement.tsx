import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Crown, Users, Sparkles, Settings2, Shield, UserPlus } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

// Import existing components as tab content
import AdminLevelTiers from "./AdminLevelTiers";
import AdminLevelPrivileges from "./AdminLevelPrivileges";
import AdminFeatureLevels from "./AdminFeatureLevels";
import AdminInvitationSettings from "./AdminInvitationSettings";

const AdminLevelManagement = () => {
  const [activeTab, setActiveTab] = useState("tiers");
  const [stats, setStats] = useState({
    userTiers: 0,
    hostTiers: 0,
    privileges: 0,
    features: 0
  });

  useAdminRealtime(['user_level_tiers', 'level_privileges', 'feature_level_requirements'], () => fetchStats());

  const fetchStats = async () => {
    const [tiersRes, privilegesRes, featuresRes] = await Promise.all([
      supabase.from('user_level_tiers').select('tier_type', { count: 'exact' }),
      supabase.from('level_privileges').select('id', { count: 'exact' }),
      supabase.from('feature_level_requirements').select('id', { count: 'exact' })
    ]);

    const tiers = tiersRes.data || [];
    setStats({
      userTiers: tiers.filter((t: any) => t.tier_type === 'user').length,
      hostTiers: tiers.filter((t: any) => t.tier_type === 'host').length,
      privileges: privilegesRes.count || 0,
      features: featuresRes.count || 0
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Level Management System</h1>
            <p className="text-white/80">Unified control for all level-related settings</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-blue-400" />
            <p className="text-2xl font-bold text-foreground">{stats.userTiers}</p>
            <p className="text-xs text-muted-foreground">User Tiers</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4 text-center">
            <Crown className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <p className="text-2xl font-bold text-foreground">{stats.hostTiers}</p>
            <p className="text-xs text-muted-foreground">Host Tiers</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-pink-500/10 to-pink-600/5 border-pink-500/20">
          <CardContent className="p-4 text-center">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-pink-400" />
            <p className="text-2xl font-bold text-foreground">{stats.privileges}</p>
            <p className="text-xs text-muted-foreground">Privileges</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4 text-center">
            <Shield className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-2xl font-bold text-foreground">{stats.features}</p>
            <p className="text-xs text-muted-foreground">Feature Gates</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 bg-slate-900/50 p-1 h-auto">
          <TabsTrigger 
            value="tiers" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white py-3"
          >
            <Crown className="w-4 h-4 mr-2" />
            Level Tiers
          </TabsTrigger>
          <TabsTrigger 
            value="privileges" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-rose-500 data-[state=active]:text-white py-3"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Privileges
          </TabsTrigger>
          <TabsTrigger 
            value="features" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white py-3"
          >
            <Settings2 className="w-4 h-4 mr-2" />
            Feature Gates
          </TabsTrigger>
          <TabsTrigger 
            value="invitation" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white py-3"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Invitation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tiers" className="mt-0">
          <AdminLevelTiers />
        </TabsContent>

        <TabsContent value="privileges" className="mt-0">
          <AdminLevelPrivileges />
        </TabsContent>

        <TabsContent value="features" className="mt-0">
          <AdminFeatureLevels />
        </TabsContent>

        <TabsContent value="invitation" className="mt-0">
          <AdminInvitationSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminLevelManagement;
