import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import {
  Coins,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  DollarSign,
  Percent,
  Star,
  Sparkles,
  Globe,
  RefreshCw,
  Diamond,
  ThumbsUp,
  ArrowRightLeft,
  Calculator,
  TrendingUp,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { loadAppSetting, saveAppSetting } from "@/utils/adminSettingsStorage";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface DiamondPackage {
  id: string;
  coins: number; // DB column - represents diamonds
  base_coins: number;
  price_usd: number;
  bonus_percentage: number;
  is_popular: boolean;
  is_best_value: boolean;
  is_active: boolean;
  display_order: number;
}

interface CurrencyRate {
  id: string;
  country_code: string;
  currency_code: string;
  currency_symbol: string;
  rate_to_usd: number;
  is_active: boolean;
}

export default function AdminCoins() {
  const [packages, setPackages] = useState<DiamondPackage[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPackageDialog, setShowPackageDialog] = useState(false);
  const [showCurrencyDialog, setShowCurrencyDialog] = useState(false);
  const [editingPackage, setEditingPackage] = useState<DiamondPackage | null>(null);
  const [editingCurrency, setEditingCurrency] = useState<CurrencyRate | null>(null);
  const [beansToUsdRate, setBeansToUsdRate] = useState(10000); // Default: 10,000 beans = $1
  const [savingExchangeRate, setSavingExchangeRate] = useState(false);
  const [updatingRates, setUpdatingRates] = useState(false);
  const [liveRates, setLiveRates] = useState<Array<{
    code: string;
    currency: string;
    symbol: string;
    name: string;
    marketRate: number;
    adjustedRate: number;
  }>>([]);
  const [ratesSource, setRatesSource] = useState<string>('');
  const [ratesFetchedAt, setRatesFetchedAt] = useState<string>('');
  
  const [packageForm, setPackageForm] = useState({
    coins: 1000,
    base_coins: 1000,
    price_usd: 0.99,
    bonus_percentage: 0,
    is_popular: false,
    is_best_value: false,
    is_active: true,
    display_order: 0
  });

  const [currencyForm, setCurrencyForm] = useState({
    country_code: '',
    currency_code: '',
    currency_symbol: '',
    rate_to_usd: 1,
    is_active: true
  });

  // International exchange rates (market rate - 5 for our app)
  const internationalRates: Record<string, { rate: number; symbol: string; name: string }> = {
    'BD': { rate: 110.50, symbol: 'Tk ', name: 'Bangladesh Taka' },
    'IN': { rate: 83.00, symbol: '₹', name: 'Indian Rupee' },
    'PK': { rate: 278.00, symbol: 'Rs', name: 'Pakistani Rupee' },
    'NP': { rate: 132.00, symbol: 'रू', name: 'Nepalese Rupee' },
    'AE': { rate: 3.67, symbol: 'د.إ', name: 'UAE Dirham' },
    'SA': { rate: 3.75, symbol: 'ر.س', name: 'Saudi Riyal' },
    'KW': { rate: 0.31, symbol: 'د.ك', name: 'Kuwaiti Dinar' },
    'QA': { rate: 3.64, symbol: 'ر.ق', name: 'Qatari Riyal' },
    'OM': { rate: 0.38, symbol: 'ر.ع', name: 'Omani Rial' },
    'MY': { rate: 4.70, symbol: 'RM', name: 'Malaysian Ringgit' },
    'SG': { rate: 1.35, symbol: 'S$', name: 'Singapore Dollar' },
    'GB': { rate: 0.79, symbol: '£', name: 'British Pound' },
    'AU': { rate: 1.53, symbol: 'A$', name: 'Australian Dollar' },
    'CA': { rate: 1.36, symbol: 'C$', name: 'Canadian Dollar' },
    'EU': { rate: 0.92, symbol: '€', name: 'Euro' },
    'JP': { rate: 149.00, symbol: '¥', name: 'Japanese Yen' },
    'KR': { rate: 1320.00, symbol: '₩', name: 'Korean Won' },
    'PH': { rate: 56.00, symbol: '₱', name: 'Philippine Peso' },
    'ID': { rate: 15700.00, symbol: 'Rp', name: 'Indonesian Rupiah' },
    'TH': { rate: 35.00, symbol: '฿', name: 'Thai Baht' },
    'VN': { rate: 24500.00, symbol: '₫', name: 'Vietnamese Dong' },
    'EG': { rate: 30.90, symbol: 'E£', name: 'Egyptian Pound' },
    'TR': { rate: 32.00, symbol: '₺', name: 'Turkish Lira' },
    'ZA': { rate: 18.50, symbol: 'R', name: 'South African Rand' },
    'NG': { rate: 1550.00, symbol: '₦', name: 'Nigerian Naira' },
    'KE': { rate: 153.00, symbol: 'KSh', name: 'Kenyan Shilling' },
    'GH': { rate: 12.50, symbol: 'GH₵', name: 'Ghanaian Cedi' },
    'US': { rate: 1.00, symbol: '$', name: 'US Dollar' },
  };

  const normalizePackage = (pkg: any): DiamondPackage => {
    const baseCoins = Number(pkg?.base_coins ?? pkg?.coins_amount ?? pkg?.coins ?? 0);
    const bonusCoins = Number(pkg?.bonus_coins ?? 0);
    const totalCoins = Number(pkg?.coins ?? (baseCoins + bonusCoins));
    const bonusPercentage = Number(
      pkg?.bonus_percentage
      ?? pkg?.discount_percent
      ?? (bonusCoins > 0 && baseCoins > 0 ? Math.round((bonusCoins / baseCoins) * 100) : 0)
    );

    return {
      id: String(pkg?.id ?? ''),
      coins: Number.isFinite(totalCoins) ? totalCoins : 0,
      base_coins: Number.isFinite(baseCoins) ? baseCoins : 0,
      price_usd: Number(pkg?.price_usd ?? 0),
      bonus_percentage: Number.isFinite(bonusPercentage) ? bonusPercentage : 0,
      is_popular: Boolean(pkg?.is_popular),
      is_best_value: Boolean(pkg?.is_best_value),
      is_active: pkg?.is_active ?? true,
      display_order: Number(pkg?.display_order ?? 0),
    };
  };

  useAdminRealtime(['coin_packages', 'currency_rates', 'app_settings'], () => fetchData());

  const fetchData = async () => {
    setLoading(true);
    try {
      const [packagesRes, currenciesRes, settingsValue] = await Promise.all([
        supabase.from("coin_packages").select("*").order("display_order"),
        supabase.from("currency_rates").select("*").order("country_code"),
        loadAppSetting<{ rate?: number }>("beans_to_usd_rate")
      ]);

      if (packagesRes.error) throw packagesRes.error;
      if (currenciesRes.error) throw currenciesRes.error;

      setPackages((packagesRes.data || []).map(normalizePackage));
      setCurrencies(currenciesRes.data || []);
      
      if (settingsValue) {
        const value = settingsValue as { rate?: number };
        if (value.rate) {
          setBeansToUsdRate(value.rate);
        }
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminCoins.ErrorFetchingData", message: formatAdminError(error)});
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBeansToUsdRate = async () => {
    setSavingExchangeRate(true);
    try {
      await saveAppSetting(
        "beans_to_usd_rate",
        { rate: beansToUsdRate },
        "Beans to USD exchange rate"
      );
      
      toast.success("Beans to USD rate saved!");
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminCoins.ErrorSavingRate", message: formatAdminError(error)});
      toast.error(error.message || "Failed to save rate");
    } finally {
      setSavingExchangeRate(false);
    }
  };

  // Fetch live exchange rates from AI/API
  const handleFetchLiveRates = async () => {
    setUpdatingRates(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-exchange-rates');
      
      if (error) throw error;
      
      if (data?.success && data?.rates) {
        setLiveRates(data.rates);
        setRatesSource(data.source === 'ai' ? 'AI (Gemini)' : 'Exchange Rate API');
        setRatesFetchedAt(new Date(data.fetchedAt).toLocaleString('en-US'));
        toast.success(`Found rates for ${data.rates.length} countries from ${data.source === 'ai' ? 'AI' : 'API'}!`);
      } else {
        throw new Error(data?.error || "Failed to fetch rates");
      }
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminCoins.ErrorFetchingLiveRates", message: formatAdminError(error)});
      toast.error(error.message || "Failed to fetch live rates");
    } finally {
      setUpdatingRates(false);
    }
  };

  // Save fetched rates to database
  const handleSaveLiveRates = async () => {
    if (liveRates.length === 0) {
      toast.error("Fetch rates first");
      return;
    }
    
    setUpdatingRates(true);
    try {
      let successCount = 0;
      
      for (const rate of liveRates) {
        // Check if currency exists
        const { data: existing } = await supabase
          .from("currency_rates")
          .select("id")
          .eq("country_code", rate.code)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("currency_rates")
            .update({ 
              rate_to_usd: rate.adjustedRate,
              updated_at: new Date().toISOString()
            })
            .eq("id", existing.id);
          if (!error) successCount++;
        } else {
          const { error } = await supabase
            .from("currency_rates")
            .insert({
              country_code: rate.code,
              currency_code: rate.currency,
              currency_symbol: rate.symbol,
              rate_to_usd: rate.adjustedRate,
              is_active: true
            });
          if (!error) successCount++;
        }
      }
      
      toast.success(`${successCount} currency rates saved!`);
      fetchData();
      setLiveRates([]); // Clear after saving
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminCoins.ErrorSavingRates", message: formatAdminError(error)});
      toast.error(error.message || "Failed to save rates");
    } finally {
      setUpdatingRates(false);
    }
  };

  const handleUpdateAllCurrencyRates = async () => {
    setUpdatingRates(true);
    try {
      // Update all currencies with international rates minus 5 (in local currency)
      for (const [countryCode, rateInfo] of Object.entries(internationalRates)) {
        const adjustedRate = rateInfo.rate - 5; // Subtract 5 local currency units (not USD)
        
        // Check if currency exists
        const { data: existing } = await supabase
          .from("currency_rates")
          .select("id")
          .eq("country_code", countryCode)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("currency_rates")
            .update({ 
              rate_to_usd: adjustedRate,
              updated_at: new Date().toISOString()
            })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("currency_rates")
            .insert({
              country_code: countryCode,
              currency_code: countryCode === 'US' ? 'USD' : countryCode,
              currency_symbol: rateInfo.symbol,
              rate_to_usd: adjustedRate,
              is_active: true
            });
        }
      }
      
      toast.success("All currency rates updated!");
      fetchData();
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminCoins.ErrorUpdatingRates", message: formatAdminError(error)});
      toast.error(error.message || "Failed to update rates");
    } finally {
      setUpdatingRates(false);
    }
  };

  // Package functions
  const handleAddPackage = () => {
    setEditingPackage(null);
    setPackageForm({
      coins: 1000,
      base_coins: 1000,
      price_usd: 0.99,
      bonus_percentage: 0,
      is_popular: false,
      is_best_value: false,
      is_active: true,
      display_order: packages.length + 1
    });
    setShowPackageDialog(true);
  };

  const handleEditPackage = (pkg: DiamondPackage) => {
    setEditingPackage(pkg);
    setPackageForm({
      coins: pkg.coins,
      base_coins: pkg.base_coins,
      price_usd: pkg.price_usd,
      bonus_percentage: pkg.bonus_percentage,
      is_popular: pkg.is_popular,
      is_best_value: pkg.is_best_value,
      is_active: pkg.is_active,
      display_order: pkg.display_order
    });
    setShowPackageDialog(true);
  };

  const handleSavePackage = async () => {
    setSaving(true);
    try {
      const baseCoins = Number(packageForm.base_coins || packageForm.coins || 0);
      const totalCoins = Number(packageForm.coins || 0);
      const bonusCoins = Math.max(totalCoins - baseCoins, 0);
      // Only send columns that exist in the DB schema
      const packagePayload = {
        coins_amount: baseCoins,
        bonus_coins: bonusCoins,
        price_usd: Number(packageForm.price_usd || 0),
        discount_percent: Number(packageForm.bonus_percentage || 0),
        display_order: Number(packageForm.display_order || 0),
        is_popular: packageForm.is_popular,
        is_active: packageForm.is_active,
        name: `${baseCoins} Diamonds`,
        description: '',
        product_id: `diamonds_${baseCoins}`,
      };

      if (editingPackage) {
        const { error } = await supabase
          .from("coin_packages")
          .update(packagePayload)
          .eq("id", editingPackage.id);
        if (error) throw error;
        toast.success("Package updated");
      } else {
        const { error } = await supabase
          .from("coin_packages")
          .insert(packagePayload);
        if (error) throw error;
        toast.success("New package created");
      }
      setShowPackageDialog(false);
      fetchData();
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminCoins.ErrorSavingPackage", message: formatAdminError(error)});
      toast.error(error.message || "Failed to save package");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePackage = async (id: string) => {
    try {
      const { error } = await supabase
        .from("coin_packages")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Package deleted");
      fetchData();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminCoins.ErrorDeletingPackage", message: formatAdminError(error)});
      toast.error("Failed to delete");
    }
  };

  const handleTogglePackageActive = async (pkg: DiamondPackage) => {
    try {
      const { error } = await supabase
        .from("coin_packages")
        .update({ is_active: !pkg.is_active })
        .eq("id", pkg.id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminCoins.ErrorTogglingPackage", message: formatAdminError(error)});
    }
  };

  // Currency functions
  const handleAddCurrency = () => {
    setEditingCurrency(null);
    setCurrencyForm({
      country_code: '',
      currency_code: '',
      currency_symbol: '',
      rate_to_usd: 1,
      is_active: true
    });
    setShowCurrencyDialog(true);
  };

  const handleEditCurrency = (currency: CurrencyRate) => {
    setEditingCurrency(currency);
    setCurrencyForm({
      country_code: currency.country_code,
      currency_code: currency.currency_code,
      currency_symbol: currency.currency_symbol,
      rate_to_usd: currency.rate_to_usd,
      is_active: currency.is_active
    });
    setShowCurrencyDialog(true);
  };

  const handleSaveCurrency = async () => {
    setSaving(true);
    try {
      if (editingCurrency) {
        const { error } = await supabase
          .from("currency_rates")
          .update(currencyForm)
          .eq("id", editingCurrency.id);
        if (error) throw error;
        toast.success("Currency updated");
      } else {
        const { error } = await supabase
          .from("currency_rates")
          .insert(currencyForm);
        if (error) throw error;
        toast.success("New currency added");
      }
      setShowCurrencyDialog(false);
      fetchData();
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminCoins.ErrorSavingCurrency", message: formatAdminError(error)});
      toast.error(error.message || "Failed to save currency");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrency = async (id: string) => {
    try {
      const { error } = await supabase
        .from("currency_rates")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Currency deleted");
      fetchData();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminCoins.ErrorDeletingCurrency", message: formatAdminError(error)});
      toast.error("Failed to delete");
    }
  };

  const formatCoins = (coins: number | null | undefined) => {
    const safeCoins = Number(coins ?? 0);
    if (!Number.isFinite(safeCoins)) return "0";
    if (safeCoins >= 1000000) return `${(safeCoins / 1000000).toFixed(1)}M`;
    if (safeCoins >= 1000) return `${(safeCoins / 1000).toFixed(1)}K`;
    return safeCoins.toString();
  };

  return (
    <div className="admin-pro-shell space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 p-4 md:p-6 bg-gradient-to-r from-white via-cyan-50/50 to-blue-50/50 rounded-xl md:rounded-2xl shadow-lg border border-slate-200/50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Diamond className="w-5 h-5 md:w-7 md:h-7 text-cyan-500" />
              Diamond & Currency
            </h1>
            <p className="text-slate-600 text-xs md:text-sm mt-1">Recharge packages & currency rates</p>
          </div>
          <Button onClick={fetchData} variant="outline" size="sm" className="gap-2 self-start md:self-auto">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="exchange" className="space-y-4">
        <TabsList className="bg-white border border-gray-200 p-1 w-full md:w-auto grid grid-cols-3 md:flex rounded-lg shadow-sm">
          <TabsTrigger value="exchange" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md gap-1 md:gap-2 text-xs md:text-sm text-gray-700 font-medium rounded-md">
            <ArrowRightLeft className="w-3 h-3 md:w-4 md:h-4" />
            Exchange Rate
          </TabsTrigger>
          <TabsTrigger value="packages" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-md gap-1 md:gap-2 text-xs md:text-sm text-gray-700 font-medium rounded-md">
            <Diamond className="w-3 h-3 md:w-4 md:h-4" />
            Packages
          </TabsTrigger>
          <TabsTrigger value="currencies" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md gap-1 md:gap-2 text-xs md:text-sm text-gray-700 font-medium rounded-md">
            <Globe className="w-3 h-3 md:w-4 md:h-4" />
            Currencies
          </TabsTrigger>
        </TabsList>

        {/* Exchange Rate Tab */}
        <TabsContent value="exchange" className="space-y-4">
          {/* Beans to USD Rate Card */}
          <Card className="bg-slate-50 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-amber-400">
                <Coins className="w-5 h-5" />
                Beans to USD Exchange Rate
              </CardTitle>
              <p className="text-slate-300 text-sm">
                Set how many Beans equal $1. This rate applies to all agencies.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <Label className="text-amber-400 font-medium">Beans Amount (per $1 USD)</Label>
                  <div className="relative mt-1">
                    <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                    <Input
                      type="number"
                      value={beansToUsdRate}
                      onChange={(e) => setBeansToUsdRate(parseInt(e.target.value) || 10000)}
                      className="pl-10 bg-slate-700 border-slate-200 text-white text-xl font-bold focus:border-amber-400"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Current: {beansToUsdRate.toLocaleString()} Beans = $1 USD
                  </p>
                </div>
                <Button 
                  onClick={handleSaveBeansToUsdRate}
                  disabled={savingExchangeRate}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 text-white h-12 px-6 self-end"
                >
                  {savingExchangeRate ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>

              {/* Calculator Preview */}
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-amber-400 font-medium mb-3 flex items-center gap-2">
                  <Calculator className="w-4 h-4" />
                Real-Time Calculation Preview
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  {[10000, 50000, 100000, 500000].map(beans => (
                    <div key={beans} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <p className="text-xs text-slate-400">{beans.toLocaleString()} Beans</p>
                      <p className="text-lg font-bold text-amber-400">
                        ${(beans / beansToUsdRate).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI-Powered Live Rates */}
          <Card className="bg-slate-50 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-blue-400">
                <Sparkles className="w-5 h-5" />
                🤖 AI-Powered Accurate International Rates
              </CardTitle>
              <p className="text-slate-300 text-sm">
                Fetch accurate international market rates using AI and live APIs (market rate minus 5/5%)
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={handleFetchLiveRates}
                  disabled={updatingRates}
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white"
                >
                  {updatingRates ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Fetch Rates via AI
                </Button>
                
                {liveRates.length > 0 && (
                  <Button 
                    onClick={handleSaveLiveRates}
                    disabled={updatingRates}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save to Database ({liveRates.length})
                  </Button>
                )}
              </div>

              {/* Live Rates Display */}
              {liveRates.length > 0 && (
                <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-200">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                    <h4 className="text-blue-400 font-medium flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Live Rates ({liveRates.length} countries)
                    </h4>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                        Source: {ratesSource}
                      </Badge>
                      <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30">
                        Updated: {ratesFetchedAt}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-sm max-h-80 overflow-y-auto">
                    {liveRates.map((rate) => (
                      <div key={rate.code} className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
                        <p className="text-xs text-blue-400 font-medium">{rate.code}</p>
                        <p className="text-lg font-bold text-white">
                          {rate.symbol}{rate.adjustedRate.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-500 line-through">
                          Market: {rate.marketRate.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {liveRates.length === 0 && (
                <div className="bg-slate-700/30 rounded-xl p-6 border border-slate-200 text-center">
                  <Globe className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">
                    Click "Fetch Rates via AI" to view accurate international exchange rates
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual Preset Rates (Fallback) */}
          <Card className="bg-slate-50 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-green-400">
                <TrendingUp className="w-5 h-5" />
                Preset Rates (Manual)
              </CardTitle>
              <p className="text-slate-300 text-sm">
                Use these preset rates if AI is unavailable
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={handleUpdateAllCurrencyRates}
                disabled={updatingRates}
                variant="outline"
                className="border-green-500/30 text-green-400 hover:bg-green-500/10"
              >
                {updatingRates ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Update Preset Rates
              </Button>

              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-green-400 font-medium mb-3 text-sm">Preset Rates (Market - 5)</h4>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                  {Object.entries(internationalRates).slice(0, 12).map(([code, info]) => (
                    <div key={code} className="bg-slate-50 rounded-lg p-2 text-center border border-slate-200">
                      <p className="text-green-400 font-medium">{code}</p>
                      <p className="font-bold text-white">
                        {info.symbol}{Math.max(info.rate - 5, info.rate * 0.95).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Preview for Agency */}
          <Card className="bg-slate-50 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-purple-400">
                <Calculator className="w-5 h-5" />
                Agency Dashboard Preview
              </CardTitle>
              <p className="text-slate-300 text-sm">
                This is how agencies will see it on their dashboard
              </p>
            </CardHeader>
            <CardContent>
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 text-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/80 text-sm">Exchange Rate</span>
                </div>
                <p className="text-lg font-bold">
                  {beansToUsdRate.toLocaleString()} Beans = $1 | $1 = Tk {(currencies.find(c => c.country_code === 'BD')?.rate_to_usd ?? 110.5).toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Packages Tab */}
        <TabsContent value="packages" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={handleAddPackage} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Package
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : packages.length === 0 ? (
            <Card className="bg-gradient-to-br from-slate-50 to-slate-100">
              <CardContent className="p-12 text-center">
                <Diamond className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No packages yet</p>
                <Button onClick={handleAddPackage} className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Package
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {packages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={`relative overflow-hidden transition-all hover:shadow-lg ${
                    pkg.is_active
                      ? pkg.is_best_value
                        ? "bg-gradient-to-br from-pink-50 to-orange-50 border-pink-300"
                        : pkg.is_popular
                          ? "bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300"
                          : "bg-white border-slate-200"
                      : "bg-slate-100 border-slate-200 opacity-60"
                  }`}
                >
                  {pkg.is_best_value && (
                    <div className="absolute top-0 right-0">
                      <Badge className="bg-gradient-to-r from-pink-500 to-orange-500 text-white border-0 rounded-tl-none rounded-br-none">
                        <ThumbsUp className="w-3 h-3 mr-1" />
                        Best Value
                      </Badge>
                    </div>
                  )}

                  {pkg.is_popular && !pkg.is_best_value && (
                    <div className="absolute top-0 right-0">
                      <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 rounded-tl-none rounded-br-none">
                        <Star className="w-3 h-3 mr-1" />
                        Popular
                      </Badge>
                    </div>
                  )}

                  <CardContent className="p-5">
                    <div className="text-center mb-4">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center mb-3 shadow-lg">
                        <Diamond className="w-7 h-7 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-slate-800">
                        {formatCoins(pkg.coins)}
                      </h3>
                      {pkg.coins !== pkg.base_coins && (
                        <p className="text-slate-400 text-sm line-through">
                          {formatCoins(pkg.base_coins)}
                        </p>
                      )}
                    </div>

                    {pkg.bonus_percentage > 0 && (
                      <div className="bg-green-100 rounded-lg p-2 mb-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-green-600">
                          <Sparkles className="w-4 h-4" />
                          <span className="font-bold">+{pkg.bonus_percentage}% Bonus</span>
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-100 rounded-lg p-3 mb-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-slate-800">
                        <DollarSign className="w-5 h-5 text-green-500" />
                        <span className="text-xl font-bold">{pkg.price_usd}</span>
                        <span className="text-slate-500">USD</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={pkg.is_active}
                          onCheckedChange={() => handleTogglePackageActive(pkg)}
                        />
                        <Label className="text-slate-600">Active</Label>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Order: {pkg.display_order}
                      </Badge>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEditPackage(pkg)}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeletePackage(pkg.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Currencies Tab */}
        <TabsContent value="currencies" className="space-y-4">
          {/* USD Conversion Calculator */}
          <Card className="bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-blue-700">
                <DollarSign className="w-5 h-5" />
                USD Conversion Calculator
              </CardTitle>
              <p className="text-blue-600 text-sm">
                Enter a USD amount — it will auto-convert to all country currencies
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1">
                  <Label className="text-blue-700">USD Amount</Label>
                  <div className="relative mt-1">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={100}
                      id="usd-amount-input"
                      className="pl-10 border-blue-200 focus:border-blue-400 text-lg font-bold"
                      placeholder="100.00"
                    />
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {currencies.filter(c => c.is_active).map((currency) => {
                  const usdAmount = parseFloat((document.getElementById('usd-amount-input') as HTMLInputElement)?.value || '100');
                  const localAmount = usdAmount * currency.rate_to_usd;
                  return (
                    <div key={currency.id} className="bg-white rounded-lg p-3 border border-blue-100 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-xs">{currency.country_code}</span>
                        <span className="text-lg">{currency.currency_symbol}</span>
                      </div>
                      <p className="text-lg font-bold text-slate-800">
                        {localAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-slate-400">
                        1 USD = {currency.rate_to_usd} {currency.currency_code}
                      </p>
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 text-sm">
                  <strong>💡 Note:</strong> Editing currency rates will automatically update across all sections (Recharge, Agency Dashboard, Helper Dashboard).
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleAddCurrency} className="bg-gradient-to-r from-green-500 to-emerald-500 text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Currency
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {currencies.map((currency) => (
              <Card
                key={currency.id}
                className={`transition-all hover:shadow-lg ${
                  currency.is_active ? "bg-white" : "bg-slate-100 opacity-60"
                }`}
              >
                <CardContent className="p-5">
                  <div className="text-center mb-4">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-3 shadow-lg">
                      <span className="text-2xl text-white font-bold">{currency.currency_symbol}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">
                      {currency.currency_code}
                    </h3>
                    <p className="text-slate-500 text-sm">
                      {currency.country_code}
                    </p>
                  </div>

                  <div className="bg-slate-100 rounded-lg p-3 mb-4 text-center">
                    <p className="text-slate-500 text-xs">1 USD =</p>
                    <div className="flex items-center justify-center gap-1 text-slate-800">
                      <span className="text-xl font-bold">{currency.rate_to_usd}</span>
                      <span className="text-slate-500">{currency.currency_code}</span>
                    </div>
                  </div>

                  {/* Quick examples */}
                  <div className="bg-blue-50 rounded-lg p-2 mb-4 text-xs">
                    <div className="flex justify-between text-blue-600">
                      <span>$10 USD =</span>
                      <span className="font-bold">{currency.currency_symbol}{(10 * currency.rate_to_usd).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-blue-600 mt-1">
                      <span>$100 USD =</span>
                      <span className="font-bold">{currency.currency_symbol}{(100 * currency.rate_to_usd).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEditCurrency(currency)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteCurrency(currency.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Package Dialog */}
      <Dialog open={showPackageDialog} onOpenChange={setShowPackageDialog}>
        <DialogContent className="max-w-lg max-h-[88dvh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Diamond className="w-5 h-5 text-cyan-500" />
              {editingPackage ? "Edit Package" : "New Package"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 py-2 pr-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Base Diamonds</Label>
                <Input
                  type="number"
                  value={packageForm.base_coins}
                  onChange={(e) => {
                    const base = parseInt(e.target.value) || 0;
                    const pct = packageForm.bonus_percentage || 0;
                    const bonus = pct > 0 ? Math.round(base * pct / 100) : 0;
                    setPackageForm({ ...packageForm, base_coins: base, coins: base + bonus });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Price (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={packageForm.price_usd}
                  onChange={(e) => setPackageForm({ ...packageForm, price_usd: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Bonus Percentage with quick presets */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-amber-500" />
                Bonus Percentage
              </Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[0, 5, 10, 15, 20, 25, 30, 50, 75, 100].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      const base = packageForm.base_coins || 0;
                      const bonus = p > 0 ? Math.round(base * p / 100) : 0;
                      setPackageForm({ ...packageForm, bonus_percentage: p, coins: base + bonus });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      packageForm.bonus_percentage === p
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md scale-105"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <Input
                type="number"
                value={packageForm.bonus_percentage}
                onChange={(e) => {
                  const pct = parseInt(e.target.value) || 0;
                  const base = packageForm.base_coins || 0;
                  const bonus = pct > 0 ? Math.round(base * pct / 100) : 0;
                  setPackageForm({ ...packageForm, bonus_percentage: pct, coins: base + bonus });
                }}
                placeholder="Custom %"
              />
            </div>

            {/* 💎 Premium Live Preview */}
            {packageForm.base_coins > 0 && (
              <div className="rounded-xl overflow-hidden border border-purple-200 shadow-lg">
                <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 px-4 py-2.5">
                  <p className="text-white/80 text-[10px] font-medium tracking-wider uppercase">Live Preview — User Will See</p>
                </div>
                <div className="bg-gradient-to-br from-white via-purple-900/30 to-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                        <Diamond className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-white font-bold text-xl">
                          {formatCoins(packageForm.coins)}
                        </div>
                        {packageForm.bonus_percentage > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 text-xs line-through">{formatCoins(packageForm.base_coins)}</span>
                            <span className="text-amber-400 text-xs font-bold bg-amber-500/20 px-1.5 py-0.5 rounded">
                              +{packageForm.bonus_percentage}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-emerald-400 font-bold text-lg">
                        ${packageForm.price_usd.toFixed(2)}
                      </div>
                      {packageForm.bonus_percentage > 0 && (
                        <div className="text-amber-400 text-xs font-semibold">
                          +{formatCoins(Math.round(packageForm.base_coins * packageForm.bonus_percentage / 100))} FREE
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Local currency examples */}
                  {currencies.filter(c => c.is_active && ['BD', 'IN', 'PK'].includes(c.country_code)).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-white/40 text-[10px] mb-2 uppercase tracking-wider">Local Currency Preview</p>
                      <div className="flex gap-2 flex-wrap">
                        {currencies.filter(c => c.is_active && ['BD', 'IN', 'PK', 'AE', 'SA'].includes(c.country_code)).slice(0, 4).map(c => (
                          <div key={c.id} className="bg-white/5 rounded-lg px-2.5 py-1.5 border border-white/10">
                            <span className="text-white/50 text-[10px]">{c.country_code}</span>
                            <span className="text-white font-bold text-xs ml-1.5">
                              {c.currency_symbol}{Math.round(packageForm.price_usd * c.rate_to_usd).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                type="number"
                value={packageForm.display_order}
                onChange={(e) => setPackageForm({ ...packageForm, display_order: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label>Mark as Popular</Label>
                <Switch
                  checked={packageForm.is_popular}
                  onCheckedChange={(checked) => setPackageForm({ ...packageForm, is_popular: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Mark as Best Value</Label>
                <Switch
                  checked={packageForm.is_best_value}
                  onCheckedChange={(checked) => setPackageForm({ ...packageForm, is_best_value: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={packageForm.is_active}
                  onCheckedChange={(checked) => setPackageForm({ ...packageForm, is_active: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setShowPackageDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePackage} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Currency Dialog */}
      <Dialog open={showCurrencyDialog} onOpenChange={setShowCurrencyDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-green-500" />
              {editingCurrency ? "Edit Currency" : "New Currency"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Country Code (e.g. BD) <span className="text-red-500">*</span></Label>
                <Input
                  value={currencyForm.country_code}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, country_code: e.target.value.toUpperCase() })}
                  maxLength={2}
                  placeholder="BD"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency Code (e.g. BDT) <span className="text-red-500">*</span></Label>
                <Input
                  value={currencyForm.currency_code}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, currency_code: e.target.value.toUpperCase() })}
                  maxLength={3}
                  placeholder="BDT"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency Symbol <span className="text-red-500">*</span></Label>
                <Input
                  value={currencyForm.currency_symbol}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, currency_symbol: e.target.value })}
                  placeholder="Tk "
                />
              </div>
              <div className="space-y-2">
                <Label>Rate to USD (1 USD = ?) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  value={currencyForm.rate_to_usd}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, rate_to_usd: parseFloat(e.target.value) || 1 })}
                  placeholder="121.50"
                />
              </div>
            </div>

            {/* Live Preview */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
              <h4 className="text-green-700 font-semibold mb-3 text-sm">💰 Live Preview (Auto Conversion)</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white rounded-lg p-3 border border-green-100">
                  <p className="text-slate-500 text-xs">$10 USD</p>
                  <p className="text-green-700 font-bold">
                    {currencyForm.currency_symbol || '?'}{(10 * (currencyForm.rate_to_usd || 0)).toLocaleString(undefined, {maximumFractionDigits: 2})} {currencyForm.currency_code || '???'}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-100">
                  <p className="text-slate-500 text-xs">$100 USD</p>
                  <p className="text-green-700 font-bold">
                    {currencyForm.currency_symbol || '?'}{(100 * (currencyForm.rate_to_usd || 0)).toLocaleString(undefined, {maximumFractionDigits: 2})} {currencyForm.currency_code || '???'}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-100">
                  <p className="text-slate-500 text-xs">$500 USD</p>
                  <p className="text-green-700 font-bold">
                    {currencyForm.currency_symbol || '?'}{(500 * (currencyForm.rate_to_usd || 0)).toLocaleString(undefined, {maximumFractionDigits: 2})} {currencyForm.currency_code || '???'}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-100">
                  <p className="text-slate-500 text-xs">$1000 USD</p>
                  <p className="text-green-700 font-bold">
                    {currencyForm.currency_symbol || '?'}{(1000 * (currencyForm.rate_to_usd || 0)).toLocaleString(undefined, {maximumFractionDigits: 2})} {currencyForm.currency_code || '???'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <Label className="font-medium">Active</Label>
                <p className="text-slate-500 text-xs">This currency will be shown in the app</p>
              </div>
              <Switch
                checked={currencyForm.is_active}
                onCheckedChange={(checked) => setCurrencyForm({ ...currencyForm, is_active: checked })}
              />
            </div>
            
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 text-sm">
                <strong>💡 Info:</strong> Setting this rate will auto-convert across the app (Recharge, Withdrawal, Dashboard).
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCurrencyDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveCurrency} 
              className="bg-gradient-to-r from-green-500 to-emerald-500 text-white"
              disabled={!currencyForm.country_code || !currencyForm.currency_code || !currencyForm.currency_symbol || !currencyForm.rate_to_usd}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}