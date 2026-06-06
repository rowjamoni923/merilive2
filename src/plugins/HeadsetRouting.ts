import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface AudioDeviceInfo {
  type:
    | 'bluetooth_sco' | 'bluetooth_a2dp'
    | 'wired_headset' | 'wired_headphones'
    | 'speaker' | 'earpiece' | 'builtin_mic'
    | 'usb_headset' | 'usb_device' | 'hearing_aid'
    | string;
  name: string;
  isSource: boolean;
  isSink: boolean;
}

export interface DevicesChangedEvent {
  added?: AudioDeviceInfo[];
  removed?: AudioDeviceInfo[];
  wiredPlugged?: boolean;
  hasWired: boolean;
  hasBluetooth: boolean;
}

export interface HeadsetRoutingPlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
  listDevices(): Promise<{ devices: AudioDeviceInfo[]; hasWired: boolean; hasBluetooth: boolean }>;
  addListener(
    eventName: 'devicesChanged',
    cb: (e: DevicesChangedEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const HeadsetRouting = registerPlugin<HeadsetRoutingPlugin>('HeadsetRouting', {
  web: () => ({
    start: async () => {},
    stop: async () => {},
    listDevices: async () => ({ devices: [], hasWired: false, hasBluetooth: false }),
    addListener: async () => ({ remove: async () => {} }) as any,
  }),
});
