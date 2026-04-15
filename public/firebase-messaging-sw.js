/**
 * Firebase Messaging Service Worker
 * Handles background push notifications when the app/tab is closed.
 * 
 * This file MUST be at the root of the public directory (served at /).
 */

// Import Firebase scripts for service workers
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// TODO: Replace with your actual Firebase project config
firebase.initializeApp({
  apiKey: "AIzaSyDbahZ7x2_c1509xGHhDT0ygUy_Tg4yZjQ",
  authDomain: "merilive-913fc.firebaseapp.com",
  projectId: "merilive-913fc",
  storageBucket: "merilive-913fc.firebasestorage.app",
  messagingSenderId: "830608832747",
  appId: "1:830608832747:web:49bd5ca4cdbec7a05ee6ae",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const data = payload.data || {};
  const notificationTitle = data.title || payload.notification?.title || 'MeriLive';
  const notificationBody = data.body || payload.notification?.body || '';
  const isCall = data.type === 'incoming_call' || data.type === 'call';

  const notificationOptions = {
    body: notificationBody,
    icon: '/lovable-uploads/merilive-icon.png',
    badge: '/lovable-uploads/merilive-icon.png',
    tag: data.type || 'general',
    data: data,
    // Call notifications: persistent until user acts
    requireInteraction: isCall,
    // Vibration pattern
    vibrate: isCall ? [200, 100, 200, 100, 200, 100, 200] : [200, 100, 200],
    // Actions for call notifications
    actions: isCall
      ? [
          { action: 'accept', title: '✅ Accept' },
          { action: 'reject', title: '❌ Decline' },
        ]
      : [],
  };

  // Show image if available
  if (data.image_url || payload.notification?.image) {
    notificationOptions.image = data.image_url || payload.notification?.image;
  }

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action, event.notification.data);
  event.notification.close();

  const data = event.notification.data || {};

  let url = '/';

  if (data.type === 'incoming_call' || data.type === 'call') {
    if (event.action === 'accept') {
      url = `/call?callId=${data.call_id}&autoAccept=true`;
    } else if (event.action === 'reject') {
      // Just close the notification
      return;
    } else {
      url = `/call?callId=${data.call_id}`;
    }
  } else if (data.type === 'message') {
    url = `/chat/${data.conversation_id || ''}`;
  } else if (data.type === 'gift') {
    url = '/profile';
  } else if (data.type === 'follow') {
    url = `/profile-detail/${data.follower_id || ''}`;
  } else if (data.type === 'live') {
    url = `/live/${data.stream_id || ''}`;
  } else if (data.type === 'support_reply') {
    var sp = 'mode=live_chat&ticket_id=' + (data.ticket_id || '');
    if (data.message_id) sp += '&message_id=' + data.message_id;
    url = '/settings/customer-service?' + sp;
  } else if (data.link_url) {
    url = data.link_url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return clients.openWindow(url);
    })
  );
});
