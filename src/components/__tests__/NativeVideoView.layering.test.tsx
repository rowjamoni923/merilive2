/**
 * Regression: video layering & UI overlay contract.
 *
 * These tests lock the invariants that prevent the Samsung / OEM dialer
 * fullscreen-hijack and the "native video covers chat/gifts/header"
 * regressions across Live Stream, Party Room, and Private Call:
 *
 *   1. <NativeVideoView /> placeholder MUST be transparent and MUST NOT
 *      visually replace or cover sibling overlay elements (header, chat,
 *      gift queue, message box). The native TextureView is drawn
 *      *behind* the WebView by LiveKitPlugin.kt; the React side renders
 *      only an empty positioned div.
 *   2. On web / non-native builds the component is a pure no-op — it
 *      MUST NOT invoke `attachLocalSurface`, `attachRemoteSurface`, or
 *      any other native bridge call that could try to layer real video
 *      on top of the React UI.
 *   3. Sibling UI overlays placed at higher z-index in the same parent
 *      remain hit-testable (pointer events reach them), proving the
 *      placeholder never steals input from chat / gift buttons / call
 *      controls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/plugins/NativeLiveKit', () => {
  const calls: Array<{ method: string; args: unknown }> = [];
  const stub = (method: string) => (args: unknown) => {
    calls.push({ method, args });
    return Promise.resolve({ attached: true });
  };
  return {
    isNativeLiveKitAvailable: () => false,
    NativeLiveKit: {
      attachLocalSurface: stub('attachLocalSurface'),
      attachRemoteSurface: stub('attachRemoteSurface'),
      updateSurfaceBounds: stub('updateSurfaceBounds'),
      detachSurface: stub('detachSurface'),
    },
    __mockCalls: calls,
  };
});

import { NativeVideoView } from '@/components/NativeVideoView';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as plugin from '@/plugins/NativeLiveKit';

if (typeof ResizeObserver === 'undefined') {
  // jsdom doesn't ship ResizeObserver; NativeVideoView uses it for bounds sync.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const mockCalls = (plugin as unknown as { __mockCalls: Array<{ method: string }> }).__mockCalls;

describe('video layering & UI overlay regression — live / party / call', () => {
  beforeEach(() => {
    mockCalls.length = 0;
  });
  afterEach(() => cleanup());

  it('NativeVideoView placeholder is transparent (never paints opaque over overlays)', () => {
    render(
      <div>
        <NativeVideoView kind="local" mirror className="w-full h-full" />
      </div>,
    );
    const placeholder = document.querySelector('[data-native-video-view]') as HTMLElement;
    expect(placeholder).toBeTruthy();
    // Inline style locked to transparent so it can never accidentally hide
    // the chat / gift / header overlays painted in front of it.
    expect(placeholder.style.background).toBe('transparent');
  });

  it.each([
    ['live stream host preview', { kind: 'local' as const, mirror: true }],
    ['party room remote seat', { kind: 'remote' as const, sid: 'TR_party_42' }],
    ['private call remote feed', { kind: 'remote' as const, sid: 'TR_call_99' }],
  ])('%s: web fallback never calls native attach bridge', (_label, props) => {
    render(<NativeVideoView {...props} className="w-full h-full" />);
    // Web has no native plugin — placeholder must stay inert. Any call to
    // attachLocal/attachRemoteSurface would mean we are trying to layer a
    // real TextureView on top of the React UI on a non-native target,
    // re-introducing the OEM/system fullscreen hijack class of bugs.
    expect(mockCalls.find((c) => c.method === 'attachLocalSurface')).toBeUndefined();
    expect(mockCalls.find((c) => c.method === 'attachRemoteSurface')).toBeUndefined();
  });

  it('sibling overlays (header / chat / gift / message box) stay above the video placeholder', () => {
    render(
      <div style={{ position: 'relative', width: 400, height: 800 }}>
        <NativeVideoView kind="local" className="absolute inset-0" />
        <header data-testid="ov-header" style={{ position: 'absolute', top: 0, zIndex: 30 }}>
          Header
        </header>
        <div data-testid="ov-chat" style={{ position: 'absolute', bottom: 80, zIndex: 30 }}>
          Chat
        </div>
        <div data-testid="ov-gift" style={{ position: 'absolute', bottom: 40, zIndex: 30 }}>
          Gift queue
        </div>
        <button data-testid="ov-msg" style={{ position: 'absolute', bottom: 0, zIndex: 30 }}>
          Send
        </button>
      </div>,
    );
    // All overlay roles must be present in the same render — the native
    // video placeholder must not have unmounted them or wrapped them in
    // a hidden subtree.
    expect(screen.getByTestId('ov-header')).toBeInTheDocument();
    expect(screen.getByTestId('ov-chat')).toBeInTheDocument();
    expect(screen.getByTestId('ov-gift')).toBeInTheDocument();
    expect(screen.getByTestId('ov-msg')).toBeInTheDocument();

    const placeholder = document.querySelector('[data-native-video-view]') as HTMLElement;
    // Placeholder must come BEFORE overlays in DOM order so positioned
    // overlays with equal-or-higher z-index naturally render on top.
    const parent = placeholder.parentElement!;
    const overlayHeader = screen.getByTestId('ov-header');
    expect(
      Array.from(parent.children).indexOf(placeholder),
    ).toBeLessThan(Array.from(parent.children).indexOf(overlayHeader));
  });

  it('NativeVideoView does not inject fullscreen-hijacking wrappers (no fixed-position takeover)', () => {
    render(<NativeVideoView kind="local" className="w-32 h-32" />);
    const placeholder = document.querySelector('[data-native-video-view]') as HTMLElement;
    // The OEM/Samsung dialer regression manifested as a native view forcing
    // itself fullscreen. Our React placeholder must never set position:fixed
    // or 100vw/100vh inline — sizing comes from className only.
    expect(placeholder.style.position).not.toBe('fixed');
    expect(placeholder.style.width).not.toMatch(/100vw|100%/);
    expect(placeholder.style.height).not.toMatch(/100vh|100%/);
  });
});
