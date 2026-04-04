import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { 
  ArrowLeft, 
  FileText, 
  Users, 
  Wallet, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Shield,
  Star,
  Clock,
  Phone,
  Ban,
  Video,
  MessageCircle,
  Gift,
  Crown,
  Sparkles,
  Zap,
  Target,
  Award
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import policyHeroBanner from "@/assets/banners/policy-hero-banner.jpg";
import meriliveLogo from "@/assets/merilive-logo.png";

interface PolicyData {
  exchange_rate: {
    rate: number;
    currency: string;
    display: string;
  };
  commission_tiers: {
    tiers: Array<{
      level: string;
      name: string;
      income_min: number;
      income_max: number | null;
      rate: number;
    }>;
  };
  host_requirements: {
    requirements: Array<{
      key: string;
      title: string;
      description: string;
    }>;
  };
  violations: {
    violations: Array<{
      title: string;
      severity: string;
      penalties: string[];
    }>;
  };
  prohibited_content: {
    items: Array<{
      title: string;
      description: string;
    }>;
  };
  call_rules: {
    rules: string[];
  };
  withdrawal: {
    minimum_usd: number;
    settlement_day: string;
    settlement_time_ist: string;
    settlement_time_bd: string;
    payment_methods: Array<{
      name: string;
      type: string;
    }>;
    timezones: Array<{
      country: string;
      flag: string;
      time: string;
    }>;
  };
}

const iconMap: Record<string, React.ReactNode> = {
  age: <Users className="w-5 h-5" />,
  camera: <Video className="w-5 h-5" />,
  communication: <MessageCircle className="w-5 h-5" />,
  avatar: <Star className="w-5 h-5" />
};

const tierColors: Record<string, string> = {
  "A1": "from-orange-400 to-orange-600",
  "A2": "from-gray-300 to-gray-500",
  "A3": "from-yellow-400 to-amber-500",
  "A4": "from-blue-400 to-indigo-500",
  "A5": "from-purple-500 to-pink-500"
};

const AgencyPolicy = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [policyData, setPolicyData] = useState<PolicyData | null>(null);
  const [levelTiers, setLevelTiers] = useState<Array<{
    level_code: string;
    level_name: string;
    min_weekly_income: number;
    max_weekly_income: number;
    commission_rate: number;
  }>>([]);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      
      // Fetch policies and level tiers in parallel
      const [policiesResult, tiersResult] = await Promise.all([
        supabase
          .from('agency_policy_settings')
          .select('section_key, content')
          .eq('is_active', true),
        supabase
          .from('agency_level_tiers')
          .select('level_code, level_name, min_weekly_income, max_weekly_income, commission_rate')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
      ]);

      if (policiesResult.error) throw policiesResult.error;
      if (tiersResult.error) throw tiersResult.error;

      if (policiesResult.data) {
        const policies: any = {};
        policiesResult.data.forEach((item: any) => {
          policies[item.section_key] = item.content;
        });
        setPolicyData(policies as PolicyData);
      }

      if (tiersResult.data) {
        setLevelTiers(tiersResult.data);
      }
    } catch (error) {
      console.error('Error fetching policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatIncome = (min: number, max: number | null) => {
    const formatNumber = (num: number) => {
      if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
      if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
      return num.toLocaleString();
    };
    
    if (max === null) return `$${formatNumber(min)}+`;
    if (min === 0) return `$0 - $${formatNumber(max)}`;
    return `$${formatNumber(min)} - $${formatNumber(max)}`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
        <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 flex-shrink-0">
          <div className="flex items-center justify-between h-14 px-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Agency Policy
            </h1>
            <div className="w-9" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const exchangeRate = policyData?.exchange_rate || { rate: 9000, currency: 'Beans', display: '9,000 Beans = $1 USD' };
  
  // Use agency_level_tiers data for commission tiers (real source of truth)
  const commissionTiers = levelTiers.length > 0 
    ? levelTiers.map(tier => ({
        level: tier.level_code,
        name: tier.level_name,
        income_min: tier.min_weekly_income,
        income_max: tier.max_weekly_income === 9999999999 ? null : tier.max_weekly_income,
        rate: tier.commission_rate
      }))
    : policyData?.commission_tiers?.tiers || [];
  const hostRequirements = policyData?.host_requirements?.requirements || [];
  const violations = policyData?.violations?.violations || [];
  const prohibitedContent = policyData?.prohibited_content?.items || [];
  const callRules = policyData?.call_rules?.rules || [];
  const withdrawal = policyData?.withdrawal || {
    minimum_usd: 10,
    settlement_day: 'Monday',
    settlement_time_ist: '09:30',
    settlement_time_bd: '10:00',
    payment_methods: [],
    timezones: []
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 flex-shrink-0">
        <div className="flex items-center justify-between h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Agency Policy
          </h1>
          <div className="w-9" />
        </div>
      </div>

      {/* Content */}
      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'var(--content-bottom-padding)'
        }}
      >
        {/* Hero Banner - Clickable to Policies & Benefits */}
        <div className="mx-4 mt-4">
          <div 
            onClick={() => navigate('/policies-benefits')}
            className="cursor-pointer active:scale-[0.98] transition-transform rounded-2xl overflow-hidden relative"
          >
            <img 
              src={policyHeroBanner} 
              alt="MeriLive — Tap to view all Policies & Benefits"
              className="w-full h-auto object-cover rounded-2xl"
            />
            {/* Logo Overlay */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2">
              <img 
                src={meriliveLogo} 
                alt="MeriLive" 
                className="w-10 h-10 object-contain drop-shadow-lg"
              />
            </div>
          </div>
        </div>

        {/* Exchange Rate Card */}
        <div className="mx-4 mt-4">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-white/80 text-xs uppercase tracking-wide">Exchange Rate</p>
                    <p className="text-xl font-bold">{exchangeRate.rate?.toLocaleString()} Beans = $1 USD</p>
                  </div>
                </div>
                <Badge className="bg-white/20 text-white border-0">
                  <Zap className="w-3 h-3 mr-1" />
                  Official
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="mx-4 mt-4">
          <Tabs defaultValue="commission" className="w-full">
            <TabsList className="w-full grid grid-cols-4 bg-muted/50 p-1 rounded-xl h-11">
              <TabsTrigger value="commission" className="text-xs rounded-lg data-[state=active]:bg-background">
                <TrendingUp className="w-3.5 h-3.5 mr-1" />
                Commission
              </TabsTrigger>
              <TabsTrigger value="host" className="text-xs rounded-lg data-[state=active]:bg-background">
                <Users className="w-3.5 h-3.5 mr-1" />
                Host
              </TabsTrigger>
              <TabsTrigger value="rules" className="text-xs rounded-lg data-[state=active]:bg-background">
                <Shield className="w-3.5 h-3.5 mr-1" />
                Rules
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="text-xs rounded-lg data-[state=active]:bg-background">
                <Wallet className="w-3.5 h-3.5 mr-1" />
                Withdrawal
              </TabsTrigger>
            </TabsList>

            {/* Commission Tab */}
            <TabsContent value="commission" className="mt-4 space-y-4">
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                      <Award className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    Agency Commission Rates
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Commission rate is determined based on total income of your hosts and sub-agents from last week.
                  </p>
                  <div className="space-y-3">
                    {commissionTiers.map((tier) => (
                      <div 
                        key={tier.level}
                        className={`bg-gradient-to-r ${tierColors[tier.level] || 'from-gray-400 to-gray-600'} rounded-xl p-4 text-white relative overflow-hidden`}
                      >
                        <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center font-bold text-lg">
                              {tier.level}
                            </div>
                            <div>
                              <p className="font-bold">{tier.name}</p>
                              <p className="text-xs text-white/80">{formatIncome(tier.income_min, tier.income_max)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold">{tier.rate}%</p>
                            <p className="text-[10px] text-white/70 uppercase">Commission</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Commission Example */}
              <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-200">
                    <Target className="w-5 h-5" />
                    Commission Calculation Example
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-white/60 dark:bg-white/10 rounded-xl p-4">
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                      Suppose your agency level is <strong>A4 (10%)</strong> and:
                    </p>
                    <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1.5">
                      <li>• Your direct hosts' income: $55</li>
                      <li>• Sub-agent B (4% level) income: $11</li>
                      <li>• Sub-agent C (3% level) income: $5</li>
                    </ul>
                    <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Your total commission:
                      </p>
                      <ul className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                        <li>$55 × 10% = $5.50</li>
                        <li>$11 × (10%-4%) = $0.66</li>
                        <li>$5 × (10%-3%) = $0.35</li>
                      </ul>
                      <p className="text-lg font-bold text-blue-800 dark:text-blue-200 mt-2">
                        Total: $6.51
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Host Tab */}
            <TabsContent value="host" className="mt-4 space-y-4">
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                      <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    Host Requirements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {hostRequirements.map((req, index) => (
                      <div 
                        key={index}
                        className="bg-muted/50 rounded-xl p-4 text-center"
                      >
                        <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center mx-auto mb-2 text-emerald-600 dark:text-emerald-400">
                          {iconMap[req.key] || <Star className="w-5 h-5" />}
                        </div>
                        <p className="font-semibold text-sm">{req.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{req.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Earning Methods */}
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                      <Gift className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    Ways to Earn for Hosts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                    <div className="w-10 h-10 bg-purple-100 dark:bg-purple-800/50 rounded-lg flex items-center justify-center">
                      <Video className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-purple-800 dark:text-purple-200">Video Calls</p>
                      <p className="text-xs text-purple-600 dark:text-purple-400">Earn by video calling with users</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 rounded-xl border border-pink-200 dark:border-pink-800">
                    <div className="w-10 h-10 bg-pink-100 dark:bg-pink-800/50 rounded-lg flex items-center justify-center">
                      <Gift className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-pink-800 dark:text-pink-200">Gifts</p>
                      <p className="text-xs text-pink-600 dark:text-pink-400">Earn by receiving gifts from users</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-800/50 rounded-lg flex items-center justify-center">
                      <Crown className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-green-800 dark:text-green-200">Weekly Bonus</p>
                      <p className="text-xs text-green-600 dark:text-green-400">Extra $10+ bonus by participating in events</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Call Rules */}
              <Card className="border-0 shadow-md bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-cyan-800 dark:text-cyan-200">
                    <Phone className="w-5 h-5" />
                    What to Do on Calls
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {callRules.map((rule, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-cyan-700 dark:text-cyan-300">{rule}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Rules Tab */}
            <TabsContent value="rules" className="mt-4 space-y-4">
              {/* Violations */}
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </div>
                    Violation Penalties
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {violations.map((violation, index) => (
                    <div 
                      key={index}
                      className={`rounded-xl p-4 border ${
                        violation.severity === 'high' 
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
                          : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Ban className={`w-4 h-4 ${violation.severity === 'high' ? 'text-red-600' : 'text-amber-600'}`} />
                        <p className={`font-semibold text-sm ${violation.severity === 'high' ? 'text-red-800 dark:text-red-200' : 'text-amber-800 dark:text-amber-200'}`}>
                          {violation.title}
                        </p>
                      </div>
                      <ul className={`text-xs space-y-1 ${violation.severity === 'high' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        {violation.penalties.map((penalty, idx) => (
                          <li key={idx}>• {penalty}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Prohibited Content */}
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                      <Shield className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    </div>
                    Prohibited Content
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {prohibitedContent.map((item, index) => (
                      <div 
                        key={index}
                        className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3"
                      >
                        <p className="font-semibold text-xs text-slate-800 dark:text-slate-200">{item.title}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Important Warning */}
              <Card className="border-0 shadow-md bg-gradient-to-br from-red-500 to-rose-600 text-white">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold mb-1">Important Warning</h3>
                      <p className="text-sm text-white/90">
                        If you use fake photos or change identity, AI will detect it and your account 
                        will be permanently blocked. All diamonds will be confiscated!
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Withdrawal Tab */}
            <TabsContent value="withdraw" className="mt-4 space-y-4">
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                      <Wallet className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    Withdrawal Policy
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Clock className="w-5 h-5 text-green-600" />
                      <p className="font-semibold text-green-800 dark:text-green-200">Settlement Time</p>
                    </div>
                    <ul className="text-sm text-green-700 dark:text-green-300 space-y-2">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Calculation based on Monday-Sunday</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Earnings transfer on {withdrawal.settlement_day} {withdrawal.settlement_time_ist} (IST)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Bangladesh time: {withdrawal.settlement_day} {withdrawal.settlement_time_bd} AM</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-muted/50 rounded-xl p-4">
                    <p className="font-semibold text-sm mb-3">Supported Payment Methods</p>
                    <div className="grid grid-cols-2 gap-2">
                      {withdrawal.payment_methods.map((method, index) => (
                        <div key={index} className="bg-background rounded-lg p-3 text-center border">
                          <p className="font-medium text-sm">{method.name}</p>
                          <p className="text-xs text-muted-foreground">{method.type}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4">
                    <p className="font-semibold text-sm text-blue-800 dark:text-blue-200 mb-2">
                      Minimum Withdrawal
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">${withdrawal.minimum_usd}</p>
                        <p className="text-xs text-blue-500">USD</p>
                      </div>
                      <div className="text-muted-foreground">=</div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{(withdrawal.minimum_usd * exchangeRate.rate).toLocaleString()}</p>
                        <p className="text-xs text-green-500">Beans</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Withdrawal Steps */}
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Withdrawal Steps</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center shrink-0 font-bold text-purple-600 text-sm">
                        1
                      </div>
                      <div>
                        <p className="font-medium text-sm">Login to Agency Account</p>
                        <p className="text-xs text-muted-foreground">Every {withdrawal.settlement_day}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center shrink-0 font-bold text-purple-600 text-sm">
                        2
                      </div>
                      <div>
                        <p className="font-medium text-sm">Go to Wallet → Withdraw</p>
                        <p className="text-xs text-muted-foreground">From Dashboard</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center shrink-0 font-bold text-purple-600 text-sm">
                        3
                      </div>
                      <div>
                        <p className="font-medium text-sm">Enter Payment Method & Address</p>
                        <p className="text-xs text-muted-foreground">USDT/Local Currency</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center shrink-0 font-bold text-green-600 text-sm">
                        ✓
                      </div>
                      <div>
                        <p className="font-medium text-sm">Click Cash Out</p>
                        <p className="text-xs text-muted-foreground">Done!</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Time Zone Info */}
              <Card className="border-0 shadow-md bg-muted/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Time Zone Reference
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {withdrawal.timezones.map((tz, index) => (
                      <div key={index} className="bg-background rounded-lg p-2.5 border">
                        <p className="text-muted-foreground">{tz.flag} {tz.country}</p>
                        <p className="font-medium">{tz.time}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer Note */}
        <div className="mx-4 mt-6 mb-4">
          <Card className="border-0 shadow-md bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30">
            <CardContent className="p-4 text-center">
              <Sparkles className="w-8 h-8 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
              <p className="text-sm text-purple-800 dark:text-purple-200 font-medium">
                Thank you for being with MeriLive!
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                Follow the rules correctly and success is inevitable
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AgencyPolicy;
