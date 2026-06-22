export const AGREEMENT_VERSION = "v1";

export type AgreementVars = {
  full_name: string;
  business_name?: string;
  country_code: string;
  full_address: string;
  official_email: string;
  official_phone: string;
  whatsapp?: string;
  nid_country: string;
  nid_number: string;
  deposit_amount_usd: number;
  commission_percent: number;
  date_iso: string;
};

export function buildAgreementText(v: AgreementVars): string[] {
  const dateStr = new Date(v.date_iso).toLocaleDateString("en-GB", {
    year: "numeric", month: "long", day: "numeric",
  });
  return [
    `MeriLive — Country Super Admin (Level 6 / Contract Tier) Agreement`,
    `Version ${AGREEMENT_VERSION} · Executed on ${dateStr}`,
    ``,
    `THIS AGREEMENT is made between MeriLive Platform ("Company") and the undersigned individual ("Country Super Admin").`,
    ``,
    `1. PARTIES`,
    `   1.1 Name: ${v.full_name}`,
    `   1.2 Business / Trade Name: ${v.business_name || "—"}`,
    `   1.3 Country of Operation: ${v.country_code}`,
    `   1.4 Full Address: ${v.full_address}`,
    `   1.5 Official Email: ${v.official_email}`,
    `   1.6 Official Phone: ${v.official_phone}`,
    `   1.7 WhatsApp: ${v.whatsapp || "—"}`,
    `   1.8 National ID Country: ${v.nid_country}`,
    `   1.9 National ID Number: ${v.nid_number}`,
    ``,
    `2. SCOPE OF DUTY`,
    `   The Country Super Admin is appointed at Level 6 (Contract Tier) of the MeriLive helper hierarchy,`,
    `   sitting above Levels 1–5 helpers, to manage payroll, withdrawals and approved local payment`,
    `   methods exclusively for the country named above.`,
    ``,
    `3. FINANCIAL TERMS`,
    `   3.1 Security Deposit: The Country Super Admin shall deposit a non-refundable security`,
    `       commitment of US$ ${v.deposit_amount_usd.toLocaleString()} (Ten Thousand US Dollars or more)`,
    `       with the Company prior to activation.`,
    `   3.2 Commission: The Country Super Admin shall earn up to ${v.commission_percent}%`,
    `       (twenty-five percent maximum) commission on every completed withdrawal originating`,
    `       from the country of operation, credited automatically to their account.`,
    `   3.3 Priority: As Level 6 / Contract Tier, the holder receives the highest priority over all`,
    `       Levels 1–5 helpers in the same country.`,
    ``,
    `4. OBLIGATIONS`,
    `   4.1 The Country Super Admin warrants that all information, identification documents`,
    `       and contact details submitted are 100% genuine and verifiable.`,
    `   4.2 Submission of any false, forged or impersonated identity document shall result`,
    `       in immediate termination, forfeiture of the deposit and legal action.`,
    `   4.3 The Country Super Admin shall keep the Company informed of any change of`,
    `       address, contact or banking detail within 48 hours.`,
    ``,
    `5. VERIFICATION`,
    `   The Company shall officially contact the Country Super Admin via the email and phone`,
    `   above and may request video verification before activation. No assignment becomes`,
    `   effective until written approval is issued by the Company.`,
    ``,
    `6. SUSPENSION & REVOCATION`,
    `   The Company may suspend or revoke this appointment at any time for breach of these`,
    `   terms, fraud, misuse of authority or violation of platform policies.`,
    ``,
    `7. JURISDICTION & GOVERNING LAW`,
    `   This Agreement shall be governed by the laws applicable to MeriLive's platform`,
    `   operations and the courts having jurisdiction over the Company.`,
    ``,
    `8. DIGITAL SIGNATURE`,
    `   By signing below electronically, the Country Super Admin confirms that they have read,`,
    `   understood and accepted every clause of this Agreement and that the signature affixed`,
    `   below is their own.`,
  ];
}
