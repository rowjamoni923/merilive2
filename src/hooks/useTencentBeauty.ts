/**
 * useTencentBeauty — Tencent RTC Beauty AR Web SDK Hook
 * 
 * SEPARATE from existing camera system. Does NOT modify:
 * - useNativeCameraPermission.ts
 * - useDeepARBeauty.ts / useDeepAR.ts
 * - useLiveKitClient.ts / useLiveKitCall.ts / usePartyRoomWebRTC.ts
 * 
 * This hooks into the existing camera MediaStream and applies
 * beauty effects, returning a processed stream for LiveKit publishing.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

export interface TencentBeautySettings {
  whiten: number;       // 0-1 brightening
  dermabrasion: number; // 0-1 smooth skin
  lift: number;         // 0-1 slim face
  shave: number;        // 0-1 V shape
  eye: number;          // 0-1 big eyes
  chin: number;         // 0-1 chin
}

const DEFAULT_SETTINGS: TencentBeautySettings = {
  whiten: 0.2,
  dermabrasion: 0.4,
  lift: 0.2,
  shave: 0.1,
  eye: 0.15,
  chin: 0.1,
};

// Cache for fetched config
let cachedConfig: { appId: string; licenseKey: string } | null = null;

async function fetchTencentConfig() {
  if (cachedConfig) return cachedConfig;

  const { data } = await supabase
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['tencent_beauty_app_id', 'tencent_beauty_license_key']);

  const map: Record<string, string> = {};
  data?.forEach((r) => (map[r.setting_key] = r.setting_value as string));

  cachedConfig = {
    appId: map.tencent_beauty_app_id || '1408377570',
    licenseKey: map.tencent_beauty_license_key || '',
  };
  return cachedConfig;
}

export function useTencentBeauty() {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [beautyEnabled, setBeautyEnabled] = useState(true);
  const [settings, setSettings] = useState<TencentBeautySettings>({ ...DEFAULT_SETTINGS });
  const [outputStream, setOutputStream] = useState<MediaStream | null>(null);

  const arSdkRef = useRef<any>(null);
  const initInFlightRef = useRef(false);
  const sdkScriptLoadedRef = useRef(false);

  const isAvailable = !isNativeAndroidApp();

  // Load SDK script dynamically
  const loadSDKScript = useCallback(async (): Promise<boolean> => {
    if (sdkScriptLoadedRef.current) return true;
    
    // Check if already loaded via npm or CDN
    if ((window as any).AR?.ArSdk) {
      sdkScriptLoadedRef.current = true;
      return true;
    }

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.charset = 'utf-8';
      script.src = 'https://webar-static.tencent-cloud.com/ar-sdk/resources/latest/webar-sdk.umd.js';
      script.onload = () => {
        sdkScriptLoadedRef.current = true;
        console.log('[TencentBeauty] SDK script loaded');
        resolve(true);
      };
      script.onerror = () => {
        console.error('[TencentBeauty] Failed to load SDK script');
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }, []);

  // authFunc for SDK — must return { signature, timestamp }
  const createAuthFunc = useCallback((appId: string) => {
    return async () => {
      const { data, error } = await supabase.functions.invoke('tencent-beauty-sign', {
        body: { appId },
      });

      if (error) {
        throw new Error(`Signature failed: ${error.message}`);
      }

      return {
        signature: data.signature as string,
        timestamp: data.timestamp as number,
      };
    };
  }, []);

  /**
   * Initialize Tencent Beauty AR with an input MediaStream
   * Call this AFTER getting camera stream from getUserMedia
   */
  const initialize = useCallback(async (inputStream: MediaStream): Promise<MediaStream | null> => {
    if (!isAvailable) {
      console.log('[TencentBeauty] Skipped — native Android uses DeepAR');
      return null;
    }

    if (initInFlightRef.current) return null;
    if (arSdkRef.current) {
      try {
        arSdkRef.current.updateInputStream(inputStream);
        const output = await arSdkRef.current.getOutput();
        setOutputStream(output);
        return output;
      } catch {
        // Fall through to re-initialize
      }
    }

    initInFlightRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Fetch config from DB
      const tencentConfig = await fetchTencentConfig();
      if (!tencentConfig.licenseKey) {
        throw new Error('Tencent Beauty License Key not configured. Set it in Admin → App Settings → Beauty SDK');
      }

      // Step 2: Load SDK script
      const loaded = await loadSDKScript();
      if (!loaded) throw new Error('Failed to load Tencent Beauty SDK script');

      const ArSdk = (window as any).AR?.ArSdk;
      if (!ArSdk) throw new Error('AR SDK class not found after script load');

      // Step 3: Create SDK instance with correct config per Tencent docs
      const config = {
        module: {
          beautify: true,
          segmentation: false,
        },
        auth: {
          licenseKey: tencentConfig.licenseKey,
          appId: tencentConfig.appId,
          authFunc: createAuthFunc(tencentConfig.appId),
        },
        input: inputStream,
        beautify: beautyEnabled ? {
          whiten: settings.whiten,
          dermabrasion: settings.dermabrasion,
          lift: settings.lift,
          shave: settings.shave,
          eye: settings.eye,
          chin: settings.chin,
        } : undefined,
        language: 'en',
      };

      console.log('[TencentBeauty] Initializing SDK with appId:', tencentConfig.appId);
      const ar = new ArSdk(config);
      arSdkRef.current = ar;

      // Wait for ready event
      const output = await new Promise<MediaStream>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tencent Beauty SDK initialization timed out (15s)'));
        }, 15000);

        ar.on('created', () => {
          console.log('[TencentBeauty] SDK created event');
        });

        ar.on('ready', async () => {
          clearTimeout(timeout);
          console.log('[TencentBeauty] SDK ready event');
          try {
            const arStream = await ar.getOutput();
            resolve(arStream);
          } catch (e) {
            reject(e);
          }
        });

        ar.on('error', (e: any) => {
          clearTimeout(timeout);
          console.error('[TencentBeauty] SDK error event:', e);
          reject(new Error(String(e?.message || e || 'SDK error')));
        });
      });

      setOutputStream(output);
      setIsReady(true);
      console.log('[TencentBeauty] ✅ Initialized successfully');
      return output;
    } catch (err: any) {
      const msg = String(err?.message || err || 'Unknown error');
      console.error('[TencentBeauty] ❌ Init failed:', msg);
      setError(msg);
      arSdkRef.current = null;
      return null;
    } finally {
      initInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [isAvailable, loadSDKScript, createAuthFunc, beautyEnabled, settings]);

  // Update beauty settings
  const updateBeauty = useCallback((newSettings: Partial<TencentBeautySettings>) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);

    if (arSdkRef.current && beautyEnabled) {
      try {
        arSdkRef.current.setBeautify({
          whiten: merged.whiten,
          dermabrasion: merged.dermabrasion,
          lift: merged.lift,
          shave: merged.shave,
          eye: merged.eye,
          chin: merged.chin,
        });
      } catch (e) {
        console.warn('[TencentBeauty] Failed to update beauty:', e);
      }
    }
  }, [settings, beautyEnabled]);

  // Toggle beauty on/off
  const toggleBeauty = useCallback((enabled: boolean) => {
    setBeautyEnabled(enabled);

    if (arSdkRef.current) {
      try {
        if (enabled) {
          arSdkRef.current.setBeautify({
            whiten: settings.whiten,
            dermabrasion: settings.dermabrasion,
            lift: settings.lift,
            shave: settings.shave,
            eye: settings.eye,
            chin: settings.chin,
          });
        } else {
          arSdkRef.current.setBeautify({
            whiten: 0,
            dermabrasion: 0,
            lift: 0,
            shave: 0,
            eye: 0,
            chin: 0,
          });
        }
      } catch (e) {
        console.warn('[TencentBeauty] Failed to toggle beauty:', e);
      }
    }
  }, [settings]);

  // Apply effect/sticker
  const setEffect = useCallback((effectId: string, intensity: number = 1) => {
    if (!arSdkRef.current) return;
    try {
      arSdkRef.current.setEffect([{ id: effectId, intensity }]);
    } catch (e) {
      console.warn('[TencentBeauty] Failed to set effect:', e);
    }
  }, []);

  // Apply filter
  const setFilter = useCallback((filterId: string, strength: number = 1) => {
    if (!arSdkRef.current) return;
    try {
      arSdkRef.current.setFilter(filterId, strength);
    } catch (e) {
      console.warn('[TencentBeauty] Failed to set filter:', e);
    }
  }, []);

  // Get available effects
  const getEffectList = useCallback(async () => {
    if (!arSdkRef.current) return [];
    try {
      const res = await arSdkRef.current.getEffectList({ Type: 'Preset' });
      return res.map((item: any) => ({
        name: item.Name,
        id: item.EffectId,
        cover: item.CoverUrl,
        url: item.Url,
        label: item.Label,
        type: item.PresetType,
      }));
    } catch (e) {
      console.warn('[TencentBeauty] Failed to get effects:', e);
      return [];
    }
  }, []);

  // Get available filters
  const getFilterList = useCallback(async () => {
    if (!arSdkRef.current) return [];
    try {
      const res = await arSdkRef.current.getCommonFilter();
      return res.map((item: any) => ({
        name: item.Name,
        id: item.EffectId,
        cover: item.CoverUrl,
        url: item.Url,
        label: item.Label,
      }));
    } catch (e) {
      console.warn('[TencentBeauty] Failed to get filters:', e);
      return [];
    }
  }, []);

  // Cleanup
  const destroy = useCallback(() => {
    if (arSdkRef.current) {
      try {
        arSdkRef.current.destroy();
      } catch { /* ignore */ }
      arSdkRef.current = null;
    }
    setIsReady(false);
    setOutputStream(null);
    console.log('[TencentBeauty] Destroyed');
  }, []);

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      destroy();
    };
  }, [destroy]);

  return {
    // State
    isAvailable,
    isReady,
    isLoading,
    error,
    beautyEnabled,
    settings,
    outputStream,

    // Actions
    initialize,
    updateBeauty,
    toggleBeauty,
    setEffect,
    setFilter,
    getEffectList,
    getFilterList,
    destroy,
  };
}
