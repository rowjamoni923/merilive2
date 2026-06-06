import { registerPlugin } from '@capacitor/core';

export interface DeepLinkHandlerPlugin {
  getLastDeepLink(): Promise<{
    url: string | null;
    path?: string;
    query?: string;
    host?: string;
    ref?: string;
    utm_source?: string;
    room_id?: string;
    user_id?: string;
  }>;
  clearDeepLink(): Promise<void>;
}

const DeepLinkHandler = registerPlugin<DeepLinkHandlerPlugin>('DeepLinkHandler');

export default DeepLinkHandler;