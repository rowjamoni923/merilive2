import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_realtime_service.dart';

class AgencyService with ChangeNotifier {
  static final AgencyService _instance = AgencyService._internal();
  factory AgencyService() => _instance;
  AgencyService._internal();

  final _supabase = Supabase.instance.client;
  final _realtime = SupabaseRealtimeService();

  Map<String, dynamic>? _agency;
  List<Map<String, dynamic>> _hosts = [];
  List<Map<String, dynamic>> _pendingHosts = [];
  List<Map<String, dynamic>> _performance = [];
  List<Map<String, dynamic>> _subAgents = [];
  Map<String, dynamic>? _weeklySummary;
  bool _loading = true;

  Map<String, dynamic>? get agency => _agency;
  List<Map<String, dynamic>> get hosts => _hosts;
  List<Map<String, dynamic>> get pendingHosts => _pendingHosts;
  List<Map<String, dynamic>> get performance => _performance;
  List<Map<String, dynamic>> get subAgents => _subAgents;
  Map<String, dynamic>? get weeklySummary => _weeklySummary;
  bool get loading => _loading;

  void init(String userId) {
    _fetchAgencyData(userId);

    _realtime.subscribe(
      subscriberId: 'agency-service-$userId',
      tables: ['agencies', 'agency_hosts', 'agency_performance', 'sub_agents'],
      callback: (table, event, payload) {
        if (table == 'agencies' && payload['owner_id'] == userId) {
          _agency = payload;
          notifyListeners();
        } else {
          _fetchAgencyData(userId);
        }
      },
    );
  }

  Future<void> _fetchAgencyData(String userId) async {
    try {
      final agencyRes = await _supabase.from('agencies').select().eq('owner_id', userId).maybeSingle();
      if (agencyRes == null) {
        _loading = false;
        notifyListeners();
        return;
      }

      _agency = agencyRes;
      final agencyId = agencyRes['id'];

      // Batch fetch related data
      final results = await Future.wait([
        _supabase.from('agency_hosts').select('*, profile:profiles(*)').eq('agency_id', agencyId).eq('status', 'active'),
        _supabase.from('agency_hosts').select('*, profile:profiles(*)').eq('agency_id', agencyId).eq('status', 'pending'),
        _supabase.from('agency_performance').select().eq('agency_id', agencyId).eq('period_type', 'daily').order('period_start', ascending: true).limit(7),
        _supabase.from('sub_agents').select('*, profile:profiles(*)').eq('agency_id', agencyId).eq('status', 'active'),
        _supabase.from('agency_performance').select().eq('agency_id', agencyId).eq('period_type', 'weekly').order('period_start', ascending: false).limit(1).maybeSingle(),
      ]);

      _hosts = List<Map<String, dynamic>>.from(results[0] as List);
      _pendingHosts = List<Map<String, dynamic>>.from(results[1] as List);
      _performance = List<Map<String, dynamic>>.from(results[2] as List);
      _subAgents = List<Map<String, dynamic>>.from(results[3] as List);
      _weeklySummary = results[4] as Map<String, dynamic>?;

      _loading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('[Agency] Fetch error: $e');
    }
  }

  Future<void> approveHost(String hostId) async {
    if (_agency == null) return;
    try {
      await _supabase.rpc('approve_host_request', params: {
        '_agency_id': _agency!['id'],
        '_host_id': hostId,
        '_approver_id': _supabase.auth.currentUser?.id,
      });
      _fetchAgencyData(_supabase.auth.currentUser!.id);
    } catch (e) {
      debugPrint('[Agency] ApproveHost error: $e');
    }
  }

  Future<void> rejectHost(String hostId) async {
    if (_agency == null) return;
    try {
      await _supabase
          .from('agency_hosts')
          .update({'status': 'rejected'})
          .eq('agency_id', _agency!['id'])
          .eq('host_id', hostId)
          .eq('status', 'pending');
      _fetchAgencyData(_supabase.auth.currentUser!.id);
    } catch (e) {
      debugPrint('[Agency] RejectHost error: $e');
    }
  }

  void disposeAgency(String userId) {
    _realtime.unsubscribe('agency-service-$userId');
    _agency = null;
    _hosts = [];
    _pendingHosts = [];
    _performance = [];
    _subAgents = [];
    _loading = true;
  }
}
