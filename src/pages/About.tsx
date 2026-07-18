import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useEnableBrowserPageInteraction } from "@/hooks/useEnableBrowserPageInteraction";
import { openInApp } from "@/utils/inAppNavigation";
import { motion } from "framer-motion";
import {
  Download, Users, Radio, Gift, Phone, Shield, Star,
  Building2, DollarSign, Globe, Smartphone, Play,
  Heart, Music, Tv, Award, ChevronRight, ExternalLink,
  Sparkles, Crown, Zap, Lock, Coins, TrendingUp, MessageCircle, Languages
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAY_STORE_URL, APK_DOWNLOAD_URL, PRODUCTION_DOMAIN } from "@/utils/shareLinks";
import mascotLogo from "@/assets/app-logo.png";
import heroBanner from "@/assets/about-hero-3d.jpg";
import earningsBanner from "@/assets/about-earnings-3d.jpg";
import agencyBanner from "@/assets/about-agency-3d.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.55, ease: "easeOut" as const } })
};

// Luxury theme palette (hardcoded for this public marketing page — independent of app theme)
const INK = "#0a0e1f";       // deep midnight navy
const INK_2 = "#111733";     // raised surface
const INK_3 = "#1a2247";     // card surface
const GOLD = "#d4af6a";      // primary gold
const GOLD_SOFT = "#e8c98a"; // light gold
const CREAM = "#f5ecd7";     // body text on dark
const MUTED = "#a3a9c2";     // secondary text

const About = () => {
  useEnableBrowserPageInteraction();
  useEffect(() => {
    document.title = "MeriLive — Live Streaming, Video Call & Entertainment App | Download Now";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', 'MeriLive is a premium live streaming, video calling and entertainment app. Watch HD live shows, join party rooms, send 3D gifts, earn as a host, or build your own agency.');
  }, []);

  const features = [
    { icon: Radio, title: "HD Live Streaming", desc: "Broadcast and watch crystal-clear live streams with real-time chat, gifts and PK battles.", color: "from-rose-500 to-pink-500" },
    { icon: Phone, title: "Private 1v1 Video Call", desc: "Per-minute private HD video calls with verified hosts. Encrypted, billed by the second.", color: "from-sky-500 to-cyan-500" },
    { icon: Gift, title: "Premium 3D Gifts", desc: "Send animated VAP, SVGA and Lottie gifts — from a rose to a luxury yacht.", color: "from-amber-500 to-orange-500" },
    { icon: Users, title: "Party Rooms", desc: "Multi-seat audio rooms — bring up to 8 friends on stage and run themed games.", color: "from-violet-500 to-indigo-500" },
    { icon: Music, title: "Reels & Short Videos", desc: "Discover, watch and post short videos. Earn beans for every viral clip.", color: "from-fuchsia-500 to-rose-500" },
    { icon: Tv, title: "Live TV & Replays", desc: "Free live TV channels, host replays and curated entertainment library.", color: "from-emerald-500 to-teal-500" },
    { icon: Crown, title: "PK Battles", desc: "Host vs Host gift battles with server-authoritative scoring and bonus rewards.", color: "from-red-500 to-amber-500" },
    { icon: Shield, title: "Face Verified Safety", desc: "Mandatory face verification for hosts and AI-driven anti-fraud protection.", color: "from-teal-500 to-cyan-500" },
    { icon: MessageCircle, title: "Real-time Chat & DM", desc: "Lightning-fast messaging, voice notes, gift drops and host follow feed.", color: "from-blue-500 to-indigo-500" },
    { icon: Crown, title: "Noble Membership", desc: "Knight to King tiers — exclusive frames, entry effects and luxury perks.", color: "from-yellow-500 to-amber-600" },
    { icon: Coins, title: "Wallet & Recharge", desc: "Beans, diamonds and trader wallet. bKash, Nagad, JazzCash & global cards.", color: "from-green-500 to-emerald-600" },
    { icon: Languages, title: "Global & Local", desc: "Multi-language UI with strong Bangla, Hindi, English and Arabic coverage.", color: "from-cyan-500 to-blue-600" },
  ];

  const hostBenefits = [
    { icon: Coins, text: "Earn beans for every minute live, every call and every gift." },
    { icon: TrendingUp, text: "Transparent rate: 9,000 Beans = 1 USD. Withdraw from $10." },
    { icon: Award, text: "Weekly auto-payout every Monday — no manual approvals." },
    { icon: Star, text: "Host badge & priority discovery after face verification." },
    { icon: Zap, text: "PK battle bonus pools, event prizes and noble gift rewards." },
    { icon: Lock, text: "Blocked-user, anti-screenshot and report tools — safety first." },
  ];

  const agencyBenefits = [
    { icon: DollarSign, text: "3% to 20% tiered commission across 5 agency levels (A1 to A5)." },
    { icon: Award, text: "Automatic weekly payout every Monday — fully calculated server-side." },
    { icon: Globe, text: "Local payouts via bKash, Nagad, JazzCash, USDT and bank transfer." },
    { icon: Users, text: "Sub-agent recruitment, host onboarding and team performance tools." },
    { icon: Star, text: "Live agency ranking, leaderboard and performance dashboard." },
    { icon: Shield, text: "Dedicated payroll helper and priority support channel." },
  ];

  const journey = [
    { step: "01", title: "Download MeriLive", desc: "Get the app from Google Play or our direct APK." },
    { step: "02", title: "Create your account", desc: "Sign up with phone or Google in under 30 seconds." },
    { step: "03", title: "Explore & enjoy", desc: "Watch live, join party rooms, send gifts and make friends." },
    { step: "04", title: "Go live or earn", desc: "Become a verified host, or build an agency and earn weekly." },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: INK, color: CREAM, touchAction: 'pan-y pinch-zoom', overscrollBehaviorY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MobileApplication",
            "name": "MeriLive",
            "operatingSystem": "Android",
            "applicationCategory": "EntertainmentApplication",
            "description": "MeriLive is a premium live streaming, video calling and entertainment app. Watch HD live shows, join party rooms, send 3D gifts, earn as a host or build your own agency.",
            "url": "https://merilive.com/about",
            "downloadUrl": PLAY_STORE_URL,
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
            "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.7", "ratingCount": "12500" }
          })
        }}
      />

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        {/* Background banner */}
        <div className="absolute inset-0">
          <img
            src={heroBanner}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover opacity-60"
            width={1920}
            height={1088}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, rgba(10,14,31,0.55) 0%, rgba(10,14,31,0.85) 60%, ${INK} 100%)`
            }}
          />
        </div>

        <div className="relative z-10 px-4 pt-20 pb-24 md:pt-28 md:pb-32 max-w-6xl mx-auto">
          <div className="flex flex-col items-center text-center">
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
              style={{ borderColor: `${GOLD}55`, backgroundColor: '#0a0e1f80', color: GOLD_SOFT }}
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-semibold tracking-[0.2em] uppercase">Premium Live Entertainment</span>
            </motion.div>

            <motion.img
              src={mascotLogo}
              alt="MeriLive Logo"
              className="w-24 h-24 md:w-28 md:h-28 mb-6 drop-shadow-2xl rounded-2xl"
              initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 180 }}
            />

            <motion.h1
              className="text-5xl md:text-7xl font-extrabold tracking-tight mb-4"
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                backgroundImage: `linear-gradient(135deg, ${CREAM} 0%, ${GOLD_SOFT} 50%, ${GOLD} 100%)`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            >
              MeriLive
            </motion.h1>

            <motion.p
              className="text-base md:text-lg font-semibold tracking-[0.25em] uppercase mb-5"
              style={{ color: GOLD_SOFT }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            >
              Live Streaming · Video Call · Entertainment
            </motion.p>

            <motion.p
              className="text-base md:text-lg max-w-2xl mb-10 leading-relaxed"
              style={{ color: MUTED }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
            >
              A premium global live-streaming and video-call platform. Discover verified hosts, send dazzling
              3D gifts, throw party rooms, watch live TV, and turn your phone into a real income stream.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            >
              <Button
                size="lg"
                className="font-bold text-base px-8 py-6 rounded-2xl border-0"
                style={{
                  background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_SOFT} 100%)`,
                  color: INK,
                  boxShadow: `0 10px 40px -10px ${GOLD}80`,
                }}
                onClick={() => openInApp(PLAY_STORE_URL)}
              >
                <Play className="w-5 h-5 mr-2 fill-current" />
                Google Play Store
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="font-bold text-base px-8 py-6 rounded-2xl bg-transparent"
                style={{ borderColor: `${GOLD}66`, color: CREAM }}
                onClick={() => openInApp(APK_DOWNLOAD_URL)}
              >
                <Download className="w-5 h-5 mr-2" />
                Direct APK Download
              </Button>
            </motion.div>

            {/* Stat strip */}
            <motion.div
              className="grid grid-cols-3 gap-4 md:gap-10 mt-14 w-full max-w-2xl"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            >
              {[
                { v: "10M+", l: "Downloads" },
                { v: "150K+", l: "Verified Hosts" },
                { v: "4.7★", l: "User Rating" },
              ].map((s) => (
                <div key={s.l} className="text-center">
                  <div className="text-2xl md:text-4xl font-extrabold" style={{ color: GOLD_SOFT, fontFamily: 'Georgia, serif' }}>{s.v}</div>
                  <div className="text-xs md:text-sm uppercase tracking-widest mt-1" style={{ color: MUTED }}>{s.l}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* gold hairline */}
        <div className="relative h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      </section>

      {/* ===== ABOUT / WHO WE ARE ===== */}
      <section className="px-4 py-20 max-w-5xl mx-auto">
        <motion.div
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp} custom={0}
          className="text-center"
        >
          <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: GOLD }}>About MeriLive</p>
          <h2 className="text-3xl md:text-5xl font-bold mb-6" style={{ fontFamily: 'Georgia, serif', color: CREAM }}>
            One app. An entire entertainment universe.
          </h2>
          <p className="text-base md:text-lg max-w-3xl mx-auto leading-relaxed" style={{ color: MUTED }}>
            MeriLive brings together everything modern social entertainment should be — high-definition live streaming,
            secure 1-on-1 video calls, immersive party rooms, short videos, live TV, real-money earning for creators,
            and a full-stack agency program for managers. Built mobile-first, polished to a premium standard, and
            engineered for buttery performance even on mid-range Android devices.
          </p>
        </motion.div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="px-4 pb-20 max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-14"
          initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}
        >
          <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: GOLD }}>Everything you can do</p>
          <h2 className="text-3xl md:text-5xl font-bold" style={{ fontFamily: 'Georgia, serif', color: CREAM }}>
            App Features at a Glance
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              className="relative rounded-2xl p-6 overflow-hidden group"
              style={{
                backgroundColor: INK_3,
                border: `1px solid ${GOLD}1f`,
                boxShadow: '0 8px 30px -12px rgba(0,0,0,0.6)'
              }}
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
              whileHover={{ y: -4 }}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg`}>
                <f.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg mb-2" style={{ color: CREAM }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{f.desc}</p>
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}66, transparent)` }} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== HOST EARN BANNER ===== */}
      <section className="px-4 py-20" style={{ backgroundColor: INK_2 }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <motion.div
              className="relative rounded-3xl overflow-hidden"
              style={{ border: `1px solid ${GOLD}33`, boxShadow: `0 20px 60px -20px ${GOLD}33` }}
              initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            >
              <img src={earningsBanner} alt="Earn as a MeriLive host" loading="lazy" className="w-full h-auto block" width={1920} height={1088} />
              <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(135deg, transparent 50%, ${INK_2}cc 100%)` }} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            >
              <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: GOLD }}>Earn as a Host</p>
              <h2 className="text-3xl md:text-5xl font-bold mb-5" style={{ fontFamily: 'Georgia, serif', color: CREAM }}>
                Turn your charisma into income.
              </h2>
              <p className="text-base mb-8 leading-relaxed" style={{ color: MUTED }}>
                Every minute live, every private call and every gift earns you beans. Withdraw weekly to bKash, Nagad,
                JazzCash, USDT or your bank — fully automated and transparent.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {hostBenefits.map((b, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl p-4"
                    style={{ backgroundColor: INK_3, border: `1px solid ${GOLD}1a` }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_SOFT})` }}>
                      <b.icon className="w-4 h-4" style={{ color: INK }} />
                    </div>
                    <span className="text-sm leading-snug" style={{ color: CREAM }}>{b.text}</span>
                  </div>
                ))}
              </div>

              <Button
                size="lg"
                className="font-bold rounded-2xl px-7 py-6 border-0"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_SOFT})`, color: INK, boxShadow: `0 10px 30px -10px ${GOLD}80` }}
                onClick={() => openInApp(PLAY_STORE_URL)}
              >
                <Smartphone className="w-5 h-5 mr-2" />
                Become a Host
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== AGENCY BANNER ===== */}
      <section className="px-4 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <motion.div
              className="order-2 lg:order-1"
              initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            >
              <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: GOLD }}>Agency System</p>
              <h2 className="text-3xl md:text-5xl font-bold mb-5" style={{ fontFamily: 'Georgia, serif', color: CREAM }}>
                Build an agency. Lead a network.
              </h2>
              <p className="text-base mb-8 leading-relaxed" style={{ color: MUTED }}>
                Recruit hosts, manage teams, and earn 3% to 12% commission across five performance tiers —
                with weekly automated payouts and a real-time agency dashboard.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {agencyBenefits.map((b, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl p-4"
                    style={{ backgroundColor: INK_3, border: `1px solid ${GOLD}1a` }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_SOFT})` }}>
                      <b.icon className="w-4 h-4" style={{ color: INK }} />
                    </div>
                    <span className="text-sm leading-snug" style={{ color: CREAM }}>{b.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              className="order-1 lg:order-2 relative rounded-3xl overflow-hidden"
              style={{ border: `1px solid ${GOLD}33`, boxShadow: `0 20px 60px -20px ${GOLD}33` }}
              initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            >
              <img src={agencyBanner} alt="MeriLive Agency Network" loading="lazy" className="w-full h-auto block" width={1920} height={1088} />
              <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(225deg, transparent 50%, ${INK}cc 100%)` }} />
            </motion.div>
          </div>

          {/* Commission table */}
          <motion.div
            className="mt-12 rounded-2xl p-6 md:p-8"
            style={{ backgroundColor: INK_3, border: `1px solid ${GOLD}33` }}
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}
          >
            <h3 className="text-xl md:text-2xl font-bold mb-6 text-center" style={{ fontFamily: 'Georgia, serif', color: GOLD_SOFT }}>
              Agency Levels & Commission
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${GOLD}33` }}>
                    <th className="text-left py-3 px-4 uppercase tracking-wider text-xs" style={{ color: GOLD }}>Level</th>
                    <th className="text-left py-3 px-4 uppercase tracking-wider text-xs" style={{ color: GOLD }}>Weekly Income</th>
                    <th className="text-left py-3 px-4 uppercase tracking-wider text-xs" style={{ color: GOLD }}>Commission</th>
                  </tr>
                </thead>
                <tbody style={{ color: CREAM }}>
                  {[
                    { l: "A1", w: "$0 – $99", c: "3%" },
                    { l: "A2", w: "$100 – $499", c: "5%" },
                    { l: "A3", w: "$500 – $1,999", c: "8%" },
                    { l: "A4", w: "$2,000 – $4,999", c: "10%" },
                    { l: "A5 ⭐", w: "$5,000+", c: "12%", gold: true },
                  ].map((r) => (
                    <tr key={r.l} style={{ borderBottom: `1px solid ${GOLD}1a` }}>
                      <td className="py-3 px-4 font-semibold" style={{ color: r.gold ? GOLD : CREAM }}>{r.l}</td>
                      <td className="py-3 px-4" style={{ color: MUTED }}>{r.w}</td>
                      <td className="py-3 px-4 font-bold" style={{ color: r.gold ? GOLD_SOFT : '#7ee29a' }}>{r.c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div
            className="mt-8 flex flex-col sm:flex-row gap-4 justify-center"
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}
          >
            <Button
              size="lg"
              className="font-bold rounded-2xl px-8 py-6 border-0"
              style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_SOFT})`, color: INK }}
              onClick={() => openInApp('/policies')}
            >
              <Building2 className="w-5 h-5 mr-2" />
              View Agency Policy
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-bold rounded-2xl px-8 py-6 bg-transparent"
              style={{ borderColor: `${GOLD}66`, color: CREAM }}
              onClick={() => openInApp(PLAY_STORE_URL)}
            >
              <ExternalLink className="w-5 h-5 mr-2" />
              Create Agency in App
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="px-4 py-20" style={{ backgroundColor: INK_2 }}>
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-14" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
            <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: GOLD }}>Getting Started</p>
            <h2 className="text-3xl md:text-5xl font-bold" style={{ fontFamily: 'Georgia, serif', color: CREAM }}>
              From download to your first live in 4 steps
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {journey.map((s, i) => (
              <motion.div
                key={s.step}
                className="relative rounded-2xl p-6"
                style={{ backgroundColor: INK_3, border: `1px solid ${GOLD}26` }}
                initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
              >
                <div className="text-4xl font-extrabold mb-3" style={{ fontFamily: 'Georgia, serif', color: GOLD }}>{s.step}</div>
                <h3 className="font-bold text-lg mb-2" style={{ color: CREAM }}>{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SAFETY ===== */}
      <section className="px-4 py-20 max-w-5xl mx-auto">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="text-center mb-12">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: GOLD }}>Trust & Safety</p>
          <h2 className="text-3xl md:text-5xl font-bold" style={{ fontFamily: 'Georgia, serif', color: CREAM }}>Engineered to keep the community safe</h2>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { icon: Shield, title: "Face Verified Hosts", desc: "Every host completes liveness face verification before going live." },
            { icon: Lock, title: "Anti-Fraud System", desc: "Automated detection for fake recharges, gift abuse and account sharing." },
            { icon: Heart, title: "24/7 Moderation", desc: "Dedicated moderation hub, instant report tools and emergency response." },
          ].map((b, i) => (
            <motion.div
              key={b.title}
              className="rounded-2xl p-6 text-center"
              style={{ backgroundColor: INK_3, border: `1px solid ${GOLD}26` }}
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
            >
              <div className="w-14 h-14 mx-auto rounded-2xl mb-4 flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_SOFT})` }}>
                <b.icon className="w-6 h-6" style={{ color: INK }} />
              </div>
              <h3 className="font-bold text-lg mb-2" style={{ color: CREAM }}>{b.title}</h3>
              <p className="text-sm" style={{ color: MUTED }}>{b.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="relative rounded-3xl p-8 md:p-14 text-center overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${INK_2} 0%, ${INK_3} 100%)`,
              border: `1px solid ${GOLD}55`,
              boxShadow: `0 30px 80px -30px ${GOLD}40`,
            }}
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}
          >
            {/* gold corners */}
            <div className="absolute top-0 left-0 w-32 h-32 rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{ background: `radial-gradient(circle, ${GOLD}33, transparent 70%)` }} />
            <div className="absolute bottom-0 right-0 w-40 h-40 rounded-full translate-x-1/2 translate-y-1/2"
              style={{ background: `radial-gradient(circle, ${GOLD}33, transparent 70%)` }} />

            <Crown className="w-12 h-12 mx-auto mb-5" style={{ color: GOLD }} />
            <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'Georgia, serif', color: CREAM }}>
              Your stage. Your audience. Your earnings.
            </h2>
            <p className="text-base md:text-lg mb-10 max-w-xl mx-auto" style={{ color: MUTED }}>
              Download MeriLive today and step into the premium live-streaming experience millions already love.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="font-bold text-base px-8 py-6 rounded-2xl border-0"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_SOFT})`, color: INK, boxShadow: `0 12px 40px -12px ${GOLD}99` }}
                onClick={() => openInApp(PLAY_STORE_URL)}
              >
                <Play className="w-5 h-5 mr-2 fill-current" />
                Google Play Store
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="font-bold text-base px-8 py-6 rounded-2xl bg-transparent"
                style={{ borderColor: `${GOLD}66`, color: CREAM }}
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
      <footer className="px-4 py-12" style={{ borderTop: `1px solid ${GOLD}22`, backgroundColor: INK_2 }}>
        <div className="max-w-4xl mx-auto text-center">
          <img loading="lazy" decoding="async" src={mascotLogo} alt="MeriLive" className="w-12 h-12 mx-auto mb-4 rounded-xl" />
          <p className="text-sm mb-3 font-semibold" style={{ color: CREAM }}>MeriLive — Live Streaming, Video Call & Entertainment</p>
          
          <nav className="flex flex-wrap gap-x-6 gap-y-3 justify-center text-xs mb-6" style={{ color: MUTED }} aria-label="Footer">
            <Link to="/policies" className="hover:opacity-80 transition" style={{ color: GOLD_SOFT }}>Policies</Link>
            <Link to="/privacy-policy" className="hover:opacity-80 transition" style={{ color: GOLD_SOFT }}>Privacy</Link>
            <Link to="/terms" className="hover:opacity-80 transition" style={{ color: GOLD_SOFT }}>Terms</Link>
            <Link to="/about" className="hover:opacity-80 transition" style={{ color: GOLD_SOFT }}>About</Link>
            <Link to="/contact" className="hover:opacity-80 transition" style={{ color: GOLD_SOFT }}>Contact</Link>
            <Link to="/account-deletion" className="hover:opacity-80 transition" style={{ color: GOLD_SOFT }}>Account Deletion</Link>
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition" style={{ color: GOLD_SOFT }}>Play Store</a>
          </nav>
          <p className="text-xs" style={{ color: `${MUTED}99` }}>© {new Date().getFullYear()} MeriLive. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default About;
