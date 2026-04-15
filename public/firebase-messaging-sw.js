/**
 * Firebase Messaging Service Worker
 * Handles background push notifications when the app/tab is closed.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDbahZ7x2_c1509xGHhDT0ygUy_Tg4yZjQ",
  authDomain: "merilive-913fc.firebaseapp.com",
  projectId: "merilive-913fc",
  storageBucket: "merilive-913fc.firebasestorage.app",
  messagingSenderId: "830608832747",
  appId: "1:830608832747:web:49bd5ca4cdbec7a05ee6ae",
});

var messaging = firebase.messaging();

// Map notification type to URL for deep-linking
function getNotificationUrl(data) {
  if (!data) return '/';
  var type = data.type || '';

  // Call notifications
  if (type === 'incoming_call' || type === 'call') return '/call?callId=' + (data.call_id || '');
  if (type === 'call_missed') return '/call-history';
  if (type === 'call_received') return '/call-history';

  // Messages
  if (type === 'message') return '/chat/' + (data.conversation_id || '');
  if (type === 'admin_message' || type === 'admin_message_reply') {
    return data.source === 'helper_messaging' ? '/helper-dashboard?tab=inbox' : '/chat';
  }

  // Gifts
  if (type === 'gift' || type === 'gift_received') return data.sender_id ? '/profile-detail/' + data.sender_id : '/profile';
  if (type === 'gift_sent') return data.receiver_id ? '/profile-detail/' + data.receiver_id : '/profile';

  // Social
  if (type === 'follow' || type === 'new_follower') return '/profile-detail/' + (data.follower_id || '');

  // Live & Party
  if (type === 'live' || type === 'live_started') return data.stream_id ? '/live/' + data.stream_id : '/discover';
  if (type === 'party_invite') return data.room_id ? '/party/' + data.room_id : '/party-rooms';

  // Transactions
  if (type === 'topup_approved' || type === 'topup_rejected' || type === 'coin_purchase_helper' || type === 'coin_purchase_direct' || type === 'payment_completed' || type === 'payment_pending') return '/recharge-history';
  if (type === 'coins_added' || type === 'coins_received' || type === 'diamonds_credited') return '/profile';
  if (type === 'coin_exchange' || type === 'diamond_sent') return '/agency-coin-exchange';

  // Withdrawal
  if (type === 'withdrawal' || type === 'withdrawal_approved' || type === 'withdrawal_rejected') return '/agency-withdrawal';

  // Level
  if (type === 'level_up') return '/level';
  if (type === 'level_upgrade_approved' || type === 'level_upgrade_rejected') return '/helper-dashboard';

  // Rewards
  if (type === 'reward' || type === 'task_completed' || type === 'daily_bonus') return '/tasks';

  // Host
  if (type === 'host_approved') return '/host-dashboard';
  if (type === 'host_rejected') return '/host-application';

  // Helper
  if (type === 'helper_approved' || type === 'payroll_approved' || type === 'payroll_rejected') return '/helper-dashboard';
  if (type === 'new_topup_order') return '/helper-dashboard?tab=orders';
  if (type === 'new_withdrawal_request') return '/helper-dashboard?tab=agency-withdrawals';
  if (type === 'order_completed') return '/helper-dashboard?tab=orders';

  // Agency
  if (type.indexOf('agency_') === 0) return '/agency-dashboard';

  // Beans & Balance
  if (type === 'beans_exchanged' || type === 'balance_deducted') return '/profile';

  // Support
  if (type === 'support_reply') {
    var sp = 'mode=live_chat&ticket_id=' + (data.ticket_id || '');
    if (data.message_id) sp += '&message_id=' + data.message_id;
    return '/settings/customer-service?' + sp;
  }

  // Custom link
  if (data.link_url) return data.link_url;
  if (data.action_url) return data.action_url;

  return '/';
}

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background message:', payload);

  var data = payload.data || {};
  var title = data.title || (payload.notification && payload.notification.title) || 'MeriLive';
  var body = data.body || (payload.notification && payload.notification.body) || '';
  var isCall = data.type === 'incoming_call' || data.type === 'call';
  var isMissedCall = data.type === 'call_missed';

  var options = {
    body: body,
    icon: '/lovable-uploads/merilive-icon.png',
    badge: '/lovable-uploads/merilive-icon.png',
    tag: data.type || 'general',
    data: data,
    requireInteraction: isCall,
    vibrate: isCall ? [200, 100, 200, 100, 200, 100, 200] : isMissedCall ? [300, 100, 300] : [200, 100, 200],
    renotify: true,
    actions: isCall
      ? [
          { action: 'accept', title: '✅ Accept' },
          { action: 'reject', title: '❌ Decline' },
        ]
      : [],
  };

  if (data.image_url || (payload.notification && payload.notification.image)) {
    options.image = data.image_url || payload.notification.image;
  }

  self.registration.showNotification(title, options);
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked:', event.action, event.notification.data);
  event.notification.close();

  var data = event.notification.data || {};
  var url = '/';

  if (data.type === 'incoming_call' || data.type === 'call') {
    if (event.action === 'accept') {
      url = '/call?callId=' + (data.call_id || '') + '&autoAccept=true';
    } else if (event.action === 'reject') {
      return;
    } else {
      url = '/call?callId=' + (data.call_id || '');
    }
  } else {
    url = getNotificationUrl(data);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) !== -1 && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
