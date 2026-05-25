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

// =============================================
// 🚀 ASSET CACHE — Stale-while-revalidate for JS/CSS/images
// Makes repeat page loads near-instant (<100ms)
// Pkg B pass-2: + HTML navigation cache with offline fallback
// =============================================
var ASSET_CACHE = 'meri-assets-v1';
var HTML_CACHE = 'meri-html-v1';
var ASSET_REGEX = /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|webp|svg|gif|ico)(?:\?.*)?$/i;

self.addEventListener('install', function(event) {
  // Activate new SW immediately
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  // Take control of all clients & clean old caches
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(function(keys) {
        return Promise.all(keys.filter(function(k) {
          return (k.indexOf('meri-assets-') === 0 && k !== ASSET_CACHE) ||
                 (k.indexOf('meri-html-') === 0 && k !== HTML_CACHE);
        }).map(function(k) { return caches.delete(k); }));
      }),
    ])
  );
});

self.addEventListener('fetch', function(event) {
  var req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Don't cache cross-origin (except for same-origin assets we own)
  if (url.origin !== self.location.origin) return;

  // Don't cache API/auth/realtime
  if (url.pathname.indexOf('/rest/') !== -1) return;
  if (url.pathname.indexOf('/auth/') !== -1) return;
  if (url.pathname.indexOf('/realtime/') !== -1) return;
  if (url.pathname.indexOf('/functions/') !== -1) return;

  // ---- HTML navigations: network-first, fall back to last cached shell (offline) ----
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req).then(function(resp) {
        if (resp && resp.status === 200) {
          var copy = resp.clone();
          caches.open(HTML_CACHE).then(function(c) { c.put('/__app_shell__', copy).catch(function() {}); }).catch(function() {});
        }
        return resp;
      }).catch(function() {
        return caches.open(HTML_CACHE).then(function(c) {
          return c.match('/__app_shell__').then(function(hit) {
            return hit || new Response(
              '<!doctype html><meta charset="utf-8"><title>Offline</title><style>body{font-family:system-ui;margin:0;display:grid;place-items:center;height:100vh;background:#0F172A;color:#fff;text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}p{opacity:.7;margin:0}</style><h1>You are offline</h1><p>Reconnect to continue.</p>',
              { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        });
      })
    );
    return;
  }

self.addEventListener('fetch', function(event) {
  var req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Don't cache cross-origin (except for same-origin assets we own)
  if (url.origin !== self.location.origin) return;

  // Don't cache HTML — always fresh
  if (req.mode === 'navigate') return;
  if (req.destination === 'document') return;

  // Don't cache API/auth/realtime
  if (url.pathname.indexOf('/rest/') !== -1) return;
  if (url.pathname.indexOf('/auth/') !== -1) return;
  if (url.pathname.indexOf('/realtime/') !== -1) return;
  if (url.pathname.indexOf('/functions/') !== -1) return;

  // Only cache static assets (JS, CSS, fonts, images)
  if (!ASSET_REGEX.test(url.pathname)) return;

  event.respondWith(
    caches.open(ASSET_CACHE).then(function(cache) {
      return cache.match(req).then(function(cached) {
        // Background revalidation — fetch new copy & update cache
        var networkPromise = fetch(req).then(function(resp) {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            cache.put(req, resp.clone()).catch(function() {});
          }
          return resp;
        }).catch(function() { return cached; });

        // Return cached immediately if available, otherwise wait for network
        return cached || networkPromise;
      });
    })
  );
});

self.addEventListener('message', function(event) {
  var data = event.data || {};
  if (data.type === 'MERI_CLEAR_APP_ASSET_CACHE') {
    event.waitUntil(
      caches.keys().then(function(keys) {
        return Promise.all(keys.filter(function(k) {
          return k.indexOf('meri-assets-') === 0 || k.indexOf('meri-img-cache-') === 0;
        }).map(function(k) { return caches.delete(k); }));
      }).catch(function() {})
    );
  }
});

// =============================================
// 🖼️ CROSS-ORIGIN IMAGE CACHE — merged from image-cache-sw.js
// Cache-first for avatars, banners, gifts, reels from Supabase/CDN.
// Makes repeat visits instant (<50ms) for every photo.
// =============================================
var IMG_CACHE_NAME = 'meri-img-cache-v3';
var IMG_MAX_ENTRIES = 600;

var IMG_HOST_RE = /(supabase\.co\/storage|supabase\.in\/storage|images?\.|cdn\.|cloudflarestorage|googleusercontent|cloudinary|imgur)/i;
var IMG_EXT_RE = /\.(png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/i;
var PRIVATE_STORAGE_RE = /\/storage\/v1\/.*\/(face-verification|host-verification|payment-proofs|payment-screenshots|helper-screenshots|rating-screenshots|support-attachments|live-recordings|chat-media)\//i;

function isImageRequest(req) {
  if (req.method !== 'GET') return false;
  if (req.destination === 'image') return true;
  var url = req.url;
  if (IMG_EXT_RE.test(url)) return true;
  if (IMG_HOST_RE.test(url) && /image|object|public/i.test(url)) return true;
  return false;
}

async function trimImgCache(cache) {
  var keys = await cache.keys();
  if (keys.length <= IMG_MAX_ENTRIES) return;
  var remove = keys.length - IMG_MAX_ENTRIES;
  for (var i = 0; i < remove; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (!isImageRequest(req)) return;
  // Skip range requests (video chunks sometimes look like images)
  if (req.headers.get('range')) return;
  // Skip private/sensitive buckets
  if (PRIVATE_STORAGE_RE.test(req.url)) return;
  // Only handle cross-origin images here; same-origin assets handled above
  try {
    var url = new URL(req.url);
    if (url.origin === self.location.origin) return;
  } catch (e) { return; }

  event.respondWith(
    caches.open(IMG_CACHE_NAME).then(function(cache) {
      return cache.match(req, { ignoreVary: true }).then(function(cached) {
        // Stale-while-revalidate: return cached immediately, refresh in background
        var networkPromise = fetch(req).then(function(res) {
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone()).then(function() { trimImgCache(cache); }).catch(function() {});
          }
          return res;
        }).catch(function() { return cached; });

        return cached || networkPromise;
      });
    })
  );
});

// Handle warm-up messages from the app (pre-load critical images)
self.addEventListener('message', function(event) {
  var data = event.data || {};
  if (data.type === 'WARM_IMAGES' && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(IMG_CACHE_NAME).then(function(cache) {
        return Promise.all(data.urls.slice(0, 200).map(function(u) {
          return cache.match(u, { ignoreVary: true }).then(function(hit) {
            if (hit) return;
            return fetch(u, { mode: 'no-cors' }).then(function(res) {
              if (res) return cache.put(u, res.clone());
            }).catch(function() {});
          });
        })).then(function() { return trimImgCache(cache); });
      })
    );
  }
});

