import 'dart:io';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:uuid/uuid.dart';

class CallKitService {
  static final CallKitService _instance = CallKitService._internal();
  factory CallKitService() => _instance;
  CallKitService._internal();

  String? currentCallId;

  Future<void> showIncomingCall({
    required String callerName,
    required String roomId,
    String? avatar,
    String type = 'video',
  }) async {
    currentCallId = const Uuid().v4();
    
    final CallKitParams params = CallKitParams(
      id: currentCallId,
      nameCaller: callerName,
      appName: 'MeriLive',
      avatar: avatar,
      handle: 'Incoming $type call',
      type: type == 'video' ? 1 : 0, // 0: audio, 1: video
      duration: 30000,
      textAccept: 'Accept',
      textDecline: 'Decline',
      extra: <String, dynamic>{'userId': roomId, 'roomId': roomId},
      headers: <String, dynamic>{'apiKey': 'merilive_premium'},
      android: const AndroidParams(
        isCustomNotification: true,
        isShowLogo: false,
        ringtonePath: 'premium_ringtone',
        backgroundColor: '#0F172A',
        backgroundUrl: 'https://i.ibb.co/L8N9H7p/premium-call-bg.png',
        actionColor: '#6366F1',
        incomingCallNotificationChannelName: 'Incoming Calls',
        isShowFullLockedScreen: true,
      ),
      ios: const IOSParams(
        iconName: 'AppIcon',
        handleType: 'generic',
        supportsVideo: true,
        maximumCallGroups: 2,
        maximumCallsPerCallGroup: 1,
        audioSessionMode: 'videoChat',
        audioSessionActive: true,
        supportsDTMF: true,
        supportsHolding: true,
        supportsGrouping: true,
        supportsUngrouping: true,
        ringtonePath: 'premium_ringtone.caf',
      ),
    );

    await FlutterCallkitIncoming.showCallkitIncoming(params);
  }

  Future<void> endCurrentCall() async {
    if (currentCallId != null) {
      await FlutterCallkitIncoming.endCall(currentCallId!);
      currentCallId = null;
    }
  }

  Future<void> endAllCalls() async {
    await FlutterCallkitIncoming.endAllCalls();
    currentCallId = null;
  }
}


