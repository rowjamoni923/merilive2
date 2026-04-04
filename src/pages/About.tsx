import { useEffect } from "react";
import { openInApp } from "@/utils/inAppNavigation";
import { motion } from "framer-motion";
import { 
  Download, Users, Video, Gift, Phone, Shield, Star, 
  Building2, DollarSign, Globe, Smartphone, Play,
  Heart, Music, Tv, Award, ChevronRight, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAY_STORE_URL, APK_DOWNLOAD_URL, PRODUCTION_DOMAIN } from "@/utils/shareLinks";
import mascotLogo from "@/assets/mascot-logo-small.webp";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } })
};

const About = () => {
  useEffect(() => {
    document.title = "MeriLive - Live Streaming, Video Call & Entertainment App | Download Now";
  }, []);

  const features = [
    { icon: Video, title: "Live Streaming", desc: "HD live streaming — interact with hosts in real-time", color: "from-red-500 to-pink-500" },
    { icon: Phone, title: "1v1 Video Call", desc: "Private HD video calling — talk to your favorite host", color: "from-blue-500 to-cyan-500" },
    { icon: Gift, title: "Virtual Gifts", desc: "Send SVGA animated gifts — support your favorite hosts", color: "from-amber-500 to-orange-500" },
    { icon: Users, title: "Party Rooms", desc: "Multi-user party rooms — hang out with friends", color: "from-purple-500 to-indigo-500" },
    { icon: Music, title: "Reels & Short Videos", desc: "Watch and create short videos — earn beans", color: "from-pink-500 to-rose-500" },
    { icon: Tv, title: "Live TV & Entertainment", desc: "Live TV channels and movies — watch for free", color: "from-green-500 to-emerald-500" },
    { icon: Heart, title: "PK Battle", desc: "Host vs Host PK battles — exciting competitions", color: "from-red-600 to-orange-500" },
    { icon: Shield, title: "Safe & Secure", desc: "Face verification and anti-fraud system", color: "from-teal-500 to-cyan-500" },
  ];

  const agencyBenefits = [
    { icon: DollarSign, text: "3%-12% Commission — 5 Levels (A1-A5)" },
    { icon: Award, text: "Weekly Auto-Payout (Every Monday)" },
    { icon: Globe, text: "Local Payment Systems (bKash, Nagad, JazzCash)" },
    { icon: Users, text: "Sub-Agent Recruitment System" },
    { icon: Star, text: "Agency Ranking & Performance Dashboard" },
    { icon: Shield, text: "Dedicated Payroll Helper Support" },
  ];

  const hostBenefits = [
    "Earn beans from live streaming",
    "Income from 1v1 video calls",
    "Gift commission revenue",
    "9,000 Beans = $1 USD",
    "Minimum $10 withdrawal",
    "Host badge via face verification",
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MobileApplication",
            "name": "MeriLive",
            "operatingSystem": "Android",
            "applicationCategory": "EntertainmentApplication",
            "description": "MeriLive is a premium live streaming, video calling, and entertainment app. Connect with hosts, send gifts, join party rooms, and earn money as a host or agency owner.",
            "url": "https://merilive.com/about",
            "downloadUrl": PLAY_STORE_URL,
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
            "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.5", "ratingCount": "1000" }
          })
        }}
      />

      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-4 py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/30 via-transparent to-transparent" />
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />
        </div>
        
        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <motion.img
            src={mascotLogo}
            alt="MeriLive Logo"
            className="w-28 h-28 mx-auto mb-6 drop-shadow-2xl"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
          />
          <motion.h1
            className="text-4xl md:text-6xl font-extrabold mb-4 bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            MeriLive
          </motion.h1>
          <motion.p
            className="text-lg md:text-xl text-white/70 mb-2 font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Live Streaming · Video Call · Entertainment
          </motion.p>
          <motion.p
            className="text-sm md:text-base text-white/50 mb-8 max-w-xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Premium live streaming and video calling app. Connect with hosts, send gifts, join party rooms, and enjoy real-time entertainment.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Button
              size="lg"
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold text-lg px-8 py-6 rounded-2xl shadow-lg shadow-green-500/30"
              onClick={() => openInApp(PLAY_STORE_URL)}
            >
              <Play className="w-5 h-5 mr-2" />
              Google Play Store
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 font-bold text-lg px-8 py-6 rounded-2xl"
              onClick={() => openInApp(APK_DOWNLOAD_URL)}
            >
              <Download className="w-5 h-5 mr-2" />
              APK Download
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ===== FEATURES SECTION ===== */}
      <section className="px-4 py-16 max-w-6xl mx-auto">
        <motion.h2
          className="text-3xl md:text-4xl font-bold text-center mb-4"
          initial="hidden" whileInView="visible" viewport={{ once: true }}
          variants={fadeUp} custom={0}
        >
          App Features
        </motion.h2>
        <motion.p
          className="text-white/50 text-center mb-12 max-w-lg mx-auto"
          initial="hidden" whileInView="visible" viewport={{ once: true }}
          variants={fadeUp} custom={1}
        >
          Discover everything you can do on MeriLive
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 group"
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fadeUp} custom={i}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <f.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-white/60 text-sm">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== HOST EARNING SECTION ===== */}
      <section className="px-4 py-16 bg-gradient-to-b from-transparent via-purple-900/10 to-transparent">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            className="text-3xl md:text-4xl font-bold text-center mb-4"
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={0}
          >
            🎤 Earn as a Host
          </motion.h2>
          <motion.p
            className="text-white/50 text-center mb-10 max-w-lg mx-auto"
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={1}
          >
            Become a host on MeriLive and earn from home
          </motion.p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hostBenefits.map((b, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-4"
                initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fadeUp} custom={i}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                  <ChevronRight className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/80 text-sm">{b}</span>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="mt-8 text-center"
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={7}
          >
            <Button
              size="lg"
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold rounded-2xl px-8 py-6"
              onClick={() => openInApp(PLAY_STORE_URL)}
            >
              <Smartphone className="w-5 h-5 mr-2" />
              Download App & Become a Host
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ===== AGENCY SECTION ===== */}
      <section className="px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            className="text-3xl md:text-4xl font-bold text-center mb-4"
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={0}
          >
            🏢 Agency System
          </motion.h2>
          <motion.p
            className="text-white/50 text-center mb-10 max-w-xl mx-auto"
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={1}
          >
            Build your own agency, recruit hosts, and earn commissions
          </motion.p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {agencyBenefits.map((b, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-5"
                initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fadeUp} custom={i}
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                  <b.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-white/80 text-sm">{b.text}</span>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border border-blue-500/20 rounded-2xl p-6 md:p-8"
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={7}
          >
            <h3 className="text-xl font-bold mb-4 text-center">Agency Levels & Commission</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-white/60">Level</th>
                     <th className="text-left py-3 px-4 text-white/60">Weekly Income</th>
                     <th className="text-left py-3 px-4 text-white/60">Commission</th>
                  </tr>
                </thead>
                <tbody className="text-white/80">
                  <tr className="border-b border-white/5"><td className="py-3 px-4 font-medium">A1</td><td className="py-3 px-4">$0 - $99</td><td className="py-3 px-4 text-green-400">3%</td></tr>
                  <tr className="border-b border-white/5"><td className="py-3 px-4 font-medium">A2</td><td className="py-3 px-4">$100 - $499</td><td className="py-3 px-4 text-green-400">5%</td></tr>
                  <tr className="border-b border-white/5"><td className="py-3 px-4 font-medium">A3</td><td className="py-3 px-4">$500 - $1,999</td><td className="py-3 px-4 text-green-400">8%</td></tr>
                  <tr className="border-b border-white/5"><td className="py-3 px-4 font-medium">A4</td><td className="py-3 px-4">$2,000 - $4,999</td><td className="py-3 px-4 text-green-400">10%</td></tr>
                  <tr><td className="py-3 px-4 font-medium text-amber-400">A5 ⭐</td><td className="py-3 px-4">$5,000+</td><td className="py-3 px-4 text-green-400 font-bold">12%</td></tr>
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div
            className="mt-8 flex flex-col sm:flex-row gap-4 justify-center"
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={8}
          >
            <Button
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold rounded-2xl px-8 py-6"
              onClick={() => openInApp('/policies')}
            >
              <Building2 className="w-5 h-5 mr-2" />
              View Agency Policy
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 font-bold rounded-2xl px-8 py-6"
              onClick={() => openInApp(PLAY_STORE_URL)}
            >
              <ExternalLink className="w-5 h-5 mr-2" />
              Create Agency in App
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ===== DOWNLOAD CTA SECTION ===== */}
      <section className="px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 border border-purple-500/20 rounded-3xl p-8 md:p-12"
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} custom={0}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Download MeriLive Today
            </h2>
            <p className="text-white/60 mb-8 max-w-md mx-auto">
              Live streaming, video calls, party rooms and much more — all in one app!
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold text-lg px-8 py-6 rounded-2xl shadow-lg shadow-green-500/30"
                onClick={() => openInApp(PLAY_STORE_URL)}
              >
                <Play className="w-5 h-5 mr-2" />
                Google Play Store
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10 font-bold text-lg px-8 py-6 rounded-2xl"
                onClick={() => openInApp(APK_DOWNLOAD_URL)}
              >
                <Download className="w-5 h-5 mr-2" />
                Direct APK Download
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="px-4 py-10 border-t border-white/10">
        <div className="max-w-4xl mx-auto text-center">
          <img src={mascotLogo} alt="MeriLive" className="w-12 h-12 mx-auto mb-4" />
          <p className="text-white/40 text-sm mb-2">MeriLive - Live Streaming & Video Call App</p>
          <div className="flex gap-6 justify-center text-white/40 text-xs">
            <a href={`${PRODUCTION_DOMAIN}/policies`} className="hover:text-white/70 transition-colors">Policies</a>
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white/70 transition-colors">Play Store</a>
          </div>
          <p className="text-white/20 text-xs mt-6">© {new Date().getFullYear()} MeriLive. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default About;
