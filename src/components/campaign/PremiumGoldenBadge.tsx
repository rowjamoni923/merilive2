/**
 * PremiumGoldenBadge — Chamet/Bigo-class golden percentage medallion.
 *
 * Reusable, dependency-free (pure CSS+SVG+Framer Motion) so admin can render
 * any percentage (1-500) with consistent premium quality. Used both in the
 * floating campaign badge and in the admin percentage-preset gallery.
 *
 * Sizes: pass `size` in px. Diamonds, fonts and ring widths scale together so
 * the badge looks correct from 48px thumbnails to 96px floating buttons.
 */
import { motion } from 'framer-motion';

interface PremiumGoldenBadgeProps {
  /** Percentage to display, e.g. 150 → "150%" */
  percentage: number;
  /** Overall diameter in CSS pixels (default 78) */
  size?: number;
  /** Render floating diamonds around the medallion (default true) */
  showDiamonds?: boolean;
  /** Animate (rotating ring, twinkle, float). Disable for static thumbnails. */
  animated?: boolean;
  /** Small caption below the percent ("BONUS", "EXTRA GEMS", etc.) */
  caption?: string;
  className?: string;
}

/** Faceted diamond SVG (cyan/white gem) — scales via width/height. */
const DiamondGem = ({ size = 10, hue = 'cyan' }: { size?: number; hue?: 'cyan' | 'pink' | 'gold' }) => {
  const palette = hue === 'gold'
    ? { top: '#fff8c2', mid: '#ffd866', dark: '#b8860b', stroke: '#8a5a00' }
    : hue === 'pink'
    ? { top: '#ffe4f1', mid: '#ff8ec4', dark: '#c93982', stroke: '#7a1f4e' }
    : { top: '#e6ffff', mid: '#7adfff', dark: '#1f8fbf', stroke: '#0a4f73' };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.5))` }}>
      <defs>
        <linearGradient id={`gem-${hue}-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.top} />
          <stop offset="55%" stopColor={palette.mid} />
          <stop offset="100%" stopColor={palette.dark} />
        </linearGradient>
      </defs>
      <polygon
        points="12,2 22,9 12,22 2,9"
        fill={`url(#gem-${hue}-${size})`}
        stroke={palette.stroke}
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      {/* Top facet highlight */}
      <polygon points="12,2 17,9 7,9" fill="rgba(255,255,255,0.55)" />
      {/* Center facet line */}
      <line x1="2" y1="9" x2="22" y2="9" stroke="rgba(0,0,0,0.25)" strokeWidth="0.4" />
      <line x1="12" y1="2" x2="12" y2="22" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4" />
    </svg>
  );
};

export default function PremiumGoldenBadge({
  percentage,
  size = 78,
  showDiamonds = true,
  animated = true,
  caption = 'BONUS',
  className = '',
}: PremiumGoldenBadgeProps) {
  // Scale internal proportions from the size prop.
  const coinSize = size;
  const diamondSize = Math.max(8, Math.round(size * 0.18));
  // Render percent as compact text. 1-99 → big; 100+ → slightly smaller; 1000+ → smaller.
  const pctStr = `${Math.max(0, Math.min(999, Math.round(percentage)))}%`;
  const pctFontSize = pctStr.length <= 3
    ? Math.round(size * 0.32)
    : pctStr.length === 4
    ? Math.round(size * 0.26)
    : Math.round(size * 0.22);
  const captionFontSize = Math.max(6, Math.round(size * 0.085));

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: size + diamondSize * 2, height: size + diamondSize * 2 }}
    >
      {/* Floating diamonds around the medallion (positions are clock-style) */}
      {showDiamonds && (
        <>
          {/* 12 o'clock */}
          <motion.div
            className="absolute"
            style={{
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 3,
            }}
            animate={animated ? { y: [0, -3, 0], rotate: [-8, 8, -8] } : undefined}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <DiamondGem size={diamondSize} hue="cyan" />
          </motion.div>
          {/* 3 o'clock */}
          <motion.div
            className="absolute"
            style={{ top: '50%', right: 0, transform: 'translateY(-50%)', zIndex: 3 }}
            animate={animated ? { x: [0, 3, 0], rotate: [10, -10, 10] } : undefined}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          >
            <DiamondGem size={Math.round(diamondSize * 0.85)} hue="cyan" />
          </motion.div>
          {/* 6 o'clock */}
          <motion.div
            className="absolute"
            style={{ bottom: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 3 }}
            animate={animated ? { y: [0, 3, 0], rotate: [8, -8, 8] } : undefined}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
          >
            <DiamondGem size={Math.round(diamondSize * 0.9)} hue="pink" />
          </motion.div>
          {/* 9 o'clock */}
          <motion.div
            className="absolute"
            style={{ top: '50%', left: 0, transform: 'translateY(-50%)', zIndex: 3 }}
            animate={animated ? { x: [0, -3, 0], rotate: [-10, 10, -10] } : undefined}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.9 }}
          >
            <DiamondGem size={Math.round(diamondSize * 0.85)} hue="cyan" />
          </motion.div>
          {/* Top-right small sparkle */}
          <motion.div
            className="absolute"
            style={{ top: diamondSize * 0.6, right: diamondSize * 0.6, zIndex: 3 }}
            animate={animated ? { scale: [0.7, 1.1, 0.7], opacity: [0.6, 1, 0.6] } : undefined}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <DiamondGem size={Math.round(diamondSize * 0.6)} hue="gold" />
          </motion.div>
          {/* Bottom-left small sparkle */}
          <motion.div
            className="absolute"
            style={{ bottom: diamondSize * 0.6, left: diamondSize * 0.6, zIndex: 3 }}
            animate={animated ? { scale: [0.6, 1.05, 0.6], opacity: [0.5, 0.95, 0.5] } : undefined}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          >
            <DiamondGem size={Math.round(diamondSize * 0.55)} hue="gold" />
          </motion.div>
        </>
      )}

      {/* The medallion itself, centered */}
      <div
        className="absolute"
        style={{
          width: coinSize,
          height: coinSize,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2,
          filter: 'drop-shadow(0 8px 16px rgba(184,134,11,0.45)) drop-shadow(0 2px 6px rgba(0,0,0,0.4))',
        }}
      >
        {/* Outer rotating gold conic ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            padding: Math.max(2, Math.round(size * 0.04)),
            background:
              'conic-gradient(from 0deg, #fff2a8, #f5c542, #b8860b, #f5c542, #fff2a8, #b8860b, #fff2a8)',
          }}
          animate={animated ? { rotate: 360 } : undefined}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
        >
          {/* Inner diamond face */}
          <div
            className="w-full h-full rounded-full relative overflow-hidden flex flex-col items-center justify-center"
            style={{
              background:
                'radial-gradient(circle at 35% 28%, #fff5c2 0%, #ffd866 22%, #d4a017 55%, #8a5a00 95%)',
              boxShadow:
                'inset 0 -4px 8px rgba(76,40,0,0.55), inset 0 3px 8px rgba(255,255,255,0.7)',
            }}
          >
            {/* Inner bevel ring */}
            <div
              className="absolute rounded-full"
              style={{
                inset: Math.max(2, Math.round(size * 0.06)),
                border: `${Math.max(1, Math.round(size * 0.012))}px solid rgba(120,75,0,0.55)`,
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4)',
              }}
            />

            {/* Top gloss highlight */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 75% 38% at 50% 14%, rgba(255,255,255,0.75), transparent 70%)',
              }}
            />

            {/* Bottom shadow */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 80% 40% at 50% 90%, rgba(76,40,0,0.35), transparent 70%)',
              }}
            />

            {/* Percentage text (embossed gold) */}
            <span
              className="relative font-black leading-none tracking-tight"
              style={{
                fontSize: pctFontSize,
                color: '#3a2200',
                fontFamily: '"Bebas Neue", "Arial Black", system-ui, sans-serif',
                textShadow:
                  '0 1px 0 #fff7c2, 0 -1px 0 rgba(76,40,0,0.6), 0 2px 3px rgba(0,0,0,0.35)',
                letterSpacing: '-0.02em',
                marginTop: -captionFontSize * 0.3,
              }}
            >
              {pctStr}
            </span>

            {/* Caption */}
            {caption && (
              <span
                className="relative font-extrabold uppercase leading-none"
                style={{
                  fontSize: captionFontSize,
                  color: '#4a2c00',
                  textShadow: '0 1px 0 rgba(255,247,194,0.8)',
                  letterSpacing: '0.1em',
                  marginTop: Math.max(1, Math.round(size * 0.02)),
                }}
              >
                {caption}
              </span>
            )}
          </div>
        </motion.div>

        {/* Outer soft glow halo */}
        {animated && (
          <motion.div
            className="absolute -inset-2 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(255,200,60,0.5) 0%, transparent 65%)',
              zIndex: -1,
            }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.55, 0.9, 0.55] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>
    </div>
  );
}
