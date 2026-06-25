import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera, CameraOff, Mic, MicOff, SwitchCamera, Sparkles,
  Users, Globe2, Languages, Crown, Lock, Coins, Phone, ShieldCheck, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

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
 * Chamet-style pre-match prep screen.
 * Mounted ABOVE the search/globe phase. User can preview their own camera,
 * toggle mic / beauty / camera-flip, see balance + queue stats, pick filters,
 * then tap Start to enter the matching pool.
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
    } catch (e: any) {
      setPermError(e?.message || "Camera/mic access denied");
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (camOn || micOn) startStream();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, micOn, facing]);

  // Release camera if the tab is hidden or the page is being torn down — prevents
  // the "camera still on" ghost state that other live apps suffer from.
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

  const insufficient = diamondBalance < hostRatePerMin;
  const filtersLocked = countryRequiresVip && !isVip;

  const handleStart = () => {
    stopStream();
    onStart(
      {
        preferred_host_gender: genderFilterEnabled ? gender : "any",
        preferred_country: countryFilterEnabled && !filtersLocked ? country : null,
        preferred_langs: !filtersLocked ? langs : [],
      },
      beauty,
    );
  };

  return (
    <div className="min-h-[100svh] bg-gradient-to-b from-slate-950 via-indigo-950 to-fuchsia-950 text-white pb-[max(env(safe-area-inset-bottom),16px)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),16px)]">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full"
                onClick={() => navigate(-1)} aria-label="Close">
          <span aria-hidden>✕</span>
        </Button>
        <Badge className="bg-white/10 border-white/20 text-white text-xs">Match Call · Ready</Badge>
        <div className="w-9" />
      </div>

      <div className="px-4 space-y-4">
        {/* Self-camera preview */}
        <div className="relative aspect-[9/14] max-h-[55vh] rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl">
          {camOn ? (
            <video
              ref={videoRef}
              autoPlay playsInline muted
              className={`w-full h-full object-cover ${beauty ? "blur-[1px] brightness-110 saturate-110 contrast-95" : ""}`}
              style={{ transform: facing === "user" ? "scaleX(-1)" : "none" }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full text-white/60 text-sm">
              <CameraOff className="w-10 h-10 mb-2" />
              Camera off
            </div>
          )}

          {permError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 text-center text-xs">
              {permError}
            </div>
          )}

          {/* Floating control bar */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full px-2 py-1.5 border border-white/10">
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
        </div>

        {/* Live stats */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard icon={<Users className="w-4 h-4" />} label="Hosts online" value={String(availableHostsCount)} />
          <StatCard icon={<Clock className="w-4 h-4" />} label="Est. wait" value={`${estimatedWaitSeconds}s`} />
          <StatCard icon={<Coins className="w-4 h-4 text-amber-300" />} label="Balance"
            value={diamondBalance.toLocaleString()} tone={insufficient ? "warn" : undefined} />
        </div>

        {/* Top-up shortcut if low */}
        {insufficient && (
          <Card className="bg-amber-500/10 border-amber-400/30 text-amber-100 p-3 flex items-center justify-between">
            <div className="text-xs">
              You need at least <strong>{hostRatePerMin.toLocaleString()}</strong> diamonds for 1 minute.
            </div>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-400 text-black h-8"
                    onClick={() => navigate("/recharge")}>Top Up</Button>
          </Card>
        )}

        {/* Filters */}
        <Card className="bg-white/5 border-white/10 text-white p-4 space-y-3">
          <div className="text-xs uppercase tracking-wide text-white/60 font-semibold">Preferences</div>

          {/* Gender */}
          {genderFilterEnabled && (
            <ChipRow icon={<Users className="w-3.5 h-3.5" />} title="Host gender">
              {(["any", "female", "male"] as const).map((g) => (
                <Chip key={g} active={gender === g} onClick={() => setGender(g)}>
                  {g === "any" ? "Any" : g.charAt(0).toUpperCase() + g.slice(1)}
                </Chip>
              ))}
            </ChipRow>
          )}

          {/* Country */}
          {countryFilterEnabled && (
            <ChipRow icon={<Globe2 className="w-3.5 h-3.5" />} title="Country" locked={filtersLocked}>
              {["any", "BD", "IN", "PK", "US", "ID"].map((c) => (
                <Chip key={c}
                  active={(c === "any" ? null : c) === country}
                  disabled={filtersLocked}
                  onClick={() => !filtersLocked && setCountry(c === "any" ? null : c)}>
                  {c === "any" ? "Any" : c}
                </Chip>
              ))}
            </ChipRow>
          )}

          {/* Language */}
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
              <Crown className="w-3 h-3" /> Upgrade to VIP to unlock Country & Language filters.
            </div>
          )}
        </Card>

        {/* Rules */}
        <Card className="bg-white/5 border-white/10 text-white p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-white/70">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            First <strong>{freeTrialSeconds}s</strong> are free. After that, <strong>{hostRatePerMin}</strong> diamonds/min.
          </div>
          <div className="text-[11px] text-white/60">
            Calls under <strong>{minBillableSeconds}s</strong> earn the host nothing — please don't hang up too early.
          </div>
        </Card>
      </div>

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[max(env(safe-area-inset-bottom),16px)] bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
        <motion.div whileTap={{ scale: 0.98 }}>
          <Button
            onClick={handleStart}
            disabled={insufficient}
            className="w-full h-14 rounded-2xl text-base font-bold bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:opacity-90 shadow-2xl shadow-cyan-500/40 disabled:opacity-50"
          >
            <Phone className="w-5 h-5 mr-2" />
            Start Match
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

function CtrlBtn({ children, active, onClick, label }: {
  children: React.ReactNode; active: boolean; onClick: () => void; label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`h-10 w-10 rounded-full flex items-center justify-center transition
        ${active ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20"}`}
    >
      {children}
    </button>
  );
}

function StatCard({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: string; tone?: "warn";
}) {
  return (
    <div className={`rounded-xl border p-2.5 ${tone === "warn"
      ? "bg-amber-500/10 border-amber-400/30 text-amber-100"
      : "bg-white/5 border-white/10 text-white"}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70">
        {icon}<span>{label}</span>
      </div>
      <div className="text-base font-bold mt-0.5">{value}</div>
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
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 h-7 rounded-full text-xs font-medium border transition
        ${active ? "bg-white text-slate-900 border-white"
          : "bg-white/5 text-white/80 border-white/15 hover:bg-white/10"}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}
