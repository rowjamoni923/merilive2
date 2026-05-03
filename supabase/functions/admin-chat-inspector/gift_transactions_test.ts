// Automated tests for admin-chat-inspector gift-transactions endpoint.
// Validates pagination, stats, and enrichment (sender/receiver/gift) shape.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/admin-chat-inspector/gift-transactions`;

async function call(params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ tzOffset: "6", ...params }).toString();
  const res = await fetch(`${ENDPOINT}?${qs}`, {
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
  });
  const body = await res.json();
  return { status: res.status, body };
}

Deno.test("gift-transactions: returns expected response shape", async () => {
  const { status, body } = await call({ page: "1", pageSize: "10" });
  assertEquals(status, 200);
  assertExists(body.transactions, "transactions array missing");
  assert(Array.isArray(body.transactions));
  assertExists(body.stats, "stats object missing");
  assertEquals(typeof body.stats.total_beans, "number");
  assertEquals(typeof body.stats.total_count, "number");
  assertEquals(typeof body.stats.unique_senders, "number");
  assertEquals(typeof body.stats.unique_receivers, "number");
  assertEquals(typeof body.hasMore, "boolean");
  assertEquals(body.page, 1);
  assertEquals(body.pageSize, 10);
});

Deno.test("gift-transactions: enrichment attaches sender/receiver/gift", async () => {
  const { body } = await call({ page: "1", pageSize: "5" });
  if (!body.transactions.length) return; // No data today — skip
  const t = body.transactions[0];
  // Each row must carry the enrichment slots (may be null if user/gift deleted)
  assert("sender" in t, "sender field missing");
  assert("receiver" in t, "receiver field missing");
  assert("gift" in t, "gift field missing");
  if (t.sender) {
    assertExists(t.sender.display_name);
    assertExists(t.sender.app_uid);
  }
});

Deno.test("gift-transactions: pagination respects pageSize", async () => {
  const { body } = await call({ page: "1", pageSize: "10" });
  assert(body.transactions.length <= body.pageSize, "returned more than pageSize");
  if (body.stats.total_count > body.pageSize) {
    assertEquals(body.hasMore, true);
  }
});

Deno.test("gift-transactions: stats are independent of pagination window", async () => {
  const a = (await call({ page: "1", pageSize: "5" })).body;
  const b = (await call({ page: "1", pageSize: "50" })).body;
  assertEquals(a.stats.total_count, b.stats.total_count);
  assertEquals(a.stats.total_beans, b.stats.total_beans);
});
