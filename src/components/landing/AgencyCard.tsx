import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, ArrowRight, Building2, Copy, Check, Shield, TrendingUp, Clock, Wallet, DollarSign, CalendarCheck, CreditCard, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import agencyHeroImg from "@/assets/landing-agency-hero.jpg";
import payrollImg from "@/assets/landing-payroll.jpg";

interface Agency {
  id: string;
  name: string;
  agency_code: string;
  logo_url: string | null;
  total_hosts: number | null;
}

const commissionTiers = [
  { level: "A1", rate: "3%", income: "$0 - $99", color: "from-slate-500/30 to-slate-600/20", border: "border-slate-500/20" },
  { level: "A2", rate: "5%", income: "$100 - $499", color: "from-blue-500/20 to-blue-600/10", border: "border-blue-500/20" },
  { level: "A3", rate: "7%", income: "$500 - $999", color: "from-purple-500/20 to-purple-600/10", border: "border-purple-500/20" },
  { level: "A4", rate: "10%", income: "$1K - $2.9K", color: "from-amber-500/20 to-amber-600/10", border: "border-amber-500/20" },
  { level: "A5", rate: "12%", income: "$3,000+", color: "from-pink-500/25 to-rose-600/15", border: "border-pink-500/25" },
];

const AgencyCard = () => {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgencies = async () => {
      const { data } = await supabase
        .from("agencies")
        .select("id, name, agency_code, logo_url, total_hosts")
        .eq("is_active", true)
        .eq("is_blocked", false)
        .order("total_hosts", { ascending: false });
      if (data) setAgencies(data);
    };
    fetchAgencies();
  }, []);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <section className="py-24 px-4 relative" id="agencies">
      {/* Ambient glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-blue-500/[0.03] rounded-full blur-[200px]" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-purple-500/[0.03] rounded-full blur-[180px]" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 mb-6 backdrop-blur-sm"
          >
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-300">
              Agency & Payroll
            </span>
          </motion.span>
          <h2 className="text-4xl md:text-6xl font-extrabold mb-5 tracking-tight">
            Join an{" "}
            <span className="bg-gradient-to-r from-blue-300 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
              Agency
            </span>
          </h2>
          <p className="text-white/35 max-w-xl mx-auto text-base leading-relaxed">
            Agencies provide training, promotion, and higher commission rates. Join one to accelerate your hosting career.
          </p>
        </motion.div>

        {/* Agency Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden mb-14 border border-white/[0.08] shadow-2xl shadow-blue-500/5"
        >
          <img src={agencyHeroImg} alt="Agency Team" className="w-full h-72 md:h-80 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06060a] via-[#06060a]/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
            <h3 className="text-3xl md:text-4xl font-extrabold mb-3">
              Agency <span className="text-blue-400">Commission Tiers</span>
            </h3>
            <p className="text-white/50 text-sm max-w-lg leading-relaxed">
              Earn higher commissions as your agency grows. Levels reset weekly for fair competition.
            </p>
          </div>
        </motion.div>

        {/* Commission Tiers - Premium Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-14">
          {commissionTiers.map((tier, i) => (
            <motion.div
              key={tier.level}
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={`relative p-5 rounded-2xl bg-gradient-to-br ${tier.color} border ${tier.border} text-center hover:scale-105 transition-all duration-300 overflow-hidden group`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${tier.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              <div className="relative">
                <div className="text-xl font-extrabold bg-gradient-to-r from-blue-300 to-purple-400 bg-clip-text text-transparent mb-2">
                  {tier.level}
                </div>
                <div className="text-3xl font-black text-white/95 mb-1">{tier.rate}</div>
                <div className="text-[10px] text-white/30 font-medium">{tier.income}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Payroll System Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-14"
        >
          <h3 className="text-2xl md:text-3xl font-extrabold text-center mb-3">
            Automated <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Payroll System</span>
          </h3>
          <p className="text-white/25 text-sm text-center mb-10 max-w-md mx-auto">
            Transparent, automated weekly payouts you can trust
          </p>

          {/* Payroll Hero */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="rounded-2xl overflow-hidden border border-blue-500/10 shadow-xl shadow-blue-500/5">
              <img src={payrollImg} alt="Payroll System" className="w-full h-72 object-cover" />
            </div>
            <div className="flex flex-col justify-center space-y-5">
              {[
                {
                  icon: CalendarCheck,
                  title: "Weekly Auto-Transfer",
                  desc: "Every Sunday at midnight (BST), all host earnings are automatically processed and transferred to their agency",
                  color: "text-blue-400",
                  bg: "from-blue-500/15 to-blue-600/5",
                },
                {
                  icon: Banknote,
                  title: "100% Host Earnings",
                  desc: "Hosts receive their full earned amount. Agency commission comes as a separate bonus from the company",
                  color: "text-emerald-400",
                  bg: "from-emerald-500/15 to-emerald-600/5",
                },
                {
                  icon: CreditCard,
                  title: "Payment Methods",
                  desc: "USDT, ePay, and other international payment systems supported for global withdrawals",
                  color: "text-purple-400",
                  bg: "from-purple-500/15 to-purple-600/5",
                },
                {
                  icon: Shield,
                  title: "Payroll Helper System",
                  desc: "Dedicated payment helpers process withdrawals quickly and ensure timely delivery to your local account",
                  color: "text-amber-400",
                  bg: "from-amber-500/15 to-amber-600/5",
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex gap-4 p-4 rounded-xl bg-gradient-to-r ${item.bg} border border-white/[0.05] hover:border-white/[0.1] transition-all`}
                >
                  <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-white/[0.05] flex items-center justify-center">
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white/85 mb-0.5">{item.title}</h4>
                    <p className="text-[11px] text-white/35 leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Payroll Flow Visual */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="p-6 rounded-2xl bg-gradient-to-r from-blue-500/5 via-indigo-500/3 to-purple-500/5 border border-blue-500/10"
          >
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 text-center">
              {[
                { label: "Host Goes Live", icon: "🎤" },
                { label: "Receives Gifts", icon: "🎁" },
                { label: "Beans Accumulated", icon: "💰" },
                { label: "Weekly Auto-Transfer", icon: "🔄" },
                { label: "Cash to Account", icon: "💵" },
              ].map((step, i) => (
                <div key={step.label} className="flex items-center gap-3 md:gap-6">
                  <div className="flex flex-col items-center">
                    <div className="text-2xl mb-1.5">{step.icon}</div>
                    <span className="text-[10px] text-white/40 font-medium max-w-[80px]">{step.label}</span>
                  </div>
                  {i < 4 && (
                    <ArrowRight className="w-4 h-4 text-white/15 hidden sm:block" />
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Agency Benefits */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
          {[
            { title: "Training & Mentorship", desc: "Get guidance from experienced agency owners to boost your streaming skills and audience.", icon: TrendingUp, gradient: "from-blue-500/15 to-cyan-500/10", border: "border-blue-500/15", iconColor: "text-blue-400" },
            { title: "Higher Visibility", desc: "Agencies promote their hosts through events, competitions, and in-app features.", icon: Users, gradient: "from-purple-500/15 to-indigo-500/10", border: "border-purple-500/15", iconColor: "text-purple-400" },
            { title: "Sub-Agency Bonus", desc: "Parent agencies earn 2% bonus from sub-agency hosts — build your network and grow!", icon: DollarSign, gradient: "from-emerald-500/15 to-green-500/10", border: "border-emerald-500/15", iconColor: "text-emerald-400" },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12 }}
              className={`relative p-8 rounded-2xl bg-gradient-to-br ${item.gradient} border ${item.border} text-center overflow-hidden group hover:scale-[1.02] transition-transform duration-300`}
            >
              <div className={`absolute -right-8 -top-8 w-28 h-28 bg-gradient-to-br ${item.gradient} rounded-full blur-2xl opacity-50`} />
              <div className="relative">
                <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-white/[0.05] flex items-center justify-center group-hover:bg-white/[0.08] transition-colors">
                  <item.icon className={`w-7 h-7 ${item.iconColor}`} />
                </div>
                <h4 className="text-base font-bold mb-2">{item.title}</h4>
                <p className="text-xs text-white/35 leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Active Agencies List */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-14"
        >
          <h3 className="text-2xl font-extrabold text-center mb-2">
            Active <span className="text-blue-400">Agencies</span>
          </h3>
          <p className="text-xs text-white/25 text-center mb-8">
            Copy an agency code and enter it in the app to join
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {agencies.map((agency, i) => (
              <motion.div
                key={agency.id}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-blue-500/20 hover:bg-white/[0.04] transition-all duration-300 group"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center flex-shrink-0 group-hover:from-blue-500/30 group-hover:to-indigo-500/30 transition-all">
                  <Building2 className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white/80 truncate">{agency.name}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-white/30 font-mono">{agency.agency_code}</span>
                    {agency.total_hosts !== null && agency.total_hosts > 0 && (
                      <span className="text-[10px] text-blue-400/60">· {agency.total_hosts} hosts</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(agency.agency_code)}
                  className="p-2.5 rounded-lg hover:bg-blue-500/10 transition-colors flex-shrink-0"
                  title="Copy agency code"
                >
                  {copiedCode === agency.agency_code ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-white/30 group-hover:text-blue-400 transition-colors" />
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Agency CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <Button
            onClick={() => window.location.href = '/agency-signup'}
            size="lg"
            className="h-14 md:h-16 px-6 md:px-14 w-full sm:w-auto bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 hover:from-blue-600 hover:via-indigo-600 hover:to-purple-700 text-white font-extrabold rounded-2xl shadow-[0_10px_40px_rgba(59,130,246,0.3)] hover:shadow-[0_10px_50px_rgba(59,130,246,0.45)] text-sm md:text-lg group transition-all duration-300"
          >
            <Building2 className="w-6 h-6 mr-2.5" />
            Create Your Own Agency
            <ArrowRight className="w-5 h-5 ml-2.5 group-hover:translate-x-1.5 transition-transform" />
          </Button>
          <p className="text-xs text-white/20 mt-4">Or join an existing agency by copying their code above</p>
        </motion.div>
      </div>
    </section>
  );
};

export default AgencyCard;
