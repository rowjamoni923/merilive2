import { useEffect, useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Download, Star, Users, Video, Gift, Phone, Music, Shield, ChevronDown, Play, Sparkles, Globe, Wallet, Zap, ArrowRight, Heart, Clock, Trophy, MessageCircle, X, Building2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAY_STORE_URL, APK_DOWNLOAD_URL } from "@/utils/shareLinks";
import { supabase } from "@/integrations/supabase/client";
import meriliveLogo from "@/assets/merilive-logo.png";
import googlePlayBadge from "@/assets/google-play-badge.png";
import heroBg from "@/assets/landing-bg-hero.jpg";
import HostProgramCard from "@/components/landing/HostProgramCard";
import AgencyCard from "@/components/landing/AgencyCard";

interface AgencyListItem {
  id: string;
  name: string;
  agency_code: string;
  logo_url: string | null;
  total_hosts: number | null;
  country_flag: string | null;
}

const iconMap: Record<string, any> = {
  Video, Phone, Gift, Music, Users, Shield, Wallet, Zap, Star, Heart, Clock, Trophy, MessageCircle, Globe, Download, Sparkles
};

interface LandingSection {
  id: string;
  section_type: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  link_label: string | null;
  badge_text: string | null;
  icon_name: string | null;
  gradient_colors: string;
  display_order: number;
}

const LandingPage = () => {
  const [features, setFeatures] = useState<LandingSection[]>([]);
  const [events, setEvents] = useState<LandingSection[]>([]);
  const [announcements, setAnnouncements] = useState<LandingSection[]>([]);
  const [landingSettings, setLandingSettings] = useState<Record<string, string>>({});
  const [showAgencyList, setShowAgencyList] = useState(false);
  const [agencies, setAgencies] = useState<AgencyListItem[]>([]);
  const [loadingAgencies, setLoadingAgencies] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const { scrollYProgress } = useScroll();
  const headerOpacity = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  const openAgencyList = async () => {
    setShowAgencyList(true);
    if (agencies.length > 0) return;
    setLoadingAgencies(true);
    try {
      // Detect visitor country via free IP API
      let visitorCountryCode = '';
      try {
        const ipRes = await fetch('https://ipapi.co/json/');
        const ipData = await ipRes.json();
        visitorCountryCode = (ipData.country_code || '').toUpperCase();
      } catch { /* fallback: show all */ }

      // Fetch agencies with owner's country_code
      const { data } = await supabase
        .from("agencies")
        .select("id, name, agency_code, logo_url, total_hosts, owner_id")
        .eq("is_active", true)
        .eq("is_blocked", false)
        .order("total_hosts", { ascending: false });

      if (!data || data.length === 0) {
        setAgencies([]);
        setLoadingAgencies(false);
        return;
      }

      // Get owner profiles for country info
      const ownerIds = data.map(a => a.owner_id).filter(Boolean);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, country_code, country_flag")
        .in("id", ownerIds);

      const profileMap: Record<string, { country_code: string | null; country_flag: string | null }> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

      // Build a map: agency_id -> owner country_code
      const agencyCountryMap: Record<string, string> = {};
      data.forEach(a => {
        if (a.owner_id && profileMap[a.owner_id]?.country_code) {
          agencyCountryMap[a.id] = (profileMap[a.owner_id].country_code || '').toUpperCase();
        }
      });

      const allAgencies: AgencyListItem[] = data.map(a => ({
        id: a.id,
        name: a.name,
        agency_code: a.agency_code,
        logo_url: a.logo_url,
        total_hosts: a.total_hosts,
        country_flag: a.owner_id ? profileMap[a.owner_id]?.country_flag || null : null,
      }));

      // Filter by visitor country if detected
      if (visitorCountryCode) {
        const countryAgencies = allAgencies.filter(a => agencyCountryMap[a.id] === visitorCountryCode);
        setAgencies(countryAgencies.length > 0 ? countryAgencies : allAgencies);
      } else {
        setAgencies(allAgencies);
      }
    } catch {
      setAgencies([]);
    }
    setLoadingAgencies(false);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  useEffect(() => {
    const fetchData = async () => {
      const [settingsRes, sectionsRes] = await Promise.all([
        supabase.from("app_settings").select("setting_key, setting_value").eq("category", "landing"),
        supabase.from("landing_page_sections").select("*").eq("is_active", true).order("display_order")
      ]);

      if (settingsRes.data) {
        const map: Record<string, string> = {};
        settingsRes.data.forEach((s: any) => {
          map[s.setting_key] = typeof s.setting_value === 'string' ? s.setting_value : JSON.stringify(s.setting_value);
        });
        setLandingSettings(map);
      }

      if (sectionsRes.data) {
        const now = new Date().toISOString();
        const active = sectionsRes.data.filter((s: any) => {
          if (s.start_date && s.start_date > now) return false;
          if (s.end_date && s.end_date < now) return false;
          return true;
        });
        setFeatures(active.filter((s: any) => s.section_type === 'feature'));
        setEvents(active.filter((s: any) => s.section_type === 'event'));
        setAnnouncements(active.filter((s: any) => s.section_type === 'announcement'));
      }
    };
    fetchData();
  }, []);

  const getSetting = (key: string, fallback: string) => {
    const val = landingSettings[key];
    if (!val) return fallback;
    // Remove surrounding quotes if JSON string
    return val.replace(/^"|"$/g, '');
  };

  const handlePlayStore = async () => { const { openInApp } = await import("@/utils/inAppNavigation"); openInApp(PLAY_STORE_URL); };
  const handleAPKDownload = async () => { const { openInApp } = await import("@/utils/inAppNavigation"); openInApp(APK_DOWNLOAD_URL); };

  const stats = [
    { value: getSetting('landing_stat_downloads', '50,000+'), label: "Downloads", icon: Download, gradient: "from-pink-500 to-rose-500" },
    { value: getSetting('landing_stat_rating', '4.5★'), label: "Rating", icon: Star, gradient: "from-amber-500 to-yellow-500" },
    { value: getSetting('landing_stat_hosts', '1000+'), label: "Live Hosts", icon: Users, gradient: "from-purple-500 to-indigo-500" },
    { value: getSetting('landing_stat_support', '24/7'), label: "Support", icon: Heart, gradient: "from-emerald-500 to-green-500" },
  ];

  return (
 <div className="min-h-screen bg-[#030308] text-slate-900 overflow-x-hidden selection:bg-pink-500/30">
      {/* Floating Header */}
      <motion.header
        style={{ opacity: headerOpacity }}
 className="fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl bg-[#030308]/80 border-b border-slate-200/[0.04]"
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={meriliveLogo} alt="MeriLive" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-lg bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">MeriLive</span>
          </div>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
            <img src={googlePlayBadge} alt="Get it on Google Play" className="h-10 hover:scale-105 transition-transform" />
          </a>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-20 pb-16">
        {/* Full Background Image */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#030308]/30 via-[#030308]/60 to-[#030308]" />
          {/* Extra ambient orbs */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-radial from-pink-500/10 via-purple-500/5 to-transparent rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-1/4 left-0 w-[500px] h-[500px] bg-blue-600/8 rounded-full blur-[180px]" />
          <div className="absolute top-1/3 right-0 w-[400px] h-[400px] bg-amber-500/6 rounded-full blur-[150px]" />
          {/* Floating particles effect */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.008)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.008)_1px,transparent_1px)] bg-[size:80px_80px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative z-10 text-center max-w-4xl mx-auto"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-pink-500/15 to-purple-500/15 border border-pink-500/25 mb-8 backdrop-blur-xl shadow-[0_0_30px_rgba(236,72,153,0.15)]"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gradient-to-r from-pink-500 to-rose-400" />
            </span>
            <span className="text-sm font-semibold bg-gradient-to-r from-pink-300 to-purple-300 bg-clip-text text-transparent">
              #1 Live Streaming Platform
            </span>
          </motion.div>

          {/* Logo */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 150, damping: 15, delay: 0.3 }}
            className="relative mx-auto mb-8 w-32 h-32"
          >
            <div className="absolute inset-[-12px] bg-gradient-to-br from-pink-500 via-purple-500 to-amber-500 rounded-[2rem] blur-2xl opacity-50 animate-pulse" />
            <div className="absolute inset-[-4px] bg-gradient-to-br from-pink-500/30 via-purple-500/30 to-amber-500/30 rounded-[1.8rem] animate-spin-slow" style={{ animationDuration: '8s' }} />
            <img src={meriliveLogo} alt="MeriLive" className="relative w-32 h-32 rounded-3xl shadow-2xl ring-2 ring-white/20" />
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-6xl md:text-8xl font-black mb-4 tracking-tight"
          >
            <span className="bg-gradient-to-b from-white via-white/95 to-white/40 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">
              Meri
            </span>
            <span className="bg-gradient-to-r from-pink-400 via-rose-400 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(236,72,153,0.3)]">
              Live
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
 className="text-lg md:text-xl text-slate-700/45 mb-3 font-light tracking-wide"
          >
            Live Streaming · Video Call · Party Room · Virtual Gifts
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
 className="text-sm text-slate-700/25 mb-12 max-w-md mx-auto"
          >
            Stream live, connect with friends, earn money as a host, and experience the future of social entertainment
          </motion.p>

          {/* CTA - Play Store Badge + Become Host */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-5 justify-center items-center mb-6"
          >
            <Button
              onClick={openAgencyList}
              size="lg"
 className="h-16 px-12 bg-gradient-to-r from-amber-500 via-orange-500 to-pink-600 hover:from-amber-600 hover:via-orange-600 hover:to-pink-700 text-slate-900 font-extrabold rounded-2xl shadow-[0_8px_40px_rgba(245,158,11,0.35)] hover:shadow-[0_12px_50px_rgba(245,158,11,0.5)] transition-all duration-300 text-lg group"
            >
              <Users className="w-6 h-6 mr-2.5 group-hover:scale-110 transition-transform" />
              Become a Host
              <ArrowRight className="w-5 h-5 ml-2.5 group-hover:translate-x-1.5 transition-transform" />
            </Button>
            
            {/* Google Play Store Badge */}
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 <div className="relative bg-slate-100/40 backdrop-blur-xl border border-slate-200/10 rounded-2xl p-3 hover:border-slate-200/20 transition-all duration-300 hover:scale-105 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                <img src={googlePlayBadge} alt="Get it on Google Play" className="h-12 md:h-14" />
              </div>
            </a>
          </motion.div>

          {/* Secondary APK Download */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mb-16"
          >
            <button
              onClick={handleAPKDownload}
 className="text-xs text-slate-700/25 hover:text-slate-700/50 transition-colors underline underline-offset-4 decoration-white/10 hover:decoration-white/30"
            >
              Or download APK directly
            </button>
          </motion.div>

          {/* Stats - Ultra Premium */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto"
          >
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 + i * 0.1 }}
 className="relative text-center group p-5 rounded-2xl bg-white/[0.03] border border-slate-200/[0.06] backdrop-blur-xl hover:bg-white/[0.06] hover:border-slate-200/[0.12] transition-all duration-500 overflow-hidden"
              >
                {/* Glow effect */}
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-[0.08] transition-opacity duration-500 rounded-2xl`} />
                <div className={`w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-300`}>
 <stat.icon className="w-5 h-5 text-slate-900" />
                </div>
                <div className="text-2xl font-black bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent relative z-10">{stat.value}</div>
 <div className="text-[10px] text-slate-700/30 uppercase tracking-[0.2em] font-bold mt-1 relative z-10">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
        >
 <ChevronDown className="w-5 h-5 text-slate-700/15" />
        </motion.div>
      </section>

      {/* Events Section - Ultra Premium */}
      {events.length > 0 && (
        <section className="py-20 px-4 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/[0.03] to-transparent pointer-events-none" />
          <div className="max-w-5xl mx-auto space-y-6 relative z-10">
            {events.map((event, i) => {
              const IconComp = iconMap[event.icon_name || 'Sparkles'] || Sparkles;
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 30, scale: 0.97 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12, type: "spring", damping: 20 }}
                  className="group relative"
                >
                  {/* Animated outer glow border */}
                  <div className={`absolute -inset-[1px] bg-gradient-to-r ${event.gradient_colors} rounded-[1.25rem] opacity-60 group-hover:opacity-100 transition-opacity duration-500 blur-[1px]`} />
                  <div className={`absolute -inset-[2px] bg-gradient-to-r ${event.gradient_colors} rounded-[1.3rem] opacity-20 group-hover:opacity-40 transition-opacity duration-500 blur-lg`} />
                  
                  <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${event.gradient_colors}`}>
                    {/* Inner glass overlay */}
 <div className="absolute inset-0 bg-slate-100/15 backdrop-blur-[2px]" />
                    
                    {/* Ambient orbs */}
                    <div className="absolute -right-16 -top-16 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
                    <div className="absolute -left-8 -bottom-12 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
                    
                    {/* Shine sweep animation */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12 pointer-events-none"
                      initial={{ x: '-150%' }}
                      whileInView={{ x: '250%' }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.2, delay: 0.3 + i * 0.15, ease: "easeInOut" }}
                    />
                    
                    {/* Content */}
                    <div className="relative z-10 p-7 md:p-9 flex items-start gap-5">
                      {/* Event Icon */}
 <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-xl border border-slate-200/25 flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.2)] group-hover:scale-110 transition-transform duration-300">
 <IconComp className="w-7 h-7 text-slate-900 drop-shadow-lg" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {event.badge_text && (
                          <motion.span
                            initial={{ opacity: 0, x: -10 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
 className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-xl border border-slate-200/30 text-[11px] font-bold uppercase tracking-wider mb-3 shadow-lg"
                          >
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                            </span>
                            {event.badge_text}
                          </motion.span>
                        )}
 <h3 className="text-2xl md:text-3xl font-black mb-2 text-slate-900 drop-shadow-[0_2px_10px_rgba(0,0,0,0.3)] tracking-tight">{event.title}</h3>
 {event.subtitle && <p className="text-slate-700/85 text-sm font-medium mb-1.5">{event.subtitle}</p>}
 {event.description && <p className="text-slate-700/60 text-sm max-w-xl leading-relaxed">{event.description}</p>}
                        {event.link_url && (
 <a href={event.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-white/15 backdrop-blur-xl border border-slate-200/25 text-sm font-bold text-white hover:bg-white/25 transition-all duration-300 shadow-lg group/link">
                            {event.link_label || "Learn More"} <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
                          </a>
                        )}
                      </div>
                    </div>
                    
                    {/* Bottom shimmer line */}
                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Announcements - Ultra Premium */}
      {announcements.length > 0 && (
        <section className="px-4 pb-12">
          <div className="max-w-5xl mx-auto space-y-4">
            {announcements.map((item, i) => {
              const IconComp = iconMap[item.icon_name || 'Zap'] || Zap;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="group relative"
                >
                  {/* Subtle border glow */}
                  <div className="absolute -inset-[0.5px] bg-gradient-to-r from-blue-500/30 via-indigo-500/20 to-purple-500/30 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
 <div className="relative flex items-center gap-5 p-5 md:p-6 rounded-2xl bg-white/[0.03] border border-slate-200/[0.07] backdrop-blur-xl hover:bg-white/[0.06] hover:border-slate-200/[0.15] transition-all duration-500 overflow-hidden">
                    {/* Ambient glow on hover */}
                    <div className="absolute -right-20 -top-20 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    {/* Shine sweep */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent -skew-x-12 pointer-events-none"
                      initial={{ x: '-100%' }}
                      whileInView={{ x: '200%' }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, delay: 0.5 + i * 0.1 }}
                    />
                    
                    {/* Icon */}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-400/20 flex items-center justify-center flex-shrink-0 shadow-[0_4px_20px_rgba(59,130,246,0.15)] group-hover:scale-110 group-hover:shadow-[0_4px_30px_rgba(59,130,246,0.25)] transition-all duration-300">
                      <IconComp className="w-5 h-5 text-blue-600" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
 <h4 className="text-sm font-bold text-slate-700/90 truncate">{item.title}</h4>
 {item.description && <p className="text-xs text-slate-700/40 truncate mt-0.5 leading-relaxed">{item.description}</p>}
                    </div>
                    
                    {/* Badge */}
                    {item.badge_text && (
                      <span className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500/15 to-indigo-500/15 border border-blue-400/20 text-blue-700 text-xs font-bold flex-shrink-0 shadow-[0_2px_12px_rgba(59,130,246,0.1)]">
                        {item.badge_text}
                      </span>
                    )}
                    
                    {/* Arrow indicator */}
 <ArrowRight className="w-4 h-4 text-slate-700/15 group-hover:text-slate-700/40 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="py-24 px-4 relative">
        {/* Section ambient */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-pink-500/[0.04] rounded-full blur-[200px]" />
        </div>
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-pink-600/50 mb-4 block">Features</span>
            <h2 className="text-4xl md:text-6xl font-black mb-5 tracking-tight">
              Everything in{" "}
              <span className="bg-gradient-to-r from-pink-400 via-rose-400 to-purple-400 bg-clip-text text-transparent">One App</span>
            </h2>
 <p className="text-slate-700/30 max-w-lg mx-auto text-sm leading-relaxed">
              From live streaming to video calls, party rooms to virtual gifts — the complete entertainment platform
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => {
              const IconComp = iconMap[feature.icon_name || 'Star'] || Star;
              return (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
 className="group relative p-7 rounded-3xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-slate-200/[0.06] hover:border-slate-200/[0.15] transition-all duration-500 hover:bg-white/[0.06] backdrop-blur-xl overflow-hidden"
                >
                  {/* Background glow */}
                  <div className={`absolute -right-10 -top-10 w-32 h-32 bg-gradient-to-br ${feature.gradient_colors} rounded-full blur-[60px] opacity-10 group-hover:opacity-25 transition-opacity duration-500`} />
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient_colors} flex items-center justify-center mb-5 shadow-xl shadow-black/20 group-hover:scale-110 group-hover:shadow-2xl transition-all duration-300 ring-1 ring-white/10`}>
 <IconComp className="w-7 h-7 text-slate-900" />
                  </div>
 <h3 className="text-lg font-bold mb-1.5 text-slate-700/90 relative z-10">{feature.title}</h3>
                  {feature.subtitle && <p className="text-xs text-pink-600/60 mb-2 relative z-10">{feature.subtitle}</p>}
 <p className="text-sm text-slate-700/35 leading-relaxed relative z-10">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Host Program Card */}
      <HostProgramCard />

      {/* Agency Card */}
      <AgencyCard />

      {/* Final CTA */}
      <section className="py-28 px-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 rotate-180" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#030308] via-[#030308]/80 to-[#030308]" />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto text-center relative z-10"
        >
          <div className="relative mx-auto mb-8 w-24 h-24">
            <div className="absolute inset-[-8px] bg-gradient-to-br from-pink-500 via-purple-500 to-amber-500 rounded-3xl blur-2xl opacity-40 animate-pulse" />
            <img src={meriliveLogo} alt="MeriLive" className="relative w-24 h-24 rounded-3xl ring-2 ring-white/20 shadow-2xl" />
          </div>

          <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">
            Start Your <span className="bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">Journey</span>
          </h2>
 <p className="text-slate-700/30 mb-12 text-sm max-w-md mx-auto leading-relaxed">
            Download MeriLive and join a community of millions. Your audience is waiting.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group"
            >
 <div className="bg-slate-100/40 backdrop-blur-xl border border-slate-200/10 rounded-2xl p-3 hover:border-slate-200/20 transition-all duration-300 hover:scale-105 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                <img src={googlePlayBadge} alt="Get it on Google Play" className="h-14 md:h-16" />
              </div>
            </a>

            {/* Google Play Store Badge */}
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group"
            >
 <div className="bg-slate-100/40 backdrop-blur-xl border border-slate-200/10 rounded-2xl p-3 hover:border-slate-200/20 transition-all duration-300 hover:scale-105 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                <img src={googlePlayBadge} alt="Get it on Google Play" className="h-12 md:h-14" />
              </div>
            </a>
          </div>
        </motion.div>
      </section>

      {/* SEO Content Section - visible to crawlers, subtle for users */}
 <section className="py-16 px-4 border-t border-slate-200/[0.03]">
        <div className="max-w-5xl mx-auto">
 <h2 className="text-2xl font-bold text-slate-700/60 mb-6">Best Live Streaming App - MeriLive</h2>
 <div className="grid md:grid-cols-2 gap-8 text-sm text-slate-700/20 leading-relaxed">
            <article>
 <h3 className="text-slate-700/40 font-semibold mb-2">🎬 Live Streaming & Video Call Platform</h3>
              <p>MeriLive is the best free live streaming app for Android. Go live, start live video streaming, join live video chat rooms, and connect with millions worldwide. Our live broadcast platform supports HD live streaming, multi-guest live rooms, PK battles, and real-time live interaction. Whether you want to watch live streams, become a live streamer, or earn money from live streaming - MeriLive is the #1 choice.</p>
            </article>
            <article>
 <h3 className="text-slate-700/40 font-semibold mb-2">💰 Earn Money as a Live Streaming Host</h3>
              <p>Become a host on MeriLive and earn $10-$100+ per day through virtual gifts, video calls, and daily task rewards. Join a live streaming agency, complete host verification, and start your live streaming career. Our agency system connects you with top agencies offering training, support, and higher earnings. The best platform for content creators and live streamers to monetize their talent.</p>
            </article>
            <article>
 <h3 className="text-slate-700/40 font-semibold mb-2">🎉 Party Rooms & Social Entertainment</h3>
              <p>Join live party rooms, sing karaoke, play interactive games, and socialize with friends. MeriLive offers the best social live streaming experience with virtual gifts, animated effects, beauty filters, and AR face filters. Send luxury gifts, climb the leaderboard, and become a VIP. The ultimate live entertainment app for social interaction and fun.</p>
            </article>
            <article>
 <h3 className="text-slate-700/40 font-semibold mb-2">📱 Download MeriLive - Free Live Streaming App</h3>
              <p>Download MeriLive free from Google Play Store. Available worldwide with support for English, Bengali, Hindi, and Arabic. Features include live streaming, video calls, party rooms, virtual gifts, games, PK competitions, host earnings, agency system, daily rewards, and 24/7 customer support. The most popular live streaming app in Bangladesh, India, and South Asia. Start streaming live today!</p>
            </article>
          </div>
        </div>
      </section>

      {/* Footer */}
 <footer className="py-16 px-4 border-t border-slate-200/[0.06] bg-gradient-to-t from-black/60 to-transparent">
        <div className="max-w-5xl mx-auto space-y-10">
          {/* Top: Brand + Links */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            {/* Brand */}
            <div className="flex items-center gap-3.5">
              <img src={meriliveLogo} alt="MeriLive - Best Live Streaming App" className="w-12 h-12 rounded-2xl shadow-lg ring-1 ring-white/10" />
              <div>
                <span className="font-bold text-xl bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">MeriLive</span>
 <p className="text-xs text-slate-700/30 mt-0.5">Best Live Streaming & Video Call Platform</p>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Footer navigation">
 <a href="/privacy-policy" className="text-slate-700/40 hover:text-slate-700/70 transition-colors duration-200">
                Privacy
              </a>
 <a href="/terms" className="text-slate-700/40 hover:text-slate-700/70 transition-colors duration-200">
                Terms
              </a>
 <a href="/contact" className="text-slate-700/40 hover:text-slate-700/70 transition-colors duration-200">
                Contact
              </a>
            </nav>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

          {/* Bottom: Download + Copyright */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
 <p className="text-xs text-slate-700/20 order-2 sm:order-1">© 2026 MeriLive. All rights reserved.</p>
            <div className="flex items-center gap-4 order-1 sm:order-2">
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Download MeriLive on Google Play Store">
                <img src={googlePlayBadge} alt="Download MeriLive on Google Play" className="h-10 hover:scale-105 transition-transform duration-200" />
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Agency List Modal */}
      <AnimatePresence>
        {showAgencyList && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
 className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-100/70 backdrop-blur-sm"
            onClick={() => setShowAgencyList(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: "spring", damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg max-h-[80vh] rounded-3xl overflow-hidden border border-amber-500/20 shadow-[0_0_60px_rgba(245,158,11,0.15)]"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-pink-600 p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
 <Building2 className="w-6 h-6 text-slate-900" />
                  <div>
 <h3 className="text-slate-900 font-bold text-lg">Our Agencies</h3>
 <p className="text-slate-700/70 text-xs">Join any agency to become a host</p>
                  </div>
                </div>
 <button onClick={() => setShowAgencyList(false)} className="text-slate-700/70 hover:text-slate-900 p-1.5 rounded-full hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Agency List */}
              <div className="bg-gradient-to-b from-[#1a1000] to-[#0d0800] overflow-y-auto max-h-[60vh] p-4 space-y-3">
                {loadingAgencies ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : agencies.length === 0 ? (
 <p className="text-center text-slate-700/40 py-16">No agencies available</p>
                ) : (
                  agencies.map((agency, i) => (
                    <motion.div
                      key={agency.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="group relative rounded-2xl border border-amber-500/10 hover:border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-transparent p-4 flex items-center gap-4 transition-all duration-300 hover:bg-amber-500/10"
                    >
                      {/* Agency Avatar */}
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-600/30 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                        {agency.logo_url ? (
                          <img src={agency.logo_url} alt={agency.name} className="w-full h-full rounded-xl object-cover" />
                        ) : (
                          <Building2 className="w-6 h-6 text-amber-600" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
 <h4 className="text-slate-900 font-semibold text-sm truncate">{agency.country_flag && <span className="mr-1">{agency.country_flag}</span>}{agency.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-mono font-bold border border-amber-500/20">
                            {agency.agency_code}
                          </span>
 <span className="text-[11px] text-slate-700/30">
                            {agency.total_hosts || 0} hosts
                          </span>
                        </div>
                      </div>

                      {/* Copy Button */}
                      <button
                        onClick={() => copyCode(agency.agency_code)}
                        className="flex-shrink-0 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-600 text-xs font-semibold transition-all duration-200 flex items-center gap-1.5"
                      >
                        {copiedCode === agency.agency_code ? (
                          <><Check className="w-3.5 h-3.5" /> Copied</>
                        ) : (
                          <><Copy className="w-3.5 h-3.5" /> Code</>
                        )}
                      </button>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="bg-[#0d0800] border-t border-amber-500/10 p-4 text-center">
 <p className="text-slate-700/30 text-xs">
                  Download the app → Apply as Host → Enter the agency code
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LandingPage;
