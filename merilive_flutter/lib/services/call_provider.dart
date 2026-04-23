import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/api_service.dart';
import '../services/supabase_realtime_service.dart';
import '../widgets/call/call_confirm_modal.dart';
import '../widgets/call/incoming_call_modal.dart';
import '../widgets/call/call_ended_modal.dart';
import '../screens/premium_private_call_screen.dart';

class CallProvider with ChangeNotifier {
  final ApiService _api = ApiService();
  final SupabaseClient _supabase = Supabase.instance.client;
  final _realtime = SupabaseRealtimeService();

  // State
  Map<String, dynamic>? _currentCall;
  Map<String, dynamic>? _incomingCall;
  bool _isIncomingModalOpen = false;
  bool _isCallEndedModalOpen = false;
  Map<String, dynamic>? _endedCallInfo;
  
  // High-fidelity call state
  String? _activeCallId;
  String _status = 'idle'; // idle, calling, ringing, connected, ended
  int _duration = 0;
  int _coinsPerMinute = 0;
  int _totalCoinsSpent = 0;
  int _hostEarned = 0;
  int _callerRemainingCoins = 0;

  // Timers & Refs
  Timer? _durationTimer;
  Timer? _billingTimer;
  Timer? _billingFetchTimer;
  Timer? _callTimeoutTimer;
  final Set<String> _endedCallIds = {};
  bool _billingStarted = false;
  bool _mediaConnected = false;

  CallProvider() {
    _initIncomingListener();
    _initRealtimeListener();
  }

  // Getters
  String get status => _status;
  Map<String, dynamic>? get incomingCall => _incomingCall;
  bool get isIncomingModalOpen => _isIncomingModalOpen;
  bool get isCallEndedModalOpen => _isCallEndedModalOpen;
  Map<String, dynamic>? get endedCallInfo => _endedCallInfo;
  int get duration => _duration;
  int get totalCoinsSpent => _totalCoinsSpent;
  int get hostEarned => _hostEarned;

  void _initIncomingListener() {
    final userId = _api.currentUserId;
    if (userId == null) return;

    _supabase.channel('incoming-call-$userId').onBroadcast(
      event: 'incoming_call',
      callback: (payload) {
        final callId = payload['callId'];
        if (callId == null || _endedCallIds.contains(callId)) return;
        
        // Don't show if actively in another call
        if (_activeCallId != null && _activeCallId != callId && (_status == 'connected' || _status == 'calling' || _status == 'ringing')) return;

        _incomingCall = payload;
        _isIncomingModalOpen = true;
        notifyListeners();
      },
    ).subscribe();
  }

  void _initRealtimeListener() {
    final userId = _api.currentUserId;
    if (userId == null) return;

    _realtime.subscribe(
      subscriberId: 'call-provider-$userId',
      tables: ['private_calls'],
      callback: (table, event, payload) {
        final callId = payload['id'];
        if (callId == null || _endedCallIds.contains(callId)) return;

        // Caller side update
        if (payload['caller_id'] == userId) {
          _handleCallerUpdate(callId, payload);
        }
        
        // Host side update
        if (payload['host_id'] == userId) {
          _handleHostUpdate(callId, payload);
        }
      },
    );
  }

  void _handleCallerUpdate(String callId, Map<String, dynamic> payload) {
    if (_activeCallId != null && _activeCallId != callId) return;

    final newStatus = payload['status'];
    if (newStatus == 'ringing' && _status == 'calling') {
      _status = 'ringing';
      notifyListeners();
    } else if (newStatus == 'connected' && _status != 'connected') {
      _activateConnectedState(callId, payload);
    } else if (newStatus == 'ended' || newStatus == 'declined' || newStatus == 'missed') {
      _softEndCall();
    }
  }

  void _handleHostUpdate(String callId, Map<String, dynamic> payload) {
    // Handle incoming call if not already shown
    if (_incomingCall == null && (payload['status'] == 'pending' || payload['status'] == 'ringing')) {
       _incomingCall = {
         'callId': callId,
         'callerId': payload['caller_id'],
         'callerName': 'User', // Would fetch profile if needed
       };
       _isIncomingModalOpen = true;
       notifyListeners();
    }

    final newStatus = payload['status'];
    if (newStatus == 'ended' || newStatus == 'declined' || newStatus == 'missed') {
      _softEndCall();
    }
  }

  void _activateConnectedState(String callId, Map<String, dynamic> payload) {
    if (_endedCallIds.contains(callId)) return;

    _activeCallId = callId;
    _status = 'connected';
    _billingStarted = true;
    _mediaConnected = false;
    _duration = 0;
    _totalCoinsSpent = 0;
    _hostEarned = 0;
    _coinsPerMinute = payload['coins_per_minute'] ?? 0;

    // Start 5s billing fetch interval for display parity
    _billingFetchTimer?.cancel();
    _billingFetchTimer = Timer.periodic(const Duration(seconds: 5), (timer) async {
      if (_status != 'connected') {
        timer.cancel();
        return;
      }
      final res = await _supabase.from('private_calls').select('total_coins_deducted, host_earned').eq('id', callId).single();
      _totalCoinsSpent = res['total_coins_deducted'] ?? 0;
      _hostEarned = res['host_earned'] ?? 0;
      notifyListeners();
    });

    notifyListeners();
  }

  void notifyMediaConnected(String callId) {
    if (_activeCallId != callId || _mediaConnected || _status != 'connected') return;
    _mediaConnected = true;

    // Start 1s duration timer
    _durationTimer?.cancel();
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      _duration++;
      notifyListeners();
    });

    // Start 60s billing cycle for caller
    if (_activeCallId != null && _status == 'connected') {
       _billingTimer?.cancel();
       _billingTimer = Timer.periodic(const Duration(seconds: 60), (timer) {
         _deductCoins(callId);
       });
       // First deduction
       _deductCoins(callId);
    }
  }

  Future<void> _deductCoins(String callId) async {
    try {
      final res = await _supabase.rpc('deduct_call_coins_per_minute', params: {'p_call_id': callId});
      if (res['success'] == false && res['call_ended'] == true) {
        _softEndCall();
      } else {
        _callerRemainingCoins = res['caller_remaining'] ?? _callerRemainingCoins;
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[Billing] Error: $e');
    }
  }

  void _softEndCall() {
    if (_status == 'ended') return;
    if (_activeCallId != null) _endedCallIds.add(_activeCallId!);
    
    _status = 'ended';
    _billingStarted = false;
    _mediaConnected = false;
    
    _durationTimer?.cancel();
    _billingTimer?.cancel();
    _billingFetchTimer?.cancel();
    _callTimeoutTimer?.cancel();

    // Prepare info for modal
    _endedCallInfo = {
      'remoteUserName': 'User', // Placeholder
      'duration': _duration,
      'totalCoinsSpent': _totalCoinsSpent,
      'hostEarned': _hostEarned,
      'isHost': _incomingCall != null, // Simple check
    };
    _isCallEndedModalOpen = true;
    
    _activeCallId = null;
    _incomingCall = null;
    _isIncomingModalOpen = false;
    notifyListeners();
    
    _api.supabase.rpc('reset_my_call_status').catchError((e) => null);
  }

  // --- Outgoing Call Flow ---
  Future<void> startCall(BuildContext context, {
    required String hostId,
    required String hostName,
    String? hostAvatar,
    int hostLevel = 1,
  }) async {
    final userId = _api.currentUserId;
    if (userId == null) return;

    // Show Confirmation Modal
    CallConfirmModal.show(
      context,
      hostId: hostId,
      hostName: hostName,
      hostAvatar: hostAvatar,
      hostLevel: hostLevel,
      userCoins: 0, // Should fetch real balance
      onConfirm: () => _initiateCall(context, hostId, hostName, hostAvatar, hostLevel),
    );
  }

  Future<void> _initiateCall(BuildContext context, String hostId, String hostName, String? hostAvatar, int hostLevel) async {
    _status = 'calling';
    _activeCallId = null;
    notifyListeners();

    try {
      final res = await _supabase.rpc('start_private_call', params: {
        'p_caller_id': _api.currentUserId,
        'p_receiver_id': hostId,
        'p_call_type': 'video',
      });

      final callId = res is String ? res : res['call_id'];
      _activeCallId = callId;
      
      // Send instant broadcast
      _supabase.channel('incoming-call-$hostId').subscribe((status, [error]) {
        if (status == RealtimeSubscribeStatus.subscribed) {
          _supabase.channel('incoming-call-$hostId').sendBroadcastEvent(
            event: 'incoming_call',
            payload: {
              'callId': callId,
              'callerId': _api.currentUserId,
              'callerName': 'Me', 
            },
          );
        }
      });

      // Navigate
      if (context.mounted) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PremiumPrivateCallScreen(
              callId: callId,
              remoteUserId: hostId,
              remoteUserName: hostName,
              remoteUserAvatar: hostAvatar,
              remoteUserLevel: hostLevel,
              isHost: false,
            ),
          ),
        );
      }
    } catch (e) {
      _status = 'idle';
      notifyListeners();
    }
  }

  // --- Incoming Call Actions ---
  void acceptIncomingCall(BuildContext context) async {
    if (_incomingCall == null) return;
    final callId = _incomingCall!['callId'];

    _status = 'connected';
    _activeCallId = callId;
    _isIncomingModalOpen = false;
    notifyListeners();

    try {
      await _supabase.rpc('accept_private_call', params: {'_call_id': callId});
      
      if (context.mounted) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PremiumPrivateCallScreen(
              callId: callId,
              remoteUserId: _incomingCall!['callerId'],
              remoteUserName: _incomingCall!['callerName'],
              isHost: true,
            ),
          ),
        );
      }
    } catch (e) {
      _softEndCall();
    }
  }

  void declineIncomingCall() {
    if (_incomingCall == null) return;
    _supabase.rpc('decline_private_call', params: {'_call_id': _incomingCall!['callId']});
    _isIncomingModalOpen = false;
    _incomingCall = null;
    notifyListeners();
  }

  void dismissCallEnded() {
    _isCallEndedModalOpen = false;
    _endedCallInfo = null;
    notifyListeners();
  }
}
