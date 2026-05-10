import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, CalendarIcon, Palette, Clock, Sparkles, Loader2, Eye, Home, Users, Play, User, MessageCircle, Heart, Star, Gift, Bell, Upload, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface EventTheme {
  id: string;
  theme_key: string;
  theme_name: string;
  theme_icon: string;
  description: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  nav_bg_color: string;
  nav_active_color: string;
  tab_active_color: string;
  card_border_color: string;
  header_gradient_from: string;
  header_gradient_to: string;
  floating_particles: string[];
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  auto_schedule: boolean;
  display_order: number;
  country_code: string;
  // Admin-uploaded nav icon URLs
  nav_home_icon_url: string | null;
  nav_party_icon_url: string | null;
  nav_reels_icon_url: string | null;
  nav_profile_icon_url: string | null;
}

// ============== REAL LIVE STREAMING APP PREVIEW ==============
const MOCK_AVATARS = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&h=100&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=100&h=100&fit=crop&crop=face",
];

const MOCK_COVERS = [
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=200&h=280&fit=crop",
];

const MOCK_USERS = [
  { name: "Nadia ✨", level: 32, viewers: 1243, country: "🇧🇩" },
  { name: "Arif Khan", level: 28, viewers: 876, country: "🇮🇳" },
  { name: "Riya 💫", level: 45, viewers: 2108, country: "🇵🇰" },
  { name: "Sakib", level: 19, viewers: 431, country: "🇧🇩" },
];

const ThemePreviewModal = ({ theme, open, onClose }: { theme: EventTheme; open: boolean; onClose: () => void }) => {
  const primary = `hsl(${theme.primary_color})`;
  const secondary = `hsl(${theme.secondary_color})`;
  const accent = `hsl(${theme.accent_color})`;
  const gradFrom = `hsl(${theme.header_gradient_from})`;
  const gradTo = `hsl(${theme.header_gradient_to})`;
  const navBg = `hsl(${theme.nav_bg_color})`;
  const navActive = `hsl(${theme.nav_active_color})`;
  const tabActive = `hsl(${theme.tab_active_color})`;
  const cardBorder = `hsl(${theme.card_border_color})`;
  const particles = theme.floating_particles || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[390px] p-0 bg-black border-white/10 overflow-hidden max-h-[92vh] rounded-[2rem]">
        <DialogHeader className="sr-only">
          <DialogTitle>{theme.theme_name} Preview</DialogTitle>
        </DialogHeader>

        {/* Phone Frame */}
        <div className="relative overflow-hidden overflow-y-auto max-h-[88vh] scrollbar-none" style={{ background: gradFrom }}>
          
          {/* Floating Particles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5]">
            {particles.map((p, i) => (
              <motion.span
                key={i}
                className="absolute select-none"
                style={{ left: `${10 + i * 18}%`, fontSize: 16 + i * 2, opacity: 0.25 + (i % 3) * 0.08 }}
                animate={{ y: [500, -40], rotate: [0, 180, 360], x: [0, Math.sin(i * 1.5) * 25, 0] }}
                transition={{ duration: 5 + i * 1.5, repeat: Infinity, delay: i * 0.8, ease: "linear" }}
              >
                {p}
              </motion.span>
            ))}
          </div>

          {/* ===== STATUS BAR ===== */}
          <div className="flex items-center justify-between px-5 pt-3 pb-1 text-white/60 text-[11px] font-medium relative z-20">
            <span>9:41</span>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-[2px]">{[1,2,3,4].map(i => <div key={i} className="w-[3px] h-[10px] rounded-full" style={{ background: i <= 3 ? 'white' : 'rgba(255,255,255,0.2)', opacity: 0.6 }} />)}</div>
              <span className="text-[10px]">5G</span>
              <div className="w-6 h-3 border border-white/40 rounded-[3px] relative ml-0.5">
                <div className="absolute inset-[1px] right-[30%] rounded-[2px]" style={{ background: primary }} />
              </div>
            </div>
          </div>

          {/* ===== APP HEADER ===== */}
          <div className="relative z-20 px-4 py-3" style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}>
            {/* Gradient overlay */}
            <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 0%, ${gradFrom}40 100%)` }} />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <span className="text-2xl drop-shadow-lg">{theme.theme_icon}</span>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black" style={{ background: '#22c55e' }} />
                </div>
                <div>
                  <h3 className="text-white font-extrabold text-[15px] tracking-tight">{theme.theme_name}</h3>
                  <p className="text-[10px] font-medium" style={{ color: `${primary}99` }}>Live Streaming • Event Theme</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md" style={{ background: `${primary}18`, border: `1px solid ${primary}30` }}>
                  <Bell className="w-4 h-4 text-white/70" />
                  <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>3</div>
                </div>
                <div className="w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md" style={{ background: `${primary}18`, border: `1px solid ${primary}30` }}>
                  <MessageCircle className="w-4 h-4 text-white/70" />
                </div>
              </div>
            </div>
          </div>

          {/* ===== TOP TABS ===== */}
          <div className="flex gap-0 px-2 py-1.5 relative z-20" style={{ background: `${navBg}f0` }}>
            {["🔥 Popular", "🎤 Live", "✨ New", "❤️ Follow"].map((tab, i) => (
              <div
                key={tab}
                className="flex-1 text-center py-2 text-[11px] font-bold transition-all relative"
                style={{ color: i === 0 ? tabActive : 'rgba(255,255,255,0.35)' }}
              >
                {tab}
                {i === 0 && (
                  <motion.div 
                    layoutId="previewTabIndicator"
                    className="absolute bottom-0 left-[20%] right-[20%] h-[3px] rounded-full"
                    style={{ background: `linear-gradient(90deg, ${tabActive}, ${accent})`, boxShadow: `0 0 10px ${tabActive}80` }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* ===== COUNTRY FILTER ===== */}
          <div className="flex gap-2 px-3 py-2 relative z-20 overflow-x-auto scrollbar-none">
            {["🌍 Global", "🇧🇩 BD", "🇮🇳 India", "🇵🇰 PK", "🇸🇦 SA"].map((c, i) => (
              <div
                key={c}
                className="px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 transition-all"
                style={{
                  background: i === 0 ? `linear-gradient(135deg, ${primary}30, ${accent}20)` : 'rgba(255,255,255,0.04)',
                  color: i === 0 ? primary : 'rgba(255,255,255,0.35)',
                  border: i === 0 ? `1px solid ${primary}50` : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: i === 0 ? `0 0 12px ${primary}20` : 'none',
                }}
              >
                {c}
              </div>
            ))}
          </div>

          {/* ===== LIVE STREAMER GRID ===== */}
          <div className="grid grid-cols-2 gap-2 px-3 py-1.5 relative z-20">
            {MOCK_USERS.map((user, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden relative aspect-[3/4] group"
                style={{ border: `1.5px solid ${cardBorder}35` }}
              >
                {/* Real cover photo */}
                <img 
                  src={MOCK_COVERS[i]} 
                  alt="" 
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Dark gradient overlay */}
                <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 30%, ${navBg}ee 85%, ${navBg} 100%)` }} />
                {/* Theme tint overlay */}
                <div className="absolute inset-0" style={{ background: `${primary}08` }} />
                
                {/* Top badges */}
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                  {/* LIVE badge */}
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.9)', boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[8px] font-extrabold text-white tracking-wider">LIVE</span>
                  </div>
                  {/* Viewer count */}
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm">
                    <User className="w-2.5 h-2.5 text-white/70" />
                    <span className="text-[8px] font-bold text-white/80">{user.viewers.toLocaleString()}</span>
                  </div>
                </div>

                {/* Country flag */}
                <div className="absolute top-2 right-2 text-sm z-10">{user.country}</div>

                {/* Theme decoration */}
                <div className="absolute top-9 right-2 text-xs opacity-30 z-10">{particles[i % particles.length]}</div>

                {/* Bottom user info */}
                <div className="absolute bottom-0 left-0 right-0 p-2.5 z-10">
                  <div className="flex items-center gap-1.5">
                    {/* Real avatar */}
                    <div className="relative shrink-0">
                      <img 
                        src={MOCK_AVATARS[i]} 
                        alt="" 
                        className="w-7 h-7 rounded-full object-cover"
                        style={{ border: `2px solid ${primary}`, boxShadow: `0 0 8px ${primary}50` }}
                        loading="lazy"
                      />
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-black flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
                        <span className="text-[5px] font-bold text-white">✓</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-bold text-[11px] truncate">{user.name}</p>
                      <div className="flex items-center gap-1">
                        {/* Level badge */}
                        <div className="px-1.5 py-[1px] rounded-sm text-[7px] font-extrabold" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, color: 'white' }}>
                          Lv.{user.level}
                        </div>
                        {/* Gift icon */}
                        <div className="flex items-center gap-0.5">
                          <Heart className="w-2.5 h-2.5" style={{ color: accent, fill: accent }} />
                          <span className="text-[8px] font-bold" style={{ color: `${accent}cc` }}>{Math.floor(user.viewers / 3)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Glow border effect on theme color */}
                <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: `inset 0 0 20px ${primary}10, 0 0 15px ${primary}08` }} />
              </div>
            ))}
          </div>

          {/* ===== FEATURED BANNER ===== */}
          <div className="mx-3 my-2 rounded-2xl overflow-hidden relative z-20" style={{ background: `linear-gradient(135deg, ${primary}20, ${secondary}15)`, border: `1px solid ${primary}25` }}>
            <div className="p-3 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: `linear-gradient(135deg, ${primary}30, ${accent}20)`, boxShadow: `0 0 20px ${primary}30` }}>
                {theme.theme_icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-extrabold text-xs">{theme.theme_name} Special Event</p>
                <p className="text-[10px] mt-0.5" style={{ color: `${primary}bb` }}>🎁 Send gifts & win exclusive rewards!</p>
              </div>
              <div className="px-3 py-1.5 rounded-full text-[9px] font-extrabold text-white shrink-0" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, boxShadow: `0 4px 12px ${primary}50` }}>
                JOIN
              </div>
            </div>
          </div>

          {/* ===== PROFILE CARD ===== */}
          <div className="mx-3 my-2 p-3 rounded-2xl relative z-20 overflow-hidden" style={{ background: `${navBg}`, border: `1px solid ${cardBorder}30` }}>
            {/* Subtle gradient bg */}
            <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 20% 50%, ${primary}15, transparent 70%)` }} />
            <div className="relative flex items-center gap-3">
              {/* Avatar with frame */}
              <div className="relative shrink-0">
                <div className="w-14 h-14 rounded-full p-[2px]" style={{ background: `linear-gradient(135deg, ${primary}, ${accent}, ${secondary})` }}>
                  <img src={MOCK_AVATARS[4]} alt="" className="w-full h-full rounded-full object-cover border-2 border-black" loading="lazy" />
                </div>
                {/* VIP badge */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-[1px] rounded-full text-[7px] font-extrabold text-white whitespace-nowrap" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, boxShadow: `0 2px 8px ${primary}60` }}>
                  VIP 5
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-white font-extrabold text-sm">MeriLive User</span>
                  <Star className="w-3.5 h-3.5" style={{ color: accent, fill: accent }} />
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="px-1.5 py-[1px] rounded-sm text-[7px] font-extrabold text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
                    Lv.25
                  </div>
                  <span className="text-[10px] text-white/40">ID: 100892</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-white">1.2K</p>
                    <p className="text-[8px] text-white/30">Followers</p>
                  </div>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-white">348</p>
                    <p className="text-[8px] text-white/30">Following</p>
                  </div>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="text-center">
                    <p className="text-[10px] font-bold" style={{ color: accent }}>5.6K</p>
                    <p className="text-[8px] text-white/30">Gifts</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <div className="px-3 py-1.5 rounded-full text-[9px] font-extrabold text-white text-center" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, boxShadow: `0 2px 10px ${primary}50` }}>
                  Follow
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto" style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>
                  <Gift className="w-4 h-4" style={{ color: accent }} />
                </div>
              </div>
            </div>
          </div>

          {/* ===== BOTTOM NAVIGATION ===== */}
          <div className="relative z-20 mt-1 sticky bottom-0">
            <div className="h-[1px]" style={{ background: `linear-gradient(to right, transparent, ${primary}50, transparent)` }} />
            <div className="flex items-center justify-around py-2.5 px-4" style={{ background: `${navBg}f5`, backdropFilter: 'blur(20px)' }}>
              {[
                { icon: Home, label: "Home", active: true },
                { icon: Users, label: "Party", active: false },
                { icon: null, label: "", active: false, isCenter: true },
                { icon: Play, label: "Reels", active: false },
                { icon: User, label: "Me", active: false },
              ].map((item, idx) => (
                <div key={idx} className="flex flex-col items-center gap-0.5 relative">
                  {item.isCenter ? (
                    <div className="relative -mt-5">
                      <div className="absolute -inset-2 rounded-full blur-xl" style={{ background: `${primary}30` }} />
                      <div
                        className="relative w-12 h-12 rounded-full flex items-center justify-center ring-[3px] ring-black"
                        style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: `0 4px 20px ${primary}60` }}
                      >
                        <div className="absolute inset-[2px] rounded-full bg-gradient-to-br from-white/25 via-transparent to-transparent" />
                        <span className="text-white text-xl font-light">+</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {item.icon && <item.icon className="w-5 h-5" style={{ color: item.active ? navActive : 'rgba(255,255,255,0.3)' }} />}
                      <span className="text-[9px] font-semibold" style={{ color: item.active ? navActive : 'rgba(255,255,255,0.28)' }}>{item.label}</span>
                      {item.active && (
                        <div className="absolute -bottom-1 w-4 h-[3px] rounded-full" style={{ background: navActive, boxShadow: `0 0 8px ${navActive}80` }} />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Country filter options
const COUNTRY_FILTERS = [
  { code: 'ALL', name: 'All Countries', flag: '🌍' },
  { code: 'GLOBAL', name: 'Global', flag: '🌐' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
];

// ============== MAIN ADMIN THEME MANAGER ==============
const AdminThemeManager = () => {
  const navigate = useNavigate();
  const [themes, setThemes] = useState<EventTheme[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState<{ id: string; type: 'start' | 'end' } | null>(null);
  const [previewTheme, setPreviewTheme] = useState<EventTheme | null>(null);
  const [selectedCountry, setSelectedCountry] = useState('ALL');

  const fetchThemes = async () => {
    const { data } = await supabase
      .from("app_event_themes")
      .select("*")
      .order("display_order", { ascending: true });
    if (data) setThemes(data as any);
    setLoading(false);
  };

  const filteredThemes = selectedCountry === 'ALL'
    ? themes
    : themes.filter(t => (t as any).country_code === selectedCountry);

  useAdminRealtime(['app_event_themes'], fetchThemes);

  const handleToggleActive = async (theme: EventTheme) => {
    setSaving(theme.id);
    try {
      if (!theme.is_active) {
        // Only deactivate other active themes for the SAME country_code
        // This allows multiple countries to have different active themes simultaneously
        const countryCode = theme.country_code || 'GLOBAL';
        await supabase
          .from("app_event_themes")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("country_code", countryCode)
          .neq("id", theme.id);
      }
      const { error } = await supabase
        .from("app_event_themes")
        .update({ is_active: !theme.is_active, updated_at: new Date().toISOString() })
        .eq("id", theme.id);
      if (error) throw error;
      
      const countryInfo = COUNTRY_FILTERS.find(c => c.code === theme.country_code);
      const countryLabel = countryInfo ? `${countryInfo.flag} ${countryInfo.name}` : 'Global';
      toast.success(
        theme.is_active 
          ? `${theme.theme_name} deactivated for ${countryLabel}` 
          : `${theme.theme_name} activated for ${countryLabel}! 🎉`
      );
      await fetchThemes();
    } catch (err) {
      console.error("Toggle theme error:", err);
      recordAdminError({ kind: "rpc", label: "AdminThemeManager.countryLabel", message: formatAdminError(err) });
      toast.error("Failed to update theme");
    } finally {
      setSaving(null);
    }
  };

  const handleDateChange = async (themeId: string, type: 'start' | 'end', date: Date | undefined) => {
    if (!date) return;
    setSaving(themeId);
    try {
      const update = type === 'start'
        ? { starts_at: date.toISOString(), auto_schedule: true }
        : { ends_at: date.toISOString(), auto_schedule: true };
      await supabase.from("app_event_themes").update(update).eq("id", themeId);
      toast.success(`${type === 'start' ? 'Start' : 'End'} date set`);
      setDatePickerOpen(null);
    } catch {
      toast.error("Failed to set date");
    } finally {
      setSaving(themeId);
      setSaving(null);
    }
  };

  const handleClearDates = async (themeId: string) => {
    setSaving(themeId);
    try {
      await supabase.from("app_event_themes").update({ starts_at: null, ends_at: null, auto_schedule: false }).eq("id", themeId);
      toast.success("Schedule cleared");
    } catch {
      toast.error("Failed to clear dates");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-xl border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Palette className="w-5 h-5 text-purple-400" />
              Event Theme Manager
            </h1>
            <p className="text-xs text-white/50">
              {filteredThemes.length} themes {selectedCountry !== 'ALL' ? `for ${COUNTRY_FILTERS.find(c => c.code === selectedCountry)?.name}` : 'total'}
            </p>
          </div>
        </div>

        {/* Country Filter Tabs */}
        <div className="flex gap-1.5 mt-3 overflow-x-auto scrollbar-none pb-1">
          {COUNTRY_FILTERS.map(c => (
            <button
              key={c.code}
              onClick={() => setSelectedCountry(c.code)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all border",
                selectedCountry === c.code
                  ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                  : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60"
              )}
            >
              <span>{c.flag}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Running Events Dashboard - grouped by country */}
      {(() => {
        const activeThemes = themes.filter(t => t.is_active);
        if (activeThemes.length === 0) return null;

        // Group active themes by country
        const grouped = activeThemes.reduce((acc, t) => {
          const cc = t.country_code || 'GLOBAL';
          if (!acc[cc]) acc[cc] = [];
          acc[cc].push(t);
          return acc;
        }, {} as Record<string, EventTheme[]>);

        return (
          <div className="mx-4 mt-4 space-y-2">
            <h2 className="text-sm font-bold text-green-400 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Running Events ({activeThemes.length})
            </h2>
            {Object.entries(grouped).map(([cc, countryThemes]) => {
              const country = COUNTRY_FILTERS.find(c => c.code === cc);
              return (
                <div key={cc} className="p-3 rounded-2xl border border-green-500/30 bg-green-500/10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{country?.flag || '🌐'}</span>
                    <span className="text-xs font-bold text-green-300">{country?.name || cc}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 rounded-full text-green-400 font-bold">LIVE</span>
                  </div>
                  {countryThemes.map(t => (
                    <div key={t.id} className="flex items-center gap-2 py-1">
                      <span className="text-xl">{t.theme_icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-green-300/90 truncate">{t.theme_name}</p>
                        {t.ends_at && (
                          <p className="text-[10px] text-green-300/50">
                            <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                            Expires: {format(new Date(t.ends_at), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={true}
                        onCheckedChange={() => handleToggleActive(t)}
                        className="data-[state=checked]:bg-green-500 scale-75"
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Theme Grid */}
      <div className="p-4 space-y-3">
        {filteredThemes.map((theme) => (
          <Card
            key={theme.id}
            className={cn(
              "border transition-all duration-300 overflow-hidden",
              theme.is_active
                ? "border-green-500/50 bg-gradient-to-r from-green-500/10 to-emerald-500/5"
                : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {/* Theme Icon & Preview */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 border border-white/10 cursor-pointer hover:scale-105 transition-transform"
                  style={{
                    background: `linear-gradient(135deg, hsl(${theme.header_gradient_from}), hsl(${theme.header_gradient_to}))`,
                  }}
                  onClick={() => setPreviewTheme(theme)}
                >
                  {theme.theme_icon}
                </div>

                {/* Theme Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-bold text-sm truncate">{theme.theme_name}</h3>
                    {theme.country_code && theme.country_code !== 'GLOBAL' && (
                      <span className="shrink-0 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 text-[9px] font-bold rounded-full border border-blue-500/25">
                        {COUNTRY_FILTERS.find(c => c.code === theme.country_code)?.flag} {theme.country_code}
                      </span>
                    )}
                    {theme.is_active && (
                      <span className="shrink-0 px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded-full border border-green-500/30">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/50 line-clamp-1">{theme.description}</p>

                  {/* Color Preview Dots */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: `hsl(${theme.primary_color})` }} title="Primary" />
                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: `hsl(${theme.secondary_color})` }} title="Secondary" />
                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: `hsl(${theme.accent_color})` }} title="Accent" />
                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: `hsl(${theme.tab_active_color})` }} title="Tab" />
                    <span className="text-white/30 text-[10px] ml-1">
                      {theme.floating_particles?.join(" ")}
                    </span>
                  </div>

                  {/* Nav Icon Upload Section */}
                  <div className="mt-2 p-2 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-[10px] font-bold text-white/60 mb-1.5">🎨 Nav Bar Icons (PNG)</p>
                    <div className="grid grid-cols-4 gap-2">
                      {(['home', 'party', 'reels', 'profile'] as const).map((iconType) => {
                        const fieldKey = `nav_${iconType}_icon_url` as keyof EventTheme;
                        const currentUrl = theme[fieldKey] as string | null;
                        return (
                          <div key={iconType} className="flex flex-col items-center gap-1">
                            <div className="w-10 h-10 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center overflow-hidden relative group">
                              {currentUrl ? (
                                <>
                                  <img src={currentUrl} alt={iconType} className="w-8 h-8 object-contain" />
                                  <button
                                    className="absolute inset-0 bg-red-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={async () => {
                                      await supabase.from("app_event_themes").update({ [fieldKey]: null }).eq("id", theme.id);
                                      toast.success(`${iconType} icon removed`);
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3 text-white" />
                                  </button>
                                </>
                              ) : (
                                <label className="cursor-pointer w-full h-full flex items-center justify-center hover:bg-white/10 transition-colors">
                                  <Upload className="w-3.5 h-3.5 text-white/40" />
                                  <input
                                    type="file"
                                    accept="image/png"
                                    className="hidden"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const path = `nav-icons/${theme.theme_key}-${iconType}-${Date.now()}.png`;
                                      const { error: uploadErr } = await supabase.storage.from('app-assets').upload(path, file, { upsert: true });
                                      if (uploadErr) { toast.error('Upload failed'); return; }
                                      const { data: urlData } = supabase.storage.from('app-assets').getPublicUrl(path);
                                      await supabase.from("app_event_themes").update({ [fieldKey]: urlData.publicUrl }).eq("id", theme.id);
                                      toast.success(`${iconType} icon uploaded!`);
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                            <span className="text-[8px] text-white/40 capitalize">{iconType}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Preview Button + Date Schedule */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] gap-1 bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200"
                      onClick={() => setPreviewTheme(theme)}
                    >
                      <Eye className="w-3 h-3" />
                      Preview
                    </Button>

                    <Popover
                      open={datePickerOpen?.id === theme.id && datePickerOpen?.type === 'start'}
                      onOpenChange={(open) => setDatePickerOpen(open ? { id: theme.id, type: 'start' } : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                          <CalendarIcon className="w-3 h-3" />
                          {theme.starts_at ? format(new Date(theme.starts_at), "MMM d, yyyy") : "Start Date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10" align="start">
                        <Calendar
                          mode="single"
                          selected={theme.starts_at ? new Date(theme.starts_at) : undefined}
                          onSelect={(d) => handleDateChange(theme.id, 'start', d)}
                          className="p-3 pointer-events-auto text-white"
                        />
                      </PopoverContent>
                    </Popover>

                    <span className="text-white/30 text-[10px]">→</span>

                    <Popover
                      open={datePickerOpen?.id === theme.id && datePickerOpen?.type === 'end'}
                      onOpenChange={(open) => setDatePickerOpen(open ? { id: theme.id, type: 'end' } : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
                          <CalendarIcon className="w-3 h-3" />
                          {theme.ends_at ? format(new Date(theme.ends_at), "MMM d, yyyy") : "End Date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-slate-900 border-white/10" align="start">
                        <Calendar
                          mode="single"
                          selected={theme.ends_at ? new Date(theme.ends_at) : undefined}
                          onSelect={(d) => handleDateChange(theme.id, 'end', d)}
                          className="p-3 pointer-events-auto text-white"
                        />
                      </PopoverContent>
                    </Popover>

                    {(theme.starts_at || theme.ends_at) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2"
                        onClick={() => handleClearDates(theme.id)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                {/* Toggle Switch */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  {saving === theme.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                  ) : (
                    <Switch
                      checked={theme.is_active}
                      onCheckedChange={() => handleToggleActive(theme)}
                      className="data-[state=checked]:bg-green-500"
                    />
                  )}
                  <span className="text-[9px] text-white/30">
                    {theme.is_active ? "ON" : "OFF"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info Footer */}
      <div className="p-4 mx-4 mb-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
          <div className="text-xs text-purple-300/80 space-y-1">
            <p>• Only <strong>one theme</strong> can be active at a time</p>
            <p>• Activating a new theme auto-deactivates the current one</p>
            <p>• Set <strong>Start/End dates</strong> for auto-scheduling</p>
            <p>• Theme changes apply <strong>instantly</strong> across the entire app</p>
            <p>• When timer expires, app returns to <strong>default theme</strong> automatically</p>
            <p>• Click <strong>Preview</strong> to see how the theme looks before activating</p>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewTheme && (
        <ThemePreviewModal
          theme={previewTheme}
          open={!!previewTheme}
          onClose={() => setPreviewTheme(null)}
        />
      )}
    </div>
  );
};

export default AdminThemeManager;
