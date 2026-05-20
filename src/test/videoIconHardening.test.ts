/**
 * Single-source guard: ensures every <video> element in the
 * private-call / live-streaming / video-party / game-party surfaces
 * is 100% hardened — no controls, no fullscreen icon, no PiP, no
 * remote-playback, no tap-to-play overlay (both host and visitor side).
 *
 * If a new <video> is added in any of these paths without going through
 * `hardenVideoElementForNative` (or inlining all 4 guards), this test fails.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCOPE = [
  'src/components/call',
  'src/components/calls',
  'src/components/live',
  'src/components/party',
  'src/pages/LiveStream.tsx',
  'src/pages/GoLive.tsx',
];

function collect(): string[] {
  const out: string[] = [];
  for (const p of SCOPE) {
    if (!fs.existsSync(p)) continue;
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      (function walk(d: string) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const fp = path.join(d, e.name);
          if (e.isDirectory()) walk(fp);
          else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(fp);
        }
      })(p);
    } else out.push(p);
  }
  return out;
}

describe('Realtime video surfaces — host + visitor must have ZERO native video controls', () => {
  it('central hardenVideoElementForNative still kills controls + reveals on first frame', () => {
    const src = fs.readFileSync('src/utils/videoNativeHardening.ts', 'utf8');
    expect(src).toMatch(/controls\s*=\s*false/);
    expect(src).toMatch(/disablePictureInPicture/);
    expect(src).toMatch(/controlsList/);
    expect(src).toMatch(/opacity\s*=\s*'0'/);
    expect(src).toMatch(/requestVideoFrameCallback/);
  });

  it('index.css kills every native play/fullscreen pseudo-element', () => {
    const css = fs.readFileSync('src/index.css', 'utf8');
    for (const rule of [
      'webkit-media-controls-play-button',
      'webkit-media-controls-start-playback-button',
      'webkit-media-controls-overlay-play-button',
      'webkit-media-controls-fullscreen-button',
    ]) {
      expect(css).toContain(rule);
    }
    expect(css).toMatch(/display:\s*none\s*!important/);
  });

  it('every in-scope <video> goes through the hardener OR inlines all 4 guards', () => {
    const offenders: string[] = [];
    for (const f of collect()) {
      const src = fs.readFileSync(f, 'utf8');
      const fileUsesHardener = /hardenVideoElementForNative/.test(src);
      const re = /<video\b([^>]*?)(?:\/>|>)/gms;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const attrs = m[1];
        const inlineHardened =
          /controls\s*=\s*\{?\s*false\s*\}?/.test(attrs) &&
          /disablePictureInPicture/.test(attrs) &&
          /disableRemotePlayback/.test(attrs) &&
          /playsInline/.test(attrs);
        if (!inlineHardened && !fileUsesHardener) {
          offenders.push(`${f} :: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`);
        }
      }
    }
    expect(offenders, `Unhardened <video> tags:\n${offenders.join('\n')}`).toEqual([]);
  });
});
