/**
 * Pkg438 Phase B — Runtime singletons that report whether the native
 * gift/entry animation pipelines are LIVE (flag ON + plugin available +
 * dispatcher mounted) on this device.
 *
 * WebView components (FullScreenGiftAnimation, EntryBarAnimation,
 * UnifiedEntryAnimation) can call these to bail out of their own render
 * path and avoid double-playing the same animation. Reads are sync and
 * safe during render.
 *
 * The dispatcher hooks own the `set*Active` setters — never call them
 * from anywhere else.
 */

let _giftActive = false;
let _entryActive = false;
const giftListeners = new Set<(active: boolean) => void>();
const entryListeners = new Set<(active: boolean) => void>();

export function isNativeGiftPipelineActive(): boolean {
  return _giftActive;
}

export function isNativeEntryPipelineActive(): boolean {
  return _entryActive;
}

export function setNativeGiftPipelineActive(active: boolean): void {
  if (_giftActive === active) return;
  _giftActive = active;
  for (const l of giftListeners) {
    try { l(active); } catch { /* ignore */ }
  }
}

export function setNativeEntryPipelineActive(active: boolean): void {
  if (_entryActive === active) return;
  _entryActive = active;
  for (const l of entryListeners) {
    try { l(active); } catch { /* ignore */ }
  }
}

export function subscribeNativeGiftPipeline(cb: (active: boolean) => void): () => void {
  giftListeners.add(cb);
  return () => giftListeners.delete(cb);
}

export function subscribeNativeEntryPipeline(cb: (active: boolean) => void): () => void {
  entryListeners.add(cb);
  return () => entryListeners.delete(cb);
}
