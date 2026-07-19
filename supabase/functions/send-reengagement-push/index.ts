import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Re-engagement Push Notification System
 * Sends automated reminders to inactive users at different intervals:
 * - 24 hours: "We miss you!" 
 * - 3 days: "New hosts are live!"
 * - 7 days: "Come back for rewards!"
 * 
 * Called by pg_cron every 6 hours
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Pkg349: cron-only — any anon trigger could mass-spam push to every inactive user app-wide
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? Deno.env.get("CRON_SECRET");
  const headerSecret = req.headers.get("x-cron-secret") ?? req.headers.get("x-internal-secret");
  const serviceJwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const isServiceRole = serviceJwt && serviceJwt === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isServiceRole && (!internalSecret || headerSecret !== internalSecret)) {
    return new Response(JSON.stringify({ error: "Cron/service-role auth required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    
    // Define re-engagement tiers
    const tiers = [
      {
        name: '24h_inactive',
        hoursAgo: 24,
        hoursMax: 30,
        title: '💫 We miss you!',
        body: 'Hosts are live right now! Come see who\'s online 🎉',
        data: { type: 'reengagement', tier: '24h' },
      },
      {
      },
      {
      },
    ];

    let totalSent = 0;

    for (const tier of tiers) {
      const fromTime = new Date(now.getTime() - tier.hoursMax * 60 * 60 * 1000).toISOString();
      const toTime = new Date(now.getTime() - tier.hoursAgo * 60 * 60 * 1000).toISOString();

      // Find users inactive in this window who have active device tokens
      // and haven't received a re-engagement push in the last 20 hours
      const { data: inactiveUsers, error: queryError } = await supabase
        .from('profiles')
        .select('id')
        .gte('last_seen_at', fromTime)
        .lte('last_seen_at', toTime)
        .eq('is_deleted', false)
        .eq('is_online', false)
        .limit(200);

      if (queryError) {
        console.error(`[ReEngage] Error querying ${tier.name}:`, queryError);
        continue;
      }

      if (!inactiveUsers || inactiveUsers.length === 0) {
        console.log(`[ReEngage] No users for ${tier.name}`);
        continue;
      }

      const userIds = inactiveUsers.map(u => u.id);

      // Check who already received a re-engagement notification recently (last 20h)
      const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
      const { data: recentNotifs } = await supabase
        .from('notifications')
        .select('user_id')
        .in('user_id', userIds)
        .eq('type', 'reengagement')
        .gte('created_at', twentyHoursAgo);

      const alreadyNotified = new Set((recentNotifs || []).map(n => n.user_id));
      const eligibleUserIds = userIds.filter(id => !alreadyNotified.has(id));

      if (eligibleUserIds.length === 0) {
        console.log(`[ReEngage] All ${tier.name} users already notified recently`);
        continue;
      }

      // Insert notifications (triggers push-on-notification for FCM)
      const notifRows = eligibleUserIds.map(userId => ({
        user_id: userId,
        type: 'reengagement',
        message: tier.body,
        is_read: false,
      }));

      // Batch insert in chunks of 50
      for (let i = 0; i < notifRows.length; i += 50) {
        const batch = notifRows.slice(i, i + 50);
        const { error: insertError } = await supabase
          .from('notifications')
          .insert(batch);

        if (insertError) {
          console.error(`[ReEngage] Insert error for ${tier.name}:`, insertError);
        } else {
          totalSent += batch.length;
        }
      }

      console.log(`[ReEngage] ${tier.name}: sent to ${eligibleUserIds.length} users`);
    }

    return new Response(
      JSON.stringify({ success: true, totalSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[ReEngage] Fatal error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
