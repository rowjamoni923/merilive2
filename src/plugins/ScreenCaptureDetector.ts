import { registerPlugin, Capacitor, PluginListenerHandle } from '@capacitor/core';

export interface ScreenCaptureDetectorPlugin {
  start(): Promise<{ supported: boolean; active?: boolean }>;
  stop(): Promise<void>;
  addListener(
    eventName: 'screenshot-detected',
    listenerFunc: (ev: { at: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const Stub: ScreenCaptureDetectorPlugin = {
  async start() { return { supported: false }; },
  async stop() {},
  async addListener() {
    return { remove: async () => {} } as PluginListenerHandle;
  },
};

export const ScreenCaptureDetector: ScreenCaptureDetectorPlugin =
  Capacitor.isNativePlatform()
    ? registerPlugin<ScreenCaptureDetectorPlugin>('ScreenCaptureDetector')
    : Stub;
