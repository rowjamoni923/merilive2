// V4 — LiveKit Webhook Receiver (VPS-side)
// Receives webhooks directly from LiveKit SFU on same VPS (localhost, <5ms latency)
// Validates signature, logs to Supabase, optionally triggers downstream actions
//
// Endpoint: POST /livekit/webhook
// Health:   GET  /healthz
// Metrics:  GET  /metrics  (Prometheus text format — wires into V5)

import express from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });

const {
  PORT = '8088',
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  log.fatal('Missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  log.fatal('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Prometheus counters
const counters = {
  received: 0,
  processed: 0,
  failed: 0,
  by_event: {},
};

const app = express();
// LiveKit signs the raw body — keep it raw
app.use('/livekit/webhook', express.raw({ type: 'application/webhook+json' }));

app.get('/healthz', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get('/metrics', (_req, res) => {
  const lines = [
    '# HELP webhook_received_total Webhooks received',
    '# TYPE webhook_received_total counter',
    `webhook_received_total ${counters.received}`,
    '# HELP webhook_processed_total Webhooks processed successfully',
    '# TYPE webhook_processed_total counter',
    `webhook_processed_total ${counters.processed}`,
    '# HELP webhook_failed_total Webhooks that failed processing',
    '# TYPE webhook_failed_total counter',
    `webhook_failed_total ${counters.failed}`,
    '# HELP webhook_event_total Webhooks by event type',
    '# TYPE webhook_event_total counter',
    ...Object.entries(counters.by_event).map(([k, v]) => `webhook_event_total{event="${k}"} ${v}`),
  ];
  res.type('text/plain').send(lines.join('\n') + '\n');
});

app.post('/livekit/webhook', async (req, res) => {
  counters.received++;
  const t0 = Date.now();
  try {
    const auth = req.get('Authorization') || '';
    const event = await receiver.receive(req.body.toString('utf8'), auth);
    counters.by_event[event.event] = (counters.by_event[event.event] || 0) + 1;

    // Persist to Supabase (same table edge fn `livekit-webhook` already uses)
    const { error } = await supabase.from('livekit_room_events').insert({
      event_type: event.event,
      room_name: event.room?.name || null,
      participant_identity: event.participant?.identity || null,
      payload: event,
      received_at: new Date().toISOString(),
    });
    if (error) throw error;

    counters.processed++;
    log.info({ event: event.event, room: event.room?.name, ms: Date.now() - t0 }, 'webhook processed');
    res.status(200).json({ ok: true });
  } catch (err) {
    counters.failed++;
    log.error({ err: err.message, ms: Date.now() - t0 }, 'webhook failed');
    res.status(401).json({ error: err.message });
  }
});

app.listen(Number(PORT), '0.0.0.0', () => {
  log.info({ port: PORT }, 'V4 webhook receiver listening');
});
