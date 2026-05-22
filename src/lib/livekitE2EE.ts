/**
 * Pkg108: LiveKit End-to-End Encryption (E2EE) — Private Calls Only
 * --------------------------------------------------------------
 * LiveKit uses Insertable Streams + a WASM worker to encrypt media
 * frames with a shared symmetric key BEFORE they hit the SFU. The
 * server (LiveKit Cloud) only routes encrypted bytes — it cannot
 * decrypt audio/video. This gives true E2EE for private 1:1 calls.
 *
 * Scope: PRIVATE CALL ONLY (2 participants share a per-call key from
 * `private_calls.e2ee_key`, fetched via `get_call_e2ee_key` RPC).
 * Live/party are 1-to-many broadcasts — E2EE there requires complex
 * key rotation that Bigo/Tango/Chamet do not ship. Skip until asked.
 *
 * Default state: OFF. Kill-switch `livekit_signaling_enabled.e2ee=false`.
 * Both peers must enable E2EE — if one disables, media decryption fails
 * on the other side. Flip the kill-switch to true ONLY after deploying
 * a build with this lib to both web and native clients.
 *
 * Native Android note: LiveKit Android SDK supports the same Insertable
 * Streams model; wire the same fetched key into the native plugin in a
 * later package. Until then, calls with a native participant should
 * keep E2EE OFF (the gate below auto-disables if the worker can't run).
 */
import { ExternalE2EEKeyProvider, type RoomOptions } from 'livekit-client';
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from './livekitSignaling';

/**
 * Decode a base64 string into a Uint8Array suitable for E2EE key material.
 */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Fetch (or lazily generate) the per-call shared key. Server enforces
 * that only the call's caller_id or host_id can retrieve it.
 */
export async function fetchCallE2EEKey(callId: string): Promise<Uint8Array | null> {
  if (!callId) return null;
  try {
    const { data, error } = await supabase.rpc('get_call_e2ee_key', { _call_id: callId });
    if (error || !data || typeof data !== 'string') {
      if (error) console.warn('[Pkg108] get_call_e2ee_key failed:', error.message);
      return null;
    }
    return base64ToBytes(data);
  } catch (err) {
    console.warn('[Pkg108] fetchCallE2EEKey threw:', err);
    return null;
  }
}

/**
 * Returns a pair `{ e2eeOption, keyProvider }` to merge into `new Room({...})`.
 * If kill-switch is off, returns `{ e2eeOption: undefined }` — caller should
 * skip `setE2EEEnabled` entirely.
 *
 * The Worker is loaded from the npm package via `import.meta.url` so Vite
 * bundles it as a same-origin module worker. Insertable Streams require
 * Secure Context (https/localhost) — Capacitor WebView counts as secure.
 */
export async function buildE2EEOptions(
  keyBytes: Uint8Array | null,
): Promise<{ e2eeOption: RoomOptions['e2ee'] | undefined; keyProvider: ExternalE2EEKeyProvider | null }> {
  if (!keyBytes || keyBytes.length === 0) {
    return { e2eeOption: undefined, keyProvider: null };
  }

  let enabled = false;
  try {
    enabled = await isLiveKitEnabled('e2ee');
  } catch {
    enabled = false;
  }
  if (!enabled) {
    return { e2eeOption: undefined, keyProvider: null };
  }

  // Insertable Streams gate — Safari < 15.4 and old Firefox lack it.
  if (typeof window === 'undefined') return { e2eeOption: undefined, keyProvider: null };
  const hasInsertable =
    typeof (window as any).RTCRtpScriptTransform !== 'undefined' ||
    // Chrome/Edge path
    'createEncodedStreams' in (window.RTCRtpSender?.prototype ?? {});
  if (!hasInsertable) {
    console.warn('[Pkg108] Insertable Streams unsupported — E2EE skipped.');
    return { e2eeOption: undefined, keyProvider: null };
  }

  try {
    const keyProvider = new ExternalE2EEKeyProvider();
    await keyProvider.setKey(keyBytes);

    // Vite bundles this as a module worker at build time.
    const worker = new Worker(
      new URL('livekit-client/dist/livekit-client.e2ee.worker.mjs', import.meta.url),
      { type: 'module' },
    );

    return {
      e2eeOption: { keyProvider, worker },
      keyProvider,
    };
  } catch (err) {
    console.warn('[Pkg108] buildE2EEOptions failed, falling back to plaintext:', err);
    return { e2eeOption: undefined, keyProvider: null };
  }
}
