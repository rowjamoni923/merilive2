// Pkg443 — Unified Quality Hint bus.
//
// Phase 4 consumer of Pkg441 NetworkQuality + ThermalBattery + Pkg442
// HeadsetRouting. Combines live signals into a single 5-bucket hint that
// LiveKit (simulcast cap) and Beauty (intensity damp) react to.
//
// Buckets (worst wins):
//   excellent → wifi+cool+plenty of battery
//   good      → 4g/wifi, normal thermal
//   fair      → 3g, light thermal OR powerSave on
//   poor      → 2g / metered+save-data / moderate thermal / low battery
//   critical  → offline, severe+ thermal, or battery <= 5% unplugged
//
// Pure additive — every consumer treats absence as "good".
import { NetworkQuality, type NetworkSnapshot, type NetworkQualityBucket } from '@/plugins/NetworkQuality';
import { ThermalBattery, type ThermalSnapshot, type BatterySnapshot } from '@/plugins/ThermalBattery';

export type QualityBucket = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export interface QualityHint {
  bucket: QualityBucket;
  network: NetworkQualityBucket;
  thermal: string;
  battery: number;
  powerSave: boolean;
  reasons: string[];
}

export const QUALITY_HINT_EVENT = 'qualityHint';

const ORDER: Record<QualityBucket, number> = {
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
  critical: 0,
};

function worst(a: QualityBucket, b: QualityBucket): QualityBucket {
  return ORDER[a] <= ORDER[b] ? a : b;
}

function networkToBucket(n: NetworkSnapshot | null): { b: QualityBucket; reason?: string } {
  if (!n) return { b: 'good' };
  if (!n.online || n.quality === 'offline') return { b: 'critical', reason: 'offline' };
  switch (n.quality) {
    case 'excellent': return { b: 'excellent' };
    case 'good':      return { b: 'good' };
    case 'fair':      return { b: 'fair', reason: 'network=fair' };
    case 'poor':      return { b: 'poor', reason: 'network=poor' };
    default:          return { b: 'good' };
  }
}

function thermalToBucket(t: ThermalSnapshot | null): { b: QualityBucket; reason?: string } {
  if (!t || !t.supported) return { b: 'excellent' };
  switch (t.status) {
    case 'none':      return { b: 'excellent' };
    case 'light':     return { b: 'good',  reason: 'thermal=light' };
    case 'moderate':  return { b: 'fair',  reason: 'thermal=moderate' };
    case 'severe':    return { b: 'poor',  reason: 'thermal=severe' };
    case 'critical':
    case 'emergency':
    case 'shutdown':  return { b: 'critical', reason: `thermal=${t.status}` };
    default:          return { b: 'good' };
  }
}

function batteryToBucket(b: BatterySnapshot | null): { b: QualityBucket; reason?: string } {
  if (!b) return { b: 'excellent' };
  if (!b.isCharging && b.level >= 0 && b.level <= 5)  return { b: 'critical', reason: 'battery<=5%' };
  if (!b.isCharging && b.level >= 0 && b.level <= 15) return { b: 'poor',     reason: 'battery<=15%' };
  if (b.powerSaveMode)                                return { b: 'fair',     reason: 'powerSave' };
  return { b: 'excellent' };
}

let latestNet: NetworkSnapshot | null = null;
let latestThermal: ThermalSnapshot | null = null;
let latestBattery: BatterySnapshot | null = null;
let latestPowerSave = false;
let currentHint: QualityHint = {
  bucket: 'good',
  network: 'unknown',
  thermal: 'unknown',
  battery: -1,
  powerSave: false,
  reasons: [],
};
let initialized = false;

function recompute(): void {
  const n = networkToBucket(latestNet);
  const t = thermalToBucket(latestThermal);
  const bb = batteryToBucket(latestBattery);
  const reasons: string[] = [];
  if (n.reason) reasons.push(n.reason);
  if (t.reason) reasons.push(t.reason);
  if (bb.reason) reasons.push(bb.reason);
  if (latestPowerSave && !reasons.includes('powerSave')) reasons.push('powerSave');

  let bucket: QualityBucket = 'excellent';
  bucket = worst(bucket, n.b);
  bucket = worst(bucket, t.b);
  bucket = worst(bucket, bb.b);
  if (latestPowerSave) bucket = worst(bucket, 'fair');

  const next: QualityHint = {
    bucket,
    network: latestNet?.quality ?? 'unknown',
    thermal: latestThermal?.status ?? 'unknown',
    battery: latestBattery?.level ?? -1,
    powerSave: latestPowerSave,
    reasons,
  };

  if (next.bucket === currentHint.bucket && next.powerSave === currentHint.powerSave) {
    currentHint = next; // refresh details silently
    return;
  }
  currentHint = next;
  try {
    window.dispatchEvent(new CustomEvent<QualityHint>(QUALITY_HINT_EVENT, { detail: next }));
  } catch { /* ignore */ }
}

export function getQualityHint(): QualityHint {
  return currentHint;
}

export function subscribeQualityHint(cb: (h: QualityHint) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<QualityHint>).detail;
    if (detail) cb(detail);
  };
  window.addEventListener(QUALITY_HINT_EVENT, handler as EventListener);
  return () => window.removeEventListener(QUALITY_HINT_EVENT, handler as EventListener);
}

export async function initQualityHintBus(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    latestNet = await NetworkQuality.getStatus();
  } catch { /* ignore */ }
  try {
    latestThermal = await ThermalBattery.getThermalStatus();
  } catch { /* ignore */ }
  try {
    latestBattery = await ThermalBattery.getBatteryStatus();
    latestPowerSave = !!latestBattery?.powerSaveMode;
  } catch { /* ignore */ }
  recompute();

  try {
    await NetworkQuality.addListener('networkChange', (snap) => {
      latestNet = snap;
      recompute();
    });
  } catch { /* ignore */ }
  try {
    await ThermalBattery.addListener('thermalChange', (snap) => {
      latestThermal = snap;
      recompute();
    });
  } catch { /* ignore */ }
  try {
    await ThermalBattery.addListener('batteryChange', (snap) => {
      latestBattery = snap;
      latestPowerSave = !!snap.powerSaveMode;
      recompute();
    });
  } catch { /* ignore */ }
  try {
    await ThermalBattery.addListener('powerSaveChange', ({ powerSaveMode }) => {
      latestPowerSave = !!powerSaveMode;
      recompute();
    });
  } catch { /* ignore */ }
}

// Auto-init at import (safe — listeners are best-effort, web fallback is inert).
if (typeof window !== 'undefined') {
  void initQualityHintBus();
}
