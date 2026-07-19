import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Shield, Wallet, TrendingUp, Globe, Users, 
  CheckCircle2, Sparkles, Gem, Phone, DollarSign, Star,
  Zap, Award, BadgeCheck, Clock, ArrowRight, Gem
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import bannerImage from "@/assets/payroll-helper-guide-banner.jpg";

const PayrollHelperGuide = () => {
  const navigate = useNavigate();
  const [topAgencyRate, setTopAgencyRate] = useState<number | null>(null);

  useEffect(() => {
    const fetchTop = async () => {
      const { data } = await supabase
        .from("agency_level_tiers")
        .select("commission_rate")
        .eq("is_active", true)
        .order("commission_rate", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setTopAgencyRate(Number(data.commission_rate));
    };
    fetchTop();
    const channel = supabase
      .channel("payroll-guide-tiers")
      .on("postgres_changes", { event: "*", schema: "public", table: "agency_level_tiers" }, fetchTop)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const topRateLabel = topAgencyRate != null ? `up to ${topAgencyRate}%` : "based on your level";


  const roles = [
    {
      icon: Gem,
      title: "Process User Top-ups",
      desc: "When users purchase diamonds through local payment methods (bKash, Nagad, JazzCash, etc.), you receive the payment and deliver the diamonds to the user's account instantly.",
      color: "from-amber-500 to-orange-500",
    },
    {
      icon: Wallet,
      title: "Process Agency Withdrawals",
      desc: "Agencies request weekly salary withdrawals for their hosts. You process these payments by sending money to the agency owner and receiving diamonds as reward in return.",
      color: "from-emerald-500 to-teal-500",
    },
    {
      icon: Gem,
      title: "Diamond Trading & Selling",
      desc: "Every withdrawal you process earns you diamonds. These diamonds can be sold back to agencies or users at market rate, creating a profitable trading cycle for you.",
      color: "from-cyan-500 to-blue-500",
    },
    {
      icon: Globe,
      title: "Agency Diamond Transfers",
      desc: "Transfer diamonds to agencies who need balance for their operations. You act as the bridge between the platform's diamond economy and real-world currency.",
      color: "from-purple-500 to-pink-500",
    },
  ];

  const benefits = [
    {
      icon: TrendingUp,
      title: "Commission on Every Transaction",
      desc: `Earn a percentage commission on every top-up and withdrawal you process. Higher levels unlock higher commission rates (${topRateLabel}).`,
    },

    {
      icon: Gem,
      title: "Diamond Rewards from Withdrawals",
      desc: "When you process an agency withdrawal, you receive diamonds as a reward. These diamonds have real monetary value and can be sold.",
    },
    {
      icon: Star,
      title: "Level-Up System (L1 → L5)",
      desc: "Start at Level 1 and progress to Level 5 by completing more transactions. Each level increases your commission rate and unlocks new privileges.",
    },
    {
      icon: Phone,
      title: "Add Your Number to Resource Panel",
      desc: "Your contact number is displayed in the Resource Panel so agencies and users can reach you directly for transactions. More visibility = more orders.",
    },
    {
      icon: Shield,
      title: "Verified Badge & Priority Support",
      desc: "As a verified Payroll Helper, you get a trusted badge on your profile and access to priority admin support for any transaction issues.",
    },
    {
      icon: Globe,
      title: "Serve Your Entire Country",
      desc: "You are assigned to your country and serve all users and agencies within that region. No geographical limits within your assigned zone.",
    },
  ];

  const howItWorks = [
    {
      step: "01",
      title: "Apply & Get Verified",
      desc: "Submit your Payroll Helper application through the app. Admin team reviews and verifies your identity within 24-48 hours.",
      color: "bg-amber-500",
    },
    {
      step: "02",
      title: "Add Your Payment Methods",
      desc: "Set up your local payment methods (bKash, Nagad, JazzCash, EasyPaisa, etc.) so users and agencies can send/receive payments.",
      color: "bg-emerald-500",
    },
    {
      step: "03",
      title: "Register in Resource Panel",
      desc: "Add your contact number to the Resource Panel. This makes you visible to all agencies and users in your country who need transaction help.",
      color: "bg-cyan-500",
    },
    {
      step: "04",
      title: "Receive & Process Orders",
      desc: "When a user wants to top-up or an agency requests withdrawal, you receive a notification. Process the payment and confirm the transaction.",
      color: "bg-purple-500",
    },
    {
      step: "05",
      title: "Earn Diamonds & Commission",
      desc: "For every completed transaction, you earn commission (percentage of amount) plus diamond rewards for withdrawal processing.",
      color: "bg-pink-500",
    },
    {
      step: "06",
      title: "Sell Diamonds for Profit",
      desc: "Accumulated diamonds can be sold to agencies or users who need them. This creates a secondary income stream on top of your commissions.",
      color: "bg-orange-500",
    },
  ];

  const diamondCycle = [
    { label: "Agency requests withdrawal", icon: Wallet },
    { label: "You pay the agency in local currency", icon: DollarSign },
    { label: "You receive diamonds as reward", icon: Gem },
    { label: "Sell diamonds to other agencies/users", icon: TrendingUp },
    { label: "Earn profit from the diamond trade", icon: Award },
  ];

  return (
    <div
      className="fixed inset-0 overflow-y-auto overscroll-contain bg-gradient-to-br from-brand-50 via-white to-info-50"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-brand-600 via-info-600 to-brand-700 text-white safe-area-top shadow-lg">
        <div className="flex items-center h-14 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0 text-white hover:bg-white/20 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 text-center">
            <h1 className="font-bold text-lg">Payroll Helper Guide</h1>
            <p className="text-[10px] text-white/80 uppercase tracking-wider font-medium">Complete A-Z Overview</p>
          </div>
          <div className="w-10" />
        </div>
      </div>

      {/* Hero Banner */}
      <div className="relative">
        <img src={bannerImage} alt="Payroll Helper System" loading="eager" decoding="async" {...({ fetchpriority: "high" } as Record<string, string>)} className="w-full h-52 object-cover"/>
        <div className="absolute inset-0 bg-gradient-to-t from-brand-600/20 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/60 to-transparent">
          <Badge className="bg-gradient-to-r from-brand-500 via-info-400 to-brand-500 text-white border border-white/20 text-[10px] font-bold tracking-wide shadow-lg shadow-brand-500/30 mb-2 px-3 py-0.5 uppercase">
            💎 Premium Opportunity
          </Badge>
          <h2 className="text-2xl font-black text-white leading-tight drop-shadow-md">
            Become a Payroll Helper
          </h2>
          <p className="text-white/90 text-sm mt-1 font-medium">
            Process salaries, earn diamonds, and build your trading business
          </p>
        </div>
      </div>

      <div className="p-4 space-y-6 pb-24">
        {/* What is a Payroll Helper */}
        <section className="bg-white rounded-2xl p-5 border border-brand-100 shadow-lg shadow-brand-500/5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-brand-600" />
            </div>
            <h3 className="font-bold text-base text-slate-800">What is a Payroll Helper?</h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed font-medium">
            A <strong className="text-brand-600 font-black">Payroll Helper</strong> is a trusted, verified member of our platform who acts as a <strong className="text-info-600 font-black">financial bridge</strong> between the app and its users. You process real-money transactions — including user diamond top-ups, agency salary withdrawals, and diamond transfers — using local payment methods. In return, you earn <strong className="text-success-600 font-black">commissions</strong> and <strong className="text-amber-600 font-black">diamond rewards</strong> that can be converted into real profit.
          </p>
        </section>

        {/* Core Roles */}
        <section>
          <h3 className="font-bold text-sm text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-brand-500" />
            Core Responsibilities
          </h3>
          <div className="space-y-4">
            {roles.map((role, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-slate-100 shadow-md hover:shadow-xl transition-all duration-300">
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${role.color} flex items-center justify-center shrink-0 shadow-lg shadow-black/10`}>
                      <role.icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{role.title}</h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">{role.desc}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Benefits */}
        <section>
          <h3 className="font-bold text-sm text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-brand-500" />
            Benefits You Get
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {benefits.map((benefit, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-start gap-4 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 border border-brand-100">
                  <benefit.icon className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{benefit.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed font-medium">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Resource Panel Section */}
        <section className="bg-gradient-to-br from-info-600 to-brand-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <Phone className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-black text-lg">Resource Panel</h3>
            </div>
            <p className="text-sm text-white/90 leading-relaxed mb-5 font-medium">
              As a Payroll Helper, you can <strong className="text-white font-black underline underline-offset-4">add your phone number</strong> to the <strong className="text-white font-black">Resource Panel</strong>. This makes you visible to all agencies and users in your country for direct orders.
            </p>
            <div className="space-y-3">
              {[
                "Public display of name, country & number",
                "Direct contact via WhatsApp or Call",
                "Increased visibility = more earnings",
                "Admin verification before going live"
              ].map((text, i) => (
                <div key={i} className="flex items-center gap-3 text-xs font-bold text-white/80">
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works — Step by Step */}
        <section>
          <h3 className="font-bold text-sm text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
            <BadgeCheck className="w-4 h-4 text-brand-500" />
            Step by Step Process
          </h3>
          <div className="space-y-4">
            {howItWorks.map((step, idx) => (
              <div key={idx} className="flex gap-4 group">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-2xl ${step.color} flex items-center justify-center text-white text-xs font-black shrink-0 shadow-lg shadow-black/10 group-hover:scale-110 transition-transform`}>
                    {step.step}
                  </div>
                  {idx < howItWorks.length - 1 && (
                    <div className="w-1 h-full bg-slate-200 rounded-full mt-2" />
                  )}
                </div>
                <div className="pb-6">
                  <h4 className="font-bold text-slate-800 text-sm">{step.title}</h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Diamond Earning Cycle */}
        <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-info-50 flex items-center justify-center">
              <Gem className="w-5 h-5 text-info-600" />
            </div>
            <h3 className="font-black text-base text-slate-800">Diamond Trading Cycle</h3>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed mb-6 font-medium">
            This is how the <strong className="text-info-600 font-black uppercase tracking-tighter">diamond economy</strong> works for you:
          </p>
          <div className="space-y-3">
            {diamondCycle.map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 group-hover:bg-info-500 group-hover:border-info-500 transition-all duration-300">
                  <item.icon className="w-5 h-5 text-info-600 group-hover:text-white" />
                </div>
                <div className="flex-1 bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100 group-hover:bg-white group-hover:shadow-md transition-all duration-300">
                  <span className="text-xs font-bold text-slate-700">{item.label}</span>
                </div>
                {idx < diamondCycle.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 hidden sm:block" />
                )}
              </div>
            ))}
          </div>
          <div className="bg-info-50 rounded-2xl p-4 mt-6 border border-info-100">
            <p className="text-xs text-info-700 font-bold leading-relaxed">
              💡 Pro Tip: Process more withdrawals to accumulate diamonds. Strategic trading is the key to maximum profit!
            </p>
          </div>
        </section>

        {/* Salary Processing for Hosts */}
        <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-2xl" />
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-brand-600" />
            </div>
            <h3 className="font-black text-base text-slate-800">Processing Salaries</h3>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed mb-6 font-medium">
            Agencies submit withdrawal requests to pay hosts. Your role as a Payroll Helper:
          </p>
          <div className="space-y-3">
            {[
              "Receive order notification in Dashboard",
              "Send payment via local method (bKash, etc.)",
              "Upload transaction screenshot as proof",
              "Receive diamond rewards instantly after verification"
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 group">
                <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-brand-600" />
                </div>
                <span className="text-xs font-bold text-slate-600 group-hover:text-brand-600 transition-colors">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Important Notes */}
        <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-brand-600" />
            </div>
            <h3 className="font-black text-base text-slate-900">Security Guidelines</h3>
          </div>
          <div className="space-y-4">
            {[
              "Process orders within 24 hours of notification",
              "Always upload clear transaction screenshots",
              "Maintain professional conduct with agencies",
              "Report suspicious activity to Admin immediately",
              "Violations will result in status revocation"
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-brand-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-black text-brand-600">{idx + 1}</span>
                </div>
                <span className="text-xs font-bold text-slate-600 leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center pt-4">
          <Button
            onClick={() => navigate(-1)}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-brand-600 to-info-600 text-white font-black text-lg shadow-xl shadow-brand-500/20 active:scale-95 transition-all"
          >
            I Understand, Go Back
          </Button>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-4">
            Official Payroll Helper Documentation
          </p>
        </div>
      </div>
    </div>
  );
};

export default PayrollHelperGuide;
