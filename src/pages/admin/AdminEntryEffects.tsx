import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Sparkles, Type, Car, PartyPopper } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import AdminLuxuryStatCard from "@/components/admin/AdminLuxuryStatCard";

import { formatAdminError } from "@/utils/formatAdminError";
// Import existing components as tab content
import AdminEntryBanners from "./AdminEntryBanners";
import AdminEntryBars from "./AdminEntryBars";
import AdminEntryNameBars from "./AdminEntryNameBars";
import AdminVehicleEntrances from "./AdminVehicleEntrances";
import { recordAdminError } from "@/utils/adminErrorLog";

const tabTriggerClass = "py-3 text-xs sm:text-sm text-[hsl(var(--admin-text-secondary))] data-[state=active]:bg-[linear-gradient(120deg,hsl(var(--primary)),hsl(var(--accent)))] data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_10px_26px_-14px_hsl(var(--admin-gold)/0.85)]";

const AdminEntryEffects = () => {
  const [activeTab, setActiveTab] = useState("banners");
  const [stats, setStats] = useState({
    banners: 0,
    bars: 0,
    nameBars: 0,
    vehicles: 0
  });

  useAdminRealtime(['entry_banners', 'entry_effects', 'entry_name_bars', 'vehicle_entrances'], () => fetchStats());

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    // Pkg10: single RPC replaces 4 separate count queries
    const { data, error } = await supabase.rpc('admin_entry_effects_stats' as any);
    if (error || !data) {
      recordAdminError({ kind: "rpc", label: "AdminEntryEffects.AdminentryeffectsstatsFailed", message: formatAdminError(error)});
      return;
    }
    const s: any = data;
    setStats({
    });
  };

  return (
    <div className="admin-pro-shell space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--admin-border-light)/0.8)] bg-[linear-gradient(120deg,hsl(var(--admin-card-alt)/0.96),hsl(var(--admin-card)/0.82))] p-6 shadow-[0_24px_50px_-30px_hsl(var(--admin-gold)/0.65)]">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[hsl(var(--admin-gold)/0.42)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.3),hsl(var(--accent)/0.2))]">
            <PartyPopper className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[hsl(var(--admin-text))]">Entrance Effects</h1>
            <p className="text-sm text-[hsl(var(--admin-text-secondary))]">Manage room entrance animations, flying name bars and vehicle entrances</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <AdminLuxuryStatCard icon={Zap} label="Premium Entry Effects" value={stats.banners} tone="gold" />
        <AdminLuxuryStatCard icon={Sparkles} label="Standard Entry Effects" value={stats.bars} tone="accent" />
        <AdminLuxuryStatCard icon={Type} label="Flying Name Bars" value={stats.nameBars} tone="royal" />
        <AdminLuxuryStatCard icon={Car} label="Vehicle Entrances" value={stats.vehicles} tone="soft" />
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="w-full overflow-x-auto -mx-2 px-2"><TabsList className="inline-flex w-max md:grid md:h-auto md:w-full md:grid-cols-4 gap-1 border border-[hsl(var(--admin-border-light)/0.7)] bg-[hsl(var(--admin-card)/0.68)] p-1">
          <TabsTrigger value="banners" className={tabTriggerClass}>
            <Zap className="mr-1 h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Premium</span> Effects
          </TabsTrigger>
          <TabsTrigger value="bars" className={tabTriggerClass}>
            <Sparkles className="mr-1 h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Standard</span> Effects
          </TabsTrigger>
          <TabsTrigger value="names" className={tabTriggerClass}>
            <Type className="mr-1 h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Flying</span> Name Bars
          </TabsTrigger>
          <TabsTrigger value="vehicles" className={tabTriggerClass}>
            <Car className="mr-1 h-4 w-4 sm:mr-2" />
            Vehicle <span className="hidden sm:inline">Entrances</span>
          </TabsTrigger>
        </TabsList></div>

        <TabsContent value="banners" className="mt-0">
          <AdminEntryBanners />
        </TabsContent>

        <TabsContent value="bars" className="mt-0">
          <AdminEntryBars />
        </TabsContent>

        <TabsContent value="names" className="mt-0">
          <AdminEntryNameBars />
        </TabsContent>

        <TabsContent value="vehicles" className="mt-0">
          <AdminVehicleEntrances />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminEntryEffects;

