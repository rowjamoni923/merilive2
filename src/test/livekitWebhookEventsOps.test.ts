/**
 * Pkg140 — Admin LiveKit Webhook Events Ops tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/adminClient', () => ({
  adminSupabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import {
  listLiveKitWebhookEvents,
  getLiveKitWebhookEvent,
  getLiveKitWebhookEventStats,
} from '@/lib/livekitWebhookEventsOps';

beforeEach(() => invokeMock.mockReset());

describe('Pkg140 livekitWebhookEventsOps', () => {
  it('listLiveKitWebhookEvents with no filters sends bare action', async () => {
    invokeMock.mockResolvedValue({ data: { events: [], nextBeforeId: null }, error: null });
    const r = await listLiveKitWebhookEvents();
    expect(r.events).toEqual([]);
    expect(r.nextBeforeId).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('livekit-webhook-events-ops', {
      body: { action: 'list_events' },
    });
  });

  it('listLiveKitWebhookEvents forwards all filters', async () => {
    invokeMock.mockResolvedValue({
      data: {
        events: [{ id: 5, event: 'room_started', roomName: 'live_x' }],
        nextBeforeId: 5,
      },
      error: null,
    });
    const r = await listLiveKitWebhookEvents({
      roomName: 'live_x',
      eventType: 'room_started',
      participantIdentity: 'u1',
      limit: 25,
      beforeId: 100,
    });
    expect(r.events).toHaveLength(1);
    expect(r.nextBeforeId).toBe(5);
    expect(invokeMock).toHaveBeenCalledWith('livekit-webhook-events-ops', {
        action: 'list_events',
      },
    });
  });

  it('list returns safe defaults when payload missing fields', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    const r = await listLiveKitWebhookEvents();
    expect(r.events).toEqual([]);
    expect(r.nextBeforeId).toBeNull();
  });

  it('getLiveKitWebhookEvent requires id', async () => {
    await expect(getLiveKitWebhookEvent(0 as unknown as number)).rejects.toThrow(
      'event_id_required',
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('getLiveKitWebhookEvent returns event payload', async () => {
    invokeMock.mockResolvedValue({
    });
    const e = await getLiveKitWebhookEvent(42);
    expect(e?.id).toBe(42);
    expect(invokeMock).toHaveBeenCalledWith('livekit-webhook-events-ops', {
    });
  });

  it('getLiveKitWebhookEvent returns null when not found', async () => {
    invokeMock.mockResolvedValue({ data: { event: null }, error: null });
    const e = await getLiveKitWebhookEvent(99);
    expect(e).toBeNull();
  });

  it('getLiveKitWebhookEventStats sends since when provided', async () => {
    invokeMock.mockResolvedValue({
    });
    const s = await getLiveKitWebhookEventStats(3_600_000);
    expect(s.total).toBe(2);
    expect(s.counts.room_started).toBe(2);
    expect(invokeMock).toHaveBeenCalledWith('livekit-webhook-events-ops', {
    });
  });

  it('getLiveKitWebhookEventStats omits since when not provided', async () => {
    invokeMock.mockResolvedValue({
    });
    await getLiveKitWebhookEventStats();
    expect(invokeMock).toHaveBeenCalledWith('livekit-webhook-events-ops', {
    });
  });

  it('throws when edge fn returns error field in data', async () => {
    invokeMock.mockResolvedValue({
    });
    await expect(listLiveKitWebhookEvents()).rejects.toThrow(
      'webhook_events_ops_disabled',
    );
  });

  it('throws when invoke returns transport error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('network') });
    await expect(listLiveKitWebhookEvents()).rejects.toThrow('network');
  });
});
