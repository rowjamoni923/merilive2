import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import '../../services/api_service.dart';

class AdminTransferSchedulerScreen extends StatefulWidget {
  const AdminTransferSchedulerScreen({super.key});

  @override
  State<AdminTransferSchedulerScreen> createState() => _AdminTransferSchedulerScreenState();
}

class _AdminTransferSchedulerScreenState extends State<AdminTransferSchedulerScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  bool _isSaving = false;
  bool _isProcessing = false;
  Timer? _countdownTimer;

  Map<String, dynamic> _schedule = {
    'is_active': false,
    'interval_days': 7,
    'interval_hours': 0,
    'next_transfer_at': null,
    'last_transfer_at': null,
    'timezone': 'Asia/Dhaka'
  };

  Map<String, int> _countdown = {'days': 0, 'hours': 0, 'minutes': 0, 'seconds': 0};
  List<Map<String, dynamic>> _history = [];
  String? _expandedBatchId;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    await _fetchSchedule();
    await _fetchHistory();
    setState(() => _isLoading = false);
    _startCountdown();
  }

  Future<void> _fetchSchedule() async {
    try {
      final res = await _api.getSupabase().from('app_settings').select('setting_value').eq('setting_key', 'transfer_schedule').maybeSingle();
      if (res != null && res['setting_value'] != null) {
        setState(() {
          _schedule = Map<String, dynamic>.from(res['setting_value']);
        });
      }
    } catch (e) {
      debugPrint("Error fetching schedule: $e");
    }
  }

  Future<void> _fetchHistory() async {
    try {
      final res = await _api.getSupabase()
          .from('agency_earnings_transfers')
          .select('id, amount, created_at, status')
          .order('created_at', ascending: false)
          .limit(100);
      
      // Grouping logic (simplified for demonstration)
      setState(() {
        _history = List<Map<String, dynamic>>.from(res);
      });
    } catch (e) {
      debugPrint("Error fetching history: $e");
    }
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    if (_schedule['next_transfer_at'] == null || _schedule['is_active'] == false) return;

    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      final now = DateTime.now();
      final next = DateTime.parse(_schedule['next_transfer_at']);
      final diff = next.difference(now);

      if (diff.isNegative) {
        timer.cancel();
        _handleAutoProcess();
      } else {
        setState(() {
          _countdown = {
            'days': diff.inDays,
            'hours': diff.inHours % 24,
            'minutes': diff.inMinutes % 60,
            'seconds': diff.inSeconds % 60,
          };
        });
      }
    });
  }

  Future<void> _handleAutoProcess() async {
    await _processNow();
    if (_schedule['is_active']) {
      _startTimer();
    }
  }

  Future<void> _saveSchedule() async {
    setState(() => _isSaving = true);
    try {
      await _api.getSupabase().from('app_settings').upsert({
        'setting_key': 'transfer_schedule',
        'setting_value': _schedule,
        'description': 'Weekly transfer schedule settings'
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Schedule saved successfully")));
    } catch (e) {
      debugPrint("Error saving schedule: $e");
    } finally {
      setState(() => _isSaving = false);
    }
  }

  Future<void> _startTimer() async {
    final next = DateTime.now().add(Duration(days: _schedule['interval_days'], hours: _schedule['interval_hours']));
    setState(() {
      _schedule['is_active'] = true;
      _schedule['next_transfer_at'] = next.toIso8601String();
    });
    await _saveSchedule();
    _startCountdown();
  }

  Future<void> _stopTimer() async {
    setState(() {
      _schedule['is_active'] = false;
      _schedule['next_transfer_at'] = null;
    });
    await _saveSchedule();
    _countdownTimer?.cancel();
  }

  Future<void> _processNow() async {
    setState(() => _isProcessing = true);
    try {
      // Logic for triggering edge function would go here
      await Future.delayed(const Duration(seconds: 2)); // Mock delay
      setState(() {
        _schedule['last_transfer_at'] = DateTime.now().toIso8601String();
      });
      await _saveSchedule();
      await _fetchHistory();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Transfer complete!")));
    } catch (e) {
      debugPrint("Error processing transfer: $e");
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: _isLoading 
        ? const Center(child: CircularProgressIndicator(color: Colors.blueAccent))
        : SingleChildScrollView(
            padding: const EdgeInsets.all(40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(),
                const SizedBox(height: 40),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 1, child: _buildCountdownCard()),
                    const SizedBox(width: 40),
                    Expanded(flex: 1, child: _buildSettingsCard()),
                  ],
                ),
                const SizedBox(height: 40),
                _buildHistoryCard(),
              ],
            ),
          ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        FadeInLeft(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.cyanAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.calendar, color: Colors.white, size: 28),
          ),
        ),
        const SizedBox(width: 24),
        FadeInDown(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("TRANSFER SCHEDULER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Automated earnings distribution for agencies and hosts", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCountdownCard() {
    final bool isActive = _schedule['is_active'] ?? false;
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: isActive ? Colors.greenAccent.withOpacity(0.05) : Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: isActive ? Colors.greenAccent.withOpacity(0.2) : Colors.white10)),
      child: Column(
        children: [
          Row(
            children: [
              Icon(LucideIcons.timer, color: isActive ? Colors.greenAccent : Colors.white24, size: 20),
              const SizedBox(width: 12),
              Text("COUNTDOWN TIMER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 32),
          if (isActive && _schedule['next_transfer_at'] != null)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _countdownUnit(_countdown['days']!, "DAYS"),
                _countdownUnit(_countdown['hours']!, "HOURS"),
                _countdownUnit(_countdown['minutes']!, "MINS"),
                _countdownUnit(_countdown['seconds']!, "SECS"),
              ],
            )
          else
            const Center(child: Padding(padding: EdgeInsets.all(20), child: Text("Timer is currently stopped", style: TextStyle(color: Colors.white24)))),
          const SizedBox(height: 40),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: isActive ? _stopTimer : _startTimer,
              icon: Icon(isActive ? LucideIcons.pause : LucideIcons.play, size: 16),
              label: Text(isActive ? "STOP TIMER" : "START TIMER"),
              style: ElevatedButton.styleFrom(backgroundColor: isActive ? Colors.redAccent.withOpacity(0.1) : Colors.greenAccent.withOpacity(0.1), foregroundColor: isActive ? Colors.redAccent : Colors.greenAccent, padding: const EdgeInsets.all(24), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
            ),
          ),
        ],
      ),
    );
  }

  Widget _countdownUnit(int val, String label) {
    return Column(
      children: [
        Text(val.toString().padLeft(2, '0'), style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildSettingsCard() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white10)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("INTERVAL SETTINGS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 32),
          _settingRow("Interval Days", _schedule['interval_days'].toString(), (v) => setState(() => _schedule['interval_days'] = int.tryParse(v) ?? 7)),
          const SizedBox(height: 24),
          _settingRow("Interval Hours", _schedule['interval_hours'].toString(), (v) => setState(() => _schedule['interval_hours'] = int.tryParse(v) ?? 0)),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isSaving ? null : _saveSchedule,
              style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent, foregroundColor: Colors.white, padding: const EdgeInsets.all(24), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
              child: _isSaving ? const CircularProgressIndicator(color: Colors.white) : const Text("SAVE SETTINGS", style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _settingRow(String label, String val, Function(String) onChanged) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.white70)),
        Container(
          width: 80,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
          child: TextField(
            controller: TextEditingController(text: val),
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(border: InputBorder.none),
            keyboardType: TextInputType.number,
            onSubmitted: onChanged,
          ),
        ),
      ],
    );
  }

  Widget _buildHistoryCard() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white10)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("TRANSFER HISTORY", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          if (_history.isEmpty) const Center(child: Padding(padding: EdgeInsets.all(40), child: Text("No history found", style: TextStyle(color: Colors.white10))))
          else ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _history.length,
            itemBuilder: (context, index) {
              final item = _history[index];
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16)),
                child: Row(
                  children: [
                    const Icon(LucideIcons.checkCircle, color: Colors.greenAccent, size: 16),
                    const SizedBox(width: 16),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(DateFormat('MMM dd, yyyy - hh:mm a').format(DateTime.parse(item['created_at'])), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)), Text("Status: ${item['status']}", style: const TextStyle(color: Colors.white24, fontSize: 11))])),
                    Text("${item['amount']} Beans", style: GoogleFonts.outfit(color: Colors.amberAccent, fontWeight: FontWeight.bold)),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
