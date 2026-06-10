// R2-Phase B / R2-H17: noble-purchase now requires an idempotency_key.
// Same key + same user replays the original response (no double-debit).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// R2-Phase B Wave-2 / R2-H15: strict CORS allow-list.
const ALLOWED_ORIGINS = new Set<string>([
  "https://merilive.com",
  "https://www.merilive.com",
  "https://merilive.top",
  "https://merilive2.lovable.app",
  "https://id-preview--1c59f8d2-75bb-4fc1-a074-3c08560dd44b.lovable.app",
]);
function buildCors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://merilive.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Authenticate caller
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const noble_card_id = body?.noble_card_id;
    const auto_renew = !!body?.auto_renew;
    const idempotency_key = String(body?.idempotency_key ?? "");

    if (!noble_card_id) {
      return new Response(JSON.stringify({ error: "noble_card_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!UUID_RE.test(idempotency_key)) {
      return new Response(
        JSON.stringify({ error: "idempotency_key (uuid) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Claim the key (scope = user + card so a duplicate on a different card is allowed
    // but a duplicate POST of the same purchase is blocked).
    const scope = `noble-purchase:${userId}:${noble_card_id}:${auto_renew ? 1 : 0}`;
    const { data: claimRes, error: claimErr } = await adminClient.rpc(
      "claim_idempotency_key",
      { _scope: scope, _key: idempotency_key, _user_id: userId },
    );
    if (claimErr) {
      console.error("[noble-purchase] claim_idempotency_key error:", claimErr.message);
      return new Response(JSON.stringify({ error: "idempotency_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claimStatus = (claimRes as any)?.status as string | undefined;
    if (claimStatus === "duplicate_done") {
      const cached = (claimRes as any)?.response ?? {};
      return new Response(JSON.stringify({ ...cached, replayed: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (claimStatus === "duplicate_in_flight") {
      return new Response(
        JSON.stringify({ error: "duplicate_request_in_progress" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fresh — actually run the purchase RPC as the user.
    let finalStatus: "succeeded" | "failed" = "failed";
    let finalBody: Record<string, unknown> = {};

    try {
      const { data, error } = await userClient.rpc("purchase_noble_card", {
        _noble_card_id: noble_card_id,
        _auto_renew: auto_renew,
      });

      if (error) {
        console.error("[noble-purchase] RPC error:", error);
        finalBody = { error: error.message };
        await adminClient.rpc("complete_idempotency_key", {
          _scope: scope,
          _key: idempotency_key,
          _status: "failed",
          _response: finalBody,
        });
        return new Response(JSON.stringify(finalBody), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      finalStatus = "succeeded";
      finalBody = data && typeof data === "object" ? (data as Record<string, unknown>) : { result: data };
      await adminClient.rpc("complete_idempotency_key", {
        _scope: scope,
        _key: idempotency_key,
        _status: "succeeded",
        _response: finalBody,
      });

      return new Response(JSON.stringify(finalBody), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (innerErr) {
      console.error("[noble-purchase] unexpected during RPC:", innerErr);
      finalBody = { error: (innerErr as Error).message };
      try {
        await adminClient.rpc("complete_idempotency_key", {
          _scope: scope,
          _key: idempotency_key,
          _status: "failed",
          _response: finalBody,
        });
      } catch (_) { /* swallow */ }
      return new Response(JSON.stringify(finalBody), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[noble-purchase] Error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
