// Cron-triggered: expires noble subscriptions + sends 7/3/1 day reminders.
// Hardened (Pkg311): requires CRON_SECRET / service-role JWT — previously any
// anon could trigger expiry + notification spam (DoS) and any anon could call
// the underlying SECURITY DEFINER RPCs directly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAuthorized(req: Request): boolean {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const internalSecret =
    Deno.env.get("CRON_SECRET") ?? Deno.env.get("INTERNAL_FUNCTION_SECRET");

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (serviceRole && bearer === serviceRole) return true;
  if (internalSecret) {
    if (req.headers.get("x-cron-secret") === internalSecret) return true;
    if (req.headers.get("x-internal-secret") === internalSecret) return true;
    if (bearer === internalSecret) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!isAuthorized(req)) {
      return jsonResponse({ error: "Forbidden: cron-only endpoint" }, 403);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Expire all noble subscriptions whose expires_at has passed
    const { data: expiredCount, error: expireErr } = await supabaseAdmin.rpc(
      "expire_noble_subscriptions",
    );
    if (expireErr) {
      console.error("[expire-noble] expire error:", expireErr);
    } else {
      console.log(`[expire-noble] Expired ${expiredCount} subscriptions`);
    }

    // 2. Get subscriptions needing reminders
    const { data: reminders, error: remErr } = await supabaseAdmin.rpc(
      "get_noble_subscriptions_needing_reminder",
    );
    if (remErr) {
      console.error("[expire-noble] reminders fetch error:", remErr);
      return jsonResponse({ error: remErr.message }, 500);
    }

    let sentCount = 0;
    for (const r of (reminders ?? [])) {
      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: r.user_id,
          type: "noble_expiring",
          title: `Your ${r.rank_name} title expires in ${r.days_remaining} day(s)`,
          body: `Renew now to keep your noble privileges and avoid losing your benefits.`,
          metadata: {
            subscription_id: r.subscription_id,
            rank_name: r.rank_name,
            days_remaining: r.days_remaining,
            reminder_type: r.reminder_type,
          },
        });

        await supabaseAdmin.rpc("mark_noble_reminder_sent", {
          _subscription_id: r.subscription_id,
          _reminder_type: r.reminder_type,
        });
        sentCount++;
      } catch (e) {
        console.error(`[expire-noble] reminder failed for ${r.subscription_id}:`, e);
      }
    }

    return jsonResponse({
      success: true,
      expired: expiredCount ?? 0,
      reminders_sent: sentCount,
    });
  } catch (e) {
    console.error("[expire-noble-subscriptions] Error:", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
