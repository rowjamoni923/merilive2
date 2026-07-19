/**
 * Lucky Wheel — Test Demo
 * 
 * Professional-style fortune wheel for live streaming party rooms.
 * - 8 segment SVG wheel with smooth spin animation
 * - Weighted RNG (house-edge tunable) for realistic RTP
 * - Web Audio API synthesized music + SFX (no external assets)
 * - Real diamond integration via place_game_bet / process_game_win RPC
 * - Win confetti, recent results, multiplier badges
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Diamond, Music2, VolumeX, Volume2, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUserBalance } from "@/hooks/useUserBalance";
import { supabase } from "@/integrations/supabase/client";
import { placeBet, processWin } from "@/services/gameBalanceService";
import { luckyWheelAudio } from "@/features/games/lucky-wheel/luckyWheelAudio";

// ───────────────────────────────────────────────────────────────────────────
// Wheel Configuration — 8 segments, weighted RNG
// ───────────────────────────────────────────────────────────────────────────
type Segment = {
  label: string;
  multiplier: number;
  color: string;
  glow: string;
  weight: number;
  emoji: string;
};

const SEGMENTS: Segment[] = [
  { label: "2x",      multiplier: 2,  color: "#10b981", glow: "#34d399", weight: 28, emoji: "💎" },
  { label: "LOSE",    multiplier: 0,  color: "#475569", glow: "#64748b", weight: 18, emoji: "💀" },
  { label: "3x",      multiplier: 3,  color: "#3b82f6", glow: "#60a5fa", weight: 18, emoji: "⭐" },
  { label: "LOSE",    multiplier: 0,  color: "#475569", glow: "#64748b", weight: 12, emoji: "💀" },
  { label: "5x",      multiplier: 5,  color: "#8b5cf6", glow: "#a78bfa", weight: 12, emoji: "🎁" },
  { label: "LOSE",    multiplier: 0,  color: "#475569", glow: "#64748b", weight: 7,  emoji: "💀" },
  { label: "10x",     multiplier: 10, color: "#f59e0b", glow: "#fbbf24", weight: 4,  emoji: "🔥" },
  { label: "JACKPOT", multiplier: 50, color: "#ef4444", glow: "#f87171", weight: 1,  emoji: "🏆" },
];
const SEG_COUNT = SEGMENTS.length;
const SEG_ANGLE = 360 / SEG_COUNT;
const PRESET_BETS = [100, 500, 1000, 5000, 10000];
const GAME_ID = "lucky-wheel-test";
const GAME_NAME = "Lucky Wheel";

function pickWeightedSegment(): number {
  const total = SEGMENTS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SEGMENTS.length; i++) {
    r -= SEGMENTS[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

// SVG arc helpers
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

// ───────────────────────────────────────────────────────────────────────────
// Confetti particles
// ───────────────────────────────────────────────────────────────────────────
function Confetti({ trigger }: { trigger: number }) {
  if (!trigger) return null;
  const pieces = Array.from({ length: 40 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const duration = 1.6 + Math.random() * 1.2;
        const colors = ["#fbbf24", "#f87171", "#60a5fa", "#34d399", "#a78bfa"];
        const color = colors[i % colors.length];
        return (
          <motion.div
            key={`${trigger}-${i}`}
            initial={{ y: -20, x: `${left}%`, opacity: 1, rotate: 0 }}
            animate={{ y: "110%", opacity: 0, rotate: 720 }}
            transition={{ duration, delay, ease: "easeIn" }}
            className="absolute top-0 w-2 h-3 rounded-sm"
            style={{ backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Main Page
// ───────────────────────────────────────────────────────────────────────────
export default function LuckyWheelTestPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { balance } = useUserBalance();
  const [userId, setUserId] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(500);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [lastResult, setLastResult] = useState<{ seg: Segment; payout: number } | null>(null);
  const [history, setHistory] = useState<Segment[]>([]);
  const [confettiTick, setConfettiTick] = useState(0);
  const [musicOn, setMusicOn] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);
  const tickIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, []);

  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
      luckyWheelAudio.stopBgm();
    };
  }, []);

  // BGM toggle
  useEffect(() => {
    if (musicOn) {
      luckyWheelAudio.resume();
      luckyWheelAudio.startBgm();
    } else {
      luckyWheelAudio.stopBgm();
    }
  }, [musicOn]);

  useEffect(() => {
    luckyWheelAudio.setMasterVolume(sfxOn ? 0.6 : 0);
  }, [sfxOn]);

  const sfx = useCallback((fn: () => void) => {
    if (sfxOn) fn();
  }, [sfxOn]);

  const spin = useCallback(async () => {
    if (spinning) return;
    if (!userId) {
      toast({ title: "Sign in required", description: "Please sign in to play.", variant: "destructive" });
      return;
    }
    if (betAmount > balance) {
      toast({ title: "Insufficient diamonds", description: `You need ${betAmount.toLocaleString()} diamonds.`, variant: "destructive" });
      return;
    }

    luckyWheelAudio.resume();

    // 1) Deduct bet atomically
    const bet = await placeBet(userId, GAME_ID, GAME_NAME, betAmount);
    if (!bet.success) {
      toast({ title: "Bet failed", description: bet.error || "Try again.", variant: "destructive" });
      return;
    }

    setSpinning(true);
    setLastResult(null);
    sfx(() => luckyWheelAudio.spinStart());

    // 2) Pick winning segment
    const winIdx = pickWeightedSegment();
    const winSeg = SEGMENTS[winIdx];

    // 3) Compute target rotation: pointer at top (0°), segment center should land there
    // Segment i covers angles [i*SEG_ANGLE, (i+1)*SEG_ANGLE], center at i*SEG_ANGLE + SEG_ANGLE/2
    // Wheel rotates clockwise; final rotation = -(centerAngle) + N*360 spins + small jitter
    const centerAngle = winIdx * SEG_ANGLE + SEG_ANGLE / 2;
    const jitter = (Math.random() - 0.5) * (SEG_ANGLE * 0.6);
    const extraSpins = 6; // full rotations
    const currentMod = ((rotation % 360) + 360) % 360;
    const targetMod = (360 - centerAngle + jitter + 360) % 360;
    const delta = ((targetMod - currentMod) + 360) % 360;
    const finalRotation = rotation + extraSpins * 360 + delta;
    setRotation(finalRotation);

    // 4) Ticking sound during spin
    if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
    let tickPitch = 1.4;
    tickIntervalRef.current = window.setInterval(() => {
      sfx(() => luckyWheelAudio.tick(tickPitch));
      tickPitch = Math.max(0.6, tickPitch - 0.04);
    }, 90);

    // 5) After animation completes → resolve
    setTimeout(async () => {
      if (tickIntervalRef.current) {
        window.clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }

      const payout = winSeg.multiplier * betAmount;
      if (payout > 0) {
        const wr = await processWin(userId, GAME_ID, GAME_NAME, payout, winSeg.multiplier, winSeg.multiplier >= 50);
        if (wr.success) {
          sfx(() => {
            luckyWheelAudio.win(winSeg.multiplier);
            setTimeout(() => luckyWheelAudio.diamondDrop(), 200);
          });
          setConfettiTick((t) => t + 1);
          toast({
            title: `🎉 You won ${payout.toLocaleString()} diamonds!`,
            description: `${winSeg.label} (${winSeg.multiplier}x)`,
          });
        }
      } else {
        sfx(() => luckyWheelAudio.lose());
        toast({ title: "No luck this time", description: `Lost ${betAmount.toLocaleString()} diamonds. Try again!` });
      }

      setLastResult({ seg: winSeg, payout });
      setHistory((h) => [winSeg, ...h].slice(0, 10));
      setSpinning(false);
    }, 5200);
  }, [spinning, userId, betAmount, balance, rotation, sfx, toast]);

  // Wheel SVG
  const wheel = useMemo(() => {
    const size = 320;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-2xl">
        <defs>
          <radialGradient id="centerGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="60%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
          {SEGMENTS.map((s, i) => (
            <radialGradient key={i} id={`segGrad-${i}`} cx="50%" cy="50%" r="80%">
              <stop offset="0%" stopColor={s.glow} stopOpacity="0.9" />
              <stop offset="100%" stopColor={s.color} stopOpacity="1" />
            </radialGradient>
          ))}
          <filter id="wheelShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {/* Outer rim */}
        <circle cx={cx} cy={cy} r={r + 4} fill="#1e293b" />
        <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="#fbbf24" strokeWidth="2" opacity="0.6" />
        {/* Segments */}
        {SEGMENTS.map((s, i) => {
          const start = i * SEG_ANGLE;
          const end = (i + 1) * SEG_ANGLE;
          const mid = start + SEG_ANGLE / 2;
          const labelPos = polarToCartesian(cx, cy, r * 0.65, mid);
          const emojiPos = polarToCartesian(cx, cy, r * 0.4, mid);
          return (
            <g key={i}>
              <path
                d={arcPath(cx, cy, r, start, end)}
                fill={`url(#segGrad-${i})`}
                stroke="#0f172a"
                strokeWidth="2"
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                fill="white"
                fontSize="14"
                fontWeight="900"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${mid} ${labelPos.x} ${labelPos.y})`}
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
              >
                {s.label}
              </text>
              <text
                x={emojiPos.x}
                y={emojiPos.y}
                fontSize="20"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {s.emoji}
              </text>
            </g>
          );
        })}
        {/* Center hub */}
        <circle cx={cx} cy={cy} r={32} fill="url(#centerGrad)" stroke="#0f172a" strokeWidth="3" />
        <circle cx={cx} cy={cy} r={8} fill="#1e293b" />
      </svg>
    );
  }, []);

  const canSpin = !spinning && !!userId && betAmount <= balance && betAmount > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 text-white relative overflow-hidden">
      {/* Animated background glow */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative max-w-md mx-auto px-4 pt-4 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur transition"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-black bg-gradient-to-r from-amber-300 to-orange-500 bg-clip-text text-transparent flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            LUCKY WHEEL
            <Sparkles className="w-5 h-5 text-amber-400" />
          </h1>
          <div className="flex gap-1">
            <button
              onClick={() => setMusicOn((v) => !v)}
              className={`p-2 rounded-full backdrop-blur transition ${musicOn ? "bg-amber-500/30 text-amber-300" : "bg-white/10 hover:bg-white/20"}`}
              aria-label="Toggle music"
            >
              <Music2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSfxOn((v) => !v)}
              className={`p-2 rounded-full backdrop-blur transition ${sfxOn ? "bg-amber-500/30 text-amber-300" : "bg-white/10 hover:bg-white/20"}`}
              aria-label="Toggle SFX"
            >
              {sfxOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Balance */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600/40 to-purple-600/40 rounded-full border border-cyan-400/50 backdrop-blur">
            <Diamond className="w-5 h-5 text-cyan-300" />
            <span className="text-cyan-100 font-black text-lg tabular-nums">{balance.toLocaleString()}</span>
          </div>
        </div>

        {/* Wheel */}
        <div className="relative flex items-center justify-center mb-4">
          <Confetti trigger={confettiTick} />
          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10" style={{ transform: "translate(-50%, -8px)" }}>
            <div className="w-0 h-0 border-l-[14px] border-r-[14px] border-t-[28px] border-l-transparent border-r-transparent border-t-amber-400 drop-shadow-lg" />
            <div className="w-3 h-3 bg-amber-400 rounded-full mx-auto -mt-1 ring-2 ring-amber-200" />
          </div>
          {/* Spinning wheel */}
          <motion.div
            animate={{ rotate: rotation }}
            transition={{ duration: spinning ? 5 : 0, ease: [0.17, 0.67, 0.21, 0.99] }}
            style={{ transformOrigin: "center" }}
          >
            {wheel}
          </motion.div>
        </div>

        {/* Last result */}
        <AnimatePresence mode="wait">
          {lastResult && !spinning && (
            <motion.div
              key={confettiTick}
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className={`text-center mb-3 p-3 rounded-xl backdrop-blur ${
                lastResult.payout > 0
                  ? "bg-gradient-to-r from-emerald-500/30 to-amber-500/30 border border-amber-400/50"
                  : "bg-red-900/30 border border-red-400/30"
              }`}
            >
              {lastResult.payout > 0 ? (
                <div className="flex items-center justify-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-300" />
                  <span className="font-black text-amber-200">
                    +{lastResult.payout.toLocaleString()} ({lastResult.seg.multiplier}x {lastResult.seg.label})
                  </span>
                </div>
              ) : (
                <span className="font-bold text-red-300">No win — try again!</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bet selector */}
        <div className="mb-3">
          <div className="text-center text-white/60 text-xs mb-2 font-medium">SELECT YOUR BET</div>
          <div className="grid grid-cols-5 gap-2">
            {PRESET_BETS.map((amt) => {
              const active = betAmount === amt;
              const disabled = amt > balance || spinning;
              return (
                <button
                  key={amt}
                  onClick={() => !disabled && setBetAmount(amt)}
                  disabled={disabled}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    active
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/50 scale-105"
                      : disabled
                        ? "bg-white/5 text-white/30 cursor-not-allowed"
                        : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}
                >
                  {amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Spin button */}
        <motion.button
          whileTap={canSpin ? { scale: 0.96 } : {}}
          onClick={spin}
          disabled={!canSpin}
          className={`w-full py-4 rounded-2xl font-black text-lg tracking-wider transition-all ${
            canSpin
              ? "bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white shadow-xl shadow-amber-500/40 hover:shadow-amber-500/60"
              : "bg-white/10 text-white/40 cursor-not-allowed"
          }`}
        >
          {spinning ? "SPINNING..." : `SPIN  •  ${betAmount.toLocaleString()} 💎`}
        </motion.button>

        {/* History */}
        {history.length > 0 && (
          <div className="mt-5">
            <div className="text-white/60 text-xs mb-2 font-medium text-center">RECENT</div>
            <div className="flex gap-1.5 justify-center flex-wrap">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="px-2 py-1 rounded-md text-[10px] font-black"
                  style={{ backgroundColor: h.color, color: "white", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                >
                  {h.emoji} {h.label}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 text-center text-white/40 text-[10px]">
          Test demo • Diamond economy active • Synthesized audio (no external assets)
        </div>
      </div>
    </div>
  );
}
