import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Crown, Sparkles, Gem, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDailyLoginReward } from "@/hooks/useDailyLoginReward";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { motion } from "framer-motion";
import treasureChest3D from "@/assets/rewards/treasure-chest-3d.png";

/**
 * Ultra-Premium HD Daily Login Reward Popup — LIGHT THEME
 * Matches app's white surface, with rich amber + slate text for high contrast.
 */
const DailyLoginPopup = () => {
  const {
    rewardDays,
    streak,
    canClaimToday,
    claiming,
    showPopup,
    setShowPopup,
    todayReward,
    claimReward,
  } = useDailyLoginReward();

  if (!showPopup || !canClaimToday) return null;

  const currentDay = (streak.current_streak % 7) + 1;

  return (
    <Dialog open={showPopup} onOpenChange={setShowPopup}>
      <DialogContent className="bg-transparent border-0 shadow-none max-w-[376px] mx-auto p-0 overflow-visible [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Daily Login Reward</DialogTitle></VisuallyHidden>

        <motion.div
          initial={{ scale: 0.7, opacity: 0, y: 50, rotateX: 18 }}
          animate={{ scale: 1, opacity: 1, y: 0, rotateX: 0 }}
          transition={{ type: "spring", damping: 19, stiffness: 220 }}
          className="relative"
          style={{ perspective: 1400, transformStyle: "preserve-3d" }}
        >
          {/* === Outer ambient halo === */}
          <div className="pointer-events-none absolute -inset-12 opacity-90">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.28),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.18),transparent_55%)]" />
          </div>

          {/* === Conic gilded frame === */}
          <div
            className="relative rounded-[30px] p-[1.5px]"
            style={{
              background:
                "conic-gradient(from 140deg at 50% 50%, #fde68a 0deg, #b45309 70deg, #fbbf24 130deg, #92400e 200deg, #fde68a 260deg, #d97706 320deg, #fde68a 360deg)",
              boxShadow:
                "0 30px 60px -20px rgba(180,83,9,0.35), 0 0 0 1px rgba(251,191,36,0.35), 0 0 80px rgba(245,158,11,0.22)",
            }}
          >
            {/* === Pearl white body === */}
            <div
              className="relative rounded-[28px] overflow-hidden"
              style={{
                background:
                  "radial-gradient(120% 80% at 50% 0%, #ffffff 0%, #fff8ec 50%, #fef3e0 100%)",
              }}
            >
              {/* Inner top sheen */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/80 to-transparent" />
              {/* Soft warm vignette */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_120%,rgba(245,158,11,0.10),transparent_60%)]" />

              {/* Soft color blooms */}
              <div className="pointer-events-none absolute -top-24 -left-16 w-64 h-64 bg-amber-300/40 rounded-full blur-[70px]" />
              <div className="pointer-events-none absolute -bottom-24 -right-16 w-64 h-64 bg-fuchsia-300/30 rounded-full blur-[70px]" />
              <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-48 h-48 bg-cyan-200/30 rounded-full blur-[60px]" />

              {/* Floating particles */}
              {[...Array(14)].map((_, i) => (
                <motion.span
                  key={i}
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    left: `${5 + (i * 7) % 90}%`,
                    top: `${8 + (i * 11) % 70}%`,
                    width: i % 3 === 0 ? 2.5 : 1.5,
                    height: i % 3 === 0 ? 2.5 : 1.5,
                    background:
                      ["#f59e0b", "#d97706", "#a855f7", "#06b6d4", "#ec4899"][i % 5],
                    boxShadow: "0 0 8px currentColor",
                    color: ["#f59e0b", "#d97706", "#a855f7", "#06b6d4", "#ec4899"][i % 5],
                  }}
                  animate={{
                    y: [0, -14 - (i % 5) * 4, 0],
                    opacity: [0.25, 0.95, 0.25],
                    scale: [0.6, 1.2, 0.6],
                  }}
                  transition={{
                    duration: 2.4 + (i % 4) * 0.6,
                    repeat: Infinity,
                    delay: (i % 7) * 0.3,
                    ease: "easeInOut",
                  }}
                />
              ))}

              {/* === Close === */}
              <button
                onClick={() => setShowPopup(false)}
                aria-label="Close"
                className="absolute top-3.5 right-3.5 z-30 w-8 h-8 rounded-full grid place-items-center text-slate-500 hover:text-slate-900 transition-all"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(254,243,224,0.7))",
                  border: "1px solid rgba(180,83,9,0.18)",
                  backdropFilter: "blur(10px)",
                }}
              >
                ✕
              </button>

              {/* ===================== HERO ===================== */}
              <div className="relative pt-7 pb-3 px-6 text-center">
                {/* Premium ribbon */}
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-3"
                  style={{
                    background:
                      "linear-gradient(180deg, #fff7d6, #fde68a)",
                  }}
                >
                  <Sparkles className="w-3 h-3 text-amber-700" />
                  <span className="text-[10px] font-extrabold tracking-[0.22em] uppercase text-amber-900">
                    Premium Daily Reward
                  </span>
                </motion.div>

                {/* === 3D Treasure Hero === */}
                <div className="relative mx-auto" style={{ width: 200, height: 168 }}>
                  {/* Pedestal glow */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-44 h-6 rounded-[50%] bg-amber-400/45 blur-2xl" />
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-2 w-32 h-3 rounded-[50%] bg-amber-300/55 blur-md" />

                  {/* Orbiting halo ring */}
                  <motion.div
                    className="absolute inset-0"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 text-amber-500 drop-shadow-[0_0_10px_rgba(251,191,36,0.95)]" />
                    <Sparkles className="absolute top-1/2 -right-2 -translate-y-1/2 w-3 h-3 text-cyan-500 drop-shadow-[0_0_8px_rgba(6,182,212,0.9)]" />
                    <Sparkles className="absolute top-1/2 -left-2 -translate-y-1/2 w-3 h-3 text-fuchsia-500 drop-shadow-[0_0_8px_rgba(232,121,249,0.9)]" />
                  </motion.div>

                  {/* Floating chest */}
                  <motion.img
                    src={treasureChest3D}
                    alt="Treasure chest"
                    width={400}
                    height={400}
                    className="relative z-10 mx-auto w-[180px] h-[180px] object-contain"
                    style={{
                      filter:
                        "drop-shadow(0 14px 22px rgba(120,53,15,0.30)) drop-shadow(0 0 28px rgba(245,158,11,0.55))",
                    }}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
                  />

                  {/* Diamond burst */}
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={`burst-${i}`}
                      className="absolute left-1/2 top-[42%] z-20"
                      animate={{
                        x: [(i - 2.5) * 3, (i - 2.5) * 26],
                        rotate: [0, (i - 2.5) * 25],
                      }}
                      transition={{
                      }}
                    >
                      <Diamond3DIcon size={i % 2 ? 14 : 18} />
                    </motion.div>
                  ))}
                </div>

                {/* Title */}
                <h2 className="mt-1 text-[30px] font-black leading-none tracking-tight">
                  <span
                    className="bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(180deg, #f59e0b 0%, #d97706 45%, #92400e 100%)",
                      WebkitTextStroke: "0.4px rgba(120,53,15,0.20)",
                      filter: "drop-shadow(0 2px 6px rgba(245,158,11,0.30))",
                    }}
                  >
                    Daily Reward
                  </span>
                </h2>
                <p className="mt-1 text-[11px] text-slate-600 tracking-wider font-medium">
                  Sign in every day to climb the streak
                </p>

                {/* Pills */}
                <div className="flex items-center justify-center gap-2 mt-3">
                  <span
                    className="text-[10px] font-extrabold tracking-wider px-3 py-1 rounded-full text-amber-900"
                    style={{
                      background:
                        "linear-gradient(180deg, #fef3c7, #fde68a)",
                    }}
                  >
                    DAY {currentDay} / 7
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-extrabold tracking-wider px-3 py-1 rounded-full text-orange-900"
                    style={{
                      background:
                        "linear-gradient(180deg, #ffedd5, #fed7aa)",
                    }}
                  >
                    <Flame className="w-3 h-3 text-orange-600" />
                    {streak.current_streak} STREAK
                  </span>
                </div>
              </div>

              {/* ===================== 7-DAY GRID ===================== */}
              <div className="grid grid-cols-7 gap-1.5 px-4 pt-4 pb-3">
                {rewardDays.map((day, i) => {
                  const isToday = day.day_number === currentDay;
                  const isPast = day.day_number < currentDay;
                  const isClaimed = day.is_claimed || isPast;
                  const isDay7 = day.day_number === 7;

                  return (
                    <motion.div
                      key={day.day_number}
                      initial={{ opacity: 0, scale: 0.5, y: 14 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ delay: 0.28 + i * 0.05, type: "spring", damping: 16 }}
                      className={cn(
                        "relative flex flex-col items-center justify-between py-2.5 px-0.5 rounded-2xl overflow-hidden",
                        isToday ? "scale-[1.06]" : ""
                      )}
                      style={{
                        background: isToday
                          ? "linear-gradient(180deg, #fde68a 0%, #fbbf24 100%)"
                          : isClaimed
                          ? "linear-gradient(180deg, #d1fae5 0%, #a7f3d0 100%)"
                          : "linear-gradient(180deg, #ffffff 0%, #fff8ec 100%)",
                          ? "1px solid rgba(180,83,9,0.45)"
                          : isClaimed
                          ? "1px solid rgba(5,150,105,0.35)"
                          : "1px solid rgba(180,83,9,0.15)",
                          ? "0 8px 22px -8px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.7)"
                          : "inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 6px rgba(180,83,9,0.06)",
                      }}
                    >
                      {isToday && (
                        <motion.span
                          className="absolute -top-px left-1/2 -translate-x-1/2 w-7 h-1 rounded-full"
                          style={{
                            background:
                              "linear-gradient(90deg, transparent, #b45309, #92400e, #b45309, transparent)",
                          }}
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.6, repeat: Infinity }}
                        />
                      )}

                      <span
                        className={cn(
                          "text-[8px] font-extrabold uppercase tracking-[0.18em]",
                          isToday
                            ? "text-amber-900"
                            : isClaimed
                            ? "text-emerald-800"
                            : "text-slate-500"
                        )}
                      >
                        D{day.day_number}
                      </span>

                      <div className="my-1.5 relative grid place-items-center h-7">
                        {isClaimed && !isToday ? (
                          <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            className="w-6 h-6 rounded-full grid place-items-center"
                            style={{
                              background:
                                "linear-gradient(180deg, #34d399, #059669)",
                              boxShadow:
                                "0 4px 10px rgba(16,185,129,0.45), inset 0 1px 0 rgba(255,255,255,0.5)",
                            }}
                          >
                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                          </motion.div>
                        ) : isDay7 ? (
                          <motion.div
                            animate={{ rotate: [0, -6, 6, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                          >
                            <Crown
                              className="w-6 h-6 text-amber-600 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]"
                              fill="currentColor"
                            />
                          </motion.div>
                        ) : (
                          <Diamond3DIcon size={22} />
                        )}
                      </div>

                      <span
                        className={cn(
                          "text-[10px] font-black tabular-nums tracking-wide",
                          isToday
                            ? "text-amber-950"
                            : isClaimed
                            ? "text-emerald-900"
                            : "text-slate-700"
                        )}
                      >
                        {day.reward_diamonds}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {/* ===================== TODAY DETAIL ===================== */}
              {todayReward && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.65 }}
                  className="mx-4 mb-4 relative overflow-hidden rounded-2xl"
                  style={{
                    background:
                      "linear-gradient(135deg, #fff7d6 0%, #fef3c7 55%, #ffedd5 100%)",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 24px -12px rgba(120,53,15,0.18)",
                  }}
                >
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)",
                    }}
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  />

                  <div className="relative z-10 flex items-center justify-between p-3.5">
                    <div className="min-w-0">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.24em] text-amber-800 mb-1.5">
                        Today's Reward
                      </p>
                      <div className="flex items-center gap-2">
                        <div
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                          style={{
                            background:
                              "linear-gradient(180deg, #ffffff, #fef3c7)",
                          }}
                        >
                          <Diamond3DIcon size={20} />
                          <span className="text-xl font-black text-amber-950 tabular-nums">
                            {todayReward.reward_diamonds}
                          </span>
                        </div>
                        {todayReward.reward_diamonds > 0 && (
                          <div
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl"
                            style={{
                              background:
                                "linear-gradient(180deg, #ffffff, #cffafe)",
                            }}
                          >
                            <Gem className="w-4 h-4 text-cyan-600" />
                            <span className="text-lg font-black text-cyan-900 tabular-nums">
                              +{todayReward.reward_diamonds}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <motion.div
                      animate={{ y: [0, -4, 0], rotate: [0, 6, -6, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="shrink-0"
                    >
                      <img loading="lazy" decoding="async"
                        src={treasureChest3D}
                        alt=""
                        width={96}
                        height={96}
                        className="w-12 h-12 object-contain"
                        style={{
                          filter:
                            "drop-shadow(0 6px 10px rgba(120,53,15,0.30)) drop-shadow(0 0 14px rgba(245,158,11,0.55))",
                        }}
 />
                    </motion.div>
                  </div>
                </motion.div>
              )}

              {/* ===================== CLAIM BUTTON ===================== */}
              <div className="px-4 pb-6">
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.85 }}
                >
                  <Button
                    onClick={claimReward}
                    disabled={claiming}
                    className="group w-full h-14 text-[15px] font-black tracking-wider rounded-2xl border-0 relative overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(180deg, #fde68a 0%, #f59e0b 38%, #b45309 100%)",
                      boxShadow:
                        "0 14px 34px -10px rgba(245,158,11,0.65), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 0 rgba(120,53,15,0.55)",
                    }}
                  >
                    {/* Top gloss */}
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/40 to-transparent" />
                    {/* Shimmer sweep */}
                    <motion.span
                      className="pointer-events-none absolute inset-y-0 w-1/3"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
                      }}
                      animate={{ x: ["-120%", "320%"] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: "linear", repeatDelay: 0.8 }}
                    />

                    {claiming ? (
                      <span className="relative z-10 flex items-center justify-center gap-2 text-amber-950">
                        <motion.span
                          className="w-5 h-5 border-2 border-amber-950/30 border-t-amber-950 rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                        CLAIMING…
                      </span>
                    ) : (
                      <span
                        className="relative z-10 flex items-center justify-center gap-2 uppercase"
                        style={{
                          textShadow: "0 1px 0 rgba(255,255,255,0.45)",
                        }}
                      >
                        <Diamond3DIcon size={22} />
                        Claim Reward
                      </span>
                    )}
                  </Button>
                </motion.div>

                {streak.current_streak >= 6 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.15 }}
                    className="text-center text-[11px] text-amber-800 mt-3 font-semibold tracking-wide"
                  >
                    🏆 Complete 7 days for the MEGA bonus
                  </motion.p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default DailyLoginPopup;
