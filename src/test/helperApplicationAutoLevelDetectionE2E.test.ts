import { describe, it, expect } from "vitest";

/**
 * Pkg75 — Helper application AUTO-LEVEL detection on deposit confirm.
 *
 * Mirrors Pkg65 backend behavior:
 *  - After on-chain verification of a Swift Pay crypto deposit, the helper
 *    application's `detected_level` MUST equal the HIGHEST tier whose
 *    `upgrade_cost_usd` is ≤ verified `price_usd`.
 *  - `requested_level` is auto-assigned to that same detected level
 *    (overriding any client-submitted selected_level).
 *  - `payment_details.auto_verified` = true, `selected_level` preserved for
 *    audit, `auto_level_adjusted` = (selected_level !== detected_level).
 *  - If verified amount < cheapest paid tier → detected_level = 1 (free L1).
 *  - Only `status='completed'` swift_pay_topups count.
 */

type Tier = { level: number; upgrade_cost_usd: number };
type Topup = {
  id: string;
  user_id: string;
  status: "pending" | "completed" | "failed";
  price_usd: number | string | null;
  verified_at?: string | null;
};

const TIERS: Tier[] = [
  { level: 1, upgrade_cost_usd: 0 },
  { level: 2, upgrade_cost_usd: 50 },
  { level: 3, upgrade_cost_usd: 150 },
  { level: 4, upgrade_cost_usd: 300 },
  { level: 5, upgrade_cost_usd: 500 },
];

/** Mirror of resolve_auto_level (Pkg65). */
function deriveDetectedLevel(verifiedUsd: number, tiers: Tier[] = TIERS): number {
  const paid = Number(verifiedUsd);
  if (!Number.isFinite(paid) || paid < 0) return 1;
  const sorted = [...tiers].sort((a, b) => a.upgrade_cost_usd - b.upgrade_cost_usd);
  let detected = 1;
  for (const t of sorted) {
    if (t.upgrade_cost_usd <= paid) detected = t.level;
    else break;
  }
  return detected;
}

/** Mirror of confirm_helper_application_payment trigger logic (Pkg65). */
function confirmApplication(
  topup: Topup,
  selectedLevel: number,
  tiers: Tier[] = TIERS,
) {
  if (topup.status !== "completed") {
    return { applied: false, reason: "not_verified" as const };
  }
  if (topup.price_usd === null || topup.price_usd === undefined || topup.price_usd === "") {
    return { applied: false, reason: "bad_amount" as const };
  }
  const verified = Number(topup.price_usd);
  if (!Number.isFinite(verified) || verified < 0) {
    return { applied: false, reason: "bad_amount" as const };
  }
  const detected = deriveDetectedLevel(verified, tiers);
  return {
    applied: true,
    requested_level: detected, // auto-overrides selected
    payment_details: {
      selected_level: selectedLevel,
      detected_level: detected,
      verified_usd: verified,
      auto_verified: true,
      auto_level_adjusted: selectedLevel !== detected,
    },
  };
}

describe("Pkg75 — Helper application auto-level detection on deposit confirm", () => {
  it("detects highest qualifying tier for each exact tier amount", () => {
    expect(deriveDetectedLevel(0)).toBe(1);
    expect(deriveDetectedLevel(50)).toBe(2);
    expect(deriveDetectedLevel(150)).toBe(3);
    expect(deriveDetectedLevel(300)).toBe(4);
    expect(deriveDetectedLevel(500)).toBe(5);
  });

  it("rounds DOWN to nearest qualifying tier for in-between amounts", () => {
    expect(deriveDetectedLevel(49.99)).toBe(1);
    expect(deriveDetectedLevel(50.01)).toBe(2);
    expect(deriveDetectedLevel(149)).toBe(2);
    expect(deriveDetectedLevel(299.99)).toBe(3);
    expect(deriveDetectedLevel(499)).toBe(4);
    expect(deriveDetectedLevel(10_000)).toBe(5); // overpay caps at top tier
  });

  it("treats invalid/negative/NaN amounts as L1 (no silent upgrade)", () => {
    expect(deriveDetectedLevel(-1)).toBe(1);
    expect(deriveDetectedLevel(NaN as unknown as number)).toBe(1);
    expect(deriveDetectedLevel(Infinity)).toBe(5); // ≥ every tier
  });

  it("requested_level is auto-set to detected_level (ignores client selection)", () => {
    const topup: Topup = { id: "t1", user_id: "u1", status: "completed", price_usd: 300 };
    // User tried to cheat: selected L5 but only paid for L4
    const result = confirmApplication(topup, 5);
    expect(result.applied).toBe(true);
    if (result.applied) {
      expect(result.requested_level).toBe(4);
      expect(result.payment_details.detected_level).toBe(4);
      expect(result.payment_details.selected_level).toBe(5);
      expect(result.payment_details.auto_level_adjusted).toBe(true);
      expect(result.payment_details.auto_verified).toBe(true);
    }
  });

  it("auto-UPGRADES when user paid more than selected (e.g. selected L2, paid L4)", () => {
    const topup: Topup = { id: "t2", user_id: "u2", status: "completed", price_usd: 300 };
    const result = confirmApplication(topup, 2);
    expect(result.applied).toBe(true);
    if (result.applied) {
      expect(result.requested_level).toBe(4);
      expect(result.payment_details.auto_level_adjusted).toBe(true);
    }
  });

  it("marks auto_level_adjusted=false when selected matches detected", () => {
    const topup: Topup = { id: "t3", user_id: "u3", status: "completed", price_usd: 150 };
    const r = confirmApplication(topup, 3);
    expect(r.applied).toBe(true);
    if (r.applied) {
      expect(r.requested_level).toBe(3);
      expect(r.payment_details.auto_level_adjusted).toBe(false);
    }
  });

  it("ignores non-completed topups — no level assigned", () => {
    const pending: Topup = { id: "p", user_id: "u", status: "pending", price_usd: 500 };
    const failed: Topup = { id: "f", user_id: "u", status: "failed", price_usd: 500 };
    expect(confirmApplication(pending, 5)).toEqual({ applied: false, reason: "not_verified" });
    expect(confirmApplication(failed, 5)).toEqual({ applied: false, reason: "not_verified" });
  });

  it("handles string price_usd from DB (numeric column comes back as string in PostgREST)", () => {
    const topup: Topup = { id: "s", user_id: "u", status: "completed", price_usd: "300.00" };
    const r = confirmApplication(topup, 1);
    expect(r.applied).toBe(true);
    if (r.applied) expect(r.requested_level).toBe(4);
  });

  it("rejects null/empty price_usd as bad amount, no level assigned", () => {
    const a: Topup = { id: "a", user_id: "u", status: "completed", price_usd: null };
    expect(confirmApplication(a, 3).applied).toBe(false);
  });

  it("admin can edit tier costs; detection follows admin matrix (no hardcoded)", () => {
    const customTiers: Tier[] = [
      { level: 1, upgrade_cost_usd: 0 },
      { level: 2, upgrade_cost_usd: 75 },
      { level: 3, upgrade_cost_usd: 200 },
      { level: 4, upgrade_cost_usd: 400 },
      { level: 5, upgrade_cost_usd: 1000 },
    ];
    expect(deriveDetectedLevel(74, customTiers)).toBe(1);
    expect(deriveDetectedLevel(75, customTiers)).toBe(2);
    expect(deriveDetectedLevel(399, customTiers)).toBe(3);
    expect(deriveDetectedLevel(1000, customTiers)).toBe(5);
  });

  it("$100 Swift Pay floor (Pkg71) maps to L2 under default matrix", () => {
    // Floor is enforced upstream; here we assert post-floor detection.
    expect(deriveDetectedLevel(100)).toBe(2);
  });

  it("idempotent: re-confirming same completed topup yields identical result", () => {
    const topup: Topup = { id: "i", user_id: "u", status: "completed", price_usd: 500 };
    const r1 = confirmApplication(topup, 1);
    const r2 = confirmApplication(topup, 1);
    expect(r1).toEqual(r2);
  });
});
