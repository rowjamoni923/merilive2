/**
 * Pkg194 — Adaptive Stream / Dynacast per-room profile helper.
 *
 * LiveKit's `adaptiveStream` and `dynacast` are Room-constructor options
 * (cannot be flipped at runtime). This module centralizes per-use-case
 * profiles so every `new Room(...)` site picks the right defaults, and
 * a runtime override exists for low-power devices, admin monitors, and
 * preload/preview rooms.
 *
 * Profiles:
 *  - 'live'        → host & viewer & party rooms        (adaptive + dynacast ON)
 *  - 'call'        → 1:1 audio/video call               (adaptive + dynacast ON)
 *  - 'pk-opponent' → cross-room PK opponent video       (adaptive + dynacast ON)
 *  - 'preload'     → background preconnect, no render   (both OFF)
 *  - 'admin'       → admin monitor, fixed-quality       (both OFF)
 *  - 'low-power'   → battery-saver / data-saver         (adaptive ON, dynacast OFF)
 *
 * Callers pass `roomOptionsForProfile(profile, overrides?)` into `new Room()`.
 */

import type { RoomOptions } from 'livekit-client';

export type LKRoomProfile =
  | 'live'
  | 'call'
  | 'pk-opponent'
  | 'preload'
  | 'admin'
  | 'low-power';

interface ProfileFlags {
  adaptiveStream: boolean;
  dynacast: boolean;
}

const PROFILES: Record<LKRoomProfile, ProfileFlags> = {
  live:          { adaptiveStream: true,  dynacast: true  },
  call:          { adaptiveStream: true,  dynacast: true  },
  'pk-opponent': { adaptiveStream: true,  dynacast: true  },
  preload:       { adaptiveStream: false, dynacast: false },
  admin:         { adaptiveStream: false, dynacast: false },
  'low-power':   { adaptiveStream: true,  dynacast: false },
};

// Runtime override slot — let device-class detection or user toggle flip a profile globally.
const runtimeOverrides = new Map<LKRoomProfile, Partial<ProfileFlags>>();

export function setRoomProfileOverride(
  profile: LKRoomProfile,
  patch: Partial<ProfileFlags> | null,
): void {
  if (!patch) {
    runtimeOverrides.delete(profile);
    return;
  }
  runtimeOverrides.set(profile, { ...(runtimeOverrides.get(profile) || {}), ...patch });
}

export function getRoomProfileFlags(profile: LKRoomProfile): ProfileFlags {
  const base = PROFILES[profile];
  const ov = runtimeOverrides.get(profile);
  return ov ? { ...base, ...ov } : base;
}

/**
 * Merge profile-driven adaptiveStream/dynacast into a caller-supplied
 * RoomOptions object. Caller's existing keys (publishDefaults, audioCaptureDefaults,
 * etc.) are preserved as-is.
 */
export function roomOptionsForProfile(
  profile: LKRoomProfile,
  overrides: Partial<RoomOptions> = {},
): RoomOptions {
  const flags = getRoomProfileFlags(profile);
  return {
    adaptiveStream: flags.adaptiveStream,
    dynacast: flags.dynacast,
    ...overrides,
  };
}

/**
 * Auto-pick a profile from coarse device hints. Optional helper —
 * callers may still hard-code their profile.
 */
export function autoSelectProfile(base: LKRoomProfile, hints?: {
  saveData?: boolean;
  lowBattery?: boolean;
  cpuCores?: number;
}): LKRoomProfile {
  if (!hints) return base;
  if (hints.saveData || hints.lowBattery || (hints.cpuCores != null && hints.cpuCores <= 2)) {
    if (base === 'live' || base === 'call' || base === 'pk-opponent') return 'low-power';
  }
  return base;
}
