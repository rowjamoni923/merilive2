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

export async function extractEdgeFnErrorPayload(err: any): Promise<any | null> {
  if (!err) return null;

  const parseText = (txt: string) => {
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (_) {}
    const match = txt.match(/\{[\s\S]*\}\s*$/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) {}
    }
    return null;
  };

  if (typeof err === "object" && err?.error) return err;

  const ctx = err?.context;
  try {
    if (ctx && typeof ctx.clone === "function") {
      const txt = await ctx.clone().text();
      const parsed = parseText(txt);
      if (parsed) return parsed;
    }
  } catch (_) {}

  try {
    if (ctx && typeof ctx.text === "function") {
      const txt = await ctx.text();
      const parsed = parseText(txt);
      if (parsed) return parsed;
    }
  } catch (_) {}

  try {
    if (ctx && typeof ctx.json === "function") {
      const parsed = await ctx.json();
      if (parsed) return parsed;
    }
  } catch (_) {}

  return parseText(String(err?.message ?? err ?? ""));
}
