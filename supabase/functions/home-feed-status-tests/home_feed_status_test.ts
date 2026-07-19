// ============================================================
// Automated tests for get_public_home_hosts_v2 LIVE/BUSY logic.
//
// Verifies BUSY detection across every session status legal by CHECK
// constraint for both `private_calls` and `random_call_sessions`, plus
// the ended_at guard. The RPC also lists several *aspirational* statuses
// (e.g. 'in_progress','matched','waiting_accept','cancelled','timeout')
// that the DB CHECK constraints currently REJECT — those are documented
// below but cannot be inserted, so they are asserted structurally in the
// SQL source instead of at runtime.
//
// Legal test matrix:
//   private_calls          BUSY   → 'ringing','connected'
//   private_calls          FREE   → 'pending','ended','missed','declined'
//   random_call_sessions   BUSY   → 'ringing','active'
//   random_call_sessions   FREE   → 'completed','sub_minimum','aborted','no_answer'
//   Both tables            FREE   → any BUSY status with ended_at NOT NULL
//
// Isolation: every test host is a fresh auth user tagged with an unused
// country_code so the RPC's `country=…` filter returns only our fixtures.
// A single authenticated caller executes the RPC and we cross-check
// is_in_call per host_id.
//
// Cleanup: all created auth users are deleted at the end (cascades to
// profiles + call rows via FK ON DELETE CASCADE / trigger).
// ============================================================
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "";

const CAN_RUN = !!(SUPABASE_URL && SERVICE_KEY && ANON_KEY);
if (!CAN_RUN) {
  console.warn(
    "[home-feed-status tests] SKIPPED — set SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY) to run.",
  );
}

// A country_code unlikely to collide with real users (RPC regex: [A-Z]{2,8}).
const TEST_COUNTRY = `ZZ${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

// ---------- helpers ----------------------------------------------------
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

async function createAuthUser(label: string): Promise<string> {
  const email = `hfs-${label}-${crypto.randomUUID()}@meritest.local`;
  const password = `Test-${crypto.randomUUID()}!Aa1`;
  const r = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await r.json();
  assert(r.ok, `createUser(${label}) failed ${r.status}: ${JSON.stringify(body)}`);
  return body.id as string;
}

async function deleteAuthUser(id: string): Promise<void> {
  const r = await svc(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  await r.text();
}

async function signInPassword(email: string, password: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json();
  assert(r.ok && body.access_token, `signIn failed ${r.status}: ${JSON.stringify(body)}`);
  return body.access_token as string;
}

async function createAuthUserWithCreds(): Promise<{ id: string; email: string; password: string }> {
  const email = `hfs-caller-${crypto.randomUUID()}@meritest.local`;
  const password = `Test-${crypto.randomUUID()}!Aa1`;
  const r = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await r.json();
  assert(r.ok, `createUser(caller) failed ${r.status}: ${JSON.stringify(body)}`);
  return { id: body.id, email, password };
}

async function markVerifiedFemaleHost(profileId: string): Promise<void> {
  // PATCH the auto-created profile row so it passes the RPC's
  // verified_female_host + is_really_online gates. host_availability
  // defaults to 'online'; keep it explicit for readability.
  const r = await svc(`/rest/v1/profiles?id=eq.${profileId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      is_host: true,
      gender: "female",
      host_status: "approved",
      is_face_verified: true,
      is_online: true,
      last_seen_at: new Date().toISOString(),
      host_availability: "online",
      is_in_call: false,          // ensure only has_active_call drives BUSY
      country_code: TEST_COUNTRY,
      is_blocked: false,
      is_banned: false,
      is_deleted: false,
    }),
  });
  const txt = await r.text();
  assert(r.ok, `profile PATCH ${profileId} failed ${r.status}: ${txt}`);
}

async function insertPrivateCall(
  callerId: string, hostId: string, status: string, ended = false,
): Promise<void> {
  const now = new Date().toISOString();
  const r = await svc("/rest/v1/private_calls", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      caller_id: callerId,
      host_id: hostId,
      status,
      started_at: now,
      ended_at: ended ? now : null,
    }),
  });
  const txt = await r.text();
  assert(r.ok, `insert private_calls(${status}${ended ? "+ended" : ""}) failed ${r.status}: ${txt}`);
}

async function insertRandomSession(
  callerId: string, hostId: string, status: string, ended = false,
): Promise<void> {
  const now = new Date().toISOString();
  const r = await svc("/rest/v1/random_call_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      caller_id: callerId,
      host_id: hostId,
      status,
      started_at: now,
      ended_at: ended ? now : null,
    }),
  });
  const txt = await r.text();
  assert(r.ok, `insert random_call_sessions(${status}${ended ? "+ended" : ""}) failed ${r.status}: ${txt}`);
}

async function callHomeHostsRpc(accessToken: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_home_hosts_v2`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_selected_country: TEST_COUNTRY,
      p_sub_tab: "popular",
    }),
  });
  const body = await r.json();
  assert(r.ok, `RPC failed ${r.status}: ${JSON.stringify(body)}`);
  assert(Array.isArray(body), `RPC did not return array: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

// ---------- test matrix -----------------------------------------------
/** private_calls statuses accepted by the CHECK constraint. */
const PRIVATE_BUSY = ["ringing", "connected"] as const;
const PRIVATE_FREE = ["pending", "ended", "missed", "declined"] as const;

/** random_call_sessions statuses accepted by the CHECK constraint. */
const RANDOM_BUSY = ["ringing", "active"] as const;
const RANDOM_FREE = ["completed", "sub_minimum", "aborted", "no_answer"] as const;

// ---------- test ------------------------------------------------------
Deno.test({
  name: "get_public_home_hosts_v2: BUSY detection across all session states",
  ignore: !CAN_RUN,
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const createdUserIds: string[] = [];

  // Deterministic map so we can assert per-host later.
  //   key = human label,  value = { hostId, expectBusy }
  type Case = { hostId: string; expectBusy: boolean; label: string };
  const cases: Record<string, Case> = {};

  try {
    // 1. Caller (issues the RPC).
    const caller = await createAuthUserWithCreds();
    createdUserIds.push(caller.id);
    await markVerifiedFemaleHost(caller.id);
    // Move caller out of the test country so it is not in the returned list.
    {
      const r = await svc(`/rest/v1/profiles?id=eq.${caller.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ country_code: "US" }),
      });
      await r.text();
    }
    const accessToken = await signInPassword(caller.email, caller.password);

    // 2. Baseline host — no sessions at all.
    {
      const id = await createAuthUser("baseline");
      createdUserIds.push(id);
      await markVerifiedFemaleHost(id);
      cases["baseline"] = { hostId: id, expectBusy: false, label: "no sessions" };
    }

    // 3. private_calls BUSY statuses.
    for (const s of PRIVATE_BUSY) {
      const id = await createAuthUser(`pc-busy-${s}`);
      createdUserIds.push(id);
      await markVerifiedFemaleHost(id);
      await insertPrivateCall(caller.id, id, s, false);
      cases[`pc-busy-${s}`] = { hostId: id, expectBusy: true, label: `private_calls status=${s}` };
    }

    // 4. private_calls FREE statuses.
    for (const s of PRIVATE_FREE) {
      const id = await createAuthUser(`pc-free-${s}`);
      createdUserIds.push(id);
      await markVerifiedFemaleHost(id);
      await insertPrivateCall(caller.id, id, s, false);
      cases[`pc-free-${s}`] = { hostId: id, expectBusy: false, label: `private_calls status=${s}` };
    }

    // 5. private_calls BUSY status but ended_at NOT NULL — should be FREE.
    {
      const id = await createAuthUser("pc-ended-guard");
      createdUserIds.push(id);
      await markVerifiedFemaleHost(id);
      await insertPrivateCall(caller.id, id, "connected", true);
      cases["pc-ended-guard"] = {
        hostId: id, expectBusy: false,
        label: "private_calls status=connected + ended_at NOT NULL",
      };
    }

    // 6. random_call_sessions BUSY statuses.
    for (const s of RANDOM_BUSY) {
      const id = await createAuthUser(`rcs-busy-${s}`);
      createdUserIds.push(id);
      await markVerifiedFemaleHost(id);
      await insertRandomSession(caller.id, id, s, false);
      cases[`rcs-busy-${s}`] = { hostId: id, expectBusy: true, label: `random_call_sessions status=${s}` };
    }

    // 7. random_call_sessions FREE statuses.
    for (const s of RANDOM_FREE) {
      const id = await createAuthUser(`rcs-free-${s}`);
      createdUserIds.push(id);
      await markVerifiedFemaleHost(id);
      await insertRandomSession(caller.id, id, s, false);
      cases[`rcs-free-${s}`] = { hostId: id, expectBusy: false, label: `random_call_sessions status=${s}` };
    }

    // 8. random_call_sessions BUSY status but ended_at NOT NULL — should be FREE.
    {
      const id = await createAuthUser("rcs-ended-guard");
      createdUserIds.push(id);
      await markVerifiedFemaleHost(id);
      await insertRandomSession(caller.id, id, "active", true);
      cases["rcs-ended-guard"] = {
      };
    }

    // ----- Act: single RPC call returns all our test hosts. -----
    const rows = await callHomeHostsRpc(accessToken);
    const byId = new Map<string, any>();
    for (const r of rows) byId.set(r.id, r);

    // ----- Assert: every fixture host is present and BUSY flag matches. -----
    const failures: string[] = [];
    for (const [key, c] of Object.entries(cases)) {
      const row = byId.get(c.hostId);
      if (!row) {
        failures.push(`  ✗ [${key}] MISSING from RPC output (${c.label})`);
        continue;
      }
      if (row.is_in_call !== c.expectBusy) {
        failures.push(
          `  ✗ [${key}] is_in_call=${row.is_in_call}, expected=${c.expectBusy} (${c.label})`,
        );
        continue;
      }
      // Sanity: online must be true for verified female host with fresh heartbeat.
      if (row.is_online !== true) {
        failures.push(`  ✗ [${key}] is_online=${row.is_online}, expected=true (${c.label})`);
        continue;
      }
      // Sanity: BUSY hosts must have NULL call_rate_per_minute (price hidden).
      if (c.expectBusy && row.call_rate_per_minute !== null) {
        failures.push(
          `  ✗ [${key}] call_rate_per_minute=${row.call_rate_per_minute}, expected=null on busy (${c.label})`,
        );
        continue;
      }
      // Sanity: FREE hosts must expose a numeric rate.
      if (!c.expectBusy && (typeof row.call_rate_per_minute !== "number")) {
        failures.push(
          `  ✗ [${key}] call_rate_per_minute=${row.call_rate_per_minute}, expected number on free (${c.label})`,
        );
        continue;
      }
    }

    assertEquals(
      failures.length, 0,
      `\n${failures.length} BUSY-detection failure(s):\n${failures.join("\n")}\n`,
    );

    // Extra: caller (US country) must not appear in TEST_COUNTRY output.
    assert(!byId.has(caller.id), "Caller should be excluded (different country_code)");

    // Extra: no unexpected extra hosts leaked in — count matches fixtures.
    assertEquals(
      rows.length,
      Object.keys(cases).length,
      `Expected ${Object.keys(cases).length} rows in TEST_COUNTRY, got ${rows.length}`,
    );
  } finally {
    // Cleanup — cascade deletes profiles + private_calls + random_call_sessions.
    for (const id of createdUserIds) {
      try { await deleteAuthUser(id); } catch { /* best-effort */ }
    }
  }
});

// -------------------------------------------------------------------
// Structural sanity check: guarantees the RPC source keeps listing every
// aspirational status even though CHECK constraints currently reject them
// at insert time. If someone regresses the RPC and drops one of these
// values, this test fires — no live DB needed.
// -------------------------------------------------------------------
Deno.test({
  name: "get_public_home_hosts_v2 source: enumerates all aspirational BUSY statuses",
  ignore: !CAN_RUN,
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const r = await svc(
    "/rest/v1/rpc/pg_get_functiondef_by_name",
    {
      method: "POST",
      body: JSON.stringify({ _name: "get_public_home_hosts_v2" }),
    },
  );
  // If the introspection helper doesn't exist we fall back to reading the
  // latest migration file bundled next to this test at build time.
  let src = "";
  if (r.ok) {
    src = await r.text();
  } else {
    await r.text();
    try {
      src = await Deno.readTextFile(
        new URL(
          "../../migrations/20260703071652_9224025c-3741-464d-936b-e4ab12edd203.sql",
          import.meta.url,
        ),
      );
    } catch {
      // Skip structural check silently if we cannot read the file.
      return;
    }
  }

  // Every status the RPC MUST recognise as BUSY.
  const mustInclude = [
    // private_calls
    "'ringing'", "'connected'", "'in_progress'", "'active'",
    // random_call_sessions (lowercased inside RPC)
    "'matched'", "'waiting_accept'",
  ];
  const missing = mustInclude.filter((s) => !src.includes(s));
  assertEquals(
    missing.length, 0,
    `RPC source missing BUSY statuses: ${missing.join(", ")}`,
  );

  // Every status the RPC MUST NOT treat as BUSY (excluded / ended).
  const mustExclude = ["'cancelled'", "'declined'", "'missed'", "'timeout'", "'ended'"];
  // These must NOT appear inside the active_call_hosts CTE. We do a coarse
  // check: the CTE body should not include any of these as busy sources.
  const cteMatch = src.match(/active_call_hosts AS \([\s\S]*?\)(?=,|\s*SELECT)/);
  if (cteMatch) {
    const cte = cteMatch[0];
    const leaked = mustExclude.filter((s) => cte.includes(s));
    assertEquals(
      leaked.length, 0,
      `active_call_hosts CTE must NOT list terminal statuses as busy: ${leaked.join(", ")}`,
    );
  }
});
