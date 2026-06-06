// Pkg441 — Network Quality TS facade
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type NetworkTransport = 'wifi' | 'cellular' | 'ethernet' | 'vpn' | 'none' | 'unknown';
export type CellularType = '5g' | '4g' | 'lte' | '3g' | '2g' | 'cellular' | null;
export type NetworkQualityBucket = 'offline' | 'poor' | 'fair' | 'good' | 'excellent' | 'unknown';

export interface NetworkSnapshot {
  online: boolean;
  transport: NetworkTransport;
  cellularType: CellularType;
  downstreamKbps: number;
  upstreamKbps: number;
  metered: boolean;
  vpn: boolean;
  quality: NetworkQualityBucket;
}

export interface NetworkQualityPlugin {
  getStatus(): Promise<NetworkSnapshot>;
  addListener(
    eventName: 'networkChange',
    listenerFunc: (snap: NetworkSnapshot) => void,
  ): Promise<PluginListenerHandle>;
}

export const NetworkQuality = registerPlugin<NetworkQualityPlugin>('NetworkQuality', {
  web: {
    async getStatus(): Promise<NetworkSnapshot> {
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      const c =
        typeof navigator !== 'undefined' ? (navigator as unknown as { connection?: any }).connection ?? null : null;
      const downMbps = c?.downlink ? Number(c.downlink) : 0;
      const downKbps = Math.round(downMbps * 1000);
      const effective = (c?.effectiveType as string | undefined) || '';
      const quality: NetworkQualityBucket = !online
        ? 'offline'
        : effective === '4g' ? 'good'
        : effective === '3g' ? 'fair'
        : effective === '2g' || effective === 'slow-2g' ? 'poor'
        : downKbps >= 5000 ? 'excellent'
        : downKbps >= 1500 ? 'good'
        : downKbps >= 400 ? 'fair'
        : downKbps > 0 ? 'poor'
        : 'unknown';
      return {
        online,
        transport: online ? 'unknown' : 'none',
        cellularType: null,
        downstreamKbps: downKbps,
        upstreamKbps: 0,
        metered: !!c?.saveData,
        vpn: false,
        quality,
      };
    },
    async addListener() {
      return { remove: async () => {} } as PluginListenerHandle;
    },
  },
});
