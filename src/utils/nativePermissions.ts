/**
 * Native Permissions Handler
 * All permissions are handled natively within the app - NO external browser
 */

import { registerPlugin } from '@capacitor/core';
import { isNativeApp as detectNativeApp } from '@/utils/nativeUtils';
import { permLog } from '@/utils/permissionDebugLog';

interface MeriPermissionsStatus {
  camera: boolean;
  microphone: boolean;
  location: boolean;
  notifications: boolean;
}

interface MeriPermissionsPlugin {
  checkAllPermissions(): Promise<MeriPermissionsStatus>;
  requestCamera(): Promise<MeriPermissionsStatus>;
  requestMicrophone(): Promise<MeriPermissionsStatus>;
  requestLocation(): Promise<MeriPermissionsStatus>;
  requestNotifications(): Promise<MeriPermissionsStatus>;
  requestAll(): Promise<MeriPermissionsStatus>;
  openAppSettings(): Promise<void>;
  /** Whether the system will still show its native permission dialog
   *  for each alias (false = permanently denied; only Settings can fix). */
  canRequestAgain(): Promise<MeriPermissionsStatus>;
  /** Pkg205 — battery optimization whitelist (WhatsApp/Bigo screen-off parity). */
  isBatteryOptimizationIgnored(): Promise<{ whitelisted: boolean; supported: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<{ launched?: boolean; whitelisted?: boolean; supported?: boolean }>;
}

const MeriPermissions = registerPlugin<MeriPermissionsPlugin>('MeriPermissions');

/** Per-permission "can the system dialog still be shown?" flags. */
export const canRequestAgain = async (): Promise<MeriPermissionsStatus> => {
  permLog('canRequest.start', { native: isNativeApp() });
  if (!isNativeApp()) {
    const fallback = { camera: true, microphone: true, location: true, notifications: true };
    permLog('canRequest.result', { ...fallback, source: 'web-fallback' });
    return fallback;
  }
  try {
    const r = await MeriPermissions.canRequestAgain();
    permLog('canRequest.result', { ...r, source: 'native' });
    return r;
  } catch (err) {
    const fallback = { camera: true, microphone: true, location: true, notifications: true };
    permLog('canRequest.result', { ...fallback, source: 'native-error', error: String(err) });
    return fallback;
  }
};

export const isNativeApp = (): boolean => {
  return detectNativeApp();
};

// =====================================================
// CAMERA PERMISSION - Native dialog, no browser
// =====================================================
export const requestCameraPermission = async (): Promise<boolean> => {
  permLog('requestCamera.start', { native: isNativeApp() });
  if (isNativeApp()) {
    try {
      const permission = await MeriPermissions.requestCamera();
      permLog('requestCamera.result', { granted: permission.camera, all: permission });
      return permission.camera;
    } catch (error) {
      permLog('requestCamera.error', { error: String(error) });
      console.error('Native camera permission error:', error);
      return false;
    }
  }

  // Web fallback - uses browser's native permission dialog
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    permLog('requestCamera.result', { granted: true, source: 'web' });
    return true;
  } catch (e) {
    permLog('requestCamera.result', { granted: false, source: 'web', error: String(e) });
    return false;
  }
};

// =====================================================
// MICROPHONE PERMISSION - Native dialog, no browser
// =====================================================
export const requestMicrophonePermission = async (): Promise<boolean> => {
  permLog('requestMic.start', { native: isNativeApp() });
  if (isNativeApp()) {
    try {
      const permission = await MeriPermissions.requestMicrophone();
      permLog('requestMic.result', { granted: permission.microphone, all: permission });
      return permission.microphone;
    } catch (error) {
      permLog('requestMic.error', { error: String(error) });
      console.error('Native microphone permission error:', error);
      return false;
    }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    permLog('requestMic.result', { granted: true, source: 'web' });
    return true;
  } catch (e) {
    permLog('requestMic.result', { granted: false, source: 'web', error: String(e) });
    return false;
  }
};

// =====================================================
// LOCATION PERMISSION - Native dialog, no browser
// =====================================================
export const requestLocationPermission = async (): Promise<boolean> => {
  permLog('requestLocation.start', { native: isNativeApp() });
  if (isNativeApp()) {
    try {
      const permission = await MeriPermissions.requestLocation();
      permLog('requestLocation.result', { granted: permission.location, all: permission });
      return permission.location;
    } catch (error) {
      permLog('requestLocation.error', { error: String(error) });
      console.error('Native location permission error:', error);
      return false;
    }
  }
  
  // Web fallback
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => { permLog('requestLocation.result', { granted: true, source: 'web' }); resolve(true); },
      (e) => { permLog('requestLocation.result', { granted: false, source: 'web', error: String(e?.message || e) }); resolve(false); },
      { timeout: 5000 }
    );
  });
};

// =====================================================
// NOTIFICATION PERMISSION - Native dialog, no browser
// =====================================================
export const requestNotificationPermission = async (): Promise<boolean> => {
  permLog('requestNotif.start', { native: isNativeApp() });
  if (isNativeApp()) {
    try {
      const permission = await MeriPermissions.requestNotifications();
      permLog('requestNotif.result', { granted: permission.notifications, all: permission });
      return permission.notifications;
    } catch (error) {
      permLog('requestNotif.error', { error: String(error) });
      console.error('Native notification permission error:', error);
      return false;
    }
  }
  
  // Web fallback
  if ('Notification' in window) {
    const result = await Notification.requestPermission();
    permLog('requestNotif.result', { granted: result === 'granted', source: 'web', state: result });
    return result === 'granted';
  }
  permLog('requestNotif.result', { granted: false, source: 'web', reason: 'unsupported' });
  return false;
};

// =====================================================
// CHECK ALL PERMISSIONS STATUS
// =====================================================
export const checkPermissionStatus = async (): Promise<{
  camera: boolean;
  microphone: boolean;
  location: boolean;
  notifications: boolean;
}> => {
  const status = {
  };

  permLog('check.start', { native: isNativeApp() });

  if (isNativeApp()) {
    try {
      const r = await MeriPermissions.checkAllPermissions();
      permLog('check.result', { ...r, source: 'native' });
      return r;
    } catch (error) {
      permLog('check.result', { ...status, source: 'native-error', error: String(error) });
      console.error('Error checking permissions:', error);
    }
  } else {
    // Web fallback
    try {
      const camResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
      status.camera = camResult.state === 'granted';
    } catch { /* ignore */ }
    
    try {
      const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      status.microphone = micResult.state === 'granted';
    } catch { /* ignore */ }
    
    try {
      const locResult = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      status.location = locResult.state === 'granted';
    } catch { /* ignore */ }
    
    status.notifications = 'Notification' in window && Notification.permission === 'granted';
    permLog('check.result', { ...status, source: 'web' });
  }

  return status;
};

// =====================================================
// REQUEST ALL PERMISSIONS AT ONCE
// =====================================================
export const requestAllPermissions = async (): Promise<{
  camera: boolean;
  microphone: boolean;
  location: boolean;
  notifications: boolean;
}> => {
  permLog('requestAll.start', { native: isNativeApp() });
  console.log('📱 Requesting all native permissions...');
  if (isNativeApp()) {
    try {
      const permissions = await MeriPermissions.requestAll();
      permLog('requestAll.result', { ...permissions, source: 'native' });
      if (permissions.notifications) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.register().catch(() => undefined);
      }
      return permissions;
    } catch (error) {
      permLog('requestAll.error', { error: String(error) });
      console.error('Native permission request-all error:', error);
    }
  }
  
  const [camera, microphone, location, notifications] = await Promise.all([
    requestCameraPermission(),
    requestMicrophonePermission(),
    requestLocationPermission(),
    requestNotificationPermission(),
  ]);

  permLog('requestAll.result', { camera, microphone, location, notifications, source: 'web' });
  console.log('✅ Permissions result:', { camera, microphone, location, notifications });
  
  return { camera, microphone, location, notifications };
};

export const openNativeAppPermissionSettings = async (): Promise<void> => {
  permLog('openSettings.invoke', { native: isNativeApp() });
  if (!isNativeApp()) return;
  await MeriPermissions.openAppSettings();
};

// =====================================================
// Pkg205 — BATTERY OPTIMIZATION WHITELIST
// Prevents Xiaomi/Oppo/Vivo/Samsung from killing FCM listener after ~30min
// idle. Required for WhatsApp/Bigo-grade screen-off DM/call delivery.
// =====================================================
const BATTERY_PROMPT_STORAGE_KEY = 'merilive_battery_prompt_shown_v1';

export const isBatteryOptimizationIgnored = async (): Promise<boolean> => {
  if (!isNativeApp()) return true;
  try {
    const r = await MeriPermissions.isBatteryOptimizationIgnored();
    return !!r.whitelisted;
  } catch {
    return false;
  }
};

export const requestBatteryOptimizationWhitelist = async (): Promise<void> => {
  if (!isNativeApp()) return;
  try {
    await MeriPermissions.requestIgnoreBatteryOptimizations();
  } catch (err) {
    console.warn('[Pkg205] requestIgnoreBatteryOptimizations failed:', err);
  }
};

/**
 * One-time prompt: if not already whitelisted AND we haven't asked before,
 * open the system dialog. Safe to call repeatedly — gated by localStorage.
 * Call after app is mounted and the user has seen the home screen at least once.
 */
export const ensureBatteryOptimizationWhitelistOnce = async (): Promise<void> => {
  if (!isNativeApp()) return;
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(BATTERY_PROMPT_STORAGE_KEY) === '1') return;
    const ok = await isBatteryOptimizationIgnored();
    if (ok) {
      window.localStorage.setItem(BATTERY_PROMPT_STORAGE_KEY, '1');
      return;
    }
    await requestBatteryOptimizationWhitelist();
    window.localStorage.setItem(BATTERY_PROMPT_STORAGE_KEY, '1');
  } catch (err) {
    console.warn('[Pkg205] ensureBatteryOptimizationWhitelistOnce failed:', err);
  }
};

// =====================================================
// GET CURRENT LOCATION - Native GPS
// =====================================================
export const getCurrentLocation = async (): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
} | null> => {
  if (isNativeApp()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return {
      };
    } catch (error) {
      console.error('Native location error:', error);
      return null;
    }
  }
  
  // Web fallback
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
};

// =====================================================
// NATIVE CAMERA ACCESS FOR PHOTOS
// =====================================================
export const takePhotoNative = async (): Promise<string | null> => {
  if (isNativeApp()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        promptLabelHeader: 'Take Photo',
        promptLabelPhoto: 'From Gallery',
        promptLabelPicture: 'Take Picture',
      });
      return image.base64String ? `data:image/jpeg;base64,${image.base64String}` : null;
    } catch (error) {
      console.error('Native camera error:', error);
      return null;
    }
  }
  return null;
};

// =====================================================
// PICK PHOTO FROM GALLERY
// =====================================================
export const pickPhotoNative = async (): Promise<string | null> => {
  if (isNativeApp()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos,
      });
      return image.base64String ? `data:image/jpeg;base64,${image.base64String}` : null;
    } catch (error) {
      console.error('Native gallery error:', error);
      return null;
    }
  }
  return null;
};
