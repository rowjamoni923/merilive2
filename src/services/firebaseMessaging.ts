/**
 * Firebase Cloud Messaging for Web Push Notifications
 * 
 * Handles FCM token registration & foreground message handling.
 * Background messages handled by firebase-messaging-sw.js service worker.
 */
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

// Firebase Web Config - these are PUBLIC/publishable keys
// TODO: Replace with your actual Firebase project config
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDbahZ7x2_c1509xGHhDT0ygUy_Tg4yZjQ",
  authDomain: "merilive-913fc.firebaseapp.com",
  projectId: "merilive-913fc",
  storageBucket: "merilive-913fc.firebasestorage.app",
  messagingSenderId: "830608832747",
  appId: "1:830608832747:web:49bd5ca4cdbec7a05ee6ae",
};

// Singleton instances
let firebaseApp: any = null;
let messaging: any = null;
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
  if (Capacitor.isNativePlatform()) {
    return registerNativePushToken(userId);
  }

  try {
    // Check notification permission
    if (!('Notification' in window)) {
      console.warn('[FCM] Notifications not supported');
      return null;
    }

    let permission = Notification.permission;
    if (permission === 'denied') {
      console.warn('[FCM] Notification permission denied');
      return null;
    }

    if (permission === 'default') {
      permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('[FCM] Notification permission not granted');
        return null;
      }
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

    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.warn('[FCM Native] Permission not granted');
      return null;
    }

    // Register for push notifications
    await PushNotifications.register();

    // Listen for token
    return new Promise((resolve) => {
      PushNotifications.addListener('registration', async (registrationToken) => {
        const token = registrationToken.value;
        console.log('[FCM Native] Token:', token.substring(0, 20) + '...');
        
        const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
        await saveTokenToDatabase(userId, token, platform);
        tokenRegistered = true;
        resolve(token);
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('[FCM Native] Registration error:', error);
        resolve(null);
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
  if (Capacitor.isNativePlatform()) {
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

  switch (data.type) {
    case 'incoming_call':
      // Navigate to call screen
      window.location.href = `/call?callId=${data.call_id}`;
      break;
    case 'message':
      window.location.href = `/chat/${data.conversation_id || ''}`;
      break;
    case 'gift':
      window.location.href = '/profile';
      break;
    case 'follow':
      window.location.href = `/profile-detail/${data.follower_id || ''}`;
      break;
    case 'live':
      window.location.href = `/live/${data.stream_id || ''}`;
      break;
    default:
      window.location.href = '/';
  }
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
