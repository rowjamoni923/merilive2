import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

export interface NativeRouterTab {
  id: string;
  label: string;
  badge?: number;
}

export interface NativeRouterShellPlugin {
  open(options: { title: string; tabs: NativeRouterTab[]; activeTabId?: string }): Promise<void>;
  close(): Promise<void>;
  setTitle(options: { title: string }): Promise<void>;
  setActiveTab(options: { tabId: string }): Promise<void>;
  setBadge(options: { tabId: string; count: number }): Promise<void>;
  setTabs(options: { tabs: NativeRouterTab[] }): Promise<void>;
  addListener(
    eventName: 'router:tab',
    listenerFunc: (data: { tabId: string }) => void
  ): Promise<PluginListenerHandle>;
}

const noop: NativeRouterShellPlugin = {
  open: async () => {},
  close: async () => {},
  setTitle: async () => {},
  setActiveTab: async () => {},
  setBadge: async () => {},
  setTabs: async () => {},
  addListener: async () => ({ remove: async () => {} }) as PluginListenerHandle,
};

export const NativeRouterShell: NativeRouterShellPlugin =
  Capacitor.getPlatform() === 'android'
    ? registerPlugin<NativeRouterShellPlugin>('NativeRouterShell')
    : noop;

export const isNativeRouterShellAvailable = (): boolean =>
  Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('NativeRouterShell');
