import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");
    const user = userData.user;

    const { session_id } = await req.json();
    if (!session_id) throw new Error("Session ID is required");

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve checkout session from Stripe API (server-side verification)
    const session = await stripe.checkout.sessions.retrieve(session_id);
    console.log(`[Stripe-Verify] Session ${session_id}: status=${session.payment_status}, user=${user.id}`);

    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({
        success: false,
        error: "Payment not completed",
        status: session.payment_status,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Verify this session belongs to this user
    const metadata = session.metadata || {};
    if (metadata.user_id !== user.id) {
      // 🛡️ Log unauthorized access attempt
      await supabaseAdmin.from("payment_reconciliation_log").insert({
        event_type: "credit_failed",
        gateway: "stripe",
        user_id: user.id,
        order_id: `stripe_${session_id}`,
        metadata: {
          reason: "User ID mismatch",
          session_user: metadata.user_id,
          requesting_user: user.id,
        },
      });
      throw new Error("Payment session does not belong to this user");
    }

    const totalCoins = parseInt(metadata.total_coins || "0");
    const baseCoins = parseInt(metadata.coins || "0");
    const bonusCoins = parseInt(metadata.bonus_coins || "0");
    const isFirstRecharge = metadata.is_first_recharge === "true";
    const packageId = metadata.package_id;

    if (totalCoins <= 0) throw new Error("Invalid coin amount in session metadata");

    // 🛡️ Use safe_credit_diamonds (idempotent, with reconciliation)
    const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("safe_credit_diamonds", {
      p_user_id: user.id,
      p_amount: totalCoins,
      p_gateway: "stripe",
      p_order_id: `stripe_${session_id}`,
      p_transaction_id: typeof session.payment_intent === 'string' ? session.payment_intent : session_id,
      p_amount_usd: (session.amount_total || 0) / 100,
      p_metadata: {
        base_coins: baseCoins,
        bonus_coins: bonusCoins,
        is_first_recharge: isFirstRecharge,
        package_id: packageId,
      },
    });

    if (creditError) {
      console.error("[Stripe-Verify] safe_credit_diamonds RPC error:", creditError);
      throw new Error("Failed to credit diamonds");
    }

    const result = creditResult as any;

    if (result?.error === "duplicate") {
      console.log(`[Stripe-Verify] Already processed: ${session_id}`);
      return new Response(JSON.stringify({
        success: true,
        already_processed: true,
        total_coins: totalCoins,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!result?.success) {
      console.error("[Stripe-Verify] Credit failed:", result);
      throw new Error(result?.error || "Failed to credit diamonds");
    }

    // Record transaction
    await supabaseAdmin.from("recharge_transactions").insert({
      user_id: user.id,
      google_order_id: `stripe_${session_id}`,
      product_id: `stripe_pkg_${packageId}`,
      amount_usd: (session.amount_total || 0) / 100,
      coins_credited: totalCoins,
      purchase_token: session_id,
      status: "completed",
      verification_data: {
        stripe_session_id: session_id,
        payment_intent: session.payment_intent,
        base_coins: baseCoins,
        bonus_coins: bonusCoins,
        is_first_recharge: isFirstRecharge,
        payment_method: "stripe",
        balance_before: result.balance_before,
        balance_after: result.balance_after,
      },
    });

    // First recharge claim
    if (isFirstRecharge && bonusCoins > 0) {
      await supabaseAdmin.from("first_recharge_claims").insert({
        user_id: user.id,
        package_id: packageId,
        original_coins: baseCoins,
        bonus_coins: bonusCoins,
        total_coins: totalCoins,
      });
    }

    // Notification
    await supabaseAdmin.from("notifications").insert({
      user_id: user.id,
      type: "payment_completed",
      title: "🎉 Diamonds Added!",
      message: `${totalCoins.toLocaleString()} diamonds added via Stripe!${bonusCoins > 0 ? ` (+${bonusCoins.toLocaleString()} first recharge bonus!)` : ""}`,
      data: {
        stripe_session_id: session_id,
        diamonds: totalCoins,
        payment_method: "stripe",
      },
    });

    console.log(`[Stripe-Verify] ✅ SUCCESS: ${totalCoins} diamonds → user ${user.id} (${result.balance_before} → ${result.balance_after})`);

    return new Response(JSON.stringify({
      success: true,
      total_coins: totalCoins,
      base_coins: baseCoins,
      bonus_coins: bonusCoins,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[Stripe-Verify] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
