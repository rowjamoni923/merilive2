/**
 * Pkg443 Phase-3 — Stream Quality Director.
 *
 * Single source of truth that combines three native signals into ONE
 * actionable hint for the live-streaming subsystem:
 *
 *   • Thermal state (THROTTLING / SEVERE / CRITICAL / EMERGENCY)
 *   • Memory pressure (onTrimMemory critical / low / moderate)
 *   • Network quality (poor / fair / good / excellent — from NetworkCallback)
 *
 * Emits the worst-of-three as window event 'stream:quality-hint'
 * with detail { level, reasons[] }, so LiveKit adaptive tier,
 * GPUPixel beauty intensity, and gift VAP/SVGA concurrency can all
 * step down together instead of fighting each other.
 *
 * level: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
 *
 * Mount once globally (DeferredAppHooks). No-op on web.
 */
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { memoryBus, type TrimSeverity } from '@/lib/memoryBus';
import { NetworkQuality } from '@/plugins/NetworkQuality';
import { ThermalBattery } from '@/plugins/ThermalBattery';

export type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export interface QualityHint {
  level: QualityLevel;
  reasons: string[];
  thermal?: string;
  network?: string;
  memory?: TrimSeverity;
}

const ORDER: QualityLevel[] = ['excellent', 'good', 'fair', 'poor', 'critical'];

function worst(a: QualityLevel, b: QualityLevel): QualityLevel {
  return ORDER.indexOf(a) > ORDER.indexOf(b) ? a : b;
}

function thermalToLevel(t: string | undefined): QualityLevel {
  switch (t) {
    case 'emergency':
    case 'shutdown':
      return 'critical';
    case 'critical':
    case 'severe':
      return 'poor';
    case 'moderate':
      return 'fair';
    case 'light':
      return 'good';
    default:
      return 'excellent';
  }
}

function networkToLevel(n: string | undefined): QualityLevel {
  switch (n) {
    case 'poor':
      return 'poor';
    case 'fair':
      return 'fair';
    case 'good':
      return 'good';
    case 'excellent':
      return 'excellent';
    default:
      return 'good';
  }
}

function memoryToLevel(m: TrimSeverity | undefined): QualityLevel {
  switch (m) {
    case 'complete':
    case 'critical':
      return 'critical';
    case 'moderate':
    case 'low':
      return 'poor';
    case 'background':
    case 'uiHidden':
      return 'fair';
    default:
      return 'excellent';
  }
}

export function useStreamQualityDirector() {
  const stateRef = useRef<{ thermal?: string; network?: string; memory?: TrimSeverity }>({});
  const lastEmittedRef = useRef<QualityLevel | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const emit = () => {
      const s = stateRef.current;
      const lvls: QualityLevel[] = [
        thermalToLevel(s.thermal),
        networkToLevel(s.network),
        memoryToLevel(s.memory),
      ];
      const level = lvls.reduce((acc, x) => worst(acc, x), 'excellent' as QualityLevel);
      if (level === lastEmittedRef.current) return;
      lastEmittedRef.current = level;
      const reasons: string[] = [];
      if (s.thermal && s.thermal !== 'none' && s.thermal !== 'unsupported') reasons.push(`thermal:${s.thermal}`);
      if (s.network && s.network !== 'good' && s.network !== 'excellent') reasons.push(`network:${s.network}`);
      if (s.memory && s.memory !== 'mild') reasons.push(`memory:${s.memory}`);
      const detail: QualityHint = { level, reasons, ...s };
      try {
        window.dispatchEvent(new CustomEvent<QualityHint>('stream:quality-hint', { detail }));
      } catch { /* ignore */ }
    };

    const unsubMem = memoryBus.subscribe((e) => { stateRef.current.memory = e.severity; emit(); });

    let thermalSub: { remove: () => Promise<void> } | null = null;
    let networkSub: { remove: () => Promise<void> } | null = null;

    (async () => {
      try {
        thermalSub = await ThermalBattery.addListener('thermalChange', (e: any) => {
          stateRef.current.thermal = e?.status ?? e?.state;
          emit();
        });
      } catch { /* ignore */ }
      try {
        // Seed current thermal value once.
        const t = await (ThermalBattery as any).getThermalState?.();
        if (t) { stateRef.current.thermal = t?.status ?? t?.state; emit(); }
      } catch { /* ignore */ }
      try {
        networkSub = await NetworkQuality.addListener('networkChange', (e: any) => {
          stateRef.current.network = e?.quality ?? e?.level;
          emit();
        });
      } catch { /* ignore */ }
      try {
        const n = await (NetworkQuality as any).getCurrent?.();
        if (n) { stateRef.current.network = n?.quality ?? n?.level; emit(); }
      } catch { /* ignore */ }
    })();

    return () => {
      unsubMem();
      thermalSub?.remove().catch(() => {});
      networkSub?.remove().catch(() => {});
    };
  }, []);
}

/** Convenience subscriber for components that want to react to hints. */
export function onQualityHint(cb: (h: QualityHint) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<QualityHint>).detail);
  window.addEventListener('stream:quality-hint', handler as EventListener);
  return () => window.removeEventListener('stream:quality-hint', handler as EventListener);
}
