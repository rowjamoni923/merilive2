/**
 * Pkg197 — Custom ReconnectPolicy for mobile-flaky networks.
 *
 * LiveKit's default ReconnectPolicy: ~10 attempts, exponential backoff
 * starting at 300ms — tuned for desktop. On mobile (4G→Wi-Fi handoff,
 * elevator dead-zones, Android Doze), the default gives up too early and
 * the initial backoff is too aggressive.
 *
 * This module ships two named policies and a factory:
 *
 *   - mobileFriendlyPolicy  → 15 attempts, 400ms→8s gentle exponential
 *   - aggressivePolicy      → 6 attempts, 200ms→2s for fast 1:1 calls
 *   - createReconnectPolicy → custom tuning
 *
 * Plus `roomOptionsWithReconnect(profile, base?)` for one-line wiring
 * into `new Room({...})` alongside Pkg194 profile helper.
 *
 * Pure factory — no Supabase, no listeners, no polling.
 */

import type { ReconnectPolicy, ReconnectContext, RoomOptions } from 'livekit-client';

export interface ReconnectTuning {
  /** Total reconnect attempts before giving up (default 10). */
  maxAttempts?: number;
  /** Initial backoff in ms for attempt #1 (default 300). */
  initialDelayMs?: number;
  /** Max backoff cap in ms (default 7000). */
  maxDelayMs?: number;
  /** Exponential growth factor between attempts (default 1.8). */
  backoffFactor?: number;
  /** Random jitter ratio added/subtracted to each delay (0..1, default 0.2). */
  jitterRatio?: number;
}

export function createReconnectPolicy(tuning: ReconnectTuning = {}): ReconnectPolicy {
  const maxAttempts = tuning.maxAttempts ?? 10;
  const initial = tuning.initialDelayMs ?? 300;
  const cap = tuning.maxDelayMs ?? 7000;
  const factor = tuning.backoffFactor ?? 1.8;
  const jitter = Math.min(Math.max(tuning.jitterRatio ?? 0.2, 0), 1);

  return {
    nextRetryDelayInMs(context: ReconnectContext): number | null {
      const attempt = context.retryCount ?? 0;
      if (attempt >= maxAttempts) return null;
      const base = Math.min(initial * Math.pow(factor, attempt), cap);
      const j = (Math.random() * 2 - 1) * jitter; // -jitter..+jitter
      return Math.max(100, Math.round(base * (1 + j)));
    },
  };
}

export const mobileFriendlyPolicy: ReconnectPolicy = createReconnectPolicy({
  maxAttempts: 15,
  initialDelayMs: 400,
  maxDelayMs: 8000,
  backoffFactor: 1.7,
  jitterRatio: 0.25,
});

export const aggressivePolicy: ReconnectPolicy = createReconnectPolicy({
  maxAttempts: 6,
  initialDelayMs: 200,
  maxDelayMs: 2000,
  backoffFactor: 1.6,
  jitterRatio: 0.15,
});

export const conservativePolicy: ReconnectPolicy = createReconnectPolicy({
  maxAttempts: 20,
  initialDelayMs: 800,
  maxDelayMs: 12000,
  backoffFactor: 1.5,
  jitterRatio: 0.3,
});

export type ReconnectProfile = 'mobile' | 'aggressive' | 'conservative' | 'default';

export function getReconnectPolicy(profile: ReconnectProfile): ReconnectPolicy | undefined {
  switch (profile) {
    case 'mobile':       return mobileFriendlyPolicy;
    case 'aggressive':   return aggressivePolicy;
    case 'conservative': return conservativePolicy;
    case 'default':      return undefined; // let livekit-client use its built-in
  }
}

/**
 * Merge a reconnect policy into RoomOptions. Combine with Pkg194's
 * `roomOptionsForProfile()` like:
 *
 *   new Room({
 *     ...roomOptionsForProfile('live'),
 *     ...roomOptionsWithReconnect('mobile'),
 *     publishDefaults: { ... },
 *   })
 */
export function roomOptionsWithReconnect(
  profile: ReconnectProfile,
  base: Partial<RoomOptions> = {},
): RoomOptions {
  const policy = getReconnectPolicy(profile);
  if (!policy) return base as RoomOptions;
  return { ...base, reconnectPolicy: policy } as RoomOptions;
}
