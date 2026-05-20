/**
 * Pkg62 — Google Play Install Referrer bridge (JS side).
 *
 * On native Android, asks our InstallReferrerPlugin for the Play Store
 * install-referrer string (written by Google Play when the user clicked
 * a Play link with ?referrer=...). Parses it and writes the right keys
 * into localStorage so the existing referral / invitation / agency flow
 * picks them up automatically — same keys DeepLinkHandler writes:
 *   - meri_pending_invitation_ref  → My Invitations counts the inviter
 *   - meri_pending_referral        → JoinAgency auto-fills agency code
 *
 * Runs at most once per install (plugin caches the response). Subsequent
 * launches early-exit on a localStorage marker.
 */
import { registerPlugin, Capacitor } from "@capacitor/core";
import { parseReferralPayload } from "./referralParsing";

interface InstallReferrerPlugin {
  getReferrer(): Promise<{ referrer: string; cached: boolean; responseCode?: number }>;
}

const Native = registerPlugin<InstallReferrerPlugin>("InstallReferrer");

const PROCESSED_KEY = "meri_install_referrer_processed";

/** Decode the Play Store install referrer string and store the relevant keys. */
function applyReferrer(raw: string): void {
  if (!raw) return;

  // Pkg67: shared parser handles every alias we accept
  // (ref/r/uid/invite/invitation/inviter[_uid|_id], and
  //  agency/agencyCode/agency_code/code/agent/agent_code/...).
  const { ref, agencyCode } = parseReferralPayload(raw);

  if (ref) {
    localStorage.setItem("meri_pending_invitation_ref", ref);
    localStorage.setItem("meri_pending_referral", ref);
  }
  if (agencyCode) {
    // Agency code overrides ref for the agency-pending slot — JoinAgency
    // reads this exact key. Invitation tracking still uses the ref key.
    localStorage.setItem("meri_pending_referral", agencyCode);
  }
}

/** Call once on app launch. Safe on web (no-op). */
export async function processInstallReferrer(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    if (Capacitor.getPlatform() !== "android") return;
    if (localStorage.getItem(PROCESSED_KEY) === "1") return;

    const result = await Native.getReferrer();
    if (result?.referrer) applyReferrer(result.referrer);
    localStorage.setItem(PROCESSED_KEY, "1");
    console.log("[InstallReferrer] processed:", result?.referrer || "(empty)");
  } catch (e) {
    console.warn("[InstallReferrer] failed:", e);
  }
}
