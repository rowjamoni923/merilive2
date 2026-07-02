import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// M13 — Firebase bootstrap + background message handler.
///
/// Background handler is a MUST for FCM: when the app is in background /
/// killed and a `data-only` message arrives, Android spawns an isolate that
/// runs this top-level function BEFORE the OS delivers the intent to the
/// native `MeriFirebaseMessagingService`. We keep the Dart-side handler thin
/// — Kotlin `MeriFirebaseMessagingService.handleIncomingCall` owns the
/// full-screen intent + `IncomingCallService` foreground start. The Dart
/// isolate here just parses the payload for optional analytics + no-ops on
/// `incoming_call` so we don't accidentally show a second banner.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  // Firebase.initializeApp() is required inside the background isolate.
  await Firebase.initializeApp();
  if (kDebugMode) {
    // ignore: avoid_print
    print(
      '[M13][FCM/bg] type=${message.data['type']} callId=${message.data['call_id']}',
    );
  }
  // No UI work here — native service handles the ringer. Foreground/UI
  // handling lives in IncomingCallListener.
}

class FirebaseBootstrap {
  FirebaseBootstrap._();

  static bool _initialized = false;

  static Future<void> init() async {
    if (_initialized) return;
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
      _initialized = true;
    } catch (e) {
      if (kDebugMode) {
        // ignore: avoid_print
        print('[M13][Firebase] init failed: $e');
      }
    }
  }
}
