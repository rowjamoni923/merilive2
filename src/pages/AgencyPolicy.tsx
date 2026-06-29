import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePersistedCache } from "@/hooks/usePersistedCache";
import { PageSkeleton } from "@/components/common/PageSkeleton";

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
  Radio,
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
import { recordClientError } from "@/utils/clientErrorLog";

interface PolicyData {
  exchange_rate?: {
    rate: number;
    currency: string;
    display: string;
  };
  commission_tiers?: {
    tiers: Array<{
      level: string;
      name: string;
      income_min: number;
      income_max: number | null;
      rate: number;
    }>;
  };
  host_requirements?: {
    requirements: Array<{
      key: string;
      title: string;
      description: string;
    }>;
  };
  violations?: {
    violations: Array<{
      title: string;
      severity: string;
      penalties: string[];
    }>;
  };
  prohibited_content?: {
    items: Array<{
      title: string;
      description: string;
    }>;
  };
  call_rules?: {
    rules: string[];
  };
  withdrawal?: {
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

interface DynamicPolicySection {
  section_key: string;
  section_title: string;
  content: any;
  display_order: number;
}

const iconMap: Record<string, React.ReactNode> = {
  age: <Users className="w-5 h-5" />,
  camera: <Radio className="w-5 h-5" />,
  communication: <MessageCircle className="w-5 h-5" />,
  avatar: <Star className="w-5 h-5" />
};

// Visual identity for each admin section_key
const sectionVisuals: Record<string, { icon: React.ReactNode; gradient: string; iconBg: string; iconColor: string }> = {
 rules: { icon: <Shield className="w-5 h-5" />, gradient:"from-info-500 to-info-600", iconBg:"bg-info-100", iconColor:"text-info-600" },
 commission: { icon: <TrendingUp className="w-5 h-5" />, gradient:"from-success-500 to-success-600", iconBg:"bg-success-100", iconColor:"text-success-600" },
 penalties: { icon: <AlertTriangle className="w-5 h-5" />, gradient:"from-danger-500 to-danger-600", iconBg:"bg-danger-100", iconColor:"text-danger-600" },
 benefits: { icon: <Award className="w-5 h-5" />, gradient:"from-brand-500 to-brand-600", iconBg:"bg-brand-100", iconColor:"text-brand-600" },
 withdrawal: { icon: <Wallet className="w-5 h-5" />, gradient:"from-success-500 to-success-600", iconBg:"bg-success-100", iconColor:"text-success-600" },
 host_management: { icon: <Users className="w-5 h-5" />, gradient:"from-info-500 to-info-600", iconBg:"bg-info-100", iconColor:"text-info-600" },
 privacy: { icon: <Shield className="w-5 h-5" />, gradient:"from-slate-500 to-slate-700", iconBg:"bg-slate-100", iconColor:"text-slate-600" },
};

// Premium tier styling — keyed by level_code OR lowercased name
const tierStyles: Record<string, string> = {
  bronze:   "from-[#7a3f1d] via-[#a85a2a] to-[#c97a3f]",
  silver:   "from-[#5a6470] via-[#8a93a0] to-[#b8c0cc]",
  gold:     "from-[#8a5a10] via-[#c8961a] to-[#f0c75a]",
  platinum: "from-[#3a4a5c] via-[#6b7d92] to-[#a8b8c8]",
  diamond:  "from-[#1e3a5c] via-[#3a6ea8] to-[#7ab8e8]",
  a1: "from-[#7a3f1d] via-[#a85a2a] to-[#c97a3f]",
  a2: "from-[#5a6470] via-[#8a93a0] to-[#b8c0cc]",
  a3: "from-[#8a5a10] via-[#c8961a] to-[#f0c75a]",
  a4: "from-[#3a4a5c] via-[#6b7d92] to-[#a8b8c8]",
  a5: "from-[#1e3a5c] via-[#3a6ea8] to-[#7ab8e8]",
};
const getTierStyle = (tier: { level?: string; name?: string }) => {
  const k = (tier.level || "").toLowerCase();
  const n = (tier.name || "").toLowerCase();
  return tierStyles[k] || tierStyles[n] || "from-slate-600 via-slate-700 to-slate-800";
};

// STRUCTURED keys handled by their own dedicated cards/tabs
const STRUCTURED_KEYS = new Set([
  "exchange_rate", "commission_tiers", "host_requirements",
  "violations", "prohibited_content", "call_rules", "withdrawal"
]);

const AgencyPolicy = () => {
  const navigate = useNavigate();
  useEnableBrowserPageInteraction();
  // Pkg421 — agency policy is fully GLOBAL data, safe to share across users.
  // Instant cached render; background refresh keeps content fresh.
  const [policyData, setPolicyData, hadPolicyCache] = usePersistedCache<PolicyData>("agencyPolicy:data");
  const [dynamicSections, setDynamicSections] = usePersistedCache<DynamicPolicySection[]>("agencyPolicy:dynamic", []);
  const [levelTiers, setLevelTiers] = usePersistedCache<Array<{
    level_code: string;
    level_name: string;
    min_weekly_income: number;
    max_weekly_income: number;
    commission_rate: number;
  }>>("agencyPolicy:tiers", []);
  const [loading, setLoading] = useState(!hadPolicyCache);

  useEffect(() => {
    fetchPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const fetchPolicies = async () => {
    try {
      // Only block UI with spinner if we have nothing cached yet.
      if (!policyData) setLoading(true);

      // Fetch policies and level tiers in parallel
      const [policiesResult, tiersResult] = await Promise.all([
        supabase
          .from('agency_policy_settings')
          .select('section_key, section_title, content, display_order')
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
        supabase
          .from('agency_level_tiers')
          .select('level_code, level_name, min_weekly_income, max_weekly_income, commission_rate')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
      ]);

      if (policiesResult.error) throw policiesResult.error;
      if (tiersResult.error) throw tiersResult.error;

      if (policiesResult.data) {
        // Structured policies (typed cards)
        const policies: any = {};
        // Dynamic admin-managed sections (anything not in STRUCTURED_KEYS)
        const dynamic: DynamicPolicySection[] = [];

        policiesResult.data.forEach((item: any) => {
          policies[item.section_key] = item.content;
          if (!STRUCTURED_KEYS.has(item.section_key)) {
            dynamic.push({
              section_key: item.section_key,
              section_title: item.section_title,
              content: item.content,
              display_order: item.display_order ?? 99,
            });
          }
        });
        setPolicyData(policies as PolicyData);
        setDynamicSections(dynamic);
      }

      if (tiersResult.data) {
        setLevelTiers(tiersResult.data);
      }
    } catch (error) {
      console.error('Error fetching policies:', error);
      recordClientError({ label: "AgencyPolicy.dynamic", message: error instanceof Error ? error.message : String(error) });
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
    return <PageSkeleton className="fixed inset-0 flex flex-col bg-background overflow-hidden" rows={6} hero />;
  }


  const exchangeRate = policyData?.exchange_rate || { rate: 9000, currency: 'Beans', display: '9,000 Beans = $1 USD' };
  
  // Use agency_level_tiers data for commission tiers (real source of truth)
  const commissionTiers = (levelTiers ?? []).length > 0
    ? (levelTiers ?? []).map(tier => ({
        level: tier.level_code,
        name: tier.level_name,
        income_min: tier.min_weekly_income,
        income_max: tier.max_weekly_income === 9999999999 ? null : tier.max_weekly_income,
        rate: tier.commission_rate
      }))
    : policyData?.commission_tiers?.tiers || [];

  const hostRequirements = policyData?.host_requirements?.requirements || [];
  const violations = (policyData?.violations?.violations || []).map((v: any) => ({ ...v, penalties: v?.penalties || [] }));
  const prohibitedContent = policyData?.prohibited_content?.items || [];
  const callRules = policyData?.call_rules?.rules || [];
  const withdrawal = {
    minimum_usd: 10,
    settlement_day: 'Monday',
    settlement_time_ist: '09:30',
    settlement_time_bd: '10:00',
    payment_methods: [],
    timezones: [],
    ...(policyData?.withdrawal || {}),
  };
  // Ensure nested arrays exist
  if (!Array.isArray(withdrawal.payment_methods)) withdrawal.payment_methods = [];
  if (!Array.isArray(withdrawal.timezones)) withdrawal.timezones = [];

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-brand-600 via-info-600 to-brand-700 flex-shrink-0">
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
              loading="eager"
              decoding="async"
              {...({ fetchpriority: "high" } as Record<string, string>)}
              className="w-full h-auto object-cover rounded-2xl"/>
            {/* Logo Overlay */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2">
              <img 
                src={meriliveLogo} 
                alt="MeriLive" 
                loading="eager"
                decoding="async"
                className="w-10 h-10 object-contain drop-shadow-lg"/>
            </div>
          </div>
        </div>

        {/* Exchange Rate Card */}
        <div className="mx-4 mt-4">
 <Card className="border-0 shadow-lg bg-gradient-to-br from-success-500 to-success-600 text-white">
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
            <TabsList className="w-full grid grid-cols-5 bg-muted/50 p-1 rounded-xl h-11">
              <TabsTrigger value="commission" className="text-[11px] rounded-lg data-[state=active]:bg-background px-1">
                <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
                Commission
              </TabsTrigger>
              <TabsTrigger value="host" className="text-[11px] rounded-lg data-[state=active]:bg-background px-1">
                <Users className="w-3.5 h-3.5 mr-0.5" />
                Host
              </TabsTrigger>
              <TabsTrigger value="rules" className="text-[11px] rounded-lg data-[state=active]:bg-background px-1">
                <Shield className="w-3.5 h-3.5 mr-0.5" />
                Rules
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="text-[11px] rounded-lg data-[state=active]:bg-background px-1">
                <Wallet className="w-3.5 h-3.5 mr-0.5" />
                Withdraw
              </TabsTrigger>
              <TabsTrigger value="more" className="text-[11px] rounded-lg data-[state=active]:bg-background px-1 relative">
                <FileText className="w-3.5 h-3.5 mr-0.5" />
                More
                {(dynamicSections ?? []).length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] bg-brand-600 text-white border-0">
                    {(dynamicSections ?? []).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Commission Tab */}
            <TabsContent value="commission" className="mt-4 space-y-4">
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
 <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center">
 <Award className="w-4 h-4 text-brand-600" />
                    </div>
                    Agency Commission Rates
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Commission rate is determined based on total income of your hosts and sub-agents from last week.
                  </p>
                  <div className="space-y-3">
                    {commissionTiers.map((tier) => {
                      const displayName = (tier.name || tier.level || "").toString();
                      const displayLevel = (tier.level || "").toString();
                      const initial = displayName.charAt(0).toUpperCase() || "•";
                      const showLevelChip = displayLevel && displayLevel.toLowerCase() !== displayName.toLowerCase();
                      return (
                      <div 
                        key={tier.level}
                        className={`bg-gradient-to-r ${getTierStyle(tier)} rounded-xl p-4 text-white relative overflow-hidden shadow-md ring-1 ring-white/10`}
                      >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/10 pointer-events-none" />
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center font-bold text-lg text-white ring-1 ring-white/30 shadow-inner">
                              {initial}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-white capitalize leading-tight drop-shadow-sm">{displayName}</p>
                              {showLevelChip && (
                                <span className="inline-block mt-0.5 mr-1 px-1.5 py-px text-[10px] font-semibold rounded bg-white/20 text-white uppercase tracking-wide">
                                  {displayLevel}
                                </span>
                              )}
                              <p className="text-xs text-white/85 mt-0.5">{formatIncome(tier.income_min, tier.income_max)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-extrabold text-white drop-shadow-sm">{tier.rate}%</p>
                            <p className="text-[10px] text-white/80 uppercase tracking-wider font-semibold">Commission</p>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Commission Example */}
 <Card className="border-0 shadow-md bg-gradient-to-br from-info-50 to-info-50">
                <CardHeader className="pb-2">
 <CardTitle className="text-base flex items-center gap-2 text-info-800">
                    <Target className="w-5 h-5" />
                    Commission Calculation Example
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
 <div className="bg-white/60 rounded-xl p-4">
 <p className="text-sm text-info-700 mb-2">
                      Suppose your agency level is <strong>A4 (10%)</strong> and:
                    </p>
 <ul className="text-sm text-info-600 space-y-1.5">
                      <li>• Your direct hosts' income: $55</li>
                      <li>• Sub-agent B (4% level) income: $11</li>
                      <li>• Sub-agent C (3% level) income: $5</li>
                    </ul>
 <div className="mt-3 pt-3 border-t border-info-200">
 <p className="text-sm font-medium text-info-800">
                        Your total commission:
                      </p>
 <ul className="text-sm text-info-600 mt-1">
                        <li>$55 × 10% = $5.50</li>
                        <li>$11 × (10%-4%) = $0.66</li>
                        <li>$5 × (10%-3%) = $0.35</li>
                      </ul>
 <p className="text-lg font-bold text-info-800 mt-2">
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
 <div className="w-8 h-8 bg-success-100 rounded-lg flex items-center justify-center">
 <Users className="w-4 h-4 text-success-600" />
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
 <div className="w-12 h-12 bg-success-100 rounded-xl flex items-center justify-center mx-auto mb-2 text-success-600">
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
 <div className="w-8 h-8 bg-warning-100 rounded-lg flex items-center justify-center">
 <Gift className="w-4 h-4 text-warning-600" />
                    </div>
                    Ways to Earn for Hosts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
 <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-brand-50 to-info-50 rounded-xl border border-brand-200">
 <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center">
 <Phone className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
 <p className="font-semibold text-brand-800">Video Calls</p>
 <p className="text-xs text-brand-600">Earn by video calling with users</p>
                    </div>
                  </div>
 <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-brand-50 to-danger-50 rounded-xl border border-brand-200">
 <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center">
 <Gift className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
 <p className="font-semibold text-brand-800">Gifts</p>
 <p className="text-xs text-brand-600">Earn by receiving gifts from users</p>
                    </div>
                  </div>
 <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-success-50 to-success-50 rounded-xl border border-success-200">
 <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center">
 <Crown className="w-5 h-5 text-success-600" />
                    </div>
                    <div>
 <p className="font-semibold text-success-800">Weekly Bonus</p>
 <p className="text-xs text-success-600">Extra $10+ bonus by participating in events</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Call Rules */}
 <Card className="border-0 shadow-md bg-gradient-to-br from-info-50 to-info-50">
                <CardHeader className="pb-2">
 <CardTitle className="text-base flex items-center gap-2 text-info-800">
                    <Phone className="w-5 h-5" />
                    What to Do on Calls
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {callRules.map((rule, index) => (
                      <div key={index} className="flex items-start gap-2">
 <CheckCircle2 className="w-4 h-4 text-info-600 mt-0.5 shrink-0" />
 <p className="text-sm text-info-700">{rule}</p>
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
 <div className="w-8 h-8 bg-danger-100 rounded-lg flex items-center justify-center">
 <AlertTriangle className="w-4 h-4 text-danger-600" />
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
 ?'bg-danger-50 border-danger-200' 
 :'bg-warning-50 border-warning-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Ban className={`w-4 h-4 ${violation.severity === 'high' ? 'text-danger-600' : 'text-warning-600'}`} />
 <p className={`font-semibold text-sm ${violation.severity ==='high' ?'text-danger-800' :'text-warning-800'}`}>
                          {violation.title}
                        </p>
                      </div>
 <ul className={`text-xs space-y-1 ${violation.severity ==='high' ?'text-danger-700' :'text-warning-700'}`}>
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
 <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
 <Shield className="w-4 h-4 text-slate-600" />
                    </div>
                    Prohibited Content
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {prohibitedContent.map((item, index) => (
                      <div 
                        key={index}
 className="bg-slate-50 rounded-lg p-3"
                      >
 <p className="font-semibold text-xs text-slate-800">{item.title}</p>
 <p className="text-[10px] text-slate-500 mt-0.5">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Important Warning */}
 <Card className="border-0 shadow-md bg-gradient-to-br from-danger-500 to-danger-600 text-white">
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
 <div className="w-8 h-8 bg-success-100 rounded-lg flex items-center justify-center">
 <Wallet className="w-4 h-4 text-success-600" />
                    </div>
                    Withdrawal Policy
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
 <div className="bg-gradient-to-r from-success-50 to-success-50 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Clock className="w-5 h-5 text-success-600" />
 <p className="font-semibold text-success-800">Settlement Time</p>
                    </div>
 <ul className="text-sm text-success-700 space-y-2">
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

 <div className="bg-gradient-to-r from-info-50 to-info-50 rounded-xl p-4">
 <p className="font-semibold text-sm text-info-800 mb-2">
                      Minimum Withdrawal
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-info-600">${withdrawal.minimum_usd}</p>
                        <p className="text-xs text-info-500">USD</p>
                      </div>
                      <div className="text-muted-foreground">=</div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-success-600">{(withdrawal.minimum_usd * exchangeRate.rate).toLocaleString()}</p>
                        <p className="text-xs text-success-500">Beans</p>
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
 <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center shrink-0 font-bold text-brand-600 text-sm">
                        1
                      </div>
                      <div>
                        <p className="font-medium text-sm">Login to Agency Account</p>
                        <p className="text-xs text-muted-foreground">Every {withdrawal.settlement_day}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
 <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center shrink-0 font-bold text-brand-600 text-sm">
                        2
                      </div>
                      <div>
                        <p className="font-medium text-sm">Go to Wallet → Withdraw</p>
                        <p className="text-xs text-muted-foreground">From Dashboard</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
 <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center shrink-0 font-bold text-brand-600 text-sm">
                        3
                      </div>
                      <div>
                        <p className="font-medium text-sm">Enter Payment Method & Address</p>
                        <p className="text-xs text-muted-foreground">USDT/Local Currency</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
 <div className="w-8 h-8 bg-success-100 rounded-full flex items-center justify-center shrink-0 font-bold text-success-600 text-sm">
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

            {/* More Tab — Admin-managed dynamic policy sections */}
            <TabsContent value="more" className="mt-4 space-y-4">
              {(dynamicSections ?? []).length === 0 ? (
                <Card className="border-0 shadow-md">
                  <CardContent className="p-8 text-center">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      No additional policies published yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                (dynamicSections ?? []).map((section) => {
                  const visual = sectionVisuals[section.section_key] || {
                    icon: <FileText className="w-5 h-5" />,
                    gradient: "from-gray-500 to-gray-700",
 iconBg:"bg-gray-100",
 iconColor:"text-gray-600",
                  };

                  // Normalize content into a list of items
                  let items: string[] = [];
                  if (Array.isArray(section.content?.items)) {
                    items = section.content.items.map((it: any) =>
                      typeof it === "string" ? it : (it?.text || it?.title || JSON.stringify(it))
                    );
                  } else if (Array.isArray(section.content)) {
                    items = section.content.map((it: any) =>
                      typeof it === "string" ? it : (it?.text || it?.title || JSON.stringify(it))
                    );
                  } else if (typeof section.content === "string") {
                    items = [section.content];
                  } else if (section.content && typeof section.content === "object") {
                    // Best-effort flatten
                    items = Object.values(section.content)
                      .filter((v) => typeof v === "string") as string[];
                  }

                  return (
                    <Card key={section.section_key} className="border-0 shadow-md overflow-hidden">
                      {/* Gradient Header */}
                      <div className={`bg-gradient-to-r ${visual.gradient} p-4 text-white`}>
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                            {visual.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-base truncate">{section.section_title}</h3>
                            <p className="text-[11px] text-white/80 capitalize">
                              {section.section_key.replace(/_/g, " ")}
                            </p>
                          </div>
                        </div>
                      </div>

                      <CardContent className="p-4">
                        {items.length > 0 ? (
                          <ul className="space-y-2.5">
                            {items.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-3">
                                <div className={`w-6 h-6 rounded-full ${visual.iconBg} ${visual.iconColor} flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold`}>
                                  {idx + 1}
                                </div>
                                <p className="text-sm text-foreground leading-relaxed flex-1">
                                  {item}
                                </p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            No content available.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}

              {/* Last Updated Notice */}
 <Card className="border-0 shadow-md bg-gradient-to-br from-info-50 to-brand-50">
                <CardContent className="p-4 text-center">
 <Sparkles className="w-6 h-6 text-info-600 mx-auto mb-2" />
 <p className="text-xs text-info-700">
                    Policies are updated by the platform administration. Always check this section for the latest rules.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer Note */}
        <div className="mx-4 mt-6 mb-4">
 <Card className="border-0 shadow-md bg-gradient-to-br from-brand-100 to-info-100">
            <CardContent className="p-4 text-center">
 <Sparkles className="w-8 h-8 text-brand-600 mx-auto mb-2" />
 <p className="text-sm text-brand-800 font-medium">
                Thank you for being with MeriLive!
              </p>
 <p className="text-xs text-brand-600 mt-1">
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
