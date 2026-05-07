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
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

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

    const { package_id, payment_method_id, origin_url, transaction_id, payment_proof, skip_redirect } = await req.json();
    if (!package_id || !payment_method_id) throw new Error("Package ID and Payment Method ID are required");

    // Fetch payment method with gateway credentials
    const { data: paymentMethod, error: pmError } = await supabaseClient
      .from("helper_country_payment_methods")
      .select("*, helper:topup_helpers!helper_country_payment_methods_helper_id_fkey(id, user_id, wallet_balance, is_active)")
      .eq("id", payment_method_id)
      .eq("is_active", true)
      .single();

    if (pmError || !paymentMethod) throw new Error("Payment method not found");

    const gatewayInfo = paymentMethod.additional_info as any;
    if (gatewayInfo?.gateway_type !== "zinipay") throw new Error("Invalid gateway: not ZiniPay");

    const selectedDisplayMethod = String(gatewayInfo?.display_method || paymentMethod.method_name || "").toLowerCase();
    const selectedAccountNumber = String(
      paymentMethod.account_number || gatewayInfo?.display_number || gatewayInfo?.account_number || ""
    ).trim();

    // Get ZiniPay credentials
    const zinipayApiKey = gatewayInfo.zinipay_api_key || Deno.env.get("ZINIPAY_API_KEY");
    if (!zinipayApiKey) throw new Error("ZiniPay API key not configured");
    const zinipaySecretId = gatewayInfo.zinipay_secret_id || Deno.env.get("ZINIPAY_SECRET_ID");

    // Fetch package
    const { data: pkg, error: pkgError } = await supabaseClient
      .from("coin_packages")
      .select("*")
      .eq("id", package_id)
      .eq("is_active", true)
      .single();

    if (pkgError || !pkg) throw new Error("Package not found");

    // Get currency rate for BDT
    const { data: rateData } = await supabaseClient
      .from("currency_rates")
      .select("rate_to_usd, currency_code")
      .eq("currency_code", "BDT")
      .eq("is_active", true)
      .maybeSingle();

    const rate = rateData?.rate_to_usd || 120;
    const localAmount = Math.round(pkg.price_usd * rate * 100) / 100;

    // Check first recharge bonus
    const { data: firstRechargeData } = await supabaseClient
      .from("first_recharge_claims")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isFirstRecharge = !firstRechargeData;
    const baseCoins = pkg.coins_amount || pkg.coins || 0;
    const bonusCoins = isFirstRecharge && (pkg.bonus_coins || 0) > 0
      ? pkg.bonus_coins
      : 0;
    const totalCoins = baseCoins + bonusCoins;

    const txnId = `ML_ZP_${Date.now()}_${user.id.substring(0, 8)}`;

    // ═══ RESOLVE REDIRECT URLs (used for both modes) ═══
    const requestedOrigin = typeof origin_url === "string" ? origin_url.trim() : "";

    const isUnsafeRedirectHost = (host: string) => {
      const normalized = host.toLowerCase();
      return (
        normalized.includes("id-preview--") ||
        normalized.endsWith(".lovableproject.com") ||
        normalized === "localhost" ||
        normalized.startsWith("127.")
      );
    };

    const toSafeOrigin = (candidate?: string | null) => {
      if (!candidate) return null;
      try {
        const parsed = new URL(candidate);
        if (isUnsafeRedirectHost(parsed.hostname)) return null;
        return parsed.origin;
      } catch {
        return null;
      }
    };

    // ZiniPay requires redirect domain to match brand's registered website URL
    // Production domain: merilive.com (registered in ZiniPay dashboard)
    const redirectBase =
      toSafeOrigin(gatewayInfo?.redirect_base_url as string | undefined) ||
      toSafeOrigin(Deno.env.get("ZINIPAY_REDIRECT_BASE_URL")) ||
      "https://merilive.com";

    // ═══ CREATE ORDER ═══
    const { data: order, error: orderError } = await supabaseClient
      .from("helper_orders")
      .insert({
        helper_id: paymentMethod.helper_id,
        user_id: user.id,
        coin_amount: totalCoins,
        amount_usd: pkg.price_usd,
        amount_local: localAmount,
        currency_code: "BDT",
        payment_method: "zinipay",
        user_country_code: paymentMethod.country_code,
        package_id: pkg.id,
        user_payment_proof: payment_proof || null,
        payment_details: {
          gateway: "zinipay",
          txn_id: txnId,
          user_transaction_id: transaction_id || null,
          is_first_recharge: isFirstRecharge,
          bonus_coins: bonusCoins,
          base_coins: baseCoins,
          total_coins: totalCoins,
          payment_method_id: payment_method_id,
          display_method: selectedDisplayMethod,
          display_number: selectedAccountNumber,
        },
        status: "gateway_pending",
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // ═══ ALWAYS CREATE ZINIPAY PAYMENT SESSION (both modes) ═══
    const webhookUrl = `${supabaseUrl}/functions/v1/zinipay-ipn`;
    const successUrl = new URL("/payment-success", redirectBase);
    successUrl.searchParams.set("order_id", order.id);
    successUrl.searchParams.set("gateway", "zinipay");

    const cancelUrl = new URL("/recharge", redirectBase);
    cancelUrl.searchParams.set("payment", "cancelled");

    console.log(`[ZiniPay] Creating payment session | order: ${order.id} | mode: ${skip_redirect ? 'in-app' : 'redirect'} | BDT ${localAmount}`);

    const zinipayRes = await fetch("https://api.zinipay.com/v1/payment/create", {
      method: "POST",
      headers: {
        "zini-api-key": zinipayApiKey,
        ...(zinipaySecretId ? { "zini-secret-key": zinipaySecretId, "zini-secret-id": zinipaySecretId } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: localAmount.toString(),
        redirect_url: successUrl.toString(),
        cancel_url: cancelUrl.toString(),
        webhook_url: webhookUrl,
        cus_name: user.email?.split("@")[0] || "Customer",
        cus_email: user.email || "customer@merilive.app",
        metadata: {
          order_id: order.id,
          user_id: user.id,
          total_coins: totalCoins,
          payment_method_id: payment_method_id,
          txn_id: txnId,
          preferred_method: selectedDisplayMethod,
          preferred_account: selectedAccountNumber,
          phone: selectedAccountNumber,
          user_trx_id: transaction_id || null,
        },
      }),
    });

    const zinipayData = await zinipayRes.json();
    console.log(`[ZiniPay] API response:`, JSON.stringify(zinipayData));

    if (!zinipayData.status || !zinipayData.payment_url) {
      console.error("[ZiniPay] Session creation failed:", zinipayData);
      // Don't throw - order is already created, just mark it for manual processing
      await supabaseClient
        .from("helper_orders")
        .update({
          payment_details: {
            ...(order.payment_details as any),
            zinipay_error: zinipayData.message || "Session creation failed",
            needs_manual_review: true,
          },
        })
        .eq("id", order.id);

      if (skip_redirect) {
        // In-app mode: still return success, helper will process manually
        return new Response(JSON.stringify({
          success: true,
          order_id: order.id,
          gateway: "zinipay",
          txn_id: txnId,
          auto_verify: false,
          message: "Order created. Manual verification required.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      throw new Error(zinipayData.message || "ZiniPay session creation failed");
    }

    // Extract invoice ID from payment URL or response
    const invoiceId = zinipayData.invoiceId || zinipayData.invoice_id || 
      zinipayData.payment_url?.split("/").pop() || null;

    // Update order with ZiniPay session info
    await supabaseClient
      .from("helper_orders")
      .update({
        payment_details: {
          ...(order.payment_details as any),
          zinipay_payment_url: zinipayData.payment_url,
          zinipay_invoice_id: invoiceId,
        },
      })
      .eq("id", order.id);

    console.log(`[ZiniPay] ✅ Session created | order: ${order.id} | invoice: ${invoiceId} | user: ${user.id} | BDT ${localAmount} | coins: ${totalCoins} | method: ${selectedDisplayMethod}`);

    if (skip_redirect) {
      // ═══ MODE 1: In-app modal (no redirect) ═══
      // Session created, IPN webhook will auto-verify when payment completes
      return new Response(JSON.stringify({
        success: true,
        order_id: order.id,
        gateway: "zinipay",
        txn_id: txnId,
        invoice_id: invoiceId,
        auto_verify: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ═══ MODE 2: Redirect flow ═══
    return new Response(JSON.stringify({
      url: zinipayData.payment_url,
      order_id: order.id,
      gateway: "zinipay",
      txn_id: txnId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[ZiniPay] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
