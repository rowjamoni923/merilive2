/**
 * Native Permissions Handler
 * All permissions are handled natively within the app - NO external browser
 */

import { registerPlugin } from '@capacitor/core';
import { isNativeApp as detectNativeApp } from '@/utils/nativeUtils';

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
}

const MeriPermissions = registerPlugin<MeriPermissionsPlugin>('MeriPermissions');

/** Per-permission "can the system dialog still be shown?" flags. */
export const canRequestAgain = async (): Promise<MeriPermissionsStatus> => {
  if (!isNativeApp()) {
    return { camera: true, microphone: true, location: true, notifications: true };
  }
  try {
    return await MeriPermissions.canRequestAgain();
  } catch {
    return { camera: true, microphone: true, location: true, notifications: true };
  }
};

export const isNativeApp = (): boolean => {
  return detectNativeApp();
};

// =====================================================
// CAMERA PERMISSION - Native dialog, no browser
// =====================================================
export const requestCameraPermission = async (): Promise<boolean> => {
  if (isNativeApp()) {
    try {
      const permission = await MeriPermissions.requestCamera();
      return permission.camera;
    } catch (error) {
      console.error('Native camera permission error:', error);
      return false;
    }
  }
  
  // Web fallback - uses browser's native permission dialog
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch {
    return false;
  }
};

// =====================================================
// MICROPHONE PERMISSION - Native dialog, no browser
// =====================================================
export const requestMicrophonePermission = async (): Promise<boolean> => {
  if (isNativeApp()) {
    try {
      const permission = await MeriPermissions.requestMicrophone();
      return permission.microphone;
    } catch (error) {
      console.error('Native microphone permission error:', error);
      return false;
    }
  }
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch {
    return false;
  }
};

// =====================================================
// LOCATION PERMISSION - Native dialog, no browser
// =====================================================
export const requestLocationPermission = async (): Promise<boolean> => {
  if (isNativeApp()) {
    try {
      const permission = await MeriPermissions.requestLocation();
      return permission.location;
    } catch (error) {
      console.error('Native location permission error:', error);
      return false;
    }
  }
  
  // Web fallback
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { timeout: 5000 }
    );
  });
};

// =====================================================
// NOTIFICATION PERMISSION - Native dialog, no browser
// =====================================================
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (isNativeApp()) {
    try {
      const permission = await MeriPermissions.requestNotifications();
      return permission.notifications;
    } catch (error) {
      console.error('Native notification permission error:', error);
      return false;
    }
  }
  
  // Web fallback
  if ('Notification' in window) {
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
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
    camera: false,
    microphone: false,
    location: false,
    notifications: false,
  };

  if (isNativeApp()) {
    try {
      return await MeriPermissions.checkAllPermissions();
    } catch (error) {
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
  console.log('📱 Requesting all native permissions...');
  if (isNativeApp()) {
    try {
      const permissions = await MeriPermissions.requestAll();
      if (permissions.notifications) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.register().catch(() => undefined);
      }
      return permissions;
    } catch (error) {
      console.error('Native permission request-all error:', error);
    }
  }
  
  const [camera, microphone, location, notifications] = await Promise.all([
    requestCameraPermission(),
    requestMicrophonePermission(),
    requestLocationPermission(),
    requestNotificationPermission(),
  ]);

  console.log('✅ Permissions result:', { camera, microphone, location, notifications });
  
  return { camera, microphone, location, notifications };
};

export const openNativeAppPermissionSettings = async (): Promise<void> => {
  if (!isNativeApp()) return;
  await MeriPermissions.openAppSettings();
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
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
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
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
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
