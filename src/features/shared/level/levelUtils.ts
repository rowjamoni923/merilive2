// ============================================
// CENTRALIZED LEVEL BADGE SYSTEM
// ============================================
// ONE EDIT HERE = ALL PLACES UPDATED
// Used by: Live Stream, Party Room, Chat, Viewer Lists, Profile Cards
// ============================================

/**
 * Get the gradient colors for level badge background
 * Premium tier colors matching Bigo/Chamet/Popo style
 */
export const getLevelGradient = (level: number): string => {
  if (level >= 60) return "from-amber-400 via-yellow-300 to-orange-500"; // Legend - Gold
  if (level >= 50) return "from-rose-400 via-pink-400 to-fuchsia-500"; // Mythic - Rose
  if (level >= 40) return "from-purple-400 via-violet-400 to-indigo-500"; // Epic - Purple
  if (level >= 30) return "from-cyan-400 via-sky-400 to-blue-500"; // Diamond - Cyan
  if (level >= 20) return "from-emerald-400 via-green-400 to-teal-500"; // Gold - Green
  if (level >= 10) return "from-blue-400 via-indigo-400 to-violet-500"; // Silver - Blue
  return "from-slate-400 via-gray-400 to-zinc-500"; // Bronze - Gray
};

/**
 * Get the full CSS background class for level badge
 */
export const getLevelBadgeBg = (level: number): string => {
  if (level >= 60) return "bg-gradient-to-r from-amber-500 to-yellow-400";
  if (level >= 50) return "bg-gradient-to-r from-rose-500 to-pink-400";
  if (level >= 40) return "bg-gradient-to-r from-purple-500 to-violet-400";
  if (level >= 30) return "bg-gradient-to-r from-cyan-500 to-sky-400";
  if (level >= 20) return "bg-gradient-to-r from-emerald-500 to-green-400";
  if (level >= 10) return "bg-gradient-to-r from-blue-500 to-indigo-400";
  return "bg-gradient-to-r from-slate-500 to-gray-400";
};

/**
 * Get text color for level badge (for contrast)
 */
export const getLevelTextColor = (level: number): string => {
  if (level >= 60) return "text-amber-900"; // Dark text on gold for better visibility
  return "text-white";
};

/**
 * Get the join banner background gradient for level
 */
export const getJoinBannerBg = (level: number): string => {
  if (level >= 60) return "from-amber-500/85 via-yellow-500/80 to-orange-500/75";
  if (level >= 50) return "from-rose-500/85 via-pink-500/80 to-fuchsia-500/75";
  if (level >= 40) return "from-purple-500/85 via-violet-500/80 to-indigo-500/75";
  if (level >= 30) return "from-cyan-500/85 via-sky-500/80 to-blue-500/75";
  if (level >= 20) return "from-emerald-500/85 via-green-500/80 to-teal-500/75";
  if (level >= 10) return "from-blue-500/85 via-indigo-500/80 to-violet-500/75";
  return "from-slate-500/85 via-gray-500/80 to-zinc-500/75";
};

/**
 * Get inline style gradient for level badge (for cases where Tailwind classes don't work)
 */
export const getLevelBadgeStyle = (level: number): React.CSSProperties => {
  if (level >= 60) return { background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' };
  if (level >= 50) return { background: 'linear-gradient(135deg, #f43f5e, #ec4899)' };
  if (level >= 40) return { background: 'linear-gradient(135deg, #a855f7, #8b5cf6)' };
  if (level >= 30) return { background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)' };
  if (level >= 20) return { background: 'linear-gradient(135deg, #10b981, #14b8a6)' };
  if (level >= 10) return { background: 'linear-gradient(135deg, #3b82f6, #6366f1)' };
  return { background: 'linear-gradient(135deg, #64748b, #94a3b8)' };
};

/**
 * Get the level tier name
 */
export const getLevelTierName = (level: number): string => {
  if (level >= 60) return "Legend";
  if (level >= 50) return "Mythic";
  if (level >= 40) return "Epic";
  if (level >= 30) return "Diamond";
  if (level >= 20) return "Gold";
  if (level >= 10) return "Silver";
  return "Bronze";
};

/**
 * Ensure level is never 0 - minimum is 1
 * CRITICAL: Always use this when displaying levels!
 */
export const ensureValidLevel = (level: number | undefined | null): number => {
  return Math.max(level || 1, 1);
};

/**
 * Format level for display (e.g., "Lv.20")
 */
export const formatLevel = (level: number | undefined | null): string => {
  return `Lv.${ensureValidLevel(level)}`;
};
