import { describe, it, expect } from "vitest";
import {
  validateTopupRate,
  validateUsdAmount,
  usdToDiamonds,
  computeTopupApproval,
} from "../traderWalletTopupRate";

describe("validateTopupRate", () => {
  it("accepts object config with usd_per_100k_diamonds", () => {
    expect(validateTopupRate({ usd_per_100k_diamonds: 100 })).toEqual({
      ok: true,
      rate: 100,
    });
  });

  it("accepts numeric string", () => {
    expect(validateTopupRate({ usd_per_100k_diamonds: "85.5" })).toEqual({
      ok: true,
      rate: 85.5,
    });
  });

  it("accepts bare number config", () => {
    expect(validateTopupRate(120)).toEqual({ ok: true, rate: 120 });
  });

  it("rejects null/undefined/empty configs", () => {
    expect(validateTopupRate(null).ok).toBe(false);
    expect(validateTopupRate(undefined).ok).toBe(false);
    expect(validateTopupRate({}).ok).toBe(false);
    expect(validateTopupRate({ usd_per_100k_diamonds: null }).ok).toBe(false);
    expect(validateTopupRate({ usd_per_100k_diamonds: "" }).ok).toBe(false);
  });

  it("rejects zero, negative, NaN, Infinity", () => {
    expect(validateTopupRate({ usd_per_100k_diamonds: 0 }).ok).toBe(false);
    expect(validateTopupRate({ usd_per_100k_diamonds: -1 }).ok).toBe(false);
    expect(validateTopupRate({ usd_per_100k_diamonds: "abc" }).ok).toBe(false);
    expect(validateTopupRate({ usd_per_100k_diamonds: Number.POSITIVE_INFINITY }).ok).toBe(false);
    expect(validateTopupRate({ usd_per_100k_diamonds: Number.NaN }).ok).toBe(false);
  });
});

describe("validateUsdAmount", () => {
  it("accepts positive numbers and numeric strings", () => {
    expect(validateUsdAmount(10)).toEqual({ ok: true, usd: 10 });
    expect(validateUsdAmount("25.75")).toEqual({ ok: true, usd: 25.75 });
  });

  it("rejects blank, zero, negative, non-numeric", () => {
    expect(validateUsdAmount("").ok).toBe(false);
    expect(validateUsdAmount(null).ok).toBe(false);
    expect(validateUsdAmount(undefined).ok).toBe(false);
    expect(validateUsdAmount(0).ok).toBe(false);
    expect(validateUsdAmount(-5).ok).toBe(false);
    expect(validateUsdAmount("xyz").ok).toBe(false);
  });
});

describe("usdToDiamonds — deterministic formula", () => {
  // Mirrors SQL: floor(usd * 100000 / usd_per_100k)
  it("rate=100: $1 → 1,000 💎", () => {
    expect(usdToDiamonds(1, 100)).toBe(1000);
  });

  it("rate=100: $100 → 100,000 💎", () => {
    expect(usdToDiamonds(100, 100)).toBe(100_000);
  });

  it("rate=100: $250.50 → 250,500 💎", () => {
    expect(usdToDiamonds(250.5, 100)).toBe(250_500);
  });

  it("rate=85: $10 → 11,764 💎 (FLOOR rounding, never up)", () => {
    // 10 * 100000 / 85 = 11764.7058… → floor = 11764
    expect(usdToDiamonds(10, 85)).toBe(11_764);
  });

  it("rate=85.5: $50 → 58,479 💎 (decimal rate, FLOOR)", () => {
    // 50 * 100000 / 85.5 = 58479.5321… → floor = 58479
    expect(usdToDiamonds(50, 85.5)).toBe(58_479);
  });

  it("rate=100: $0.01 → 1 💎 (smallest positive credit)", () => {
    expect(usdToDiamonds(0.01, 100)).toBe(1);
  });

  it("rate=1000: $0.01 → 0 💎 (below 1-diamond floor)", () => {
    // 0.01 * 100000 / 1000 = 1 → floor = 1; pick higher rate for 0
    expect(usdToDiamonds(0.001, 1000)).toBe(0);
  });

  it("is deterministic across many runs (same input → same output)", () => {
    const inputs: Array<[number, number]> = [
      [1, 100], [12.34, 85], [99.99, 120], [500, 95.5], [0.5, 100],
    ];
    for (const [usd, rate] of inputs) {
      const first = usdToDiamonds(usd, rate);
      for (let i = 0; i < 25; i++) {
        expect(usdToDiamonds(usd, rate)).toBe(first);
      }
    }
  });

  it("throws on invalid usd", () => {
    expect(() => usdToDiamonds(0, 100)).toThrow();
    expect(() => usdToDiamonds(-1, 100)).toThrow();
    expect(() => usdToDiamonds(Number.NaN, 100)).toThrow();
    expect(() => usdToDiamonds(Number.POSITIVE_INFINITY, 100)).toThrow();
  });

  it("throws on invalid rate", () => {
    expect(() => usdToDiamonds(10, 0)).toThrow();
    expect(() => usdToDiamonds(10, -50)).toThrow();
    expect(() => usdToDiamonds(10, Number.NaN)).toThrow();
  });
});

describe("computeTopupApproval — end-to-end gate", () => {
  it("returns diamonds when rate + usd are valid", () => {
    const r = computeTopupApproval({ usd_per_100k_diamonds: 100 }, "50");
    expect(r).toEqual({ ok: true, diamonds: 50_000, rate: 100, usd: 50 });
  });

  it("blocks approval when rate config is missing", () => {
    const r = computeTopupApproval(null, 10);
    expect(r.ok).toBe(false);
  });

  it("blocks approval when rate is invalid (0 / negative / NaN)", () => {
    expect(computeTopupApproval({ usd_per_100k_diamonds: 0 }, 10).ok).toBe(false);
    expect(computeTopupApproval({ usd_per_100k_diamonds: -5 }, 10).ok).toBe(false);
    expect(computeTopupApproval({ usd_per_100k_diamonds: "abc" }, 10).ok).toBe(false);
  });

  it("blocks approval when usd is missing or invalid", () => {
    expect(computeTopupApproval({ usd_per_100k_diamonds: 100 }, "").ok).toBe(false);
    expect(computeTopupApproval({ usd_per_100k_diamonds: 100 }, 0).ok).toBe(false);
    expect(computeTopupApproval({ usd_per_100k_diamonds: 100 }, -1).ok).toBe(false);
  });

  it("blocks when computed diamonds would be 0", () => {
    // rate is gigantic so any tiny usd floors to 0
    const r = computeTopupApproval({ usd_per_100k_diamonds: 1_000_000_000 }, 0.000001);
    expect(r.ok).toBe(false);
  });
});
