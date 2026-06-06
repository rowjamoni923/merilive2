/**
 * Pkg433 — NativeFeed JS bridge.
 *
 * Capacitor wrapper for the Android `NativeFeed` RecyclerView grid overlay.
 * Used to render 2-col home/discover host-card feeds at 60-90fps with Glide
 * cached thumbnails (sharing Pkg428's image pipeline).
 *
 * Default OFF — Existing Index.tsx / Discover.tsx React grids remain
 * canonical on web, iOS, older APKs, and gated-off Android cohort.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeFeedCard {
  id: string;
  title: string;
  subtitle?: string;
  thumbUrl?: string | null;
  liveBadge?: boolean;
  country?: string | null;
}

export interface NativeFeedPlugin {
  open(opts: { title?: string }): Promise<void>;
  close(): Promise<void>;
  setItems(opts: { items: NativeFeedCard[] }): Promise<void>;
  appendItems(opts: { items: NativeFeedCard[] }): Promise<void>;
  clear(): Promise<void>;
  addListener(
    eventName: 'feed:tap' | 'feed:loadMore',
    listenerFunc: (data: unknown) => void
  ): Promise<PluginListenerHandle>;
}

const noop: NativeFeedPlugin = {
  open: async () => {},
  close: async () => {},
  setItems: async () => {},
  appendItems: async () => {},
  clear: async () => {},
  addListener: async () => ({ remove: async () => {} }) as PluginListenerHandle,
};

const impl: NativeFeedPlugin =
  Capacitor.getPlatform() === 'android'
    ? registerPlugin<NativeFeedPlugin>('NativeFeed', { web: noop })
    : noop;

export const NativeFeed = impl;

export function isNativeFeedAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();
}
