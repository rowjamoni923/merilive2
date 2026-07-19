/**
 * Task Date Utility
 *
 * All daily/weekly tasks, leaderboards and rewards reset at 12:30 AM
 * Europe/London (BST) — this matches the server functions
 * public.get_task_reset_date() and public.get_task_week_reset_date().
 *
 * The client MUST mirror that timezone, otherwise users in other
 * timezones (e.g. Asia/Dhaka) will query progress rows with a
 * reset_date that the server never wrote → empty task cards / wrong
 * "Today" label.
 */

const SERVER_TZ = "Europe/London";
const RESET_HOUR = 0;
const RESET_MINUTE = 30;

// Returns the wall-clock parts of `now` in the server timezone.
const partsInServerTz = (now: Date) => {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: SERVER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return {
  };
};

// Convert wall-clock {y,m,d,h,mi,s} in SERVER_TZ to a real UTC Date.
const serverWallToUtc = (y: number, m: number, d: number, h: number, mi: number, s: number): Date => {
  // Start from the naive UTC instant for those wall-clock numbers, then
  // correct by the offset between that instant in server tz and UTC.
  const naive = Date.UTC(y, m - 1, d, h, mi, s);
  const probe = new Date(naive);
  const probeParts = partsInServerTz(probe);
  const probeAsUtc = Date.UTC(
    probeParts.year,
    probeParts.month - 1,
    probeParts.day,
    probeParts.hour,
    probeParts.minute,
    probeParts.second,
  );
  const offset = probeAsUtc - naive; // ms the server tz is AHEAD of UTC
  return new Date(naive - offset);
};

/**
 * Current "app day" string YYYY-MM-DD in Europe/London, accounting for
 * the 12:30 AM reset. Matches public.get_task_reset_date() on the server.
 */
export const getTaskDate = (): string => {
  const now = new Date();
  const p = partsInServerTz(now);
  const beforeReset = p.hour < RESET_HOUR || (p.hour === RESET_HOUR && p.minute < RESET_MINUTE);

  let { year, month, day } = p;
  if (beforeReset) {
    // Subtract one day in server-tz wall clock — go via a real Date to handle month/year rollover.
    const todayMidnightUtc = serverWallToUtc(year, month, day, 0, 0, 0);
    const yesterday = new Date(todayMidnightUtc.getTime() - 24 * 60 * 60 * 1000);
    const yp = partsInServerTz(yesterday);
    year = yp.year;
    month = yp.month;
    day = yp.day;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/**
 * ms until the next reset (next 12:30 AM Europe/London).
 */
export const getMsUntilNextReset = (): number => {
  const now = new Date();
  const p = partsInServerTz(now);
  const afterReset = p.hour > RESET_HOUR || (p.hour === RESET_HOUR && p.minute >= RESET_MINUTE);

  let baseY = p.year;
  let baseM = p.month;
  let baseD = p.day;
  if (afterReset) {
    const todayMidnightUtc = serverWallToUtc(baseY, baseM, baseD, 0, 0, 0);
    const tomorrow = new Date(todayMidnightUtc.getTime() + 24 * 60 * 60 * 1000);
    const tp = partsInServerTz(tomorrow);
    baseY = tp.year;
    baseM = tp.month;
    baseD = tp.day;
  }
  const nextReset = serverWallToUtc(baseY, baseM, baseD, RESET_HOUR, RESET_MINUTE, 0);
  return Math.max(nextReset.getTime() - now.getTime(), 1000);
};

/**
 * ms until the next top-of-hour wall clock tick (HH:00:00) in the user's
 * effective timezone — used to nudge live cards every hour so labels and
 * accumulated minutes stay accurate without spamming the server.
 */
export const getMsUntilNextHour = (): number => {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return Math.max(next.getTime() - now.getTime(), 1000);
};

/**
 * Start/end ISO timestamps of the current app day (Europe/London).
 */
export const getDayBoundaries = (): { start: string; end: string } => {
  const dateKey = getTaskDate(); // YYYY-MM-DD in server tz
  const [y, m, d] = dateKey.split("-").map(Number);
  const start = serverWallToUtc(y, m, d, RESET_HOUR, RESET_MINUTE, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
};

/**
 * Current week (Sunday-anchored, matches server get_task_week_reset_date).
 */
export const getWeekBoundaries = (): { start: string; end: string } => {
  const dateKey = getTaskDate();
  const [y, m, d] = dateKey.split("-").map(Number);
  const todayMidnight = serverWallToUtc(y, m, d, 0, 0, 0);
  // Server uses Sunday as week start (EXTRACT(DOW) where Sun=0).
  const dow = new Date(
    Date.UTC(
      partsInServerTz(todayMidnight).year,
      partsInServerTz(todayMidnight).month - 1,
      partsInServerTz(todayMidnight).day,
    ),
  ).getUTCDay();
  const weekStartMidnight = new Date(todayMidnight.getTime() - dow * 24 * 60 * 60 * 1000);
  const wp = partsInServerTz(weekStartMidnight);
  const start = serverWallToUtc(wp.year, wp.month, wp.day, RESET_HOUR, RESET_MINUTE, 0);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
};

/**
 * Current month (1st 00:30 server tz → next month 1st 00:30 server tz).
 */
export const getMonthBoundaries = (): { start: string; end: string } => {
  const dateKey = getTaskDate();
  const [y, m] = dateKey.split("-").map(Number);
  const start = serverWallToUtc(y, m, 1, RESET_HOUR, RESET_MINUTE, 0);
  const nextMonthYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  const end = serverWallToUtc(nextMonthYear, nextMonth, 1, RESET_HOUR, RESET_MINUTE, 0);
  return { start: start.toISOString(), end: end.toISOString() };
};
