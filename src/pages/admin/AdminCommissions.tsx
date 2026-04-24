import { useState, useEffect, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import {
  Save,
  Phone,
  TrendingUp,
  Building2,
  Users,
  Percent,
  Gift,
  PartyPopper,
  Music,
  Gamepad2,
  Video,
  Plus,
  Trash2,
  Clock,
  Calendar,
  DollarSign,
  ArrowRightLeft,
  Diamond,
  Coins
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { parseSettingValue, saveAppSetting } from "@/utils/adminSettingsStorage";

interface CommissionTier {
  min_earnings: number;
  percent: number;
}

interface TransferSchedule {
  day: string;
  time: string;
  enabled: boolean;
}

interface DiamondExchangeSettings {
  beans_to_diamonds_rate: number;
  exchange_fee_percent: number;
  min_exchange_amount: number;
}

interface DiamondTraderSettings {
  buy_rate: number; // Beans per dollar when buying from users
  sell_rate: number; // Beans per dollar when selling to users
  min_trade_amount: number;
  enabled: boolean;
}

interface CommissionSettings {
  call_rates: {
    min_rate: number;
    max_rate: number;
    default_rate: number;
    host_commission_percent: number;
    host_beans_per_call: number; // Fixed beans host gets
    user_diamonds_per_call: number; // Fixed diamonds user pays
    use_fixed_rate: boolean; // Use fixed rate or percentage
  };
  gift_commission: {
    host_percent: number;
  };
  agency_commission: {
    agency_percent: number;
    min_payout: number;
    commission_tiers: CommissionTier[];
    coins_to_dollar_rate: number;
  };
  transfer_schedule: TransferSchedule;
  coin_exchange: DiamondExchangeSettings;
  coin_trader: DiamondTraderSettings;
  party_room_defaults: {
    max_video_participants: number;
    max_audio_participants: number;
    max_game_participants: number;
    default_entry_fee: number;
    min_level_required: number;
  };
}

export default function AdminCommissions() {
  const [settings, setSettings] = useState<CommissionSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const actionGuardRef = useRef<Set<string>>(new Set());
  const guardStart = (key: string) => { if (actionGuardRef.current.has(key)) return false; actionGuardRef.current.add(key); return true; };
  const guardEnd = (key: string) => { actionGuardRef.current.delete(key); };
  const [calcBeansInput, setCalcBeansInput] = useState(10000);

  useAdminRealtime(['app_settings', 'agency_commission_history'], () => fetchSettings());

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

      // Default agency commission settings
      const defaultAgencyCommission = { 
        agency_percent: 2,
        min_payout: 10000,
        commission_tiers: [
          { min_earnings: 10000, percent: 3 },
          { min_earnings: 50000, percent: 5 },
          { min_earnings: 100000, percent: 7 },
          { min_earnings: 500000, percent: 10 }
        ],
        coins_to_dollar_rate: 10000
      };

      // Auto-initialize agency_commission if not exists
      if (!settingsMap.agency_commission) {
        await saveAppSetting('agency_commission', defaultAgencyCommission, 'Agency commission settings including tiered rates');
        settingsMap.agency_commission = defaultAgencyCommission;
      }

      setSettings({
        call_rates: settingsMap.call_rates || { 
          min_rate: 30, 
          max_rate: 500, 
          default_rate: 60, 
          host_commission_percent: 40,
          host_beans_per_call: 900,
          user_diamonds_per_call: 1800,
          use_fixed_rate: false
        },
        gift_commission: settingsMap.gift_commission || { 
          host_percent: 40 
        },
        agency_commission: settingsMap.agency_commission || defaultAgencyCommission,
        transfer_schedule: settingsMap.transfer_schedule || {
          day: 'sunday',
          time: '00:00',
          enabled: true
        },
        coin_exchange: settingsMap.coin_exchange || {
          beans_to_diamonds_rate: 100,
          exchange_fee_percent: 5,
          min_exchange_amount: 1000
        },
        coin_trader: settingsMap.coin_trade_settings || {
          buy_rate: 9500,
          sell_rate: 10500,
          min_trade_amount: 1000,
          enabled: true
        },
        party_room_defaults: settingsMap.party_room_defaults || { 
          max_video_participants: 4, 
          max_audio_participants: 12, 
          max_game_participants: 8,
          default_entry_fee: 0,
          min_level_required: 0
        }
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const saveSetting = async (key: string, value: any) => {
    if (!guardStart(`save-${key}`)) return;
    setSaving(key);
    try {
      await saveAppSetting(key, value, `${key} settings`);

      // NOTE: Commission tiers are now managed centrally in agency_level_tiers table
      // No sync needed - direct editing in Agency Management or Agency Policy pages

      toast.success("Settings saved successfully!");
    } catch (error) {
      console.error("Error saving setting:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(null);
      guardEnd(`save-${key}`);
    }
  };

  const handleCallRateChange = (field: string, value: number) => {
    if (!settings) return;
    const newRates = { ...settings.call_rates, [field]: value };
    setSettings({ ...settings, call_rates: newRates });
  };

  const handleGiftCommissionChange = (field: string, value: number) => {
    if (!settings) return;
    const newCommission = { ...settings.gift_commission, [field]: value };
    setSettings({ ...settings, gift_commission: newCommission });
  };

  const handleAgencyCommissionChange = (field: string, value: number | CommissionTier[]) => {
    if (!settings) return;
    const newCommission = { ...settings.agency_commission, [field]: value };
    setSettings({ ...settings, agency_commission: newCommission });
  };

  const handleTransferScheduleChange = (field: string, value: string | boolean) => {
    if (!settings) return;
    const newSchedule = { ...settings.transfer_schedule, [field]: value };
    setSettings({ ...settings, transfer_schedule: newSchedule });
  };

  const addCommissionTier = () => {
    if (!settings) return;
    const tiers = [...(settings.agency_commission.commission_tiers || [])];
    tiers.push({ min_earnings: 0, percent: 2 });
    handleAgencyCommissionChange('commission_tiers', tiers);
  };

  const updateCommissionTier = (index: number, field: 'min_earnings' | 'percent', value: number) => {
    if (!settings) return;
    const tiers = [...(settings.agency_commission.commission_tiers || [])];
    tiers[index] = { ...tiers[index], [field]: value };
    handleAgencyCommissionChange('commission_tiers', tiers);
  };

  const removeCommissionTier = (index: number) => {
    if (!settings) return;
    const tiers = [...(settings.agency_commission.commission_tiers || [])];
    tiers.splice(index, 1);
    handleAgencyCommissionChange('commission_tiers', tiers);
  };

  const handlePartyDefaultsChange = (field: string, value: number) => {
    if (!settings) return;
    const newDefaults = { ...settings.party_room_defaults, [field]: value };
    setSettings({ ...settings, party_room_defaults: newDefaults });
  };

  const handleDiamondExchangeChange = (field: string, value: number) => {
    if (!settings) return;
    const newExchange = { ...settings.coin_exchange, [field]: value };
    setSettings({ ...settings, coin_exchange: newExchange });
  };

  const handleCoinTraderChange = (field: string, value: number | boolean) => {
    if (!settings) return;
    const newTrader = { ...settings.coin_trader, [field]: value };
    setSettings({ ...settings, coin_trader: newTrader });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 p-2 md:p-0">
      {/* Header - Mobile Optimized */}
      <div className="flex items-center justify-between bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-white flex items-center gap-2 md:gap-3">
            <Percent className="w-5 h-5 md:w-7 md:h-7" />
            Commission Settings
          </h1>
          <p className="text-white/80 mt-1 text-xs md:text-sm">Manage all platform commissions</p>
        </div>
      </div>

      <Tabs defaultValue="call" className="space-y-4 md:space-y-6">
        {/* Tabs - Mobile Scrollable */}
        <div className="overflow-x-auto pb-2 -mx-2 px-2">
          <TabsList className="bg-slate-100 border border-slate-200 inline-flex w-auto min-w-full md:w-full gap-1 p-1">
            <TabsTrigger value="call" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white text-slate-700 font-medium text-xs md:text-sm whitespace-nowrap px-2 md:px-3">
              <Phone className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Call Commission</span>
              <span className="sm:hidden">Call</span>
            </TabsTrigger>
            <TabsTrigger value="gift" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white text-slate-700 font-medium text-xs md:text-sm whitespace-nowrap px-2 md:px-3">
              <Gift className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Gift Commission</span>
              <span className="sm:hidden">Gift</span>
            </TabsTrigger>
            <TabsTrigger value="agency" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white text-slate-700 font-medium text-xs md:text-sm whitespace-nowrap px-2 md:px-3">
              <Building2 className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Agency Commission</span>
              <span className="sm:hidden">Agency</span>
            </TabsTrigger>
            <TabsTrigger value="party" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white text-slate-700 font-medium text-xs md:text-sm whitespace-nowrap px-2 md:px-3">
              <PartyPopper className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Party Room</span>
              <span className="sm:hidden">Party</span>
            </TabsTrigger>
            <TabsTrigger value="exchange" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white text-slate-700 font-medium text-xs md:text-sm whitespace-nowrap px-2 md:px-3">
              <ArrowRightLeft className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Diamond Exchange</span>
              <span className="sm:hidden">Exchange</span>
            </TabsTrigger>
            <TabsTrigger value="trader" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white text-slate-700 font-medium text-xs md:text-sm whitespace-nowrap px-2 md:px-3">
              <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Diamond Trader</span>
              <span className="sm:hidden">Trader</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Call Commission */}
        <TabsContent value="call">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-400" />
                Call Rate & Commission Settings
              </CardTitle>
              <CardDescription className="text-white/60">
                Set beans rate per minute and host commission for private calls
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Per Minute Rate */}
              <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-lg border border-cyan-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-white font-medium">Beans Per Minute Rate</h3>
                </div>
                <p className="text-white/60 text-sm mb-4">
                  Set how many beans user pays per minute of call
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="w-4 h-4 text-amber-400" />
                      <Label className="text-amber-300">Beans Per Minute</Label>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      value={settings?.call_rates.default_rate || 60}
                      onChange={(e) => handleCallRateChange("default_rate", parseInt(e.target.value) || 0)}
                      className="bg-white/5 border-white/10 text-white text-lg font-bold"
                    />
                    <p className="text-xs text-white/50 mt-1">Deducted from user</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-4 h-4 text-green-400" />
                      <Label className="text-green-300">Company Commission (%)</Label>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={100 - (settings?.call_rates.host_commission_percent ?? 50)}
                      onChange={(e) => handleCallRateChange("host_commission_percent", 100 - (parseInt(e.target.value) || 0))}
                      className="bg-white/5 border-white/10 text-white text-lg font-bold"
                    />
                    <p className="text-xs text-white/50 mt-1">Host gets remaining %</p>
                  </div>
                </div>
              </div>

              {/* Real-time Calculator */}
              <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                  <h3 className="text-white font-medium">Real-time Calculator</h3>
                </div>
                
                {(() => {
                  const beansPerMinute = settings?.call_rates.default_rate ?? 2000;
                  const companyPercent = 100 - (settings?.call_rates.host_commission_percent ?? 50);
                  const hostPercent = settings?.call_rates.host_commission_percent ?? 50;
                  const companyEarns = Math.floor(beansPerMinute * companyPercent / 100);
                  const hostEarns = beansPerMinute - companyEarns;
                  
                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <Coins className="w-5 h-5 text-red-400" />
                          </div>
                          <p className="text-red-400 font-bold text-2xl">-{beansPerMinute}</p>
                          <p className="text-white/50 text-xs mt-1">Deducted from user</p>
                        </div>
                        <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/20">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <Building2 className="w-5 h-5 text-green-400" />
                          </div>
                          <p className="text-green-400 font-bold text-2xl">+{companyEarns}</p>
                          <p className="text-white/50 text-xs mt-1">Company gets ({companyPercent}%)</p>
                        </div>
                        <div className="bg-amber-500/10 rounded-lg p-4 border border-amber-500/20">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <Users className="w-5 h-5 text-amber-400" />
                          </div>
                          <p className="text-amber-400 font-bold text-2xl">+{hostEarns}</p>
                          <p className="text-white/50 text-xs mt-1">Host gets ({hostPercent}%)</p>
                        </div>
                      </div>
                      
                      <div className="bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-white/70 text-sm">
                          <span className="text-cyan-400 font-medium">1 Minute Call:</span>{' '}
                          User pays <span className="text-red-400 font-bold">{beansPerMinute}</span> beans, 
                          Company gets <span className="text-green-400 font-bold">{companyEarns}</span> beans ({companyPercent}%), 
                          Host gets <span className="text-amber-400 font-bold">{hostEarns}</span> beans ({hostPercent}%)
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <Button
                onClick={() => saveSetting("call_rates", settings?.call_rates)}
                disabled={saving === "call_rates"}
                className="w-full bg-primary"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving === "call_rates" ? "Saving..." : "Save Call Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gift Commission */}
        <TabsContent value="gift">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Gift className="w-5 h-5 text-pink-400" />
                Gift Commission Settings
              </CardTitle>
              <CardDescription className="text-white/60">
                Percentage of gift value the host receives
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-gradient-to-r from-pink-500/10 to-purple-500/10 rounded-lg border border-pink-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <Gift className="w-5 h-5 text-pink-400" />
                  <h3 className="text-white font-medium">Host Gift Commission</h3>
                </div>
                <p className="text-white/60 text-sm mb-4">
                  Set what percentage of beans the host receives from gifts
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white/60">Host Gift Commission (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={settings?.gift_commission.host_percent || 40}
                      onChange={(e) => handleGiftCommissionChange("host_percent", parseInt(e.target.value) || 0)}
                      className="bg-white/5 border-white/10 text-white mt-2"
                    />
                  </div>
                  <div className="flex items-center justify-center p-4 bg-white/5 rounded-lg">
                    <div className="text-center">
                      <p className="text-white/60 text-sm">Preview (1000 coin gift)</p>
                      <div className="flex items-center justify-center gap-4 mt-2">
                        <div>
                          <p className="text-red-400 font-bold text-lg">-1000</p>
                          <p className="text-white/40 text-xs">User pays</p>
                        </div>
                        <span className="text-white/40">→</span>
                        <div>
                          <p className="text-green-400 font-bold text-lg">+{Math.floor(1000 * (settings?.gift_commission.host_percent || 40) / 100)}</p>
                          <p className="text-white/40 text-xs">Host gets (Beans)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => saveSetting("gift_commission", settings?.gift_commission)}
                disabled={saving === "gift_commission"}
                className="w-full bg-primary"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving === "gift_commission" ? "Saving..." : "Save Gift Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agency Commission */}
        <TabsContent value="agency" className="space-y-6">
          {/* Base Commission Card */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-400" />
                Agency Base Commission
              </CardTitle>
              <CardDescription className="text-white/60">
                Percentage of host earnings the agency receives (Default)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-white/60">Base Commission (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={settings?.agency_commission.agency_percent || 2}
                    onChange={(e) => handleAgencyCommissionChange("agency_percent", parseInt(e.target.value) || 0)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">Default 2% for new agencies</p>
                </div>
                <div>
                  <Label className="text-white/60">Minimum Payout (Beans)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings?.agency_commission.min_payout || 10000}
                    onChange={(e) => handleAgencyCommissionChange("min_payout", parseInt(e.target.value) || 0)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">Minimum to withdraw</p>
                </div>
                <div>
                  <Label className="text-white/60">Beans → Dollar Rate</Label>
                  <Input
                    type="number"
                    min={100}
                    value={settings?.agency_commission.coins_to_dollar_rate || 10000}
                    onChange={(e) => handleAgencyCommissionChange("coins_to_dollar_rate", parseInt(e.target.value) || 10000)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">{settings?.agency_commission.coins_to_dollar_rate || 10000} Beans = $1</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tiered Commission Card - Now managed centrally in Agency Management */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                Tiered Commission System
              </CardTitle>
              <CardDescription className="text-white/60">
                Commission tiers are now managed centrally in Agency Management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-6 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20 text-center">
                <TrendingUp className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-white font-medium mb-2">Commission Tiers Centralized</h3>
                <p className="text-white/60 text-sm mb-4">
                  To prevent duplicate data and ensure consistency, commission tiers are now managed in a single location.
                  Any changes made there will automatically apply everywhere.
                </p>
                <Button
                  onClick={() => window.location.href = '/admin/agencies'}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Go to Agency Management
                </Button>
              </div>
              
              <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-white/60 text-sm mb-2">How it works:</p>
                <ul className="text-white/50 text-xs space-y-1">
                  <li>• Commission rates are based on host's weekly earnings</li>
                  <li>• Tiers are defined in USD (e.g., $0-500 = 3%, $500-1000 = 5%)</li>
                  <li>• Agency receives the matching tier's commission percentage</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Transfer Schedule Card */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                Weekly Transfer Schedule
              </CardTitle>
              <CardDescription className="text-white/60">
                When host beans are automatically transferred to agencies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-white/60">Transfer Day</Label>
                  <select
                    value={settings?.transfer_schedule?.day || 'sunday'}
                    onChange={(e) => handleTransferScheduleChange('day', e.target.value)}
                    className="w-full mt-2 h-10 px-3 bg-white/5 border border-white/10 text-white rounded-md"
                  >
                    <option value="sunday">Sunday</option>
                    <option value="monday">Monday</option>
                    <option value="tuesday">Tuesday</option>
                    <option value="wednesday">Wednesday</option>
                    <option value="thursday">Thursday</option>
                    <option value="friday">Friday</option>
                    <option value="saturday">Saturday</option>
                  </select>
                </div>
                <div>
                  <Label className="text-white/60">Transfer Time</Label>
                  <Input
                    type="time"
                    value={settings?.transfer_schedule?.time || '00:00'}
                    onChange={(e) => handleTransferScheduleChange('time', e.target.value)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant={settings?.transfer_schedule?.enabled ? "default" : "outline"}
                    onClick={() => handleTransferScheduleChange('enabled', !settings?.transfer_schedule?.enabled)}
                    className="w-full"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {settings?.transfer_schedule?.enabled ? 'Auto Transfer Enabled' : 'Auto Transfer Disabled'}
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <p className="text-white/80 text-sm font-medium">Automatic Transfer</p>
                </div>
                <p className="text-white/50 text-xs">
                  All host beans will be automatically transferred to agency wallets at the scheduled time each week.
                  Agencies can then withdraw their earnings.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex gap-3">
            <Button
              onClick={() => saveSetting("agency_commission", settings?.agency_commission)}
              disabled={saving === "agency_commission"}
              className="flex-1 bg-primary"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving === "agency_commission" ? "Saving..." : "Save Commission Settings"}
            </Button>
            <Button
              onClick={() => saveSetting("transfer_schedule", settings?.transfer_schedule)}
              disabled={saving === "transfer_schedule"}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving === "transfer_schedule" ? "Saving..." : "Save Schedule"}
            </Button>
          </div>
        </TabsContent>

        {/* Party Room Defaults */}
        <TabsContent value="party">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <PartyPopper className="w-5 h-5 text-yellow-400" />
                Party Room Defaults
              </CardTitle>
              <CardDescription className="text-white/60">
                Default configuration for party rooms
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Participants Limits */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Video className="w-5 h-5 text-blue-400" />
                    <h3 className="text-white font-medium">Video Room</h3>
                  </div>
                  <Label className="text-white/60 text-sm">Max Participants</Label>
                  <Input
                    type="number"
                    min={2}
                    max={12}
                    value={settings?.party_room_defaults.max_video_participants || 4}
                    onChange={(e) => handlePartyDefaultsChange("max_video_participants", parseInt(e.target.value) || 4)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                </div>

                <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Music className="w-5 h-5 text-purple-400" />
                    <h3 className="text-white font-medium">Audio Room</h3>
                  </div>
                  <Label className="text-white/60 text-sm">Max Participants</Label>
                  <Input
                    type="number"
                    min={2}
                    max={20}
                    value={settings?.party_room_defaults.max_audio_participants || 12}
                    onChange={(e) => handlePartyDefaultsChange("max_audio_participants", parseInt(e.target.value) || 12)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                </div>

                <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Gamepad2 className="w-5 h-5 text-green-400" />
                    <h3 className="text-white font-medium">Game Room</h3>
                  </div>
                  <Label className="text-white/60 text-sm">Max Participants</Label>
                  <Input
                    type="number"
                    min={2}
                    max={16}
                    value={settings?.party_room_defaults.max_game_participants || 8}
                    onChange={(e) => handlePartyDefaultsChange("max_game_participants", parseInt(e.target.value) || 8)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                </div>
              </div>

              {/* Entry Requirements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-white/60">Default Entry Fee (Coins)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings?.party_room_defaults.default_entry_fee || 0}
                    onChange={(e) => handlePartyDefaultsChange("default_entry_fee", parseInt(e.target.value) || 0)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">0 means free entry</p>
                </div>
                <div>
                  <Label className="text-white/60">Minimum Level Required</Label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={settings?.party_room_defaults.min_level_required || 0}
                    onChange={(e) => handlePartyDefaultsChange("min_level_required", parseInt(e.target.value) || 0)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">0 means everyone can join</p>
                </div>
              </div>

              <Button
                onClick={() => saveSetting("party_room_defaults", settings?.party_room_defaults)}
                disabled={saving === "party_room_defaults"}
                className="w-full bg-primary"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving === "party_room_defaults" ? "Saving..." : "Save Party Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Diamond Exchange Settings */}
        <TabsContent value="exchange">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-amber-400" />
                Diamond Exchange Settings
              </CardTitle>
              <CardDescription className="text-white/60">
                Set conversion rates for beans to diamonds and sales to users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-lg border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Coins className="w-5 h-5 text-amber-400" />
                    <h3 className="text-white font-medium">Exchange Rate</h3>
                  </div>
                  <Label className="text-white/60 text-sm">Beans → Diamonds Rate</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settings?.coin_exchange.beans_to_diamonds_rate || 100}
                    onChange={(e) => handleDiamondExchangeChange("beans_to_diamonds_rate", parseInt(e.target.value) || 100)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    {settings?.coin_exchange.beans_to_diamonds_rate || 100} Beans = 1 Diamond
                  </p>
                </div>

                <div className="p-4 bg-gradient-to-r from-red-500/10 to-pink-500/10 rounded-lg border border-red-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Percent className="w-5 h-5 text-red-400" />
                    <h3 className="text-white font-medium">Exchange Fee</h3>
                  </div>
                  <Label className="text-white/60 text-sm">Fee Percentage (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={settings?.coin_exchange.exchange_fee_percent || 5}
                    onChange={(e) => handleDiamondExchangeChange("exchange_fee_percent", parseInt(e.target.value) || 5)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    {settings?.coin_exchange.exchange_fee_percent || 5}% deducted during exchange
                  </p>
                </div>

                <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-lg border border-cyan-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Diamond className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-white font-medium">Minimum Exchange</h3>
                  </div>
                  <Label className="text-white/60 text-sm">Minimum Beans</Label>
                  <Input
                    type="number"
                    min={100}
                    value={settings?.coin_exchange.min_exchange_amount || 1000}
                    onChange={(e) => handleDiamondExchangeChange("min_exchange_amount", parseInt(e.target.value) || 1000)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    Minimum {settings?.coin_exchange.min_exchange_amount || 1000} beans to exchange
                  </p>
                </div>
              </div>

              {/* Real-time Calculator Preview */}
              <div className="p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-lg border border-amber-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <ArrowRightLeft className="w-5 h-5 text-amber-400" />
                  <h3 className="text-white font-medium">Real-time Calculator</h3>
                </div>
                
                {/* Calculator Input */}
                <div className="mb-4">
                  <Label className="text-white/60 text-sm">Enter Beans Amount</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="e.g. 10000"
                    value={calcBeansInput}
                    onChange={(e) => setCalcBeansInput(parseInt(e.target.value) || 0)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                </div>

                {(() => {
                  const fee = settings?.coin_exchange.exchange_fee_percent || 5;
                  const rate = settings?.coin_exchange.beans_to_diamonds_rate || 100;
                  const feeAmount = Math.floor(calcBeansInput * fee / 100);
                  const afterFee = calcBeansInput - feeAmount;
                  const diamonds = Math.floor(afterFee / rate);

                  return (
                    <div className="bg-white/5 p-4 rounded-lg">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                        {/* Input Beans */}
                        <div className="p-3 bg-amber-500/10 rounded-lg">
                          <Coins className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                          <p className="text-amber-400 font-bold text-lg">{calcBeansInput.toLocaleString()}</p>
                          <p className="text-white/40 text-xs">Input Beans</p>
                        </div>

                        {/* Fee Deduction */}
                        <div className="p-3 bg-red-500/10 rounded-lg">
                          <Percent className="w-4 h-4 text-red-400 mx-auto mb-1" />
                          <p className="text-red-400 font-bold text-lg">-{feeAmount.toLocaleString()}</p>
                          <p className="text-white/40 text-xs">Fee ({fee}%)</p>
                        </div>

                        {/* After Fee */}
                        <div className="p-3 bg-green-500/10 rounded-lg">
                          <TrendingUp className="w-5 h-5 text-green-400 mx-auto mb-1" />
                          <p className="text-green-400 font-bold text-lg">{afterFee.toLocaleString()}</p>
                          <p className="text-white/40 text-xs">Beans after Fee</p>
                        </div>

                        {/* Diamonds Output */}
                        <div className="p-3 bg-cyan-500/10 rounded-lg">
                          <Diamond className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                          <p className="text-cyan-400 font-bold text-lg">{diamonds.toLocaleString()}</p>
                          <p className="text-white/40 text-xs">Diamonds Receive</p>
                        </div>

                        {/* Company Earnings */}
                        <div className="p-3 bg-purple-500/10 rounded-lg">
                          <Building2 className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                          <p className="text-purple-400 font-bold text-lg">{feeAmount.toLocaleString()}</p>
                          <p className="text-white/40 text-xs">Company Receives</p>
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
                        <p className="text-white/70 text-sm text-center">
                          From <span className="text-amber-400 font-bold">{calcBeansInput.toLocaleString()}</span> beans,{" "}
                          after <span className="text-red-400 font-bold">{fee}%</span> ({feeAmount.toLocaleString()}) fee,{" "}
                          <span className="text-green-400 font-bold">{afterFee.toLocaleString()}</span> beans remain,{" "}
                          converting to <span className="text-cyan-400 font-bold">{diamonds.toLocaleString()}</span> diamonds
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <Button
                onClick={() => saveSetting("coin_exchange", settings?.coin_exchange)}
                disabled={saving === "coin_exchange"}
                className="w-full bg-amber-500 hover:bg-amber-600"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving === "coin_exchange" ? "Saving..." : "Save Exchange Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Diamond Trader Settings */}
        <TabsContent value="trader">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Diamond Trader Settings
              </CardTitle>
              <CardDescription className="text-white/60">
                Set buy/sell rates for agencies trading coins with users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                <div>
                  <h3 className="text-white font-medium">Diamond Trader System</h3>
                  <p className="text-white/60 text-sm">Buy/Sell facility for agencies</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings?.coin_trader.enabled || false}
                    onChange={(e) => handleCoinTraderChange("enabled", e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-white/70 text-sm">{settings?.coin_trader.enabled ? 'Active' : 'Inactive'}</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Buy Rate */}
                <div className="p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-5 h-5 text-blue-400" />
                    <h3 className="text-white font-medium">Buy Rate</h3>
                  </div>
                  <Label className="text-white/60 text-sm">Beans / $1 USD</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settings?.coin_trader.buy_rate || 9500}
                    onChange={(e) => handleCoinTraderChange("buy_rate", parseInt(e.target.value) || 9500)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    Agency buys from users at this rate
                  </p>
                </div>

                {/* Sell Rate */}
                <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    <h3 className="text-white font-medium">Sell Rate</h3>
                  </div>
                  <Label className="text-white/60 text-sm">Beans / $1 USD</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settings?.coin_trader.sell_rate || 10500}
                    onChange={(e) => handleCoinTraderChange("sell_rate", parseInt(e.target.value) || 10500)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    Agency sells to users at this rate
                  </p>
                </div>

                {/* Min Amount */}
                <div className="p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-lg border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Coins className="w-5 h-5 text-amber-400" />
                    <h3 className="text-white font-medium">Minimum Amount</h3>
                  </div>
                  <Label className="text-white/60 text-sm">Minimum Beans</Label>
                  <Input
                    type="number"
                    min={100}
                    value={settings?.coin_trader.min_trade_amount || 1000}
                    onChange={(e) => handleCoinTraderChange("min_trade_amount", parseInt(e.target.value) || 1000)}
                    className="bg-white/5 border-white/10 text-white mt-2"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    Minimum {settings?.coin_trader.min_trade_amount || 1000} beans to trade
                  </p>
                </div>
              </div>

              {/* Profit Preview */}
              <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-lg border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-white font-medium">Agency Profit Calculator</h3>
                </div>
                <div className="bg-white/5 p-4 rounded-lg">
                  <p className="text-white/60 text-sm text-center mb-3">Agency Profit per $10 Trade</p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-blue-400 font-bold text-lg">{((settings?.coin_trader.buy_rate || 9500) * 10).toLocaleString()}</p>
                      <p className="text-white/40 text-xs">Bought Beans ($10)</p>
                    </div>
                    <div>
                      <p className="text-green-400 font-bold text-lg">{((settings?.coin_trader.sell_rate || 10500) * 10).toLocaleString()}</p>
                      <p className="text-white/40 text-xs">Sold Beans ($10)</p>
                    </div>
                    <div>
                      <p className="text-amber-400 font-bold text-lg">
                        {(((settings?.coin_trader.sell_rate || 10500) - (settings?.coin_trader.buy_rate || 9500)) * 10).toLocaleString()}
                      </p>
                      <p className="text-white/40 text-xs">Profit Beans</p>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => saveSetting("coin_trade_settings", settings?.coin_trader)}
                disabled={saving === "coin_trade_settings"}
                className="w-full bg-emerald-500 hover:bg-emerald-600"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving === "coin_trade_settings" ? "Saving..." : "Save Trader Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
