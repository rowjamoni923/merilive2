import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PACKAGE_NAME = 'com.merilive.app';

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate user. Normal app calls must use the user's JWT. Trusted
    // service-role calls (RTDN recovery) may pass userId explicitly after the
    // purchase token has already been correlated to a prior attempt row.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await req.json().catch(() => null) as {
      productId?: unknown;
      purchaseToken?: unknown;
      orderId?: unknown;
      userId?: unknown;
    } | null;

    if (!body || typeof body.productId !== 'string' || typeof body.purchaseToken !== 'string') {
      return jsonResponse({ success: false, error: 'Missing productId or purchaseToken' }, 400);
    }

    const { productId, purchaseToken } = body;
    const orderId = typeof body.orderId === 'string' ? body.orderId : undefined;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const callerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isServiceRoleCaller = callerToken === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let userId: string | null = null;

    if (isServiceRoleCaller) {
      if (body.userId != null && !isUuid(body.userId)) {
        return jsonResponse({ success: false, error: 'Trusted recovery requires a valid userId' }, 400);
      }
      userId = isUuid(body.userId) ? body.userId : null;
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('[verify-google-purchase] Auth failed:', userError?.message);
        return jsonResponse({ success: false, error: 'Invalid token' }, 401);
      }
      userId = user.id;
    }

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const purchaseTokenHash = await sha256Hex(String(purchaseToken));
    const attemptPayload: Record<string, unknown> = {
      user_id: userId,
      product_id: productId,
      requested_order_id: orderId || null,
      purchase_token_hash: purchaseTokenHash,
      purchase_token_suffix: String(purchaseToken).slice(-8),
      status: 'received',
      client_context: {
        user_agent: req.headers.get('user-agent'),
        platform: req.headers.get('x-supabase-client-platform'),
        platform_version: req.headers.get('x-supabase-client-platform-version'),
        runtime: req.headers.get('x-supabase-client-runtime'),
      },
    };

    let attemptId: string | null = null;
    if (userId) {
      const { data: attemptRow, error: attemptInsertError } = await adminSupabase
        .from('google_play_purchase_attempts')
        .upsert(attemptPayload, { onConflict: 'purchase_token_hash' })
        .select('id')
        .maybeSingle();
      if (attemptInsertError) {
        console.warn('[verify-google-purchase] Attempt log insert failed:', attemptInsertError.message);
      }
      attemptId = attemptRow?.id || null;
    }

    const markAttempt = async (fields: Record<string, unknown>) => {
      try {
        if (attemptId) {
          await adminSupabase.from('google_play_purchase_attempts').update(fields).eq('id', attemptId);
        } else {
          await adminSupabase
            .from('google_play_purchase_attempts')
            .upsert({ ...attemptPayload, ...fields }, { onConflict: 'purchase_token_hash' });
        }
      } catch (logErr) {
        console.warn('[verify-google-purchase] Attempt log update failed:', logErr);
      }
    };

    // Validate product from admin-managed coin_packages table.
    const { data: productInfo, error: productInfoError } = await adminSupabase.rpc('get_google_play_product_info', {
      _product_id: productId,
    });

    if (productInfoError || !productInfo?.coins) {
      await markAttempt({
        status: 'failed',
        error_code: 'invalid_product_id',
        error_message: productInfoError?.message || 'Invalid product ID',
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ success: false, error: 'Invalid product ID' }, 400);
    }

    await markAttempt({
      status: 'validating_with_google',
      amount_usd: productInfo.priceUsd ?? null,
      coins_amount: productInfo.coins ?? null,
      currency_code: 'USD',
    });

    console.log(`[verify-google-purchase] User: ${userId}, Product: ${productId}, Coins: ${productInfo.coins}`);

    // 🔐 Verify with Google Play Developer API
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      console.error('[verify-google-purchase] GOOGLE_SERVICE_ACCOUNT_JSON not configured');
      await markAttempt({
        status: 'failed',
        error_code: 'server_config_missing',
        error_message: 'Google service account is not configured',
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ success: false, error: 'Server configuration error' }, 500);
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(serviceAccount);

    const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${productId}/tokens/${purchaseToken}`;

    const googleResponse = await fetch(verifyUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!googleResponse.ok) {
      const errText = await googleResponse.text();
      console.error(`[verify-google-purchase] ❌ Google API error: ${googleResponse.status} - ${errText}`);
      await markAttempt({
        status: 'failed',
        error_code: 'google_api_error',
        error_message: `Google verification failed with status ${googleResponse.status}`,
        raw_google_response: { http_status: googleResponse.status, body: errText.slice(0, 2000) },
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ 
        success: false, 
        error: 'Google verification failed',
        details: `Status: ${googleResponse.status}` 
      }, 400);
    }

    const purchaseData = await googleResponse.json();
    console.log(`[verify-google-purchase] Google response:`, JSON.stringify(purchaseData));

    if (!userId && isServiceRoleCaller) {
      const googleUserId = purchaseData.obfuscatedExternalAccountId || purchaseData.obfuscatedExternalProfileId;
      if (isUuid(googleUserId)) {
        userId = googleUserId;
        attemptPayload.user_id = userId;
      } else {
        return jsonResponse({ success: false, error: 'Could not identify purchase owner from Google token' }, 400);
      }
    }

    await markAttempt({
      status: purchaseData.purchaseState === 0 ? 'google_verified' : 'google_not_purchased',
      google_order_id: purchaseData.orderId || orderId || null,
      google_purchase_state: purchaseData.purchaseState ?? null,
      raw_google_response: purchaseData,
    });

    // Check purchase state: 0 = Purchased, 1 = Canceled, 2 = Pending
    if (purchaseData.purchaseState !== 0) {
      console.error(`[verify-google-purchase] ❌ Invalid purchase state: ${purchaseData.purchaseState}`);
      await markAttempt({
        status: purchaseData.purchaseState === 2 ? 'pending' : 'failed',
        error_code: 'invalid_purchase_state',
        error_message: `Invalid purchase state: ${purchaseData.purchaseState}`,
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ 
        success: false, 
        error: `Invalid purchase state: ${purchaseData.purchaseState}` 
      }, 400);
    }

    // ✅ Purchase verified by Google. Credit and record atomically in DB.
    const { data: processData, error: processError } = await adminSupabase.rpc('process_google_play_purchase', {
      p_user_id: userId,
      p_product_id: productId,
      p_purchase_token: purchaseToken,
      p_google_order_id: purchaseData.orderId || orderId || null,
      p_google_payload: purchaseData,
    });

    if (processError || !processData?.success) {
      console.error(`[verify-google-purchase] ❌ process_google_play_purchase failed:`, processError || processData);
      await markAttempt({
        status: 'failed',
        error_code: 'credit_failed',
        error_message: processError?.message || processData?.error || 'Failed to credit purchase',
        completed_at: new Date().toISOString(),
      });
      return jsonResponse({ success: false, error: processData?.error || 'Failed to credit purchase' }, 500);
    }

    const creditedCoins = Number(processData.coins || productInfo.coins || 0);
    const newBalance = processData.newBalance;
    console.log(`[verify-google-purchase] ✅ SUCCESS! User: ${userId}, Coins: +${creditedCoins}, New balance: ${newBalance}`);

    await markAttempt({
      status: processData.alreadyProcessed ? 'already_processed' : 'completed',
      google_order_id: purchaseData.orderId || orderId || null,
      amount_usd: productInfo.priceUsd ?? null,
      coins_amount: creditedCoins,
      recharge_transaction_id: processData.transactionId || null,
      completed_at: new Date().toISOString(),
    });

    // Consume the purchase with Google only after DB credit succeeds.
    // Diamonds are consumable products, so consuming server-side makes the
    // same product immediately purchasable again while preventing paid-but-not-delivered loss.
    try {
      const consumeUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${productId}/tokens/${purchaseToken}:consume`;
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

    return jsonResponse({ 
      success: true, 
      coins: creditedCoins,
      newBalance,
      orderId: purchaseData.orderId,
      alreadyProcessed: Boolean(processData.alreadyProcessed),
    });

  } catch (error) {
    console.error('[verify-google-purchase] Unexpected error:', error);
    return jsonResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});
