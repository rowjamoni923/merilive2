import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Google Play product mapping (must match verify-google-purchase)
const PLAY_STORE_PRODUCTS: Record<string, { coins: number; priceUsd: number }> = {
  'diamonds_7000_v2': { coins: 7000, priceUsd: 1.99 },
  'diamonds_13200_v2': { coins: 13200, priceUsd: 3.99 },
  'diamonds_56000_v2': { coins: 56000, priceUsd: 14.99 },
  'diamonds_169000_v2': { coins: 169000, priceUsd: 23.99 },
  'diamonds_470000_v2': { coins: 470000, priceUsd: 59.99 },
  'diamonds_650000_v2': { coins: 650000, priceUsd: 129.99 },
};

/**
 * Admin Manual Purchase Verification & Credit
 * 
 * When a user reports "I paid but didn't get diamonds", admin can:
 * 1. Enter the user_id and coin amount
 * 2. This function credits the coins and records it as admin_manual
 * 
 * Only accessible by admin users (verified via admin_users table)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the caller is an admin
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin check
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: adminUser } = await adminSupabase
      .from("admin_users")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, coinAmount, reason, googleOrderId } = await req.json();

    if (!userId || !coinAmount || coinAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "userId and coinAmount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this order was already credited (anti-duplicate)
    if (googleOrderId) {
      const { data: existing } = await adminSupabase
        .from("recharge_transactions")
        .select("id")
        .eq("google_order_id", googleOrderId)
        .limit(1);

      if (existing && existing.length > 0) {
        return new Response(
          JSON.stringify({ success: false, error: "This order has already been credited", alreadyCredited: true }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Verify user exists
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("id, display_name, coins")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find matching product for price
    let priceUsd = 0;
    for (const [, product] of Object.entries(PLAY_STORE_PRODUCTS)) {
      if (product.coins === coinAmount) {
        priceUsd = product.priceUsd;
        break;
      }
    }

    // Record in recharge_transactions
    const { error: rechargeError } = await adminSupabase.from("recharge_transactions").insert({
      user_id: userId,
      coins_received: coinAmount,
      amount: priceUsd,
      payment_method: "admin_manual_recovery",
      purchase_source: "admin_manual",
      google_order_id: googleOrderId || `admin_recovery_${Date.now()}`,
      status: "completed",
      completed_at: new Date().toISOString(),
      currency_code: "USD",
      notes: `🔧 Admin manual recovery by ${adminUser.role}. Reason: ${reason || "Purchase not delivered"}`,
    });

    if (rechargeError) {
      console.error("[admin-verify-purchase] Insert error:", rechargeError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to record transaction" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Credit coins atomically
    const { data: addData, error: addError } = await adminSupabase.rpc("add_coins", {
      p_user_id: userId,
      p_amount: coinAmount,
    });

    if (addError) {
      console.error("[admin-verify-purchase] add_coins error:", addError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to credit coins" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newBalance = (addData as any)?.new_balance;

    // Log admin action
    await adminSupabase.from("admin_logs").insert({
      admin_id: adminUser.id,
      action_type: "purchase_recovery",
      target_id: userId,
      target_type: "user",
      details: {
        coin_amount: coinAmount,
        price_usd: priceUsd,
        google_order_id: googleOrderId,
        reason,
        new_balance: newBalance,
        user_name: profile.display_name,
      },
    });

    console.log(`[admin-verify-purchase] ✅ Credited ${coinAmount} coins to ${profile.display_name} (${userId}). New balance: ${newBalance}`);

    return new Response(
      JSON.stringify({
        success: true,
        coinAmount,
        newBalance,
        userName: profile.display_name,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[admin-verify-purchase] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
