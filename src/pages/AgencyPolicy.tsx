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

const STRUCTURED_KEYS = new Set(["exchange_rate", "commission_tiers", "host_requirements", "violations", "prohibited_content", "call_rules", "withdrawal"]);

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
    } catch (error) { console.error('Error fetching policies:', error); } finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col bg-slate-50">
        <div className="h-14 bg-brand-600 shadow-md" />
        <div className="flex-1 p-4 space-y-4">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      </div>
    );
  }

  const exchangeRate = policyData?.exchange_rate || { rate: 9000, currency: 'Beans', display: '9,000 Beans = $1 USD' };
  const commissionTiers = (levelTiers ?? []).length > 0 ? (levelTiers ?? []).map(tier => ({ level: tier.level_code, name: tier.level_name, income_min: tier.min_weekly_income, income_max: tier.max_weekly_income === 9999999999 ? null : tier.max_weekly_income, rate: tier.commission_rate })) : policyData?.commission_tiers?.tiers || [];

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50 overflow-y-auto">
      <div className="sticky top-0 z-50 bg-gradient-to-r from-brand-600 via-info-600 to-brand-700 h-14 shadow-lg flex items-center justify-between px-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5 text-white" /></motion.button>
        <h1 className="text-lg font-black text-white tracking-tight">AGENCY POLICY</h1>
        <div className="w-9" />
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 overflow-y-auto p-4 space-y-5 pb-20">
        {/* Hero */}
        <div onClick={() => navigate('/policies-benefits')} className="relative rounded-3xl overflow-hidden shadow-2xl ring-4 ring-white shadow-brand-500/20 active:scale-[0.98] transition-all">
          <img src={policyHeroBanner} alt="Policies & Benefits" className="w-full h-40 object-cover" />
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
             <img src={meriliveLogo} alt="MeriLive" className="w-12 h-12 drop-shadow-lg" />
          </div>
        </div>

        {/* Exchange Rate Card - 3D HD */}
        <Card className="border-none shadow-2xl bg-gradient-to-br from-success-500 via-success-600 to-emerald-700 text-white p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-lg"><DollarSign className="w-8 h-8 text-white" /></div>
              <div>
                <p className="text-white/80 text-[10px] font-black uppercase tracking-widest mb-1">Exchange Rate</p>
                <p className="text-2xl font-black tracking-tight">{exchangeRate.rate?.toLocaleString()} BEANS = $1.00 USD</p>
              </div>
            </div>
        </Card>

        {/* Dynamic sections and other policy content would go here, continuing similar 3D polish pattern */}
      </motion.div>
    </div>
  );
};
export default AgencyPolicy;