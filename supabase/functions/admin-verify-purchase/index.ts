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
 * Pkg321: Added section permission check (user-management with edit right).
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

    // Section permission check (user-management edit)
    if (adminUser.role !== "owner") {
      const { data: section } = await adminSupabase
        .from("admin_sections")
        .select("id")
        .eq("section_key", "user-management")
        .eq("is_active", true)
        .maybeSingle();
      if (section?.id) {
        const { data: perm } = await adminSupabase
          .from("admin_section_permissions")
          .select("can_edit")
          .eq("admin_user_id", adminUser.id)
          .eq("section_id", section.id)
          .maybeSingle();
        if (!perm?.can_edit) {
          return new Response(
            JSON.stringify({ success: false, error: "Insufficient permission for user-management" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const { userId, coinAmount, reason, googleOrderId, productId } = await req.json();

    if (!userId || !coinAmount || coinAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "userId and coinAmount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user exists
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("id, display_name, coins, diamonds")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Credit through the same DB bonus pipeline used by real recharge flows.
    // This records recharge_transactions, updates total_recharged, applies
    // package bonus, first-recharge bonus, VIP/Noble bonus, invitation logic,
    // wallet ledger context, and duplicate Google Order ID protection atomically.
    const { data: recoveryData, error: recoveryError } = await adminSupabase.rpc("admin_recover_purchase_credit", {
      p_user_id: userId,
      p_coin_amount: Math.floor(Number(coinAmount)),
      p_google_order_id: googleOrderId || null,
      p_product_id: productId || null,
      p_reason: reason || "Purchase not delivered",
      p_admin_id: adminUser.id,
    });

    if (recoveryError) {
      console.error("[admin-verify-purchase] recovery RPC error:", recoveryError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to credit purchase" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!recoveryData?.success) {
      const status = recoveryData?.alreadyCredited ? 409 : 400;
      return new Response(
        JSON.stringify(recoveryData || { success: false, error: "Could not credit diamonds" }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newBalance = Number(recoveryData.newBalance ?? 0);
    const creditedCoins = Number(recoveryData.coinAmount ?? coinAmount);
    const firstRechargeBonusCoins = Number(recoveryData.firstRechargeBonusCoins ?? 0);
    const vipBonusDiamonds = Number(recoveryData.vipBonusDiamonds ?? 0);

    // Log admin action
    await adminSupabase.from("admin_logs").insert({
      admin_id: adminUser.id,
      action_type: "purchase_recovery",
      target_id: userId,
      target_type: "user",
      details: {
        coin_amount: creditedCoins,
        base_coins: recoveryData.baseCoins,
        package_bonus_coins: recoveryData.packageBonusCoins,
        first_recharge_bonus_coins: firstRechargeBonusCoins,
        vip_bonus_diamonds: vipBonusDiamonds,
        price_usd: recoveryData.priceUsd,
        google_order_id: googleOrderId,
        product_id: productId || recoveryData.productId,
        recharge_transaction_id: recoveryData.transactionId,
        reason,
        new_balance: newBalance,
        user_name: profile.display_name,
      },
    });

    console.log(`[admin-verify-purchase] ✅ Credited ${creditedCoins} coins to ${profile.display_name} (${userId}). New balance: ${newBalance}`);

    return new Response(
      JSON.stringify({
        success: true,
        coinAmount: creditedCoins,
        baseCoins: recoveryData.baseCoins,
        packageBonusCoins: recoveryData.packageBonusCoins,
        firstRechargeBonusCoins,
        vipBonusDiamonds,
        newBalance,
        transactionId: recoveryData.transactionId,
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
