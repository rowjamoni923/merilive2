/**
 * N3f — Native LiveKit messaging bridge (RPC + Text Streams).
 *
 * Companion to `livekitRpc.ts` and `livekitChatAttachments.ts` for sessions
 * running on the native Android plugin (no JS `Room`). Mirrors the
 * livekit-client semantics 1:1 so consumers can opt in with a single
 * try/fallback pattern:
 *
 *   const ok = await tryRegisterNativeRpcMethod('rejoin', async (ctx) => {
 *     return JSON.stringify({ accepted: true });
 *   });
 *   if (!ok) { registerRpcMethod(scope, id, 'rejoin', ...);  // JS Room path }
 *
 * The bridge:
 *   - is a no-op on web/iOS (returns false / throws "native-unavailable").
 *   - dispatches incoming RPC invocations to JS handlers, awaits the reply
 *     (or thrown Error), and forwards the response back to the SDK via
 *     `NativeLiveKit.respondToRpc`.
 *   - dispatches incoming text-stream chunks + complete events to JS
 *     handlers registered per topic.
 *
 * Kill-switch: respects `isLiveKitEnabled('rpc')` and `('chat')` from the
 * existing app_settings gates so admins can disable globally without an
 * APK release.
 */
import { NativeLiveKit, isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';
import { isLiveKitEnabled } from './livekitSignaling';

export interface NativeRpcContext {
  method: string;
  requestId: string;
  callerIdentity: string;
  payload: string;
  responseTimeout: number;
}

type NativeRpcHandler = (ctx: NativeRpcContext) => Promise<string> | string;

const rpcHandlers = new Map<string, NativeRpcHandler>();
let rpcListenerInstalled = false;

async function ensureRpcListener() {
  if (rpcListenerInstalled || !isNativeLiveKitAvailable()) return;
  rpcListenerInstalled = true;
  try {
    await NativeLiveKit.addListener('rpc-invocation', async (e) => {
      const handler = rpcHandlers.get(e.method);
      if (!handler) {
        try {
          await NativeLiveKit.respondToRpc({
            requestId: e.requestId,
            errorMessage: 'method_not_found',
          });
        } catch { /* swallow */ }
        return;
      }
      try {
        const result = await handler({
          method: e.method,
          requestId: e.requestId,
          callerIdentity: e.callerIdentity,
          payload: e.payload,
          responseTimeout: e.responseTimeout,
        });
        await NativeLiveKit.respondToRpc({
          requestId: e.requestId,
          result: typeof result === 'string' ? result : JSON.stringify(result ?? ''),
        });
      } catch (err) {
        try {
          await NativeLiveKit.respondToRpc({
            requestId: e.requestId,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        } catch { /* swallow */ }
      }
    });
  } catch (err) {
    console.warn('[N3f] failed to install rpc-invocation listener', err);
  }
}

/**
 * Register a handler for incoming RPCs on the native session.
 * Returns true on success, false when native is unavailable (caller
 * should fall through to the JS-Room `registerRpcMethod`).
 */
export async function tryRegisterNativeRpcMethod(
  method: string,
  handler: NativeRpcHandler,
): Promise<boolean> {
  if (!isNativeLiveKitAvailable()) return false;
  const enabled = await isLiveKitEnabled('rpc');
  if (!enabled) return false;
  await ensureRpcListener();
  rpcHandlers.set(method, handler);
  try {
    await NativeLiveKit.registerRpcMethod({ method });
    return true;
  } catch (err) {
    rpcHandlers.delete(method);
    console.warn(`[N3f] registerRpcMethod(${method}) failed`, err);
    return false;
  }
}

export async function tryUnregisterNativeRpcMethod(method: string): Promise<void> {
  rpcHandlers.delete(method);
  if (!isNativeLiveKitAvailable()) return;
  try {
    await NativeLiveKit.unregisterRpcMethod({ method });
  } catch { /* ignore */ }
}

/**
 * Call an RPC method on a remote participant in the native Room.
 * Throws `native-unavailable` when not running on the native plugin —
 * caller should catch and fall back to JS-Room `performRpc`.
 */
export async function tryPerformNativeRpc(opts: {
  destinationIdentity: string;
  method: string;
  payload?: string;
  responseTimeout?: number;
}): Promise<string> {
  if (!isNativeLiveKitAvailable()) throw new Error('native-unavailable');
  const enabled = await isLiveKitEnabled('rpc');
  if (!enabled) throw new Error('rpc_disabled');
  const res = await NativeLiveKit.performRpc({
    destinationIdentity: opts.destinationIdentity,
    method: opts.method,
    payload: opts.payload ?? '',
    responseTimeout: opts.responseTimeout ?? 15000,
  });
  return res.response;
}

// ----- Text streams -----------------------------------------------

export interface NativeTextStreamChunk {
  topic: string;
  streamId: string;
  fromIdentity: string;
  chunk: string;
}
export interface NativeTextStreamComplete {
  topic: string;
  streamId: string;
  fromIdentity: string;
  text?: string;
  attributes?: Record<string, string>;
  error?: string;
}

type ChunkHandler = (e: NativeTextStreamChunk) => void;
type CompleteHandler = (e: NativeTextStreamComplete) => void;

interface TextStreamReg {
  onChunk?: ChunkHandler;
  onComplete?: CompleteHandler;
}

const textStreamHandlers = new Map<string, TextStreamReg>();
let textStreamListenersInstalled = false;

async function ensureTextStreamListeners() {
  if (textStreamListenersInstalled || !isNativeLiveKitAvailable()) return;
  textStreamListenersInstalled = true;
  try {
    await NativeLiveKit.addListener('text-stream-chunk', (e) => {
      textStreamHandlers.get(e.topic)?.onChunk?.(e);
    });
    await NativeLiveKit.addListener('text-stream-complete', (e) => {
      textStreamHandlers.get(e.topic)?.onComplete?.(e);
    });
  } catch (err) {
    console.warn('[N3f] failed to install text-stream listeners', err);
  }
}

export async function tryRegisterNativeTextStreamHandler(
  topic: string,
  handler: TextStreamReg,
): Promise<boolean> {
  if (!isNativeLiveKitAvailable()) return false;
  const enabled = await isLiveKitEnabled('chat');
  if (!enabled) return false;
  await ensureTextStreamListeners();
  textStreamHandlers.set(topic, handler);
  try {
    await NativeLiveKit.registerTextStreamHandler({ topic });
    return true;
  } catch (err) {
    textStreamHandlers.delete(topic);
    console.warn(`[N3f] registerTextStreamHandler(${topic}) failed`, err);
    return false;
  }
}

export async function tryUnregisterNativeTextStreamHandler(topic: string): Promise<void> {
  textStreamHandlers.delete(topic);
  if (!isNativeLiveKitAvailable()) return;
  try {
    await NativeLiveKit.unregisterTextStreamHandler({ topic });
  } catch { /* ignore */ }
}

/**
 * Fire-and-forget text broadcast (or unicast when destinationIdentities is
 * non-empty) over the native data-streams channel. Returns false when
 * native is unavailable so callers can fall back to JS-Room `sendText`.
 */
export async function trySendNativeText(opts: {
  text: string;
  topic?: string;
  destinationIdentities?: string[];
}): Promise<boolean> {
  if (!isNativeLiveKitAvailable()) return false;
  const enabled = await isLiveKitEnabled('chat');
  if (!enabled) return false;
  try {
    const res = await NativeLiveKit.sendText({
      text: opts.text,
      topic: opts.topic ?? '',
      destinationIdentities: opts.destinationIdentities ?? [],
    });
    return !!res.sent;
  } catch (err) {
    console.warn('[N3f] sendText failed', err);
    return false;
  }
}
