// Integration tests for admin-verify-purchase edge function.
// Covers: unauthorized, bad admin token, missing fields, user-not-found,
// duplicate google_order_id, successful credit + cleanup.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "";

const CAN_RUN = !!(SUPABASE_URL && SERVICE_KEY && ANON_KEY);
if (!CAN_RUN) {
  console.warn("[admin-verify-purchase tests] SKIPPED — set SUPABASE_SERVICE_ROLE_KEY to run.");
}

const FN_URL = `${SUPABASE_URL}/functions/v1/admin-verify-purchase`;

async function svc(path: string, init: RequestInit = {}) {
  return await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function provisionAdmin(): Promise<string> {
  const lookup = await svc("/rest/v1/admin_users?select=id&role=eq.owner&is_active=eq.true&limit=1");
  const rows = await lookup.json();
  assert(Array.isArray(rows) && rows.length > 0, "No active owner admin found");
  const token = `vp-${crypto.randomUUID()}`.replace(/-/g, "");
  const ins = await svc("/rest/v1/admin_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      admin_user_id: rows[0].id,
      session_token: token,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }),
  });
  await ins.text();
  assert(ins.ok, `Failed to create admin session (${ins.status})`);
  return token;
}

async function pickUser(): Promise<string> {
  const r = await svc("/rest/v1/profiles?select=id&order=created_at.desc&limit=1");
  const rows = await r.json();
  assert(Array.isArray(rows) && rows.length > 0, "No profile found");
  return rows[0].id;
}

async function cleanupSession(token: string) {
  await (await svc(
    `/rest/v1/admin_sessions?session_token=eq.${encodeURIComponent(token)}`,
    { method: "DELETE" },
  )).text();
}

async function cleanupOrder(orderId: string) {
  await (await svc(
    `/rest/v1/recharge_transactions?google_order_id=eq.${encodeURIComponent(orderId)}`,
    { method: "DELETE" },
  )).text();
}

async function callFn(body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, text, json };
}

Deno.test({ name: "admin-verify-purchase: rejects request with no auth headers", ignore: !CAN_RUN }, async () => {
  const { status, json } = await callFn({ userId: "x", diamondAmount: 1 });
  assertEquals(status, 401);
  assertEquals(json?.success, false);
});

Deno.test({ name: "admin-verify-purchase: rejects invalid admin token", ignore: !CAN_RUN }, async () => {
  const { status, json } = await callFn(
    { userId: "x", diamondAmount: 1 },
    { "x-admin-token": "totally-fake-token" },
  );
  assertEquals(status, 403);
  assertEquals(json?.success, false);
});

Deno.test({ name: "admin-verify-purchase: rejects missing/invalid diamondAmount", ignore: !CAN_RUN }, async () => {
  const token = await provisionAdmin();
  try {
    const userId = await pickUser();
    const { status, json } = await callFn(
      { userId, diamondAmount: 0 },
      { "x-admin-token": token },
    );
    assertEquals(status, 400);
    assertEquals(json?.success, false);
  } finally {
    await cleanupSession(token);
  }
});

Deno.test({ name: "admin-verify-purchase: rejects unknown userId", ignore: !CAN_RUN }, async () => {
  const token = await provisionAdmin();
  try {
    const { status, json } = await callFn(
      { userId: "00000000-0000-0000-0000-000000000000", diamondAmount: 100 },
      { "x-admin-token": token },
    );
    assertEquals(status, 404);
    assertEquals(json?.success, false);
  } finally {
    await cleanupSession(token);
  }
});

Deno.test({ name: "admin-verify-purchase: success credits coins + records transaction", ignore: !CAN_RUN }, async () => {
  const token = await provisionAdmin();
  const orderId = `e2e_test_${crypto.randomUUID()}`;
  try {
    const userId = await pickUser();
    const { status, json } = await callFn(
      { userId, diamondAmount: 1, reason: "E2E success test", googleOrderId: orderId },
      { "x-admin-token": token },
    );
    assertEquals(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
    assertEquals(json?.success, true);
    assertEquals(json?.diamondAmount, 1);
    assert(typeof json?.newBalance === "number" || json?.newBalance === undefined,
      "newBalance should be numeric or undefined");

    // Verify recharge_transactions row was inserted
    const check = await svc(
      `/rest/v1/recharge_transactions?google_order_id=eq.${encodeURIComponent(orderId)}&select=id,status,purchase_source`,
    );
    const rows = await check.json();
    assertEquals(rows.length, 1);
    assertEquals(rows[0].status, "completed");
    assertEquals(rows[0].purchase_source, "admin_manual");
  } finally {
    await cleanupOrder(orderId);
    await cleanupSession(token);
  }
});

Deno.test({ name: "admin-verify-purchase: blocks duplicate googleOrderId", ignore: !CAN_RUN }, async () => {
  const token = await provisionAdmin();
  const orderId = `e2e_dup_${crypto.randomUUID()}`;
  try {
    const userId = await pickUser();
    const first = await callFn(
      { userId, diamondAmount: 1, reason: "first credit", googleOrderId: orderId },
      { "x-admin-token": token },
    );
    assertEquals(first.status, 200);

    const dup = await callFn(
      { userId, diamondAmount: 1, reason: "duplicate attempt", googleOrderId: orderId },
      { "x-admin-token": token },
    );
    assertEquals(dup.status, 409);
    assertEquals(dup.json?.success, false);
    assertEquals(dup.json?.alreadyCredited, true);
  } finally {
    await cleanupOrder(orderId);
    await cleanupSession(token);
  }
});
