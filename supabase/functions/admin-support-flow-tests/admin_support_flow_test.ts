// End-to-end automated test of the Admin Support Ticket flow.
// Covers: ticket create → user msg → admin reply (text + image attachment)
// → owner-display-name update → file report → list → review → dismiss
// → reward (diamonds + beans) → resolve + close → purchase recovery
// (admin-verify-purchase edge function).
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "";

const CAN_RUN = !!(SUPABASE_URL && SERVICE_KEY && ANON_KEY);
if (!CAN_RUN) {
  console.warn("[admin-support-flow tests] SKIPPED — set SUPABASE_SERVICE_ROLE_KEY to run.");
}

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

async function rpcAsAdmin(name: string, body: unknown, token: string) {
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
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, text, json };
}

async function provisionAdmin(): Promise<string> {
  const r = await svc("/rest/v1/admin_users?select=id&role=eq.owner&is_active=eq.true&limit=1");
  const rows = await r.json();
  assert(Array.isArray(rows) && rows.length > 0, "No active owner admin found");
  const token = `sf-${crypto.randomUUID()}`.replace(/-/g, "");
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

Deno.test({ name: "admin support flow: full E2E (reply, image, report, reward, resolve, recovery)", ignore: !CAN_RUN }, async () => {
  const token = await provisionAdmin();
  const userId = await pickUser();
  const ticketNumber = `E2E-${crypto.randomUUID().slice(0, 8)}`;
  const orderId = `e2e_recovery_${crypto.randomUUID()}`;

  let ticketId = "";
  let userMsgId = "";
  let reportId = "";

  try {
    // 1. Create ticket (simulates user side)
    {
      const r = await svc("/rest/v1/support_tickets", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ticket_number: ticketNumber,
          user_id: userId,
          subject: "E2E flow test",
          category: "live_chat",
          priority: "normal",
          status: "open",
        }),
      });
      const rows = await r.json();
      assert(r.ok, `create ticket failed ${r.status}: ${JSON.stringify(rows)}`);
      ticketId = rows[0].id;
    }

    // 2. User message
    {
      const r = await svc("/rest/v1/support_messages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ticket_id: ticketId, sender_id: userId, sender_type: "user",
          content: "I paid but didn't get diamonds (E2E)",
        }),
      });
      const rows = await r.json();
      assert(r.ok, `user message failed: ${JSON.stringify(rows)}`);
      userMsgId = rows[0].id;
    }

    // 3. Admin text reply
    {
      const r = await svc("/rest/v1/support_messages", {
        method: "POST",
        body: JSON.stringify({
          ticket_id: ticketId, sender_id: null, sender_type: "admin",
          content: "Hi, looking into it (E2E)", support_admin_name: "E2E Tester",
        }),
      });
      assert(r.ok, `admin reply failed ${r.status}`); await r.text();
    }

    // 4. Admin image attachment reply
    {
      const r = await svc("/rest/v1/support_messages", {
        method: "POST",
        body: JSON.stringify({
          ticket_id: ticketId, sender_id: null, sender_type: "admin",
          content: "[image]", attachment_url: "https://example.com/proof.png",
          attachment_type: "image",
        }),
      });
      assert(r.ok, `image reply failed ${r.status}`); await r.text();
    }

    // 5. Admin display-name update RPC
    {
      const { status, text } = await rpcAsAdmin(
        "admin_update_my_support_display_name", { _name: "E2E Display" }, token,
      );
      assert(status < 300, `display name update failed ${status}: ${text}`);
    }

    // 6. File a support report (admin → owner)
    {
      const { status, json, text } = await rpcAsAdmin(
        "support_admin_file_report",
        { _ticket_id: ticketId, _message_id: userMsgId, _reason: "abusive content (E2E)" },
        token,
      );
      assert(status < 300, `file report failed ${status}: ${text}`);
      reportId = json as string;
      assert(typeof reportId === "string" && reportId.length > 0, "no report id returned");
    }

    // 7. Owner lists open reports
    {
      const { status, text } = await rpcAsAdmin(
        "admin_list_support_reports", { _status: "open", _limit: 10, _offset: 0 }, token,
      );
      assert(status < 300, `list reports failed ${status}: ${text}`);
    }

    // 8. Owner marks report reviewed → dismissed
    for (const next of ["reviewed", "dismissed"]) {
      const { status, text } = await rpcAsAdmin(
        "admin_update_support_report",
        { _report_id: reportId, _status: next, _notes: `E2E ${next}` },
        token,
      );
      assert(status < 300, `update report (${next}) failed ${status}: ${text}`);
    }

    // 9. Reward — add diamonds + beans
    {
      const d = await rpcAsAdmin("add_diamonds_to_user", { _user_id: userId, _amount: 1 }, token);
      assert(d.status < 300, `diamonds reward failed ${d.status}: ${d.text}`);
      const b = await rpcAsAdmin("add_beans_to_user", { _user_id: userId, _amount: 1 }, token);
      assert(b.status < 300, `beans reward failed ${b.status}: ${b.text}`);
    }

    // 10. Resolve + close ticket
    {
      const r1 = await svc(
        `/rest/v1/support_tickets?id=eq.${ticketId}`,
        { method: "PATCH", body: JSON.stringify({ status: "resolved", resolved_at: new Date().toISOString() }) },
      );
      assert(r1.ok, `resolve failed ${r1.status}`); await r1.text();
      const r2 = await svc(
        `/rest/v1/support_tickets?id=eq.${ticketId}`,
        { method: "PATCH", body: JSON.stringify({ status: "closed", closed_at: new Date().toISOString() }) },
      );
      assert(r2.ok, `close failed ${r2.status}`); await r2.text();
    }

    // 11. Purchase recovery via admin-verify-purchase edge function
    {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-verify-purchase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          "x-admin-token": token,
        },
        body: JSON.stringify({
          userId, diamondAmount: 1,
          reason: "Support ticket E2E recovery",
          googleOrderId: orderId,
        }),
      });
      const txt = await res.text();
      let body: any = null; try { body = JSON.parse(txt); } catch { /* */ }
      assertEquals(res.status, 200, `purchase recovery failed ${res.status}: ${txt.slice(0, 200)}`);
      assertEquals(body?.success, true);

      // Idempotency: second call must be rejected as duplicate
      const dup = await fetch(`${SUPABASE_URL}/functions/v1/admin-verify-purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY, "x-admin-token": token },
        body: JSON.stringify({ userId, diamondAmount: 1, googleOrderId: orderId }),
      });
      const dupTxt = await dup.text();
      assertEquals(dup.status, 409, `expected duplicate 409, got ${dup.status}: ${dupTxt}`);
    }

    // 12. Verify the full thread is readable as admin (3 admin/user messages)
    {
      const r = await svc(
        `/rest/v1/support_messages?ticket_id=eq.${ticketId}&select=id,sender_type,attachment_type`,
      );
      const rows = await r.json();
      assert(Array.isArray(rows) && rows.length >= 3,
        `expected >=3 messages, got ${JSON.stringify(rows)}`);
      assert(
        rows.some((m: any) => m.attachment_type === "image"),
        "image attachment message not found in thread",
      );
    }
  } finally {
    // Cleanup synthetic data — keep audit clean
    if (reportId) {
      await (await svc(`/rest/v1/support_reports?id=eq.${reportId}`, { method: "DELETE" })).text();
    }
    if (ticketId) {
      await (await svc(`/rest/v1/support_messages?ticket_id=eq.${ticketId}`, { method: "DELETE" })).text();
      await (await svc(`/rest/v1/support_tickets?id=eq.${ticketId}`, { method: "DELETE" })).text();
    }
    await (await svc(
      `/rest/v1/recharge_transactions?google_order_id=eq.${encodeURIComponent(orderId)}`,
      { method: "DELETE" },
    )).text();
    await (await svc(
      `/rest/v1/admin_sessions?session_token=eq.${encodeURIComponent(token)}`,
      { method: "DELETE" },
    )).text();
  }
});
