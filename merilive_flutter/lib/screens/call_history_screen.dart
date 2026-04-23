import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/api_service.dart';

class CallHistoryScreen extends StatefulWidget {
  const CallHistoryScreen({super.key});

  @override
  State<CallHistoryScreen> createState() => _CallHistoryScreenState();
}

class _CallHistoryScreenState extends State<CallHistoryScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _calls = [];
  int _commissionPercent = 55;
  RealtimeChannel? _callSubscription;

  @override
  void initState() {
    super.initState();
    _fetchCallHistory();
    _setupRealtimeSubscription();
  }

  @override
  void dispose() {
    _callSubscription?.unsubscribe();
    super.dispose();
  }

  void _setupRealtimeSubscription() {
    final supa = Supabase.instance.client;
    _callSubscription = supa.channel('call-history-realtime').onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'private_calls',
      callback: (payload) {
        debugPrint('[CallHistory] Realtime update detected - refetching');
        _fetchCallHistory();
      },
    ).subscribe();
  }

  Future<void> _fetchCallHistory() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    
    try {
      final supa = Supabase.instance.client;
      final userId = _api.currentUserId;
      if (userId == null) return;

      // 1. Fetch commission from settings
      final settingsRes = await supa.from('app_settings').select('setting_value').eq('setting_key', 'call_rates').maybeSingle();
      if (settingsRes != null && settingsRes['setting_value'] != null) {
        final callRates = settingsRes['setting_value'] as Map<String, dynamic>;
        if (callRates.containsKey('host_commission_percent')) {
          _commissionPercent = (callRates['host_commission_percent'] as num).toInt();
        } else {
          debugPrint('CRITICAL: host_commission_percent not configured in Admin Panel!');
          _commissionPercent = 0; // Safe fallback matching web parity
        }
      } else {
        debugPrint('CRITICAL: call_rates not found in app_settings! Host earnings will show 0.');
        _commissionPercent = 0;
      }

      // 2. Fetch private calls
      final callsRes = await supa
          .from('private_calls')
          .select('*, caller:profiles!caller_id(id, display_name, avatar_url, is_verified), host:profiles!host_id(id, display_name, avatar_url, is_verified)')
          .or('caller_id.eq.$userId,host_id.eq.$userId')
          .order('created_at', ascending: false)
          .limit(50);

      if (mounted) {
        setState(() {
          _calls = List<Map<String, dynamic>>.from(callsRes);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Error fetching call history: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  String _formatDuration(int? seconds) {
    if (seconds == null || seconds <= 0) return '0:00';
    final mins = seconds ~/ 60;
    final secs = seconds % 60;
    return '$mins:${secs.toString().padLeft(2, '0')}';
  }

  String _formatDate(String dateStr) {
    final date = DateTime.parse(dateStr).toLocal();
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inDays == 0) {
      return DateFormat.jm().format(date);
    } else if (diff.inDays == 1) {
      return 'Yesterday';
    } else if (diff.inDays < 7) {
      return DateFormat.E().format(date);
    } else {
      return DateFormat.MMMd().format(date);
    }
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'completed':
        return Colors.greenAccent;
      case 'missed':
      case 'declined':
        return Colors.redAccent;
      case 'cancelled':
        return Colors.amberAccent;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0515),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text("Call History", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: _isLoading 
          ? const Center(child: CircularProgressIndicator(color: Colors.pink))
          : _calls.isEmpty 
              ? _buildEmptyState()
              : RefreshIndicator(
                  onRefresh: _fetchCallHistory,
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    itemCount: _calls.length,
                    itemBuilder: (context, index) => _buildCallCard(_calls[index]),
                  ),
                ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
            child: const Icon(LucideIcons.phone, size: 48, color: Colors.white24),
          ),
          const SizedBox(height: 24),
          Text("No Call History", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text("Your call history will appear here", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 14)),
        ],
      ),
    );
  }

  Widget _buildCallCard(Map<String, dynamic> call) {
    final userId = _api.currentUserId;
    final bool isOutgoing = call['caller_id'] == userId;
    final otherUser = isOutgoing ? call['host'] : call['caller'];
    final String status = call['status'] ?? 'unknown';
    final int coinsSpent = call['coins_spent'] ?? 0;
    final int hostEarnings = (coinsSpent * _commissionPercent / 100).floor();

    return Container(
      margin: const EdgeInsets.bottom(12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          // Avatar
          Stack(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: Colors.white10,
                backgroundImage: otherUser?['avatar_url'] != null ? NetworkImage(otherUser!['avatar_url']) : null,
                child: otherUser?['avatar_url'] == null ? Text(otherUser?['display_name']?[0] ?? '?', style: const TextStyle(color: Colors.white)) : null,
              ),
              if (otherUser?['is_verified'] == true)
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.all(2),
                    decoration: const BoxDecoration(color: Colors.blue, shape: BoxShape.circle),
                    child: const Icon(Icons.check, size: 10, color: Colors.white),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 16),
          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(otherUser?['display_name'] ?? 'Unknown User', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15), overflow: TextOverflow.ellipsis)),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: _getStatusColor(status).withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                      child: Text(status.toUpperCase(), style: TextStyle(color: _getStatusColor(status), fontSize: 8, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(isOutgoing ? LucideIcons.phone : LucideIcons.phoneOff, size: 12, color: Colors.white38),
                    const SizedBox(width: 4),
                    Text(isOutgoing ? "Outgoing" : "Incoming", style: const TextStyle(color: Colors.white38, fontSize: 11)),
                    const SizedBox(width: 12),
                    if (call['duration_seconds'] != null && call['duration_seconds'] > 0) ...[
                      const Icon(LucideIcons.clock, size: 12, color: Colors.white38),
                      const SizedBox(width: 4),
                      Text(_formatDuration(call['duration_seconds']), style: const TextStyle(color: Colors.white38, fontSize: 11)),
                    ],
                  ],
                ),
                if (coinsSpent > 0) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      if (isOutgoing) ...[
                        const Icon(LucideIcons.coins, size: 12, color: Colors.redAccent),
                        const SizedBox(width: 4),
                        Text("-$coinsSpent", style: const TextStyle(color: Colors.redAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                      ] else ...[
                        const Icon(LucideIcons.trendingUp, size: 12, color: Colors.greenAccent),
                        const SizedBox(width: 4),
                        Text("+$hostEarnings", style: const TextStyle(color: Colors.greenAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                      ],
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Time
          Text(_formatDate(call['created_at']), style: const TextStyle(color: Colors.white24, fontSize: 10)),
        ],
      ),
    );
  }
}
