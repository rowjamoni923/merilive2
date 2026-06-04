import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePersistedCache } from "@/hooks/usePersistedCache";
import { 
  ArrowLeft, FileText, Users, Wallet, TrendingUp, AlertTriangle, CheckCircle2,
  DollarSign, Shield, Star, Clock, Phone, Ban, Video, MessageCircle,
  Gift, Crown, Sparkles, Zap, Target, Award, ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import policyHeroBanner from "@/assets/banners/policy-hero-banner.jpg";
import meriliveLogo from "@/assets/merilive-logo.png";
import { recordClientError } from "@/utils/clientErrorLog";

interface PolicyData {
  exchange_rate?: { rate: number; currency: string; display: string; };
  commission_tiers?: { tiers: Array<{ level: string; name: string; income_min: number; income_max: number | null; rate: number; }>; };
  host_requirements?: { requirements: Array<{ key: string; title: string; description: string; }>; };
  violations?: { violations: Array<{ title: string; severity: string; penalties: string[]; }>; };
  prohibited_content?: { items: Array<{ title: string; description: string; }>; };
  call_rules?: { rules: string[]; };
  withdrawal?: {
    minimum_usd: number; settlement_day: string; settlement_time_ist: string;
    settlement_time_bd: string; payment_methods: Array<{ name: string; type: string; }>;
    timezones: Array<{ country: string; flag: string; time: string; }>;
  };
}

interface DynamicPolicySection { section_key: string; section_title: string; content: any; display_order: number; }

const iconMap: Record<string, React.ReactNode> = {
  age: <Users className="w-5 h-5" />, camera: <Video className="w-5 h-5" />,
  communication: <MessageCircle className="w-5 h-5" />, avatar: <Star className="w-5 h-5" />
};

const sectionVisuals: Record<string, { icon: React.ReactNode; gradient: string; iconBg: string; iconColor: string }> = {
  rules: { icon: <Shield className="w-5 h-5" />, gradient:"from-info-500 to-info-600", iconBg:"bg-info-100", iconColor:"text-info-600" },
  commission: { icon: <TrendingUp className="w-5 h-5" />, gradient:"from-success-500 to-success-600", iconBg:"bg-success-100", iconColor:"text-success-600" },
  penalties: { icon: <AlertTriangle className="w-5 h-5" />, gradient:"from-danger-500 to-danger-600", iconBg:"bg-danger-100", iconColor:"text-danger-600" },
  benefits: { icon: <Award className="w-5 h-5" />, gradient:"from-brand-500 to-brand-600", iconBg:"bg-brand-100", iconColor:"text-brand-600" },
  withdrawal: { icon: <Wallet className="w-5 h-5" />, gradient:"from-success-500 to-success-600", iconBg:"bg-success-100", iconColor:"text-success-600" },
  host_management: { icon: <Users className="w-5 h-5" />, gradient:"from-info-500 to-info-600", iconBg:"bg-info-100", iconColor:"text-info-600" },
  privacy: { icon: <Shield className="w-5 h-5" />, gradient:"from-slate-500 to-slate-700", iconBg:"bg-slate-100", iconColor:"text-slate-600" },
};

const tierStyles: Record<string, string> = {
  bronze: "from-[#7a3f1d] via-[#a85a2a] to-[#c97a3f]",
  silver: "from-[#5a6470] via-[#8a93a0] to-[#b8c0cc]",
  gold: "from-[#8a5a10] via-[#c8961a] to-[#f0c75a]",
  platinum: "from-[#3a4a5c] via-[#6b7d92] to-[#a8b8c8]",
  diamond: "from-[#1e3a5c] via-[#3a6ea8] to-[#7ab8e8]",
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

const STRUCTURED_KEYS = new Set(["exchange_rate", "commission_tiers", "host_requirements", "violations", "prohibited_content", "call_rules", "withdrawal", "rules", "host_management", "commission", "penalties", "benefits", "privacy"]);

const AgencyPolicy = () => {
  const navigate = useNavigate();
  const [policyData, setPolicyData, hadPolicyCache] = usePersistedCache<PolicyData>("agencyPolicy:data");
  const [dynamicSections, setDynamicSections] = usePersistedCache<DynamicPolicySection[]>("agencyPolicy:dynamic", []);
  const [levelTiers, setLevelTiers] = usePersistedCache<Array<{level_code: string; level_name: string; min_weekly_income: number; max_weekly_income: number; commission_rate: number;}>>("agencyPolicy:tiers", []);
  const [loading, setLoading] = useState(!hadPolicyCache);

  useEffect(() => { fetchPolicies(); }, []);

  const fetchPolicies = async () => {
    try {
      if (!policyData) setLoading(true);
      const [policiesResult, tiersResult] = await Promise.all([
        supabase.from('agency_policy_settings').select('section_key, section_title, content, display_order').eq('is_active', true).order('display_order', { ascending: true }),
        supabase.from('agency_level_tiers').select('level_code, level_name, min_weekly_income, max_weekly_income, commission_rate').eq('is_active', true).order('display_order', { ascending: true })
      ]);
      if (policiesResult.error) throw policiesResult.error;
      if (tiersResult.error) throw tiersResult.error;

      if (policiesResult.data) {
        const policies: any = {};
        const dynamic: DynamicPolicySection[] = [];
        policiesResult.data.forEach((item: any) => {
          policies[item.section_key] = item.content;
          if (!STRUCTURED_KEYS.has(item.section_key)) {
            dynamic.push({ section_key: item.section_key, section_title: item.section_title, content: item.content, display_order: item.display_order ?? 99 });
          }
        });
        setPolicyData(policies as PolicyData);
        setDynamicSections(dynamic);
      }
      if (tiersResult.data) setLevelTiers(tiersResult.data);
    } catch (error) { console.error('Error fetching policies:', error); recordClientError({ label: "AgencyPolicy.dynamic", message: error instanceof Error ? error.message : String(error) }); } finally { setLoading(false); }
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
      <div className="fixed inset-0 flex flex-col bg-slate-50">
        <div className="h-14 bg-brand-600 shadow-md" />
        <div className="flex-1 p-4 space-y-4">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const exchangeRate = policyData?.exchange_rate || { rate: 9000, currency: 'Beans', display: '9,000 Beans = $1 USD' };
  const commissionTiers = (levelTiers ?? []).length > 0 ? (levelTiers ?? []).map(tier => ({ level: tier.level_code, name: tier.level_name, income_min: tier.min_weekly_income, income_max: tier.max_weekly_income === 9999999999 ? null : tier.max_weekly_income, rate: tier.commission_rate })) : policyData?.commission_tiers?.tiers || [];
  
  // New: Get list-based data for various sections
  const commissionPolicy = (policyData as any)?.commission?.items || [];
  const hostManagementPolicy = (policyData as any)?.host_management?.items || [];
  const rulesPolicy = (policyData as any)?.rules?.items || [];
  const penaltiesPolicy = (policyData as any)?.penalties?.items || [];
  const benefitsPolicy = (policyData as any)?.benefits?.items || [];
  const privacyPolicy = (policyData as any)?.privacy?.items || [];

  const hostRequirements = policyData?.host_requirements?.requirements || [];
  const violations = (policyData?.violations?.violations || []).map((v: any) => ({ ...v, penalties: v?.penalties || [] }));
  const prohibitedContent = policyData?.prohibited_content?.items || [];
  const callRules = policyData?.call_rules?.rules || [];
  const withdrawal = { minimum_usd: 10, settlement_day: 'Monday', settlement_time_ist: '09:30', settlement_time_bd: '10:00', payment_methods: [], timezones: [], ...(policyData?.withdrawal || {}), };

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50 overflow-y-auto overflow-x-hidden">
      <div className="sticky top-0 z-50 bg-gradient-to-r from-brand-600 via-info-600 to-brand-700 h-14 shadow-lg flex items-center justify-between px-4 border-b border-white/10">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft className="w-5 h-5 text-white" /></motion.button>
        <h1 className="text-lg font-black text-white tracking-tight drop-shadow-md">AGENCY POLICY</h1>
        <div className="w-9" />
      </div>

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {/* Hero */}
        <motion.div variants={itemVariants} onClick={() => navigate('/policies-benefits')} className="relative rounded-3xl overflow-hidden shadow-2xl ring-4 ring-white shadow-brand-500/20 active:scale-[0.98] transition-all cursor-pointer group">
          <img src={policyHeroBanner} alt="Policies & Benefits" className="w-full h-40 object-cover transition-transform duration-700 group-hover:scale-110" />
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
             <motion.img animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity }} src={meriliveLogo} alt="MeriLive" className="w-12 h-12 drop-shadow-xl" />
          </div>
          <div className="absolute bottom-4 right-4"><Badge className="bg-white/90 backdrop-blur-md text-brand-700 border-none font-bold text-[10px] px-2 shadow-lg">EXPLORE <ChevronRight className="w-3 h-3 ml-1" /></Badge></div>
        </motion.div>

        {/* Exchange Rate - 3D HD */}
        <motion.div variants={itemVariants}>
          <Card className="border-none shadow-2xl bg-gradient-to-br from-success-500 via-success-600 to-emerald-700 text-white p-5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:scale-150 transition-transform duration-1000" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg ring-1 ring-white/30 group-hover:rotate-12 transition-transform"><DollarSign className="w-8 h-8 text-white" /></div>
              <div>
                <p className="text-white/80 text-[10px] font-black uppercase tracking-widest mb-1">Exchange Rate</p>
                <p className="text-2xl font-black tracking-tight drop-shadow-md">{exchangeRate.rate?.toLocaleString()} BEANS = $1.00 USD</p>
                <div className="flex items-center gap-2 mt-1"><div className="h-1 w-6 bg-white/30 rounded-full" /><p className="text-xs font-bold text-success-50">Official Platform Rate</p></div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Tabs - Premium Styling */}
        <Tabs defaultValue="commission" className="w-full">
          <TabsList className="w-full grid grid-cols-5 bg-slate-200/50 backdrop-blur-sm p-1.5 rounded-2xl h-14 shadow-inner">
            <TabsTrigger value="commission" className="text-[10px] font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-brand-600 px-1 transition-all">
              <TrendingUp className="w-4 h-4 mb-0.5 block mx-auto" /> EARN
            </TabsTrigger>
            <TabsTrigger value="host" className="text-[10px] font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-brand-600 px-1 transition-all">
              <Users className="w-4 h-4 mb-0.5 block mx-auto" /> HOST
            </TabsTrigger>
            <TabsTrigger value="rules" className="text-[10px] font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-brand-600 px-1 transition-all">
              <Shield className="w-4 h-4 mb-0.5 block mx-auto" /> RULES
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="text-[10px] font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-brand-600 px-1 transition-all">
              <Wallet className="w-4 h-4 mb-0.5 block mx-auto" /> PAY
            </TabsTrigger>
            <TabsTrigger value="more" className="text-[10px] font-bold rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-brand-600 px-1 relative transition-all">
              <FileText className="w-4 h-4 mb-0.5 block mx-auto" /> MORE
              {(dynamicSections ?? []).length > 0 && <Badge className="absolute top-1 right-1 h-3.5 min-w-3.5 px-1 text-[8px] bg-brand-600 text-white border-0">{(dynamicSections ?? []).length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="commission" className="mt-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {commissionPolicy.length > 0 && (
              <Card className="border-none shadow-xl bg-gradient-to-br from-brand-600 to-info-700 rounded-3xl p-5 text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                <h3 className="font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-tight relative z-10">
                  <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center"><Wallet className="w-4 h-4 text-white" /></div>
                  Commission Policy
                </h3>
                <ul className="space-y-3 relative z-10">
                  {commissionPolicy.map((item: string, idx: number) => (
                    <li key={idx} className="flex gap-3 text-[11px] font-bold text-white/90 leading-relaxed">
                      <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black">{idx + 1}</div>
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md rounded-3xl p-4">
              <h3 className="font-black text-sm mb-4 flex items-center gap-2 text-slate-800 uppercase tracking-tight">
                <div className="w-7 h-7 bg-brand-100 rounded-lg flex items-center justify-center"><Award className="w-4 h-4 text-brand-600" /></div>
                Commission Rates
              </h3>
              <div className="space-y-3">
                {commissionTiers.map((tier) => (
                  <motion.div key={tier.level} whileHover={{ x: 5 }} className={`bg-gradient-to-r ${getTierStyle(tier)} rounded-2xl p-4 text-white relative overflow-hidden shadow-lg border border-white/20 ring-1 ring-black/5`}>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />
                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center font-black text-lg shadow-inner ring-1 ring-white/30">{tier.name?.charAt(0) || "•"}</div>
                        <div>
                          <p className="font-black text-white capitalize leading-none drop-shadow-md">{tier.name}</p>
                          <p className="text-[10px] text-white/80 mt-1 font-bold">{formatIncome(tier.income_min, tier.income_max)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-white drop-shadow-lg leading-none">{tier.rate}%</p>
                        <p className="text-[8px] text-white/70 uppercase tracking-widest font-black mt-1">RATE</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="host" className="mt-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {hostManagementPolicy.length > 0 && (
              <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md rounded-3xl p-5 mb-4">
                <h3 className="font-black text-sm mb-4 flex items-center gap-2 text-slate-800 uppercase tracking-tight">
                  <div className="w-7 h-7 bg-info-100 rounded-lg flex items-center justify-center"><Users className="w-4 h-4 text-info-600" /></div>
                  Host Management
                </h3>
                <ul className="space-y-4">
                  {hostManagementPolicy.map((item: string, idx: number) => (
                    <li key={idx} className="flex gap-3 items-start">
                      <div className="w-6 h-6 bg-info-50 text-info-600 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black shadow-sm">{idx + 1}</div>
                      <p className="text-xs font-bold text-slate-600 leading-relaxed mt-0.5">{item}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {hostRequirements.length > 0 && (
              <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md rounded-3xl p-5">
                <h3 className="font-black text-sm mb-4 flex items-center gap-2 text-slate-800 uppercase tracking-tight">
                  <div className="w-7 h-7 bg-success-100 rounded-lg flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-success-600" /></div>
                  Requirements
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {hostRequirements.map((req, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center hover:bg-white hover:shadow-lg transition-all">
                      <div className="w-12 h-12 bg-success-100 rounded-2xl flex items-center justify-center mx-auto mb-2 text-success-600 shadow-sm">{iconMap[req.key] || <Star className="w-5 h-5" />}</div>
                      <p className="font-bold text-xs text-slate-800">{req.title}</p>
                      <p className="text-[10px] text-slate-500 mt-1 leading-tight">{req.description}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="rules" className="mt-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md rounded-3xl p-5">
              <h3 className="font-black text-sm mb-4 flex items-center gap-2 text-slate-800 uppercase tracking-tight">
                <div className="w-7 h-7 bg-danger-100 rounded-lg flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-danger-600" /></div>
                Strict Rules
              </h3>
              <div className="space-y-3">
                {violations.map((v, i) => (
                  <div key={i} className={`rounded-2xl p-4 border shadow-sm ${v.severity === 'high' ? 'bg-danger-50 border-danger-100' : 'bg-warning-50 border-warning-100'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Ban className={`w-4 h-4 ${v.severity === 'high' ? 'text-danger-600' : 'text-warning-600'}`} />
                      <p className={`font-black text-xs uppercase tracking-tight ${v.severity === 'high' ? 'text-danger-800' : 'text-warning-800'}`}>{v.title}</p>
                    </div>
                    <ul className={`text-[10px] space-y-1 font-medium ${v.severity === 'high' ? 'text-danger-700' : 'text-warning-700'}`}>
                      {v.penalties.map((p, idx) => <li key={idx} className="flex gap-1.5"><div className="w-1 h-1 rounded-full bg-current mt-1.5 shrink-0" /> {p}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="withdraw" className="mt-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md rounded-3xl p-5">
              <h3 className="font-black text-sm mb-4 flex items-center gap-2 text-slate-800 uppercase tracking-tight">
                <div className="w-7 h-7 bg-info-100 rounded-lg flex items-center justify-center"><Wallet className="w-4 h-4 text-info-600" /></div>
                Payout Policy
              </h3>
              <div className="bg-gradient-to-br from-info-500 to-brand-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden mb-4">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                <div className="flex items-center gap-3 mb-3"><Clock className="w-5 h-5" /><p className="font-black text-sm tracking-tight">Settlement Cycle</p></div>
                <div className="space-y-2 relative z-10">
                  <div className="flex items-center justify-between text-xs bg-white/10 p-2 rounded-lg border border-white/10"><span>Cycle</span><span className="font-black">MON - SUN</span></div>
                  <div className="flex items-center justify-between text-xs bg-white/10 p-2 rounded-lg border border-white/10"><span>Payout Day</span><span className="font-black">{withdrawal.settlement_day}</span></div>
                  <div className="flex items-center justify-between text-xs bg-white/10 p-2 rounded-lg border border-white/10"><span>Time (IST)</span><span className="font-black">{withdrawal.settlement_time_ist}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                   <p className="font-black text-xs text-slate-400 mb-2 uppercase tracking-widest">Withdrawal Steps</p>
                   <div className="space-y-3">
                     {[1,2,3].map((step) => (
                       <div key={step} className="flex items-center gap-3">
                         <div className="w-6 h-6 bg-brand-600 text-white rounded-full flex items-center justify-center text-[10px] font-black shadow-md">{step}</div>
                         <p className="text-xs font-bold text-slate-700">{step === 1 ? 'Login to Agency' : step === 2 ? 'Go to Wallet → Withdraw' : 'Enter Address & Pay'}</p>
                       </div>
                     ))}
                   </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="more" className="mt-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
             {dynamicSections.map((section) => (
                <Card key={section.section_key} className="border-none shadow-xl bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden">
                   <div className={`bg-gradient-to-r ${sectionVisuals[section.section_key]?.gradient || 'from-slate-500 to-slate-700'} p-4 text-white flex items-center gap-3`}>
                      <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center shadow-lg">{sectionVisuals[section.section_key]?.icon || <FileText className="w-5 h-5" />}</div>
                      <div><h3 className="font-black text-sm uppercase tracking-tight leading-none">{section.section_title}</h3><p className="text-[8px] text-white/70 font-bold uppercase mt-1 tracking-widest">Section Policy</p></div>
                   </div>
                   <CardContent className="p-5">
                      <ul className="space-y-3">
                        {(Array.isArray(section.content?.items) ? section.content.items : Array.isArray(section.content) ? section.content : []).map((it: any, idx: number) => (
                           <li key={idx} className="flex gap-3 text-xs font-medium text-slate-600 leading-relaxed"><div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black">{idx+1}</div>{typeof it === 'string' ? it : it?.title || JSON.stringify(it)}</li>
                        ))}
                      </ul>
                   </CardContent>
                </Card>
             ))}
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <motion.div variants={itemVariants} className="pt-4 text-center">
           <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-100 px-4 py-2 rounded-full mb-8 shadow-sm">
             <Sparkles className="w-4 h-4 text-brand-600" />
             <p className="text-[10px] font-black text-brand-800 uppercase tracking-widest leading-none mt-0.5">Premium Policy Hub v2.0</p>
           </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
export default AgencyPolicy;