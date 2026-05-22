/**
 * Pkg139 — Admin LiveKit Agent Dispatch Ops tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/adminClient', () => ({
  adminSupabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import {
  listLiveKitAgentDispatches,
  getLiveKitAgentDispatch,
  deleteLiveKitAgentDispatch,
} from '@/lib/livekitAgentOps';

beforeEach(() => invokeMock.mockReset());

describe('Pkg139 livekitAgentOps', () => {
  it('listLiveKitAgentDispatches without roomName sends list action only', async () => {
    invokeMock.mockResolvedValue({ data: { dispatches: [] }, error: null });
    const result = await listLiveKitAgentDispatches();
    expect(result).toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith('livekit-agent-ops', {
      body: { action: 'list_dispatches' },
    });
  });

  it('listLiveKitAgentDispatches with roomName forwards filter', async () => {
    invokeMock.mockResolvedValue({
      data: { dispatches: [{ id: 'd1', agentName: 'voice', room: 'live_x' }] },
      error: null,
    });
    const result = await listLiveKitAgentDispatches('live_x');
    expect(result).toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledWith('livekit-agent-ops', {
      body: { action: 'list_dispatches', roomName: 'live_x' },
    });
  });

  it('getLiveKitAgentDispatch requires id + room', async () => {
    await expect(getLiveKitAgentDispatch('', 'live_x')).rejects.toThrow(
      'dispatch_id_required',
    );
    await expect(getLiveKitAgentDispatch('d1', '')).rejects.toThrow('room_name_required');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('getLiveKitAgentDispatch returns dispatch payload', async () => {
    invokeMock.mockResolvedValue({
      data: { dispatch: { id: 'd1', agentName: 'voice', room: 'live_x' } },
      error: null,
    });
    const result = await getLiveKitAgentDispatch('d1', 'live_x');
    expect(result?.id).toBe('d1');
    expect(invokeMock).toHaveBeenCalledWith('livekit-agent-ops', {
      body: { action: 'get_dispatch', dispatchId: 'd1', roomName: 'live_x' },
    });
  });

  it('deleteLiveKitAgentDispatch requires id + room', async () => {
    await expect(deleteLiveKitAgentDispatch('', 'live_x')).rejects.toThrow(
      'dispatch_id_required',
    );
    await expect(deleteLiveKitAgentDispatch('d1', '')).rejects.toThrow(
      'room_name_required',
    );
  });

  it('deleteLiveKitAgentDispatch returns true on ok', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    const ok = await deleteLiveKitAgentDispatch('d1', 'live_x');
    expect(ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-agent-ops', {
      body: { action: 'delete_dispatch', dispatchId: 'd1', roomName: 'live_x' },
    });
  });

  it('throws when edge fn returns error field in data', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'agent_ops_disabled' }, error: null });
    await expect(listLiveKitAgentDispatches()).rejects.toThrow('agent_ops_disabled');
  });

  it('throws when invoke returns transport error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('network') });
    await expect(listLiveKitAgentDispatches()).rejects.toThrow('network');
  });

  it('list returns [] when payload missing dispatches', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    const result = await listLiveKitAgentDispatches();
    expect(result).toEqual([]);
  });
});
