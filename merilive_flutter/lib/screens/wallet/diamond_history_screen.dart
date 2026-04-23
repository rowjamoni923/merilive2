import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';

class DiamondHistoryScreen extends StatefulWidget {
  const DiamondHistoryScreen({super.key});

  @override
  State<DiamondHistoryScreen> createState() => _DiamondHistoryScreenState();
}

class _DiamondHistoryScreenState extends State<DiamondHistoryScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _logs = [];

  @override
  void initState() {
    super.initState();
    _loadLogs();
  }

  Future<void> _loadLogs() async {
    setState(() => _isLoading = true);
    try {
      final userId = _api.getSupabase().auth.currentUser?.id;
      if (userId != null) {
        final res = await _api.getSupabase()
            .from('diamond_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', ascending: false)
            .limit(50);
        setState(() => _logs = List<Map<String, dynamic>>.from(res));
      }
    } catch (e) {
      debugPrint("Diamond Logs Error: $e");
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildAppBar(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
                    : _buildContent(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
              child: const Icon(LucideIcons.chevronLeft, color: Colors.white, size: 20),
            ),
          ),
          const SizedBox(width: 16),
          Text(
            "Diamond History",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    if (_logs.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.listX, color: Colors.white12, size: 64),
            const SizedBox(height: 16),
            Text("No transactions record", style: TextStyle(color: Colors.white24)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      itemCount: _logs.length,
      itemBuilder: (context, index) {
        final log = _logs[index];
        final isCredit = log['type'] == 'recharge' || (log['amount'] ?? 0) > 0;
        final amount = (log['amount'] ?? 0).abs();
        final date = DateTime.tryParse(log['created_at'] ?? '') ?? DateTime.now();

        return FadeInUp(
          delay: Duration(milliseconds: 30 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.03),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white12),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: (isCredit ? Colors.green : Colors.red).withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    isCredit ? LucideIcons.plus : LucideIcons.minus,
                    color: isCredit ? Colors.greenAccent : Colors.redAccent,
                    size: 16,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        log['description'] ?? (isCredit ? "Diamond Recharge" : "Diamond Spent"),
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      Text(
                        DateFormat('MMM dd, yyyy • hh:mm a').format(date),
                        style: const TextStyle(color: Colors.white38, fontSize: 10),
                      ),
                    ],
                  ),
                ),
                Text(
                  "${isCredit ? '+' : '-'}${_api.formatNumber(amount)}",
                  style: TextStyle(
                    color: isCredit ? Colors.greenAccent : Colors.redAccent,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}


