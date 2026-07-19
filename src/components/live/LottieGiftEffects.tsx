import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Lottie from "lottie-react";
import { cn } from "@/lib/utils";

// Lottie animation data for gifts (inline JSON animations)
const heartBurstAnimation = {
  v: "5.7.4",
  fr: 60,
  ip: 0,
  op: 90,
  w: 200,
  h: 200,
  nm: "Heart Burst",
  ddd: 0,
  assets: [],
  layers: [
    {
      ind: 1,
      ty: 4,
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [100] }, { t: 60, s: [100] }, { t: 90, s: [0] }] },
        r: { a: 1, k: [{ t: 0, s: [0] }, { t: 45, s: [15] }, { t: 90, s: [-15] }] },
        p: { a: 0, k: [100, 100] },
        s: { a: 1, k: [{ t: 0, s: [0, 0] }, { t: 20, s: [150, 150] }, { t: 60, s: [120, 120] }, { t: 90, s: [80, 80] }] }
      },
      shapes: [
        {
          it: [
            {
                a: 0,
                k: {
                  c: true,
                  i: [[0, 0], [-8, 0], [0, 10], [10, 0], [0, 10], [8, 0]],
                }
              }
            },
            { ty: "fl", c: { a: 0, k: [1, 0.4, 0.6, 1] } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }
          ]
        }
      ]
    }
  ]
};

const starShowerAnimation = {
  v: "5.7.4",
  fr: 60,
  ip: 0,
  op: 120,
  w: 300,
  h: 400,
  nm: "Star Shower",
  ddd: 0,
  assets: [],
  layers: Array.from({ length: 8 }).map((_, i) => ({
    ind: i + 1,
    ty: 4,
    sr: 1,
    ks: {
      o: { a: 1, k: [{ t: i * 10, s: [0] }, { t: i * 10 + 10, s: [100] }, { t: 100, s: [100] }, { t: 120, s: [0] }] },
      r: { a: 1, k: [{ t: 0, s: [0] }, { t: 120, s: [720] }] },
      p: { 
        a: 1, 
        k: [
          { t: i * 10, s: [50 + (i % 4) * 50, -20] },
          { t: 120, s: [50 + (i % 4) * 50, 420] }
        ]
      },
      s: { a: 0, k: [50 + (i % 3) * 20, 50 + (i % 3) * 20] }
    },
    shapes: [
      {
        it: [
          { ty: "sr", pt: { a: 0, k: 5 }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 }, ir: { a: 0, k: 10 }, or: { a: 0, k: 25 } },
          { ty: "fl", c: { a: 0, k: [1, 0.85, 0, 1] } },
          { ty: "tr", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }
        ]
      }
    ]
  }))
};

const confettiExplosionAnimation = {
  v: "5.7.4",
  fr: 60,
  ip: 0,
  op: 90,
  w: 400,
  h: 400,
  nm: "Confetti",
  ddd: 0,
  assets: [],
  layers: Array.from({ length: 20 }).map((_, i) => {
    const angle = (i / 20) * Math.PI * 2;
    const distance = 100 + Math.random() * 80;
    const colors = [[1, 0.4, 0.7, 1], [0.4, 0.8, 1, 1], [1, 0.9, 0.3, 1], [0.6, 1, 0.5, 1], [1, 0.6, 0.3, 1]];
    return {
      ind: i + 1,
      ty: 4,
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [0] }, { t: 10, s: [100] }, { t: 70, s: [100] }, { t: 90, s: [0] }] },
        r: { a: 1, k: [{ t: 0, s: [0] }, { t: 90, s: [360 + Math.random() * 360] }] },
        p: { 
          a: 1, 
          k: [
            { t: 0, s: [200, 200] },
            { t: 30, s: [200 + Math.cos(angle) * distance, 200 + Math.sin(angle) * distance] },
            { t: 90, s: [200 + Math.cos(angle) * distance * 1.5, 350] }
          ]
        },
        s: { a: 1, k: [{ t: 0, s: [0, 0] }, { t: 15, s: [100, 100] }, { t: 90, s: [60, 60] }] }
      },
      shapes: [
        {
          it: [
            { ty: "rc", d: 1, s: { a: 0, k: [10, 15] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 2 } },
            { ty: "fl", c: { a: 0, k: colors[i % colors.length] } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }
          ]
        }
      ]
    };
  })
};

const crownGlowAnimation = {
  v: "5.7.4",
  fr: 60,
  ip: 0,
  op: 120,
  w: 200,
  h: 200,
  nm: "Crown",
  ddd: 0,
  assets: [],
  layers: [
    {
      ind: 1,
      ty: 4,
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [0] }, { t: 30, s: [60] }, { t: 90, s: [60] }, { t: 120, s: [0] }] },
        p: { a: 0, k: [100, 100] },
        s: { a: 1, k: [{ t: 0, s: [80, 80] }, { t: 60, s: [120, 120] }, { t: 120, s: [80, 80] }] }
      },
      shapes: [
        {
          it: [
            { ty: "el", s: { a: 0, k: [100, 100] }, p: { a: 0, k: [0, 0] } },
            { ty: "fl", c: { a: 0, k: [1, 0.8, 0.2, 1] } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }
          ]
        }
      ]
    },
    {
        r: { a: 1, k: [{ t: 0, s: [-10] }, { t: 60, s: [10] }, { t: 120, s: [-10] }] },
      },
        {
            {
                a: 0,
                k: {
                  c: true,
                  i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                }
              }
            },
            { ty: "fl", c: { a: 0, k: [1, 0.75, 0, 1] } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }
          ]
        }
      ]
    }
  ]
};

const rocketLaunchAnimation = {
  v: "5.7.4",
  fr: 60,
  ip: 0,
  op: 120,
  w: 200,
  h: 400,
  nm: "Rocket",
  ddd: 0,
  assets: [],
  layers: [
    // Smoke trail
    ...Array.from({ length: 10 }).map((_, i) => ({
      ind: i + 1,
      ty: 4,
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: i * 5, s: [0] }, { t: i * 5 + 10, s: [50] }, { t: i * 5 + 50, s: [0] }] },
        p: { a: 1, k: [{ t: i * 5, s: [100, 350 - i * 30] }, { t: 120, s: [100 + (Math.random() - 0.5) * 40, 400] }] },
        s: { a: 1, k: [{ t: i * 5, s: [30, 30] }, { t: i * 5 + 50, s: [80, 80] }] }
      },
      shapes: [
        {
          it: [
            { ty: "el", s: { a: 0, k: [30, 30] }, p: { a: 0, k: [0, 0] } },
            { ty: "fl", c: { a: 0, k: [0.8, 0.8, 0.8, 1] } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }
          ]
        }
      ]
    })),
    // Rocket body
    {
      },
        {
            {
                a: 0,
                k: {
                  c: true,
                  i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                }
              }
            },
            { ty: "fl", c: { a: 0, k: [0.9, 0.3, 0.3, 1] } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }
          ]
        }
      ]
    }
  ]
};

const diamondSparkleAnimation = {
  v: "5.7.4",
  fr: 60,
  ip: 0,
  op: 120,
  w: 200,
  h: 200,
  nm: "Diamond",
  ddd: 0,
  assets: [],
  layers: [
    // Sparkles around diamond
    ...Array.from({ length: 8 }).map((_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      return {
        ind: i + 1,
        ty: 4,
        sr: 1,
        ks: {
          o: { a: 1, k: [{ t: i * 8, s: [0] }, { t: i * 8 + 15, s: [100] }, { t: i * 8 + 40, s: [0] }] },
          r: { a: 1, k: [{ t: 0, s: [0] }, { t: 120, s: [360] }] },
          p: { a: 0, k: [100 + Math.cos(angle) * 60, 100 + Math.sin(angle) * 60] },
          s: { a: 1, k: [{ t: i * 8, s: [0, 0] }, { t: i * 8 + 15, s: [100, 100] }, { t: i * 8 + 40, s: [0, 0] }] }
        },
        shapes: [
          {
            it: [
              { ty: "sr", pt: { a: 0, k: 4 }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 }, ir: { a: 0, k: 3 }, or: { a: 0, k: 10 } },
              { ty: "fl", c: { a: 0, k: [0.4, 0.9, 1, 1] } },
              { ty: "tr", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }
            ]
          }
        ]
      };
    }),
    // Diamond shape
    {
      },
        {
            {
                a: 0,
                k: {
                  c: true,
                  i: [[0, 0], [0, 0], [0, 0], [0, 0]],
                }
              }
            },
            { ty: "fl", c: { a: 0, k: [0.3, 0.85, 1, 1] } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } }
          ]
        }
      ]
    }
  ]
};

// Animation data map by gift type
export const giftAnimations: Record<string, object> = {
  heart: heartBurstAnimation,
  star: starShowerAnimation,
  sparkles: confettiExplosionAnimation,
  gem: diamondSparkleAnimation,
  crown: crownGlowAnimation,
  rocket: rocketLaunchAnimation,
  flame: confettiExplosionAnimation,
  zap: starShowerAnimation,
  diamond: diamondSparkleAnimation,
  gift: confettiExplosionAnimation,
};

interface LottieGiftAnimationProps {
  giftType: string;
  giftName: string;
  senderName: string;
  diamondAmount: number;
  count?: number;
  onComplete: () => void;
}

export const LottieGiftAnimation = ({
  giftType,
  giftName,
  senderName,
  diamondAmount,
  count = 1,
  onComplete,
}: LottieGiftAnimationProps) => {
  const [isVisible, setIsVisible] = useState(true);

  // =====================================================
  // GIFT DISPLAY POLICY: Lottie plays for its full duration
  // Since Lottie animations are animated, let them play fully
  // =====================================================
  useEffect(() => {
    // Lottie animations play for their natural duration (around 2-3 seconds typically)
    // Using 2500ms as the display time for Lottie (let animation complete)
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 300);
    }, 2500); // Lottie animations get their full play time
    return () => clearTimeout(timer);
  }, [onComplete]);

  const animationData = giftAnimations[giftType] || confettiExplosionAnimation;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Background overlay with glow */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-transparent via-pink-500/10 to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0] }}
            transition={{ duration: 2, repeat: 1 }}
          />

          {/* Multiple Lottie animations for more impact */}
          <div className="relative w-full h-full">
            {/* Center animation */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Lottie
                animationData={animationData}
                loop={false}
                style={{ width: 300, height: 300 }}
              />
            </div>

            {/* Side animations for high-value gifts */}
            {diamondAmount >= 500 && (
              <>
                <div className="absolute left-10 top-1/3">
                  <Lottie
                    animationData={starShowerAnimation}
                    loop={false}
                    style={{ width: 150, height: 200 }}
                  />
                </div>
                <div className="absolute right-10 top-1/3">
                  <Lottie
                    animationData={starShowerAnimation}
                    loop={false}
                    style={{ width: 150, height: 200 }}
                  />
                </div>
              </>
            )}

            {/* Extra confetti for premium gifts */}
            {diamondAmount >= 1000 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Lottie
                  animationData={confettiExplosionAnimation}
                  loop={false}
                  style={{ width: 400, height: 400 }}
                />
              </div>
            )}
          </div>

          {/* Gift notification banner */}
          <motion.div
            className="absolute top-1/4 left-1/2 -translate-x-1/2"
            initial={{ opacity: 0, y: -50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.8 }}
            transition={{ type: "spring", damping: 15 }}
          >
            <div className="bg-gradient-to-r from-pink-500/95 via-purple-500/95 to-indigo-500/95 backdrop-blur-xl rounded-2xl px-8 py-5 flex items-center gap-5 shadow-2xl border border-white/30">
              {/* Animated gift icon */}
              <motion.div
                className="relative"
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 10, -10, 0],
                }}
                transition={{ duration: 0.5, repeat: 3 }}
              >
                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
                  <span className="text-4xl">{getGiftEmoji(giftType)}</span>
                </div>
                {count > 1 && (
                  <motion.div
                    className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    x{count}
                  </motion.div>
                )}
              </motion.div>

              <div className="text-white">
                <motion.p
                  className="font-bold text-xl"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {senderName}
                </motion.p>
                <motion.p
                  className="text-white/80 text-base"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  sent {count > 1 ? `${count}x ` : ""}{giftName}!
                </motion.p>
              </div>

              <motion.div
                className="flex items-center gap-2 bg-amber-500/30 rounded-full px-4 py-2"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, type: "spring" }}
              >
                <span className="text-2xl">🪙</span>
                <span className="text-amber-300 font-bold text-xl">
                  {(diamondAmount * count).toLocaleString()}
                </span>
              </motion.div>
            </div>
          </motion.div>

          {/* Floating particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                className={cn(
                  "absolute w-3 h-3 rounded-full",
                  i % 5 === 0 ? "bg-pink-400" :
                  i % 5 === 1 ? "bg-purple-400" :
                  i % 5 === 2 ? "bg-yellow-400" :
                  i % 5 === 3 ? "bg-cyan-400" : "bg-green-400"
                )}
                initial={{
                  x: Math.random() * window.innerWidth,
                  y: window.innerHeight + 50,
                }}
                animate={{
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 2 + Math.random() * 2,
                  delay: i * 0.1,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Helper to get emoji for gift type
const getGiftEmoji = (giftType: string): string => {
  const emojiMap: Record<string, string> = {
    heart: "❤️",
    star: "⭐",
    sparkles: "✨",
    gem: "💎",
    crown: "👑",
    rocket: "🚀",
    flame: "🔥",
    zap: "⚡",
    diamond: "💠",
    gift: "🎁",
  };
  return emojiMap[giftType] || "🎁";
};

export default LottieGiftAnimation;
