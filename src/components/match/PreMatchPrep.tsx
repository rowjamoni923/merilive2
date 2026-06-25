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

  const insufficient = diamondBalance < hostRatePerMin;
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
            <span className="text-xs font-bold">{diamondBalance.toLocaleString()}</span>
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
          <span className="absolute w-[80px] h-[80px] rounded-full bg-white/5 backdrop-blur-md border border-white/25" />
          <div className="relative text-center">
            <div className="text-[15px] font-bold tracking-tight">Tap to Match</div>
            <div className="text-[10px] text-white/60 mt-0.5">{availableHostsCount} hosts online</div>
          </div>
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

      {/* Quick stats + filters */}
      <div className="relative z-10 px-4 pb-[calc(max(env(safe-area-inset-bottom),16px)+24px)] space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <StatChip icon={<Users className="w-3 h-3" />} label="Online" value={String(availableHostsCount)} />
          <StatChip icon={<Clock className="w-3 h-3" />} label="Wait" value={`~${estimatedWaitSeconds}s`} />
          <StatChip icon={<ShieldCheck className="w-3 h-3 text-emerald-300" />} label="Min bill" value={`${minBillableSeconds}s`} />
        </div>

        <Card className="bg-black/40 backdrop-blur-md border-white/10 text-white p-3.5 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Preferences</div>

          {genderFilterEnabled && (
            <ChipRow icon={<Users className="w-3.5 h-3.5" />} title="Host">
              {(["any", "female", "male"] as const).map((g) => (
                <Chip key={g} active={gender === g} onClick={() => setGender(g)}>
                  {g === "any" ? "Any" : g[0].toUpperCase() + g.slice(1)}
                </Chip>
              ))}
            </ChipRow>
          )}

          {countryFilterEnabled && (
            <ChipRow icon={<Globe2 className="w-3.5 h-3.5" />} title="Country" locked={filtersLocked}>
              {["any", "BD", "IN", "PK", "US", "ID"].map((c) => (
                <Chip key={c} active={(c === "any" ? null : c) === country}
                  disabled={filtersLocked}
                  onClick={() => !filtersLocked && setCountry(c === "any" ? null : c)}>
                  {c === "any" ? "Any" : c}
                </Chip>
              ))}
            </ChipRow>
          )}

          <ChipRow icon={<Languages className="w-3.5 h-3.5" />} title="Language" locked={filtersLocked}>
            {["en", "bn", "hi", "id"].map((l) => {
              const active = langs.includes(l);
              return (
                <Chip key={l} active={active} disabled={filtersLocked}
                  onClick={() => {
                    if (filtersLocked) return;
                    setLangs((prev) => active ? prev.filter((x) => x !== l) : [...prev, l]);
                  }}>
                  {l.toUpperCase()}
                </Chip>
              );
            })}
          </ChipRow>

          {filtersLocked && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-200/90">
              <Lock className="w-3 h-3" /> VIP unlocks Country & Language filters.
            </div>
          )}
        </Card>
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
