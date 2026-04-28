// Cron-triggered: expires noble subscriptions + sends 7/3/1 day reminders
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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
      return new Response(JSON.stringify({ error: remErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    for (const r of (reminders ?? [])) {
      try {
        // Insert in-app notification
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

    return new Response(
      JSON.stringify({
        success: true,
        expired: expiredCount ?? 0,
        reminders_sent: sentCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[expire-noble-subscriptions] Error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
