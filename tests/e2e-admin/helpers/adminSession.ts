import type { Page, BrowserContext } from "@playwright/test";

/**
 * Inject a pre-issued admin session into the browser BEFORE any page script
 * runs. This bypasses the AdminAuth password flow but reuses the same storage
 * contract the real admin client expects (see src/utils/adminSession.ts and
 * src/utils/adminAccessStorage.ts).
 *
 * Requires env:
 *   E2E_ADMIN_TOKEN          → admin_sessions.session_token (x-admin-token)
 *   E2E_ADMIN_ACCESS_TOKEN   → matching gala-… secret-link token
 *   E2E_ADMIN_ID  (optional) → admin_users.id (display only)
 *   E2E_ADMIN_EMAIL (opt.)   → admin_users.email (display only)
 *   E2E_ADMIN_IS_OWNER       → "true" to enable owner privileges flag
 */
export async function injectAdminSession(ctx: BrowserContext): Promise<void> {
  const sessionToken = process.env.E2E_ADMIN_TOKEN!;
  const linkToken = process.env.E2E_ADMIN_ACCESS_TOKEN!;
  const isOwner = (process.env.E2E_ADMIN_IS_OWNER || "true") === "true";
  const session = {
    version: "v2",
    admin_id: process.env.E2E_ADMIN_ID || "00000000-0000-0000-0000-00000000e2ee",
    email: process.env.E2E_ADMIN_EMAIL || "e2e@admin.local",
    display_name: "E2E Admin",
    role: isOwner ? "owner" : "sub_admin",
    is_owner: isOwner,
    must_change_password: false,
    device_fingerprint: "e2e-device",
    signed_in_at: Date.now(),
    session_token: sessionToken,
  };

  await ctx.addInitScript(
    ({ session, sessionToken, linkToken, isOwner }) => {
      try {
        // Tab-scoped: secret-link gate + access flags
        sessionStorage.setItem("meri_admin_link_token", linkToken);
        sessionStorage.setItem("meri_admin_access", "true");
        if (isOwner) sessionStorage.setItem("meri_owner_access", "true");
        // Persistent: admin session blob + x-admin-token
        localStorage.setItem("merilive-admin-session", JSON.stringify(session));
        localStorage.setItem("merilive-admin-token", sessionToken);
      } catch {
        // ignore — page will redirect if injection failed
      }
    },
    { session, sessionToken, linkToken, isOwner },
  );
}

/** Convenience for single-page tests. */
export async function loginAdmin(page: Page): Promise<void> {
  await injectAdminSession(page.context());
}
