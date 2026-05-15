import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const adminToken = req.headers.get("x-admin-token");
    if (!authHeader?.startsWith("Bearer ") && !adminToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin check
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let adminUser: { id: string; role: string } | null = null;
    if (adminToken) {
      const { data: sessionRow } = await adminSupabase
        .from("admin_sessions")
        .select("admin_user_id")
        .eq("session_token", adminToken)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (sessionRow?.admin_user_id) {
        const { data } = await adminSupabase
          .from("admin_users")
          .select("id, role")
          .eq("id", sessionRow.admin_user_id)
          .eq("is_active", true)
          .maybeSingle();
        adminUser = data;
      }
    }

    if (!adminUser && authHeader?.startsWith("Bearer ")) {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
      if (!userError && user) {
        const { data } = await adminSupabase
          .from("admin_users")
          .select("id, role")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        adminUser = data;
      }
    }

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

    const { data: activePackages } = await adminSupabase
      .from("coin_packages")
      .select("coins_amount, bonus_coins, price_usd, product_id")
      .eq("is_active", true);

    const matchingPackage = (activePackages || []).find((pkg: any) => {
      const baseCoins = Number(pkg.coins_amount || 0);
      const totalCoins = baseCoins + Number(pkg.bonus_coins || 0);
      return baseCoins === Number(coinAmount) || totalCoins === Number(coinAmount);
    });

    const priceUsd = Number(matchingPackage?.price_usd || 0);

    // Record in recharge_transactions
    const { error: rechargeError } = await adminSupabase.from("recharge_transactions").insert({
      user_id: userId,
      coins_received: coinAmount,
      coins_amount: coinAmount,
      amount: priceUsd,
      usd_amount: priceUsd,
      payment_method: "admin_manual_recovery",
      purchase_source: "admin_manual",
      google_order_id: googleOrderId || `admin_recovery_${Date.now()}`,
      google_product_id: matchingPackage?.product_id || null,
      transaction_id: googleOrderId || `admin_recovery_${Date.now()}`,
      status: "completed",
      completed_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      currency: "USD",
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
