import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("User not authenticated");
    }
    const token = authHeader.slice("Bearer ".length);
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");
    const user = userData.user;

    const { order_id } = await req.json();
    if (!order_id) throw new Error("Order ID is required");

    // Fetch order (must belong to this user)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("helper_orders")
      .select("*")
      .eq("id", order_id)
      .eq("user_id", user.id)
      .single();

    if (orderErr || !order) throw new Error("Order not found");

    if (order.status === "completed") {
      return new Response(JSON.stringify({ success: true, status: "already_completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["pending", "gateway_pending", "processing"].includes(order.status)) {
      throw new Error(`Order cannot be verified (status: ${order.status})`);
    }

    const orderDetails = order.payment_details as any;
    const invoiceId = orderDetails?.zinipay_invoice_id;
    const userTrxId = orderDetails?.user_transaction_id;
    const pmId = orderDetails?.payment_method_id;

    console.log(`[VerifyZiniPay] Verifying order ${order_id} | invoice: ${invoiceId} | userTrx: ${userTrxId}`);

    // ═══ STEP 1: Try ZiniPay API verification ═══
    let zinipayVerified = false;

    if (invoiceId) {
      let zinipayApiKey = Deno.env.get("ZINIPAY_API_KEY");
      if (!zinipayApiKey && pmId) {
        const { data: pm } = await supabaseAdmin
          .from("helper_country_payment_methods")
          .select("additional_info")
          .eq("id", pmId)
          .single();
        zinipayApiKey = (pm?.additional_info as any)?.zinipay_api_key;
      }

      if (zinipayApiKey) {
        try {
          const verifyRes = await fetch("https://api.zinipay.com/v1/payment/verify", {
            method: "POST",
            headers: {
              "zini-api-key": zinipayApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ invoiceId, apiKey: zinipayApiKey }),
          });
          const verifyData = await verifyRes.json();
          console.log(`[VerifyZiniPay] API verify response:`, JSON.stringify(verifyData));

          if (verifyData.status === "COMPLETED" || verifyData.status === "success" || verifyData.pay_status === "Successful") {
            zinipayVerified = true;
          }
        } catch (e) {
          console.log(`[VerifyZiniPay] ZiniPay API call failed:`, e.message);
        }
      }
    }

    // ═══ STEP 2: If not verified, record for manual review ═══
    if (!zinipayVerified) {
      if (userTrxId && userTrxId.trim().length >= 4) {
        console.log(`[VerifyZiniPay] 📝 TrxID provided but API not confirmed. Recording pending.`);

        await supabaseAdmin
          .from("helper_orders")
          .update({
            status: "pending",
            payment_details: {
              ...orderDetails,
              user_transaction_id: userTrxId,
              recorded_at: new Date().toISOString(),
              verification_method: "trxid_recorded_only",
              auto_approved: false,
            },
          })
          .eq("id", order_id);

        return new Response(JSON.stringify({
          success: true,
          status: "recorded",
          message: "Your transaction has been recorded. It will be auto-approved once payment is confirmed.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[VerifyZiniPay] ❌ Cannot verify: no API confirmation and no valid TrxID`);
      return new Response(JSON.stringify({
        success: false,
        status: "unverified",
        message: "Payment could not be verified. Please provide a valid Transaction ID.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ STEP 3: Use safe_credit_diamonds (idempotent + reconciliation) ═══
    const coinsToCredit = order.coin_amount;
    console.log(`[VerifyZiniPay] ✅ API verified! Crediting ${coinsToCredit} diamonds to user ${user.id}`);

    const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("safe_credit_diamonds", {
      p_user_id: user.id,
      p_amount: coinsToCredit,
      p_gateway: "zinipay_verify",
      p_order_id: order_id,
      p_transaction_id: userTrxId || invoiceId || orderDetails?.txn_id,
      p_amount_usd: order.amount_usd || 0,
      p_metadata: {
        invoice_id: invoiceId,
        user_trx_id: userTrxId,
        helper_id: order.helper_id,
        verified_by_zinipay: true,
      },
    });

    if (creditError) {
      console.error(`[VerifyZiniPay] safe_credit_diamonds RPC error:`, creditError);
      throw new Error("Failed to credit diamonds");
    }

    const result = creditResult as any;

    if (result?.error === "duplicate") {
      console.log(`[VerifyZiniPay] Duplicate blocked for order ${order_id}`);
      return new Response(JSON.stringify({ success: true, status: "already_completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!result?.success) {
      console.error(`[VerifyZiniPay] Credit failed:`, result);
      throw new Error(result?.error || "Failed to credit diamonds");
    }

    // ═══ STEP 4: Update order status ═══
    await supabaseAdmin
      .from("helper_orders")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        payment_details: {
          ...orderDetails,
          ipn_status: "COMPLETED",
          verified: true,
          auto_approved: true,
          verified_at: new Date().toISOString(),
          verification_method: "zinipay_api",
          balance_before: result.balance_before,
          balance_after: result.balance_after,
        },
      })
      .eq("id", order_id);

    // ═══ STEP 5: Record transaction ═══
    await supabaseAdmin.from("recharge_transactions").insert({
      user_id: user.id,
      amount: order.amount_usd,
      coins_added: coinsToCredit,
      payment_method: "zinipay",
      transaction_id: userTrxId || invoiceId || orderDetails?.txn_id,
      status: "completed",
      payment_details: {
        gateway: "zinipay",
        invoice_id: invoiceId,
        user_trx_id: userTrxId,
        order_id: order_id,
        helper_id: order.helper_id,
        verified_by_zinipay: true,
        balance_before: result.balance_before,
        balance_after: result.balance_after,
      },
    });

    // ═══ STEP 6: First recharge bonus ═══
    if (orderDetails?.is_first_recharge) {
      await supabaseAdmin.from("first_recharge_claims").upsert({
        user_id: user.id,
        package_id: order.package_id,
        bonus_coins: orderDetails.bonus_coins || 0,
      }, { onConflict: "user_id", ignoreDuplicates: true });
    }

    // ═══ STEP 7: Notification ═══
    await supabaseAdmin.from("notifications").insert({
      user_id: user.id,
      type: "recharge_success",
      title: "💎 Diamonds Added!",
      message: `${coinsToCredit.toLocaleString()} diamonds have been added to your account!`,
      data: { order_id, coins: coinsToCredit, gateway: "zinipay" },
    });

    console.log(`[VerifyZiniPay] ✅ SUCCESS: ${coinsToCredit} diamonds → user ${user.id} (${result.balance_before} → ${result.balance_after})`);

    return new Response(JSON.stringify({
      success: true,
      status: "completed",
      coins_credited: coinsToCredit,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[VerifyZiniPay] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
