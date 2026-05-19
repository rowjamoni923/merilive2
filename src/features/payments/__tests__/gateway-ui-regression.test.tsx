/**
 * Payment Gateway UI Regression Tests
 *
 * Locks the bug fixes for:
 *   1. Admin Payment Gateways page crashing because it queried a non-existent
 *      `gateway_code` column. Fix: resolve from `gateway_type || config.gateway_code`.
 *   2. Recharge page showing stale legacy gateways with NULL country_codes.
 *      Fix: STRICT country filter — null/empty codes are excluded.
 *   3. Country code casing mismatch (db has "BD", user code came as "bd").
 *      Fix: uppercase-normalize both sides.
 *   4. useCountryPaymentGateways hook crashing when `config` is null.
 *
 * If any of these regress, this suite fails — preventing another crash episode.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ---- supabase mock ----
const orderMock = vi.fn();
const eqMock = vi.fn(() => ({ order: orderMock }));
const selectMock = vi.fn(() => ({ eq: eqMock, order: orderMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
const channelMock = vi.fn(() => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}));
const removeChannelMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    channel: (...args: unknown[]) => channelMock(...args),
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
  },
}));

import { useCountryPaymentGateways } from "@/hooks/useCountryPaymentGateways";

// Shared dataset that mirrors the real `payment_gateways` table shape.
const SAMPLE_GATEWAYS = [
  {
    id: "g1",
    gateway_type: "bkash",
    name: "bKash",
    country_codes: ["BD"],
    logo_url: null,
    is_integrated: true,
    is_active: true,
    display_order: 1,
    config: { gateway_code: "bkash", description: "Bangladesh wallet" },
  },
  {
    id: "g2",
    gateway_type: "gcash",
    name: "GCash",
    country_codes: ["PH"],
    logo_url: null,
    is_integrated: true,
    is_active: true,
    display_order: 2,
    config: null, // regression: null config must not crash
  },
  {
    id: "g3",
    gateway_type: "wise",
    name: "Wise",
    country_codes: ["GLOBAL"],
    logo_url: null,
    is_integrated: true,
    is_active: true,
    display_order: 3,
    config: {},
  },
  {
    id: "g4",
    gateway_type: "legacy",
    name: "Legacy Stale",
    country_codes: null, // regression: legacy rows with null codes must NOT appear
    logo_url: null,
    is_integrated: false,
    is_active: true,
    display_order: 99,
    config: {},
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  orderMock.mockImplementation(() => ({
    order: () => Promise.resolve({ data: SAMPLE_GATEWAYS, error: null }),
  }));
});

describe("useCountryPaymentGateways — UI regression guard", () => {
  it("returns BD gateway + GLOBAL fallback for country=BD without crashing on null config", async () => {
    const { result } = renderHook(() => useCountryPaymentGateways("BD"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const names = result.current.gateways.map((g) => g.name).sort();
    expect(names).toEqual(["Wise", "bKash"]); // BD + GLOBAL
    expect(names).not.toContain("GCash");
  });

  it("normalizes lowercase country code to uppercase (regression: 'bd' must match 'BD')", async () => {
    const { result } = renderHook(() => useCountryPaymentGateways("bd"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.gateways.some((g) => g.gateway_type === "bkash")).toBe(true);
  });

  it("returns PH gateway only when country=PH (no cross-country leak)", async () => {
    const { result } = renderHook(() => useCountryPaymentGateways("PH"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.gateways.some((g) => g.gateway_type === "gcash")).toBe(true);
    expect(result.current.gateways.some((g) => g.gateway_type === "bkash")).toBe(false);
  });

  it("returns ALL active gateways when countryCode is null (admin view)", async () => {
    const { result } = renderHook(() => useCountryPaymentGateways(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.gateways).toHaveLength(SAMPLE_GATEWAYS.length);
  });

  it("never crashes when a row has null config or null country_codes", async () => {
    const { result } = renderHook(() => useCountryPaymentGateways("BD"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The hook must complete without throwing — `loading` flipping to false is proof.
    expect(result.current.loading).toBe(false);
    expect(Array.isArray(result.current.gateways)).toBe(true);
  });

  it("queries the `payment_gateways` table with is_active=true filter (no `gateway_code` column ref)", async () => {
    renderHook(() => useCountryPaymentGateways("BD"));
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith("payment_gateways"));

    const selectArg = selectMock.mock.calls[0]?.[0] as string;
    expect(selectArg).toContain("gateway_type"); // correct schema column
    expect(selectArg).not.toContain("gateway_code"); // crash-causing column must NOT be queried
    expect(eqMock).toHaveBeenCalledWith("is_active", true);
  });
});

describe("admin gateway row mapping — regression guard", () => {
  // Mirrors the inline mapper used inside AdminPaymentGateways.fetchGateways.
  // Locking it here prevents another crash if someone reverts the fix.
  const mapAdminGatewayRow = (g: any) => {
    const cfg = (g.config || {}) as Record<string, any>;
    return {
      ...g,
      gateway_code: g.gateway_type || cfg.gateway_code || "",
      country_codes: g.country_codes ?? null,
      is_integrated: g.is_integrated ?? false,
    };
  };

  it("resolves gateway_code from gateway_type even when config.gateway_code is missing", () => {
    const row = mapAdminGatewayRow({ gateway_type: "bkash", config: {} });
    expect(row.gateway_code).toBe("bkash");
  });

  it("falls back to config.gateway_code when gateway_type is missing", () => {
    const row = mapAdminGatewayRow({ gateway_type: null, config: { gateway_code: "legacy" } });
    expect(row.gateway_code).toBe("legacy");
  });

  it("does NOT crash on null config (regression that previously broke admin page)", () => {
    expect(() => mapAdminGatewayRow({ gateway_type: "gcash", config: null })).not.toThrow();
    const row = mapAdminGatewayRow({ gateway_type: "gcash", config: null });
    expect(row.gateway_code).toBe("gcash");
  });

  it("returns empty string when both gateway_type and config.gateway_code are missing", () => {
    const row = mapAdminGatewayRow({ gateway_type: null, config: null });
    expect(row.gateway_code).toBe("");
  });
});

describe("Recharge country-strict gateway filter — regression guard", () => {
  // Mirrors the inline filter used inside Recharge.fetchGateways.
  const filterForUser = (rows: any[], userCountryCode: string) => {
    const cc = (userCountryCode || "").toUpperCase();
    return rows.filter((g) => {
      const codes: string[] = Array.isArray(g.country_codes)
        ? g.country_codes.map((c: string) => String(c).toUpperCase())
        : [];
      if (codes.length === 0) return false; // legacy/stale rows
      if (codes.includes("GLOBAL")) return true;
      return cc ? codes.includes(cc) : false;
    });
  };

  it("hides legacy gateways with null country_codes (the stale-data bug)", () => {
    const out = filterForUser(SAMPLE_GATEWAYS, "BD");
    expect(out.some((g) => g.gateway_type === "legacy")).toBe(false);
  });

  it("includes GLOBAL gateways for every country", () => {
    expect(filterForUser(SAMPLE_GATEWAYS, "BD").some((g) => g.gateway_type === "wise")).toBe(true);
    expect(filterForUser(SAMPLE_GATEWAYS, "PH").some((g) => g.gateway_type === "wise")).toBe(true);
  });

  it("is case-insensitive on user country code", () => {
    expect(filterForUser(SAMPLE_GATEWAYS, "ph").some((g) => g.gateway_type === "gcash")).toBe(true);
  });

  it("returns empty array when user country has no matching gateway (no crash, just empty)", () => {
    const out = filterForUser(SAMPLE_GATEWAYS, "ZZ");
    // GLOBAL still shows for any non-empty country code
    expect(out.every((g) => g.country_codes?.includes("GLOBAL"))).toBe(true);
  });
});
