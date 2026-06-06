import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface DeepLinkPayload {
  url: string | null;
  scheme?: string;
  host?: string;
  path?: string;
  query?: string;
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  room_id?: string;
  user_id?: string;
  reel_id?: string;
  party_id?: string;
}

export interface DeepLinkHandlerPlugin {
  getLastDeepLink(): Promise<DeepLinkPayload>;
  clearDeepLink(): Promise<void>;
  /** Fires on warm-start when a new intent with a Uri arrives. */
  addListener(
    eventName: 'deepLinkOpened',
    listenerFunc: (data: DeepLinkPayload) => void,
  ): Promise<PluginListenerHandle>;
}

const DeepLinkHandler = registerPlugin<DeepLinkHandlerPlugin>('DeepLinkHandler');

export default DeepLinkHandler;
