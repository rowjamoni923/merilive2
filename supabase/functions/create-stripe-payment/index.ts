import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Country code → Stripe currency + local payment methods mapping
// This ensures each country sees ONLY their own payment methods
const COUNTRY_PAYMENT_CONFIG: Record<string, {
  currency: string;
  payment_method_types: string[];
  locale: string;
}> = {
  // Bangladesh
  BD: {
    currency: "bdt",
    payment_method_types: ["card"],
    locale: "auto",
  },
  // India
  IN: {
    currency: "inr",
    payment_method_types: ["card"],
    locale: "auto",
  },
  PK: {
    currency: "pkr",
    payment_method_types: ["card"],
    locale: "auto",
  },
  SA: {
    currency: "sar",
    payment_method_types: ["card"],
    locale: "ar",
  },
  AE: {
    currency: "aed",
    payment_method_types: ["card"],
    locale: "ar",
  },
  PH: {
    currency: "php",
    payment_method_types: ["card"],
    locale: "auto",
  },
  ID: {
    currency: "idr",
    payment_method_types: ["card"],
    locale: "auto",
  },
  MY: {
    currency: "myr",
    payment_method_types: ["card"],
    locale: "auto",
  },
  TH: {
    currency: "thb",
    payment_method_types: ["card"],
    locale: "th",
  },
  TR: {
    currency: "try",
    payment_method_types: ["card"],
    locale: "tr",
  },
  EG: {
    currency: "egp",
    payment_method_types: ["card"],
    locale: "ar",
  },
  NG: {
    currency: "ngn",
    payment_method_types: ["card"],
    locale: "auto",
  },
  US: {
    currency: "usd",
    payment_method_types: ["card"],
    locale: "en",
  },
  GB: {
    currency: "gbp",
    payment_method_types: ["card"],
    locale: "en",
  },
  DE: {
    currency: "eur",
    payment_method_types: ["card"],
    locale: "de",
  },
  JP: {
    currency: "jpy",
    payment_method_types: ["card"],
    locale: "ja",
  },
  KR: {
    currency: "krw",
    payment_method_types: ["card"],
    locale: "ko",
  },
  BR: {
    currency: "brl",
    payment_method_types: ["card"],
    locale: "pt-BR",
  },
  MX: {
    currency: "mxn",
    payment_method_types: ["card"],
    locale: "es",
  },
  NP: {
    currency: "usd",
    payment_method_types: ["card"],
    locale: "auto",
  },
  LK: {
    currency: "lkr",
    payment_method_types: ["card"],
    locale: "auto",
  },
  VN: {
    currency: "vnd",
    payment_method_types: ["card"],
    locale: "vi",
  },
};

// Default config for countries not explicitly listed
const DEFAULT_CONFIG = {
  currency: "usd",
  payment_method_types: ["card"],
  locale: "auto",
};

// Currency conversion rates (approximate, for display pricing)
// These are fetched from DB but we need fallback rates for Stripe unit_amount calculation
const CURRENCY_ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", 
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"
]);

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

    // Get request body
    const { package_id, origin_url, country_code } = await req.json();
    if (!package_id) throw new Error("Package ID is required");

    // Get user's country from profile if not provided
    let userCountry = country_code?.toUpperCase();
    if (!userCountry) {
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("country_code")
        .eq("id", user.id)
        .single();
      userCountry = profile?.country_code?.toUpperCase() || null;
    }

    console.log(`[Stripe] User country: ${userCountry || 'UNKNOWN'}, user: ${user.id}`);

    // Get country-specific config (STRICT - each country gets ONLY its own methods)
    const countryConfig = userCountry && COUNTRY_PAYMENT_CONFIG[userCountry]
      ? COUNTRY_PAYMENT_CONFIG[userCountry]
      : DEFAULT_CONFIG;

    console.log(`[Stripe] Using config for ${userCountry || 'DEFAULT'}: currency=${countryConfig.currency}, methods=${countryConfig.payment_method_types.join(',')}`);

    // Fetch package details from coin_packages
    const { data: pkg, error: pkgError } = await supabaseClient
      .from("coin_packages")
      .select("*")
      .eq("id", package_id)
      .eq("is_active", true)
      .single();

    if (pkgError || !pkg) throw new Error("Package not found or inactive");

    // Fetch currency rate from DB for accurate local pricing
    let localAmount = pkg.price_usd; // Default USD
    let currency = countryConfig.currency;

    if (currency !== "usd") {
      const { data: rateData } = await supabaseClient
        .from("currency_rates")
        .select("rate_to_usd, currency_code")
        .eq("currency_code", currency.toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      if (rateData && rateData.rate_to_usd > 0) {
        localAmount = pkg.price_usd * rateData.rate_to_usd;
        console.log(`[Stripe] Converted $${pkg.price_usd} → ${localAmount.toFixed(2)} ${currency.toUpperCase()} (rate: ${rateData.rate_to_usd})`);
      } else {
        // If no rate found, fall back to USD
        console.log(`[Stripe] No rate found for ${currency.toUpperCase()}, falling back to USD`);
        currency = "usd";
        localAmount = pkg.price_usd;
      }
    }

    // Calculate unit_amount (handle zero-decimal currencies)
    const isZeroDecimal = CURRENCY_ZERO_DECIMAL.has(currency.toLowerCase());
    const unitAmount = isZeroDecimal 
      ? Math.round(localAmount) 
      : Math.round(localAmount * 100);

    // Normalize package fields (DB uses coins_amount + bonus_coins)
    const baseCoins = Number(pkg.coins_amount ?? pkg.coins ?? 0);
    const pkgBonusCoins = Number(pkg.bonus_coins ?? 0);

    // Check first recharge bonus (extra bonus only on first purchase)
    const { data: firstRechargeData } = await supabaseClient
      .from("first_recharge_claims")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isFirstRecharge = !firstRechargeData;
    // First-recharge gets the package's bonus_coins; otherwise also include bonus_coins as standard package contents
    const bonusCoins = pkgBonusCoins;
    const totalCoins = baseCoins + bonusCoins;

    if (baseCoins <= 0) {
      throw new Error("Invalid package: coins_amount is missing or zero");
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Reuse existing Stripe customer when possible
    let customerId: string | undefined;
    if (user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    // Build checkout session config with COUNTRY-SPECIFIC payment methods
    const sessionConfig: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email!,
      payment_method_types: countryConfig.payment_method_types,
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `${baseCoins.toLocaleString()} Diamonds${bonusCoins > 0 ? ` (+${bonusCoins.toLocaleString()} Bonus!)` : ""}`,
              description: `MeriLive Diamond Package - ${totalCoins.toLocaleString()} total diamonds`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      locale: countryConfig.locale,
      metadata: {
        user_id: user.id,
        package_id: pkg.id,
        coins: baseCoins.toString(),
        bonus_coins: bonusCoins.toString(),
        total_coins: totalCoins.toString(),
        is_first_recharge: isFirstRecharge.toString(),
        country_code: userCountry || "UNKNOWN",
        currency: currency,
        amount_local: localAmount.toString(),
      },
      success_url: `${origin_url}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin_url}/recharge?payment=cancelled`,
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log(`[Stripe] Created session: ${session.id} | user: ${user.id} | country: ${userCountry} | ${currency.toUpperCase()} ${localAmount.toFixed(2)} | methods: ${countryConfig.payment_method_types.join(',')}`);

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[Stripe] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
