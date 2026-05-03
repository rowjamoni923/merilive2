import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Phone,
  Save,
  RefreshCw,
  Diamond,
  Percent,
  Calculator,
  TrendingUp,
  Users,
  Clock,
  AlertCircle,
  CheckCircle,
  PhoneCall,
  Star,
  Crown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { parseSettingValue, saveAppSetting } from "@/utils/adminSettingsStorage";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { recordAdminError } from "@/utils/adminErrorLog";

interface LevelRate {
  level: number;
  rate: number;
}

interface CallSettings {
  default_rate: number;
  min_rate: number;
  max_rate: number;
  host_commission_percent: number;
  call_timeout_seconds: number;
  free_call_duration_seconds: number;
  allow_video_calls: boolean;
  allow_audio_calls: boolean;
  auto_disconnect_on_low_balance: boolean;
  low_balance_warning_threshold: number;
  level_rates: LevelRate[];
  min_level_for_custom_rate: number;
  first_minute_grace_seconds: number; // Grace period for first minute
}

interface CallStats {
  total_calls: number;
  active_calls: number;
  total_minutes: number;
  total_earnings: number;
}

const DEFAULT_LEVEL_RATES: LevelRate[] = [
  { level: 0, rate: 300 },
  { level: 1, rate: 500 },
  { level: 2, rate: 800 },
  { level: 3, rate: 1000 },
  { level: 4, rate: 1500 },
  { level: 5, rate: 2000 },
  { level: 6, rate: 2500 },
  { level: 7, rate: 3000 },
  { level: 8, rate: 4000 },
  { level: 9, rate: 5000 },
  { level: 10, rate: 9000 },
];

const DEFAULT_SETTINGS: CallSettings = {
  default_rate: 2000,
  min_rate: 100,
  max_rate: 10000,
  host_commission_percent: 60,
  call_timeout_seconds: 60,
  free_call_duration_seconds: 0,
  allow_video_calls: true,
  allow_audio_calls: true,
  auto_disconnect_on_low_balance: true,
  low_balance_warning_threshold: 2000,
  level_rates: DEFAULT_LEVEL_RATES,
  min_level_for_custom_rate: 7,
  first_minute_grace_seconds: 21, // Default 21 seconds grace period
};

export default function AdminCallSettings() {
  const [settings, setSettings] = useState<CallSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<CallStats>({
    total_calls: 0,
    active_calls: 0,
    total_minutes: 0,
    total_earnings: 0,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Calculator state
  const [calcDiamonds, setCalcDiamonds] = useState(2000);

  useEffect(() => {
    fetchSettings();
    fetchStats();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "call_rates")
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data?.setting_value) {
        const value = parseSettingValue<any>(data.setting_value) || {};
        setSettings({
          default_rate: value.default_rate || DEFAULT_SETTINGS.default_rate,
          min_rate: value.min_rate || DEFAULT_SETTINGS.min_rate,
          max_rate: value.max_rate || DEFAULT_SETTINGS.max_rate,
          host_commission_percent: value.host_commission_percent || DEFAULT_SETTINGS.host_commission_percent,
          call_timeout_seconds: value.call_timeout_seconds || DEFAULT_SETTINGS.call_timeout_seconds,
          free_call_duration_seconds: value.free_call_duration_seconds || DEFAULT_SETTINGS.free_call_duration_seconds,
          allow_video_calls: value.allow_video_calls ?? DEFAULT_SETTINGS.allow_video_calls,
          allow_audio_calls: value.allow_audio_calls ?? DEFAULT_SETTINGS.allow_audio_calls,
          auto_disconnect_on_low_balance: value.auto_disconnect_on_low_balance ?? DEFAULT_SETTINGS.auto_disconnect_on_low_balance,
          low_balance_warning_threshold: value.low_balance_warning_threshold || DEFAULT_SETTINGS.low_balance_warning_threshold,
          level_rates: (() => {
            const rates = value.level_rates || DEFAULT_SETTINGS.level_rates;
            // Ensure Level 0 exists in the list
            if (!rates.find((lr: LevelRate) => lr.level === 0)) {
              return [{ level: 0, rate: 300 }, ...rates];
            }
            return rates;
          })(),
          min_level_for_custom_rate: value.min_level_for_custom_rate ?? DEFAULT_SETTINGS.min_level_for_custom_rate,
          first_minute_grace_seconds: value.first_minute_grace_seconds ?? DEFAULT_SETTINGS.first_minute_grace_seconds,
        });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      recordAdminError({ kind: "rpc", label: "AdminCallSettings.rates", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useAdminRealtime(
    ['app_settings', 'call_events'],
    fetchSettings,
    'admin-call-settings-rt'
  );

  const fetchStats = async () => {
    try {
      // Use count queries instead of fetching all rows
      const [totalRes, activeRes] = await Promise.all([
        supabase.from("private_calls").select("id", { count: "exact", head: true }),
        supabase.from("private_calls").select("id", { count: "exact", head: true }).eq("status", "connected"),
      ]);

      // Fetch only recent calls for duration/earnings sum (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: recentCalls } = await supabase
        .from("private_calls")
        .select("duration_seconds, coins_spent")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .limit(1000);

      const totalMinutes = Math.floor((recentCalls?.reduce((acc, c) => acc + (c.duration_seconds || 0), 0) || 0) / 60);
      const totalEarnings = recentCalls?.reduce((acc, c) => acc + (c.coins_spent || 0), 0) || 0;

      setStats({ total_calls: totalRes.count || 0, active_calls: activeRes.count || 0, total_minutes: totalMinutes, total_earnings: totalEarnings });
    } catch (error) {
      console.error("Error fetching stats:", error);
      recordAdminError({ kind: "rpc", label: "AdminCallSettings.totalEarnings", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAppSetting("call_rates", settings, "Call rates and commission settings");

      toast.success("Call settings saved!");
    } catch (error) {
      console.error("Error saving settings:", error);
      recordAdminError({ kind: "rpc", label: "AdminCallSettings.handleSave", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // Calculate earnings based on commission
  const calculateHostBeans = (diamonds: number) => {
    return Math.floor(diamonds * settings.host_commission_percent / 100);
  };

  const calculateCompanyShare = (diamonds: number) => {
    return diamonds - calculateHostBeans(diamonds);
  };

  // Update level rate
  const updateLevelRate = (level: number, newRate: number) => {
    const updatedRates = settings.level_rates.map(lr => 
      lr.level === level ? { ...lr, rate: newRate } : lr
    );
    setSettings({ ...settings, level_rates: updatedRates });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  // Get level badge color
  const getLevelColor = (level: number) => {
    if (level >= 10) return 'from-amber-500 to-yellow-500';
    if (level >= 8) return 'from-purple-500 to-pink-500';
    if (level >= 6) return 'from-blue-500 to-cyan-500';
    if (level >= 4) return 'from-green-500 to-emerald-500';
    if (level === 0) return 'from-slate-400 to-slate-500';
    return 'from-gray-400 to-gray-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
              <Phone className="w-6 h-6 text-white" />
            </div>
            Call Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Set up private call rates and commissions
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
        >
          {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30 dark:from-blue-500/10 dark:to-cyan-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <PhoneCall className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Calls</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatNumber(stats.total_calls)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30 dark:from-green-500/10 dark:to-emerald-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">Active</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.active_calls}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/30 dark:from-purple-500/10 dark:to-pink-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Total Minutes</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatNumber(stats.total_minutes)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/30 dark:from-amber-500/10 dark:to-orange-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500 rounded-lg">
                <Diamond className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">Total Earnings</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatNumber(stats.total_earnings)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grace Period Settings - MOVED TO TOP FOR VISIBILITY */}
      <Card className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 dark:from-orange-500/5 dark:to-amber-500/5 border-orange-500/30 border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Clock className="w-5 h-5 text-orange-500" />
            ⚡ First Minute Grace Period (Billing System)
          </CardTitle>
          <CardDescription>
            Set how many seconds into the first minute before hosts earn beans. If the call ends before this, the company keeps all diamonds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Grace Period Slider */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-slate-900 dark:text-white font-semibold">Grace Period (Seconds)</Label>
              <Badge className="text-xl font-bold bg-orange-500 px-4 py-1">
                {settings.first_minute_grace_seconds}s
              </Badge>
            </div>
            <Slider
              value={[settings.first_minute_grace_seconds]}
              onValueChange={(value) => setSettings({ ...settings, first_minute_grace_seconds: value[0] })}
              min={0}
              max={59}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0s</span>
              <span>30s</span>
              <span>59s</span>
            </div>
          </div>

          {/* Visual Explanation */}
          <div className="p-4 bg-gradient-to-r from-orange-500/20 to-amber-500/20 dark:from-orange-500/10 dark:to-amber-500/10 rounded-xl border border-orange-500/30">
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">🔄 How it works:</p>
            <div className="space-y-3">
              {/* First minute - before grace period */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-red-500 font-bold text-sm">1</span>
                </div>
                <div>
                  <p className="text-sm text-slate-900 dark:text-white font-medium">
                    First Minute (0-{settings.first_minute_grace_seconds}s)
                  </p>
                  <p className="text-xs text-red-500 dark:text-red-400">
                    ❌ Host earns no beans — Company keeps all diamonds
                  </p>
                </div>
              </div>

              {/* First minute - after grace period */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-green-500 font-bold text-sm">2</span>
                </div>
                <div>
                  <p className="text-sm text-slate-900 dark:text-white font-medium">
                    First Minute ({settings.first_minute_grace_seconds}s+)
                  </p>
                  <p className="text-xs text-green-500 dark:text-green-400">
                    ✅ Host earns beans ({settings.host_commission_percent}% commission)
                  </p>
                </div>
              </div>

              {/* Subsequent minutes */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-emerald-500 font-bold text-sm">3</span>
                </div>
                <div>
                  <p className="text-sm text-slate-900 dark:text-white font-medium">
                    Subsequent Minutes (2nd, 3rd, 4th...)
                  </p>
                  <p className="text-xs text-emerald-500 dark:text-emerald-400">
                    ✅ Host earns beans from second 1 of each minute
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Example Calculation */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-red-500/10 dark:bg-red-500/5 rounded-xl border border-red-500/30 text-center">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-2">
                If call ends before {settings.first_minute_grace_seconds} seconds
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-white/80 dark:bg-white/5 rounded">
                  <p className="font-bold text-slate-900 dark:text-white">Host</p>
                  <p className="text-red-500 font-bold">0 Beans</p>
                </div>
                <div className="p-2 bg-white/80 dark:bg-white/5 rounded">
                  <p className="font-bold text-slate-900 dark:text-white">Company</p>
                  <p className="text-blue-500 font-bold">{settings.default_rate} 💎</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-green-500/10 dark:bg-green-500/5 rounded-xl border border-green-500/30 text-center">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium mb-2">
                If call lasts {settings.first_minute_grace_seconds}+ seconds
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-white/80 dark:bg-white/5 rounded">
                  <p className="font-bold text-slate-900 dark:text-white">Host</p>
                  <p className="text-emerald-500 font-bold">{calculateHostBeans(settings.default_rate)} Beans</p>
                </div>
                <div className="p-2 bg-white/80 dark:bg-white/5 rounded">
                  <p className="font-bold text-slate-900 dark:text-white">Company</p>
                  <p className="text-blue-500 font-bold">{calculateCompanyShare(settings.default_rate)} 💎</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rate Settings */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Diamond className="w-5 h-5 text-cyan-500" />
              Call Rate Settings
            </CardTitle>
            <CardDescription>Diamonds charged per minute</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Default Rate */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-900 dark:text-white font-semibold">Default Rate (Diamonds/Min)</Label>
                <Badge className="text-lg font-bold bg-cyan-500">{settings.default_rate}</Badge>
              </div>
              <Input
                type="number"
                value={settings.default_rate}
                onChange={(e) => setSettings({ ...settings, default_rate: parseInt(e.target.value) || 0 })}
                className="text-lg font-semibold"
              />
              <p className="text-xs text-muted-foreground">
                Default rate for new hosts
              </p>
            </div>

            <Separator />

            {/* Min Rate */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-900 dark:text-white font-semibold">Minimum Rate</Label>
                <Badge variant="outline">{settings.min_rate}</Badge>
              </div>
              <Slider
                value={[settings.min_rate]}
                onValueChange={(value) => setSettings({ ...settings, min_rate: value[0] })}
                min={10}
                max={1000}
                step={10}
              />
            </div>

            {/* Max Rate */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-900 dark:text-white font-semibold">Maximum Rate</Label>
                <Badge variant="outline">{settings.max_rate}</Badge>
              </div>
              <Slider
                value={[settings.max_rate]}
                onValueChange={(value) => setSettings({ ...settings, max_rate: value[0] })}
                min={1000}
                max={50000}
                step={500}
              />
            </div>
          </CardContent>
        </Card>

        {/* Commission Settings */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Percent className="w-5 h-5 text-emerald-500" />
              Commission Settings
            </CardTitle>
            <CardDescription>Percentage of beans the host earns</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Commission Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-slate-900 dark:text-white font-semibold">Host Commission</Label>
                <Badge className="text-xl font-bold bg-emerald-500 px-4 py-1">
                  {settings.host_commission_percent}%
                </Badge>
              </div>
              <Slider
                value={[settings.host_commission_percent]}
                onValueChange={(value) => setSettings({ ...settings, host_commission_percent: value[0] })}
                min={10}
                max={90}
                step={5}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>10%</span>
                <span>50%</span>
                <span>90%</span>
              </div>
            </div>

            {/* Commission Preview */}
            <div className="p-4 bg-gradient-to-r from-emerald-500/20 to-green-500/20 dark:from-emerald-500/10 dark:to-green-500/10 rounded-xl border border-emerald-500/30">
              <p className="text-sm text-slate-900 dark:text-white font-medium mb-3">
                Example: Per {settings.default_rate} Diamonds
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-white/80 dark:bg-white/10 rounded-lg shadow-sm">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {calculateHostBeans(settings.default_rate)}
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">Host Beans</p>
                </div>
                <div className="text-center p-3 bg-white/80 dark:bg-white/10 rounded-lg shadow-sm">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {calculateCompanyShare(settings.default_rate)}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">Company Share</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>


        {/* Calculator */}
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Calculator className="w-5 h-5 text-purple-500" />
              Earning Calculator
            </CardTitle>
            <CardDescription>
              See how many beans host will earn for any diamond amount
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-6 items-center">
              {/* Input */}
              <div className="space-y-2">
                <Label className="text-slate-900 dark:text-white font-semibold">User Pays (Diamonds)</Label>
                <Input
                  type="number"
                  value={calcDiamonds}
                  onChange={(e) => setCalcDiamonds(parseInt(e.target.value) || 0)}
                  className="text-2xl font-bold text-center h-16"
                />
              </div>

              {/* Arrow */}
              <div className="hidden md:flex items-center justify-center">
                <div className="text-4xl text-muted-foreground">→</div>
              </div>

              {/* Host Beans */}
              <div className="p-4 bg-gradient-to-br from-emerald-500/20 to-green-500/20 dark:from-emerald-500/10 dark:to-green-500/10 rounded-xl border-2 border-emerald-500/30 text-center">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-1">Host Earns</p>
                <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
                  {calculateHostBeans(calcDiamonds).toLocaleString()}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Beans ({settings.host_commission_percent}%)</p>
              </div>

              {/* Company Share */}
              <div className="p-4 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 dark:from-blue-500/10 dark:to-cyan-500/10 rounded-xl border-2 border-blue-500/30 text-center">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">Company Earns</p>
                <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                  {calculateCompanyShare(calcDiamonds).toLocaleString()}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">💎 Diamonds ({100 - settings.host_commission_percent}%)</p>
              </div>
            </div>

            {/* Quick Examples */}
            <div className="mt-6 p-4 bg-slate-500/10 dark:bg-slate-500/5 rounded-xl">
              <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Quick Examples:</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[100, 500, 1000, 2000, 5000].map((amount) => (
                  <motion.button
                    key={amount}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setCalcDiamonds(amount)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      calcDiamonds === amount
                        ? 'bg-purple-500/20 border-purple-400 dark:bg-purple-500/10'
                        : 'bg-white/50 dark:bg-white/5 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{amount} 💎</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">→ {calculateHostBeans(amount)} Beans</p>
                  </motion.button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Other Settings */}
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Users className="w-5 h-5 text-blue-500" />
              Other Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Timeout */}
              <div className="space-y-3">
                <Label className="text-slate-900 dark:text-white font-semibold">Call Timeout (Seconds)</Label>
                <Input
                  type="number"
                  value={settings.call_timeout_seconds}
                  onChange={(e) => setSettings({ ...settings, call_timeout_seconds: parseInt(e.target.value) || 60 })}
                />
                <p className="text-xs text-muted-foreground">Time before call is missed if host doesn't answer</p>
              </div>

              {/* Low Balance Warning */}
              <div className="space-y-3">
                <Label className="text-slate-900 dark:text-white font-semibold">Low Balance Warning</Label>
                <Input
                  type="number"
                  value={settings.low_balance_warning_threshold}
                  onChange={(e) => setSettings({ ...settings, low_balance_warning_threshold: parseInt(e.target.value) || 2000 })}
                />
                <p className="text-xs text-muted-foreground">Show warning when balance drops below this amount</p>
              </div>

              {/* Toggles */}
              <div className="flex items-center justify-between p-4 bg-slate-500/10 dark:bg-slate-500/5 rounded-lg">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Video Calls</p>
                  <p className="text-xs text-muted-foreground">Allow video calls</p>
                </div>
                <Switch
                  checked={settings.allow_video_calls}
                  onCheckedChange={(checked) => setSettings({ ...settings, allow_video_calls: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-500/10 dark:bg-slate-500/5 rounded-lg">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Audio Calls</p>
                  <p className="text-xs text-muted-foreground">Allow audio-only calls</p>
                </div>
                <Switch
                  checked={settings.allow_audio_calls}
                  onCheckedChange={(checked) => setSettings({ ...settings, allow_audio_calls: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-500/10 dark:bg-slate-500/5 rounded-lg md:col-span-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Auto Disconnect</p>
                  <p className="text-xs text-muted-foreground">Automatically disconnect when balance runs out</p>
                </div>
                <Switch
                  checked={settings.auto_disconnect_on_low_balance}
                  onCheckedChange={(checked) => setSettings({ ...settings, auto_disconnect_on_low_balance: checked })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Level-Based Pricing */}
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Crown className="w-5 h-5 text-amber-500" />
              Level-Based Call Pricing
            </CardTitle>
            <CardDescription>
              Set per-minute call rates based on host level. Level {settings.min_level_for_custom_rate}+ hosts can update their own rates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Min Level for Custom Rate */}
            <div className="p-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 dark:from-amber-500/10 dark:to-orange-500/10 rounded-xl border border-amber-500/30">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-slate-900 dark:text-white font-semibold">Min Level for Custom Rate</Label>
                <Badge className="bg-amber-500 text-lg font-bold px-3">{settings.min_level_for_custom_rate}</Badge>
              </div>
              <Slider
                value={[settings.min_level_for_custom_rate]}
                onValueChange={(value) => setSettings({ ...settings, min_level_for_custom_rate: value[0] })}
                min={1}
                max={10}
                step={1}
              />
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Hosts at or above this level can update their call rate
              </p>
            </div>

            {/* Level Rate Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-border bg-slate-500/10 dark:bg-slate-500/5">
                    <th className="text-left p-3 text-slate-900 dark:text-white font-bold text-sm">Level</th>
                    <th className="text-left p-3 text-slate-900 dark:text-white font-bold text-sm">Rate (💎/min)</th>
                    <th className="text-center p-3 text-slate-900 dark:text-white font-bold text-sm">Host Earns (Beans)</th>
                    <th className="text-center p-3 text-slate-900 dark:text-white font-bold text-sm">Company (💎)</th>
                    <th className="text-center p-3 text-slate-900 dark:text-white font-bold text-sm">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.level_rates.map((lr) => (
                    <motion.tr 
                      key={lr.level}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: lr.level * 0.05 }}
                      className="border-b border-border hover:bg-slate-500/5 transition-colors"
                    >
                      {/* Level Badge */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getLevelColor(lr.level)} flex items-center justify-center text-white font-bold shadow-md`}>
                            {lr.level}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">Level {lr.level}</p>
                            {lr.level >= 10 && <span className="text-xs text-amber-600 dark:text-amber-400">👑 VIP</span>}
                            {lr.level >= 7 && lr.level < 10 && <span className="text-xs text-purple-600 dark:text-purple-400">⭐ Pro</span>}
                            {lr.level === 0 && <span className="text-xs text-slate-500 dark:text-slate-400">🆕 New</span>}
                          </div>
                        </div>
                      </td>
                      
                      {/* Rate Input */}
                      <td className="p-3">
                        <Input
                          type="number"
                          value={lr.rate}
                          onChange={(e) => updateLevelRate(lr.level, parseInt(e.target.value) || 0)}
                          className="w-28 font-bold text-center"
                          min={settings.min_rate}
                          max={settings.max_rate}
                        />
                      </td>
                      
                      {/* Host Beans */}
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1 bg-emerald-500/20 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-full font-bold">
                          <span className="text-lg">B</span>
                          <span>{calculateHostBeans(lr.rate).toLocaleString()}</span>
                        </div>
                      </td>
                      
                      {/* Company Share */}
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1 bg-blue-500/20 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-full font-bold">
                          <span className="text-lg">💎</span>
                          <span>{calculateCompanyShare(lr.rate).toLocaleString()}</span>
                        </div>
                      </td>
                      
                      {/* Status */}
                      <td className="p-3 text-center">
                        {lr.level >= settings.min_level_for_custom_rate ? (
                          <Badge className="bg-green-500">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Can Update
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Fixed
                          </Badge>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="grid md:grid-cols-3 gap-4 mt-6">
              <div className="p-4 bg-gradient-to-br from-purple-500/20 to-pink-500/20 dark:from-purple-500/10 dark:to-pink-500/10 rounded-xl border border-purple-500/30 text-center">
                <p className="text-sm text-purple-600 dark:text-purple-400 font-medium mb-1">Minimum Rate</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {Math.min(...settings.level_rates.map(lr => lr.rate)).toLocaleString()} 💎
                </p>
                <p className="text-xs text-purple-500 dark:text-purple-300 mt-1">
                  = {calculateHostBeans(Math.min(...settings.level_rates.map(lr => lr.rate))).toLocaleString()} Beans
                </p>
              </div>
              
              <div className="p-4 bg-gradient-to-br from-amber-500/20 to-orange-500/20 dark:from-amber-500/10 dark:to-orange-500/10 rounded-xl border border-amber-500/30 text-center">
                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium mb-1">Maximum Rate (Lv10)</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {settings.level_rates.find(lr => lr.level === 10)?.rate.toLocaleString() || 0} 💎
                </p>
                <p className="text-xs text-amber-500 dark:text-amber-300 mt-1">
                  = {calculateHostBeans(settings.level_rates.find(lr => lr.level === 10)?.rate || 0).toLocaleString()} Beans
                </p>
              </div>
              
              <div className="p-4 bg-gradient-to-br from-emerald-500/20 to-green-500/20 dark:from-emerald-500/10 dark:to-green-500/10 rounded-xl border border-emerald-500/30 text-center">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-1">Commission Rate</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {settings.host_commission_percent}%
                </p>
                <p className="text-xs text-emerald-500 dark:text-emerald-300 mt-1">Host earns {settings.host_commission_percent} Beans per 100💎</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
