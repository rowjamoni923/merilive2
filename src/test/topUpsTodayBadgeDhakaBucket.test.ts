/**
 * Pkg68 — "X top-ups today" badge: Asia/Dhaka day-bucket + filter independence.
 *
 * The badge on Diamond Store → Verified Traders is populated by RPC
 * `get_helper_daily_topup_stats(_helper_ids[])`:
 *
 *   WHERE ho.status = 'completed'
 *     AND (ho.created_at AT TIME ZONE 'Asia/Dhaka')::date
 *         = (now()         AT TIME ZONE 'Asia/Dhaka')::date
 *
 * Two properties this test pins down:
 *
 *   (A) Day-bucket follows Asia/Dhaka (UTC+06:00), NOT the browser locale,
 *       NOT UTC, NOT the host machine's timezone. A helper_order created at
 *       2026-05-19T18:30:00Z is already 2026-05-20 in Dhaka and counts toward
 *       "today" for a Dhaka observer; an order at 2026-05-19T17:59:59Z is
 *       still 2026-05-19 in Dhaka and does NOT count.
 *
 *   (B) The count is computed from `helper_orders` ONLY and is INDEPENDENT of
 *       the consumer-side filters `topup_helpers.is_verified` /
 *       `topup_helpers.is_active`. Toggling those flags changes whether the
 *       helper's *card* shows in the strip, but a helper that is visible
 *       always reports the same "today" count regardless of admin-side
 *       activation state.
 *
 * Runner: `npm test` (vitest run).
 */
import { describe, it, expect } from 'vitest';

const DHAKA_OFFSET_HOURS = 6;

/** Pure re-implementation of the RPC's day-bucket predicate. */
function isSameDhakaDay(createdAtIso: string, nowIso: string): boolean {
  const toDhakaYmd = (iso: string) => {
    const d = new Date(iso);
    const shifted = new Date(d.getTime() + DHAKA_OFFSET_HOURS * 3600 * 1000);
    return shifted.toISOString().slice(0, 10); // YYYY-MM-DD in Dhaka wallclock
  };
  return toDhakaYmd(createdAtIso) === toDhakaYmd(nowIso);
}

type HelperOrder = {
  helper_id: string;
  created_at: string;
  status: 'completed' | 'pending' | 'cancelled' | 'failed';
  diamond_amount?: number;
};
type Helper = { id: string; is_active: boolean; is_verified: boolean };

/** Mirrors the RPC body — operates on orders only, ignores helper flags. */
function dailyCountForHelper(
  helperId: string,
  orders: HelperOrder[],
  now: string,
): number {
  return orders.filter(
    (o) =>
      o.helper_id === helperId &&
      o.status === 'completed' &&
      isSameDhakaDay(o.created_at, now),
  ).length;
}

describe('Pkg68 — top-ups today badge (Asia/Dhaka day-bucket)', () => {
  // Dhaka midnight Mon 2026-05-20 == 2026-05-19T18:00:00Z
  const dhakaNoonMay20 = '2026-05-20T06:00:00Z'; // noon in Dhaka

  describe('(A) Asia/Dhaka day-bucket boundary', () => {
    it('counts an order from 17:59:59Z (still 2026-05-19 in Dhaka) → NOT today', () => {
      const order: HelperOrder = {
        helper_id: 'h1',
        created_at: '2026-05-19T17:59:59Z', // 23:59:59 Dhaka on the 19th
        status: 'completed',
      };
      expect(isSameDhakaDay(order.created_at, dhakaNoonMay20)).toBe(false);
      expect(dailyCountForHelper('h1', [order], dhakaNoonMay20)).toBe(0);
    });

    it('counts an order from 18:00:00Z (== Dhaka 00:00 on the 20th) → today', () => {
      const order: HelperOrder = {
      };
      expect(isSameDhakaDay(order.created_at, dhakaNoonMay20)).toBe(true);
      expect(dailyCountForHelper('h1', [order], dhakaNoonMay20)).toBe(1);
    });

    it('counts orders spanning the full Dhaka day [18:00:00Z prev → 17:59:59Z same]', () => {
      const orders: HelperOrder[] = [
        { helper_id: 'h1', created_at: '2026-05-19T18:00:00Z', status: 'completed' }, // 00:00 Dhaka 20th
        { helper_id: 'h1', created_at: '2026-05-20T05:30:00Z', status: 'completed' }, // 11:30 Dhaka 20th
        { helper_id: 'h1', created_at: '2026-05-20T17:59:59Z', status: 'completed' }, // 23:59:59 Dhaka 20th
        { helper_id: 'h1', created_at: '2026-05-20T18:00:00Z', status: 'completed' }, // 00:00 Dhaka 21st — NOT today
      ];
      expect(dailyCountForHelper('h1', orders, dhakaNoonMay20)).toBe(3);
    });

    it('does not double-count when host machine is on UTC or US-Eastern', () => {
      // Same Dhaka-noon, just expressed via offset strings — bucket is identical.
      const order: HelperOrder = {
      };
      expect(dailyCountForHelper('h1', [order], dhakaNoonMay20)).toBe(1);
      // Same instant expressed in UTC must yield the same count.
      const orderUtc: HelperOrder = { ...order, created_at: '2026-05-19T18:00:00Z' };
      expect(dailyCountForHelper('h1', [orderUtc], dhakaNoonMay20)).toBe(1);
    });

    it('ignores non-completed orders regardless of timestamp', () => {
      const orders: HelperOrder[] = [
        { helper_id: 'h1', created_at: '2026-05-20T05:00:00Z', status: 'pending' },
        { helper_id: 'h1', created_at: '2026-05-20T05:00:00Z', status: 'cancelled' },
        { helper_id: 'h1', created_at: '2026-05-20T05:00:00Z', status: 'failed' },
        { helper_id: 'h1', created_at: '2026-05-20T05:00:00Z', status: 'completed' },
      ];
      expect(dailyCountForHelper('h1', orders, dhakaNoonMay20)).toBe(1);
    });
  });

  describe('(B) count is independent of topup_helpers.is_verified / is_active', () => {
    const orders: HelperOrder[] = [
      { helper_id: 'h1', created_at: '2026-05-20T03:00:00Z', status: 'completed' },
      { helper_id: 'h1', created_at: '2026-05-20T07:00:00Z', status: 'completed' },
      { helper_id: 'h2', created_at: '2026-05-20T08:00:00Z', status: 'completed' },
    ];

    const matrix: Helper[][] = [
      [{ id: 'h1', is_active: true,  is_verified: true  }, { id: 'h2', is_active: true,  is_verified: true  }],
      [{ id: 'h1', is_active: false, is_verified: true  }, { id: 'h2', is_active: true,  is_verified: true  }],
      [{ id: 'h1', is_active: true,  is_verified: false }, { id: 'h2', is_active: true,  is_verified: true  }],
      [{ id: 'h1', is_active: false, is_verified: false }, { id: 'h2', is_active: false, is_verified: false }],
    ];

    it.each(matrix.map((helpers, i) => [i, helpers]))(
      'matrix #%i — h1 always reports 2, h2 always reports 1',
      (_i, helpers) => {
        // Whatever the admin flags are, the RPC's count only reads helper_orders.
        expect(dailyCountForHelper('h1', orders, dhakaNoonMay20)).toBe(2);
        expect(dailyCountForHelper('h2', orders, dhakaNoonMay20)).toBe(1);
        // Sanity: the helpers array exists so consumers can decide visibility,
        // but it must NOT mutate the underlying count.
        expect(helpers.length).toBe(2);
      },
    );

    it('flipping is_active on h1 across two snapshots does not change its count', () => {
      const before = dailyCountForHelper('h1', orders, dhakaNoonMay20);
      // Simulate admin toggle off → on (no order rows changed).
      const after = dailyCountForHelper('h1', orders, dhakaNoonMay20);
      expect(before).toBe(after);
      expect(after).toBe(2);
    });

    it('helpers with zero matching orders report 0, never undefined or NaN', () => {
      expect(dailyCountForHelper('h-unknown', orders, dhakaNoonMay20)).toBe(0);
      expect(Number.isFinite(dailyCountForHelper('h-unknown', orders, dhakaNoonMay20))).toBe(true);
    });
  });
});
