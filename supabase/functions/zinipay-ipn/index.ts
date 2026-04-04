import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    let body: Record<string, any> = {};

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      formData.forEach((value, key) => { body[key] = value.toString(); });
    } else {
      const text = await req.text();
      try { body = JSON.parse(text); } catch {
        const params = new URLSearchParams(text);
        params.forEach((value, key) => { body[key] = value; });
      }
    }

    console.log("[ZiniPay IPN] Received:", JSON.stringify(body));

    // Extract data from ZiniPay webhook
    const invoiceId = body.invoiceId || body.invoice_id || body.val_id;
    const status = body.status || body.pay_status;
    const transactionId = body.transaction_id || body.transactionId;
    const amount = body.amount;
    const paymentMethod = body.paymentMethod || body.payment_method;
    const metadata = body.metadata || {};

    const orderId = metadata.order_id || body.order_id;
    const userId = metadata.user_id || body.user_id;
    const totalCoins = parseInt(metadata.total_coins || body.total_coins) || 0;
    const paymentMethodId = metadata.payment_method_id || body.payment_method_id;

    if (!orderId) {
      if (invoiceId) {
        console.log("[ZiniPay IPN] No order_id in metadata, invoiceId:", invoiceId);
      }
      throw new Error("Order ID not found in webhook data");
    }

    // Fetch order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("helper_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      console.error("[ZiniPay IPN] Order not found:", orderId);
      throw new Error("Order not found");
    }

    if (!["pending", "gateway_pending", "processing"].includes(order.status)) {
      console.log(`[ZiniPay IPN] Order ${orderId} already processed (status: ${order.status})`);
      return new Response(JSON.stringify({ status: "already_processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ═══ VERIFY WITH ZINIPAY API (required — no blind trust of webhook status) ═══
    const orderDetails = order.payment_details as any;
    const pmId = paymentMethodId || orderDetails?.payment_method_id;
    let verified = false;

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
          console.log("[ZiniPay IPN] Verify response:", JSON.stringify(verifyData));

          if (verifyData.status === "COMPLETED" || verifyData.status === "success") {
            verified = true;
          }
        } catch (e) {
          console.error("[ZiniPay IPN] API verify failed:", e.message);
        }
      }
    }

    // 🛡️ HARDENED: Only accept if API verification passed
    // Do NOT blindly trust webhook status strings
    const isSuccess = verified;

    if (!isSuccess) {
      // Log the unverified webhook attempt
      console.log(`[ZiniPay IPN] ⚠️ Webhook received but API verification failed for order ${orderId}. Status: ${status}`);
      
      // If webhook says success but API didn't confirm, log for reconciliation
      if (status === "COMPLETED" || status === "success" || status === "Successful") {
        await supabaseAdmin.from("payment_reconciliation_log").insert({
          event_type: "credit_failed",
          gateway: "zinipay_ipn",
          user_id: userId || order.user_id,
          order_id: orderId,
          transaction_id: transactionId || invoiceId,
          amount_coins: totalCoins || order.coin_amount,
          metadata: { reason: "Webhook claimed success but API verification failed", webhook_status: status, invoice_id: invoiceId },
        });
      }

      // Update order to pending for manual review
      await supabaseAdmin
        .from("helper_orders")
        .update({
          status: "pending",
          payment_details: {
            ...orderDetails,
            ipn_status: status || "UNVERIFIED",
            invoice_id: invoiceId,
            api_verified: false,
            needs_manual_review: true,
          },
        })
        .eq("id", orderId);

      return new Response(JSON.stringify({ status: "unverified_pending_review" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ═══ PAYMENT VERIFIED — USE SAFE CREDIT ═══
    const coinsToCredit = totalCoins || order.coin_amount;
    const creditUserId = userId || order.user_id;

    console.log(`[ZiniPay IPN] ✅ API verified! Crediting ${coinsToCredit} diamonds to user ${creditUserId}`);

    // 🛡️ Use safe_credit_diamonds (idempotent, with reconciliation)
    const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("safe_credit_diamonds", {
      p_user_id: creditUserId,
      p_amount: coinsToCredit,
      p_gateway: "zinipay_ipn",
      p_order_id: orderId,
      p_transaction_id: transactionId || invoiceId,
      p_amount_usd: order.amount_usd || 0,
      p_metadata: {
        invoice_id: invoiceId,
        payment_method_used: paymentMethod,
        helper_id: order.helper_id,
      },
    });

    if (creditError) {
      console.error("[ZiniPay IPN] safe_credit_diamonds RPC error:", creditError);
      throw new Error("Failed to credit diamonds");
    }

    const result = creditResult as any;
    if (result?.error === "duplicate") {
      console.log(`[ZiniPay IPN] Duplicate credit blocked for order ${orderId}`);
      return new Response(JSON.stringify({ status: "already_processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (!result?.success) {
      console.error("[ZiniPay IPN] Credit failed:", result);
      throw new Error(result?.error || "Failed to credit diamonds");
    }

    // Record in recharge_transactions
    await supabaseAdmin.from("recharge_transactions").insert({
      user_id: creditUserId,
      amount: order.amount_usd,
      coins_added: coinsToCredit,
      payment_method: "zinipay",
      transaction_id: transactionId || invoiceId || orderDetails?.txn_id,
      status: "completed",
      payment_details: {
        gateway: "zinipay",
        invoice_id: invoiceId,
        transaction_id: transactionId,
        amount: amount,
        payment_method_used: paymentMethod,
        order_id: orderId,
        helper_id: order.helper_id,
        verified: true,
        balance_before: result.balance_before,
        balance_after: result.balance_after,
      },
    });

    // Update order
    await supabaseAdmin
      .from("helper_orders")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        payment_details: {
          ...orderDetails,
          ipn_status: "COMPLETED",
          invoice_id: invoiceId,
          transaction_id: transactionId,
          zinipay_payment_method: paymentMethod,
          verified: true,
          balance_before: result.balance_before,
          balance_after: result.balance_after,
        },
      })
      .eq("id", orderId);

    // First recharge bonus
    if (orderDetails?.is_first_recharge) {
      await supabaseAdmin.from("first_recharge_claims").upsert({
        user_id: creditUserId,
        package_id: order.package_id,
        bonus_coins: orderDetails.bonus_coins || 0,
      }, { onConflict: "user_id", ignoreDuplicates: true });
    }

    // Notification
    await supabaseAdmin.from("notifications").insert({
      user_id: creditUserId,
      type: "recharge_success",
      title: "💎 Diamonds Added!",
      message: `${coinsToCredit.toLocaleString()} diamonds have been added to your account!`,
      data: { order_id: orderId, coins: coinsToCredit, gateway: "zinipay" },
    });

    console.log(`[ZiniPay IPN] ✅ SUCCESS: ${coinsToCredit} diamonds → user ${creditUserId} (${result.balance_before} → ${result.balance_after})`);

    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[ZiniPay IPN] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
