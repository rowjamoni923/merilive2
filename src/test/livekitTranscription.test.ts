import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('livekit-client', () => ({
  RoomEvent: { TranscriptionReceived: 'transcriptionReceived' },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

import {
  registerRoomForTranscription,
  unregisterRoomForTranscription,
  isRoomRegisteredForTranscription,
  persistTranscriptionSegment,
  __resetTranscriptionRegistryForTests,
  type TranscriptionEvent,
} from '@/lib/livekitTranscription';

function makeFakeRoom(name = 'live_abc') {
  const handlers = new Map<string, Function>();
  return {
    name,
    on(evt: string, h: Function) {
      handlers.set(evt, h);
    },
    off(evt: string, h: Function) {
      if (handlers.get(evt) === h) handlers.delete(evt);
    },
    _emit(evt: string, ...args: any[]) {
      handlers.get(evt)?.(...args);
    },
    _has(evt: string) {
      return handlers.has(evt);
    },
  } as any;
}

describe('Pkg116 livekitTranscription', () => {
  beforeEach(() => __resetTranscriptionRegistryForTests());

  it('registers and dispatches livekit-transcription window event', () => {
    const room = makeFakeRoom('live_xyz');
    registerRoomForTranscription('live', 'xyz', room);

    const received: TranscriptionEvent[] = [];
    const listener = (e: Event) => received.push((e as CustomEvent).detail);
    window.addEventListener('livekit-transcription', listener);

    room._emit('transcriptionReceived', [
      { id: 's1', text: 'hello world', final: true, language: 'en' },
    ], { identity: 'user_42' });

    window.removeEventListener('livekit-transcription', listener);

    expect(received).toHaveLength(1);
    expect(received[0].scope).toBe('live');
    expect(received[0].id).toBe('xyz');
    expect(received[0].roomName).toBe('live_xyz');
    expect(received[0].identity).toBe('user_42');
    expect(received[0].segments[0]).toMatchObject({
      id: 's1',
      text: 'hello world',
      final: true,
      language: 'en',
    });
  });

  it('treats undefined final as true (SDK version safety)', () => {
    const room = makeFakeRoom();
    registerRoomForTranscription('call', 'c1', room);
    let captured: TranscriptionEvent | null = null;
    const l = (e: Event) => (captured = (e as CustomEvent).detail);
    window.addEventListener('livekit-transcription', l);
    room._emit('transcriptionReceived', [{ id: 's', text: 'hi' }]);
    window.removeEventListener('livekit-transcription', l);
    expect(captured!.segments[0].final).toBe(true);
  });

  it('skips empty segment arrays', () => {
    const room = makeFakeRoom();
    registerRoomForTranscription('party', 'p1', room);
    let count = 0;
    const l = () => count++;
    window.addEventListener('livekit-transcription', l);
    room._emit('transcriptionReceived', []);
    window.removeEventListener('livekit-transcription', l);
    expect(count).toBe(0);
  });

  it('replaces registration when same key registered with different room', () => {
    const room1 = makeFakeRoom('r1');
    const room2 = makeFakeRoom('r2');
    registerRoomForTranscription('call', 'k', room1);
    registerRoomForTranscription('call', 'k', room2);
    expect(room1._has('transcriptionReceived')).toBe(false);
    expect(room2._has('transcriptionReceived')).toBe(true);
  });

  it('unregister removes the handler', () => {
    const room = makeFakeRoom();
    registerRoomForTranscription('live', 'u', room);
    expect(isRoomRegisteredForTranscription('live', 'u')).toBe(true);
    unregisterRoomForTranscription('live', 'u');
    expect(isRoomRegisteredForTranscription('live', 'u')).toBe(false);
    expect(room._has('transcriptionReceived')).toBe(false);
  });

  it('persistTranscriptionSegment skips non-final and empty', async () => {
    expect(await persistTranscriptionSegment({
      scope: 'live', scopeId: 'x', roomName: 'r', text: 'partial', isFinal: false,
    })).toEqual({ ok: false, error: 'non_final_segment' });

    expect(await persistTranscriptionSegment({
    })).toEqual({ ok: false, error: 'empty_text' });
  });

  it('persistTranscriptionSegment writes final segment', async () => {
    const res = await persistTranscriptionSegment({
      participantIdentity: 'u1', segmentId: 'seg1',
    });
    expect(res).toEqual({ ok: true });
  });
});
