/**
 * PremiumCampaignCard — Chamet/Bigo-style 3D premium treasure card with a red
 * ribbon banner. The bonus percentage (e.g. "150%") is embossed onto the
 * ribbon, and an optional caption ("BONUS") sits just under it. Uses a
 * pre-rendered premium artwork instead of CSS shapes so it looks like a real
 * production game asset.
 */
import cardArt from '@/assets/campaign-premium-card.png';

interface Props {
  percentage: number;
  caption?: string;
  /** Card width in px. Height auto-derives from the artwork aspect (~1:1.35). */
  width?: number;
}

export default function PremiumCampaignCard({ percentage, caption = 'BONUS', width = 84 }: Props) {
  const height = Math.round(width * 1.32);
  // Scale text with card size.
  const pctSize = Math.max(11, Math.round(width * 0.18));
  const capSize = Math.max(7, Math.round(width * 0.085));

  return (
    <div
      className="relative pointer-events-none select-none"
      style={{
        width,
        height,
        filter:
          'drop-shadow(0 10px 18px rgba(0,0,0,0.35)) drop-shadow(0 4px 8px rgba(201,168,76,0.45))',
      }}
    >
      <img
        src={cardArt}
        alt=""
        width={width}
        height={height}
        loading="lazy"
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* Percentage embossed on the red ribbon banner (top ~22% of card) */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center"
        style={{ top: '14%' }}
      >
        <span
          className="font-black tracking-tight"
          style={{
            fontSize: pctSize,
            lineHeight: 1,
            color: '#fff8d6',
            textShadow:
              '0 1px 0 #7a1a1a, 0 2px 0 #5a0f0f, 0 3px 4px rgba(0,0,0,0.55), 0 0 6px rgba(255,220,120,0.55)',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          {percentage}%
        </span>
      </div>

      {/* Small caption just below the ribbon */}
      {caption ? (
        <div
          className="absolute left-0 right-0 flex items-center justify-center"
          style={{ top: '26%' }}
        >
          <span
            className="font-bold uppercase"
            style={{
              fontSize: capSize,
              color: '#fff1c2',
              letterSpacing: '0.18em',
              textShadow: '0 1px 2px rgba(0,0,0,0.55)',
            }}
          >
            {caption}
          </span>
        </div>
      ) : null}
    </div>
  );
}
