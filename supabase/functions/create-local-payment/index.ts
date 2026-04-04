import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CURRENCY_ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");
    const user = userData.user;

    const { package_id, payment_method_id, origin_url } = await req.json();
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
    if (!gatewayInfo?.gateway_type) throw new Error("Invalid gateway configuration");

    const gatewayType = gatewayInfo.gateway_type; // 'sslcommerz' or 'aamarpay'

    // Fetch package
    const { data: pkg, error: pkgError } = await supabaseClient
      .from("coin_packages")
      .select("*")
      .eq("id", package_id)
      .eq("is_active", true)
      .single();

    if (pkgError || !pkg) throw new Error("Package not found");

    // Get currency rate for BDT (both gateways are BD-focused)
    const { data: rateData } = await supabaseClient
      .from("currency_rates")
      .select("rate_to_usd, currency_code")
      .eq("currency_code", "BDT")
      .eq("is_active", true)
      .maybeSingle();

    const rate = rateData?.rate_to_usd || 120; // Fallback BDT rate
    const localAmount = Math.round(pkg.price_usd * rate * 100) / 100;
    const currency = "BDT";

    // Check first recharge bonus
    const { data: firstRechargeData } = await supabaseClient
      .from("first_recharge_claims")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isFirstRecharge = !firstRechargeData;
    const bonusCoins = isFirstRecharge && pkg.bonus_percentage > 0
      ? Math.floor(pkg.coins * pkg.bonus_percentage / 100)
      : 0;
    const totalCoins = pkg.coins + bonusCoins;

    // Generate unique transaction ID
    const txnId = `ML${Date.now()}_${user.id.substring(0, 8)}`;

    // Create pending order in helper_orders
    const { data: order, error: orderError } = await supabaseClient
      .from("helper_orders")
      .insert({
        helper_id: paymentMethod.helper_id,
        user_id: user.id,
        coin_amount: totalCoins,
        amount_usd: pkg.price_usd,
        amount_local: localAmount,
        currency_code: currency,
        payment_method: gatewayType,
        user_country_code: paymentMethod.country_code,
        package_id: pkg.id,
        payment_details: {
          gateway: gatewayType,
          txn_id: txnId,
          is_first_recharge: isFirstRecharge,
          bonus_coins: bonusCoins,
          base_coins: pkg.coins,
          total_coins: totalCoins,
          payment_method_id: payment_method_id,
        },
        status: "gateway_pending",
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const successUrl = `${origin_url}/payment-success?order_id=${order.id}&gateway=${gatewayType}`;
    const failUrl = `${origin_url}/recharge?payment=failed`;
    const cancelUrl = `${origin_url}/recharge?payment=cancelled`;
    const ipnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/local-payment-ipn`;

    let paymentUrl: string;

    if (gatewayType === "sslcommerz") {
      // ═══ SSLCOMMERZ PAYMENT INITIATION ═══
      const storeId = gatewayInfo.store_id;
      const storePassword = gatewayInfo.store_password;
      const isSandbox = gatewayInfo.is_sandbox ?? false;
      const baseUrl = isSandbox 
        ? "https://sandbox.sslcommerz.com/gwprocess/v4/api.php"
        : "https://securepay.sslcommerz.com/gwprocess/v4/api.php";

      const formData = new URLSearchParams();
      formData.append("store_id", storeId);
      formData.append("store_passwd", storePassword);
      formData.append("total_amount", localAmount.toString());
      formData.append("currency", currency);
      formData.append("tran_id", txnId);
      formData.append("success_url", ipnUrl);
      formData.append("fail_url", ipnUrl);
      formData.append("cancel_url", ipnUrl);
      formData.append("ipn_url", ipnUrl);
      formData.append("cus_name", user.email?.split("@")[0] || "Customer");
      formData.append("cus_email", user.email || "customer@merilive.app");
      formData.append("cus_phone", "01700000000");
      formData.append("cus_add1", "Dhaka");
      formData.append("cus_city", "Dhaka");
      formData.append("cus_country", "Bangladesh");
      formData.append("shipping_method", "NO");
      formData.append("product_name", `${totalCoins} Diamonds`);
      formData.append("product_category", "Digital Goods");
      formData.append("product_profile", "digital-goods");
      formData.append("value_a", order.id); // order_id
      formData.append("value_b", user.id); // user_id
      formData.append("value_c", totalCoins.toString()); // total_coins
      formData.append("value_d", payment_method_id); // payment_method_id

      const sslRes = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const sslData = await sslRes.json();
      
      if (sslData.status !== "SUCCESS" || !sslData.GatewayPageURL) {
        console.error("[LocalPayment] SSLCommerz error:", sslData);
        throw new Error(sslData.failedreason || "SSLCommerz session creation failed");
      }

      paymentUrl = sslData.GatewayPageURL;
      
      // Update order with session ID
      await supabaseClient
        .from("helper_orders")
        .update({ 
          payment_details: {
            ...order.payment_details as any,
            ssl_session_key: sslData.sessionkey,
          }
        })
        .eq("id", order.id);

    } else if (gatewayType === "aamarpay") {
      // ═══ AAMARPAY PAYMENT INITIATION ═══
      const storeId = gatewayInfo.store_id;
      const signatureKey = gatewayInfo.signature_key;
      const isSandbox = gatewayInfo.is_sandbox ?? false;
      const baseUrl = isSandbox
        ? "https://sandbox.aamarpay.com/jsonpost.php"
        : "https://secure.aamarpay.com/jsonpost.php";

      const aamarPayload = {
        store_id: storeId,
        signature_key: signatureKey,
        tran_id: txnId,
        amount: localAmount.toString(),
        currency: currency,
        desc: `${totalCoins} Diamonds - MeriLive`,
        cus_name: user.email?.split("@")[0] || "Customer",
        cus_email: user.email || "customer@merilive.app",
        cus_phone: "01700000000",
        cus_add1: "Dhaka",
        cus_city: "Dhaka",
        cus_country: "Bangladesh",
        success_url: ipnUrl,
        fail_url: ipnUrl,
        cancel_url: ipnUrl,
        type: "json",
        opt_a: order.id,
        opt_b: user.id,
        opt_c: totalCoins.toString(),
        opt_d: payment_method_id,
      };

      const aamarRes = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aamarPayload),
      });

      const aamarData = await aamarRes.json();

      if (!aamarData.payment_url) {
        console.error("[LocalPayment] AamarPay error:", aamarData);
        throw new Error(aamarData.error || "AamarPay session creation failed");
      }

      paymentUrl = aamarData.payment_url;

    } else {
      throw new Error(`Unsupported gateway: ${gatewayType}`);
    }

    console.log(`[LocalPayment] Created ${gatewayType} session | order: ${order.id} | user: ${user.id} | ${currency} ${localAmount} | coins: ${totalCoins}`);

    return new Response(JSON.stringify({ 
      url: paymentUrl, 
      order_id: order.id,
      gateway: gatewayType,
      txn_id: txnId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[LocalPayment] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
