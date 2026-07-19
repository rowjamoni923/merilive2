import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Lottie from "lottie-react";
import { LevelBadge } from "@/components/common/LevelBadge";
import { cn } from "@/lib/utils";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";
import { playSoundUrl } from "@/utils/soundPlayer";
import { isNativeGiftPipelineActive } from "@/utils/nativeAnimRuntime";


// Lazy load remaining specialty players
const SVGAPlayer = lazy(() => import("@/components/common/SVGAPlayer"));
const VAPPlayer = lazy(() => import("@/components/common/VAPPlayer"));

interface GiftData {
  id: string;
  name: string;
  icon_url?: string;
  animation_url?: string;
  sound_url?: string;
  diamond_value: number;
}

interface FullScreenGiftAnimationProps {
  gift: GiftData;
  senderName: string;
  senderAvatar?: string;
  senderLevel?: number;
  receiverName: string;
  receiverAvatar?: string;
  receiverLevel?: number;
  quantity: number;
  onComplete: () => void;
}

// Singleton AudioContext + master limiter — prevents rapid-combo crackle / "broken" sound
let _giftAudioCtx: AudioContext | null = null;
let _giftMasterGain: GainNode | null = null;
let _giftLimiter: DynamicsCompressorNode | null = null;
let _lastGiftSoundAt = 0;

const getGiftAudioCtx = (): { ctx: AudioContext; out: AudioNode } | null => {
  try {
    if (!_giftAudioCtx || _giftAudioCtx.state === 'closed') {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctor) return null;
      _giftAudioCtx = new Ctor();
      // Hard limiter prevents clipping when multiple sounds overlap (combo fire)
      _giftLimiter = _giftAudioCtx.createDynamicsCompressor();
      _giftLimiter.threshold.value = -6;
      _giftLimiter.knee.value = 0;
      _giftLimiter.ratio.value = 20;
      _giftLimiter.attack.value = 0.003;
      _giftLimiter.release.value = 0.1;
      _giftMasterGain = _giftAudioCtx.createGain();
      _giftMasterGain.gain.value = 0.8;
      _giftMasterGain.connect(_giftLimiter);
      _giftLimiter.connect(_giftAudioCtx.destination);
    }
    if (_giftAudioCtx.state === 'suspended') {
      _giftAudioCtx.resume().catch(() => { /* noop */ });
    }
    return { ctx: _giftAudioCtx, out: _giftMasterGain! };
  } catch {
    return null;
  }
};

const playSyntheticChime = (diamondValue: number) => {
  const handle = getGiftAudioCtx();
  if (!handle) return;
  const { ctx, out } = handle;
  const now = ctx.currentTime;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 2400;
  lowpass.Q.value = 0.7;
  lowpass.connect(out);

  const gain = ctx.createGain();
  gain.connect(lowpass);

  const peak = diamondValue >= 10000 ? 0.12 : diamondValue >= 1000 ? 0.09 : 0.07;
  const duration = diamondValue >= 10000 ? 0.7 : diamondValue >= 1000 ? 0.45 : 0.25;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const baseFreq = diamondValue >= 10000 ? 880 : diamondValue >= 1000 ? 660 : 523;
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.linearRampToValueAtTime(baseFreq * 1.5, now + duration * 0.6);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + duration + 0.05);

  // Disconnect on stop to free graph nodes (do NOT close shared context)
  osc.onended = () => {
    try { osc.disconnect(); } catch { /* noop */ }
    try { gain.disconnect(); } catch { /* noop */ }
    try { lowpass.disconnect(); } catch { /* noop */ }
  };
};

// Sound player for gift animation — bulletproof: throttled, limiter-protected, fallback-safe
const playGiftSound = async (diamondValue: number, customSoundUrl?: string) => {
  // Throttle: ignore retriggers within 80ms (prevents combo-stack crackle)
  const nowMs = Date.now();
  if (nowMs - _lastGiftSoundAt < 80) return;
  _lastGiftSoundAt = nowMs;

  if (customSoundUrl) {
    // Pkg422: central player — anti-GC, unlock-aware, limiter-bus.
    // The 80ms throttle above prevents combo-stack crackle even before
    // the per-URL concurrency cap kicks in.
    playSoundUrl(customSoundUrl, { volume: 0.6, maxConcurrent: 2 });
    return;
  }


  try {
    playSyntheticChime(diamondValue);
  } catch (error) {
    console.log('[GiftSound] Synth error:', error);
  }
};

// Level gradient generator
const getLevelGradient = (level: number) => {
  if (level >= 80) return 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)';
  if (level >= 60) return 'linear-gradient(135deg, #E040FB 0%, #7C4DFF 50%, #536DFE 100%)';
  if (level >= 40) return 'linear-gradient(135deg, #00BCD4 0%, #03A9F4 50%, #2196F3 100%)';
  if (level >= 20) return 'linear-gradient(135deg, #4CAF50 0%, #8BC34A 50%, #CDDC39 100%)';
  return 'linear-gradient(135deg, #9E9E9E 0%, #757575 50%, #616161 100%)';
};

const FullScreenGiftAnimation = ({ 
  gift, 
  senderName, 
  senderAvatar,
  senderLevel = 1,
  receiverName, 
  receiverAvatar,
  receiverLevel = 1,
  quantity, 
  onComplete 
}: FullScreenGiftAnimationProps) => {
  // Pkg438 Phase C: when the NativeGiftAnimation pipeline is live on Android,
  // suppress the WebView full-screen render to avoid double-play. The native
  // overlay already played at <50ms via the LiveKit bridge. We still fire
  // onComplete so any caller-side queue advances.
  const skipForNative = isNativeGiftPipelineActive();

  const [isVisible, setIsVisible] = useState(true);
  const [lottieData, setLottieData] = useState<object | null>(null);
  const [currentCount, setCurrentCount] = useState(0);
  const soundPlayedRef = useRef(false);
  const [svgaHasAudio, setSvgaHasAudio] = useState(false);
  
  // CRITICAL: Prevent re-initialization on re-renders
  const mountedRef = useRef(true);
  const completedRef = useRef(false);
  const animationStartedRef = useRef(false);

  useEffect(() => {
    if (skipForNative && !completedRef.current) {
      completedRef.current = true;
      try { onComplete(); } catch { /* ignore */ }
    }
  }, [skipForNative, onComplete]);


  // Detect animation type
  const getAnimationType = (url?: string): 'svga' | 'vap' | 'lottie' | 'video' | 'image' | 'none' => {
    if (!url) return 'none';
    const lower = url.toLowerCase();
    if (lower.endsWith('.svga')) return 'svga';
    if (lower.endsWith('.json')) {
      if (lower.includes('vap') || lower.includes('_bmp')) return 'vap';
      return 'lottie';
    }
    if (lower.endsWith('.mp4') || lower.endsWith('.webm')) {
      if (lower.includes('vap') || lower.includes('_bmp')) return 'vap';
      return 'video';
    }
    if (lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.png')) return 'image';
    return 'image';
  };

  const animationType = getAnimationType(gift.animation_url);
  const isPremium = gift.diamond_value >= 1000;
  const isLegendary = gift.diamond_value >= 10000;
  const isMythic = gift.diamond_value >= 50000;

  // =====================================================
  // GIFT DISPLAY POLICY:
  // - PNG/GIF/WebP (Static/Image): less than 1 second (800ms)
  // - SVGA/Lottie/Video/VAP (Animated): play for the EXACT animation duration.
  //   The player itself fires onComplete the moment the underlying frames
  //   finish (SVGA: frames/FPS, Video: ended event). The timer below is a
  //   pure safety net in case the player never fires onComplete; it must be
  //   long enough that it never cuts a real animation short.
  // =====================================================
  const getDuration = () => {
    if (animationType === 'image' || animationType === 'none') {
      return 800; // 800ms for static images
    }
    // Generous safety net — never trims a real SVGA. Real dismissal is
    // driven by the player's own onComplete callback (exact duration).
    return 60000;
  };

  // Load Lottie data
  useEffect(() => {
    if (animationType === 'lottie' && gift.animation_url) {
      fetch(gift.animation_url)
        .then(res => res.json())
        .then(data => setLottieData(data))
        .catch(err => console.error('Lottie load error:', err));
    }
  }, [gift.animation_url, animationType]);

  // Animate count up
  useEffect(() => {
    const countDuration = Math.min(2000, quantity * 60);
    const steps = Math.min(quantity, 40);
    const interval = countDuration / steps;
    
    let step = 0;
    const countInterval = setInterval(() => {
      step++;
      const progress = step / steps;
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setCurrentCount(Math.floor(quantity * easedProgress));
      
      if (step >= steps) {
        clearInterval(countInterval);
        setCurrentCount(quantity);
      }
    }, interval);

    return () => clearInterval(countInterval);
  }, [quantity]);

  // Play sound once - prefer sound_url from DB, then SVGA embedded, then synthesized
  useEffect(() => {
    if (!soundPlayedRef.current && !svgaHasAudio) {
      soundPlayedRef.current = true;
      if (gift.sound_url) {
        // Use the dedicated sound_url from database
        playGiftSound(gift.diamond_value * quantity, gift.sound_url);
      } else if (animationType !== 'svga') {
        playGiftSound(gift.diamond_value * quantity);
      }
    }
  }, [gift.diamond_value, gift.sound_url, quantity, svgaHasAudio, animationType]);

  // Handle SVGA audio extraction - if SVGA has no audio, use sound_url or synthesized
  const handleSvgaAudioExtracted = useCallback((audioUrl: string | null) => {
    if (audioUrl) {
      setSvgaHasAudio(true);
    } else if (!soundPlayedRef.current) {
      soundPlayedRef.current = true;
      // Fallback: use sound_url from DB or synthesized sound
      playGiftSound(gift.diamond_value * quantity, gift.sound_url);
    }
  }, [gift.diamond_value, gift.sound_url, quantity]);

  // Handle animation complete - dismiss overlay when SVGA finishes - ONLY ONCE
  const handleAnimationEnd = useCallback(() => {
    if (completedRef.current || !mountedRef.current) {
      console.log('[FullScreenGiftAnimation] ⚠️ Complete blocked - already completed');
      return;
    }
    completedRef.current = true;
    
    console.log('[FullScreenGiftAnimation] ✅ Animation complete - dismissing');
    setIsVisible(false);
    setTimeout(onComplete, 200);
  }, [onComplete]);

  // Safety timeout for static images ONLY — animated formats (SVGA/Lottie/Video/VAP)
  // dismiss via the player's own onComplete fired at the EXACT native duration.
  // NO fixed timer is allowed for animated gifts.
  useEffect(() => {
    mountedRef.current = true;

    if (animationStartedRef.current) {
      console.log('[FullScreenGiftAnimation] ⚠️ Already started, skipping re-init');
      return;
    }
    animationStartedRef.current = true;

    // Only static images (PNG/GIF/WebP) need a fixed dismiss timer.
    if (animationType !== 'image' && animationType !== 'none') {
      return () => { mountedRef.current = false; };
    }

    const timer = setTimeout(() => {
      if (mountedRef.current && !completedRef.current) {
        handleAnimationEnd();
      }
    }, 800); // 800ms for static images

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []); // CRITICAL: Empty deps - run only ONCE on mount

  const getBackgroundGradient = () => {
    if (isMythic) return 'from-amber-600/95 via-orange-600/90 to-red-600/95';
    if (isLegendary) return 'from-purple-700/90 via-pink-600/85 to-rose-600/90';
    if (isPremium) return 'from-indigo-600/85 via-purple-600/80 to-fuchsia-600/85';
    return 'from-slate-800/80 via-gray-700/70 to-slate-800/80';
  };

  const renderAnimation = () => {
    // SVGA Animation - Proper sizing without excessive scaling
    if (animationType === 'svga' && gift.animation_url) {
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <FixedAnimationFrame
            src={gift.animation_url}
            type="svga"
            width="100%"
            height="100%"
            className="max-w-[90vw] max-h-[90vh]"
            loop={false}
            muted={false}
            volume={0.8}
            soundUrl={gift.sound_url}
            triggerKey={quantity > 1 ? quantity : undefined}
            onAudioExtracted={handleSvgaAudioExtracted}
            onComplete={handleAnimationEnd}
            center={false}
          />
        </div>
      );
    }

    if (animationType === 'vap' && gift.animation_url) {
      return (
        <Suspense fallback={<AnimationLoader />}>
          <div className="absolute inset-0 flex items-center justify-center">
            <VAPPlayer
              src={gift.animation_url}
              className="w-full h-full max-w-[90vw] max-h-[90vh]"
              loop={false}
              autoPlay={true}
              muted={true}
              onComplete={handleAnimationEnd}
            />
          </div>
        </Suspense>
      );
    }

    if (animationType === 'lottie' && lottieData) {
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <Lottie
            animationData={lottieData}
            loop={false}
            onComplete={handleAnimationEnd}
            className="w-full h-full max-w-[90vw] max-h-[90vh]"
          />
        </div>
      );
    }

    if (animationType === 'video' && gift.animation_url) {
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <video 
            src={gift.animation_url}
            autoPlay
            loop={false}
            muted
            playsInline
            onEnded={handleAnimationEnd}
            className="w-full h-full max-w-[90vw] max-h-[90vh] object-contain"/>
        </div>
      );
    }

    if ((animationType === 'image' && gift.animation_url) || gift.icon_url) {
      return (
        <motion.img 
          src={gift.animation_url || gift.icon_url} 
          alt={gift.name}
          className="w-48 h-48 md:w-64 md:h-64 object-contain"
          animate={{ 
            y: [-10, 10, -10],
            scale: [1, 1.08, 1],
            rotate: [-2, 2, -2]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      );
    }

    return (
      <motion.div 
        className="text-8xl md:text-9xl"
        animate={{ 
          y: [-10, 10, -10],
          scale: [1, 1.1, 1]
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        🎁
      </motion.div>
    );
  };

  if (skipForNative) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[100000] flex flex-col items-center justify-center"
          style={{
            width: '100vw',
            height: '100vh',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          {/* Chamet/Bigo-parity: NO colored tint overlay. The animation plays
              transparently over the room/chat — only the SVGA/VAP/Lottie
              artwork and particles are visible. Previously a per-tier
              amber/pink/purple gradient washed the entire screen in color,
              which is not how professional live-streaming apps render gifts. */}

          {/* Animated particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(isMythic ? 50 : isLegendary ? 40 : 25)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-20px`,
                }}
                animate={{
                  y: ['0vh', '120vh'],
                  x: [0, (Math.random() - 0.5) * 200],
                  rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)],
                  opacity: [0.9, 0],
                }}
                transition={{
                  duration: 3 + Math.random() * 2,
                  delay: Math.random() * 2,
                  repeat: Infinity,
                }}
              >
                {isMythic ? (
                  <div className="w-4 h-4 bg-gradient-to-br from-amber-300 to-yellow-500 rounded-full shadow-lg shadow-amber-500/50" />
                ) : isLegendary ? (
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{
                      backgroundColor: ['#FFD700', '#FF6B6B', '#A855F7', '#4ECDC4', '#FF69B4'][i % 5]
                    }} 
                  />
                ) : (
                  <div 
                    className="w-3 h-3 rounded-full opacity-80"
                    style={{
                      backgroundColor: ['#A855F7', '#EC4899', '#8B5CF6'][i % 3]
                    }} 
                  />
                )}
              </motion.div>
            ))}
          </div>

          {/* Ring burst effect for legendary */}
          {(isLegendary || isMythic) && (
            <motion.div
              className="absolute w-96 h-96 rounded-full"
              style={{
                background: isMythic 
                  ? 'radial-gradient(circle, rgba(255,215,0,0.4) 0%, transparent 70%)' 
                  : 'radial-gradient(circle, rgba(168,85,247,0.3) 0%, transparent 70%)'
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 3, 4],
                opacity: [0, 0.8, 0]
              }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
            />
          )}

          {/* Main content */}
          <motion.div
            initial={{ scale: 0, rotate: -20, y: 100 }}
            animate={{ scale: 1, rotate: 0, y: 0 }}
            exit={{ scale: 0, rotate: 20, y: -100 }}
            transition={{ type: "spring", damping: 12, stiffness: 100 }}
            className="relative z-10 flex flex-col items-center gap-4 p-6"
          >
            {/* Main animation container — centered, contained.
                Chamet/Bigo-parity: the gift artwork sits in a bounded box so
                its background NEVER washes the entire viewport with color.
                Previously scaled 1.6× fixed-position → any opaque artwork
                (e.g. Champagne / Celebration) tinted the whole chat behind
                it. Now the animation is size-capped and floats in place. */}
            <div className="relative flex items-center justify-center w-[min(78vw,420px)] h-[min(58vh,420px)] pointer-events-none">
              {/* Soft glow behind animation (does not wash chat behind overlay) */}
              <motion.div
                className={cn(
                  "absolute inset-8 rounded-full blur-3xl pointer-events-none",
                  isMythic ? "bg-amber-400/25" : isLegendary ? "bg-pink-500/20" : "bg-purple-500/15"
                )}
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.35, 0.6, 0.35]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              {renderAnimation()}
            </div>


            {/* Gift name and count */}
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <motion.h2 
                className={cn(
                  "text-3xl md:text-5xl font-black drop-shadow-lg mb-3",
                  isMythic ? "text-amber-200" : "text-white"
                )}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {gift.name}
              </motion.h2>
              
              {/* Animated count */}
              <motion.div
                className="flex items-center justify-center gap-1"
              >
                <span className="text-white/70 text-2xl">×</span>
                <motion.span
                  key={currentCount}
                  initial={{ scale: 1.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={cn(
                    "text-5xl md:text-6xl font-black",
                    isMythic 
                      ? "bg-gradient-to-b from-amber-200 via-yellow-300 to-orange-400 bg-clip-text text-transparent"
                      : "bg-gradient-to-b from-white via-pink-100 to-pink-200 bg-clip-text text-transparent"
                  )}
                  style={{
                    textShadow: isMythic 
                      ? '0 0 30px rgba(251,191,36,0.7)' 
                      : '0 0 20px rgba(255,255,255,0.5)'
                  }}
                >
                  {currentCount}
                </motion.span>
              </motion.div>
            </motion.div>

            {/* Sender and Receiver info */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-4 mt-2"
            >
              {/* Sender */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  {senderAvatar ? (
                    <img loading="lazy" decoding="async" 
                      src={senderAvatar} 
                      alt={senderName}
                      className="w-12 h-12 rounded-full border-2 border-white/50 object-cover" />
                  ) : (
                    <div 
                      className="w-12 h-12 rounded-full border-2 border-white/50 flex items-center justify-center text-white font-bold"
                      style={{ background: getLevelGradient(senderLevel) }}
                    >
                      {senderName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div 
                    className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
                    style={{ background: getLevelGradient(senderLevel) }}
                  >
                    Lv{senderLevel}
                  </div>
                </div>
                <span className="font-bold text-white text-sm max-w-[80px] truncate">
                  {senderName}
                </span>
              </div>

              {/* Arrow */}
              <motion.div
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                className={cn(
                  "text-2xl",
                  isMythic ? "text-amber-300" : "text-pink-300"
                )}
              >
                →
              </motion.div>

              {/* Receiver */}
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm max-w-[80px] truncate">
                  {receiverName}
                </span>
                <div className="relative">
                  {receiverAvatar ? (
                    <img loading="lazy" decoding="async" 
                      src={receiverAvatar} 
                      alt={receiverName}
                      className="w-12 h-12 rounded-full border-2 border-white/50 object-cover" />
                  ) : (
                    <div 
                      className="w-12 h-12 rounded-full border-2 border-white/50 flex items-center justify-center text-white font-bold"
                      style={{ background: getLevelGradient(receiverLevel) }}
                    >
                      {receiverName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div 
                    className="absolute -bottom-1 -left-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
                    style={{ background: getLevelGradient(receiverLevel) }}
                  >
                    Lv{receiverLevel}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Coin value */}
            <motion.p 
              className={cn(
                "mt-2 font-bold text-xl flex items-center gap-2",
                isMythic ? "text-amber-300" : "text-amber-400"
              )}
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <span>💰</span>
              <span>{(gift.diamond_value * quantity).toLocaleString()} diamonds</span>
            </motion.p>
          </motion.div>

          {/* Firework effects for legendary */}
          {(isLegendary || isMythic) && (
            <>
              {[...Array(16)].map((_, i) => (
                <motion.div
                  key={`firework-${i}`}
                  className="absolute w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: ['#FFD700', '#FF6B6B', '#A855F7', '#4ECDC4'][i % 4],
                    left: '50%',
                    top: '40%',
                  }}
                  initial={{ scale: 0, x: 0, y: 0 }}
                  animate={{
                    x: [0, Math.cos(i * 22.5 * Math.PI / 180) * 250],
                    y: [0, Math.sin(i * 22.5 * Math.PI / 180) * 250],
                    opacity: [1, 0],
                    scale: [0.5, 2, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    delay: 0.5 + (i % 4) * 0.1,
                    repeat: Infinity,
                    repeatDelay: 2,
                  }}
                />
              ))}
            </>
          )}

          {/* Skip button */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            onClick={() => {
              setIsVisible(false);
              onComplete();
            }}
            className={cn(
              "absolute bottom-8 left-1/2 -translate-x-1/2 px-8 py-3 rounded-full font-medium transition-colors pointer-events-auto",
              isMythic 
                ? "bg-amber-500/30 text-amber-100 hover:bg-amber-500/40 border border-amber-400/30"
                : "bg-white/20 text-white hover:bg-white/30 border border-white/20"
            )}
          >
            Skip
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Loading component
const AnimationLoader = () => (
  <div className="flex items-center justify-center w-full h-full">
    <motion.div 
      className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    />
  </div>
);

export default FullScreenGiftAnimation;
