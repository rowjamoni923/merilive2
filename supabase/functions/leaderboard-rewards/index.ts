import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const results: string[] = [];

    // Process each category
    const categories = [
      { key: "host_earnings", rpc: "get_host_earnings_leaderboard" },
      { key: "game_winners", rpc: "get_game_rankings_leaderboard" },
      { key: "top_gifters", rpc: "get_top_gifters_leaderboard" },
    ];

    // Process daily rewards
    for (const cat of categories) {
      for (const periodType of ["daily", "weekly"]) {
        // Get reward config
        const { data: rewardConfig } = await supabase
          .from("leaderboard_reward_config")
          .select("rank_from, rank_to, reward_coins, reward_diamonds, reward_beans, min_target")
          .eq("category", cat.key)
          .eq("period_type", periodType)
          .eq("is_active", true)
          .order("rank_from");

        if (!rewardConfig || rewardConfig.length === 0) continue;

        // Get current rankings
        const { data: rankings, error: rpcError } = await supabase.rpc(cat.rpc, {
          p_period_type: periodType,
        });

        if (rpcError || !rankings || rankings.length === 0) continue;

        const now = new Date();
        const periodStart = periodType === "daily"
          ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
          : (() => {
              const d = new Date(now);
              const day = d.getDay();
              d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
              d.setHours(0, 0, 0, 0);
              return d.toISOString();
            })();

        // CRITICAL: period_label must be stable for the entire period
        // Daily: use today's date (YYYY-MM-DD)
        // Weekly: use the Monday start date so it stays the same all week
        const periodLabel = periodType === "daily"
          ? now.toISOString().split("T")[0]
          : (() => {
              const d = new Date(now);
              const day = d.getDay();
              d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
              return `week-${d.toISOString().split("T")[0]}`;
            })();

        // Distribute rewards
        for (let rank = 0; rank < rankings.length; rank++) {
          const user = rankings[rank];
          const rankPos = rank + 1;

          // Find matching reward tier
          const tier = rewardConfig.find(
            (r: any) => rankPos >= r.rank_from && rankPos <= r.rank_to
          );
          if (!tier) continue;

          // Check minimum target threshold
          const userValue = user.stat_value || user.total_earned || user.total_score || 0;
          if ((tier.min_target || 0) > 0 && userValue < tier.min_target) {
            console.log(`[Rewards] Rank #${rankPos} (${user.id}) skipped: ${userValue} < min_target ${tier.min_target}`);
            continue;
          }

          const hasReward = (tier.reward_coins || 0) > 0 || (tier.reward_diamonds || 0) > 0 || (tier.reward_beans || 0) > 0;
          if (!hasReward) continue;

          // Try to record distribution FIRST (unique constraint prevents duplicates)
          const { error: insertErr } = await supabase.from("leaderboard_reward_history").insert({
            user_id: user.id,
            category: cat.key,
            period_type: periodType,
            period_label: periodLabel,
            rank_position: rankPos,
            stat_value: user.stat_value,
            reward_coins: tier.reward_coins || 0,
            reward_diamonds: tier.reward_diamonds || 0,
            reward_beans: tier.reward_beans || 0,
          });

          // If insert fails (duplicate), skip - already distributed
          if (insertErr) {
            console.log(`[Rewards] Already distributed: ${cat.key}/${periodType} #${rankPos} → ${user.id}`);
            continue;
          }

          // Gender-based reward logic:
          // host_earnings (females/hosts) → Beans ONLY
          // top_gifters (males/gifters) → Diamonds ONLY
          // game_winners → Diamonds ONLY
          const isHostCategory = cat.key === "host_earnings";

          if (isHostCategory) {
            // Hosts get Beans only
            const beansAmount = (tier.reward_beans || 0) + (tier.reward_diamonds || 0);
            if (beansAmount > 0) {
              const { error: beansErr } = await supabase.rpc("service_add_beans", {
                p_user_id: user.id,
                p_amount: beansAmount,
              });
              if (beansErr) console.error(`[Rewards] Beans error for ${user.id}:`, beansErr);
            }
          } else {
            // Gifters & Game winners get Diamonds only
            const diamondAmount = (tier.reward_diamonds || 0) + (tier.reward_beans || 0);
            if (diamondAmount > 0) {
              const { error: diamErr } = await supabase.rpc("service_add_diamonds", {
                p_user_id: user.id,
                p_amount: diamondAmount,
              });
              if (diamErr) console.error(`[Rewards] Diamonds error for ${user.id}:`, diamErr);
            }
          }

          // Send notification with correct currency
          const actualBeans = isHostCategory ? (tier.reward_beans || 0) + (tier.reward_diamonds || 0) : 0;
          const actualDiamonds = isHostCategory ? 0 : (tier.reward_diamonds || 0) + (tier.reward_beans || 0);

          const rewardParts: string[] = [];
          if (actualBeans > 0) rewardParts.push(`${actualBeans.toLocaleString()} Beans`);
          if (actualDiamonds > 0) rewardParts.push(`${actualDiamonds.toLocaleString()} Diamonds`);

          const catLabel = cat.key === "host_earnings" ? "Host Earnings" :
                          cat.key === "game_winners" ? "Game" : "Gifter";
          const periodLabel2 = periodType === "daily" ? "Daily" : "Weekly";

          await supabase.from("notifications").insert({
            user_id: user.id,
            type: "leaderboard_reward",
            title: `🏆 ${periodLabel2} ${catLabel} Rank #${rankPos}!`,
            message: `Congratulations! You ranked #${rankPos} in the ${periodLabel2} ${catLabel} Leaderboard and earned ${rewardParts.join(" + ")}!`,
            data: {
              category: cat.key,
              period_type: periodType,
              rank: rankPos,
              reward_beans: actualBeans,
              reward_diamonds: actualDiamonds,
            },
          });

          results.push(`${cat.key}/${periodType}: #${rankPos} → ${user.id} (${rewardParts.join(" + ")})`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        distributed: results.length,
        details: results,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Leaderboard reward error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
