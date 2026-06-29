import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

// Fallback version (only used if native version can't be read)
const FALLBACK_VERSION_CODE = 100;
const FALLBACK_VERSION_NAME = '8.2.1';

// Storage key for dismissed updates
const DISMISSED_VERSION_KEY = 'app_update_dismissed_version';
const UPDATE_PROMPT_STATE_KEY = 'app_update_prompt_state';
const LAST_CHECK_KEY = 'app_update_last_check';
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes between checks
const STORE_OPEN_SUPPRESSION_MS = 12 * 60 * 60 * 1000; // optional prompts stay quiet after Store open

// Admin test-mode override key. When this localStorage entry exists, the
// hook bypasses the native check and renders the modal using the override
// payload — lets admins QA the modal/dismiss/store-open flow in any browser
// without publishing a new version.
export const APP_UPDATE_TEST_OVERRIDE_KEY = 'app_update_test_override';
export const APP_UPDATE_TEST_TRIGGER_EVENT = 'app-update-test-trigger';

interface TestOverridePayload {
  forceUpdate?: boolean;
  currentVersion?: string;
  availableVersion?: string;
  currentVersionCode?: number;
  availableVersionCode?: number;
  updateMessage?: string;
  playStoreUrl?: string;
}

const readTestOverride = (): TestOverridePayload | null => {
  try {
    const raw = localStorage.getItem(APP_UPDATE_TEST_OVERRIDE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TestOverridePayload;
  } catch {
    return null;
  }
};

interface AppUpdateInfo {
  updateAvailable: boolean;
  forceUpdate: boolean;
  currentVersion: string;
  availableVersion: string;
  currentVersionCode: number;
  availableVersionCode: number;
  currentComparable: number;
  availableComparable: number;
  minimumComparable: number;
  updateMessage: string;
  playStoreUrl: string;
}

type PromptAction = 'dismissed' | 'store_opened' | 'updated';

interface PromptMemory {
  action: PromptAction;
  forceUpdate: boolean;
  targetComparable: number;
  targetVersionCode: number;
  targetVersionName: string;
  installedComparableAtAction: number;
  installedVersionCode: number;
  installedVersionName: string;
  updatedAt: number;
  suppressUntil?: number;
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

// Convert a version string ("8.2.13") to comparable code (80213).
// If the string contains no dot, treat it as a raw build code ("58" -> 58)
// so admins can enter either form in the `minimum_version` field.
const versionNameToCode = (version: string | null | undefined): number => {
  const raw = String(version ?? '').trim();
  if (!raw) return 0;
  if (!raw.includes('.')) {
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }
  const parts = raw.split('.').map((part) => parseInt(part.replace(/\D/g, ''), 10) || 0);
  return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
};

// Single canonical comparable code derived from (versionCode, versionName).
// Picks the LARGER of the two interpretations so device, server target, and
// minimum target are all normalised onto one scale regardless of whether the
// admin entered a raw build code or a dotted version name.
const toComparableCode = (
  versionCode: number | string | null | undefined,
  versionName: string | null | undefined,
): number => {
  const codeNum = Number(versionCode);
  const fromCode = Number.isFinite(codeNum) && codeNum > 0 ? codeNum : 0;
  const fromName = versionNameToCode(versionName);
  return Math.max(fromCode, fromName);
};

const readPromptMemory = (): PromptMemory | null => {
  try {
    const raw = localStorage.getItem(UPDATE_PROMPT_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PromptMemory;
  } catch {
    return null;
  }
};

const clearPromptMemory = () => {
  try {
    localStorage.removeItem(UPDATE_PROMPT_STATE_KEY);
    localStorage.removeItem(DISMISSED_VERSION_KEY);
  } catch {}
};

const savePromptMemory = (info: AppUpdateInfo, action: PromptAction) => {
  try {
    const now = Date.now();
    const memory: PromptMemory = {
      action,
      forceUpdate: info.forceUpdate,
      targetComparable: info.availableComparable,
      targetVersionCode: info.availableVersionCode,
      targetVersionName: info.availableVersion,
      installedComparableAtAction: info.currentComparable,
      installedVersionCode: info.currentVersionCode,
      installedVersionName: info.currentVersion,
      updatedAt: now,
      suppressUntil: action === 'store_opened' ? now + STORE_OPEN_SUPPRESSION_MS : undefined,
    };
    localStorage.setItem(UPDATE_PROMPT_STATE_KEY, JSON.stringify(memory));
    localStorage.setItem(DISMISSED_VERSION_KEY, String(info.availableComparable || info.availableVersionCode));
  } catch {}
};

const clearAdminTestOverrideAfterAction = () => {
  try {
    localStorage.removeItem(APP_UPDATE_TEST_OVERRIDE_KEY);
  } catch {}
};

const shouldSuppressPrompt = (info: AppUpdateInfo): boolean => {
  try {
    if (!info.updateAvailable || info.currentComparable >= info.availableComparable) {
      clearPromptMemory();
      return false;
    }

    const legacyDismissed = parseInt(localStorage.getItem(DISMISSED_VERSION_KEY) || '0', 10) || 0;
    const legacyCoversTarget = legacyDismissed >= info.availableComparable || legacyDismissed >= info.availableVersionCode;
    const memory = readPromptMemory();
    const sameTarget = memory?.targetComparable === info.availableComparable;

    // Forced updates should never be bypassed by a previous dismiss/store action.
    if (info.forceUpdate) return false;

    if (sameTarget && memory?.action === 'dismissed') return true;
    if (sameTarget && memory?.action === 'updated') return true;
    if (sameTarget && memory?.action === 'store_opened') {
      return !memory.suppressUntil || Date.now() <= memory.suppressUntil;
    }

    return legacyCoversTarget;
  } catch {
    return false;
  }
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
      const platform = Capacitor.getPlatform();
      console.log('[AppUpdate] Detected platform:', platform);
      
      const { data, error } = await supabase
        .from('app_version_settings')
        .select('*')
        .eq('platform', platform === 'web' ? 'android' : platform)
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

      // Normalise EVERYTHING through the same comparable scale.
      const currentComparable = toComparableCode(CURRENT_VERSION_CODE, CURRENT_VERSION_NAME);
      const serverComparable = toComparableCode(data.current_version_code, serverVersionName);
      const minimumComparable = toComparableCode(data.min_version_code, data.minimum_version);
      const minimumVersionCode = minimumComparable; // for logging compatibility

      console.log('[AppUpdate] Server version:', serverVersionName, '(', serverVersionCode, ')');
      console.log('[AppUpdate] Comparable scale → current:', currentComparable, 'server:', serverComparable, 'min:', minimumComparable);

      const updateAvailable = serverComparable > currentComparable;
      const isForceUpdate = Boolean(data.force_update) && minimumComparable > currentComparable;

      const info: AppUpdateInfo = {
        updateAvailable,
        forceUpdate: isForceUpdate,
        currentVersion: CURRENT_VERSION_NAME,
        availableVersion: serverVersionName,
        currentVersionCode: CURRENT_VERSION_CODE,
        availableVersionCode: serverVersionCode,
        currentComparable,
        availableComparable: serverComparable,
        minimumComparable,
        updateMessage: data.update_message || data.changelog || 'New update available!',
        playStoreUrl: data.play_store_url || data.update_url || 'https://play.google.com/store/apps/details?id=com.merilive.app',
      };

      setUpdateInfo(info);

      // Check if this target was already dismissed/store-opened (only for non-force updates)
      const dismissed = updateAvailable && shouldSuppressPrompt(info);
      let modalWillShow = false;

      if (updateAvailable && !dismissed) {
        console.log('[AppUpdate] Update available! Showing modal.');
        setShowUpdateModal(true);
        modalWillShow = true;
      } else if (updateAvailable && dismissed) {
        console.log('[AppUpdate] This version was already dismissed by user');
        setShowUpdateModal(false);
      } else {
        console.log('[AppUpdate] App is up to date.');
        setShowUpdateModal(false);
        clearPromptMemory();
      }

      // 🔍 LOG THE CHECK to admin dashboard (fire-and-forget)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        supabase.from('app_update_check_log').insert({
          user_id: user?.id ?? null,
          platform: platform === 'web' ? 'android' : platform,
          current_version_name: CURRENT_VERSION_NAME,
          current_version_code: CURRENT_VERSION_CODE,
          server_version_name: serverVersionName,
          server_version_code: serverVersionCode,
          min_version_code: minimumVersionCode,
          update_available: updateAvailable,
          force_update: isForceUpdate,
          modal_shown: modalWillShow,
          outcome: modalWillShow ? 'shown' : (dismissed ? 'dismissed' : 'checked'),
        }).then(({ error: logErr }) => {
          if (logErr) console.warn('[AppUpdate] log insert failed:', logErr.message);
        });
      } catch (e) {
        console.warn('[AppUpdate] could not log check:', e);
      }

    } catch (error) {
      console.error('[AppUpdate] Error checking for update:', error);
      // Try Play Store API as fallback
      await checkPlayStoreUpdate();
    } finally {
      setIsChecking(false);
    }
  }, [shouldSkipCheck]);

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
        const availableVersionName = result.availableVersionName || 'New Version';
        const availableVersionCode = parseInt(result.availableVersionCode || '0', 10) || versionNameToCode(availableVersionName);
        const currentComparable = toComparableCode(CURRENT_VERSION_CODE, CURRENT_VERSION_NAME);
        const availableComparable = toComparableCode(availableVersionCode, availableVersionName);
        const info: AppUpdateInfo = {
          updateAvailable: true,
          forceUpdate: false,
          currentVersion: CURRENT_VERSION_NAME,
          availableVersion: availableVersionName,
          currentVersionCode: CURRENT_VERSION_CODE,
          availableVersionCode,
          currentComparable,
          availableComparable,
          minimumComparable: 0,
          updateMessage: 'New update available! Update now to get new features and bug fixes.',
          playStoreUrl: 'https://play.google.com/store/apps/details?id=com.merilive.app',
        };
        setUpdateInfo(info);
        setShowUpdateModal(!shouldSuppressPrompt(info));
      }
    } catch (error) {
      console.error('[AppUpdate] Play Store check failed:', error);
    }
  }, []);

  const openPlayStore = useCallback(async () => {
    const url = updateInfo?.playStoreUrl || 'https://play.google.com/store/apps/details?id=com.merilive.app';

    // Save action so the same optional target is not re-prompted while the user is updating.
    if (updateInfo?.availableVersionCode) savePromptMemory(updateInfo, 'store_opened');
    clearAdminTestOverrideAfterAction();

    // Log outcome
    try {
      const { data: { user } } = await supabase.auth.getUser();
      supabase.from('app_update_check_log').insert({
        user_id: user?.id ?? null,
        platform: Capacitor.getPlatform() === 'web' ? 'android' : Capacitor.getPlatform(),
        current_version_name: updateInfo?.currentVersion,
        current_version_code: updateInfo?.currentVersionCode,
        server_version_name: updateInfo?.availableVersion,
        server_version_code: updateInfo?.availableVersionCode,
        update_available: true,
        force_update: updateInfo?.forceUpdate ?? false,
        modal_shown: true,
        outcome: 'store_opened',
      }).then(() => {});
    } catch (e) {}

    try {
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

    // Save action too, then clear it automatically after the installed version catches up.
    if (updateInfo?.availableVersionCode) savePromptMemory(updateInfo, 'updated');
    clearAdminTestOverrideAfterAction();

    try {
      const { AppUpdate } = await import('@capawesome/capacitor-app-update');
      await AppUpdate.performImmediateUpdate();
      // Log success
      try {
        const { data: { user } } = await supabase.auth.getUser();
        supabase.from('app_update_check_log').insert({
          user_id: user?.id ?? null,
          platform: Capacitor.getPlatform(),
          current_version_name: updateInfo?.currentVersion,
          current_version_code: updateInfo?.currentVersionCode,
          server_version_name: updateInfo?.availableVersion,
          server_version_code: updateInfo?.availableVersionCode,
          update_available: true,
          force_update: updateInfo?.forceUpdate ?? false,
          modal_shown: true,
          outcome: 'updated',
        }).then(() => {});
      } catch (e) {}
    } catch (error) {
      console.error('[AppUpdate] Immediate update failed, opening store:', error);
      openPlayStore();
    }
  }, [openPlayStore, updateInfo]);

  const dismissUpdate = useCallback(() => {
    // Don't allow dismiss if force update is required
    if (updateInfo?.forceUpdate) {
      console.log('[AppUpdate] Force update required, cannot dismiss');
      return;
    }
    
    // Save dismissed target so the same optional version doesn't show again.
    if (updateInfo?.availableVersionCode) {
      savePromptMemory(updateInfo, 'dismissed');
      clearAdminTestOverrideAfterAction();
      console.log('[AppUpdate] Dismissed target saved:', updateInfo.availableComparable);
    }
    
    setShowUpdateModal(false);
  }, [updateInfo]);

  // Apply test-mode override (admin QA). Bypasses native check + dismissal.
  const applyTestOverride = useCallback((forceShow = false) => {
    const override = readTestOverride();
    if (!override) return false;
    const currentComparable = toComparableCode(override.currentVersionCode ?? 1, override.currentVersion ?? '0.0.0');
    const availableComparable = toComparableCode(override.availableVersionCode ?? 999999, override.availableVersion ?? '99.99.99');
    const info: AppUpdateInfo = {
      updateAvailable: true,
      forceUpdate: !!override.forceUpdate,
      currentVersion: override.currentVersion ?? '0.0.0',
      availableVersion: override.availableVersion ?? '99.99.99',
      currentVersionCode: override.currentVersionCode ?? 1,
      availableVersionCode: override.availableVersionCode ?? 999999,
      currentComparable,
      availableComparable,
      minimumComparable: override.forceUpdate ? availableComparable : 0,
      updateMessage: override.updateMessage ?? '[TEST MODE] Simulated update — verify modal + dismiss + store-open flow.',
      playStoreUrl: override.playStoreUrl ?? 'https://play.google.com/store/apps/details?id=com.merilive.app',
    };
    setUpdateInfo(info);
    setShowUpdateModal(forceShow ? true : !shouldSuppressPrompt(info));
    console.log('[AppUpdate] TEST MODE override applied:', info);
    return true;
  }, []);

  // Check for updates on mount (only once)
  useEffect(() => {
    // Test override fires on every platform (web + native) so admin can QA in browser.
    if (applyTestOverride()) return;

    if (!Capacitor.isNativePlatform()) return;

    // Delay to ensure app is fully loaded
    const timer = setTimeout(() => {
      checkForUpdate();
    }, 3000);

    return () => clearTimeout(timer);
  }, [checkForUpdate, applyTestOverride]);

  // Listen for runtime trigger from the admin test page (same tab).
  useEffect(() => {
    const handler = () => applyTestOverride(true);
    window.addEventListener(APP_UPDATE_TEST_TRIGGER_EVENT, handler);
    return () => window.removeEventListener(APP_UPDATE_TEST_TRIGGER_EVENT, handler);
  }, [applyTestOverride]);

  // When the app returns from Play Store, refresh the native version and force a
  // fresh comparison so users who completed the update are not prompted again.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | undefined;
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      currentVersionRef.current = null;
      hasCheckedRef.current = false;
      checkForUpdate(true);
    }).then((handle) => {
      removeListener = () => handle.remove();
    });

    return () => {
      removeListener?.();
    };
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
