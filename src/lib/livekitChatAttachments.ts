/**
 * Pkg142: Standard chat-attachment topics on Pkg121 Text/Byte Streams
 *
 * Closes Pkg121's "concrete topic handlers deferred" gap.
 *
 * Canonical topics shared across call / live / party scopes:
 *   - lk.chat.text   → chunked long-form chat text (>1KB), drained to a single string
 *   - lk.chat.image  → image attachment (Blob / Uint8Array)
 *   - lk.chat.voice  → voice note (audio Blob)
 *   - lk.chat.file   → generic file attachment
 *
 * Wire-format on the receive side is normalized to:
 *   {
 *     id, scope, scopeId, senderIdentity, topic,
 *     mimeType, name, size, attributes, timestamp,
 *     text?  (lk.chat.text)
 *     bytes? (lk.chat.image / voice / file)
 *   }
 *
 * RULES (per $1400 / LiveKit-Purist policy):
 *   - NO Supabase Realtime channels, NO polls, NO cross-user DB reads.
 *   - Money / audit / chat-history persistence is the caller's responsibility
 *     (Supabase RPC first → publish second). This module is *transport* only.
 *   - Kill-switch: piggy-backs on Pkg121 `streams` flag (default ON).
 */
import { useEffect, useRef } from 'react';
import {
  registerTextStreamHandler,
  registerByteStreamHandler,
  sendText,
  sendFile,
  streamText,
  streamBytes,
  type StreamScope,
  type TextStreamHandlerContext,
  type ByteStreamHandlerContext,
} from './livekitStreams';

export const CHAT_TOPIC = {
  text: 'lk.chat.text',
  image: 'lk.chat.image',
  voice: 'lk.chat.voice',
  file: 'lk.chat.file',
} as const;

export type ChatAttachmentTopic =
  | typeof CHAT_TOPIC.text
  | typeof CHAT_TOPIC.image
  | typeof CHAT_TOPIC.voice
  | typeof CHAT_TOPIC.file;

export interface IncomingChatText {
  kind: 'text';
  id: string;
  scope: StreamScope;
  scopeId: string;
  senderIdentity: string;
  topic: typeof CHAT_TOPIC.text;
  text: string;
  mimeType?: string;
  size?: number;
  attributes?: Record<string, string>;
  timestamp?: number;
}

export interface IncomingChatBytes {
  kind: 'image' | 'voice' | 'file';
  id: string;
  scope: StreamScope;
  scopeId: string;
  senderIdentity: string;
  topic: typeof CHAT_TOPIC.image | typeof CHAT_TOPIC.voice | typeof CHAT_TOPIC.file;
  bytes: Uint8Array;
  mimeType?: string;
  name?: string;
  size?: number;
  attributes?: Record<string, string>;
  timestamp?: number;
}

export type IncomingChatAttachment = IncomingChatText | IncomingChatBytes;

export interface ChatAttachmentHandlers {
  onText?: (msg: IncomingChatText) => void | Promise<void>;
  onImage?: (msg: IncomingChatBytes) => void | Promise<void>;
  onVoice?: (msg: IncomingChatBytes) => void | Promise<void>;
  onFile?: (msg: IncomingChatBytes) => void | Promise<void>;
}

/**
 * Register all chat-attachment topic handlers for a scope/id.
 * Returns a single dispose function that unregisters every handler installed.
 *
 * Safe to call when Room not yet registered with Pkg121 — the underlying
 * registerTextStreamHandler / registerByteStreamHandler no-op with a warning,
 * and the returned dispose is still safe.
 */
export function installChatAttachmentHandlers(
  scope: StreamScope,
  id: string,
  handlers: ChatAttachmentHandlers,
): () => void {
  const disposes: Array<() => void> = [];

  if (handlers.onText) {
    disposes.push(
      registerTextStreamHandler(scope, id, CHAT_TOPIC.text, (ctx: TextStreamHandlerContext) => {
        return handlers.onText!({
          kind: 'text',
          id: ctx.info.id,
          scope,
          scopeId: id,
          senderIdentity: ctx.info.senderIdentity,
          topic: CHAT_TOPIC.text,
          text: ctx.text,
          mimeType: ctx.info.mimeType,
          size: ctx.info.size,
          attributes: ctx.info.attributes,
          timestamp: ctx.info.timestamp,
        });
      }),
    );
  }

  const bindBytes = (
    topic: typeof CHAT_TOPIC.image | typeof CHAT_TOPIC.voice | typeof CHAT_TOPIC.file,
    kind: 'image' | 'voice' | 'file',
    cb?: (msg: IncomingChatBytes) => void | Promise<void>,
  ) => {
    if (!cb) return;
    disposes.push(
      registerByteStreamHandler(scope, id, topic, (ctx: ByteStreamHandlerContext) => {
        return cb({
          kind,
          id: ctx.info.id,
          scope,
          scopeId: id,
          senderIdentity: ctx.info.senderIdentity,
          topic,
          bytes: ctx.bytes,
          mimeType: ctx.info.mimeType,
          name: ctx.info.name,
          size: ctx.info.size,
          attributes: ctx.info.attributes,
          timestamp: ctx.info.timestamp,
        });
      }),
    );
  };

  bindBytes(CHAT_TOPIC.image, 'image', handlers.onImage);
  bindBytes(CHAT_TOPIC.voice, 'voice', handlers.onVoice);
  bindBytes(CHAT_TOPIC.file, 'file', handlers.onFile);

  return () => {
    for (const d of disposes) {
      try {
        d();
      } catch {
        /* ignore */
      }
    }
  };
}

/**
 * React hook variant — auto-installs handlers on mount, disposes on unmount
 * or when scope/id changes. Handlers are read via ref so callers don't need
 * to memoize.
 */
export function useChatAttachmentHandlers(
  scope: StreamScope | null | undefined,
  id: string | null | undefined,
  handlers: ChatAttachmentHandlers,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!scope || !id) return;
    const dispose = installChatAttachmentHandlers(scope, id, {
      onText: (m) => handlersRef.current.onText?.(m),
      onImage: (m) => handlersRef.current.onImage?.(m),
      onVoice: (m) => handlersRef.current.onVoice?.(m),
      onFile: (m) => handlersRef.current.onFile?.(m),
    });
    return dispose;
  }, [scope, id]);
}

// ─── Typed senders ─────────────────────────────────────────────────────────

export interface SendChatTextOptions {
  destinationIdentities?: string[];
  attributes?: Record<string, string>;
}

/** Send a chunked long-form chat text message (no DataPacket size cap). */
export function sendChatText(
  scope: StreamScope,
  id: string,
  text: string,
  opts: SendChatTextOptions = {},
) {
  return sendText(scope, id, text, {
    topic: CHAT_TOPIC.text,
    destinationIdentities: opts.destinationIdentities,
    attributes: opts.attributes,
  });
}

export interface SendChatFileOptions {
  destinationIdentities?: string[];
  name?: string;
  mimeType?: string;
  attributes?: Record<string, string>;
  onProgress?: (progress: number) => void;
}

const sendBytes = (
  topic: ChatAttachmentTopic,
  scope: StreamScope,
  id: string,
  file: File | Blob,
  opts: SendChatFileOptions,
) =>
  sendFile(scope, id, file, {
    topic,
    destinationIdentities: opts.destinationIdentities,
    name: opts.name,
    mimeType: opts.mimeType,
    attributes: opts.attributes,
    onProgress: opts.onProgress,
  });

export const sendChatImage = (
  scope: StreamScope,
  id: string,
  file: File | Blob,
  opts: SendChatFileOptions = {},
) => sendBytes(CHAT_TOPIC.image, scope, id, file, opts);

export const sendChatVoice = (
  scope: StreamScope,
  id: string,
  file: File | Blob,
  opts: SendChatFileOptions = {},
) => sendBytes(CHAT_TOPIC.voice, scope, id, file, opts);

export const sendChatFile = (
  scope: StreamScope,
  id: string,
  file: File | Blob,
  opts: SendChatFileOptions = {},
) => sendBytes(CHAT_TOPIC.file, scope, id, file, opts);

// ─── Pkg191 — Incremental streaming senders (Item #3) ─────────────────────
//
// Use when the payload is generated incrementally (LLM token-by-token reply,
// live caption stream, large file chunked upload with backpressure). Receivers
// register the same handler as the buffered variant; the handler fires once
// after the stream closes with the fully-drained payload.

export interface OpenChatTextStreamOptions {
  destinationIdentities?: string[];
  attributes?: Record<string, string>;
  totalSize?: number;
}

/** Open a long-running text stream — e.g. AI reply token-by-token. */
export function openChatTextStream(
  scope: StreamScope,
  id: string,
  opts: OpenChatTextStreamOptions = {},
) {
  return streamText(scope, id, {
    topic: CHAT_TOPIC.text,
    destinationIdentities: opts.destinationIdentities,
    attributes: opts.attributes,
    totalSize: opts.totalSize,
  });
}

export interface OpenChatBytesStreamOptions {
  destinationIdentities?: string[];
  mimeType?: string;
  name?: string;
  attributes?: Record<string, string>;
  totalSize?: number;
}

/** Open a long-running byte stream for chunked uploads / partial binary data. */
export function openChatBytesStream(
  scope: StreamScope,
  id: string,
  topic: typeof CHAT_TOPIC.image | typeof CHAT_TOPIC.voice | typeof CHAT_TOPIC.file,
  opts: OpenChatBytesStreamOptions = {},
) {
  return streamBytes(scope, id, {
    topic,
    destinationIdentities: opts.destinationIdentities,
    mimeType: opts.mimeType,
    name: opts.name,
    attributes: opts.attributes,
    totalSize: opts.totalSize,
  });
}
