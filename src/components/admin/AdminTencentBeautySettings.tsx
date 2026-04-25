import { useState, useEffect } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Save, Eye, EyeOff, RefreshCw, Shield, Key, Smartphone } from "lucide-react";
import { parseSettingValue, saveAppSetting } from "@/utils/adminSettingsStorage";

const AdminTencentBeautySettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLicenseKey, setShowLicenseKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [settings, setSettings] = useState({
    appId: "",
    licenseKey: "",
    token: "",
    isEnabled: true,
    platform: "web",
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const keys = [
        "tencent_beauty_app_id",
        "tencent_beauty_license_key",
        "tencent_beauty_token",
        "tencent_beauty_enabled",
      ];

      const { data } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", keys);

      if (data) {
        const map: Record<string, any> = {};
        data.forEach((r) => (map[r.setting_key] = parseSettingValue(r.setting_value)));

        setSettings({
          appId: (map.tencent_beauty_app_id as string) || "",
          licenseKey: (map.tencent_beauty_license_key as string) || "",
          token: (map.tencent_beauty_token as string) || "",
          isEnabled: map.tencent_beauty_enabled !== false,
          platform: "web",
        });
      }
    } catch (err) {
      console.error("Failed to fetch Tencent Beauty settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const entries = [
        { setting_key: "tencent_beauty_app_id", setting_value: settings.appId, category: "tencent_beauty", description: "Tencent RTC Beauty App ID" },
        { setting_key: "tencent_beauty_license_key", setting_value: settings.licenseKey, category: "tencent_beauty", description: "Tencent RTC Beauty License Key" },
        { setting_key: "tencent_beauty_token", setting_value: settings.token, category: "tencent_beauty", description: "Tencent RTC Beauty Token" },
        { setting_key: "tencent_beauty_enabled", setting_value: settings.isEnabled, category: "tencent_beauty", description: "Tencent Beauty SDK enabled status" },
      ];

      for (const entry of entries) {
        await saveAppSetting(entry.setting_key, entry.setting_value, entry.description);
      }

      toast.success("Tencent Beauty settings saved successfully!");
    } catch (err) {
      console.error("Failed to save:", err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-[hsl(var(--admin-border-light)/0.7)] bg-[hsl(var(--admin-card)/0.85)]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[hsl(var(--admin-gold)/0.4)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.2),hsl(var(--accent)/0.15))]">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg text-[hsl(var(--admin-text))]">
                  Tencent Beauty AR SDK
                </CardTitle>
                <p className="text-xs text-[hsl(var(--admin-text-secondary))]">
                  Beauty filter configuration for Web platform
                </p>
              </div>
            </div>
            <Badge
              variant={settings.isEnabled ? "default" : "secondary"}
              className={settings.isEnabled ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}
            >
              {settings.isEnabled ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Enable/Disable */}
      <Card className="border-[hsl(var(--admin-border-light)/0.7)] bg-[hsl(var(--admin-card)/0.85)]">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-[hsl(var(--admin-text-secondary))]" />
              <div>
                <p className="font-medium text-[hsl(var(--admin-text))]">Enable SDK</p>
                <p className="text-xs text-[hsl(var(--admin-text-secondary))]">
                  Enable/disable Tencent Beauty filters on Web platform
                </p>
              </div>
            </div>
            <Switch
              checked={settings.isEnabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, isEnabled: v }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card className="border-[hsl(var(--admin-border-light)/0.7)] bg-[hsl(var(--admin-card)/0.85)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-[hsl(var(--admin-text))]">
            <Key className="h-4 w-4" />
            SDK Credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* App ID */}
          <div className="space-y-2">
            <Label className="text-[hsl(var(--admin-text-secondary))]">
              <Smartphone className="mr-1.5 inline h-3.5 w-3.5" />
              App ID (SDKAppID)
            </Label>
            <Input
              value={settings.appId}
              onChange={(e) => setSettings((s) => ({ ...s, appId: e.target.value }))}
              placeholder="e.g. 1408377570"
              className="border-[hsl(var(--admin-border-light)/0.5)] bg-[hsl(var(--admin-card-alt)/0.5)] text-[hsl(var(--admin-text))] placeholder:text-[hsl(var(--admin-text-secondary)/0.5)]"
            />
          </div>

          {/* License Key */}
          <div className="space-y-2">
            <Label className="text-[hsl(var(--admin-text-secondary))]">
              <Key className="mr-1.5 inline h-3.5 w-3.5" />
              License Key
            </Label>
            <div className="relative">
              <Input
                type={showLicenseKey ? "text" : "password"}
                value={settings.licenseKey}
                onChange={(e) => setSettings((s) => ({ ...s, licenseKey: e.target.value }))}
                placeholder="Paste your license key here"
                className="border-[hsl(var(--admin-border-light)/0.5)] bg-[hsl(var(--admin-card-alt)/0.5)] pr-10 text-[hsl(var(--admin-text))] placeholder:text-[hsl(var(--admin-text-secondary)/0.5)]"
              />
              <button
                type="button"
                onClick={() => setShowLicenseKey(!showLicenseKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--admin-text-secondary))] hover:text-[hsl(var(--admin-text))]"
              >
                {showLicenseKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Token */}
          <div className="space-y-2">
            <Label className="text-[hsl(var(--admin-text-secondary))]">
              <Shield className="mr-1.5 inline h-3.5 w-3.5" />
              Token (Signature Generation)
            </Label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={settings.token}
                onChange={(e) => setSettings((s) => ({ ...s, token: e.target.value }))}
                placeholder="Token for signature generation"
                className="border-[hsl(var(--admin-border-light)/0.5)] bg-[hsl(var(--admin-card-alt)/0.5)] pr-10 text-[hsl(var(--admin-text))] placeholder:text-[hsl(var(--admin-text-secondary)/0.5)]"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--admin-text-secondary))] hover:text-[hsl(var(--admin-text))]"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-[hsl(var(--admin-text-secondary)/0.6)]">
              This token is used by the Edge Function for signature generation. Must also be configured in Supabase Secrets.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={saveSettings}
          disabled={saving}
          className="gap-2 bg-[linear-gradient(120deg,hsl(var(--primary)),hsl(var(--accent)))] text-primary-foreground shadow-[0_8px_20px_-10px_hsl(var(--admin-gold)/0.6)]"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
};

export default AdminTencentBeautySettings;
