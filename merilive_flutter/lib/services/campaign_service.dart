import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import 'api_service.dart';

class CampaignService extends ChangeNotifier {
  static final CampaignService _instance = CampaignService._internal();
  factory CampaignService() => _instance;
  CampaignService._internal();

  final ApiService _apiService = ApiService();
  
  // Ephemeral session start time (resets on app launch)
  static final Map<String, DateTime> _sessionStarts = {};
  
  Map<String, dynamic>? _activeCampaign;
  int _remainingSeconds = 0;
  bool _isPurchased = false;
  Timer? _timer;

  Map<String, dynamic>? get activeCampaign => _activeCampaign;
  int get remainingSeconds => _remainingSeconds;
  bool get isPurchased => _isPurchased;
  bool get isActive => _activeCampaign != null && _remainingSeconds > 0 && !_isPurchased;

  /// Initializes the campaign check and session timer
  Future<void> init() async {
    final campaign = await _apiService.getActiveRechargeCampaign();
    if (campaign == null) {
      _activeCampaign = null;
      _stopTimer();
      notifyListeners();
      return;
    }

    final id = campaign['id'].toString();
    
    // Check purchase status in SharedPreferences
    final prefs = await SharedPreferences.getInstance();
    _isPurchased = prefs.getBool('campaign_purchased_$id') ?? false;

    if (_isPurchased) {
      _activeCampaign = null;
      _stopTimer();
      notifyListeners();
      return;
    }

    // Handle Audience/Gender logic (Web parity)
    final profile = await _apiService.getMyProfile();
    final isHost = profile?['gender'] == 'Female';
    if (isHost) {
       _activeCampaign = null;
       notifyListeners();
       return;
    }

    // Target Audience check (all, new_users)
    final audience = campaign['target_audience'] ?? 'all';
    if (audience == 'new_users') {
      final createdAt = DateTime.parse(profile?['created_at'] ?? DateTime.now().toIso8601String());
      final ageHours = DateTime.now().difference(createdAt).inHours;
      if (ageHours > 24) {
        _activeCampaign = null;
        notifyListeners();
        return;
      }
    }

    // Session Timer logic
    if (!_sessionStarts.containsKey(id)) {
      _sessionStarts[id] = DateTime.now();
    }

    final sessionStart = _sessionStarts[id]!;
    final durationMins = campaign['duration_minutes'] ?? 60;
    final expiryTime = sessionStart.add(Duration(minutes: durationMins));
    
    _activeCampaign = campaign;
    _remainingSeconds = expiryTime.difference(DateTime.now()).inSeconds;

    if (_remainingSeconds <= 0) {
      _activeCampaign = null;
      _stopTimer();
    } else {
      _startTimer();
    }

    notifyListeners();
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_remainingSeconds > 0) {
        _remainingSeconds--;
        notifyListeners();
      } else {
        _activeCampaign = null;
        _timer?.cancel();
        notifyListeners();
      }
    });
  }

  void _stopTimer() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> markAsPurchased() async {
    if (_activeCampaign == null) return;
    final id = _activeCampaign!['id'].toString();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('campaign_purchased_$id', true);
    _isPurchased = true;
    _activeCampaign = null;
    _stopTimer();
    notifyListeners();
  }

  @override
  void dispose() {
    _stopTimer();
    super.dispose();
  }
}


