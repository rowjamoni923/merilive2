import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    let body: Record<string, string> = {};

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      formData.forEach((value, key) => { body[key] = value.toString(); });
    } else if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      params.forEach((value, key) => { body[key] = value; });
    }

    console.log("[IPN] Received callback:", JSON.stringify(body));

    let orderId: string;
    let userId: string;
    let totalCoins: number;
    let paymentMethodId: string;
    let txnId: string;
    let status: string;
    let gatewayType: string;
    let validationData: any = {};

    if (body.value_a || body.val_id) {
      // ═══ SSLCOMMERZ IPN ═══
      gatewayType = "sslcommerz";
      orderId = body.value_a;
      userId = body.value_b;
      totalCoins = parseInt(body.value_c) || 0;
      paymentMethodId = body.value_d;
      txnId = body.tran_id;
      status = body.status;
      validationData = {
        val_id: body.val_id,
        amount: body.amount,
        currency: body.currency,
        bank_tran_id: body.bank_tran_id,
        card_type: body.card_type,
        card_brand: body.card_brand,
        store_amount: body.store_amount,
      };

      console.log(`[IPN] SSLCommerz: status=${status}, txn=${txnId}, order=${orderId}`);

      // 🛡️ REQUIRED: Validate with SSLCommerz API (never trust IPN status alone)
      if (status === "VALID" && body.val_id) {
        const { data: pm } = await supabaseAdmin
          .from("helper_country_payment_methods")
          .select("additional_info")
          .eq("id", paymentMethodId)
          .single();

        if (pm?.additional_info) {
          const gatewayInfo = pm.additional_info as any;
          const isSandbox = gatewayInfo.is_sandbox ?? false;
          const validateUrl = isSandbox
            ? `https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php`
            : `https://securepay.sslcommerz.com/validator/api/validationserverAPI.php`;

          const valRes = await fetch(
            `${validateUrl}?val_id=${body.val_id}&store_id=${gatewayInfo.store_id}&store_passwd=${gatewayInfo.store_password}&format=json`
          );
          const valData = await valRes.json();

          if (valData.status !== "VALID" && valData.status !== "VALIDATED") {
            console.error("[IPN] SSLCommerz validation FAILED:", valData);
            status = "FAILED";

            // 🛡️ Log failed verification attempt
            await supabaseAdmin.from("payment_reconciliation_log").insert({
              event_type: "credit_failed",
              gateway: "sslcommerz",
              user_id: userId,
              order_id: orderId,
              transaction_id: txnId,
              amount_coins: totalCoins,
              metadata: { reason: "SSLCommerz API validation failed", val_response: valData },
            });
          }
        } else {
          // 🛡️ No gateway credentials found — cannot verify, reject
          console.error("[IPN] SSLCommerz: No gateway credentials for payment method:", paymentMethodId);
          status = "FAILED";
          await supabaseAdmin.from("payment_reconciliation_log").insert({
            event_type: "credit_failed",
            gateway: "sslcommerz",
            user_id: userId,
            order_id: orderId,
            transaction_id: txnId,
            amount_coins: totalCoins,
            metadata: { reason: "Gateway credentials not found for verification" },
          });
        }
      }

    } else if (body.opt_a || body.pg_txnid) {
      // ═══ AAMARPAY IPN ═══
      gatewayType = "aamarpay";
      orderId = body.opt_a;
      userId = body.opt_b;
      totalCoins = parseInt(body.opt_c) || 0;
      paymentMethodId = body.opt_d;
      txnId = body.mer_txnid || body.pg_txnid;

      const aamarStatus = body.pay_status || body.status_code;
      if (aamarStatus === "Successful" || body.status_code === "2") {
        status = "VALID";
      } else {
        status = "FAILED";
      }

      validationData = {
        pg_txnid: body.pg_txnid,
        amount: body.amount,
        currency: body.currency,
        card_type: body.card_type,
        pay_status: body.pay_status,
        status_code: body.status_code,
      };

      console.log(`[IPN] AamarPay: status=${status}, txn=${txnId}, order=${orderId}`);

    } else {
      throw new Error("Unknown IPN format");
    }

    if (!orderId) throw new Error("Order ID not found in IPN");

    // Fetch the order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("helper_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      console.error("[IPN] Order not found:", orderId);
      throw new Error("Order not found");
    }

    if (order.status !== "gateway_pending") {
      console.log(`[IPN] Order ${orderId} already processed (status: ${order.status})`);
      const redirectUrl = status === "VALID"
        ? `https://merilive.lovable.app/payment-success?order_id=${orderId}&gateway=${gatewayType}`
        : `https://merilive.lovable.app/recharge?payment=failed`;
      return Response.redirect(redirectUrl, 302);
    }

    if (status === "VALID") {
      // ═══ PAYMENT VERIFIED — USE SAFE CREDIT ═══
      console.log(`[IPN] ✅ Payment verified! Using safe_credit_diamonds for ${totalCoins} → user ${userId}`);

      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("safe_credit_diamonds", {
        p_user_id: userId,
        p_amount: totalCoins,
        p_gateway: gatewayType,
        p_order_id: orderId,
        p_transaction_id: txnId,
        p_amount_usd: order.amount_usd || 0,
        p_metadata: { ...validationData, helper_id: order.helper_id },
      });

      if (creditError) {
        console.error("[IPN] safe_credit_diamonds RPC error:", creditError);
        throw new Error("Failed to credit diamonds");
      }

      const result = creditResult as any;

      if (result?.error === "duplicate") {
        console.log(`[IPN] Duplicate credit blocked for order ${orderId}`);
        return Response.redirect(
          `https://merilive.lovable.app/payment-success?order_id=${orderId}&gateway=${gatewayType}&already=true`,
          302
        );
      }

      if (!result?.success) {
        console.error("[IPN] Credit failed:", result);
        throw new Error(result?.error || "Failed to credit diamonds");
      }

      // Record in recharge_transactions
      await supabaseAdmin.from("recharge_transactions").insert({
        user_id: userId,
        amount: order.amount_usd,
        coins_added: totalCoins,
        payment_method: gatewayType,
        transaction_id: txnId,
        status: "completed",
        payment_details: {
          gateway: gatewayType,
          ...validationData,
          order_id: orderId,
          helper_id: order.helper_id,
          balance_before: result.balance_before,
          balance_after: result.balance_after,
        },
      });

      // Update order status
      await supabaseAdmin
        .from("helper_orders")
        .update({
          status: "completed",
          processed_at: new Date().toISOString(),
          payment_details: {
            ...(order.payment_details as any),
            ipn_status: status,
            ...validationData,
            balance_before: result.balance_before,
            balance_after: result.balance_after,
          },
        })
        .eq("id", orderId);

      // First recharge bonus
      const orderDetails = order.payment_details as any;
      if (orderDetails?.is_first_recharge) {
        await supabaseAdmin.from("first_recharge_claims").insert({
          user_id: userId,
          package_id: order.package_id,
          bonus_coins: orderDetails.bonus_coins || 0,
        }).onConflict("user_id").doNothing();
      }

      // Notification
      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        type: "recharge_success",
        title: "💎 Diamonds Added!",
        message: `${totalCoins.toLocaleString()} diamonds added via ${gatewayType === 'sslcommerz' ? 'SSLCommerz' : 'AamarPay'}!`,
        data: { order_id: orderId, coins: totalCoins, gateway: gatewayType },
      });

      console.log(`[IPN] ✅ SUCCESS: ${totalCoins} diamonds → user ${userId} (${result.balance_before} → ${result.balance_after})`);

      return Response.redirect(
        `https://merilive.lovable.app/payment-success?order_id=${orderId}&gateway=${gatewayType}&coins=${totalCoins}`,
        302
      );

    } else {
      // ═══ PAYMENT FAILED ═══
      console.log(`[IPN] ❌ Payment failed for order ${orderId}`);

      await supabaseAdmin
        .from("helper_orders")
        .update({
          status: "failed",
          payment_details: {
            ...(order.payment_details as any),
            ipn_status: status,
            ...validationData,
          },
        })
        .eq("id", orderId);

      return Response.redirect(
        `https://merilive.lovable.app/recharge?payment=failed&order_id=${orderId}`,
        302
      );
    }

  } catch (error: any) {
    console.error("[IPN] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
