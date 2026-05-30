import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Shield, Wallet, TrendingUp, Globe, Users, 
  CheckCircle2, Sparkles, Gem, Phone, DollarSign, Star,
  Zap, Award, BadgeCheck, Clock, ArrowRight, Coins, FileText, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import bannerImage from "@/assets/payroll-helper-guide-banner.jpg";

const PayrollHelperGuide = () => {
  const navigate = useNavigate();

  const roles = [
    {
      icon: Coins,
      title: "Process User Top-ups",
      desc: "When users purchase coins through local payment methods (bKash, Nagad, etc.), you receive the payment and deliver the coins instantly.",
      color: "from-brand-600 to-brand-700",
    },
    {
      icon: Wallet,
      title: "Process Agency Withdrawals",
      desc: "Agencies request weekly salary withdrawals. You process these payments by sending money to the owner and receiving diamonds as reward.",
      color: "from-brand-500 to-indigo-600",
    },
    {
      icon: Gem,
      title: "Diamond Trading",
      desc: "Every withdrawal earns you diamonds. Sell them back to agencies or users at market rates for consistent profit.",
      color: "from-brand-400 to-indigo-500",
    },
    {
      icon: Globe,
      title: "Regional Financial Hub",
      desc: "Act as the bridge between the platform's economy and real-world currency for your entire country region.",
      color: "from-indigo-600 to-brand-800",
    },
  ];

  const benefits = [
    {
      icon: TrendingUp,
      title: "High Commission Rates",
      desc: "Earn up to 12%+ commission on every transaction you process. Higher levels unlock better rates.",
    },
    {
      icon: Gem,
      title: "Direct Diamond Rewards",
      desc: "Receive valuable diamonds for every withdrawal you handle. Convert them to profit instantly.",
    },
    {
      icon: Star,
      title: "Professional Tier (L1-L5)",
      desc: "Progress from Level 1 to Level 5 to unlock premium features and higher earning potential.",
    },
    {
      icon: Shield,
      title: "Official Verified Badge",
      desc: "Get a verified trust badge on your profile and priority access to platform admin support.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 safe-area-top shadow-sm">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto w-full">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0 text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 text-center">
            <h1 className="font-black text-lg text-slate-800 dark:text-white tracking-tight">Helper Guideline</h1>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-widest font-black">Official Training</p>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-lg mx-auto w-full px-4 pt-4 space-y-6">
        {/* Hero Section */}
        <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl shadow-emerald-500/10">
          <img src={bannerImage} alt="Payroll Helper System" className="w-full h-56 object-cover"/>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <Badge className="bg-emerald-500 text-white border-0 text-[9px] font-black tracking-[0.2em] mb-2 px-3 py-0.5 uppercase shadow-lg">
              Premium Earning
            </Badge>
            <h2 className="text-2xl font-black text-white leading-tight">
              Master the Payroll <br/>Helper System
            </h2>
            <p className="text-white/80 text-sm mt-2 font-medium">
              Join the official financial trading network
            </p>
          </div>
        </div>

        {/* Intro Section */}
        <section className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 border border-slate-100 dark:border-white/5 shadow-xl shadow-brand-500/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="font-black text-base text-slate-800 dark:text-white">What is a Payroll Helper?</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            A <strong className="text-emerald-600 dark:text-emerald-400 font-black">Payroll Helper</strong> is a trusted regional partner who manages the platform's diamond economy. By processing top-ups and withdrawals, you earn <strong className="text-slate-800 dark:text-white">guaranteed commissions</strong> and tradeable diamonds.
          </p>
        </section>

        {/* Roles Grid */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Your Key Roles</h3>
          <div className="grid grid-cols-1 gap-4">
            {roles.map((role, idx) => (
              <div key={idx} className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100 dark:border-white/5 shadow-xl shadow-brand-500/5 group hover:scale-[1.02] transition-all">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${role.color} flex items-center justify-center shrink-0 shadow-lg`}>
                    <role.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 dark:text-white text-base tracking-tight">{role.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed font-medium">{role.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Benefits Section */}
        <section className="bg-brand-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-brand-500/20">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                <Award className="w-7 h-7 text-white" />
              </div>
              <h3 className="font-black text-lg">Partner Benefits</h3>
            </div>
            <div className="grid grid-cols-1 gap-5">
              {benefits.map((benefit, idx) => (
                <div key={idx} className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm tracking-tight">{benefit.title}</h4>
                    <p className="text-xs text-white/70 mt-0.5 font-medium">{benefit.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Resource Panel Info */}
        <section className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 border border-slate-100 dark:border-white/5 shadow-xl shadow-brand-500/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-info-50 dark:bg-info-950 flex items-center justify-center">
              <Phone className="w-5 h-5 text-info-600 dark:text-info-400" />
            </div>
            <h3 className="font-black text-base text-slate-800 dark:text-white">Resource Panel Visibility</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium mb-4">
            As a partner, your contact number will be listed in the <strong className="text-slate-800 dark:text-white">Regional Resource Panel</strong>.
          </p>
          <div className="space-y-3">
            {["Direct WhatsApp/Call access for users", "Official regional verification", "Priority order notifications"].map((text, i) => (
              <div key={i} className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-emerald-500" />
                </div>
                {text}
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <div className="text-center pt-4 space-y-4">
          <Button
            onClick={() => navigate(-1)}
            className="w-full h-14 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-lg shadow-xl shadow-emerald-500/30 active:scale-95 transition-all"
          >
            I've Read the Guidelines
          </Button>
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.3em]">Official Partner Program Documentation</p>
        </div>
      </main>
    </div>
  );
};

const Check = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

export default PayrollHelperGuide;
