import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerStreamRoom,
  unregisterStreamRoom,
  registerTextStreamHandler,
  registerByteStreamHandler,
  sendText,
  sendFile,
  _isStreamRoomRegistered,
} from '@/lib/livekitStreams';

vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: vi.fn(async () => true),
}));

function makeRoom() {
  const textHandlers = new Map<string, any>();
  const byteHandlers = new Map<string, any>();
  return {
    textHandlers,
    byteHandlers,
    registerTextStreamHandler: vi.fn((t: string, h: any) => textHandlers.set(t, h)),
    unregisterTextStreamHandler: vi.fn((t: string) => textHandlers.delete(t)),
    registerByteStreamHandler: vi.fn((t: string, h: any) => byteHandlers.set(t, h)),
    unregisterByteStreamHandler: vi.fn((t: string) => byteHandlers.delete(t)),
    localParticipant: {
      sendText: vi.fn(async (_text: string, opts: any) => ({ id: `txt-${opts.topic}` })),
      sendFile: vi.fn(async (_f: any, opts: any) => ({ id: `file-${opts.topic}` })),
    },
  };
}

describe('Pkg121 LiveKit text/byte streams', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers and unregisters a Room', () => {
    const room: any = makeRoom();
    registerStreamRoom('call', 'c1', room);
    expect(_isStreamRoomRegistered('call', 'c1')).toBe(true);
    unregisterStreamRoom('call', 'c1');
    expect(_isStreamRoomRegistered('call', 'c1')).toBe(false);
  });

  it('replacing the Room unregisters previous handlers', () => {
    const a: any = makeRoom();
    const b: any = makeRoom();
    registerStreamRoom('live', 's1', a);
    registerTextStreamHandler('live', 's1', 'lk.chat', () => {});
    registerByteStreamHandler('live', 's1', 'lk.file', () => {});
    expect(a.textHandlers.has('lk.chat')).toBe(true);
    expect(a.byteHandlers.has('lk.file')).toBe(true);
    registerStreamRoom('live', 's1', b);
    expect(a.unregisterTextStreamHandler).toHaveBeenCalledWith('lk.chat');
    expect(a.unregisterByteStreamHandler).toHaveBeenCalledWith('lk.file');
  });

  it('text handler dispose unregisters topic', () => {
    const room: any = makeRoom();
    registerStreamRoom('party', 'p1', room);
    const dispose = registerTextStreamHandler('party', 'p1', 'lk.chat', () => {});
    expect(room.registerTextStreamHandler).toHaveBeenCalledWith('lk.chat', expect.any(Function));
    dispose();
    expect(room.unregisterTextStreamHandler).toHaveBeenCalledWith('lk.chat');
  });

  it('text handler drains reader and forwards info+text', async () => {
    const room: any = makeRoom();
    registerStreamRoom('call', 'c2', room);
    const userFn = vi.fn();
    registerTextStreamHandler('call', 'c2', 'lk.chat', userFn);
    const wrapped = room.textHandlers.get('lk.chat');
    const reader = {
      info: { id: 'sid-1', topic: 'lk.chat', size: 5, mimeType: 'text/plain' },
      readAll: async () => 'hello',
    };
    await wrapped(reader, { identity: 'alice' });
    expect(userFn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'hello',
      }),
    );
  });

  it('text handler no-ops when kill-switch disabled', async () => {
    const sig = await import('@/lib/livekitSignaling');
    (sig.isLiveKitEnabled as any).mockResolvedValueOnce(false);
    const room: any = makeRoom();
    registerStreamRoom('call', 'c3', room);
    const userFn = vi.fn();
    registerTextStreamHandler('call', 'c3', 'lk.chat', userFn);
    await room.textHandlers.get('lk.chat')({ readAll: async () => 'x' }, { identity: 'u' });
    expect(userFn).not.toHaveBeenCalled();
  });

  it('byte handler concatenates async-iterable chunks', async () => {
    const room: any = makeRoom();
    registerStreamRoom('live', 's2', room);
    const userFn = vi.fn();
    registerByteStreamHandler('live', 's2', 'lk.file', userFn);
    const wrapped = room.byteHandlers.get('lk.file');
    const reader = {
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array([1, 2, 3]);
        yield new Uint8Array([4, 5, 6]);
      },
    };
    await wrapped(reader, { identity: 'bob' });
    expect(userFn).toHaveBeenCalledTimes(1);
    const ctx = userFn.mock.calls[0][0];
    expect(Array.from(ctx.bytes)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ctx.info.senderIdentity).toBe('bob');
    expect(ctx.info.name).toBe('a.png');
  });

  it('sendText forwards to localParticipant.sendText', async () => {
    const room: any = makeRoom();
    registerStreamRoom('call', 'c4', room);
    const out = await sendText('call', 'c4', 'hi there', {
      topic: 'lk.chat',
      destinationIdentities: ['host1'],
      attributes: { kind: 'whisper' },
    });
    expect(out).toEqual({ id: 'txt-lk.chat' });
    expect(room.localParticipant.sendText).toHaveBeenCalledWith('hi there', {
    });
  });

  it('sendText throws when scope/id has no Room', async () => {
    await expect(
      sendText('party', 'nope', 'x', { topic: 'lk.chat' }),
    ).rejects.toThrow('room_not_registered');
  });

  it('sendText throws when kill-switch disabled', async () => {
    const sig = await import('@/lib/livekitSignaling');
    (sig.isLiveKitEnabled as any).mockResolvedValueOnce(false);
    const room: any = makeRoom();
    registerStreamRoom('call', 'c5', room);
    await expect(sendText('call', 'c5', 'x', { topic: 'lk.chat' })).rejects.toThrow(
      'streams_disabled',
    );
  });

  it('sendFile forwards options including onProgress', async () => {
    const room: any = makeRoom();
    registerStreamRoom('party', 'p2', room);
    const onProgress = vi.fn();
    const file = new Blob(['abc'], { type: 'text/plain' });
    const out = await sendFile('party', 'p2', file, {
      name: 'note.txt',
      mimeType: 'text/plain',
      onProgress,
    });
    expect(out).toEqual({ id: 'file-lk.file' });
    expect(room.localParticipant.sendFile).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        onProgress,
      }),
    );
  });

  it('registerTextStreamHandler no-ops when Room not registered', () => {
    const dispose = registerTextStreamHandler('call', 'never', 'lk.chat', () => {});
    expect(typeof dispose).toBe('function');
    dispose();
  });
});
