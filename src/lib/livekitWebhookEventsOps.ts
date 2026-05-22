/**
 * Pkg140 — Admin LiveKit Webhook Events Ops client
 *
 * Read-only inspector for the `livekit_room_events` audit stream populated by
 * the `livekit-webhook` function (Pkg97). Caps off the Pkg135-139 admin
 * observability suite.
 *
 * Admin-only via `adminSupabase` (auto-sends `x-admin-access-token`).
 * Requires kill-switch
 *   `app_settings.livekit_signaling_enabled.webhook_events_ops === true`.
 *
 * Zero new Supabase channels, zero polls, zero cross-user reads.
 */
import { adminSupabase } from '@/integrations/supabase/adminClient';

export interface LiveKitWebhookEventSummary {
  id: number | null;
  event: string | null;
  roomName: string | null;
  roomSid: string | null;
  participantIdentity: string | null;
  participantSid: string | null;
  trackSid: string | null;
  payload: unknown;
  createdAt: string | null;
}

export interface ListLiveKitWebhookEventsOptions {
  roomName?: string;
  eventType?: string;
  participantIdentity?: string;
  limit?: number;
  beforeId?: number | null;
}

async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await adminSupabase.functions.invoke(
    'livekit-webhook-events-ops',
    { body: { action, ...body } },
  );
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in (data as any)) {
    throw new Error(String((data as any).error));
  }
  return data as T;
}

export async function listLiveKitWebhookEvents(
  opts: ListLiveKitWebhookEventsOptions = {},
): Promise<{ events: LiveKitWebhookEventSummary[]; nextBeforeId: number | null }> {
  const body: Record<string, unknown> = {};
  if (opts.roomName) body.roomName = opts.roomName;
  if (opts.eventType) body.eventType = opts.eventType;
  if (opts.participantIdentity) body.participantIdentity = opts.participantIdentity;
  if (opts.limit) body.limit = opts.limit;
  if (opts.beforeId != null) body.beforeId = opts.beforeId;
  const res = await invoke<{
    events: LiveKitWebhookEventSummary[];
    nextBeforeId: number | null;
  }>('list_events', body);
  return { events: res.events ?? [], nextBeforeId: res.nextBeforeId ?? null };
}

export async function getLiveKitWebhookEvent(
  eventId: number,
): Promise<LiveKitWebhookEventSummary | null> {
  if (!eventId) throw new Error('event_id_required');
  const { event } = await invoke<{ event: LiveKitWebhookEventSummary | null }>(
    'get_event',
    { eventId },
  );
  return event ?? null;
}

export async function getLiveKitWebhookEventStats(
  sinceMs?: number,
): Promise<{ windowMs: number; counts: Record<string, number>; total: number }> {
  const body: Record<string, unknown> = {};
  if (sinceMs) body.since = sinceMs;
  return invoke<{ windowMs: number; counts: Record<string, number>; total: number }>(
    'stats',
    body,
  );
}
