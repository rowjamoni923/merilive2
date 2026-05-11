/**
 * Firebase Cloud Messaging for Web Push Notifications
 * 
 * Handles FCM token registration & foreground message handling.
 * Background messages handled by firebase-messaging-sw.js service worker.
 */
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { isNativeApp } from '@/utils/nativeUtils';
import type { FirebaseApp } from 'firebase/app';
import type { Messaging } from 'firebase/messaging';

// Firebase Web Config - these are PUBLIC/publishable keys
// TODO: Replace with your actual Firebase project config
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDbahZ7x2_c1509xGHhDT0ygUy_Tg4yZjQ",
  authDomain: "merilive-913fc.firebaseapp.com",
  projectId: "merilive-913fc",
  storageBucket: "merilive-913fc.firebasestorage.app",
  messagingSenderId: "830608832747",
  appId: "1:830608832747:web:49bd5ca4cdbec7a05ee6ae",
  measurementId: "G-N8Z7KPE5VN",
};

// Singleton instances
type NotificationData = Record<string, string | undefined>;
type NotificationPayload = {
  notification?: { title?: string; body?: string; image?: string };
  data?: NotificationData;
};

let firebaseApp: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let tokenRegistered = false;

/**
 * Initialize Firebase & get Messaging instance
 */
async function getMessagingInstance() {
  if (messaging) return messaging;

  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getMessaging, isSupported } = await import('firebase/messaging');

    // Check if FCM is supported in this browser
    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] Firebase Messaging not supported in this browser');
      return null;
    }

    // Initialize Firebase app (singleton)
    if (getApps().length === 0) {
      firebaseApp = initializeApp(FIREBASE_CONFIG);
    } else {
      firebaseApp = getApps()[0];
    }

    messaging = getMessaging(firebaseApp);
    return messaging;
  } catch (error) {
    console.error('[FCM] Failed to initialize:', error);
    return null;
  }
}

/**
 * Request notification permission and register FCM token
 */
export async function registerFCMToken(userId: string): Promise<string | null> {
  if (tokenRegistered) return null;

  // On native platform, use Capacitor Push Notifications instead
  if (isNativeApp()) {
    return registerNativePushToken(userId);
  }

  try {
    // Check notification permission
    if (!('Notification' in window)) {
      console.warn('[FCM] Notifications not supported');
      return null;
    }

    const permission = Notification.permission;
    if (permission === 'denied') {
      console.warn('[FCM] Notification permission denied');
      return null;
    }

    if (permission === 'default') {
      console.warn('[FCM] Waiting for user-initiated notification permission request');
      return null;
    }

    const msg = await getMessagingInstance();
    if (!msg) return null;

    const { getToken } = await import('firebase/messaging');

    // Register service worker
    let swRegistration: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('[FCM] Service worker registered');
      } catch (swError) {
        console.warn('[FCM] Service worker registration failed:', swError);
      }
    }

    // Get FCM token
    const token = await getToken(msg, {
      vapidKey: 'BKPEzksad0z8CleMkvRllpY0Q_5g-0lU1VptBMoCfe7W6Cq6mlR57urEbOo5_D2CuDibd1JpByL_3-7on9J_ORA',
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      console.warn('[FCM] No token received');
      return null;
    }

    console.log('[FCM] Token received:', token.substring(0, 20) + '...');

    // Save token to database
    await saveTokenToDatabase(userId, token, 'web');
    tokenRegistered = true;

    return token;
  } catch (error) {
    console.error('[FCM] Token registration failed:', error);
    return null;
  }
}

/**
 * Register push token on native (Capacitor) platform
 */
async function registerNativePushToken(userId: string): Promise<string | null> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Do not auto-prompt on app start. Permission must be enabled from Settings by user action.
    const permResult = await PushNotifications.checkPermissions();
    if (permResult.receive !== 'granted') {
      console.warn('[FCM Native] Waiting for user-initiated notification permission request');
      return null;
    }

    return await new Promise<string | null>((resolve) => {
      let settled = false;
      let registrationListener: { remove: () => Promise<void> } | null = null;
      let errorListener: { remove: () => Promise<void> } | null = null;

      const finish = async (value: string | null) => {
        if (settled) return;
        settled = true;
        await registrationListener?.remove().catch(() => undefined);
        await errorListener?.remove().catch(() => undefined);
        resolve(value);
      };

      void (async () => {
        registrationListener = await PushNotifications.addListener('registration', async (registrationToken) => {
          const token = registrationToken.value;
          console.log('[FCM Native] Token:', token.substring(0, 20) + '...');
          
          const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
          await saveTokenToDatabase(userId, token, platform);
          tokenRegistered = true;
          await finish(token);
        });

        errorListener = await PushNotifications.addListener('registrationError', async (error) => {
          console.error('[FCM Native] Registration error:', error);
          await finish(null);
        });

        await PushNotifications.register();
        window.setTimeout(() => void finish(null), 15000);
      })().catch((error) => {
        console.error('[FCM Native] Registration setup failed:', error);
        void finish(null);
      });
    });
  } catch (error) {
    console.error('[FCM Native] Failed:', error);
    return null;
  }
}

/**
 * Save FCM token to Supabase device_tokens table
 */
async function saveTokenToDatabase(userId: string, token: string, platform: string) {
  try {
    // Upsert: update if token exists, insert if new
    const { error } = await supabase
      .from('device_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform,
          is_active: true,
          device_info: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            timestamp: new Date().toISOString(),
          },
        },
        { onConflict: 'token' }
      );

    if (error) {
      console.error('[FCM] Failed to save token:', error);
    } else {
      console.log('[FCM] Token saved to database');
    }
  } catch (e) {
    console.error('[FCM] Database save error:', e);
  }
}

/**
 * Setup foreground message handler
 */
export async function setupForegroundMessageHandler(
  onMessage: (payload: any) => void
) {
  if (isNativeApp()) {
    // Native: use Capacitor listener
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[FCM Native] Foreground notification:', notification);
        onMessage({
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: notification.data,
        });
      });

      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[FCM Native] Notification tapped:', action);
        handleNotificationTap(action.notification.data);
      });
    } catch (e) {
      console.error('[FCM Native] Listener setup failed:', e);
    }
    return;
  }

  // Web: use Firebase onMessage
  const msg = await getMessagingInstance();
  if (!msg) return;

  const { onMessage: onFCMMessage } = await import('firebase/messaging');
  
  onFCMMessage(msg, (payload) => {
    console.log('[FCM] Foreground message:', payload);
    onMessage(payload);
    
    // Show browser notification for foreground messages
    if (payload.notification) {
      showBrowserNotification(
        payload.notification.title || 'MeriLive',
        payload.notification.body || '',
        payload.notification.image,
        payload.data
      );
    }
  });
}

/**
 * Show a browser notification
 */
function showBrowserNotification(title: string, body: string, image?: string, data?: any) {
  if (Notification.permission !== 'granted') return;

  const notification = new Notification(title, {
    body,
    icon: '/lovable-uploads/merilive-icon.png',
    badge: '/lovable-uploads/merilive-icon.png',
    tag: data?.type || 'general',
    data,
    requireInteraction: data?.type === 'incoming_call',
    vibrate: data?.type === 'incoming_call' ? [200, 100, 200, 100, 200] : [200],
  } as NotificationOptions);

  notification.onclick = () => {
    window.focus();
    handleNotificationTap(data);
    notification.close();
  };

  // Auto-close non-call notifications after 10s
  if (data?.type !== 'incoming_call') {
    setTimeout(() => notification.close(), 10000);
  }
}

/**
 * Handle notification tap — navigate to appropriate screen
 */
function handleNotificationTap(data: any) {
  if (!data) return;

  const type = data.type || '';

  // Call
  if (type === 'incoming_call' || type === 'call') { window.location.href = `/call?callId=${data.call_id}`; return; }
  if (type === 'call_missed' || type === 'call_received') { window.location.href = '/call-history'; return; }

  // Message
  if (type === 'message') { window.location.href = `/chat/${data.conversation_id || ''}`; return; }
  if (type === 'admin_message' || type === 'admin_message_reply') {
    window.location.href = data.source === 'helper_messaging' ? '/helper-dashboard?tab=inbox' : '/chat'; return;
  }

  // Gift
  if (type === 'gift' || type === 'gift_received') { window.location.href = data.sender_id ? `/profile-detail/${data.sender_id}` : '/profile'; return; }

  // Social
  if (type === 'follow' || type === 'new_follower') { window.location.href = `/profile-detail/${data.follower_id || ''}`; return; }

  // Live & Party
  if (type === 'live' || type === 'live_started') { window.location.href = data.stream_id ? `/live/${data.stream_id}` : '/discover'; return; }
  if (type === 'party_invite') { window.location.href = data.room_id ? `/party/${data.room_id}` : '/party-rooms'; return; }

  // Transactions
  if (['topup_approved', 'topup_rejected', 'coin_purchase_helper', 'coin_purchase_direct', 'payment_completed', 'payment_pending'].includes(type)) {
    window.location.href = '/recharge-history'; return;
  }
  if (['coins_added', 'coins_received', 'diamonds_credited', 'beans_exchanged', 'balance_deducted'].includes(type)) {
    window.location.href = '/profile'; return;
  }
  if (type === 'coin_exchange' || type === 'diamond_sent') { window.location.href = '/agency-coin-exchange'; return; }

  // Withdrawal
  if (['withdrawal', 'withdrawal_approved', 'withdrawal_rejected'].includes(type)) { window.location.href = '/agency-withdrawal'; return; }

  // Level & Rewards
  if (type === 'level_up') { window.location.href = '/level'; return; }
  if (type === 'reward' || type === 'task_completed' || type === 'daily_bonus') { window.location.href = '/tasks'; return; }

  // Host
  if (type === 'host_approved') { window.location.href = '/host-dashboard'; return; }
  if (type === 'host_rejected') { window.location.href = '/host-application'; return; }

  // Helper
  if (['helper_approved', 'payroll_approved', 'payroll_rejected', 'level_upgrade_approved', 'level_upgrade_rejected'].includes(type)) {
    window.location.href = '/helper-dashboard'; return;
  }
  if (type === 'new_topup_order') { window.location.href = '/helper-dashboard?tab=orders'; return; }
  if (type === 'new_withdrawal_request') { window.location.href = '/helper-dashboard?tab=agency-withdrawals'; return; }
  if (type === 'order_completed') { window.location.href = '/helper-dashboard?tab=orders'; return; }

  // Agency
  if (type.startsWith('agency_')) { window.location.href = '/agency-dashboard'; return; }

  // Support
  if (type === 'support_reply') {
    const params = new URLSearchParams({ mode: 'live_chat', ticket_id: data.ticket_id || '' });
    if (data.message_id) params.set('message_id', data.message_id);
    window.location.href = `/settings/customer-service?${params.toString()}`; return;
  }

  // Fallback
  if (data.link_url) { window.location.href = data.link_url; return; }
  if (data.action_url) { window.location.href = data.action_url; return; }
  window.location.href = '/';
}

/**
 * Deactivate FCM token (on logout)
 */
export async function deactivateFCMToken(userId: string) {
  tokenRegistered = false;
  try {
    await supabase
      .from('device_tokens')
      .update({ is_active: false })
      .eq('user_id', userId);
    console.log('[FCM] Tokens deactivated for user');
  } catch (e) {
    console.error('[FCM] Deactivation error:', e);
  }
}
