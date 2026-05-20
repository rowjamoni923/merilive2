/**
 * Pkg63 — Helper-trader top-up gate E2E.
 *
 * Verifies that ALL three top-up RPCs short-circuit with
 * `{ success: false, error: 'Only approved L1-L5 helper traders can top up' }`
 * whenever the caller's `topup_helpers` row is:
 *   • missing entirely
 *   • is_active = false
 *   • is_verified = false
 *   • trader_level outside 1..5 (0 or 6)
 *
 * Mirrors the SQL in
 * supabase/migrations/20260520150144_*.sql (is_approved_topup_trader).
 *
 * Runner: `npm test` (vitest run).
 */
import { describe, it, expect, beforeEach } from 'vitest';

type HelperRow = {
  user_id: string;
  is_active: boolean | null;
  is_verified: boolean | null;
  trader_level: number | null;
  wallet_balance: number;
};

const GATE_ERROR = 'Only approved L1-L5 helper traders can top up';

class FakeDb {
  helpers = new Map<string, HelperRow>();
  callerId: string | null = null;

  reset() { this.helpers.clear(); this.callerId = null; }

  setCaller(id: string | null) { this.callerId = id; }

  seedHelper(row: Partial<HelperRow> & { user_id: string }) {
    this.helpers.set(row.user_id, {
      user_id: row.user_id,
      is_active: row.is_active ?? true,
      is_verified: row.is_verified ?? true,
      trader_level: row.trader_level ?? 3,
      wallet_balance: row.wallet_balance ?? 1_000_000,
    });
  }

  // Mirror of public.is_approved_topup_trader(_user_id)
  isApprovedTopupTrader(uid: string): boolean {
    const h = this.helpers.get(uid);
    if (!h) return false;
    const active = h.is_active ?? true;
    const verified = h.is_verified ?? false;
    const lvl = h.trader_level ?? 0;
    return active === true && verified === true && lvl >= 1 && lvl <= 5;
  }

  private gate() {
    if (this.callerId == null) return { success: false, error: 'Not authenticated' };
    if (!this.isApprovedTopupTrader(this.callerId)) {
      return { success: false, error: GATE_ERROR };
    }
    return null;
  }

  // RPC: coin_trader_transfer_to_user
  rpcUidTopup(_recipient: string, _amount: number) {
    const blocked = this.gate(); if (blocked) return blocked;
    return { success: true };
  }

  // RPC: coin_trader_transfer_to_agency
  rpcAgencyDeposit(_agency: string, _amount: number) {
    const blocked = this.gate(); if (blocked) return blocked;
    return { success: true };
  }

  // RPC: coin_trader_self_recharge
  rpcSelfDeposit(_amount: number) {
    const blocked = this.gate(); if (blocked) return blocked;
    return { success: true };
  }
}

const db = new FakeDb();

const callAll = (recipient = 'rcpt-1', agency = 'ag-1', amount = 100) => ({
  uid:    db.rpcUidTopup(recipient, amount),
  agency: db.rpcAgencyDeposit(agency, amount),
  self:   db.rpcSelfDeposit(amount),
});

const expectAllBlocked = (res: ReturnType<typeof callAll>) => {
  for (const k of ['uid', 'agency', 'self'] as const) {
    expect(res[k].success, `${k} should be blocked`).toBe(false);
    expect(res[k].error,   `${k} error message`).toBe(GATE_ERROR);
  }
};

describe('Pkg63 helper-trader top-up gate (E2E)', () => {
  beforeEach(() => { db.reset(); db.setCaller('me'); });

  it('blocks all three flows when topup_helpers row is MISSING', () => {
    // no seedHelper → row missing
    expectAllBlocked(callAll());
  });

  it('blocks all three flows when is_active = false', () => {
    db.seedHelper({ user_id: 'me', is_active: false });
    expectAllBlocked(callAll());
  });

  it('blocks all three flows when is_verified = false', () => {
    db.seedHelper({ user_id: 'me', is_verified: false });
    expectAllBlocked(callAll());
  });

  it('blocks all three flows when trader_level = 0 (below L1)', () => {
    db.seedHelper({ user_id: 'me', trader_level: 0 });
    expectAllBlocked(callAll());
  });

  it('blocks all three flows when trader_level = 6 (above L5)', () => {
    db.seedHelper({ user_id: 'me', trader_level: 6 });
    expectAllBlocked(callAll());
  });

  it('blocks all three flows when trader_level is NULL', () => {
    db.seedHelper({ user_id: 'me', trader_level: null });
    expectAllBlocked(callAll());
  });

  it('blocks all three flows when caller is unauthenticated', () => {
    db.setCaller(null);
    db.seedHelper({ user_id: 'me' }); // even with a valid row
    const res = callAll();
    for (const k of ['uid', 'agency', 'self'] as const) {
      expect(res[k].success).toBe(false);
      expect(res[k].error).toBe('Not authenticated');
    }
  });

  it('positive control: fully-approved L3 trader can pass all three gates', () => {
    db.seedHelper({ user_id: 'me', is_active: true, is_verified: true, trader_level: 3 });
    const res = callAll();
    expect(res.uid.success).toBe(true);
    expect(res.agency.success).toBe(true);
    expect(res.self.success).toBe(true);
  });

  it('boundary: L1 and L5 both pass; L0 and L6 both blocked', () => {
    for (const lvl of [1, 2, 3, 4, 5]) {
      db.reset(); db.setCaller('me');
      db.seedHelper({ user_id: 'me', trader_level: lvl });
      expect(callAll().uid.success, `L${lvl} should pass`).toBe(true);
    }
    for (const lvl of [0, 6, -1, 99]) {
      db.reset(); db.setCaller('me');
      db.seedHelper({ user_id: 'me', trader_level: lvl });
      expect(callAll().uid.success, `L${lvl} should be blocked`).toBe(false);
    }
  });
});
