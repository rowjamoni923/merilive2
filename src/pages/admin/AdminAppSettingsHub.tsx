import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Smartphone, Sparkles, Bell, Sliders, Shield, Wand2, Antenna } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import AdminLuxuryStatCard from "@/components/admin/AdminLuxuryStatCard";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { recordAdminError } from "@/utils/adminErrorLog";

import AdminAppVersion from "./AdminAppVersion";
import AdminBranding from "./AdminBranding";
import AdminNotificationTemplates from "./AdminNotificationTemplates";
import AdminSettings from "./AdminSettings";
import AdminAllowedLinks from "./AdminAllowedLinks";
import AdminTencentBeautySettings from "@/components/admin/AdminTencentBeautySettings";
import AdminNativeBridge from "./AdminNativeBridge";

import { formatAdminError } from "@/utils/formatAdminError";
const tabTriggerClass = "flex-shrink-0 gap-1.5 py-3 text-xs sm:text-sm text-[hsl(var(--admin-text-secondary))] data-[state=active]:bg-[linear-gradient(120deg,hsl(var(--primary)),hsl(var(--accent)))] data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_10px_26px_-14px_hsl(var(--admin-gold)/0.85)]";

const AdminAppSettingsHub = () => {
  const [activeTab, setActiveTab] = useState("version");
  const [stats, setStats] = useState({
    currentVersion: "1.0.0",
    templates: 0,
    settings: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [versionRes, templatesRes, settingsRes] = await Promise.all([
        supabase.from("app_version_settings").select("current_version, current_version_name").eq("platform", "android").maybeSingle(),
        supabase.from("notification_templates").select("id", { count: "exact", head: true }),
        supabase.from("app_settings").select("id", { count: "exact", head: true }),
      ]);

      if (versionRes.error) throw versionRes.error;
      if (templatesRes.error) throw templatesRes.error;
      if (settingsRes.error) throw settingsRes.error;

      setStats({
        currentVersion: versionRes.data?.current_version_name || versionRes.data?.current_version || "1.0.0",
        templates: templatesRes.count || 0,
        settings: settingsRes.count || 0,
      });
    } catch (error) {
      recordAdminError({
        kind: "other",
        label: "AdminAppSettingsHub.fetchStats",
        message: formatAdminError(error),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useAdminRealtime(["app_version_settings", "notification_templates", "app_settings"], () => fetchStats());

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="App Settings Hub"
        subtitle="All app configurations in one luxury control panel"
        icon={Settings}
        onRefresh={fetchStats}
        isRefreshing={isRefreshing}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <AdminLuxuryStatCard icon={Smartphone} label="Current Version" value={stats.currentVersion} tone="gold" valueClassName="text-xl" />
        <AdminLuxuryStatCard icon={Bell} label="Notification Templates" value={stats.templates} tone="accent" />
        <AdminLuxuryStatCard icon={Sliders} label="Settings Keys" value={stats.settings} tone="royal" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto w-full gap-1 overflow-x-auto border border-[hsl(var(--admin-border-light)/0.7)] bg-[hsl(var(--admin-card)/0.68)] p-1 scrollbar-hide">
          <TabsTrigger value="version" className={tabTriggerClass}>
            <Smartphone className="h-4 w-4" />
            Version
          </TabsTrigger>
          <TabsTrigger value="branding" className={tabTriggerClass}>
            <Sparkles className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="notifications" className={tabTriggerClass}>
            <Bell className="h-4 w-4" />
            Notify
          </TabsTrigger>
          <TabsTrigger value="links" className={tabTriggerClass}>
            <Shield className="h-4 w-4" />
            Links
          </TabsTrigger>
          <TabsTrigger value="settings" className={tabTriggerClass}>
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="beauty-sdk" className={tabTriggerClass}>
            <Wand2 className="h-4 w-4" />
            Beauty SDK
          </TabsTrigger>
          <TabsTrigger value="native-bridge" className={tabTriggerClass}>
            <Antenna className="h-4 w-4" />
            Native
          </TabsTrigger>
        </TabsList>

        <TabsContent value="version" className="mt-0">
          <AdminAppVersion />
        </TabsContent>
        <TabsContent value="branding" className="mt-0">
          <AdminBranding />
        </TabsContent>
        <TabsContent value="notifications" className="mt-0">
          <AdminNotificationTemplates />
        </TabsContent>
        <TabsContent value="links" className="mt-0">
          <AdminAllowedLinks />
        </TabsContent>
        <TabsContent value="settings" className="mt-0">
          <AdminSettings />
        </TabsContent>
        <TabsContent value="beauty-sdk" className="mt-0">
          <AdminTencentBeautySettings />
        </TabsContent>
        <TabsContent value="native-bridge" className="mt-0">
          <AdminNativeBridge />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAppSettingsHub;

