import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import { navigateInAppPath, openInApp } from '@/utils/inAppNavigation';

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
    if (!data) return;

    const type = data.type || '';
    const go = (path: string) => navigateInAppPath(path);

    // Use comprehensive deep-linking
    if (type === 'incoming_call' || type === 'call') {
      go(`/call?callId=${data.call_id || data.callId || ''}`);
    } else if (type === 'call_missed' || type === 'call_received') {
      go('/call-history');
    } else if (type === 'message') {
      go(`/chat/${data.conversation_id || data.conversationId || ''}`);
    } else if (type === 'gift' || type === 'gift_received') {
      go(data.sender_id ? `/profile-detail/${data.sender_id}` : '/profile');
    } else if (type === 'follow' || type === 'new_follower') {
      go(`/profile-detail/${data.follower_id || ''}`);
    } else if (type === 'live' || type === 'live_started') {
      go(data.stream_id ? `/live/${data.stream_id}` : '/discover');
    } else if (type === 'party_invite') {
      go(data.room_id ? `/party/${data.room_id}` : '/party-rooms');
    } else if (type === 'support_reply') {
      go(`/settings/customer-service?mode=live_chat&ticket_id=${data.ticket_id || ''}`);
    } else if (type.startsWith('agency_')) {
      go('/agency-dashboard');
    } else if (data.link_url) {
      void openInApp(data.link_url);
    } else if (data.action_url) {
      void openInApp(data.action_url);
    } else {
      go('/chat?tab=notifications');
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
          title: 'Notifications Disabled',
          description: 'Please enable notifications in your device settings',
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

  return {
    isSupported,
    isRegistered,
    permissionStatus,
    registerForPush,
    token,
  };
}
