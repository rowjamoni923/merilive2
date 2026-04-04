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
    // Auto-register if permission was previously granted
    if (isSupported && permissionStatus === 'granted' && !isRegistered) {
      console.log('[PushInit] Auto-registering for push notifications...');
      registerForPush();
    }
  }, [isSupported, permissionStatus, isRegistered, registerForPush]);

  // This component doesn't render anything
  return null;
});

export default PushNotificationInitializer;
