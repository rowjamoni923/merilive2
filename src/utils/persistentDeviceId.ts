 /**
  * Persistent Device ID Utility
  * 
  * This utility provides a truly persistent device identifier that survives
  * app uninstalls on Android/iOS. It uses Capacitor's Device plugin to get
  * the native device UUID which is hardware-based and permanent.
  * 
  * CRITICAL FOR: Account recovery after app reinstall
  */
 
 import { Device } from '@capacitor/device';
 import { Capacitor } from '@capacitor/core';
 
 // Cache the device ID to avoid repeated native calls
 let cachedDeviceId: string | null = null;
 
// Check if this is a web preview environment and force a specific device ID for testing
const FORCE_TEST_DEVICE_ID = localStorage.getItem('meri_force_device_id');

 /**
  * Generate a deterministic device ID from hardware UUID
  * Uses the FULL hardware UUID to ensure uniqueness and recoverability
  */
 const formatDeviceId = (uuid: string): string => {
   // Use FULL UUID without dashes, prefixed with device_
   // This ensures the same hardware always produces the same device_id
   const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
   return `device_${cleanUuid}`;
 };
 
 /**
  * Get persistent device ID
  * 
  * On native platforms (Android/iOS): Uses the hardware device UUID with device_ prefix
  * On web: Uses stored ID or generates new one
  * 
  * IMPORTANT: Format is always device_XXXX to match existing database records
  */
 export const getPersistentDeviceId = async (): Promise<string> => {
  // Check for forced device ID (for testing existing accounts in preview)
  const forcedId = localStorage.getItem('meri_force_device_id');
  if (forcedId && forcedId.startsWith('device_')) {
    cachedDeviceId = forcedId;
    // Also sync to meri_device_id
    localStorage.setItem('meri_device_id', forcedId);
    console.log('[PersistentDeviceId] Using FORCED device ID:', forcedId);
    return forcedId;
  }

   // Return cached value if available
   if (cachedDeviceId) {
     return cachedDeviceId;
   }
   
   try {
     if (Capacitor.isNativePlatform()) {
       // Native platform - get real device UUID
       const deviceId = await Device.getId();
       // Use FULL hardware UUID - this survives reinstalls!
       cachedDeviceId = formatDeviceId(deviceId.identifier);
       console.log('[PersistentDeviceId] Native device ID obtained:', cachedDeviceId);
       
       // Also save to localStorage for consistency
       try {
         localStorage.setItem('meri_device_id', cachedDeviceId);
         localStorage.setItem('meri_persistent_device_id', cachedDeviceId);
       } catch (e) {
         // Ignore storage errors
       }
       
       return cachedDeviceId;
     }
   } catch (error) {
     console.warn('[PersistentDeviceId] Native ID failed, using fallback:', error);
   }
   
   // Web fallback - MUST use stored ID if available (critical for recovery)
   const storedMeriDeviceId = localStorage.getItem('meri_device_id');
   if (storedMeriDeviceId && storedMeriDeviceId.startsWith('device_')) {
     cachedDeviceId = storedMeriDeviceId;
     console.log('[PersistentDeviceId] Using stored meri_device_id:', cachedDeviceId);
     return cachedDeviceId;
   }
   
   const storedId = localStorage.getItem('meri_persistent_device_id');
   if (storedId && storedId.startsWith('device_')) {
     cachedDeviceId = storedId;
     // Sync to meri_device_id
     localStorage.setItem('meri_device_id', cachedDeviceId);
     return cachedDeviceId;
   }
   
   // Generate new device ID for web (random, but stored persistently)
   const randomPart = Math.random().toString(36).substring(2, 15);
   cachedDeviceId = `device_${randomPart}`;
   
   // Store it for consistency
   try {
     localStorage.setItem('meri_persistent_device_id', cachedDeviceId);
     localStorage.setItem('meri_device_id', cachedDeviceId);
   } catch (e) {
     console.warn('[PersistentDeviceId] Failed to store in localStorage');
   }
   
   console.log('[PersistentDeviceId] Generated new device ID:', cachedDeviceId);
   return cachedDeviceId;
 };
 
 /**
  * Get device ID synchronously (returns cached value or generates web fallback)
  * Use this when you can't use async/await
  */
 export const getDeviceIdSync = (): string => {
  // Check for forced device ID first
  const forcedId = localStorage.getItem('meri_force_device_id');
  if (forcedId && forcedId.startsWith('device_')) {
    cachedDeviceId = forcedId;
    localStorage.setItem('meri_device_id', forcedId);
    return forcedId;
  }

   if (cachedDeviceId) {
     return cachedDeviceId;
   }
   
   // Check meri_device_id first (highest priority)
   const meriDeviceId = localStorage.getItem('meri_device_id');
   if (meriDeviceId && meriDeviceId.startsWith('device_')) {
     cachedDeviceId = meriDeviceId;
     return cachedDeviceId;
   }
   
   // Check persistent device id
   const storedId = localStorage.getItem('meri_persistent_device_id');
   if (storedId && storedId.startsWith('device_')) {
     cachedDeviceId = storedId;
     localStorage.setItem('meri_device_id', cachedDeviceId);
     return cachedDeviceId;
   }
   
   // Generate new device ID
  const randomPart = Math.random().toString(36).substring(2, 15);
  cachedDeviceId = `device_${randomPart}`;
   
   try {
     localStorage.setItem('meri_persistent_device_id', cachedDeviceId);
     localStorage.setItem('meri_device_id', cachedDeviceId);
   } catch (e) {
     // Ignore storage errors
   }
   
   return cachedDeviceId;
 };
 
 /**
  * Initialize device ID on app startup
  * Call this early in app lifecycle to pre-cache the ID
  */
 export const initializePersistentDeviceId = async (): Promise<void> => {
   try {
     await getPersistentDeviceId();
     console.log('[PersistentDeviceId] Initialized successfully');
   } catch (error) {
     console.error('[PersistentDeviceId] Initialization failed:', error);
   }
 };
 
 /**
  * Clear cached device ID (for testing only)
  */
 export const clearDeviceIdCache = (): void => {
   cachedDeviceId = null;
   localStorage.removeItem('meri_persistent_device_id');
   // Note: We do NOT clear meri_device_id as that's the account link
 };