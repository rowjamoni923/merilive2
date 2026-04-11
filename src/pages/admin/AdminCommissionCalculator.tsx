import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Calculator, Save, Gift, Phone, Coins, 
  TrendingUp, Building2, Users, Sparkles, CheckCircle,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { loadAppSetting, saveAppSetting } from "@/utils/adminSettingsStorage";

interface CommissionSettings {
  gift_commission: {
    company_percent: number;
    description: string;
  };
  call_rates: {
    company_percent: number;
    per_minute_rate: number;
    description: string;
  };
}

const AdminCommissionCalculator = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Commission settings
  const [giftCompanyPercent, setGiftCompanyPercent] = useState(40);
  const [callCompanyPercent, setCallCompanyPercent] = useState(40);
  const [callPerMinuteRate, setCallPerMinuteRate] = useState(100);
  
  // Calculator inputs
  const [giftAmount, setGiftAmount] = useState(1000);
  
  // Example calculations
  const exampleGiftAmounts = [100, 500, 1000, 5000, 10000, 50000, 100000];

  useAdminRealtime(['app_settings'], () => fetchSettings());

  const fetchSettings = async () => {
    setLoading(true);
    try {
      // Fetch gift commission settings
      const giftSettings = await loadAppSetting<any>('gift_commission');

      if (giftSettings) {
        const value = giftSettings as any;
        setGiftCompanyPercent(value.company_percent ?? 40);
      }
      
      // Fetch call rates settings
      const callSettings = await loadAppSetting<any>('call_rates');

      if (callSettings) {
        const value = callSettings as any;
        // Convert from host_commission_percent to company_percent
        if (value.company_percent !== undefined) {
          setCallCompanyPercent(value.company_percent);
        } else if (value.host_commission_percent !== undefined) {
          setCallCompanyPercent(100 - value.host_commission_percent);
        }
        // Use per_minute_rate or default_rate (fallback)
        setCallPerMinuteRate(value.per_minute_rate ?? value.default_rate ?? 100);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await saveAppSetting(
        'gift_commission',
        {
          company_percent: giftCompanyPercent,
          host_percent: 100 - giftCompanyPercent,
          description: `Company takes ${giftCompanyPercent}%, Host receives ${100 - giftCompanyPercent}%`
        },
        'Gift commission distribution settings'
      );

      await saveAppSetting(
        'call_rates',
        {
          company_percent: callCompanyPercent,
          host_commission_percent: 100 - callCompanyPercent,
          per_minute_rate: callPerMinuteRate,
          default_rate: callPerMinuteRate,
          description: `Company takes ${callCompanyPercent}%, Host receives ${100 - callCompanyPercent}% at ${callPerMinuteRate} coins/min`
        },
        'Call rates and commission settings'
      );
      
      toast({
        title: "✅ Saved!",
        description: "Commission settings updated successfully"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  // Calculate gift distribution
  const calculateGiftDistribution = (amount: number) => {
    const hostPercent = 100 - giftCompanyPercent;
    const hostAmount = Math.round(amount * hostPercent / 100);
    const companyAmount = amount - hostAmount;
    return { hostAmount, companyAmount, hostPercent };
  };

  // Calculate call earnings
  const calculateCallEarnings = (minutes: number) => {
    const totalCoins = minutes * callPerMinuteRate;
    const hostPercent = 100 - callCompanyPercent;
    const hostAmount = Math.round(totalCoins * hostPercent / 100);
    const companyAmount = totalCoins - hostAmount;
    return { totalCoins, hostAmount, companyAmount, hostPercent };
  };

  const formatNumber = (num: number) => num.toLocaleString();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-white hover:bg-white/20" 
            onClick={() => navigate('/admin')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-bold text-xl text-white flex items-center gap-2">
              <Calculator className="w-6 h-6" />
              Commission Calculator
            </h1>
            <p className="text-white/80 text-sm">AI-Powered Earnings Calculator</p>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
              <Gift className="w-4 h-4" />
              Gift Commission
            </div>
            <p className="text-white font-bold text-lg">
              Host {100 - giftCompanyPercent}% • Company {giftCompanyPercent}%
            </p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
              <Phone className="w-4 h-4" />
              Call Commission
            </div>
            <p className="text-white font-bold text-lg">
              Host {100 - callCompanyPercent}% • {callPerMinuteRate}/min
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-6">
        <Tabs defaultValue="gift" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="gift" className="flex items-center gap-2">
              <Gift className="w-4 h-4" />
              Gift Commission
            </TabsTrigger>
            <TabsTrigger value="call" className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Call Commission
            </TabsTrigger>
          </TabsList>

          {/* Gift Commission Tab */}
          <TabsContent value="gift" className="space-y-4 mt-4">
            <Card className="border-purple-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  Gift Commission Settings
                </CardTitle>
                <CardDescription>
                  Set the company and host share from gifting
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-base">Company Share</Label>
                    <Badge variant="outline" className="text-lg font-bold">
                      {giftCompanyPercent}%
                    </Badge>
                  </div>
                  <Slider
                    value={[giftCompanyPercent]}
                    onValueChange={(v) => setGiftCompanyPercent(v[0])}
                    min={10}
                    max={90}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>10%</span>
                    <span>90%</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 mx-auto flex items-center justify-center mb-2">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm text-slate-600">Host Gets</p>
                    <p className="text-2xl font-bold text-pink-600">{100 - giftCompanyPercent}%</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 mx-auto flex items-center justify-center mb-2">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm text-slate-600">Company Gets</p>
                    <p className="text-2xl font-bold text-purple-600">{giftCompanyPercent}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-blue-500" />
                  Gift Calculator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Gift Amount (Coins)</Label>
                  <Input 
                    type="number"
                    value={giftAmount}
                    onChange={(e) => setGiftAmount(Number(e.target.value) || 0)}
                    className="text-lg"
                  />
                  <div className="flex flex-wrap gap-2">
                    {exampleGiftAmounts.map(amount => (
                      <Button
                        key={amount}
                        variant="outline"
                        size="sm"
                        onClick={() => setGiftAmount(amount)}
                        className={cn(
                          "text-xs",
                          giftAmount === amount && "bg-purple-100 border-purple-300"
                        )}
                      >
                        {formatNumber(amount)}
                      </Button>
                    ))}
                  </div>
                </div>

                {giftAmount > 0 && (
                  <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200">
                    <p className="text-sm text-slate-600 mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      If {formatNumber(giftAmount)} coins gifted:
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <p className="text-xs text-slate-500">Host Gets</p>
                        <p className="text-xl font-bold text-green-600">
                          {formatNumber(calculateGiftDistribution(giftAmount).hostAmount)} 💎
                        </p>
                        <p className="text-xs text-slate-400">
                          ({calculateGiftDistribution(giftAmount).hostPercent}%)
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <p className="text-xs text-slate-500">Company Gets</p>
                        <p className="text-xl font-bold text-purple-600">
                          {formatNumber(calculateGiftDistribution(giftAmount).companyAmount)} 💎
                        </p>
                        <p className="text-xs text-slate-400">
                          ({giftCompanyPercent}%)
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-500" />
                  Examples Table
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Gift</th>
                        <th className="text-right py-2 px-2">Host Gets</th>
                        <th className="text-right py-2 px-2">Company Gets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exampleGiftAmounts.map(amount => {
                        const { hostAmount, companyAmount } = calculateGiftDistribution(amount);
                        return (
                          <tr key={amount} className="border-b hover:bg-slate-50">
                            <td className="py-2 px-2 font-medium">{formatNumber(amount)} 💎</td>
                            <td className="py-2 px-2 text-right text-green-600 font-semibold">
                              {formatNumber(hostAmount)}
                            </td>
                            <td className="py-2 px-2 text-right text-purple-600">
                              {formatNumber(companyAmount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Call Commission Tab */}
          <TabsContent value="call" className="space-y-4 mt-4">
            <Card className="border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Phone className="w-5 h-5 text-blue-500" />
                  Call Commission Settings
                </CardTitle>
                <CardDescription>
                  Set the company and host share from calls
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Rate Per Minute (Coins)</Label>
                  <Input 
                    type="number"
                    value={callPerMinuteRate}
                    onChange={(e) => setCallPerMinuteRate(Number(e.target.value) || 0)}
                    className="text-lg"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].map(rate => (
                      <Button
                        key={rate}
                        variant="outline"
                        size="sm"
                        onClick={() => setCallPerMinuteRate(rate)}
                        className={cn(
                          "text-xs",
                          callPerMinuteRate === rate && "bg-blue-100 border-blue-300"
                        )}
                      >
                        {rate}/min
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-base">Company Share</Label>
                    <Badge variant="outline" className="text-lg font-bold">
                      {callCompanyPercent}%
                    </Badge>
                  </div>
                  <Slider
                    value={[callCompanyPercent]}
                    onValueChange={(v) => setCallCompanyPercent(v[0])}
                    min={10}
                    max={90}
                    step={5}
                    className="w-full"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 mx-auto flex items-center justify-center mb-2">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm text-slate-600">Host Gets</p>
                    <p className="text-2xl font-bold text-blue-600">{100 - callCompanyPercent}%</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 mx-auto flex items-center justify-center mb-2">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm text-slate-600">Company Gets</p>
                    <p className="text-2xl font-bold text-violet-600">{callCompanyPercent}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Per Minute Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200">
                  <p className="text-sm text-slate-600 mb-3 text-center">
                    Every 60 seconds <span className="font-bold text-lg text-blue-600">{formatNumber(callPerMinuteRate)}</span> coins deducted
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg p-4 shadow-sm text-center">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 mx-auto flex items-center justify-center mb-2">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <p className="text-xs text-slate-500">Host Gets</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {formatNumber(calculateCallEarnings(1).hostAmount)} 💎
                      </p>
                      <p className="text-xs text-green-600">
                        ({100 - callCompanyPercent}%)
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm text-center">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 mx-auto flex items-center justify-center mb-2">
                        <Building2 className="w-5 h-5 text-white" />
                      </div>
                      <p className="text-xs text-slate-500">Company Gets</p>
                      <p className="text-2xl font-bold text-violet-600">
                        {formatNumber(calculateCallEarnings(1).companyAmount)} 💎
                      </p>
                      <p className="text-xs text-purple-600">
                        ({callCompanyPercent}%)
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <Button 
          onClick={saveSettings}
          disabled={saving}
          className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 py-6 text-lg"
        >
          {saving ? (
            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <Save className="w-5 h-5 mr-2" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
};

export default AdminCommissionCalculator;
