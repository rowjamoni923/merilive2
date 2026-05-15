// Verifies every dashboard / stats RPC accepts a valid x-admin-token session
// (matches admin panel adminClient behaviour). Run via supabase test_edge_functions.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

assert(SUPABASE_URL, "SUPABASE_URL missing");
assert(SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY missing");
assert(ANON_KEY, "SUPABASE_ANON_KEY missing");

const RPCS_NO_ARGS = [
  "get_admin_dashboard_stats",
  "admin_user_stats",
  "admin_host_stats",
  "admin_finance_overview_stats",
  "admin_agency_overview_stats",
  "admin_helper_management_stats",
  "admin_helper_applications_stats",
  "admin_helper_requests_stats",
  "admin_face_verification_stats",
  "admin_live_ban_stats",
  "admin_live_face_warnings_stats",
  "admin_visual_assets_stats",
  "admin_payment_gateway_stats",
  "admin_withdrawal_stats",
  "admin_moderation_overview_stats",
  "admin_reports_overview_stats",
  "admin_party_management_stats",
  "admin_payroll_orders_stats",
  "admin_entry_effects_stats",
  "admin_game_today_stats",
  "admin_realtime_publication_status",
  "admin_rekognition_shard_stats",
];

const RPCS_WITH_BODY: Array<[string, Record<string, unknown>]> = [
  ["get_admin_analytics_chart_data", { p_days: 7 }],
];

async function svc(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  return res;
}

async function provisionAdminSession(): Promise<{ token: string; id: string }> {
  const lookup = await svc(
    "/rest/v1/admin_users?select=id&role=eq.owner&is_active=eq.true&limit=1",
  );
  const rows = await lookup.json();
  assert(Array.isArray(rows) && rows.length > 0, "No active owner admin found");
  const adminId = rows[0].id as string;

  const token = `test-${crypto.randomUUID()}-${crypto.randomUUID()}`.replace(/-/g, "");
  const insert = await svc("/rest/v1/admin_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      admin_user_id: adminId,
      session_token: token,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }),
  });
  await insert.text();
  assert(insert.ok, `Failed to create admin_sessions row (${insert.status})`);
  return { token, id: adminId };
}

async function cleanup(token: string) {
  const r = await svc(
    `/rest/v1/admin_sessions?session_token=eq.${encodeURIComponent(token)}`,
    { method: "DELETE" },
  );
  await r.text();
}

async function callRpc(name: string, body: unknown, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "x-admin-token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  return { status: res.status, text };
}

Deno.test("admin x-admin-token unlocks every dashboard RPC", async () => {
  const { token } = await provisionAdminSession();
  try {
    const failures: string[] = [];

    for (const name of RPCS_NO_ARGS) {
      const { status, text } = await callRpc(name, {}, token);
      const denied =
        status === 401 ||
        status === 403 ||
        /access denied|admin only|not authorized|permission denied/i.test(text);
      if (denied) failures.push(`${name} → ${status} :: ${text.slice(0, 160)}`);
    }

    for (const [name, body] of RPCS_WITH_BODY) {
      const { status, text } = await callRpc(name, body, token);
      const denied =
        status === 401 ||
        status === 403 ||
        /access denied|admin only|not authorized|permission denied/i.test(text);
      if (denied) failures.push(`${name} → ${status} :: ${text.slice(0, 160)}`);
    }

    if (failures.length) {
      throw new Error(
        `${failures.length} admin RPC(s) rejected a valid admin-token session:\n` +
          failures.map((f) => "  • " + f).join("\n"),
      );
    }
  } finally {
    await cleanup(token);
  }
});

Deno.test("missing x-admin-token is correctly rejected by guarded RPC", async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_admin_analytics_chart_data`,
    {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_days: 7 }),
    },
  );
  const text = await res.text();
  assert(
    res.status >= 400 || /access denied|admin only/i.test(text),
    `Expected denial without admin token, got ${res.status}: ${text.slice(0, 160)}`,
  );
});
