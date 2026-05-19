import { describe, it, expect } from "vitest";
import {
  PaymentValidationError,
  normalizeCountryCode,
  normalizeCountryList,
  validateGatewayType,
  normalizeGatewayRow,
  gatewayServesCountry,
  assertGatewayMatchesCountry,
} from "../gatewayValidation";

describe("normalizeCountryCode", () => {
  it("uppercases valid ISO codes", () => {
    expect(normalizeCountryCode("bd")).toBe("BD");
    expect(normalizeCountryCode("US")).toBe("US");
    expect(normalizeCountryCode(" ph ")).toBe("PH");
  });
  it("accepts GLOBAL", () => {
    expect(normalizeCountryCode("global")).toBe("GLOBAL");
  });
  it("returns null for empty/nullish", () => {
    expect(normalizeCountryCode(null)).toBeNull();
    expect(normalizeCountryCode(undefined)).toBeNull();
    expect(normalizeCountryCode("")).toBeNull();
  });
  it("throws on non-string input (NEVER silent)", () => {
    expect(() => normalizeCountryCode(42)).toThrow(PaymentValidationError);
    expect(() => normalizeCountryCode({})).toThrow(/INVALID_COUNTRY_TYPE|string/);
  });
  it("throws on malformed code", () => {
    expect(() => normalizeCountryCode("BAD")).toThrow(expect.objectContaining({ code: "INVALID_COUNTRY_CODE" }));
    expect(() => normalizeCountryCode("B1")).toThrow(expect.objectContaining({ code: "INVALID_COUNTRY_CODE" }));
  });
});

describe("normalizeCountryList", () => {
  it("returns [] for null/undefined", () => {
    expect(normalizeCountryList(null)).toEqual([]);
    expect(normalizeCountryList(undefined)).toEqual([]);
  });
  it("uppercases and filters empties", () => {
    expect(normalizeCountryList(["bd", "PH", "", "global"])).toEqual(["BD", "PH", "GLOBAL"]);
  });
  it("throws on non-array input", () => {
    expect(() => normalizeCountryList("BD")).toThrow(expect.objectContaining({ code: "INVALID_COUNTRY_LIST" }));
  });
  it("throws if any entry is malformed (no silent skip)", () => {
    expect(() => normalizeCountryList(["BD", "BAD"])).toThrow(expect.objectContaining({ code: "INVALID_COUNTRY_CODE" }));
  });
});

describe("validateGatewayType", () => {
  it("accepts lowercase slugs", () => {
    expect(validateGatewayType("bkash")).toBe("bkash");
    expect(validateGatewayType("wave_mm")).toBe("wave_mm");
  });
  it("normalizes case and whitespace", () => {
    expect(validateGatewayType("  GCash ")).toBe("gcash");
  });
  it("throws on empty/missing", () => {
    expect(() => validateGatewayType("")).toThrow(expect.objectContaining({ code: "MISSING_GATEWAY_TYPE" }));
    expect(() => validateGatewayType(null)).toThrow(expect.objectContaining({ code: "MISSING_GATEWAY_TYPE" }));
  });
  it("throws on invalid characters (no silent acceptance)", () => {
    expect(() => validateGatewayType("bkash-pro")).toThrow(expect.objectContaining({ code: "INVALID_GATEWAY_TYPE" }));
    expect(() => validateGatewayType("a")).toThrow(expect.objectContaining({ code: "INVALID_GATEWAY_TYPE" }));
  });
});

describe("normalizeGatewayRow", () => {
  const good = {
    id: "g1",
    name: "bKash",
    gateway_type: "bkash",
    country_codes: ["BD"],
    is_active: true,
    is_integrated: true,
    config: { description: "wallet" },
  };
  it("normalizes a good row", () => {
    const out = normalizeGatewayRow(good);
    expect(out.gateway_type).toBe("bkash");
    expect(out.country_codes).toEqual(["BD"]);
    expect(out.is_active).toBe(true);
  });
  it("falls back to config.gateway_code when gateway_type missing", () => {
    const out = normalizeGatewayRow({ ...good, gateway_type: null, config: { gateway_code: "bkash" } });
    expect(out.gateway_type).toBe("bkash");
  });
  it("treats null config as empty object (no crash)", () => {
    const out = normalizeGatewayRow({ ...good, config: null });
    expect(out.config).toEqual({});
  });
  it("throws (NEVER silent) on missing id/name/type", () => {
    expect(() => normalizeGatewayRow({ ...good, id: "" })).toThrow(expect.objectContaining({ code: "MISSING_GATEWAY_ID" }));
    expect(() => normalizeGatewayRow({ ...good, name: "" })).toThrow(expect.objectContaining({ code: "MISSING_GATEWAY_NAME" }));
    expect(() => normalizeGatewayRow({ ...good, gateway_type: null, config: {} })).toThrow(
      /MISSING_GATEWAY_TYPE/,
    );
  });
  it("throws on bad country codes inside the row", () => {
    expect(() => normalizeGatewayRow({ ...good, country_codes: ["BAD"] })).toThrow(expect.objectContaining({ code: "INVALID_COUNTRY_CODE" }));
  });
});

describe("gatewayServesCountry", () => {
  const mk = (codes: string[]) =>
    normalizeGatewayRow({ id: "x", name: "X", gateway_type: "x_pay", country_codes: codes, config: {} });

  it("matches country listed in codes", () => {
    expect(gatewayServesCountry(mk(["BD"]), "BD")).toBe(true);
    expect(gatewayServesCountry(mk(["BD"]), "PH")).toBe(false);
  });
  it("GLOBAL serves any country", () => {
    expect(gatewayServesCountry(mk(["GLOBAL"]), "BD")).toBe(true);
    expect(gatewayServesCountry(mk(["GLOBAL"]), "ZZ" as any)).toBe(true); // never reached but defensive
  });
  it("empty codes serve nobody (hide legacy/stale)", () => {
    expect(gatewayServesCountry(mk([]), "BD")).toBe(false);
  });
  it("null userCountry => only GLOBAL", () => {
    expect(gatewayServesCountry(mk(["BD"]), null)).toBe(false);
    expect(gatewayServesCountry(mk(["GLOBAL"]), null)).toBe(true);
  });
});

describe("assertGatewayMatchesCountry — HARD GUARD before charging", () => {
  const g = (code: string, codes: string[]) => ({
    id: "g1",
    gateway_type: code,
    country_codes: codes,
  });

  it("passes for matching country", () => {
    expect(() => assertGatewayMatchesCountry(g("bkash", ["BD"]), "BD")).not.toThrow();
  });
  it("passes for GLOBAL regardless of user country", () => {
    expect(() => assertGatewayMatchesCountry(g("wise", ["GLOBAL"]), "JP")).not.toThrow();
  });
  it("throws GATEWAY_COUNTRY_MISMATCH on wrong country", () => {
    expect(() => assertGatewayMatchesCountry(g("bkash", ["BD"]), "PH")).toThrow(expect.objectContaining({ code: "GATEWAY_COUNTRY_MISMATCH" }));
  });
  it("throws GATEWAY_HAS_NO_COUNTRY on stale/empty codes", () => {
    expect(() => assertGatewayMatchesCountry(g("legacy", []), "BD")).toThrow(expect.objectContaining({ code: "GATEWAY_HAS_NO_COUNTRY" }));
  });
  it("throws USER_COUNTRY_UNKNOWN when user country missing and gateway not GLOBAL", () => {
    expect(() => assertGatewayMatchesCountry(g("bkash", ["BD"]), null)).toThrow(expect.objectContaining({ code: "USER_COUNTRY_UNKNOWN" }));
    expect(() => assertGatewayMatchesCountry(g("bkash", ["BD"]), "")).toThrow(expect.objectContaining({ code: "USER_COUNTRY_UNKNOWN" }));
  });
  it("throws MISSING_GATEWAY when no gateway provided", () => {
    expect(() => assertGatewayMatchesCountry(null as any, "BD")).toThrow(expect.objectContaining({ code: "MISSING_GATEWAY" }));
  });
  it("throws MISSING_GATEWAY_TYPE when gateway_type is empty", () => {
    expect(() => assertGatewayMatchesCountry({ id: "g1", gateway_type: "", country_codes: ["BD"] }, "BD"))
      .toThrow(expect.objectContaining({ code: "MISSING_GATEWAY_TYPE" }));
  });
  it("normalizes user country casing before matching", () => {
    expect(() => assertGatewayMatchesCountry(g("bkash", ["BD"]), "bd")).not.toThrow();
  });
  it("throws INVALID_COUNTRY_CODE on user country garbage (never silent fallback)", () => {
    expect(() => assertGatewayMatchesCountry(g("bkash", ["BD"]), "BAD")).toThrow(expect.objectContaining({ code: "INVALID_COUNTRY_CODE" }));
  });
});
