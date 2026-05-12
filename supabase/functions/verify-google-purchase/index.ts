import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Google Play product mapping
const PLAY_STORE_PRODUCTS: Record<string, { coins: number; priceUsd: number }> = {
  'diamonds_7000_v2': { coins: 7000, priceUsd: 1.99 },
  'diamonds_13200_v2': { coins: 13200, priceUsd: 3.99 },
  'diamonds_56000_v2': { coins: 56000, priceUsd: 14.99 },
  'diamonds_169000_v2': { coins: 169000, priceUsd: 23.99 },
  'diamonds_470000_v2': { coins: 470000, priceUsd: 59.99 },
  'diamonds_650000_v2': { coins: 650000, priceUsd: 129.99 },
};

/**
 * Get Google OAuth2 access token using Service Account
 */
async function getAccessToken(serviceAccount: any): Promise<string> {
  // Create JWT header and claim set
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: serviceAccount.token_uri,
    exp: now + 3600,
    iat: now,
  };

  // Base64url encode
  const encode = (obj: any) => {
    const str = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const headerB64 = encode(header);
  const claimB64 = encode(claimSet);
  const signInput = `${headerB64}.${claimB64}`;

  // Import private key and sign
  const pemContent = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${signInput}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${tokenResponse.status} - ${err}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[verify-google-purchase] Auth failed:', userError?.message);
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = user.id;

    // Parse request
    const { productId, purchaseToken, orderId } = await req.json();
    if (!productId || !purchaseToken) {
      return new Response(JSON.stringify({ success: false, error: 'Missing productId or purchaseToken' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate product
    const productInfo = PLAY_STORE_PRODUCTS[productId];
    if (!productInfo) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid product ID' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[verify-google-purchase] User: ${userId}, Product: ${productId}, Coins: ${productInfo.coins}`);

    // 🛡️ ANTI-FRAUD: Check duplicate order
    const orderIdForCheck = (orderId || purchaseToken).substring(0, 40);
    const { data: existingOrder } = await supabase
      .from('recharge_transactions')
      .select('id')
      .eq('google_order_id', orderIdForCheck)
      .limit(1);

    if (existingOrder && existingOrder.length > 0) {
      console.error(`[verify-google-purchase] ❌ DUPLICATE ORDER: ${orderIdForCheck}`);
      return new Response(JSON.stringify({ success: false, error: 'Purchase already processed' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 🔐 Verify with Google Play Developer API
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      console.error('[verify-google-purchase] GOOGLE_SERVICE_ACCOUNT_JSON not configured');
      return new Response(JSON.stringify({ success: false, error: 'Server configuration error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(serviceAccount);

    const packageName = 'com.merilive.app';
    const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;

    const googleResponse = await fetch(verifyUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!googleResponse.ok) {
      const errText = await googleResponse.text();
      console.error(`[verify-google-purchase] ❌ Google API error: ${googleResponse.status} - ${errText}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Google verification failed',
        details: `Status: ${googleResponse.status}` 
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const purchaseData = await googleResponse.json();
    console.log(`[verify-google-purchase] Google response:`, JSON.stringify(purchaseData));

    // Check purchase state: 0 = Purchased, 1 = Canceled, 2 = Pending
    if (purchaseData.purchaseState !== 0) {
      console.error(`[verify-google-purchase] ❌ Invalid purchase state: ${purchaseData.purchaseState}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Invalid purchase state: ${purchaseData.purchaseState}` 
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ✅ Purchase verified by Google! Now credit coins.

    // Use admin client for DB operations
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Record in recharge_transactions
    const { error: rechargeError } = await adminSupabase.from('recharge_transactions').insert({
      user_id: userId,
      coins_received: productInfo.coins,
      amount: productInfo.priceUsd,
      payment_method: 'google_play',
      purchase_source: 'google_play',
      google_product_id: productId,
      google_order_id: orderIdForCheck,
      status: 'completed',
      completed_at: new Date().toISOString(),
      currency_code: 'USD',
      notes: `✅ Server-verified via Google Play Developer API. OrderId: ${purchaseData.orderId || 'N/A'}`,
    });

    if (rechargeError) {
      console.error(`[verify-google-purchase] ❌ recharge insert failed:`, rechargeError);
      return new Response(JSON.stringify({ success: false, error: 'Failed to record purchase (possible duplicate)' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Record in coin_transfers
    await adminSupabase.from('coin_transfers').insert({
      sender_id: userId,
      receiver_id: userId,
      sender_type: 'google_play',
      amount: productInfo.coins,
      status: 'completed',
      note: `✅ Verified Play Store Purchase: ${productId}`,
    });

    // Credit coins atomically
    const { data: addData, error: addError } = await adminSupabase.rpc('add_coins', {
      p_user_id: userId,
      p_amount: productInfo.coins,
    });

    if (addError) {
      console.error(`[verify-google-purchase] ❌ add_coins failed:`, addError);
      return new Response(JSON.stringify({ success: false, error: 'Failed to credit coins' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newBalance = (addData as any)?.new_balance;
    console.log(`[verify-google-purchase] ✅ SUCCESS! User: ${userId}, Coins: +${productInfo.coins}, New balance: ${newBalance}`);

    // Consume the purchase with Google only after DB credit succeeds.
    // Diamonds are consumable products, so consuming server-side makes the
    // same product immediately purchasable again while preventing paid-but-not-delivered loss.
    try {
      const consumeUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}:consume`;
      await fetch(consumeUrl, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      console.log(`[verify-google-purchase] ✅ Purchase consumed with Google`);
    } catch (ackErr) {
      console.warn(`[verify-google-purchase] ⚠️ Consume failed (non-critical):`, ackErr);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      coins: productInfo.coins,
      newBalance,
      orderId: purchaseData.orderId,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[verify-google-purchase] Unexpected error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
