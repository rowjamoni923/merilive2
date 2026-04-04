/**
 * Task Date Utility
 * 
 * Daily tasks, leaderboards, rewards, and all app systems reset at 
 * 12:30 AM LOCAL TIME (user's device timezone).
 * 
 * This utility ensures all date calculations use the same logic
 * so everything properly refreshes when a new day starts at 12:30 AM local time.
 */

// Reset time: 12:30 AM local time
const RESET_HOUR = 0;
const RESET_MINUTE = 30;

/**
 * Get the current "app day" date string (YYYY-MM-DD) in the user's LOCAL timezone,
 * accounting for the 12:30 AM reset time.
 * 
 * Before 12:30 AM local → still counts as the previous day
 * After 12:30 AM local → counts as the new day
 */
export const getTaskDate = (): string => {
  const now = new Date();
  
  const localHour = now.getHours();
  const localMinute = now.getMinutes();
  
  // Check if we're before the reset time (00:30 local)
  const isBeforeReset = localHour < RESET_HOUR || 
    (localHour === RESET_HOUR && localMinute < RESET_MINUTE);
  
  // If before reset, still the previous day
  const effectiveDate = new Date(now);
  if (isBeforeReset) {
    effectiveDate.setDate(effectiveDate.getDate() - 1);
  }
  
  // Format as YYYY-MM-DD
  const year = effectiveDate.getFullYear();
  const month = String(effectiveDate.getMonth() + 1).padStart(2, '0');
  const day = String(effectiveDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Get milliseconds until the next reset (12:30 AM local time).
 * Used to schedule auto-refresh of tasks, leaderboards, etc.
 */
export const getMsUntilNextReset = (): number => {
  const now = new Date();
  
  const localHour = now.getHours();
  const localMinute = now.getMinutes();
  
  // Calculate next reset time in local timezone
  const nextReset = new Date(now);
  nextReset.setHours(RESET_HOUR, RESET_MINUTE, 0, 0);
  
  // If we're past reset time today, next reset is tomorrow
  if (localHour > RESET_HOUR || (localHour === RESET_HOUR && localMinute >= RESET_MINUTE)) {
    nextReset.setDate(nextReset.getDate() + 1);
  }
  
  return Math.max(nextReset.getTime() - now.getTime(), 1000); // At least 1 second
};

/**
 * Get the start and end timestamps (ISO) for the current "app day" in local timezone.
 * Useful for leaderboard daily queries.
 * 
 * Day starts at 12:30 AM local today, ends at 12:30 AM local tomorrow.
 */
export const getDayBoundaries = (): { start: string; end: string } => {
  const now = new Date();
  const localHour = now.getHours();
  const localMinute = now.getMinutes();
  
  const isBeforeReset = localHour < RESET_HOUR || 
    (localHour === RESET_HOUR && localMinute < RESET_MINUTE);
  
  const dayStart = new Date(now);
  if (isBeforeReset) {
    // Before 12:30 AM → day started at 12:30 AM yesterday
    dayStart.setDate(dayStart.getDate() - 1);
  }
  dayStart.setHours(RESET_HOUR, RESET_MINUTE, 0, 0);
  
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  
  return {
    start: dayStart.toISOString(),
    end: dayEnd.toISOString(),
  };
};

/**
 * Get the start and end timestamps for the current week (Monday 12:30 AM to next Monday 12:30 AM).
 */
export const getWeekBoundaries = (): { start: string; end: string } => {
  const now = new Date();
  const localHour = now.getHours();
  const localMinute = now.getMinutes();
  
  const isBeforeReset = localHour < RESET_HOUR || 
    (localHour === RESET_HOUR && localMinute < RESET_MINUTE);
  
  // Get effective "today"
  const effectiveDate = new Date(now);
  if (isBeforeReset) {
    effectiveDate.setDate(effectiveDate.getDate() - 1);
  }
  
  // Find Monday of this week
  const dayOfWeek = effectiveDate.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const weekStart = new Date(effectiveDate);
  weekStart.setDate(effectiveDate.getDate() + mondayOffset);
  weekStart.setHours(RESET_HOUR, RESET_MINUTE, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  return {
    start: weekStart.toISOString(),
    end: weekEnd.toISOString(),
  };
};

/**
 * Get the start and end timestamps for the current month (1st 12:30 AM to next month 1st 12:30 AM).
 */
export const getMonthBoundaries = (): { start: string; end: string } => {
  const now = new Date();
  const localHour = now.getHours();
  const localMinute = now.getMinutes();
  
  const isBeforeReset = localHour < RESET_HOUR || 
    (localHour === RESET_HOUR && localMinute < RESET_MINUTE);
  
  const effectiveDate = new Date(now);
  if (isBeforeReset) {
    effectiveDate.setDate(effectiveDate.getDate() - 1);
  }
  
  const monthStart = new Date(effectiveDate.getFullYear(), effectiveDate.getMonth(), 1, RESET_HOUR, RESET_MINUTE, 0, 0);
  const monthEnd = new Date(effectiveDate.getFullYear(), effectiveDate.getMonth() + 1, 1, RESET_HOUR, RESET_MINUTE, 0, 0);
  
  return {
    start: monthStart.toISOString(),
    end: monthEnd.toISOString(),
  };
};
