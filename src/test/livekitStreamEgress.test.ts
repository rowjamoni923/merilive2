// Pkg114 unit tests — provider detection, URL masking, validation.
import { describe, it, expect } from 'vitest';
import { isLikelyRtmpUrl } from '@/lib/livekitStreamEgress';

// Duplicate the edge-function helpers locally (Deno-only file can't be imported by vitest).
function detectProvider(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtube') || host.includes('googlevideo')) return 'youtube';
    if (host.includes('facebook') || host.includes('fbcdn')) return 'facebook';
    if (host.includes('twitch')) return 'twitch';
    if (host.includes('kick')) return 'kick';
    if (host.includes('trovo')) return 'trovo';
    return 'custom';
  } catch { return 'custom'; }
}

function maskRtmpUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname || '';
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash < 0 || lastSlash === path.length - 1) return `${u.protocol}//${u.host}${path}`;
    const base = path.slice(0, lastSlash + 1);
    const key = path.slice(lastSlash + 1);
    if (key.length <= 6) return `${u.protocol}//${u.host}${base}••••`;
    const masked = `${key.slice(0, 4)}•••${key.slice(-3)}`;
    return `${u.protocol}//${u.host}${base}${masked}`;
  } catch { return 'invalid_url'; }
}

describe('Pkg114 detectProvider', () => {
  it('detects YouTube', () => {
    expect(detectProvider('rtmp://a.rtmp.youtube.com/live2/abcd-1234-efgh-5678')).toBe('youtube');
  });
  it('detects Facebook', () => {
    expect(detectProvider('rtmps://live-api-s.facebook.com:443/rtmp/FB-1234-key')).toBe('facebook');
  });
  it('detects Twitch', () => {
    expect(detectProvider('rtmp://live.twitch.tv/app/live_123_key')).toBe('twitch');
  });
  it('falls back to custom for unknown host', () => {
    expect(detectProvider('rtmp://my.cdn.example.com/app/streamkey')).toBe('custom');
  });
  it('falls back to custom for invalid url', () => {
    expect(detectProvider('not-a-url')).toBe('custom');
  });
});

describe('Pkg114 maskRtmpUrl', () => {
  it('masks long stream key', () => {
    const masked = maskRtmpUrl('rtmp://a.rtmp.youtube.com/live2/abcd-1234-efgh-5678');
    expect(masked).toBe('rtmp://a.rtmp.youtube.com/live2/abcd•••678');
    expect(masked).not.toContain('1234-efgh');
  });
  it('masks short key with bullets', () => {
    expect(maskRtmpUrl('rtmp://x.com/app/key')).toBe('rtmp://x.com/app/••••');
  });
  it('returns invalid_url for garbage', () => {
    expect(maskRtmpUrl('garbage')).toBe('invalid_url');
  });
});

describe('Pkg114 isLikelyRtmpUrl', () => {
  it('accepts rtmp and rtmps URLs with app + key', () => {
    expect(isLikelyRtmpUrl('rtmp://a.b.com/live/key')).toBe(true);
    expect(isLikelyRtmpUrl('rtmps://a.b.com/live/key-123')).toBe(true);
  });
  it('rejects http/empty/oversized', () => {
    expect(isLikelyRtmpUrl('https://a.b.com/live/key')).toBe(false);
    expect(isLikelyRtmpUrl('')).toBe(false);
    expect(isLikelyRtmpUrl('rtmp://a.b.com/onlyapp')).toBe(false);
    expect(isLikelyRtmpUrl('x'.repeat(600))).toBe(false);
  });
});
