import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_realtime_service.dart';

class StreamService with ChangeNotifier {
  static final StreamService _instance = StreamService._internal();
  factory StreamService() => _instance;
  StreamService._internal();

  final _supabase = Supabase.instance.client;
  final _realtime = SupabaseRealtimeService();

  Timer? _heartbeatTimer;
  Map<String, dynamic>? _activeStream;
  int _viewerCount = 0;
  bool _loading = true;

  Map<String, dynamic>? get activeStream => _activeStream;
  int get viewerCount => _viewerCount;
  bool get loading => _loading;

  void init(String? streamId, {bool isHost = false}) {
    if (streamId == null) return;
    
    _fetchStreamData(streamId);
    
    if (isHost) {
      _startHeartbeat(streamId);
    }

    _realtime.subscribe(
      subscriberId: 'stream-service-$streamId',
      tables: ['live_streams', 'stream_viewers'],
      callback: (table, event, payload) {
        if (table == 'live_streams' && payload['id'] == streamId) {
          _activeStream = payload;
          if (payload['is_active'] == false) {
            _stopHeartbeat();
          }
          notifyListeners();
        } else if (table == 'stream_viewers' && payload['stream_id'] == streamId) {
          _fetchViewerCount(streamId);
        }
      },
    );
  }

  Future<void> _fetchStreamData(String streamId) async {
    try {
      final res = await _supabase.from('live_streams').select().eq('id', streamId).single();
      _activeStream = res;
      _fetchViewerCount(streamId);
      _loading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('[Stream] Fetch error: $e');
    }
  }

  Future<void> _fetchViewerCount(String streamId) async {
    try {
      final res = await _supabase.from('stream_viewers').select('*', count: CountOption.exact, head: true).eq('stream_id', streamId).eq('is_active', true);
      _viewerCount = res.count;
      notifyListeners();
    } catch (e) {
      debugPrint('[Stream] ViewerCount error: $e');
    }
  }

  void _startHeartbeat(String streamId) {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 15), (timer) async {
      try {
        await _supabase.rpc('update_stream_heartbeat', params: {'stream_id': streamId});
      } catch (e) {
        debugPrint('[Stream] Heartbeat failed: $e');
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  Future<void> endStream(String streamId) async {
    _stopHeartbeat();
    try {
      await _supabase.from('live_streams').update({
        'is_active': false,
        'ended_at': DateTime.now().toIso8601String(),
      }).eq('id', streamId);
      _activeStream = null;
      notifyListeners();
    } catch (e) {
      debugPrint('[Stream] End error: $e');
    }
  }

  void disposeStream(String streamId) {
    _realtime.unsubscribe('stream-service-$streamId');
    _stopHeartbeat();
    _activeStream = null;
    _viewerCount = 0;
    _loading = true;
  }
}
