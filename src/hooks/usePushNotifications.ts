import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import { navigateInAppPath, openInExternalBrowser } from '@/utils/inAppNavigation';
import { getNotificationPath } from '@/utils/notificationDeepLink';

interface UsePushNotificationsReturn {
  isSupported: boolean;
  isRegistered: boolean;
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unknown';
  registerForPush: () => Promise<boolean>;
  token: string | null;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const { toast } = useToast();
  const [isRegistered, setIsRegistered] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');
  const [token, setToken] = useState<string | null>(null);
  
  const isSupported = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();

  // Save token to database (works with or without logged-in user)
  const saveTokenToDatabase = useCallback(async (pushToken: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Only save token if user is authenticated - anonymous tokens are useless
      if (!user) {
        console.log('[Push] Skipping token save - user not authenticated');
        return;
      }

      const { error } = await supabase
        .from('device_tokens')
        .upsert({
          user_id: user.id,
          token: pushToken,
          platform: platform as 'android' | 'ios' | 'web',
          is_active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'token',
        });

      if (error) {
        console.error('[Push] Error saving token:', error);
      } else {
        console.log('[Push] Token saved successfully (user:', user?.id || 'anonymous', ')');
        setIsRegistered(true);
      }
    } catch (err) {
      console.error('[Push] Error saving token to database:', err);
    }
  }, [platform]);

  // Handle incoming notifications when app is in foreground
  const handleNotificationReceived = useCallback((notification: PushNotificationSchema) => {
    console.log('[Push] Notification received in foreground:', notification);
    
    const data = notification.data as Record<string, string> | undefined;
    
    // For call notifications, we don't show toast - the IncomingCallModal handles it
    if (data?.type === 'call') {
      console.log('[Push] Call notification - handled by CallProvider');
      return;
    }

    if (data?.type === 'gift' || data?.type === 'gift_received' || data?.type === 'gift_sent') {
      console.log('[Push] Gift notification - handled by in-room gift feed');
      return;
    }

    // Show toast for other notifications
    toast({
      title: notification.title || 'Notification',
      description: notification.body,
    });
  }, [toast]);

  // Handle notification tap (app was in background)
  const handleNotificationAction = useCallback((action: ActionPerformed) => {
    console.log('[Push] Notification action performed:', action);

    const data = action.notification.data as Record<string, string> | undefined;
    if (!data) {
      navigateInAppPath('/chat?tab=notifications');
      return;
    }

    const path = getNotificationPath(data);

    // Absolute http(s) URLs from admin (link_url/action_url) → OS external browser (Chrome).
    // Internal app paths → SPA router.
    if (/^https?:\/\//i.test(path)) {
      void openInExternalBrowser(path);
    } else {
      navigateInAppPath(path);
    }
  }, []);

  // Register for push notifications
  const registerForPush = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.log('[Push] Push notifications not supported on this platform');
      return false;
    }

    try {
      // Check current permission status
      const permStatus = await PushNotifications.checkPermissions();
      console.log('[Push] Current permission status:', permStatus.receive);

      if (permStatus.receive === 'denied') {
        setPermissionStatus('denied');
        toast({
          variant: 'destructive',
        });
        return false;
      }

      // Request permission if needed
      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        const requestResult = await PushNotifications.requestPermissions();
        
        if (requestResult.receive !== 'granted') {
          setPermissionStatus('denied');
          return false;
        }
      }

      setPermissionStatus('granted');

      // Register with the push notification service
      await PushNotifications.register();
      
      return true;
    } catch (err) {
      console.error('[Push] Error registering for push notifications:', err);
      return false;
    }
  }, [isSupported, toast]);

  // Set up listeners
  useEffect(() => {
    if (!isSupported) return;

    // Registration success
    const registrationListener = PushNotifications.addListener('registration', (token: Token) => {
      console.log('[Push] Registration successful, token:', token.value.substring(0, 20) + '...');
      setToken(token.value);
      saveTokenToDatabase(token.value);
    });

    // Registration error
    const registrationErrorListener = PushNotifications.addListener('registrationError', (error) => {
      console.error('[Push] Registration error:', error);
      setIsRegistered(false);
    });

    // Notification received in foreground
    const notificationReceivedListener = PushNotifications.addListener(
      'pushNotificationReceived',
      handleNotificationReceived
    );

    // Notification action (tapped)
    const notificationActionListener = PushNotifications.addListener(
      'pushNotificationActionPerformed',
      handleNotificationAction
    );

    // Check initial permission status
    PushNotifications.checkPermissions().then((status) => {
      if (status.receive === 'granted') {
        setPermissionStatus('granted');
        // Auto-register if already granted
        registerForPush();
      } else if (status.receive === 'denied') {
        setPermissionStatus('denied');
      } else {
        setPermissionStatus('prompt');
      }
    });

    return () => {
      registrationListener.then(l => l.remove());
      registrationErrorListener.then(l => l.remove());
      notificationReceivedListener.then(l => l.remove());
      notificationActionListener.then(l => l.remove());
    };
  }, [isSupported, handleNotificationReceived, handleNotificationAction, saveTokenToDatabase, registerForPush]);

  // Link token to user when they sign in (update anonymous token with user_id)
  useEffect(() => {
    if (!isSupported || !token) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && token) {
        saveTokenToDatabase(token);
      }
    });

    return () => subscription.unsubscribe();
  }, [isSupported, token, saveTokenToDatabase]);

  // Pkg206 — Doze/App-Standby heartbeat. On every foreground resume:
  //   1. Re-register with FCM → if the token rotated while killed/in deep Doze,
  //      we get a fresh `registration` event → saveTokenToDatabase upserts it.
  //   2. Update `device_tokens.updated_at` (= last_seen) so backend cleanup
  //      can prune tokens not seen in 30+ days (dead/uninstalled).
  // Heavy throttle: at most once per 60s to avoid spam from quick tab switches.
  useEffect(() => {
    if (!isSupported) return;
    let lastPingAt = 0;
    const PING_INTERVAL_MS = 60_000;

    const heartbeat = async () => {
      const now = Date.now();
      if (now - lastPingAt < PING_INTERVAL_MS) return;
      lastPingAt = now;
      try {
        // Fetches current FCM token; emits `registration` if rotated.
        await PushNotifications.register();
      } catch { /* ignore */ }
      if (!token) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase
          .from('device_tokens')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('token', token)
          .eq('user_id', user.id);
      } catch { /* ignore */ }
    };

    // Initial heartbeat after token is known. Zero-refresh policy: no
    // appState/foreground heartbeat loop.
    void heartbeat();

    return undefined;
  }, [isSupported, token]);

  return {
    isSupported,
    isRegistered,
    permissionStatus,
    registerForPush,
    token,
  };
}
