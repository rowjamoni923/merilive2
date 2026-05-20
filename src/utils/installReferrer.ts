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

interface InstallReferrerPlugin {
  getReferrer(): Promise<{ referrer: string; cached: boolean; responseCode?: number }>;
}

const Native = registerPlugin<InstallReferrerPlugin>("InstallReferrer");

const PROCESSED_KEY = "meri_install_referrer_processed";

/** Decode the Play Store install referrer string and store the relevant keys. */
function applyReferrer(raw: string): void {
  if (!raw) return;

  // Play sends a URL-encoded query string, e.g.
  //   "utm_source=app&ref=ABC123" or "ref%3DABC123%26agency%3DAG42"
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* keep raw */ }

  const params = new URLSearchParams(decoded.includes("=") ? decoded : "");

  const ref = params.get("ref") || params.get("invitation");
  const agency = params.get("agency") || params.get("code");

  if (ref) {
    localStorage.setItem("meri_pending_invitation_ref", ref);
    localStorage.setItem("meri_pending_referral", ref);
  }
  if (agency) {
    localStorage.setItem("meri_pending_referral", agency);
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
