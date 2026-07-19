import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NfcPlugin {
  checkAvailable(): Promise<{ available: boolean; enabled: boolean }>;
  openSettings(): Promise<void>;
  startRead(): Promise<void>;
  stopRead(): Promise<void>;
  writeTag(options: { uri?: string; text?: string }): Promise<void>;
  cancelWrite(): Promise<void>;
  pushUri(options: { uri: string }): Promise<void>;
  stopPush(): Promise<void>;

  addListener(
    eventName: 'nfcTagRead',
    listener: (data: {
      uri?: string;
      text?: string;
      id?: string;
      techs?: string;
      error?: string;
      empty?: boolean;
    }) => void
  ): Promise<{ remove: () => void }>;

  addListener(
  ): Promise<{ remove: () => void }>;
}

const Nfc = registerPlugin<NfcPlugin>('Nfc', {
  web: () => ({
    async checkAvailable() {
      return { available: false, enabled: false };
    },
    async openSettings() {
      console.warn('[Nfc] openSettings not supported on web');
    },
    async startRead() {
      console.warn('[Nfc] startRead not supported on web');
    },
    async stopRead() {
      console.warn('[Nfc] stopRead not supported on web');
    },
    async writeTag() {
      console.warn('[Nfc] writeTag not supported on web');
    },
    async cancelWrite() {
      console.warn('[Nfc] cancelWrite not supported on web');
    },
    async pushUri() {
      console.warn('[Nfc] pushUri not supported on web');
    },
    async stopPush() {
      console.warn('[Nfc] stopPush not supported on web');
    },
    async addListener() {
      return { remove: () => {} };
    },
  }),
});

export default Nfc;

// ---- helpers ----

let tagReadListener: { remove: () => void } | null = null;
let writeResultListener: { remove: () => void } | null = null;

/** Check if NFC hardware exists and is enabled. */
export async function isNfcAvailable(): Promise<boolean> {
  const res = await Nfc.checkAvailable();
  return res.available && res.enabled;
}

/** Start listening for NFC tag reads. Emits 'nfcTagRead' event. */
export async function startNfcRead() {
  if (!Capacitor.isNativePlatform()) return;
  await Nfc.startRead();
  tagReadListener = await Nfc.addListener('nfcTagRead', (data) => {
    // If the tag contains a merilive URI, we can auto-navigate
    if (data.uri) {
      try {
        const url = new URL(data.uri);
        // Let the app handle deep-link navigation
        window.dispatchEvent(new CustomEvent('nfc-uri-detected', { detail: data.uri }));
      } catch {
        // Not a valid URL, ignore
      }
    }
  });
}

/** Stop listening for NFC tag reads. */
export async function stopNfcRead() {
  if (tagReadListener) {
    tagReadListener.remove();
    tagReadListener = null;
  }
  await Nfc.stopRead();
}

/** Write an NDEF URI or text record to the next tapped tag. */
export async function writeNfcTag(options: { uri?: string; text?: string }) {
  if (!Capacitor.isNativePlatform()) return;
  await Nfc.writeTag(options);
  writeResultListener = await Nfc.addListener('nfcWriteResult', (data) => {
    // Auto-cleanup listeners on write completion
    if (writeResultListener) {
      writeResultListener.remove();
      writeResultListener = null;
    }
  });
}

/** Cancel a pending write operation. */
export async function cancelNfcWrite() {
  if (writeResultListener) {
    writeResultListener.remove();
    writeResultListener = null;
  }
  await Nfc.cancelWrite();
}

/** Set an NDEF URI for peer-to-peer sharing (Android Beam). Removed on Android 14+. */
export async function shareUriViaNfc(uri: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Nfc.pushUri({ uri });
  } catch (e: any) {
    // Android 14+ will reject; fall back silently
    if (e.message?.includes('NOT_SUPPORTED_ON_ANDROID_14_PLUS')) {
      console.log('[Nfc] Beam not available on this Android version');
    } else {
      throw e;
    }
  }
}

/** Stop peer-to-peer sharing. */
export async function stopNfcShare() {
  await Nfc.stopPush();
}
