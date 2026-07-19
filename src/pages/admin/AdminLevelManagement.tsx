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

  const fetchStats = async () => {
    const [userTiersRes, hostTiersRes, privilegesRes, featuresRes] = await Promise.all([
      supabase.from('user_level_tiers').select('id', { count: 'exact', head: true }),
      supabase.from('host_levels').select('id', { count: 'exact', head: true }),
      supabase.from('level_privileges').select('id', { count: 'exact', head: true }),
      supabase.from('feature_level_requirements').select('id', { count: 'exact', head: true })
    ]);

    setStats({
      userTiers: userTiersRes.count || 0,
      hostTiers: hostTiersRes.count || 0,
      privileges: privilegesRes.count || 0,
      features: featuresRes.count || 0
    });
  };

  useEffect(() => { fetchStats(); }, []);
  useAdminRealtime(['user_level_tiers', 'host_levels', 'level_privileges', 'feature_level_requirements'], () => fetchStats());

  return (
    <div className="admin-pro-shell space-y-6">
      {/* Header — Cloud White */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
            <Crown className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Level Management System</h1>
            <p className="text-sm text-slate-500">Unified control for all level-related settings</p>
          </div>
        </div>
      </div>

      {/* Stats Cards — Cloud White + tinted icon tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'User Tiers', value: stats.userTiers, tint: 'bg-blue-50 border-blue-100 text-blue-600' },
          { icon: Crown, label: 'Host Tiers', value: stats.hostTiers, tint: 'bg-amber-50 border-amber-100 text-amber-600' },
          { icon: Sparkles, label: 'Privileges', value: stats.privileges, tint: 'bg-rose-50 border-rose-100 text-rose-600' },
          { icon: Shield, label: 'Feature Gates', value: stats.features, tint: 'bg-emerald-50 border-emerald-100 text-emerald-600' },
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
        <div className="w-full overflow-x-auto -mx-2 px-2">
          <TabsList className="inline-flex w-max md:grid md:w-full md:grid-cols-4 bg-slate-100 border border-slate-200 p-1 h-auto">
            <TabsTrigger value="tiers" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-600 py-2.5">
              <Crown className="w-4 h-4 mr-2" />Level Tiers
            </TabsTrigger>
            <TabsTrigger value="privileges" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-600 py-2.5">
              <Sparkles className="w-4 h-4 mr-2" />Privileges
            </TabsTrigger>
            <TabsTrigger value="features" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-600 py-2.5">
              <Settings2 className="w-4 h-4 mr-2" />Feature Gates
            </TabsTrigger>
            <TabsTrigger value="invitation" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-slate-600 py-2.5">
              <UserPlus className="w-4 h-4 mr-2" />Invitation
            </TabsTrigger>
          </TabsList>
        </div>


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
