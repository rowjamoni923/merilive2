import { motion } from "framer-motion";
import { Wallet, Trophy, ArrowRight, Download, CheckCircle2, Sparkles, Gift, Radio, Clock, Zap, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAY_STORE_URL } from "@/utils/shareLinks";
import hostHeroImg from "@/assets/landing-host-hero.jpg";
import bonusImg from "@/assets/landing-bonus.jpg";
import earningsImg from "@/assets/landing-earnings.jpg";

const earningSteps = [
  {
    step: "01",
    title: "Download MeriLive App",
    desc: "Install from Google Play Store and create your account with phone or Google sign-in.",
    icon: Download,
    color: "from-pink-500 to-rose-500",
    glow: "shadow-pink-500/20",
  },
  {
    step: "02",
    title: "Apply for Host Verification",
    desc: "Submit your face verification and basic profile. Get approved within 24 hours.",
    icon: CheckCircle2,
    color: "from-amber-500 to-orange-500",
    glow: "shadow-amber-500/20",
  },
  {
    step: "03",
    title: "Go Live & Receive Gifts",
    desc: "Start streaming! Viewers send you virtual gifts that convert to real beans (earnings).",
    icon: Radio,
    color: "from-purple-500 to-indigo-500",
    glow: "shadow-purple-500/20",
  },
  {
    step: "04",
    title: "Complete Daily Tasks",
    desc: "Use the Task Center to complete daily missions and earn bonus beans on top of gifts.",
    icon: Trophy,
    color: "from-emerald-500 to-green-500",
    glow: "shadow-emerald-500/20",
  },
];

const HostProgramCard = () => {
  return (
    <section className="py-24 px-4 relative" id="host-program">
      {/* Ambient glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-amber-500/[0.03] rounded-full blur-[200px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-pink-500/[0.03] rounded-full blur-[180px]" />
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
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 mb-6 backdrop-blur-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-600">
              Host Program
            </span>
          </motion.span>
          <h2 className="text-4xl md:text-6xl font-extrabold mb-5 tracking-tight">
            Become a{" "}
            <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-pink-500 bg-clip-text text-transparent">
              Star Host
            </span>
          </h2>
 <p className="text-slate-600 max-w-xl mx-auto text-base leading-relaxed">
            Turn your talent into real income. Stream live, receive gifts from fans, and get paid every week automatically.
          </p>
        </motion.div>

        {/* Hero Image Banner */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
 className="relative rounded-3xl overflow-hidden mb-14 border border-slate-200 shadow-2xl shadow-amber-500/5"
        >
          <img loading="lazy" decoding="async" src={hostHeroImg} alt="Live Streaming Host" className="w-full h-72 md:h-96 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 mb-4 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
              </span>
              <span className="text-xs font-semibold text-amber-600">New Host Bonus Active</span>
            </div>
            <h3 className="text-3xl md:text-4xl font-extrabold mb-3 text-slate-900">
              Stream Live & Earn <span className="text-amber-600">Real Money</span>
            </h3>
 <p className="text-slate-600 text-sm max-w-lg leading-relaxed">
              New hosts earn up to <span className="text-amber-600 font-semibold">$10 per day</span> with our exclusive 10-day bonus program — just 5 hours of daily streaming!
            </p>
          </div>
        </motion.div>

        {/* New Host Bonus Banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden mb-14 border border-amber-500/20"
        >
          <img loading="lazy" decoding="async" src={bonusImg} alt="Host Bonus Rewards" className="w-full h-56 md:h-64 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/70 to-transparent" />
          <div className="absolute inset-0 flex items-center p-8 md:p-12">
            <div className="max-w-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
 <Gift className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-extrabold">10-Day Welcome Bonus</h3>
                  <p className="text-xs text-amber-700">For New Verified Hosts Only</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
 <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center backdrop-blur-sm">
                  <div className="text-lg font-extrabold text-amber-600">5 hrs</div>
 <div className="text-[10px] text-slate-600 uppercase">Daily Live</div>
                </div>
 <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center backdrop-blur-sm">
                  <div className="text-lg font-extrabold text-emerald-600">$10</div>
 <div className="text-[10px] text-slate-600 uppercase">Per Day</div>
                </div>
 <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center backdrop-blur-sm">
                  <div className="text-lg font-extrabold text-pink-600">10 Days</div>
 <div className="text-[10px] text-slate-600 uppercase">Duration</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Key Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
          {[
            {
              icon: Wallet,
              title: "Minimum Withdraw",
              value: "$10",
              desc: "Low minimum threshold for easy cash-out via local payment methods",
              gradient: "from-emerald-500/15 to-green-500/10",
              border: "border-emerald-500/15",
              iconColor: "text-emerald-600",
              valueColor: "text-emerald-600",
            },
            {
            },
            {
            },
          ].map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12 }}
              className={`relative p-7 rounded-2xl bg-gradient-to-br ${card.gradient} border ${card.border} overflow-hidden group hover:scale-[1.02] transition-transform duration-300`}
            >
              <div className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${card.gradient} rounded-full blur-2xl opacity-50`} />
              <div className="relative">
                <card.icon className={`w-10 h-10 ${card.iconColor} mb-4`} />
                <div className={`text-2xl font-extrabold ${card.valueColor} mb-1`}>{card.value}</div>
 <h4 className="text-sm font-bold text-slate-900 mb-2">{card.title}</h4>
 <p className="text-xs text-slate-600 leading-relaxed">{card.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* How to Start - Steps */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-14"
        >
          <h3 className="text-2xl md:text-3xl font-extrabold text-center mb-3 text-slate-900">
            How to Start <span className="bg-gradient-to-r from-amber-400 to-pink-400 bg-clip-text text-transparent">Earning</span>
          </h3>
 <p className="text-slate-600 text-sm text-center mb-10 max-w-md mx-auto">
            Follow these simple steps to become a verified host and start earning
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {earningSteps.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
 className={`flex gap-5 p-6 rounded-2xl bg-white shadow-sm border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all duration-300 group`}
              >
                <div className={`w-14 h-14 flex-shrink-0 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-xl ${step.glow} group-hover:scale-110 transition-transform duration-300`}>
 <step.icon className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-extrabold text-amber-600 uppercase tracking-wider">
                      Step {step.step}
                    </span>
                    {i < earningSteps.length - 1 && (
                      <div className="h-px flex-1 bg-gradient-to-r from-white/5 to-transparent" />
                    )}
                  </div>
 <h4 className="text-base font-bold text-slate-900 mb-1.5">{step.title}</h4>
 <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Task Center Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-14"
        >
 <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-xl shadow-purple-500/5">
            <img loading="lazy" decoding="async" src={earningsImg} alt="Earnings & Rewards" className="w-full h-72 object-cover" />
          </div>
          <div className="p-8 rounded-2xl bg-gradient-to-br from-amber-500/5 via-orange-500/3 to-pink-500/5 border border-amber-500/10 flex flex-col justify-center backdrop-blur-sm">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-5 shadow-lg shadow-amber-500/20">
 <Zap className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-extrabold mb-2">Task Center Rewards</h3>
 <p className="text-xs text-slate-600 mb-5">Complete daily missions to earn extra beans</p>
            <ul className="space-y-4">
              {[
                "Complete daily streaming hours for bonus beans",
                "Engage with viewers to unlock milestone rewards",
                "Weekly leaderboard prizes for top-performing hosts",
                "Special event bonuses and seasonal campaigns",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 group">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-emerald-500/30 transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
 <span className="text-sm text-slate-600 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Apply CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <Button
            onClick={async () => { const { openInApp } = await import("@/utils/inAppNavigation"); openInApp(PLAY_STORE_URL); }}
            size="lg"
 className="h-14 md:h-16 px-6 md:px-14 w-full sm:w-auto bg-gradient-to-r from-amber-500 via-orange-500 to-pink-600 hover:from-amber-600 hover:via-orange-600 hover:to-pink-700 text-white font-extrabold rounded-2xl shadow-[0_10px_40px_rgba(245,158,11,0.3)] hover:shadow-[0_10px_50px_rgba(245,158,11,0.45)] text-sm md:text-lg group transition-all duration-300"
          >
            <Download className="w-6 h-6 mr-2.5" />
            Download App & Apply for Host
            <ArrowRight className="w-5 h-5 ml-2.5 group-hover:translate-x-1.5 transition-transform" />
          </Button>
 <p className="text-xs text-slate-500 mt-4">Download the app first, then apply for host verification inside the app</p>
        </motion.div>
      </div>
    </section>
  );
};

export default HostProgramCard;
