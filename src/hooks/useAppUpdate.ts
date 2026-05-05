import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

// Fallback version (only used if native version can't be read)
const FALLBACK_VERSION_CODE = 9;
const FALLBACK_VERSION_NAME = '5.0.3';

// Storage key for dismissed updates
const DISMISSED_VERSION_KEY = 'app_update_dismissed_version';
const LAST_CHECK_KEY = 'app_update_last_check';
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes between checks

interface AppUpdateInfo {
  updateAvailable: boolean;
  forceUpdate: boolean;
  currentVersion: string;
  availableVersion: string;
  currentVersionCode: number;
  availableVersionCode: number;
  updateMessage: string;
  playStoreUrl: string;
}

// Get the actual app version from native platform
const getAppVersion = async (): Promise<{ versionCode: number; versionName: string }> => {
  if (!Capacitor.isNativePlatform()) {
    return { versionCode: FALLBACK_VERSION_CODE, versionName: FALLBACK_VERSION_NAME };
  }
  
  try {
    const info = await App.getInfo();
    console.log('[AppUpdate] Native app info:', info);
    
    // info.version is the version name (e.g., "5.7.0")
    // info.build is the version code (e.g., "57")
    const versionCode = parseInt(info.build, 10) || FALLBACK_VERSION_CODE;
    const versionName = info.version || FALLBACK_VERSION_NAME;
    
    return { versionCode, versionName };
  } catch (error) {
    console.error('[AppUpdate] Failed to get native app info:', error);
    return { versionCode: FALLBACK_VERSION_CODE, versionName: FALLBACK_VERSION_NAME };
  }
};

const versionNameToCode = (version: string | null | undefined): number => {
  const parts = String(version || '0').split('.').map((part) => parseInt(part.replace(/\D/g, ''), 10) || 0);
  return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
};

export const useAppUpdate = () => {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const hasCheckedRef = useRef(false);
  const currentVersionRef = useRef<{ versionCode: number; versionName: string } | null>(null);

  // Check if this version was already dismissed
  const isDismissedVersion = useCallback((versionCode: number): boolean => {
    try {
      const dismissed = localStorage.getItem(DISMISSED_VERSION_KEY);
      if (dismissed) {
        const dismissedVersion = parseInt(dismissed, 10);
        return dismissedVersion >= versionCode;
      }
    } catch (e) {
      console.log('[AppUpdate] Could not read localStorage');
    }
    return false;
  }, []);

  // Check if we should skip check (too recent)
  const shouldSkipCheck = useCallback((): boolean => {
    try {
      const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
      if (lastCheck) {
        const lastCheckTime = parseInt(lastCheck, 10);
        const now = Date.now();
        if (now - lastCheckTime < CHECK_INTERVAL_MS) {
          return true;
        }
      }
    } catch (e) {
      console.log('[AppUpdate] Could not read localStorage');
    }
    return false;
  }, []);

  const checkForUpdate = useCallback(async (forceCheck = false) => {
    // Only run on native platforms
    if (!Capacitor.isNativePlatform()) {
      console.log('[AppUpdate] Skipped - not running on native platform');
      return;
    }

    // Prevent multiple checks in same session
    if (hasCheckedRef.current && !forceCheck) {
      console.log('[AppUpdate] Already checked in this session');
      return;
    }

    // Skip if checked recently (unless force)
    if (!forceCheck && shouldSkipCheck()) {
      console.log('[AppUpdate] Skipped - checked recently');
      return;
    }

    setIsChecking(true);
    hasCheckedRef.current = true;
    
    try {
      // Get actual app version from native platform
      if (!currentVersionRef.current) {
        currentVersionRef.current = await getAppVersion();
      }
      const { versionCode: CURRENT_VERSION_CODE, versionName: CURRENT_VERSION_NAME } = currentVersionRef.current;
      
      console.log('[AppUpdate] Checking for updates...');
      console.log('[AppUpdate] Current version:', CURRENT_VERSION_NAME, '(', CURRENT_VERSION_CODE, ')');
      
      // Save check time
      try {
        localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
      } catch (e) {}
      
      // Get version info from database
      const { data, error } = await supabase
        .from('app_version_settings')
        .select('*')
        .eq('platform', 'android')
        .maybeSingle();

      if (error) {
        console.error('[AppUpdate] Database error:', error);
        // Fallback to Play Store API check
        await checkPlayStoreUpdate();
        return;
      }

      if (!data) {
        console.log('[AppUpdate] No version settings found in database');
        return;
      }

      const serverVersionName = data.current_version_name || data.current_version || '1.0.0';
      const serverVersionCode = Number(data.current_version_code) || versionNameToCode(serverVersionName);
      const minimumVersionCode = Number(data.min_version_code) || versionNameToCode(data.minimum_version || serverVersionName);
      console.log('[AppUpdate] Server version:', serverVersionName, '(', serverVersionCode, ')');

      const currentComparableCode = Math.max(CURRENT_VERSION_CODE, versionNameToCode(CURRENT_VERSION_NAME));
      const updateAvailable = serverVersionCode > currentComparableCode;
      const isForceUpdate = data.force_update && minimumVersionCode > currentComparableCode;

      const info: AppUpdateInfo = {
        updateAvailable,
        forceUpdate: isForceUpdate,
        currentVersion: CURRENT_VERSION_NAME,
        availableVersion: serverVersionName,
        currentVersionCode: CURRENT_VERSION_CODE,
        availableVersionCode: serverVersionCode,
        updateMessage: data.update_message || data.changelog || 'New update available!',
        playStoreUrl: data.play_store_url || data.update_url || 'https://play.google.com/store/apps/details?id=com.merilive.app',
      };

      setUpdateInfo(info);

      // Check if this version was already dismissed (only for non-force updates)
      if (updateAvailable && !isForceUpdate && isDismissedVersion(serverVersionCode)) {
        console.log('[AppUpdate] This version was already dismissed by user');
        return;
      }

      // Show modal if update is available
      if (updateAvailable) {
        console.log('[AppUpdate] Update available! Showing modal.');
        setShowUpdateModal(true);
      } else {
        console.log('[AppUpdate] App is up to date.');
        // Clear any dismissed version if app is up to date
        try {
          localStorage.removeItem(DISMISSED_VERSION_KEY);
        } catch (e) {}
      }

    } catch (error) {
      console.error('[AppUpdate] Error checking for update:', error);
      // Try Play Store API as fallback
      await checkPlayStoreUpdate();
    } finally {
      setIsChecking(false);
    }
  }, [isDismissedVersion, shouldSkipCheck]);

  // Fallback: Check Play Store directly
  const checkPlayStoreUpdate = useCallback(async () => {
    try {
      // Get current version if not already loaded
      if (!currentVersionRef.current) {
        currentVersionRef.current = await getAppVersion();
      }
      const { versionCode: CURRENT_VERSION_CODE, versionName: CURRENT_VERSION_NAME } = currentVersionRef.current;
      
      const { AppUpdate: AppUpdatePlugin } = await import('@capawesome/capacitor-app-update');
      const result = await AppUpdatePlugin.getAppUpdateInfo();
      
      console.log('[AppUpdate] Play Store result:', result);
      
      if (result.updateAvailability === 2) { // UPDATE_AVAILABLE
        const info: AppUpdateInfo = {
          updateAvailable: true,
          forceUpdate: false,
          currentVersion: CURRENT_VERSION_NAME,
          availableVersion: result.availableVersionName || 'New Version',
          currentVersionCode: CURRENT_VERSION_CODE,
          availableVersionCode: parseInt(result.availableVersionCode || '0'),
          updateMessage: 'New update available! Update now to get new features and bug fixes.',
          playStoreUrl: 'https://play.google.com/store/apps/details?id=com.merilive.app',
        };
        setUpdateInfo(info);
        setShowUpdateModal(true);
      }
    } catch (error) {
      console.error('[AppUpdate] Play Store check failed:', error);
    }
  }, []);

  const openPlayStore = useCallback(async () => {
    const url = updateInfo?.playStoreUrl || 'https://play.google.com/store/apps/details?id=com.merilive.app';
    
    try {
      // Try using Capacitor App Update plugin first
      const { AppUpdate } = await import('@capawesome/capacitor-app-update');
      await AppUpdate.openAppStore();
    } catch (error) {
      console.log('[AppUpdate] Falling back to Browser plugin');
      try {
        const { openInApp } = await import('@/utils/inAppNavigation');
        await openInApp(url);
      } catch (err) {
        console.log('[AppUpdate] Falling back to location.href');
        window.location.href = url;
      }
    }
  }, [updateInfo]);

  const performImmediateUpdate = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const { AppUpdate } = await import('@capawesome/capacitor-app-update');
      await AppUpdate.performImmediateUpdate();
    } catch (error) {
      console.error('[AppUpdate] Immediate update failed, opening store:', error);
      openPlayStore();
    }
  }, [openPlayStore]);

  const dismissUpdate = useCallback(() => {
    // Don't allow dismiss if force update is required
    if (updateInfo?.forceUpdate) {
      console.log('[AppUpdate] Force update required, cannot dismiss');
      return;
    }
    
    // Save dismissed version to localStorage so it doesn't show again
    if (updateInfo?.availableVersionCode) {
      try {
        localStorage.setItem(DISMISSED_VERSION_KEY, updateInfo.availableVersionCode.toString());
        console.log('[AppUpdate] Dismissed version saved:', updateInfo.availableVersionCode);
      } catch (e) {
        console.log('[AppUpdate] Could not save to localStorage');
      }
    }
    
    setShowUpdateModal(false);
  }, [updateInfo]);

  // Check for updates on mount (only once)
  useEffect(() => {
    // Delay to ensure app is fully loaded
    const timer = setTimeout(() => {
      checkForUpdate();
    }, 3000);

    return () => clearTimeout(timer);
  }, [checkForUpdate]);

  // Also check when app comes to foreground (but respect rate limiting)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const setupAppStateListener = async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            console.log('[AppUpdate] App became active');
            // Don't force check on foreground - let rate limiting handle it
            checkForUpdate(false);
          }
        });
        
        return () => {
          listener.remove();
        };
      } catch (error) {
        console.error('[AppUpdate] Failed to setup app state listener:', error);
      }
    };

    setupAppStateListener();
  }, [checkForUpdate]);

  return {
    updateInfo,
    isChecking,
    showUpdateModal,
    checkForUpdate,
    performImmediateUpdate,
    openPlayStore,
    dismissUpdate,
  };
};
