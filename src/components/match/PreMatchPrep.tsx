import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, CameraOff, Mic, MicOff, SwitchCamera, Sparkles,
  Crown, Phone, ShieldCheck, Gem, ChevronLeft, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getBalanceWithFetch, useUserBalance } from "@/hooks/useUserBalance";
import AnimatedGlobeBackdrop from "./AnimatedGlobeBackdrop";
import { enforcePermanentCameraLock } from "@/utils/cameraLock";


export type MatchFilters = {
  preferred_host_gender: "male" | "female" | "any";
  preferred_country: string | null;
  preferred_langs: string[];
};

interface Props {
  diamondBalance: number;
  hostRatePerMin: number;
  requiredBalance?: number;
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
  onBack?: () => void;
  onHistory?: () => void;
  /** Avatar of the matched host to freeze in the centre during `matched` phase. */
  matchedAvatarUrl?: string | null;
}

/**
 * Single Random Call surface.
 * Prep, searching, matched and error states all stay on this same camera/radar UI;
 * only the center copy and bottom CTA change so users never see a second design.
 */
export default function PreMatchPrep({
  diamondBalance, hostRatePerMin, requiredBalance, freeTrialSeconds, minBillableSeconds,
  availableHostsCount, estimatedWaitSeconds, isVip, onStart,
  phase = "prep", elapsedSeconds = 0, errorMsg = "", onCancel, onRetry, onBack, onHistory,
  matchedAvatarUrl = null,
}: Props) {
  const navigate = useNavigate();
  const { balance: liveBalance } = useUserBalance();
  const effectiveBalance = Math.max(Number(diamondBalance || 0), Number(liveBalance || 0));
  const isSearching = phase === "searching";
  const isMatched = phase === "matched";
  const isError = phase === "error";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [beauty, setBeauty] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [vipCountdown, setVipCountdown] = useState(60 * 60 - 10); // 59:50 visual
  const [orbitAvatars, setOrbitAvatars] = useState<string[]>([]);
  const headerActionLockRef = useRef<{ key: "back" | "history"; at: number } | null>(null);
  

  const startStream = async () => {
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camOn
          ? { facingMode: { ideal: facing }, width: { ideal: 1080 }, height: { ideal: 1440 }, resizeMode: 'none', frameRate: { ideal: 30 } } as unknown as MediaTrackConstraints
          : false,
        audio: micOn,
      });
      await enforcePermanentCameraLock(stream, 'pre-match-prep');
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setPermError(null);
    } catch (e: any) { setPermError(e?.message || "Camera/mic access denied"); }
  };
  const stopStream = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };

  const runHeaderAction = useCallback((key: "back" | "history", action: () => void) => {
    const now = performance.now();
    const last = headerActionLockRef.current;
    if (last?.key === key && now - last.at < 500) return;
    headerActionLockRef.current = { key, at: now };
    stopStream();
    action();
  }, []);

  const goBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    const canGoBack = Number(window.history.state?.idx ?? 0) > 0;
    if (canGoBack) navigate(-1);
    else navigate("/", { replace: true });
  }, [navigate, onBack]);

  const goHistory = useCallback(() => {
    if (onHistory) {
      onHistory();
      return;
    }
    navigate("/call-history");
  }, [navigate, onHistory]);

  const bindInstantHeaderAction = (key: "back" | "history", action: () => void) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      runHeaderAction(key, action);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      runHeaderAction(key, action);
    },
    onTouchStart: (event: ReactTouchEvent<HTMLButtonElement>) => {
      if (typeof window !== "undefined" && "PointerEvent" in window) return;
      event.preventDefault();
      event.stopPropagation();
      runHeaderAction(key, action);
    },
    onTouchEnd: (event: ReactTouchEvent<HTMLButtonElement>) => {
      if (typeof window !== "undefined" && "PointerEvent" in window) return;
      event.preventDefault();
      event.stopPropagation();
      runHeaderAction(key, action);
    },
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      runHeaderAction(key, action);
    },
  });

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

  // Orbit avatars use the same verified-online pool as the Random Call fanout.
  // Deterministic order is enforced server-side so the set never shuffles randomly.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc("get_random_pool_sample", { _limit: 24 });
        if (error) throw error;
        if (!mounted) return;
        const urls: string[] = [];
        for (const row of (data as any[] | null) ?? []) {
          const url = row?.avatar_url as string | undefined;
          if (!url || urls.includes(url)) continue;
          urls.push(url);
          if (urls.length >= 12) break;
        }
        setOrbitAvatars(urls);
      } catch (_) { /* ignore */ }
    };
    load();
    const t = window.setInterval(load, 8000);
    return () => { mounted = false; window.clearInterval(t); };
  }, []);

  // Cycle host avatars through the centre orb — one-by-one preview of who could
  // pick up. Runs in prep + searching whenever verified hosts are online; freezes
  // on `matchedAvatarUrl` once matched.
  const [centreAvatarIdx, setCentreAvatarIdx] = useState(0);
  useEffect(() => {
    if (phase === "matched" || phase === "error") return;
    if (orbitAvatars.length === 0) return;
    const t = window.setInterval(() => {
      setCentreAvatarIdx((i) => (i + 1) % orbitAvatars.length);
    }, phase === "searching" ? 650 : 1400);
    return () => window.clearInterval(t);
  }, [phase, orbitAvatars.length]);
  const centreAvatar = phase === "matched"
    ? (matchedAvatarUrl || orbitAvatars[centreAvatarIdx] || null)
    : (phase === "searching" || phase === "prep")
      ? (orbitAvatars[centreAvatarIdx] || null)
      : null;
  const showingHostPhoto = !!centreAvatar && (phase === "prep" || phase === "searching" || phase === "matched");

  // Pre-computed deterministic-ish positions inside the radar
  const orbitSlots = useMemo(() => {
    // 12 slots placed on 3 rings around the centre (larger orb -> wider rings)
    const slots: { x: number; y: number; size: number; ring: number }[] = [];
    const rings = [
      { r: 100, count: 4, size: 26 },
      { r: 135, count: 4, size: 30 },
      { r: 168, count: 4, size: 24 },
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

  const requiredToStart = Math.max(Number(requiredBalance ?? hostRatePerMin), hostRatePerMin, 0);
  const handleStart = async () => {
    const latestBalance = Math.max(effectiveBalance, await getBalanceWithFetch(true));
    if (requiredToStart > 0 && latestBalance < requiredToStart) {
      stopStream();
      navigate("/recharge", { replace: true });
      return;
    }
    stopStream();
    onStart({
      preferred_host_gender: "any",
      preferred_country: null,
      preferred_langs: [],
    }, beauty);
  };

  const fmtClock = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };

  return (
    <div className="relative min-h-[100svh] bg-[#04020f] text-white overflow-hidden">
      {/* Premium animated world backdrop */}
      <AnimatedGlobeBackdrop />
      {/* Keep camera element mounted (continuity) but hidden — backdrop is the globe */}
      {camOn && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute w-1 h-1 opacity-0 pointer-events-none"
          aria-hidden
        />
      )}


      {/* Header */}
      <div className="relative z-30 flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button
          type="button"
          {...bindInstantHeaderAction("back", goBack)}
          aria-label="Back"
          className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md border border-white/15 grid place-items-center active:scale-95 transition relative z-40 touch-manipulation">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/recharge")}
            className="flex items-center gap-1 h-8 px-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/15 active:scale-95 transition"
            aria-label="Recharge diamonds"
          >
            <Gem className="w-3.5 h-3.5 text-cyan-300" />
            <span className="text-xs font-bold tabular-nums">{effectiveBalance.toLocaleString()}</span>
          </button>
          <button
            type="button"
            {...bindInstantHeaderAction("history", goHistory)}
            aria-label="Call history"
            className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md border border-white/15 grid place-items-center active:scale-95 transition relative z-40 touch-manipulation">
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Radar centerpiece */}
      <div className="relative z-10 flex flex-col items-center justify-center pt-6 pb-8">
        <div className="relative w-[360px] h-[360px] flex items-center justify-center">
          {/* concentric rings, increasing scale + delay */}
          {[0, 0.6, 1.2, 1.8].map((delay, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full border border-white/30"
              style={{ width: 360, height: 360 }}
              animate={{ scale: [0.45, 1], opacity: [0.55, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, delay, ease: "easeOut" }}
            />
          ))}
          {/* static inner rings */}
          <span className="absolute w-[270px] h-[270px] rounded-full border border-white/15" />
          <span className="absolute w-[200px] h-[200px] rounded-full border border-white/20" />
          {/* Centre orb — host photo fills it entirely when hosts are online */}
          <div className="absolute w-[150px] h-[150px] rounded-full overflow-hidden bg-gradient-to-br from-fuchsia-500/30 to-indigo-500/30 backdrop-blur-md border border-white/25 shadow-[inset_0_0_24px_rgba(255,255,255,0.12)] grid place-items-center">
            <AnimatePresence mode="popLayout">
              {centreAvatar && (
                <motion.img
                  key={centreAvatar + (phase === "matched" ? "-matched" : "")}
                  src={centreAvatar}
                  alt=""
                  loading="eager"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                  initial={{ scale: 1.08, opacity: 0 }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                    boxShadow: phase === "matched"
                      ? "0 0 0 3px rgba(16,185,129,0.7), 0 10px 30px -6px rgba(16,185,129,0.4)"
                      : undefined,
                  }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                />
              )}
            </AnimatePresence>
            {/* readable scrim only when photo is showing so count chip pops */}
            {showingHostPhoto && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10 pointer-events-none" />
            )}

            {/* Centre copy — sits inside the orb, never outside it */}
            <div className="relative z-[2] w-full h-full flex flex-col items-center justify-center text-center px-3 pointer-events-none">
              {isSearching ? (
                showingHostPhoto ? (
                  <div className="absolute bottom-3 left-0 right-0 flex flex-col items-center gap-0.5">
                    <span className="text-[11px] font-semibold tabular-nums bg-black/55 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/15">
                      {availableHostsCount} online
                    </span>
                    <span className="text-[10px] text-white/85 tabular-nums">{elapsedSeconds}s</span>
                  </div>
                ) : (
                  <>
                    <div className="text-[13px] font-bold tracking-tight drop-shadow">Matching…</div>
                    <div className="text-[11px] text-white/80 mt-0.5 tabular-nums">{elapsedSeconds}s</div>
                    <div className="text-[10px] text-emerald-200/90 mt-0.5">{availableHostsCount} online</div>
                  </>
                )
              ) : isMatched ? (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                  <span className="text-[11px] font-semibold text-emerald-200 bg-black/55 backdrop-blur-sm px-2 py-0.5 rounded-full border border-emerald-300/40">
                    Connected
                  </span>
                </div>
              ) : isError ? (
                <>
                  <div className="text-[13px] font-bold tracking-tight text-rose-200 drop-shadow">Couldn't start</div>
                  <div className="text-[10px] text-white/70 mt-0.5">Tap retry below</div>
                </>
              ) : showingHostPhoto ? (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                  <span className="text-[11px] font-semibold tabular-nums bg-black/55 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-white/15 shadow">
                    {availableHostsCount} online
                  </span>
                </div>
              ) : (
                <>
                  <div className="text-[14px] font-bold tracking-tight drop-shadow">Tap to Match</div>
                  <div className="text-[10px] text-white/70 mt-0.5">{availableHostsCount} hosts online</div>
                </>
              )}
            </div>
          </div>

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
            onClick={isSearching ? undefined : handleStart}
            disabled={isSearching || isMatched}
            aria-label={isSearching ? "Matching" : isMatched ? "Connected" : "Tap to Match"}
            className="absolute w-[150px] h-[150px] rounded-full bg-transparent disabled:opacity-100"
          />
        </div>




        {/* VIP discount card (right-side floating) */}
        {!isVip && (
          <div className="absolute right-3 top-[150px] flex flex-col items-end gap-1.5">
            <div className="px-2 py-1 rounded-md bg-rose-600/90 text-white text-[10px] font-mono font-bold tracking-wider border border-white/20 shadow-md whitespace-nowrap tabular-nums">
              {fmtClock(vipCountdown)}
            </div>
            <button onClick={() => navigate("/recharge")} aria-label="Up to 60% bonus recharge"
              className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 shadow-[0_10px_28px_-8px_rgba(168,85,247,0.6)] border-2 border-white/30 grid place-items-center active:scale-95 transition">
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
      {/* Bottom CTA — same surface, state-only action change */}
      <div className="relative z-10 px-6 mb-4">
        {isSearching ? (
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={() => onCancel?.()}
              variant="outline"
              className="w-full h-14 rounded-full text-base font-bold border-white/25 bg-white/10 backdrop-blur-md text-white hover:bg-white/20"
            >
              Cancel
            </Button>
          </motion.div>
        ) : isError ? (
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={() => onRetry?.()}
              className="w-full h-14 rounded-full text-base font-bold bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 hover:opacity-95 shadow-[0_14px_40px_-10px_rgba(168,85,247,0.7)] border border-white/20"
            >
              <Phone className="w-5 h-5 mr-2" /> Try again
            </Button>
            {errorMsg && (
              <div className="mt-2 text-center text-[11px] text-rose-200/90 px-4">{errorMsg}</div>
            )}
          </motion.div>
        ) : isMatched ? (
          <Button disabled className="w-full h-14 rounded-full text-base font-bold bg-emerald-500/40 border border-white/15">
            Connected
          </Button>
        ) : (
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              onClick={handleStart}
              className="w-full h-14 rounded-full text-base font-bold bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 hover:opacity-95 shadow-[0_14px_40px_-10px_rgba(168,85,247,0.7)] border border-white/20"
            >
              <Phone className="w-5 h-5 mr-2" /> Start
            </Button>
          </motion.div>
        )}
        {phase === "prep" && (
          <>
            <div className="mt-2 flex flex-col items-center gap-0.5 text-[12px] text-white/85">
              <div className="flex items-center gap-1.5">
                <span className="opacity-70">1st minute</span>
                <Gem className="w-3 h-3 text-cyan-300" />
                <span className="font-bold">{hostRatePerMin.toLocaleString()}</span>
                <span className="opacity-70">· host earns {Math.round(hostRatePerMin / 2).toLocaleString()}</span>
              </div>
              <div className="opacity-70 text-[11px]">After 1 min · host's private-call rate</div>
            </div>
          </>
        )}
        {isSearching && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-white/70">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span>Please behave politely during the chat</span>
          </div>
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
