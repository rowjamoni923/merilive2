import { motion } from "framer-motion";
import { useMemo } from "react";

/**
 * Premium animated world backdrop for the match call screen.
 * Pure SVG + CSS — no extra deps, GPU friendly, ~60fps mobile.
 * Layers (back → front):
 *  1. Deep space radial gradient + twinkling stars
 *  2. Slowly rotating wireframe globe (latitude + longitude grid)
 *  3. Soft continent silhouettes counter-rotating
 *  4. Orbiting signal pings + aurora sheen
 */
export default function AnimatedGlobeBackdrop() {
  const stars = useMemo(
    () =>
      Array.from({ length: 80 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: Math.random() * 1.6 + 0.4,
        d: Math.random() * 3 + 1.5,
        delay: Math.random() * 4,
      })),
    [],
  );

  const pings = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        return {
          id: i,
          x: 50 + Math.cos(angle) * 32,
          y: 50 + Math.sin(angle) * 32,
          delay: i * 0.8,
        };
      }),
    [],
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Deep space */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, #1b1140 0%, #0a0826 45%, #04020f 100%)",
        }}
      />

      {/* Twinkling stars */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {stars.map((s) => (
          <circle key={s.id} cx={s.x} cy={s.y} r={s.s / 10} fill="white">
            <animate
              attributeName="opacity"
              values="0.15;1;0.15"
              dur={`${s.d}s`}
              begin={`${s.delay}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>

      {/* Aurora sheen */}
      <motion.div
        className="absolute -inset-1/4"
        style={{
          background:
            "conic-gradient(from 0deg at 50% 50%, rgba(168,85,247,0.18), rgba(34,211,238,0.10), rgba(236,72,153,0.16), rgba(99,102,241,0.10), rgba(168,85,247,0.18))",
          filter: "blur(60px)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />

      {/* Globe wrapper — centered, large, soft glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative"
          style={{
            width: "min(110vw, 720px)",
            height: "min(110vw, 720px)",
            filter: "drop-shadow(0 0 60px rgba(99,102,241,0.35))",
          }}
        >
          {/* Glow halo */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.20) 0%, rgba(99,102,241,0.05) 45%, transparent 65%)",
            }}
          />

          {/* Wireframe globe — rotates */}
          <motion.svg
            viewBox="-110 -110 220 220"
            className="absolute inset-0 w-full h-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
          >
            <defs>
              <radialGradient id="globeFill" cx="35%" cy="30%" r="80%">
                <stop offset="0%" stopColor="rgba(99,102,241,0.25)" />
                <stop offset="60%" stopColor="rgba(30,27,75,0.55)" />
                <stop offset="100%" stopColor="rgba(2,6,23,0.85)" />
              </radialGradient>
              <linearGradient id="meridian" x1="0" y1="-100" x2="0" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(56,189,248,0)" />
                <stop offset="50%" stopColor="rgba(56,189,248,0.55)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0)" />
              </linearGradient>
            </defs>

            {/* Sphere base */}
            <circle cx="0" cy="0" r="100" fill="url(#globeFill)" stroke="rgba(148,163,184,0.35)" strokeWidth="0.5" />

            {/* Longitude meridians (ellipses with varying rx) */}
            {[100, 78, 52, 22].map((rx, i) => (
              <ellipse
                key={`lon-${i}`}
                cx="0"
                cy="0"
                rx={rx}
                ry="100"
                fill="none"
                stroke="url(#meridian)"
                strokeWidth="0.6"
                opacity={0.75}
              />
            ))}
            {/* Latitude parallels */}
            {[-80, -60, -40, -20, 0, 20, 40, 60, 80].map((cy) => {
              const rx = Math.sqrt(Math.max(0, 100 * 100 - cy * cy));
              return (
                <ellipse
                  key={`lat-${cy}`}
                  cx="0"
                  cy={cy}
                  rx={rx}
                  ry={Math.max(2, rx * 0.18)}
                  fill="none"
                  stroke="rgba(148,163,184,0.28)"
                  strokeWidth="0.4"
                />
              );
            })}
          </motion.svg>

          {/* Continent silhouettes — counter-rotate slowly for parallax */}
          <motion.div
            className="absolute inset-0"
            animate={{ rotate: -360 }}
            transition={{ duration: 140, repeat: Infinity, ease: "linear" }}
          >
            <svg viewBox="-110 -110 220 220" className="absolute inset-0 w-full h-full">
              {/* abstract continent blobs */}
              <g fill="rgba(56,189,248,0.18)" stroke="rgba(125,211,252,0.35)" strokeWidth="0.4">
                <path d="M-70,-30 q10,-18 28,-14 q18,4 14,18 q-4,16 -22,18 q-22,2 -20,-22 z" />
                <path d="M-10,-58 q14,-8 22,4 q8,12 -2,20 q-12,8 -22,-2 q-10,-12 2,-22 z" />
                <path d="M30,-10 q18,-6 24,12 q6,18 -10,26 q-18,8 -24,-10 q-6,-22 10,-28 z" />
                <path d="M-50,30 q18,-4 26,12 q8,18 -8,26 q-22,10 -30,-10 q-8,-22 12,-28 z" />
                <path d="M20,40 q22,-2 26,18 q4,20 -16,24 q-22,4 -22,-18 q0,-22 12,-24 z" />
              </g>
            </svg>
          </motion.div>

          {/* Orbiting signal pings */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
            {pings.map((p) => (
              <g key={p.id}>
                <circle cx={p.x} cy={p.y} r="0.6" fill="#22d3ee">
                  <animate attributeName="opacity" values="0;1;0" dur="2.6s" begin={`${p.delay}s`} repeatCount="indefinite" />
                </circle>
                <circle cx={p.x} cy={p.y} r="0.6" fill="none" stroke="#22d3ee" strokeWidth="0.4">
                  <animate attributeName="r" values="0.6;4.5;0.6" dur="2.6s" begin={`${p.delay}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0;0" dur="2.6s" begin={`${p.delay}s`} repeatCount="indefinite" />
                </circle>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Bottom vignette so foreground UI keeps contrast */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(4,2,15,0) 0%, rgba(4,2,15,0.25) 55%, rgba(4,2,15,0.85) 100%)",
        }}
      />
    </div>
  );
}
