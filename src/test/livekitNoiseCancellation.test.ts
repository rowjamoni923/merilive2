import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNoiseCancellationSupported,
  applyNoiseCancellation,
  clearNoiseCancellation,
} from '@/lib/livekitNoiseCancellation';

vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: vi.fn(async () => true),
}));

vi.mock('@livekit/krisp-noise-filter', () => ({
  KrispNoiseFilter: () => ({ kind: 'krisp' }),
}));

describe('Pkg123 Noise Cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom shims
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    class FakeAC {}
    (FakeAC.prototype as any).audioWorklet = {};
    (globalThis as any).AudioContext = FakeAC as any;
    (window as any).AudioContext = FakeAC as any;
    (globalThis as any).WebAssembly = (globalThis as any).WebAssembly || {};
  });

  it('reports supported when AudioWorklet + WASM + secure context present', () => {
    expect(isNoiseCancellationSupported()).toBe(true);
  });

  it('reports unsupported when insecure context', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    expect(isNoiseCancellationSupported()).toBe(false);
  });

  it('no-ops for a null track', async () => {
    expect(await applyNoiseCancellation(null, { enabled: true })).toBe(false);
  });

  it('strips processor on enabled:false without attaching', async () => {
    const stopProcessor = vi.fn();
    const setProcessor = vi.fn();
    const track: any = { stopProcessor, setProcessor };
    const result = await applyNoiseCancellation(track, { enabled: false });
    expect(stopProcessor).toHaveBeenCalled();
    expect(setProcessor).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('attaches Krisp processor when enabled and supported', async () => {
    const setProcessor = vi.fn();
    const track: any = { setProcessor, stopProcessor: vi.fn() };
    const result = await applyNoiseCancellation(track, { enabled: true });
    expect(setProcessor).toHaveBeenCalledWith({ kind: 'krisp' });
    expect(result).toBe(true);
  });

  it('respects kill-switch (disabled → no processor attached)', async () => {
    const sig = await import('@/lib/livekitSignaling');
    (sig.isLiveKitEnabled as any).mockResolvedValueOnce(false);
    const setProcessor = vi.fn();
    const track: any = { setProcessor, stopProcessor: vi.fn() };
    expect(await applyNoiseCancellation(track, { enabled: true })).toBe(false);
    expect(setProcessor).not.toHaveBeenCalled();
  });

  it('does NOT attach when unsupported even with enabled:true', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const setProcessor = vi.fn();
    const track: any = { setProcessor, stopProcessor: vi.fn() };
    expect(await applyNoiseCancellation(track, { enabled: true })).toBe(false);
    expect(setProcessor).not.toHaveBeenCalled();
  });

  it('clearNoiseCancellation delegates to enabled:false', async () => {
    const stopProcessor = vi.fn();
    const track: any = { stopProcessor, setProcessor: vi.fn() };
    await clearNoiseCancellation(track);
    expect(stopProcessor).toHaveBeenCalled();
  });
});
