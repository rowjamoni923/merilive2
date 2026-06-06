/**
 * Developer access whitelist.
 *
 * Only the email addresses listed here can see the "Developer Options" entry
 * in Settings and access the /developer-options screen. Anyone else (even if
 * they guess the URL) is redirected away.
 *
 * Match is case-insensitive and trimmed. This is gated by Supabase Auth — the
 * user must be logged in AND their auth email must be on this list.
 *
 * IMPORTANT: To revoke access, remove the email here and ship a new build.
 * Do NOT add general users — this screen exposes risky native toggles.
 */
export const DEV_ACCESS_EMAILS: ReadonlyArray<string> = [
  "smtv923@gmail.com",
];

/** Normalize email for comparison (lowercase + trim). */
function norm(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Whitelist as a Set for O(1) lookup, all normalized. */
const DEV_EMAIL_SET = new Set(DEV_ACCESS_EMAILS.map(norm));

/** Returns true if the given email is allowed to access Developer Options. */
export function isDevAccessEmail(email: string | null | undefined): boolean {
  const e = norm(email);
  return e.length > 0 && DEV_EMAIL_SET.has(e);
}
