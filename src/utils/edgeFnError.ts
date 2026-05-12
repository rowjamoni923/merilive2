/**
 * Extract a human-readable error message from a supabase.functions.invoke() error.
 * The default `error.message` is generic ("Edge Function returned a non-2xx status code"),
 * the real reason lives in `error.context` (the Response object).
 */
export async function extractEdgeFnError(err: any, fallback = "Unknown error"): Promise<string> {
  try {
    if (!err) return fallback;
    const ctx = err.context;
    if (ctx && typeof ctx.text === "function") {
      const txt = await ctx.text();
      try {
        const json = JSON.parse(txt);
        return json?.error || json?.message || txt || fallback;
      } catch {
        return txt || fallback;
      }
    }
    if (typeof err === "string") return err;
    return err?.message || fallback;
  } catch {
    return fallback;
  }
}
