/**
 * Compact count formatter — premium app standard (Bigo/Chamet/TikTok).
 *
 *   12         -> "12"
 *   999        -> "999"
 *   1_200      -> "1.2K"
 *   12_345     -> "12K"
 *   1_234_567  -> "1.2M"
 *   12_345_678 -> "12M"
 *
 * Used everywhere followers / viewers / gift totals render so big
 * accounts don't blow out the layout with "1234567 followers".
 *
 * Added under audit-fix Label #10.
 */
export const formatCompactCount = (n: number | null | undefined): string => {
  const num = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  if (num < 0) return '0';
  if (num < 1000) return String(num);
  if (num < 1_000_000) {
    return `${(num / 1000).toFixed(num < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  }
  if (num < 1_000_000_000) {
    return `${(num / 1_000_000).toFixed(num < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}M`;
  }
  return `${(num / 1_000_000_000).toFixed(num < 10_000_000_000 ? 1 : 0).replace(/\.0$/, '')}B`;
};
