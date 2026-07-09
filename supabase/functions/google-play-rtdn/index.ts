// Google Play Real-Time Developer Notifications (RTDN) receiver.
// Deploy URL as Pub/Sub push endpoint in Google Cloud Console.
// Pub/Sub POSTs { message: { data: base64(json), messageId, publishTime, ... }, subscription }.
// We decode, persist to google_play_rtdn_events, and (best-effort) re-verify any purchase token
// so that credits reach the user even if the client-side verify-google-purchase call never fires.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

interface PubSubEnvelope {
  message?: {
    data?: string;
    messageId?: string;
    message_id?: string;
    publishTime?: string;
    publish_time?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
}

interface RtdnPayload {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  oneTimeProductNotification?: { version?: string; notificationType?: number; purchaseToken?: string; sku?: string };
  subscriptionNotification?: { version?: string; notificationType?: number; purchaseToken?: string; subscriptionId?: string };
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number; refundType?: number };
  testNotification?: { version?: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let envelope: PubSubEnvelope;
  try {
    envelope = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const msg = envelope.message;
  if (!msg?.data) {
    // Pub/Sub verification pings can arrive with empty data — ack them.
    return new Response(JSON.stringify({ ok: true, empty: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: RtdnPayload;
  try {
    const decoded = atob(msg.data);
    payload = JSON.parse(decoded);
  } catch (e) {
    console.error('[rtdn] failed to decode data', e);
    return new Response(JSON.stringify({ error: 'bad_payload' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const one = payload.oneTimeProductNotification;
  const sub = payload.subscriptionNotification;
  const voided = payload.voidedPurchaseNotification;
  const test = payload.testNotification;

  const notification_type = test ? 'test'
    : voided ? 'voided'
    : sub ? 'subscription'
    : one ? 'one_time_product'
    : 'unknown';

  const event_type_code = sub?.notificationType ?? one?.notificationType ?? null;
  const product_id = sub?.subscriptionId ?? one?.sku ?? null;
  const purchase_token = sub?.purchaseToken ?? one?.purchaseToken ?? voided?.purchaseToken ?? null;
  const order_id = voided?.orderId ?? null;
  const publish_time = msg.publishTime ?? msg.publish_time ?? null;
  const message_id = msg.messageId ?? msg.message_id ?? null;

  const { data: inserted, error: insertErr } = await admin
    .from('google_play_rtdn_events')
    .upsert({
      message_id,
      publish_time,
      package_name: payload.packageName ?? null,
      notification_type,
      event_type_code,
      product_id,
      purchase_token,
      order_id,
      raw_payload: payload,
    }, { onConflict: 'message_id', ignoreDuplicates: false })
    .select('id, processed')
    .maybeSingle();

  if (insertErr) {
    console.error('[rtdn] insert error', insertErr);
    // Return 200 anyway so Pub/Sub does not retry-storm on a persistent DB fault.
    return new Response(JSON.stringify({ ok: false, error: insertErr.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Best-effort: on a fresh PURCHASE (notificationType 4 for one-time), invoke verify to credit if
  // the client never called us. process_google_play_purchase is idempotent on the purchase token.
  if (one?.notificationType === 4 && purchase_token && product_id) {
    try {
      const { data: attempt } = await admin
        .from('google_play_purchase_attempts')
        .select('user_id')
        .eq('purchase_token_suffix', String(purchase_token).slice(-8))
        .maybeSingle();
      if (attempt?.user_id) {
        await admin.functions.invoke('verify-google-purchase', {
          body: {
            userId: attempt.user_id,
            productId: product_id,
            purchaseToken: purchase_token,
            orderId: order_id,
          },
        });
      }
      // If we don't have an attempt row, the client never called verify at all.
      // We can't credit without knowing the user — surface via the events table
      // for admin review (Orphan Payments dashboard picks it up).
    } catch (e) {
      console.warn('[rtdn] verify invoke failed', e);
    }
  }

  await admin
    .from('google_play_rtdn_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('id', inserted?.id);

  return new Response(JSON.stringify({ ok: true, id: inserted?.id, type: notification_type }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
