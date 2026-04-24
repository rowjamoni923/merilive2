/**
 * MeriLiveLoader — Premium animated loading screen
 * Letters of "MERILIVE" appear one-by-one, hold, then vanish and repeat.
 * Pure CSS animations, no JS timers — ultra lightweight.
 */

interface MeriLiveLoaderProps {
  message?: string;
  subMessage?: string;
}

const LETTERS = ["M", "E", "R", "I", "L", "I", "V", "E"];
// Total cycle = appear (0.6s * 8) + hold (0.8s) + vanish (0.6s * 8) + pause (0.4s)
const CYCLE_DURATION = 6.8; // seconds
const APPEAR_STEP = 0.18; // delay between each letter appearing
const HOLD_AT = 1.6; // when all letters are visible
const VANISH_START = 2.6; // when first letter starts vanishing
const VANISH_STEP = 0.15;

export const MeriLiveLoader = ({
  message = "Loading your account",
  subMessage = "We're preparing your access...",
}: MeriLiveLoaderProps) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-primary/10 blur-3xl animate-meri-pulse-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-accent/10 blur-3xl animate-meri-pulse-slow" style={{ animationDelay: "1.5s" }} />

      {/* Animated logo */}
      <div className="relative z-10 flex items-center justify-center mb-10">
        <div className="flex items-end gap-[2px] sm:gap-1">
          {LETTERS.map((letter, i) => {
            const appearDelay = i * APPEAR_STEP;
            const vanishDelay = VANISH_START + i * VANISH_STEP;
            return (
              <span
                key={i}
                className="meri-letter text-5xl sm:text-6xl font-black tracking-tight bg-gradient-to-b from-primary via-primary to-primary/70 bg-clip-text text-transparent"
                style={{
                  animationDuration: `${CYCLE_DURATION}s`,
                  animationDelay: `${appearDelay}s`,
                  ['--vanish-delay' as any]: `${vanishDelay - appearDelay}s`,
                  filter: "drop-shadow(0 4px 16px hsl(var(--primary) / 0.35))",
                }}
              >
                {letter}
              </span>
            );
          })}
        </div>
      </div>

      {/* Animated progress dots */}
      <div className="relative z-10 flex items-center gap-2 mb-6">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-primary"
            style={{
              animation: "meri-dot-bounce 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>

      {/* Message */}
      <div className="relative z-10 text-center">
        <h1 className="text-base font-semibold text-foreground">{message}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{subMessage}</p>
      </div>

      <style>{`
        @keyframes meri-letter-cycle {
          0%   { opacity: 0; transform: translateY(14px) scale(0.85); filter: blur(6px); }
          12%  { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          38%  { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          /* vanish phase — staggered via inline --vanish-delay handled by per-letter delay */
          55%  { opacity: 0; transform: translateY(-14px) scale(0.85); filter: blur(6px); }
          100% { opacity: 0; transform: translateY(14px) scale(0.85); filter: blur(6px); }
        }
        .meri-letter {
          display: inline-block;
          opacity: 0;
          animation-name: meri-letter-cycle;
          animation-iteration-count: infinite;
          animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
          animation-fill-mode: both;
          will-change: transform, opacity, filter;
        }
        @keyframes meri-dot-bounce {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
          40%           { opacity: 1;   transform: scale(1.2); }
        }
        @keyframes meri-pulse-slow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%      { opacity: 0.7; transform: scale(1.15); }
        }
        .animate-meri-pulse-slow {
          animation: meri-pulse-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default MeriLiveLoader;
