import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getTaskDate,
  getDayBoundaries,
  getWeekBoundaries,
  getMsUntilNextReset,
} from "./taskDateUtils";

/**
 * Mirrors the server SQL:
 *   get_task_reset_date()       → 12:30 Europe/London reset, returns DATE
 *   get_task_week_reset_date()  → that date minus EXTRACT(DOW) days (Sun=0)
 *
 * We compute the expected value in pure JS using Intl in Europe/London,
 * then assert the client utils produce the same string.
 */
const serverTaskResetDate = (instant: Date): string => {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(instant).reduce<Record<string, string>>(
    (a, p) => (p.type === "literal" ? a : ((a[p.type] = p.value), a)),
    {},
  );
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const minute = Number(parts.minute);
  const beforeReset = hour < 0 || (hour === 0 && minute < 30);
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  if (!beforeReset) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // Subtract one day, honoring month/year rollover via UTC math.
  const prev = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
};

const serverWeekResetDate = (instant: Date): string => {
  const today = serverTaskResetDate(instant);
  const [y, m, d] = today.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  const dow = utcMidnight.getUTCDay(); // Sun=0 — matches Postgres EXTRACT(DOW).
  const weekStart = new Date(utcMidnight.getTime() - dow * 86_400_000);
  return `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, "0")}-${String(weekStart.getUTCDate()).padStart(2, "0")}`;
};

const setNow = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("getTaskDate ↔ server get_task_reset_date", () => {
  // Each row is a real UTC instant we probe at. They cover:
  //   - day rollover in winter (GMT, offset 0)
  //   - the 12:30 reset boundary itself
  //   - day rollover in summer (BST, offset +1)
  //   - DST spring-forward day (2026-03-29 in London)
  //   - DST fall-back day (2026-10-25 in London)
  const cases: Array<{ label: string; iso: string }> = [
    { label: "winter, 23:29 UTC → 23:29 London (before midnight)", iso: "2026-01-14T23:29:00Z" },
    { label: "winter, 00:29 UTC → 00:29 London (before 00:30 reset)", iso: "2026-01-15T00:29:59Z" },
    { label: "winter, 00:30 UTC → 00:30 London (at reset)", iso: "2026-01-15T00:30:00Z" },
    { label: "winter, 00:30:01 UTC → 00:30:01 London (after reset)", iso: "2026-01-15T00:30:01Z" },
    { label: "summer, 23:29 UTC → 00:29 London BST (before reset)", iso: "2026-05-17T23:29:00Z" },
    { label: "summer, 23:30 UTC → 00:30 London BST (at reset, new day)", iso: "2026-05-17T23:30:00Z" },
    { label: "summer, 23:30:01 UTC → 00:30:01 London BST (after reset)", iso: "2026-05-17T23:30:01Z" },
    { label: "summer mid-day", iso: "2026-05-18T14:00:00Z" },
    { label: "DST spring-forward day, pre-jump 00:29 BST", iso: "2026-03-28T23:29:00Z" },
    { label: "DST spring-forward day, after 02:00 jump", iso: "2026-03-29T02:30:00Z" },
    { label: "DST fall-back day, ambiguous 01:30 local", iso: "2026-10-25T01:30:00Z" },
    { label: "DST fall-back day, 23:45 UTC → 23:45 GMT", iso: "2026-10-25T23:45:00Z" },
    { label: "year rollover", iso: "2026-12-31T23:45:00Z" },
    { label: "month rollover (Feb→Mar)", iso: "2026-02-28T23:45:00Z" },
  ];

  for (const { label, iso } of cases) {
    it(label, () => {
      setNow(iso);
      const expected = serverTaskResetDate(new Date(iso));
      expect(getTaskDate()).toBe(expected);
    });
  }
});

describe("getDayBoundaries", () => {
  it("starts at 12:30 AM Europe/London on the current task date and lasts 24h", () => {
    setNow("2026-05-18T14:00:00Z"); // BST → task date 2026-05-18
    const { start, end } = getDayBoundaries();
    expect(start).toBe("2026-05-17T23:30:00.000Z"); // 00:30 BST == 23:30 UTC prev day
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(86_400_000);
  });

  it("uses GMT offset in winter", () => {
    setNow("2026-01-15T14:00:00Z"); // GMT → task date 2026-01-15
    const { start, end } = getDayBoundaries();
    expect(start).toBe("2026-01-15T00:30:00.000Z");
    expect(end).toBe("2026-01-16T00:30:00.000Z");
  });

  it("crosses the spring-forward DST gap without losing time", () => {
    setNow("2026-03-29T12:00:00Z"); // DST day, task date 2026-03-29
    const { start, end } = getDayBoundaries();
    // 00:30 GMT on the DST day == 00:30 UTC (clocks jump at 01:00 GMT).
    expect(start).toBe("2026-03-29T00:30:00.000Z");
    expect(end).toBe("2026-03-30T00:30:00.000Z");
  });
});

describe("getWeekBoundaries ↔ server get_task_week_reset_date", () => {
  const cases: Array<{ label: string; iso: string }> = [
    { label: "mid-week summer", iso: "2026-05-20T14:00:00Z" },
    { label: "Sunday — week start day", iso: "2026-05-17T14:00:00Z" },
    { label: "Saturday just before midnight (still same week)", iso: "2026-05-23T22:00:00Z" },
    { label: "Sunday 00:31 BST — first instant of new week", iso: "2026-05-16T23:31:00Z" },
    { label: "winter mid-week", iso: "2026-01-14T14:00:00Z" },
    { label: "DST spring-forward week", iso: "2026-03-29T14:00:00Z" },
  ];

  for (const { label, iso } of cases) {
    it(label, () => {
      setNow(iso);
      const { start, end } = getWeekBoundaries();
      // Client returns ISO timestamps; server returns a DATE for the
      // week-start day — assert the *day* of `start` (at 00:30 London)
      // matches the server's week-reset date.
      const expectedDay = serverWeekResetDate(new Date(iso));
      const startParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(start));
      expect(startParts).toBe(expectedDay);
      // Always exactly 7 days long.
      expect(new Date(end).getTime() - new Date(start).getTime()).toBe(7 * 86_400_000);
    });
  }
});

describe("getMsUntilNextReset", () => {
  it("returns < 24h and is positive", () => {
    setNow("2026-05-18T14:00:00Z");
    const ms = getMsUntilNextReset();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("just after the 12:30 reset, ms-to-next ≈ 24h", () => {
    // 00:30:01 BST == 23:30:01 UTC the day before.
    setNow("2026-05-17T23:30:01Z");
    const ms = getMsUntilNextReset();
    const hours = ms / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it("just before reset, ms-to-next is tiny", () => {
    setNow("2026-05-17T23:29:30Z"); // 00:29:30 BST
    const ms = getMsUntilNextReset();
    expect(ms).toBeLessThanOrEqual(31_000);
    expect(ms).toBeGreaterThanOrEqual(1_000);
  });
});
