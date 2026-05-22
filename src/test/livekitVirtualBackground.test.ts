import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isVirtualBackgroundSupported,
  applyVirtualBackground,
  clearVirtualBackground,
} from '@/lib/livekitVirtualBackground';

vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: vi.fn(async () => true),
}));

vi.mock('@livekit/track-processors', () => ({
  BackgroundBlur: (r: number) => ({ kind: 'blur', radius: r }),
  VirtualBackground: (u: string) => ({ kind: 'image', url: u }),
}));

describe('Pkg119 Virtual Background', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom: shim OffscreenCanvas + isSecureContext + Worker
    (globalThis as any).OffscreenCanvas = class {};
    (globalThis as any).Worker = class {};
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });

  it('reports supported when crypto + worker + offscreen canvas present', () => {
    expect(isVirtualBackgroundSupported()).toBe(true);
  });

  it('no-ops for a null track', async () => {
    expect(await applyVirtualBackground(null, { mode: 'blur' })).toBe(false);
  });

  it('strips processor on mode "none" without attaching', async () => {
    const stopProcessor = vi.fn();
    const setProcessor = vi.fn();
    const track: any = { stopProcessor, setProcessor };
    const result = await applyVirtualBackground(track, { mode: 'none' });
    expect(stopProcessor).toHaveBeenCalled();
    expect(setProcessor).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('attaches blur processor with default radius', async () => {
    const setProcessor = vi.fn();
    const track: any = { setProcessor, stopProcessor: vi.fn() };
    const result = await applyVirtualBackground(track, { mode: 'blur' });
    expect(setProcessor).toHaveBeenCalledWith({ kind: 'blur', radius: 10 });
    expect(result).toBe(true);
  });

  it('attaches blur with custom radius', async () => {
    const setProcessor = vi.fn();
    const track: any = { setProcessor, stopProcessor: vi.fn() };
    await applyVirtualBackground(track, { mode: 'blur', blurRadius: 25 });
    expect(setProcessor).toHaveBeenCalledWith({ kind: 'blur', radius: 25 });
  });

  it('attaches image processor when url provided', async () => {
    const setProcessor = vi.fn();
    const track: any = { setProcessor, stopProcessor: vi.fn() };
    const result = await applyVirtualBackground(track, {
      mode: 'image',
      imageUrl: 'https://cdn.example/bg.jpg',
    });
    expect(setProcessor).toHaveBeenCalledWith({ kind: 'image', url: 'https://cdn.example/bg.jpg' });
    expect(result).toBe(true);
  });

  it('skips image mode when no url provided', async () => {
    const setProcessor = vi.fn();
    const track: any = { setProcessor, stopProcessor: vi.fn() };
    const result = await applyVirtualBackground(track, { mode: 'image' });
    expect(setProcessor).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('respects kill-switch (disabled → no processor attached)', async () => {
    const sig = await import('@/lib/livekitSignaling');
    (sig.isLiveKitEnabled as any).mockResolvedValueOnce(false);
    const setProcessor = vi.fn();
    const track: any = { setProcessor, stopProcessor: vi.fn() };
    expect(await applyVirtualBackground(track, { mode: 'blur' })).toBe(false);
    expect(setProcessor).not.toHaveBeenCalled();
  });

  it('clearVirtualBackground delegates to mode "none"', async () => {
    const stopProcessor = vi.fn();
    const track: any = { stopProcessor, setProcessor: vi.fn() };
    await clearVirtualBackground(track);
    expect(stopProcessor).toHaveBeenCalled();
  });
});
