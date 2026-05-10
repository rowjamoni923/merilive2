import { formatAdminError } from "@/utils/formatAdminError";
/**
 * Formats ANY thrown value (Error, Supabase PostgrestError, fetch error, plain object, string)
 * into a useful single-line message. Replaces the broken
 * `formatAdminError(err))` pattern that was producing
 * "[object Object]" toasts across the admin panel.
 */
export function formatAdminError(err: unknown, fallback = "Unknown error"): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;

  // Supabase PostgrestError / FunctionsHttpError shape
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === "string" && e.message) parts.push(e.message);
    if (typeof e.details === "string" && e.details) parts.push(e.details);
    if (typeof e.hint === "string" && e.hint) parts.push(`hint: ${e.hint}`);
    if (typeof e.code === "string" && e.code) parts.push(`code: ${e.code}`);
    if (parts.length) return parts.join(" — ");

    // Last resort — JSON stringify so we never produce "[object Object]"
    try {
      const j = JSON.stringify(err);
      if (j && j !== "{}") return j.slice(0, 300);
    } catch {
      /* ignore */
    }
  }

  return fallback;
}
