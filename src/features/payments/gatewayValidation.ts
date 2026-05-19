/**
 * Strict validation for payment gateway selection + country filtering.
 *
 * Goal: every mismatch (bad country code, missing gateway_type, gateway not
 * available in the user's country) throws a typed, *named* error — never a
 * silent crash, never a wrong charge.
 *
 * Used by:
 *  - `useCountryPaymentGateways` hook (server → normalized row)
 *  - `Recharge` page right before `payment_transactions.insert`
 *  - Admin gateway list mapping
 */

export class PaymentValidationError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PaymentValidationError";
    this.code = code;
    this.details = details;
  }
}

/** ISO 3166-1 alpha-2 (2 uppercase letters) OR the synthetic 'GLOBAL' tag. */
const COUNTRY_RE = /^[A-Z]{2}$/;
/** Gateway types we accept: lowercase letters, digits, underscores. */
const GATEWAY_TYPE_RE = /^[a-z0-9_]{2,32}$/;

export function normalizeCountryCode(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string") {
    throw new PaymentValidationError(
      "INVALID_COUNTRY_TYPE",
      `Country code must be a string, got ${typeof input}`,
      { input },
    );
  }
  const cc = input.trim().toUpperCase();
  if (cc === "GLOBAL") return "GLOBAL";
  if (!COUNTRY_RE.test(cc)) {
    throw new PaymentValidationError(
      "INVALID_COUNTRY_CODE",
      `Country code "${input}" is not ISO 3166-1 alpha-2`,
      { input },
    );
  }
  return cc;
}

export function normalizeCountryList(input: unknown): string[] {
  if (input === null || input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new PaymentValidationError(
      "INVALID_COUNTRY_LIST",
      "country_codes must be an array or null",
      { input },
    );
  }
  const out: string[] = [];
  for (const raw of input) {
    const cc = normalizeCountryCode(raw);
    if (cc) out.push(cc);
  }
  return out;
}

export function validateGatewayType(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new PaymentValidationError(
      "MISSING_GATEWAY_TYPE",
      "gateway_type is required and must be a non-empty string",
      { input },
    );
  }
  const v = input.trim().toLowerCase();
  if (!GATEWAY_TYPE_RE.test(v)) {
    throw new PaymentValidationError(
      "INVALID_GATEWAY_TYPE",
      `gateway_type "${input}" is not a valid slug (a-z, 0-9, _)`,
      { input },
    );
  }
  return v;
}

/**
 * Raw row → normalized gateway. Throws on bad shape so a bad row can't reach
 * the UI and silently crash later.
 */
export interface NormalizedGateway {
  id: string;
  gateway_type: string;
  name: string;
  country_codes: string[];
  is_active: boolean;
  is_integrated: boolean;
  config: Record<string, unknown>;
}

export function normalizeGatewayRow(row: unknown): NormalizedGateway {
  if (!row || typeof row !== "object") {
    throw new PaymentValidationError("INVALID_GATEWAY_ROW", "gateway row is null or not an object", { row });
  }
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0) {
    throw new PaymentValidationError("MISSING_GATEWAY_ID", "gateway.id missing", { row });
  }
  if (typeof r.name !== "string" || r.name.length === 0) {
    throw new PaymentValidationError("MISSING_GATEWAY_NAME", "gateway.name missing", { id: r.id });
  }
  const config = (r.config && typeof r.config === "object" ? r.config : {}) as Record<string, unknown>;
  // Fallback chain mirrors AdminPaymentGateways mapping.
  const gateway_type = validateGatewayType(
    (r.gateway_type as string | undefined) || (config.gateway_code as string | undefined) || "",
  );
  return {
    id: r.id,
    gateway_type,
    name: r.name,
    country_codes: normalizeCountryList(r.country_codes),
    is_active: r.is_active !== false,
    is_integrated: r.is_integrated === true,
    config,
  };
}

/**
 * Decide whether a normalized gateway is available to a user in `userCountry`.
 * Returns true if:
 *  - gateway has 'GLOBAL' in country_codes, OR
 *  - gateway's country_codes contains the user's country code
 *
 * Empty country_codes => NEVER available (legacy/stale rows hidden).
 */
export function gatewayServesCountry(gateway: NormalizedGateway, userCountry: string | null): boolean {
  if (!Array.isArray(gateway.country_codes) || gateway.country_codes.length === 0) return false;
  if (gateway.country_codes.includes("GLOBAL")) return true;
  if (!userCountry) return false;
  const cc = normalizeCountryCode(userCountry);
  return !!cc && gateway.country_codes.includes(cc);
}

/**
 * Hard guard used right before creating a `payment_transactions` row.
 * Throws PaymentValidationError if the selected gateway does not serve the
 * user's country — prevents money flowing through a gateway that won't settle.
 */
export function assertGatewayMatchesCountry(
  gateway: { id?: string; gateway_type?: string | null; country_codes?: unknown },
  userCountry: string | null | undefined,
): void {
  if (!gateway || typeof gateway !== "object") {
    throw new PaymentValidationError("MISSING_GATEWAY", "No gateway selected", { gateway });
  }
  const gatewayType = validateGatewayType(gateway.gateway_type ?? "");
  const codes = normalizeCountryList(gateway.country_codes);
  const cc = userCountry == null ? null : normalizeCountryCode(userCountry);

  if (codes.length === 0) {
    throw new PaymentValidationError(
      "GATEWAY_HAS_NO_COUNTRY",
      `Gateway "${gatewayType}" has no country binding — refusing to charge`,
      { gatewayType, userCountry: cc },
    );
  }
  if (codes.includes("GLOBAL")) return;
  if (!cc) {
    throw new PaymentValidationError(
      "USER_COUNTRY_UNKNOWN",
      `Cannot use gateway "${gatewayType}" — user country is unknown`,
      { gatewayType, gatewayCountries: codes },
    );
  }
  if (!codes.includes(cc)) {
    throw new PaymentValidationError(
      "GATEWAY_COUNTRY_MISMATCH",
      `Gateway "${gatewayType}" does not serve country "${cc}"`,
      { gatewayType, userCountry: cc, gatewayCountries: codes },
    );
  }
}
