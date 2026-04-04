/**
 * TencentBeautyProcessor — Standalone processor for camera streams
 * 
 * Used by useAgoraClient to intercept camera MediaStreamTrack,
 * apply Tencent Beauty AR effects, and return a processed track.
 * 
 * Web-only. Native Android uses DeepAR via native plugin.
 */
import { supabase } from '@/integrations/supabase/client';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

let _sdkInstance: any = null;
let _sdkScriptLoaded = false;
let _configCache: { appId: string; licenseKey: string } | null = null;
let _initPromise: Promise<any> | null = null;

async function fetchConfig() {
  if (_configCache) return _configCache;
  
  const { data } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['tencent_beauty_app_id', 'tencent_beauty_license_key', 'tencent_beauty_enabled']);

  const map: Record<string, any> = {};
  data?.forEach((r) => (map[r.setting_key] = r.setting_value));

  // Check if beauty is enabled
  if (map.tencent_beauty_enabled === false || map.tencent_beauty_enabled === 'false') {
    console.log('[BeautyProcessor] Tencent Beauty is disabled in admin settings');
    return null;
  }

  if (!map.tencent_beauty_license_key) {
    console.warn('[BeautyProcessor] License key not configured');
    return null;
  }

  _configCache = {
    appId: (map.tencent_beauty_app_id as string) || '1408377570',
    licenseKey: map.tencent_beauty_license_key as string,
  };
  return _configCache;
}

async function loadScript(): Promise<boolean> {
  if (_sdkScriptLoaded) return true;
  if ((window as any).AR?.ArSdk) {
    _sdkScriptLoaded = true;
    return true;
  }

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.charset = 'utf-8';
    script.src = 'https://webar-static.tencent-cloud.com/ar-sdk/resources/latest/webar-sdk.umd.js';
    script.onload = () => {
      _sdkScriptLoaded = true;
      console.log('[BeautyProcessor] SDK script loaded');
      resolve(true);
    };
    script.onerror = () => {
      console.error('[BeautyProcessor] Failed to load SDK script');
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

function createAuthFunc(appId: string) {
  return async () => {
    const { data, error } = await supabase.functions.invoke('tencent-beauty-sign', {
      body: { appId },
    });
    if (error) throw new Error(`Signature failed: ${error.message}`);
    return { signature: data.signature as string, timestamp: data.timestamp as number };
  };
}

/**
 * Process a camera MediaStreamTrack through Tencent Beauty SDK.
 * Returns the processed track, or the original track if beauty is unavailable.
 * 
 * This is a fire-and-forget approach — if beauty fails, the original track is used.
 */
export async function processTrackWithBeauty(
  videoTrack: MediaStreamTrack
): Promise<MediaStreamTrack> {
  // Skip on native Android (uses DeepAR)
  if (isNativeAndroidApp()) {
    console.log('[BeautyProcessor] Skipped — native Android uses DeepAR');
    return videoTrack;
  }

  // Prevent double init
  if (_initPromise) {
    try {
      const result = await _initPromise;
      if (result) return result;
    } catch {
      // Fall through to retry
    }
  }

  _initPromise = (async () => {
    try {
      // Step 1: Fetch config
      const config = await fetchConfig();
      if (!config) {
        console.log('[BeautyProcessor] No config available, using original track');
        return null;
      }

      // Step 2: Load SDK
      const loaded = await loadScript();
      if (!loaded) {
        console.warn('[BeautyProcessor] SDK script failed to load');
        return null;
      }

      const ArSdk = (window as any).AR?.ArSdk;
      if (!ArSdk) {
        console.warn('[BeautyProcessor] ArSdk class not found');
        return null;
      }

      // Step 3: Create input stream from track
      const inputStream = new MediaStream([videoTrack]);

      // Step 4: Initialize SDK
      console.log('[BeautyProcessor] Initializing with appId:', config.appId);
      
      // Destroy previous instance if exists
      if (_sdkInstance) {
        try { _sdkInstance.destroy(); } catch {}
        _sdkInstance = null;
      }

      const ar = new ArSdk({
        module: {
          beautify: true,
          segmentation: false,
        },
        auth: {
          licenseKey: config.licenseKey,
          appId: config.appId,
          authFunc: createAuthFunc(config.appId),
        },
        input: inputStream,
        beautify: {
          whiten: 0.2,
          dermabrasion: 0.4,
          lift: 0.2,
          shave: 0.1,
          eye: 0.15,
          chin: 0.1,
        },
        language: 'en',
      });

      // Wait for ready
      const processedTrack = await new Promise<MediaStreamTrack | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn('[BeautyProcessor] SDK init timed out (10s)');
          resolve(null);
        }, 10000);

        ar.on('created', () => {
          console.log('[BeautyProcessor] SDK created');
        });

        ar.on('ready', async () => {
          clearTimeout(timeout);
          console.log('[BeautyProcessor] SDK ready');
          try {
            const outputStream: MediaStream = await ar.getOutput();
            const outTrack = outputStream.getVideoTracks()[0];
            if (outTrack) {
              _sdkInstance = ar;
              console.log('[BeautyProcessor] ✅ Beauty processing active');
              resolve(outTrack);
            } else {
              console.warn('[BeautyProcessor] No video track in output');
              resolve(null);
            }
          } catch (e) {
            console.warn('[BeautyProcessor] getOutput failed:', e);
            resolve(null);
          }
        });

        ar.on('error', (e: any) => {
          clearTimeout(timeout);
          console.error('[BeautyProcessor] SDK error:', e);
          resolve(null); // Graceful fallback
        });
      });

      return processedTrack;
    } catch (err) {
      console.error('[BeautyProcessor] Init error:', err);
      return null;
    }
  })();

  const result = await _initPromise;
  _initPromise = null;

  if (result) return result;
  return videoTrack; // Fallback to original
}

/**
 * Map UI BeautySettings (0-100 scale) to Tencent SDK parameters (0-1 scale)
 */
export function mapUISettingsToTencentSDK(uiSettings: {
  smoothness?: number;
  whitening?: number;
  faceSlim?: number;
  chinSlim?: number;
  eyeEnlarge?: number;
  noseNarrow?: number;
}): {
  whiten: number;
  dermabrasion: number;
  lift: number;
  shave: number;
  eye: number;
  chin: number;
} {
  return {
    dermabrasion: Math.min(1, (uiSettings.smoothness ?? 0) / 100),
    whiten: Math.min(1, (uiSettings.whitening ?? 0) / 100),
    lift: Math.min(1, (uiSettings.faceSlim ?? 0) / 100),
    shave: Math.min(1, (uiSettings.noseNarrow ?? 0) / 100),
    eye: Math.min(1, (uiSettings.eyeEnlarge ?? 0) / 100),
    chin: Math.min(1, (uiSettings.chinSlim ?? 0) / 100),
  };
}

/**
 * Update beauty settings on the active SDK instance
 */
export function updateBeautySettings(settings: {
  whiten?: number;
  dermabrasion?: number;
  lift?: number;
  shave?: number;
  eye?: number;
  chin?: number;
}) {
  if (!_sdkInstance) return;
  try {
    _sdkInstance.setBeautify(settings);
  } catch (e) {
    console.warn('[BeautyProcessor] Failed to update settings:', e);
  }
}

/**
 * Update beauty from UI settings (0-100 scale) — convenience wrapper
 */
export function updateBeautyFromUI(uiSettings: {
  smoothness?: number;
  whitening?: number;
  faceSlim?: number;
  chinSlim?: number;
  eyeEnlarge?: number;
  noseNarrow?: number;
}) {
  const mapped = mapUISettingsToTencentSDK(uiSettings);
  updateBeautySettings(mapped);
}

/**
 * Destroy the beauty processor
 */
export function destroyBeautyProcessor() {
  if (_sdkInstance) {
    try { _sdkInstance.destroy(); } catch {}
    _sdkInstance = null;
  }
  _initPromise = null;
  console.log('[BeautyProcessor] Destroyed');
}

/**
 * Check if beauty processor is active
 */
export function isBeautyProcessorActive(): boolean {
  return !!_sdkInstance;
}
