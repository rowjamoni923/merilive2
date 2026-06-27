import { useEffect, forwardRef, useImperativeHandle } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * Initialize Push Notifications for the app.
 * This component should be placed high in the component tree.
 * It automatically registers for push notifications when the user is logged in.
 * 
 * Uses forwardRef to prevent React warning about refs on function components.
 */
export const PushNotificationInitializer = forwardRef<unknown, object>(function PushNotificationInitializer(_props, ref) {
  const { isSupported, permissionStatus, registerForPush, isRegistered } = usePushNotifications();

  // Expose nothing via ref but satisfy React's ref forwarding
  useImperativeHandle(ref, () => ({}), []);

  useEffect(() => {
    // WhatsApp/Imo-parity auto-registration:
    //   - granted → register silently
    //   - prompt  → trigger OS permission dialog automatically (no user tap)
    // After a fresh APK install, the host's token registers on first launch
    // without them having to visit Settings.
    if (!isSupported || isRegistered) return;
    if (permissionStatus === 'granted' || permissionStatus === 'prompt') {
      console.log('[PushInit] Auto-registering for push notifications (status:', permissionStatus, ')');
      void registerForPush();
    }
  }, [isSupported, permissionStatus, isRegistered, registerForPush]);

  // This component doesn't render anything
  return null;
});

export default PushNotificationInitializer;
