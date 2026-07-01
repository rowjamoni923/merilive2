import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminNotificationTemplatesScreen extends StatefulWidget {
  const AdminNotificationTemplatesScreen({super.key});

  @override
  State<AdminNotificationTemplatesScreen> createState() => _AdminNotificationTemplatesScreenState();
}

class _AdminNotificationTemplatesScreenState extends State<AdminNotificationTemplatesScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _templates = [];

  @override
  void initState() {
    super.initState();
    _loadTemplates();
  }

  Future<void> _loadTemplates() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('notification_templates').select('*').order('template_key');
      setState(() {
        _templates = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading templates: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildInfoBanner(),
        Expanded(
          child: _isLoading 
            ? const Center(child: CircularProgressIndicator(color: Colors.indigoAccent))
            : _buildTemplatesList(),
        ),
      ],
    );
  }

  Widget _buildInfoBanner() {
    return Container(
      margin: const EdgeInsets.all(32),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.indigoAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.indigoAccent.withOpacity(0.1))),
      child: Row(
        children: [
          const Icon(LucideIcons.info, color: Colors.indigoAccent, size: 20),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text("Variable Injection Guide", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                Text("Use {{code}}, {{agency_name}}, or {{display_name}} to inject dynamic values into templates.", style: TextStyle(color: Colors.white24, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTemplatesList() {
    if (_templates.isEmpty) return const Center(child: Text("No notification templates found", style: TextStyle(color: Colors.white24)));

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      itemCount: _templates.length,
      itemBuilder: (context, index) {
        final t = _templates[index];
        final String key = t['template_key'] ?? "";
        
        return FadeInUp(
          delay: Duration(milliseconds: 15 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 20),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Text(_getIcon(key), style: const TextStyle(fontSize: 20)),
                        const SizedBox(width: 12),
                        Text(_getLabel(key), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                      ],
                    ),
                    _miniBadge(key, Colors.white10),
                  ],
                ),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Colors.black.withOpacity(0.2), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(t['title_template'] ?? "No Title", style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.bold, fontSize: 13)),
                      const SizedBox(height: 4),
                      Text(t['message_template'] ?? "No Message", style: const TextStyle(color: Colors.white24, fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(child: _actionBtn(LucideIcons.eye, "PREVIEW", Colors.white10)),
                    const SizedBox(width: 12),
                    Expanded(child: _actionBtn(LucideIcons.edit3, "EDIT TEMPLATE", Colors.indigoAccent)),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _actionBtn(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.1))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 14),
          const SizedBox(width: 10),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 10)),
        ],
      ),
    );
  }

  Widget _miniBadge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(6)),
      child: Text(label, style: const TextStyle(color: Colors.white38, fontSize: 7, fontWeight: FontWeight.bold)),
    );
  }

  String _getIcon(String key) {
    if (key.contains('verification')) return "🔐";
    if (key.contains('created')) return "🎉";
    if (key.contains('welcome')) return "👋";
    return "📢";
  }

  String _getLabel(String key) {
    return key.split('_').map((s) => s[0].toUpperCase() + s.substring(1)).join(' ');
  }
}
