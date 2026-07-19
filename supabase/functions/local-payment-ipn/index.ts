import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_RETURN_ORIGINS = new Set([
  "https://merilive.top",
  "https://merilive2.lovable.app",
  "https://id-preview--1c59f8d2-75bb-4fc1-a074-3c08560dd44b.lovable.app",
]);

function normalizeReturnOrigin(raw: unknown): string {
  try {
    const origin = new URL(String(raw || "")).origin;
    return ALLOWED_RETURN_ORIGINS.has(origin) ? origin : "https://merilive.top";
  } catch {
    return "https://merilive.top";
  }
}

function asMoney(value: unknown): number | null {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function assertSamePayment(order: any, bodyFields: { userId?: string; totalDiamonds?: number; paymentMethodId?: string; txnId?: string; amount?: unknown; currency?: string }) {
  const details = (order.payment_details || {}) as Record<string, unknown>;
  if (bodyFields.userId && bodyFields.userId !== order.user_id) throw new Error("IPN user mismatch");
  if (bodyFields.paymentMethodId && bodyFields.paymentMethodId !== details.payment_method_id) throw new Error("IPN payment method mismatch");
  if (bodyFields.txnId && details.txn_id && bodyFields.txnId !== details.txn_id) throw new Error("IPN transaction mismatch");
  if (bodyFields.totalDiamonds && Number(order.diamond_amount || 0) !== bodyFields.totalDiamonds) throw new Error("IPN coin amount mismatch");

  const paidAmount = asMoney(bodyFields.amount);
  if (paidAmount !== null && Math.abs(paidAmount - Number(order.amount_local || 0)) > 0.01) throw new Error("IPN amount mismatch");
  if (bodyFields.currency && String(bodyFields.currency).toUpperCase() !== String(order.currency_code || "").toUpperCase()) throw new Error("IPN currency mismatch");
}

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
    let totalDiamonds: number;
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
      totalDiamonds = parseInt(body.value_c) || 0;
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
              amount_coins: totalDiamonds,
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
            amount_coins: totalDiamonds,
            metadata: { reason: "Gateway credentials not found for verification" },
          });
        }
      }

    } else if (body.opt_a || body.pg_txnid) {
      // ═══ AAMARPAY IPN ═══
      gatewayType = "aamarpay";
      orderId = body.opt_a;
      userId = body.opt_b;
      totalDiamonds = parseInt(body.opt_c) || 0;
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

      // 🛡️ REQUIRED: verify AamarPay status against their transaction-check API.
      if (status === "VALID" && txnId) {
        const { data: pm } = await supabaseAdmin
          .from("helper_country_payment_methods")
          .select("additional_info")
          .eq("id", paymentMethodId)
          .single();

        const gatewayInfo = pm?.additional_info as any;
        if (gatewayInfo?.store_id && gatewayInfo?.signature_key) {
          const isSandbox = gatewayInfo.is_sandbox ?? false;
          const checkBase = isSandbox
            ? "https://sandbox.aamarpay.com/api/v1/trxcheck/request.php"
            : "https://secure.aamarpay.com/api/v1/trxcheck/request.php";
          const checkUrl = `${checkBase}?request_id=${encodeURIComponent(txnId)}&store_id=${encodeURIComponent(gatewayInfo.store_id)}&signature_key=${encodeURIComponent(gatewayInfo.signature_key)}&type=json`;
          const checkRes = await fetch(checkUrl);
          const checkData = await checkRes.json();
          const verified = checkData?.pay_status === "Successful" || String(checkData?.status_code || "") === "2";
          if (!verified) {
            console.error("[IPN] AamarPay validation FAILED:", checkData);
            status = "FAILED";
            await supabaseAdmin.from("payment_reconciliation_log").insert({
              event_type: "credit_failed",
              gateway: "aamarpay",
              user_id: userId,
              order_id: orderId,
              transaction_id: txnId,
              amount_coins: totalDiamonds,
              metadata: { reason: "AamarPay API validation failed", check_response: checkData },
            });
          } else {
            validationData = { ...validationData, gateway_validation: checkData };
          }
        } else {
          console.error("[IPN] AamarPay: No gateway credentials for payment method:", paymentMethodId);
          status = "FAILED";
          await supabaseAdmin.from("payment_reconciliation_log").insert({
            event_type: "credit_failed",
            gateway: "aamarpay",
            user_id: userId,
            order_id: orderId,
            transaction_id: txnId,
            amount_coins: totalDiamonds,
            metadata: { reason: "Gateway credentials not found for AamarPay verification" },
          });
        }
      }

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
    const returnOrigin = normalizeReturnOrigin((order.payment_details as any)?.origin_url);
    assertSamePayment(order, {
      userId,
      totalDiamonds,
      paymentMethodId,
      txnId,
      amount: validationData.amount,
      currency: validationData.currency,
    });

    if (order.status !== "gateway_pending") {
      console.log(`[IPN] Order ${orderId} already processed (status: ${order.status})`);
      const redirectUrl = status === "VALID"
        ? `${returnOrigin}/payment-success?order_id=${orderId}&gateway=${gatewayType}`
        : `${returnOrigin}/recharge?payment=failed`;
      return Response.redirect(redirectUrl, 302);
    }

    if (status === "VALID") {
      // ═══ PAYMENT VERIFIED — ATOMIC HELPER CREDIT ═══
      console.log(`[IPN] ✅ Payment verified! Completing helper-backed top-up for ${totalDiamonds} → user ${userId}`);

      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("complete_gateway_helper_topup", {
        p_order_id: orderId,
        p_gateway: gatewayType,
        p_transaction_id: txnId,
        p_validation_data: validationData,
      });

      if (creditError) {
        console.error("[IPN] complete_gateway_helper_topup RPC error:", creditError);
        throw new Error("Failed to credit diamonds");
      }

      const result = creditResult as any;

      if (result?.error === "duplicate" || result?.already_credited === true) {
        console.log(`[IPN] Duplicate credit blocked for order ${orderId}`);
        await supabaseAdmin
          .from("helper_orders")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
            payment_details: {
              ...(order.payment_details as any),
              ipn_status: status,
              duplicate_credit_blocked: true,
              ...validationData,
            },
          })
          .eq("id", orderId);
        return Response.redirect(
          `${returnOrigin}/payment-success?order_id=${orderId}&gateway=${gatewayType}&already=true`,
          302
        );
      }

      if (!result?.success) {
        console.error("[IPN] Credit failed:", result);
        throw new Error(result?.error || "Failed to credit diamonds");
      }

      // Record in recharge_transactions (schema-aligned)
      const { error: txErr } = await supabaseAdmin.from("recharge_transactions").insert({
        user_id: userId,
        helper_id: order.helper_id,
        order_id: orderId,
        payment_method: gatewayType,
        transaction_id: txnId,
        amount: order.amount_usd,
        usd_amount: order.amount_usd,
        currency: "USD",
        diamonds_amount: totalDiamonds,
        diamonds_received: totalDiamonds,
        status: "completed",
        completed_at: new Date().toISOString(),
        purchase_source: gatewayType,
        local_payment_provider: gatewayType,
        notes: JSON.stringify({
          gateway: gatewayType,
          ...validationData,
          balance_before: result.balance_before,
          balance_after: result.balance_after,
        }),
      });
      if (txErr) console.error("[IPN] recharge_transactions insert error:", txErr);

      // First recharge bonus (schema-aligned)
      const orderDetails = order.payment_details as any;
      if (orderDetails?.is_first_recharge && (orderDetails.bonus_diamonds || 0) > 0) {
        const { data: bonusRow } = await supabaseAdmin
          .from("first_recharge_bonus")
          .select("id")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (bonusRow?.id) {
          const { error: claimErr } = await supabaseAdmin.from("first_recharge_claims").insert({
            user_id: userId,
            bonus_id: bonusRow.id,
            original_amount: orderDetails.base_coins || (totalDiamonds - (orderDetails.bonus_diamonds || 0)),
            bonus_amount: orderDetails.bonus_diamonds || 0,
          });
          if (claimErr) console.error("[IPN] first_recharge_claims insert error:", claimErr);
        }
      }

      // Notification
      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        type: "recharge_success",
        title: "💎 Diamonds Added!",
        message: `${totalDiamonds.toLocaleString()} diamonds added via ${gatewayType === 'sslcommerz' ? 'SSLCommerz' : 'AamarPay'}!`,
        data: { order_id: orderId, coins: totalDiamonds, gateway: gatewayType },
      });

      console.log(`[IPN] ✅ SUCCESS: ${totalDiamonds} diamonds → user ${userId} (${result.balance_before} → ${result.balance_after})`);

      return Response.redirect(
        `${returnOrigin}/payment-success?order_id=${orderId}&gateway=${gatewayType}&coins=${totalDiamonds}`,
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
        `${returnOrigin}/recharge?payment=failed&order_id=${orderId}`,
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
