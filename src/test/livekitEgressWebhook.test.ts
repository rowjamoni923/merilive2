// Pkg112: livekit-webhook egress finalization unit tests.
// We test the status mapping + update payload shape via a small helper
// extracted inline so we don't have to run the full Deno webhook function.
import { describe, it, expect } from 'vitest';

const STATUS_MAP: Record<string, string> = {
  EGRESS_STARTING: 'starting',
  EGRESS_ACTIVE: 'active',
  EGRESS_ENDING: 'ending',
  EGRESS_COMPLETE: 'completed',
  EGRESS_FAILED: 'failed',
  EGRESS_ABORTED: 'aborted',
  EGRESS_LIMIT_REACHED: 'limit_reached',
};
const TERMINAL = new Set(['completed', 'failed', 'aborted', 'limit_reached']);

function buildRecUpdate(egress: Record<string, unknown>) {
  const raw = (egress.status ?? '').toString();
  const status = STATUS_MAP[raw] ?? raw.toLowerCase().replace(/^egress_/, '');
  const isTerminal = TERMINAL.has(status);
  const file = Array.isArray(egress.fileResults) && (egress.fileResults as unknown[]).length > 0
    ? (egress.fileResults as Array<Record<string, unknown>>)[0]
    : (egress.file as Record<string, unknown> | undefined) ?? null;
  let duration_seconds: number | null = null;
  if (file?.duration != null) {
    const dn = Number(file.duration);
    if (Number.isFinite(dn) && dn > 0) duration_seconds = Math.round(dn / 1_000_000_000);
  }
  let size_bytes: number | null = null;
  if (file?.size != null) {
    const sn = Number(file.size);
    if (Number.isFinite(sn) && sn >= 0) size_bytes = sn;
  }
  const file_url = (file?.location as string | undefined) ?? (file?.filename as string | undefined) ?? null;
  const u: Record<string, unknown> = { status };
  if (file_url) u.file_url = file_url;
  if (duration_seconds != null) u.duration_seconds = duration_seconds;
  if (size_bytes != null) u.size_bytes = size_bytes;
  if (egress.error) u.error = String(egress.error);
  if (isTerminal) u.ended_at = '__set__';
  return { update: u, isTerminal };
}

describe('Pkg112 egress webhook finalizer', () => {
  it('maps EGRESS_ACTIVE → active (non-terminal, no ended_at)', () => {
    const r = buildRecUpdate({ status: 'EGRESS_ACTIVE', egressId: 'E1' });
    expect(r.update.status).toBe('active');
    expect(r.isTerminal).toBe(false);
    expect(r.update.ended_at).toBeUndefined();
  });

  it('maps EGRESS_COMPLETE → completed (terminal, sets ended_at)', () => {
    const r = buildRecUpdate({
      status: 'EGRESS_COMPLETE',
      fileResults: [{
        location: 'https://cdn.example/recordings/x.mp4',
        duration: '125000000000', // 125s
        size: '524288',
      }],
    });
    expect(r.update.status).toBe('completed');
    expect(r.isTerminal).toBe(true);
    expect(r.update.file_url).toBe('https://cdn.example/recordings/x.mp4');
    expect(r.update.duration_seconds).toBe(125);
    expect(r.update.size_bytes).toBe(524288);
    expect(r.update.ended_at).toBe('__set__');
  });

  it('maps EGRESS_FAILED → failed and captures error', () => {
    const r = buildRecUpdate({ status: 'EGRESS_FAILED', error: 's3 upload denied' });
    expect(r.update.status).toBe('failed');
    expect(r.isTerminal).toBe(true);
    expect(r.update.error).toBe('s3 upload denied');
  });

  it('maps EGRESS_ABORTED → aborted (terminal)', () => {
    const r = buildRecUpdate({ status: 'EGRESS_ABORTED' });
    expect(r.update.status).toBe('aborted');
    expect(r.isTerminal).toBe(true);
  });

  it('falls back to lowercased status when not in map', () => {
    const r = buildRecUpdate({ status: 'EGRESS_FUTURE_STATE' });
    expect(r.update.status).toBe('future_state');
  });

  it('handles single `file` (not fileResults array)', () => {
    const r = buildRecUpdate({
      file: { location: 'https://x/y.mp4', duration: '3000000000', size: '100' },
    });
    expect(r.update.file_url).toBe('https://x/y.mp4');
    expect(r.update.duration_seconds).toBe(3);
    expect(r.update.size_bytes).toBe(100);
  });

  it('skips numeric fields when invalid', () => {
    const r = buildRecUpdate({
    });
    expect(r.update.duration_seconds).toBeUndefined();
    expect(r.update.size_bytes).toBeUndefined();
    expect(r.update.file_url).toBe('https://x/y.mp4');
  });

  it('non-terminal status does not set ended_at', () => {
    const r = buildRecUpdate({ status: 'EGRESS_STARTING' });
    expect(r.update.status).toBe('starting');
    expect(r.isTerminal).toBe(false);
    expect(r.update.ended_at).toBeUndefined();
  });
});
