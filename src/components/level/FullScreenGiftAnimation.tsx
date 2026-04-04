import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Lottie from "lottie-react";
import { LevelBadge } from "@/components/common/LevelBadge";
import { cn } from "@/lib/utils";

// Lazy load animation players
const SVGAPlayerWithAudio = lazy(() => import("@/components/common/SVGAPlayerWithAudio"));
const SVGAPlayer = lazy(() => import("@/components/common/SVGAPlayer"));
const VAPPlayer = lazy(() => import("@/components/common/VAPPlayer"));

interface GiftData {
  id: string;
  name: string;
  icon_url?: string;
  animation_url?: string;
  sound_url?: string;
  coin_value: number;
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

// Sound player for gift animation
const playGiftSound = async (coinValue: number, customSoundUrl?: string) => {
  try {
    if (customSoundUrl) {
      const audio = new Audio(customSoundUrl);
      audio.volume = 0.6;
      await audio.play();
      return;
    }

    // Synthesized celebration sounds based on gift value
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    if (coinValue >= 10000) {
      // Epic celebration - multiple oscillators
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();
      const oscillator3 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      oscillator3.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator1.type = 'sine';
      oscillator2.type = 'triangle';
      oscillator3.type = 'sine';
      oscillator1.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator2.frequency.setValueAtTime(1200, audioContext.currentTime);
      oscillator3.frequency.setValueAtTime(400, audioContext.currentTime);
      oscillator1.frequency.exponentialRampToValueAtTime(1600, audioContext.currentTime + 0.3);
      oscillator2.frequency.exponentialRampToValueAtTime(2400, audioContext.currentTime + 0.3);
      oscillator3.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.3);
      
      gainNode.gain.setValueAtTime(0.35, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
      
      oscillator1.start(audioContext.currentTime);
      oscillator2.start(audioContext.currentTime);
      oscillator3.start(audioContext.currentTime);
      oscillator1.stop(audioContext.currentTime + 0.8);
      oscillator2.stop(audioContext.currentTime + 0.8);
      oscillator3.stop(audioContext.currentTime + 0.8);
    } else if (coinValue >= 1000) {
      // Big celebration
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.15);
      oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.3);
      
      gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
    } else {
      // Simple celebration
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
      
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    }
  } catch (error) {
    console.log('[GiftSound] Error:', error);
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
  const [isVisible, setIsVisible] = useState(true);
  const [lottieData, setLottieData] = useState<object | null>(null);
  const [currentCount, setCurrentCount] = useState(0);
  const soundPlayedRef = useRef(false);
  const [svgaHasAudio, setSvgaHasAudio] = useState(false);
  
  // CRITICAL: Prevent re-initialization on re-renders
  const mountedRef = useRef(true);
  const completedRef = useRef(false);
  const animationStartedRef = useRef(false);

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
  const isPremium = gift.coin_value >= 1000;
  const isLegendary = gift.coin_value >= 10000;
  const isMythic = gift.coin_value >= 50000;

  // =====================================================
  // GIFT DISPLAY POLICY:
  // - PNG/GIF/WebP (Static/Image): Less than 1 second (800ms)
  // - SVGA/Lottie/Video (Animated): Play for full animation duration
  // =====================================================
  const getDuration = () => {
    // Static images: less than 1 second
    if (animationType === 'image' || animationType === 'none') {
      return 800; // 800ms for static images
    }
    
    // Animated gifts (SVGA, Lottie, Video, VAP): play for full duration
    // SVGA will use its own onComplete callback, these are safety fallbacks
    if (isMythic) return 15000; // 15s safety for mythic SVGA
    if (isLegendary) return 12000; // 12s safety for legendary SVGA
    if (isPremium) return 10000; // 10s safety for premium SVGA
    return 8000; // 8s safety for normal SVGA
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
        playGiftSound(gift.coin_value * quantity, gift.sound_url);
      } else if (animationType !== 'svga') {
        playGiftSound(gift.coin_value * quantity);
      }
    }
  }, [gift.coin_value, gift.sound_url, quantity, svgaHasAudio, animationType]);

  // Handle SVGA audio extraction - if SVGA has no audio, use sound_url or synthesized
  const handleSvgaAudioExtracted = useCallback((audioUrl: string | null) => {
    if (audioUrl) {
      setSvgaHasAudio(true);
    } else if (!soundPlayedRef.current) {
      soundPlayedRef.current = true;
      // Fallback: use sound_url from DB or synthesized sound
      playGiftSound(gift.coin_value * quantity, gift.sound_url);
    }
  }, [gift.coin_value, gift.sound_url, quantity]);

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

  // Safety timeout for animations - CRITICAL: Empty deps - run ONLY ONCE on mount
  useEffect(() => {
    mountedRef.current = true;
    
    // CRITICAL: Prevent re-initialization on re-renders
    if (animationStartedRef.current) {
      console.log('[FullScreenGiftAnimation] ⚠️ Already started, skipping re-init');
      return;
    }
    animationStartedRef.current = true;
    
    const timer = setTimeout(() => {
      if (mountedRef.current && !completedRef.current) {
        console.log('[FullScreenGiftAnimation] Safety timeout - dismissing');
        handleAnimationEnd();
      }
    }, getDuration());

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
        <Suspense fallback={<AnimationLoader />}>
          {/* SVGA container - centered, proper size */}
          <div
            className="absolute inset-0 flex items-center justify-center"
          >
            <SVGAPlayerWithAudio
              src={gift.animation_url}
              className="w-full h-full max-w-[90vw] max-h-[90vh]"
              loop={false}
              autoPlay={true}
              volume={0.8}
              onAudioExtracted={handleSvgaAudioExtracted}
              onComplete={handleAnimationEnd}
            />
          </div>
        </Suspense>
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
              muted={false}
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
            className="w-full h-full max-w-[90vw] max-h-[90vh] object-contain"
          />
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
          {/* Background overlay with gradient */}
          <motion.div 
            className={cn(
              "absolute inset-0 bg-gradient-to-br backdrop-blur-sm",
              getBackgroundGradient()
            )}
            style={{ width: '100vw', height: '100vh' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

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
            {/* Main animation container - FULL VIEWPORT for mobile with aggressive scale */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              style={{ 
                width: '100%', 
                height: '100%',
                position: 'fixed',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%) scale(1.6)',
                transformOrigin: 'center center',
              }}
            >
              {/* Glow effect behind animation */}
              <motion.div
                className={cn(
                  "absolute inset-0 rounded-full blur-3xl",
                  isMythic ? "bg-amber-400/40" : isLegendary ? "bg-pink-500/30" : "bg-purple-500/25"
                )}
                style={{
                  width: '80%',
                  height: '80%',
                  left: '10%',
                  top: '10%'
                }}
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.4, 0.7, 0.4]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              {renderAnimation()}
            </motion.div>

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
                    <img 
                      src={senderAvatar} 
                      alt={senderName}
                      className="w-12 h-12 rounded-full border-2 border-white/50 object-cover"
                    />
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
                    <img 
                      src={receiverAvatar} 
                      alt={receiverName}
                      className="w-12 h-12 rounded-full border-2 border-white/50 object-cover"
                    />
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
              <span>{(gift.coin_value * quantity).toLocaleString()} coins</span>
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
