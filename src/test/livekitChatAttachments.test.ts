import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerStreamRoom, unregisterStreamRoom } from '@/lib/livekitStreams';
import {
  CHAT_TOPIC,
  installChatAttachmentHandlers,
  sendChatText,
  sendChatImage,
  sendChatVoice,
  sendChatFile,
} from '@/lib/livekitChatAttachments';

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
      sendText: vi.fn(async (_t: string, opts: any) => ({ id: `txt-${opts.topic}` })),
      sendFile: vi.fn(async (_f: any, opts: any) => ({ id: `file-${opts.topic}` })),
    },
  };
}

async function fireText(room: any, topic: string, text: string, identity = 'peer-1') {
  const handler = room.textHandlers.get(topic);
  const reader = {
    info: { id: 'tx-1', topic, mimeType: 'text/plain', size: text.length },
    readAll: async () => text,
  };
  await handler(reader, { identity });
}

async function fireBytes(
  room: any,
  topic: string,
  bytes: Uint8Array,
  meta: Partial<{ name: string; mimeType: string }> = {},
  identity = 'peer-1',
) {
  const handler = room.byteHandlers.get(topic);
  const reader = {
    info: { id: 'bx-1', topic, size: bytes.byteLength, ...meta },
    readAll: async () => bytes,
  };
  await handler(reader, { identity });
}

describe('Pkg142 chat-attachment topic handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('installs only the requested handlers and binds canonical topics', () => {
    const room: any = makeRoom();
    registerStreamRoom('call', 'c1', room);
    const dispose = installChatAttachmentHandlers('call', 'c1', {
      onText: () => {},
      onImage: () => {},
    });
    expect(room.textHandlers.has(CHAT_TOPIC.text)).toBe(true);
    expect(room.byteHandlers.has(CHAT_TOPIC.image)).toBe(true);
    expect(room.byteHandlers.has(CHAT_TOPIC.voice)).toBe(false);
    expect(room.byteHandlers.has(CHAT_TOPIC.file)).toBe(false);
    dispose();
    expect(room.textHandlers.has(CHAT_TOPIC.text)).toBe(false);
    expect(room.byteHandlers.has(CHAT_TOPIC.image)).toBe(false);
    unregisterStreamRoom('call', 'c1');
  });

  it('routes incoming text to onText with normalized payload', async () => {
    const room: any = makeRoom();
    registerStreamRoom('live', 's1', room);
    const got: any[] = [];
    installChatAttachmentHandlers('live', 's1', { onText: (m) => void got.push(m) });
    await fireText(room, CHAT_TOPIC.text, 'hello world', 'user-42');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      kind: 'text',
      scope: 'live',
      scopeId: 's1',
      senderIdentity: 'user-42',
      topic: CHAT_TOPIC.text,
      text: 'hello world',
    });
    unregisterStreamRoom('live', 's1');
  });

  it('routes incoming bytes to the matching kind handler', async () => {
    const room: any = makeRoom();
    registerStreamRoom('party', 'p1', room);
    const imgs: any[] = [];
    const voices: any[] = [];
    const files: any[] = [];
    installChatAttachmentHandlers('party', 'p1', {
      onImage: (m) => void imgs.push(m),
      onVoice: (m) => void voices.push(m),
      onFile: (m) => void files.push(m),
    });
    await fireBytes(room, CHAT_TOPIC.image, new Uint8Array([1, 2, 3]), { mimeType: 'image/png' });
    await fireBytes(room, CHAT_TOPIC.voice, new Uint8Array([4, 5]), { mimeType: 'audio/webm' });
    await fireBytes(room, CHAT_TOPIC.file, new Uint8Array([6]), { name: 'doc.pdf' });
    expect(imgs[0]).toMatchObject({ kind: 'image', mimeType: 'image/png' });
    expect(imgs[0].bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(voices[0]).toMatchObject({ kind: 'voice', mimeType: 'audio/webm' });
    expect(files[0]).toMatchObject({ kind: 'file', name: 'doc.pdf' });
    unregisterStreamRoom('party', 'p1');
  });

  it('dispose unbinds every installed handler', async () => {
    const room: any = makeRoom();
    registerStreamRoom('call', 'c2', room);
    const dispose = installChatAttachmentHandlers('call', 'c2', {
      onText: () => {},
      onImage: () => {},
      onVoice: () => {},
      onFile: () => {},
    });
    expect(room.textHandlers.size + room.byteHandlers.size).toBe(4);
    dispose();
    expect(room.textHandlers.size + room.byteHandlers.size).toBe(0);
    unregisterStreamRoom('call', 'c2');
  });

  it('typed senders forward to Pkg121 with canonical topics', async () => {
    const room: any = makeRoom();
    registerStreamRoom('call', 'c3', room);
    await sendChatText('call', 'c3', 'hi', { attributes: { foo: 'bar' } });
    expect(room.localParticipant.sendText).toHaveBeenCalledWith(
      'hi',
      expect.objectContaining({ topic: CHAT_TOPIC.text, attributes: { foo: 'bar' } }),
    );

    const blob = new Blob([new Uint8Array([1])]);
    await sendChatImage('call', 'c3', blob);
    await sendChatVoice('call', 'c3', blob);
    await sendChatFile('call', 'c3', blob, { name: 'a.txt' });
    const calls = room.localParticipant.sendFile.mock.calls.map((c: any) => c[1].topic);
    expect(calls).toEqual([CHAT_TOPIC.image, CHAT_TOPIC.voice, CHAT_TOPIC.file]);
    unregisterStreamRoom('call', 'c3');
  });

  it('throws if room is not registered for senders', async () => {
    await expect(sendChatText('call', 'missing', 'x')).rejects.toThrow('room_not_registered');
  });

  it('no-ops dispose when room is missing at install time', () => {
    const dispose = installChatAttachmentHandlers('call', 'never', { onText: () => {} });
    expect(() => dispose()).not.toThrow();
  });
});
