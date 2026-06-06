import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface PipModeChangedEvent { isInPip: boolean }

export interface PictureInPicturePlugin {
  isSupported(): Promise<{ supported: boolean }>;
  enter(opts?: { aspectX?: number; aspectY?: number }): Promise<{ entered: boolean; reason?: string }>;
  setParams(opts: { aspectX: number; aspectY: number }): Promise<void>;
  addListener(
    eventName: 'pipModeChanged',
    cb: (e: PipModeChangedEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const PictureInPicture = registerPlugin<PictureInPicturePlugin>('PictureInPicture', {
  web: () => ({
    isSupported: async () => ({ supported: false }),
    enter: async () => ({ entered: false, reason: 'web_unsupported' }),
    setParams: async () => {},
    addListener: async () => ({ remove: async () => {} }) as any,
  }),
});
