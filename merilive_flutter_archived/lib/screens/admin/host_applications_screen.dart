import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminHostApplicationsScreen extends StatefulWidget {
  const AdminHostApplicationsScreen({super.key});

  @override
  State<AdminHostApplicationsScreen> createState() => _AdminHostApplicationsScreenState();
}

class _AdminHostApplicationsScreenState extends State<AdminHostApplicationsScreen> {
  final ApiService _api = ApiService();
  List<Map<String, dynamic>> _applications = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadApplications();
  }

  Future<void> _loadApplications() async {
    setState(() => _isLoading = true);
    final apps = await _api.getAdminHostApplications();
    setState(() {
      _applications = apps;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    if (_applications.isEmpty) return const Center(child: Text("No pending applications", style: TextStyle(color: Colors.white24)));

    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text("HOST APPLICATIONS", style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
              Text("${_applications.length} Pending", style: const TextStyle(color: Colors.pinkAccent, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 20),
          Expanded(
            child: ListView.builder(
              itemCount: _applications.length,
              itemBuilder: (context, index) {
                final app = _applications[index];
                final user = app['user'] as Map<String, dynamic>?;
                final agency = app['agency'] as Map<String, dynamic>?;

                return FadeInUp(
                  delay: Duration(milliseconds: 50 * index),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.03),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: Colors.white70),
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            CircleAvatar(radius: 10, backgroundImage: user?['avatar_url'] != null ? NetworkImage(user?['avatar_url']) : null, backgroundColor: Colors.white10),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(user?['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                                  Text("UID: ${user?['app_uid'] ?? 'N/A'}", style: const TextStyle(color: Colors.white38, fontSize: 11)),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(DateFormat('MMM dd, HH:mm').format(DateTime.parse(app['created_at'])), style: const TextStyle(color: Colors.white24, fontSize: 10)),
                              ],
                            ),
                          ],
                        ),
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child: Divider(color: Colors.white70, height: 1),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text("TARGET AGENCY", style: TextStyle(color: Colors.white38, fontSize: 9, fontWeight: FontWeight.bold)),
                                Text(agency?['name'] ?? 'N/A', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                                Text("Code: ${agency?['agency_code'] ?? 'N/A'}", style: const TextStyle(color: Color(0xFF6366F1), fontSize: 10)),
                              ],
                            ),
                            Row(
                              children: [
                                _buildReviewBtn(LucideIcons.x, Colors.red, "Reject", () => _handleAction(app, 'rejected')),
                                const SizedBox(width: 12),
                                _buildReviewBtn(LucideIcons.check, Colors.green, "Approve", () => _handleAction(app, 'approved')),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReviewBtn(IconData icon, Color color, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.3))),
        child: Row(
          children: [
            Icon(icon, color: color, size: 12),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Future<void> _handleAction(Map<String, dynamic> app, String status) async {
    showDialog(context: context, barrierDismissible: false, builder: (_) => const Center(child: CircularProgressIndicator()));
    final ok = await _api.adminUpdateHostApplicationStatus(app['id'], app['user_id'], status);
    if (!mounted) return;
    Navigator.pop(context);
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Application $status"), backgroundColor: status == 'approved' ? Colors.green : Colors.red));
      _loadApplications();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Operation failed"), backgroundColor: Colors.red));
    }
  }
}


