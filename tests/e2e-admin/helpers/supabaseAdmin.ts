/**
 * Service-role Supabase REST helper — Node-only. NEVER ship to browser.
 * Used by the E2E seed/teardown to create disposable rows.
 */
const SUPABASE_URL = "https://ayjdlvuurscxucatbbah.supabase.co";

function key(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return k;
}

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  const k = key();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", k);
  headers.set("authorization", `Bearer ${k}`);
  headers.set("content-type", "application/json");
  if (!headers.has("prefer")) headers.set("prefer", "return=representation");
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${init.method || "GET"} ${path} ${res.status}: ${body}`);
  }
  return res;
}

export async function selectRows<T = unknown>(table: string, query: string): Promise<T[]> {
  const r = await req(`/rest/v1/${table}?${query}`);
  return (await r.json()) as T[];
}

export async function upsertRows<T = unknown>(
  table: string,
  rows: unknown[],
  onConflict: string,
): Promise<T[]> {
  const r = await req(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  return (await r.json()) as T[];
}

export async function deleteRows(table: string, query: string): Promise<void> {
  await req(`/rest/v1/${table}?${query}`, { method: "DELETE" });
}
