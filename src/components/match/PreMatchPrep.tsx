import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, CameraOff, Mic, MicOff, SwitchCamera, Sparkles,
  Users, Globe2, Languages, Crown, Lock, Phone, ShieldCheck, Gem, Clock, ChevronLeft, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserBalance } from "@/hooks/useUserBalance";

export type MatchFilters = {
  preferred_host_gender: "male" | "female" | "any";
  preferred_country: string | null;
  preferred_langs: string[];
};

interface Props {
  diamondBalance: number;
  hostRatePerMin: number;
  freeTrialSeconds: number;
  minBillableSeconds: number;
  availableHostsCount: number;
  estimatedWaitSeconds: number;
  isVip: boolean;
  countryRequiresVip: boolean;
  genderFilterEnabled: boolean;
  countryFilterEnabled: boolean;
  onStart: (filters: MatchFilters, beauty: boolean) => void;
  /** Optional unified-phase props — keeps a single UI across prep/searching/matched/error. */
  phase?: "prep" | "searching" | "matched" | "error";
  elapsedSeconds?: number;
  errorMsg?: string;
  onCancel?: () => void;
  onRetry?: () => void;
}

/**
 * Tap-to-Match Radar prep screen (Chamet/Olamet-tier).
 * Layout: live self-cam blurred as ambient background → concentric pulsing
 * radar rings around a central "Tap to Match" target → side VIP discount card
 * → Start button with diamond cost chip → filter sheet under it.
 */
export default function PreMatchPrep({
  diamondBalance, hostRatePerMin, freeTrialSeconds, minBillableSeconds,
  availableHostsCount, estimatedWaitSeconds, isVip,
  countryRequiresVip, genderFilterEnabled, countryFilterEnabled, onStart,
}: Props) {
  const navigate = useNavigate();
  const { balance: liveBalance, initialized: balanceReady } = useUserBalance();
  const effectiveBalance = balanceReady ? liveBalance : diamondBalance;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [beauty, setBeauty] = useState(false);
  const [gender, setGender] = useState<"male" | "female" | "any">("any");
  const [country, setCountry] = useState<string | null>(null);
  const [langs, setLangs] = useState<string[]>([]);
  const [permError, setPermError] = useState<string | null>(null);
  const [vipCountdown, setVipCountdown] = useState(60 * 60 - 10); // 59:50 visual
  const [orbitAvatars, setOrbitAvatars] = useState<string[]>([]);

  const startStream = async () => {
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camOn ? { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } } : false,
        audio: micOn,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setPermError(null);
    } catch (e: any) { setPermError(e?.message || "Camera/mic access denied"); }
  };
  const stopStream = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };

  useEffect(() => { if (camOn || micOn) startStream(); return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, micOn, facing]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "hidden") stopStream(); };
    const onPageHide = () => stopStream();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setVipCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Live orbit avatars — fetch online verified hosts and rotate the set every few seconds
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data } = await supabase.rpc("get_random_pool_sample", { _limit: 18 });
        if (!mounted) return;
        const urls = (data as any[] | null)?.map((r) => r.avatar_url).filter(Boolean) as string[] | undefined;
        if (urls && urls.length) {
          // shuffle to randomize each refresh
          const shuffled = [...urls].sort(() => Math.random() - 0.5).slice(0, 12);
          setOrbitAvatars(shuffled);
        } else {
          setOrbitAvatars([]);
        }
      } catch (_) { /* ignore */ }
    };
    load();
    const t = window.setInterval(load, 6000);
    return () => { mounted = false; window.clearInterval(t); };
  }, []);

  // Pre-computed deterministic-ish positions inside the radar
  const orbitSlots = useMemo(() => {
    // 12 slots placed on 3 rings around the centre
    const slots: { x: number; y: number; size: number; ring: number }[] = [];
    const rings = [
      { r: 60, count: 4, size: 28 },
      { r: 100, count: 4, size: 32 },
      { r: 138, count: 4, size: 26 },
    ];
    rings.forEach((ring, ri) => {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2 + (ri * 0.5);
        slots.push({
          x: Math.cos(angle) * ring.r,
          y: Math.sin(angle) * ring.r,
          size: ring.size,
          ring: ri,
        });
      }
    });
    return slots;
  }, []);

  const insufficient = effectiveBalance < hostRatePerMin;
  const filtersLocked = countryRequiresVip && !isVip;

  const handleStart = () => {
    stopStream();
    onStart({
      preferred_host_gender: genderFilterEnabled ? gender : "any",
      preferred_country: countryFilterEnabled && !filtersLocked ? country : null,
      preferred_langs: !filtersLocked ? langs : [],
    }, beauty);
  };

  const fmtClock = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };

  return (
    <div className="relative min-h-[100svh] bg-slate-950 text-white overflow-hidden">
      {/* Ambient blurred self-cam background */}
      <div className="absolute inset-0">
        {camOn ? (
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="w-full h-full object-cover scale-110"
            style={{
              transform: facing === "user" ? "scaleX(-1) scale(1.1)" : "scale(1.1)",
              filter: `blur(28px) brightness(0.55) saturate(1.1)${beauty ? " contrast(0.95)" : ""}`,
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/20 to-slate-950/90" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button onClick={() => navigate(-1)} aria-label="Back"
          className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md border border-white/15 grid place-items-center">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 h-8 px-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/15">
            <Gem className="w-3.5 h-3.5 text-cyan-300" />
            <span className="text-xs font-bold tabular-nums">{effectiveBalance.toLocaleString()}</span>
          </div>
          <button aria-label="History"
            className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md border border-white/15 grid place-items-center">
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Radar centerpiece */}
      <div className="relative z-10 flex flex-col items-center justify-center pt-6 pb-8">
        <div className="relative w-[280px] h-[280px] flex items-center justify-center">
          {/* concentric rings, increasing scale + delay */}
          {[0, 0.6, 1.2, 1.8].map((delay, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full border border-white/30"
              style={{ width: 280, height: 280 }}
              animate={{ scale: [0.4, 1], opacity: [0.6, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, delay, ease: "easeOut" }}
            />
          ))}
          {/* static inner rings */}
          <span className="absolute w-[200px] h-[200px] rounded-full border border-white/15" />
          <span className="absolute w-[130px] h-[130px] rounded-full border border-white/20" />
          <span className="absolute w-[80px] h-[80px] rounded-full bg-gradient-to-br from-fuchsia-500/30 to-indigo-500/30 backdrop-blur-md border border-white/25 shadow-[inset_0_0_24px_rgba(255,255,255,0.12)]" />

          {/* Floating online host avatars (orbit) */}
          <AnimatePresence>
            {orbitSlots.map((slot, i) => {
              const url = orbitAvatars[i % Math.max(1, orbitAvatars.length)];
              if (!url || !orbitAvatars.length) return null;
              const cx = slot.x - slot.size / 2;
              const cy = slot.y - slot.size / 2;
              return (
                <motion.div
                  key={`${i}-${url}`}
                  className="absolute rounded-full overflow-hidden ring-2 ring-white/40 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.6)]"
                  style={{ width: slot.size, height: slot.size, left: "50%", top: "50%" }}
                  initial={{ x: cx, y: cy, scale: 0, opacity: 0 }}
                  animate={{
                    x: [cx, cx + (slot.ring === 1 ? 6 : -4), cx],
                    y: [cy, cy - 6, cy],
                    scale: 1, opacity: 1,
                  }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{
                    x: { duration: 4 + i * 0.3, repeat: Infinity, ease: "easeInOut" },
                    y: { duration: 4 + i * 0.3, repeat: Infinity, ease: "easeInOut" },
                    scale: { duration: 0.4, delay: i * 0.05 },
                    opacity: { duration: 0.4, delay: i * 0.05 },
                  }}
                >
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>

          <button
            type="button"
            onClick={handleStart}
            disabled={insufficient}
            aria-label="Tap to Match"
            className="absolute inset-0 rounded-full grid place-items-center bg-transparent disabled:opacity-60"
          >
            <div className="text-center">
              <div className="text-[15px] font-bold tracking-tight drop-shadow">Tap to Match</div>
              <div className="text-[10px] text-white/70 mt-0.5">{availableHostsCount} hosts online</div>
            </div>
          </button>
        </div>

        {/* VIP discount card (right-side floating) */}
        {!isVip && (
          <div className="absolute right-3 top-[150px] flex flex-col items-end gap-1.5">
            <div className="px-2 py-1 rounded-md bg-rose-600/90 text-white text-[10px] font-mono font-bold tracking-wider border border-white/20 shadow-md whitespace-nowrap tabular-nums">
              {fmtClock(vipCountdown)}
            </div>
            <button onClick={() => navigate("/vip")}
              className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 shadow-[0_10px_28px_-8px_rgba(168,85,247,0.6)] border-2 border-white/30 grid place-items-center">
              <Crown className="w-7 h-7 text-amber-200 drop-shadow" />
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white text-[9px] font-extrabold tracking-wide border border-white/40 shadow-md whitespace-nowrap leading-none">
                60% OFF
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Camera control strip */}
      <div className="relative z-10 flex items-center justify-center gap-2 mb-4">
        <CtrlBtn active={camOn} onClick={() => setCamOn((v) => !v)} label="Camera">
          {camOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
        </CtrlBtn>
        <CtrlBtn active={micOn} onClick={() => setMicOn((v) => !v)} label="Microphone">
          {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </CtrlBtn>
        <CtrlBtn active={facing === "environment"} onClick={() => setFacing((f) => f === "user" ? "environment" : "user")} label="Flip">
          <SwitchCamera className="w-4 h-4" />
        </CtrlBtn>
        <CtrlBtn active={beauty} onClick={() => setBeauty((v) => !v)} label="Beauty">
          <Sparkles className="w-4 h-4" />
        </CtrlBtn>
      </div>

      {permError && (
        <div className="relative z-10 mx-4 mb-3 text-center text-xs text-rose-200 bg-rose-500/20 border border-rose-300/30 rounded-xl p-2">
          {permError}
        </div>
      )}

      {/* Start CTA */}
      <div className="relative z-10 px-6 mb-4">
        <motion.div whileTap={{ scale: 0.97 }}>
          <Button
            onClick={handleStart}
            disabled={insufficient}
            className="w-full h-14 rounded-full text-base font-bold bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 hover:opacity-95 shadow-[0_14px_40px_-10px_rgba(168,85,247,0.7)] border border-white/20"
          >
            <Phone className="w-5 h-5 mr-2" /> Start
          </Button>
        </motion.div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-white/85">
          <span className="opacity-70">First {freeTrialSeconds}s</span>
          <span className="font-bold">FREE</span>
          <span className="opacity-50">·</span>
          <Gem className="w-3 h-3 text-cyan-300" />
          <span className="font-bold">{hostRatePerMin}</span>
          <span className="opacity-70">/ min after</span>
        </div>
        {insufficient && (
          <button onClick={() => navigate("/recharge")}
            className="mt-3 mx-auto block px-4 h-9 rounded-full bg-amber-400 text-black text-xs font-bold">
            Recharge — need {hostRatePerMin.toLocaleString()} diamonds for 1 minute
          </button>
        )}
      </div>
    </div>
  );
}

function CtrlBtn({ children, active, onClick, label }: {
  children: React.ReactNode; active: boolean; onClick: () => void; label: string;
}) {
  return (
    <button onClick={onClick} aria-label={label}
      className={`h-10 w-10 rounded-full grid place-items-center transition border
        ${active ? "bg-white text-slate-900 border-white"
          : "bg-black/40 text-white border-white/15 backdrop-blur-md hover:bg-white/15"}`}>
      {children}
    </button>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/40 backdrop-blur-md border border-white/10 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider opacity-70">{icon}<span>{label}</span></div>
      <div className="text-sm font-bold mt-0.5">{value}</div>
    </div>
  );
}

function ChipRow({ icon, title, locked, children }: {
  icon: React.ReactNode; title: string; locked?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] text-white/60 mb-1.5">
        {icon}<span>{title}</span>
        {locked && <Lock className="w-3 h-3 ml-auto text-amber-300" />}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, disabled, onClick, children }: {
  active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-3 h-7 rounded-full text-xs font-semibold border transition
        ${active ? "bg-white text-slate-900 border-white"
          : "bg-white/5 text-white/80 border-white/15 hover:bg-white/10"}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      {children}
    </button>
  );
}
