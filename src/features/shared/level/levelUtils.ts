// ============================================
// CENTRALIZED LEVEL BADGE SYSTEM
// ============================================
// ONE EDIT HERE = ALL PLACES UPDATED
// Used by: Live Stream, Party Room, Chat, Viewer Lists, Profile Cards
// Levels 0-10 each have UNIQUE luxurious designs
// ============================================

/**
 * Get the gradient colors for level badge background
 * Premium tier colors - unique per level for 0-10
 */
export const getLevelGradient = (level: number): string => {
  if (level >= 60) return "from-amber-400 via-yellow-300 to-orange-500";
  if (level >= 50) return "from-rose-400 via-pink-400 to-fuchsia-500";
  if (level >= 40) return "from-purple-400 via-violet-400 to-indigo-500";
  if (level >= 30) return "from-cyan-400 via-sky-400 to-blue-500";
  if (level >= 20) return "from-emerald-400 via-green-400 to-teal-500";
  if (level >= 15) return "from-cyan-500 via-teal-500 to-cyan-600";
  // Unique per-level (0-10)
  if (level === 10) return "from-amber-500 via-yellow-400 to-orange-500";
  if (level === 9) return "from-rose-500 via-pink-500 to-fuchsia-500";
  if (level === 8) return "from-violet-600 via-purple-500 to-indigo-600";
  if (level === 7) return "from-blue-600 via-indigo-500 to-blue-700";
  if (level === 6) return "from-cyan-500 via-sky-500 to-blue-500";
  if (level === 5) return "from-emerald-500 via-green-500 to-teal-500";
  if (level === 4) return "from-lime-500 via-green-400 to-emerald-500";
  if (level === 3) return "from-sky-400 via-blue-400 to-cyan-500";
  if (level === 2) return "from-teal-400 via-emerald-400 to-cyan-400";
  if (level === 1) return "from-blue-400 via-sky-400 to-blue-500";
  return "from-slate-400 via-gray-400 to-zinc-500";
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
  if (level >= 15) return "bg-gradient-to-r from-cyan-500 to-teal-500";
  if (level === 10) return "bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500";
  if (level === 9) return "bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-500";
  if (level === 8) return "bg-gradient-to-r from-violet-600 via-purple-500 to-indigo-600";
  if (level === 7) return "bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-700";
  if (level === 6) return "bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-500";
  if (level === 5) return "bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500";
  if (level === 4) return "bg-gradient-to-r from-lime-500 via-green-400 to-emerald-500";
  if (level === 3) return "bg-gradient-to-r from-sky-400 via-blue-400 to-cyan-500";
  if (level === 2) return "bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400";
  if (level === 1) return "bg-gradient-to-r from-blue-400 via-sky-400 to-blue-500";
  return "bg-gradient-to-r from-slate-500 to-gray-400";
};

/**
 * Get text color for level badge (for contrast)
 */
export const getLevelTextColor = (level: number): string => {
  if (level >= 60) return "text-amber-900";
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
  if (level === 10) return "from-amber-500/85 via-yellow-500/80 to-orange-500/75";
  if (level >= 5) return "from-emerald-500/85 via-green-500/80 to-teal-500/75";
  if (level >= 1) return "from-blue-500/85 via-sky-500/80 to-blue-600/75";
  return "from-slate-500/85 via-gray-500/80 to-zinc-500/75";
};

/**
 * Get inline style gradient for level badge
 */
export const getLevelBadgeStyle = (level: number): React.CSSProperties => {
  if (level >= 60) return { background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' };
  if (level >= 50) return { background: 'linear-gradient(135deg, #f43f5e, #ec4899)' };
  if (level >= 40) return { background: 'linear-gradient(135deg, #a855f7, #8b5cf6)' };
  if (level >= 30) return { background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)' };
  if (level >= 20) return { background: 'linear-gradient(135deg, #10b981, #14b8a6)' };
  if (level === 10) return { background: 'linear-gradient(135deg, #f59e0b, #f97316)' };
  if (level === 9) return { background: 'linear-gradient(135deg, #f43f5e, #d946ef)' };
  if (level === 8) return { background: 'linear-gradient(135deg, #7c3aed, #6366f1)' };
  if (level === 7) return { background: 'linear-gradient(135deg, #2563eb, #4f46e5)' };
  if (level === 6) return { background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)' };
  if (level === 5) return { background: 'linear-gradient(135deg, #10b981, #14b8a6)' };
  if (level === 4) return { background: 'linear-gradient(135deg, #84cc16, #10b981)' };
  if (level === 3) return { background: 'linear-gradient(135deg, #38bdf8, #06b6d4)' };
  if (level === 2) return { background: 'linear-gradient(135deg, #2dd4bf, #34d399)' };
  if (level === 1) return { background: 'linear-gradient(135deg, #60a5fa, #38bdf8)' };
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
  if (level >= 15) return "Platinum";
  if (level === 10) return "Champion";
  if (level === 9) return "Master";
  if (level === 8) return "Expert";
  if (level === 7) return "Veteran";
  if (level === 6) return "Elite";
  if (level === 5) return "Pro";
  if (level === 4) return "Rising";
  if (level === 3) return "Active";
  if (level === 2) return "Starter";
  if (level === 1) return "Newbie";
  return "Beginner";
};

/**
 * Get level icon emoji
 */
export const getLevelIcon = (level: number): string => {
  if (level >= 60) return "💎";
  if (level >= 50) return "👑";
  if (level >= 40) return "🔥";
  if (level >= 30) return "⭐";
  if (level >= 20) return "💜";
  if (level === 10) return "🏆";
  if (level === 9) return "🌟";
  if (level === 8) return "💫";
  if (level === 7) return "✨";
  if (level === 6) return "💠";
  if (level === 5) return "🍀";
  if (level === 4) return "🌿";
  if (level === 3) return "🔹";
  if (level === 2) return "🌊";
  if (level === 1) return "💧";
  return "🤍";
};

/**
 * Ensure level is never 0 - minimum is 1
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
