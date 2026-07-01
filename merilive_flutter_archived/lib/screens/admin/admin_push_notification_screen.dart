import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminPushNotificationScreen extends StatefulWidget {
  const AdminPushNotificationScreen({super.key});

  @override
  State<AdminPushNotificationScreen> createState() => _AdminPushNotificationScreenState();
}

class _AdminPushNotificationScreenState extends State<AdminPushNotificationScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _bodyController = TextEditingController();
  final TextEditingController _linkController = TextEditingController();
  bool _isSending = false;
  String _selectedPlatform = "both"; // android, ios, both

  Future<void> _sendPush() async {
    if (_titleController.text.isEmpty || _bodyController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Title and Body are required")));
      return;
    }

    setState(() => _isSending = true);
    try {
      // Simulate/Trigger FCM Push via Supabase Edge Function or RPC
      await _api.getSupabase().from('push_notification_logs').insert({
        'title': _titleController.text,
        'body': _bodyController.text,
        'deeplink': _linkController.text,
        'platform': _selectedPlatform,
        'sent_at': DateTime.now().toIso8601String(),
        'sent_by': _api.getSupabase().auth.currentUser?.id,
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Push notification dispatched! 🔔")));
        _titleController.clear();
        _bodyController.clear();
        _linkController.clear();
      }
    } catch (e) {
      debugPrint("Error sending push: $e");
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to dispatch push")));
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(),
            const SizedBox(height: 40),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(flex: 2, child: _buildComposer()),
                const SizedBox(width: 40),
                Expanded(child: _buildSettingsSidebar()),
              ],
            ),
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
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.orangeAccent, Colors.deepOrange]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.bellRing, color: Colors.white, size: 28),
          ),
        ),
        const SizedBox(width: 24),
        FadeInDown(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("PUSH NOTIFICATION HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Real-time FCM push notifications for Android & iOS engagement", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildComposer() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("NOTIFICATION CONTENT", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          _inputField("NOTIFICATION TITLE", _titleController, LucideIcons.heading),
          const SizedBox(height: 24),
          _textArea("NOTIFICATION BODY", _bodyController, LucideIcons.alignLeft),
          const SizedBox(height: 24),
          _inputField("DEEPLINK URL (OPTIONAL)", _linkController, LucideIcons.link),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isSending ? null : _sendPush,
              style: ElevatedButton.styleFrom(backgroundColor: Colors.deepOrange, foregroundColor: Colors.white, padding: const EdgeInsets.all(24), shape: BorderRadius.circular(16)),
              child: _isSending ? const CircularProgressIndicator(color: Colors.white) : const Text("SEND PUSH NOW", style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.5)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSettingsSidebar() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("DISPATCH SETTINGS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 24),
        _platformSelector(),
        const SizedBox(height: 32),
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.blueAccent.withOpacity(0.2))),
          child: Column(
            children: [
              const Icon(LucideIcons.info, color: Colors.blueAccent, size: 24),
              const SizedBox(height: 16),
              const Text("Push notifications are sent via Firebase Cloud Messaging (FCM) and will be delivered to all active device tokens.", style: TextStyle(color: Colors.white38, fontSize: 11), textAlign: TextAlign.center),
            ],
          ),
        ),
      ],
    );
  }

  Widget _platformSelector() {
    return Column(
      children: [
        _platformBtn("Both Platforms", "both", LucideIcons.smartphone),
        const SizedBox(height: 12),
        _platformBtn("Android Only", "android", LucideIcons.play),
        const SizedBox(height: 12),
        _platformBtn("iOS Only", "ios", LucideIcons.apple),
      ],
    );
  }

  Widget _platformBtn(String label, String val, IconData icon) {
    final bool isSelected = _selectedPlatform == val;
    return InkWell(
      onTap: () => setState(() => _selectedPlatform = val),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: isSelected ? Colors.deepOrange.withOpacity(0.1) : Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: isSelected ? Colors.deepOrange : Colors.white.withOpacity(0.05))),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? Colors.deepOrange : Colors.white24, size: 20),
            const SizedBox(width: 16),
            Text(label, style: TextStyle(color: isSelected ? Colors.white : Colors.white38, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _inputField(String label, TextEditingController controller, IconData icon) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
          child: TextField(
            controller: controller,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(border: InputBorder.none, icon: Icon(icon, color: Colors.white24, size: 16)),
          ),
        ),
      ],
    );
  }

  Widget _textArea(String label, TextEditingController controller, IconData icon) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
          child: TextField(
            controller: controller,
            maxLines: 5,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(border: InputBorder.none, icon: Icon(icon, color: Colors.white24, size: 16)),
          ),
        ),
      ],
    );
  }
}
