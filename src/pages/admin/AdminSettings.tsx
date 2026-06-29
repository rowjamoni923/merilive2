import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import {
  Settings,
  Save,
  UserCheck,
  Gift,
  PartyPopper,
  Shield,
  Plus,
  Trash2,
  Wallet,
  Percent,
  TrendingUp,
  Download,
  Globe,
  Diamond,
  Users
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { parseSettingValue, saveAppSetting } from "@/utils/adminSettingsStorage";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
// DiamondPackage interface removed - managed in AdminCoins

interface WithdrawalFee {
  id: string;
  min_amount: number;
  max_amount: number;
  fee_type: 'fixed' | 'percent';
  fee_value: number;
}

interface AppSettings {
  host_requirements: {
    min_age: number;
    gender: string;
    verification_required: boolean;
  };
  party_room_limits: {
    max_video_participants: number;
    max_audio_participants: number;
    max_game_participants: number;
  };
  maintenance_mode: {
    enabled: boolean;
    message: string;
  };
  admin_2fa: {
    enabled: boolean;
  };
  withdrawal_settings: {
    min_withdrawal: number;
    free_withdrawal_limit: number;
    fees: WithdrawalFee[];
    coins_to_dollar_rate: number;
  };
  helper_fee_settings: {
    platform_fee_percent: number;
    helper_receives_percent: number;
  };
  play_store_downloads: string;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const helperPlatformFeePercent = settings?.helper_fee_settings.platform_fee_percent ?? 10;
  const helperReceivesPercent = settings?.helper_fee_settings.helper_receives_percent ?? (100 - helperPlatformFeePercent);
  const helperRewardExample = 10000;
  const platformFeeExampleAmount = Math.round((helperRewardExample * helperPlatformFeePercent) / 100);
  const helperNetExampleAmount = Math.round((helperRewardExample * helperReceivesPercent) / 100);

  useAdminRealtime(['app_settings'], () => fetchSettings());

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*");

      if (error) throw error;

      const settingsMap: any = {};
      data?.forEach(item => {
        settingsMap[item.setting_key] = parseSettingValue(item.setting_value);
      });

      setSettings({
        host_requirements: settingsMap.host_requirements || { min_age: 18, gender: "female", verification_required: true },
        party_room_limits: settingsMap.party_room_limits || { max_video_participants: 4, max_audio_participants: 12, max_game_participants: 8 },
        maintenance_mode: settingsMap.maintenance_mode || { enabled: false, message: "" },
        admin_2fa: settingsMap.admin_2fa || { enabled: true },
        withdrawal_settings: settingsMap.withdrawal_settings || {
          min_withdrawal: 10000,
          free_withdrawal_limit: 50000,
          coins_to_dollar_rate: 10000,
          fees: [
            { id: '1', min_amount: 50001, max_amount: 100000, fee_type: 'percent', fee_value: 2 },
            { id: '2', min_amount: 100001, max_amount: 500000, fee_type: 'percent', fee_value: 3 },
            { id: '3', min_amount: 500001, max_amount: 999999999, fee_type: 'percent', fee_value: 5 }
          ]
        },
        helper_fee_settings: settingsMap.helper_fee_settings || {
          platform_fee_percent: 10,
          helper_receives_percent: 90,
        },
        play_store_downloads: typeof settingsMap.play_store_downloads === 'string'
          ? settingsMap.play_store_downloads
          : (settingsMap.play_store_downloads?.count || "10,000+"),
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      recordAdminError({ kind: "rpc", label: "AdminSettings.settingsMap", message: formatAdminError(error) });
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const saveSetting = async (key: string, value: any) => {
    setSaving(true);
    try {
      await saveAppSetting(key, value, `${key} settings`);

      toast.success("Settings saved successfully!");
      await fetchSettings();
    } catch (error) {
      console.error("Error saving setting:", error);
      recordAdminError({ kind: "rpc", label: "AdminSettings.saveSetting", message: formatAdminError(error) });
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handlePartyLimitChange = (field: string, value: number) => {
    if (!settings) return;
    const newLimits = { ...settings.party_room_limits, [field]: value };
    setSettings({ ...settings, party_room_limits: newLimits });
  };

  const handleMaintenanceChange = (field: string, value: any) => {
    if (!settings) return;
    const newMaintenance = { ...settings.maintenance_mode, [field]: value };
    setSettings({ ...settings, maintenance_mode: newMaintenance });
  };

  const handleWithdrawalChange = (field: string, value: any) => {
    if (!settings) return;
    const newWithdrawal = { ...settings.withdrawal_settings, [field]: value };
    setSettings({ ...settings, withdrawal_settings: newWithdrawal });
  };

  const addWithdrawalFee = () => {
    if (!settings) return;
    const newFee: WithdrawalFee = {
      id: Date.now().toString(),
      min_amount: 0,
      max_amount: 100000,
      fee_type: 'percent',
      fee_value: 2
    };
    setSettings({
      ...settings,
      withdrawal_settings: {
        ...settings.withdrawal_settings,
        fees: [...settings.withdrawal_settings.fees, newFee]
      }
    });
  };

  const updateWithdrawalFee = (id: string, field: string, value: any) => {
    if (!settings) return;
    const updated = settings.withdrawal_settings.fees.map(fee =>
      fee.id === id ? { ...fee, [field]: value } : fee
    );
    setSettings({
      ...settings,
      withdrawal_settings: { ...settings.withdrawal_settings, fees: updated }
    });
  };

  const deleteWithdrawalFee = (id: string) => {
    if (!settings) return;
    const filtered = settings.withdrawal_settings.fees.filter(fee => fee.id !== id);
    setSettings({
      ...settings,
      withdrawal_settings: { ...settings.withdrawal_settings, fees: filtered }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="admin-pro-shell admin-content space-y-4 sm:space-y-6 p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 bg-gradient-to-r from-slate-50 via-purple-50 to-blue-50 rounded-xl sm:rounded-2xl shadow-lg border border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-slate-50 via-purple-700 to-slate-100 bg-clip-text text-transparent">App Settings</h1>
          <p className="text-slate-600 text-sm sm:text-base">Configure all app settings</p>
        </div>
      </div>

      <Tabs defaultValue="party" className="space-y-4 sm:space-y-6">
        <TabsList className="bg-white border border-slate-200 shadow-md p-1 w-full overflow-x-auto flex flex-nowrap">
          <TabsTrigger value="party" className="flex-1 min-w-fit text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-purple-600 data-[state=active]:text-white text-slate-700">
            <PartyPopper className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Party</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="flex-1 min-w-fit text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-purple-600 data-[state=active]:text-white text-slate-700">
            <Shield className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">System</span>
          </TabsTrigger>
          <TabsTrigger value="withdrawal" className="flex-1 min-w-fit text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-purple-600 data-[state=active]:text-white text-slate-700">
            <Wallet className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Withdraw</span>
          </TabsTrigger>
          <TabsTrigger value="landing" className="flex-1 min-w-fit text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-purple-600 data-[state=active]:text-white text-slate-700">
            <Globe className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Landing</span>
          </TabsTrigger>
        </TabsList>

        {/* Party Room Limits */}
        <TabsContent value="party">
          <Card className="bg-white border-slate-200 shadow-xl">
            <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                  <PartyPopper className="w-4 h-4 sm:w-5 sm:h-5 text-slate-900" />
                </div>
                <div>
                  <CardTitle className="text-slate-800 text-base sm:text-lg">Party Room Limits</CardTitle>
                  <CardDescription className="text-slate-500 text-xs sm:text-sm">
                    Maximum participants for different party room types
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="p-3 sm:p-4 bg-gradient-to-r from-slate-50 to-purple-50/30 rounded-lg sm:rounded-xl border border-slate-200">
                  <Label className="text-slate-600 font-medium text-sm">🎥 Video Party</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={settings?.party_room_limits.max_video_participants || 4}
                    onChange={(e) => handlePartyLimitChange("max_video_participants", parseInt(e.target.value))}
                    className="bg-white border-slate-200 text-slate-800 mt-2"
                  />
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-1">Max video streams</p>
                </div>
                <div className="p-3 sm:p-4 bg-gradient-to-r from-slate-50 to-purple-50/30 rounded-lg sm:rounded-xl border border-slate-200">
                  <Label className="text-slate-600 font-medium text-sm">🎤 Audio Party</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={settings?.party_room_limits.max_audio_participants || 12}
                    onChange={(e) => handlePartyLimitChange("max_audio_participants", parseInt(e.target.value))}
                    className="bg-white border-slate-200 text-slate-800 mt-2"
                  />
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-1">Max audio speakers</p>
                </div>
                <div className="p-3 sm:p-4 bg-gradient-to-r from-slate-50 to-purple-50/30 rounded-lg sm:rounded-xl border border-slate-200">
                  <Label className="text-slate-600 font-medium text-sm">🎮 Game Party</Label>
                  <Input
                    type="number"
                    min={2}
                    max={20}
                    value={settings?.party_room_limits.max_game_participants || 8}
                    onChange={(e) => handlePartyLimitChange("max_game_participants", parseInt(e.target.value))}
                    className="bg-white border-slate-200 text-slate-800 mt-2"
                  />
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-1">Max game players</p>
                </div>
              </div>

              <Button
                onClick={() => saveSetting("party_room_limits", settings?.party_room_limits)}
                disabled={saving}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 shadow-lg"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Settings */}
        <TabsContent value="system">
          <Card className="bg-white border-slate-200 shadow-xl">
            <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-100 p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-red-400 to-orange-500 flex items-center justify-center shadow-lg">
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-slate-900" />
                </div>
                <div>
                  <CardTitle className="text-slate-800 text-base sm:text-lg">System Settings</CardTitle>
                  <CardDescription className="text-slate-500 text-xs sm:text-sm">
                    Maintenance mode and other system settings
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
              <div className="p-4 sm:p-5 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg sm:rounded-xl border border-red-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-slate-800 font-semibold text-sm sm:text-base">🚧 Maintenance Mode</h3>
                    <p className="text-slate-600 text-xs sm:text-sm">App will be unavailable when enabled</p>
                  </div>
                  <Switch
                    checked={settings?.maintenance_mode.enabled || false}
                    onCheckedChange={(checked) => handleMaintenanceChange("enabled", checked)}
                  />
                </div>
                <div>
                  <Label className="text-slate-600 font-medium text-sm">Maintenance Message</Label>
                  <Input
                    value={settings?.maintenance_mode.message || ""}
                    onChange={(e) => handleMaintenanceChange("message", e.target.value)}
                    placeholder="App is being updated, please check back later..."
                    className="bg-white border-slate-200 text-slate-800 mt-2"
                  />
                </div>
              </div>

              {/* 2FA OTP Toggle */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg sm:rounded-xl border border-purple-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-slate-800 font-semibold text-sm sm:text-base">🔐 2-Step OTP Verification</h3>
                    <p className="text-slate-600 text-xs sm:text-sm">Enable/disable email OTP verification during login</p>
                  </div>
                  <Switch
                    checked={settings?.admin_2fa?.enabled ?? true}
                    onCheckedChange={(checked) => {
                      if (!settings) return;
                      setSettings({ ...settings, admin_2fa: { enabled: checked } });
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => saveSetting("maintenance_mode", settings?.maintenance_mode)}
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 shadow-lg"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Maintenance"}
                </Button>
                <Button
                  onClick={() => saveSetting("admin_2fa", settings?.admin_2fa)}
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 shadow-lg"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save 2FA"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Withdrawal Settings */}
        <TabsContent value="withdrawal">
          <Card className="bg-white border-slate-200 shadow-xl">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg">
                    <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-slate-900" />
                  </div>
                  <div>
                    <CardTitle className="text-slate-800 text-base sm:text-lg">Withdrawal Settings</CardTitle>
                    <CardDescription className="text-slate-500 text-xs sm:text-sm">
                      Withdrawal limits and fee settings
                    </CardDescription>
                  </div>
                </div>
                <Button onClick={addWithdrawalFee} size="sm" className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 shadow-lg w-full sm:w-auto">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Fee
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
              {/* Exchange Rate */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg sm:rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-900" />
                  </div>
                  <h3 className="text-slate-800 font-semibold text-sm sm:text-base">Exchange Rate</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-600 font-medium text-sm">Beans per $1</Label>
                    <Input
                      type="number"
                      value={settings?.withdrawal_settings.coins_to_dollar_rate || 10000}
                      onChange={(e) => handleWithdrawalChange("coins_to_dollar_rate", parseInt(e.target.value))}
                      className="bg-white border-slate-200 text-slate-800 mt-2"
                    />
                    <p className="text-[10px] sm:text-xs text-slate-500 mt-1">
                      Example: {settings?.withdrawal_settings.coins_to_dollar_rate || 10000} Beans = $1
                    </p>
                  </div>
                  <div className="flex items-center justify-center p-3 sm:p-4 bg-white rounded-lg sm:rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-center">
                      <p className="text-slate-600 text-xs sm:text-sm">Preview</p>
                      <p className="text-emerald-600 font-bold text-lg sm:text-xl mt-1">
                        {(settings?.withdrawal_settings.coins_to_dollar_rate || 10000).toLocaleString()} Beans = $1.00
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Withdrawal Limits */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg sm:rounded-xl border border-amber-200">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center">
                    <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-900" />
                  </div>
                  <h3 className="text-slate-800 font-semibold text-sm sm:text-base">Withdrawal Limits</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-600 font-medium text-sm">Minimum Withdrawal (Beans)</Label>
                    <Input
                      type="number"
                      value={settings?.withdrawal_settings.min_withdrawal || 10000}
                      onChange={(e) => handleWithdrawalChange("min_withdrawal", parseInt(e.target.value))}
                      className="bg-white border-slate-200 text-slate-800 mt-2"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-600 font-medium text-sm">Free Withdrawal Limit (Beans)</Label>
                    <Input
                      type="number"
                      value={settings?.withdrawal_settings.free_withdrawal_limit || 50000}
                      onChange={(e) => handleWithdrawalChange("free_withdrawal_limit", parseInt(e.target.value))}
                      className="bg-white border-slate-200 text-slate-800 mt-2"
                    />
                    <p className="text-[10px] sm:text-xs text-slate-500 mt-1">
                      No fee will be charged up to this amount
                    </p>
                  </div>
                </div>
              </div>

              {/* Fee Tiers */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg sm:rounded-xl border border-purple-200">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                    <Percent className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-900" />
                  </div>
                  <h3 className="text-slate-800 font-semibold text-sm sm:text-base">Fee Tiers</h3>
                </div>
                <p className="text-slate-600 text-xs sm:text-sm mb-4">
                  Set different fees for different amounts
                </p>
                
                <div className="space-y-3">
                  {settings?.withdrawal_settings.fees.map((fee) => (
                    <motion.div
                      key={fee.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-white rounded-lg sm:rounded-xl border border-slate-200 hover:shadow-md transition-shadow"
                    >
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                        <div>
                          <Label className="text-slate-500 text-[10px] sm:text-xs font-medium">Min Beans</Label>
                          <Input
                            type="number"
                            value={fee.min_amount}
                            onChange={(e) => updateWithdrawalFee(fee.id, "min_amount", parseInt(e.target.value))}
                            className="bg-gray-50 border-slate-200 text-slate-800 mt-1 text-sm h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-slate-500 text-[10px] sm:text-xs font-medium">Max Beans</Label>
                          <Input
                            type="number"
                            value={fee.max_amount}
                            onChange={(e) => updateWithdrawalFee(fee.id, "max_amount", parseInt(e.target.value))}
                            className="bg-gray-50 border-slate-200 text-slate-800 mt-1 text-sm h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-slate-500 text-[10px] sm:text-xs font-medium">Fee Type</Label>
                          <select
                            value={fee.fee_type}
                            onChange={(e) => updateWithdrawalFee(fee.id, "fee_type", e.target.value)}
                            className="w-full h-9 mt-1 text-sm bg-gray-50 border border-slate-200 rounded-md px-2"
                          >
                            <option value="percent">Percentage (%)</option>
                            <option value="fixed">Fixed Amount</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-slate-500 text-[10px] sm:text-xs font-medium">
                            Fee Value {fee.fee_type === 'percent' ? '(%)' : '(Beans)'}
                          </Label>
                          <Input
                            type="number"
                            step={fee.fee_type === 'percent' ? '0.1' : '1'}
                            value={fee.fee_value}
                            onChange={(e) => updateWithdrawalFee(fee.id, "fee_value", parseFloat(e.target.value))}
                            className="bg-gray-50 border-slate-200 text-slate-800 mt-1 text-sm h-9"
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteWithdrawalFee(fee.id)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10 self-end sm:self-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="p-4 sm:p-5 bg-slate-50/50 rounded-lg sm:rounded-xl border border-slate-200">
                <h4 className="text-foreground font-semibold text-sm mb-3">📊 Fee Preview</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/30 text-center">
                    <p className="text-xs text-green-400 mb-1">Free Withdrawal</p>
                    <p className="font-bold text-green-400">
                      ≤ {(settings?.withdrawal_settings.free_withdrawal_limit || 50000).toLocaleString()} Beans
                    </p>
                    <p className="text-xs text-green-500 mt-1">0% Fee</p>
                  </div>
                  {settings?.withdrawal_settings.fees.map((fee, index) => (
                    <div key={fee.id} className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30 text-center">
                      <p className="text-xs text-amber-400 mb-1">Tier {index + 1}</p>
                      <p className="font-bold text-amber-400 text-sm">
                        {fee.min_amount.toLocaleString()} - {fee.max_amount.toLocaleString()}
                      </p>
                      <p className="text-xs text-amber-500 mt-1">
                        {fee.fee_type === 'percent' ? `${fee.fee_value}%` : `${fee.fee_value} Beans`} Fee
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Helper Diamond Fee Settings */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-cyan-50 to-teal-50 rounded-lg sm:rounded-xl border border-cyan-200">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center">
                    <Diamond className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-900" />
                  </div>
                  <h3 className="text-slate-800 font-semibold text-sm sm:text-base">💎 Helper Diamond Reward Fee</h3>
                </div>
                <p className="text-slate-600 text-xs sm:text-sm mb-4">
                  When a helper processes an agency withdrawal, this percentage is deducted as platform fee from their diamond reward
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-600 font-medium text-sm">Platform Fee (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={settings?.helper_fee_settings.platform_fee_percent || 10}
                      onChange={(e) => {
                        if (!settings) return;
                        const pf = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                        setSettings({
                          ...settings,
                          helper_fee_settings: {
                            platform_fee_percent: pf,
                            helper_receives_percent: 100 - pf,
                          }
                        });
                      }}
                      className="bg-white border-slate-200 text-slate-800 mt-2"
                    />
                    <p className="text-[10px] sm:text-xs text-slate-500 mt-1">
                      This % of diamonds will be kept by the platform
                    </p>
                  </div>
                  <div className="flex items-center justify-center p-3 sm:p-4 bg-white rounded-lg sm:rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-center space-y-2">
                      <div>
                        <p className="text-slate-500 text-xs">Platform Gets</p>
                        <p className="font-bold text-red-500 text-lg">{helperPlatformFeePercent}%</p>
                      </div>
                      <div className="border-t border-slate-200 pt-2">
                        <p className="text-slate-500 text-xs">Helper Gets</p>
                        <p className="font-bold text-green-600 text-lg">{helperReceivesPercent}%</p>
                      </div>
                      <div className="border-t border-slate-200 pt-2">
                        <p className="text-slate-500 text-xs">Example: 10,000 💎 Reward</p>
                        <p className="text-sm">
                          <span className="text-red-500 font-semibold">{platformFeeExampleAmount.toLocaleString()} 💎</span>
                          <span className="text-slate-400 mx-1">→</span>
                          <span className="text-green-600 font-semibold">{helperNetExampleAmount.toLocaleString()} 💎</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => saveSetting("withdrawal_settings", settings?.withdrawal_settings)}
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Withdrawal Fees"}
                </Button>
                <Button
                  onClick={() => saveSetting("helper_fee_settings", settings?.helper_fee_settings)}
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 shadow-lg"
                >
                  <Diamond className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save Helper Fees"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Landing Page Settings */}
        <TabsContent value="landing">
          <Card className="bg-white border-slate-200 shadow-xl">
            <CardHeader className="bg-gradient-to-r from-violet-50 to-pink-50 border-b border-violet-100 p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-violet-400 to-pink-500 flex items-center justify-center shadow-lg">
                  <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-slate-900" />
                </div>
                <div>
                  <CardTitle className="text-slate-800 text-base sm:text-lg">Landing Page Settings</CardTitle>
                  <CardDescription className="text-slate-500 text-xs sm:text-sm">
                    Download count and other info shown on the landing page
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
              <div className="p-4 sm:p-5 bg-gradient-to-r from-violet-50 to-pink-50 rounded-lg sm:rounded-xl border border-violet-200">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-violet-400 to-pink-500 flex items-center justify-center">
                    <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-900" />
                  </div>
                  <h3 className="text-slate-800 font-semibold text-sm sm:text-base">📥 Play Store Downloads</h3>
                </div>
                <div>
                  <Label className="text-slate-600 font-medium text-sm">Download Count</Label>
                  <Input
                    value={settings?.play_store_downloads || ""}
                    onChange={(e) => setSettings(s => s ? { ...s, play_store_downloads: e.target.value } : s)}
                    placeholder="e.g.: 50,000+ or 1M+"
                    className="bg-white border-slate-200 text-slate-800 mt-2 text-lg font-bold"
                  />
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-2">
                    This number will be displayed on all download buttons and stats sections of the landing page.
                    Examples: "10,000+", "50K+", "1M+"
                  </p>
                </div>
              </div>

              <Button
                onClick={() => saveSetting("play_store_downloads", settings?.play_store_downloads)}
                disabled={saving}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 shadow-lg"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
