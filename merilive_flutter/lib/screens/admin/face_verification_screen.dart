import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:video_player/video_player.dart';
import '../../services/api_service.dart';
import '../../models/profile_model.dart';

class AdminFaceVerificationScreen extends StatefulWidget {
  const AdminFaceVerificationScreen({super.key});

  @override
  State<AdminFaceVerificationScreen> createState() => _AdminFaceVerificationScreenState();
}

class _AdminFaceVerificationScreenState extends State<AdminFaceVerificationScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  List<Map<String, dynamic>> _submissions = [];
  bool _isLoading = true;
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadSubmissions();
  }

  Future<void> _loadSubmissions() async {
    setState(() => _isLoading = true);
    final res = await _api.getAdminFaceVerificationSubmissions();
    setState(() {
      _submissions = res;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildHeader(),
        _buildStats(),
        _buildTabs(),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildList('pending'),
              _buildList('approved'),
              _buildList('rejected'),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      child: Container(
        height: 44,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.03),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white70),
        ),
        child: TextField(
          style: const TextStyle(color: Colors.white, fontSize: 13),
          decoration: const InputDecoration(
            hintText: "Search by UID or Name...",
            hintStyle: TextStyle(color: Colors.white24, fontSize: 13),
            prefixIcon: Icon(LucideIcons.search, color: Colors.white24, size: 16),
            border: InputBorder.none,
            contentPadding: EdgeInsets.symmetric(vertical: 11),
          ),
          onChanged: (val) => setState(() => _searchQuery = val),
        ),
      ),
    );
  }

  Widget _buildStats() {
    final pendingCount = _submissions.where((s) => s['status'] == 'pending').length;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Row(
        children: [
          _buildStatItem("Pending", pendingCount.toString(), Colors.amber),
          const SizedBox(width: 12),
          _buildStatItem("Total", _submissions.length.toString(), Colors.purpleAccent),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: GoogleFonts.outfit(color: color, fontSize: 20, fontWeight: FontWeight.bold)),
            Text(label, style: TextStyle(color: color.withOpacity(0.6), fontSize: 10, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(14),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: const Color(0xFF6366F1), borderRadius: BorderRadius.circular(10)),
        dividerColor: Colors.transparent,
        tabs: const [Tab(text: "Pending"), Tab(text: "Approved"), Tab(text: "Rejected")],
        labelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
        unselectedLabelColor: Colors.white24,
      ),
    );
  }

  Widget _buildList(String status) {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    
    final filtered = _submissions.where((s) => 
      s['status'] == status && 
      (s['user']['display_name'].toString().toLowerCase().contains(_searchQuery.toLowerCase()) || 
       s['user']['app_uid'].toString().contains(_searchQuery))
    ).toList();

    if (filtered.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.scanFace, color: Colors.white54, size: 48),
            const SizedBox(height: 12),
            Text("No $status requests", style: const TextStyle(color: Colors.white10)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(24),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final s = filtered[index];
        return _buildSubmissionCard(s, index);
      },
    );
  }

  Widget _buildSubmissionCard(Map<String, dynamic> s, int index) {
    final user = s['user'];
    final type = s['verification_type'] as String;
    
    return FadeInUp(
      delay: Duration(milliseconds: 50 * index),
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white70),
        ),
        child: Column(
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 12, 
                  backgroundImage: user['avatar_url'] != null ? NetworkImage(user['avatar_url']) : null,
                  backgroundColor: Colors.white10,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user['display_name'] ?? 'Unknown User', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      Text("UID: ${user['app_uid']}", style: const TextStyle(color: Colors.white38, fontSize: 11)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: type == 'host' ? Colors.pink.withOpacity(0.1) : Colors.blue.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(type.toUpperCase(), style: TextStyle(color: type == 'host' ? Colors.pinkAccent : Colors.blueAccent, fontSize: 10, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: _buildMediaPreview(s['face_image_url'] ?? user['avatar_url'], "Face Photo"),
                ),
                const SizedBox(width: 12),
                if (type == 'host' && s['video_url'] != null)
                  Expanded(child: _buildMediaPreview(null, "10s Video", isVideo: true)),
                const SizedBox(width: 12),
                _buildDetailsBtn(s),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMediaPreview(String? url, String label, {bool isVideo = false}) {
    return Container(
      height: 80,
      decoration: BoxDecoration(
        color: Colors.black26,
        borderRadius: BorderRadius.circular(12),
        image: url != null ? DecorationImage(image: NetworkImage(url), fit: BoxFit.cover) : null,
      ),
      child: Center(
        child: isVideo 
          ? const Icon(LucideIcons.playCircle, color: Colors.white70)
          : url == null ? const Icon(LucideIcons.image, color: Colors.white10) : null,
      ),
    );
  }

  Widget _buildDetailsBtn(Map<String, dynamic> s) {
    return InkWell(
      onTap: () => _showDetailsModal(s),
      child: Container(
        height: 80,
        width: 60,
        decoration: BoxDecoration(
          color: const Color(0xFF6366F1).withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.3)),
        ),
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.eye, color: Color(0xFF6366F1), size: 20),
            SizedBox(height: 4),
            Text("Review", style: TextStyle(color: Color(0xFF6366F1), fontSize: 10, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  void _showDetailsModal(Map<String, dynamic> s) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _SubmissionDetailsSheet(submission: s, onProcessed: _loadSubmissions),
    );
  }
}

class _SubmissionDetailsSheet extends StatefulWidget {
  final Map<String, dynamic> submission;
  final VoidCallback onProcessed;
  const _SubmissionDetailsSheet({required this.submission, required this.onProcessed});

  @override
  State<_SubmissionDetailsSheet> createState() => _SubmissionDetailsSheetState();
}

class _SubmissionDetailsSheetState extends State<_SubmissionDetailsSheet> {
  final ApiService _api = ApiService();
  bool _isProcessing = false;
  final TextEditingController _reasonController = TextEditingController();

  Future<void> _process(String action) async {
    setState(() => _isProcessing = true);
    final success = await _api.adminProcessFaceVerification(
      submissionId: widget.submission['id'],
      action: action,
      reason: _reasonController.text.isNotEmpty ? _reasonController.text : null,
      approveAs: widget.submission['verification_type'],
      setGender: widget.submission['user']['gender'] ?? (widget.submission['verification_type'] == 'host' ? 'female' : 'male'),
    );
    
    if (success) {
      widget.onProcessed();
      Navigator.pop(context);
    } else {
      setState(() => _isProcessing = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to process")));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.submission;
    final user = s['user'];
    
    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 24),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(radius: 15, backgroundImage: NetworkImage(user['avatar_url'] ?? '')),
                      const SizedBox(width: 20),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(user['display_name'], style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                          Text("UID ${user['app_uid']}", style: const TextStyle(color: Colors.white38)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 32),
                  const Text("FACE PHOTO", style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: Image.network(s['face_image_url'] ?? user['avatar_url'], width: double.infinity, height: 300, fit: BoxFit.cover),
                  ),
                  const SizedBox(height: 32),
                  if (s['verification_type'] == 'host' && s['video_url'] != null) ...[
                    const Text("10s INTRODUCTION VIDEO", style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
                    const SizedBox(height: 12),
                    Container(
                      height: 200,
                      width: double.infinity,
                      decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white10)),
                      child: const Center(child: Icon(LucideIcons.playCircle, color: Colors.white, size: 48)),
                    ),
                    const SizedBox(height: 32),
                  ],
                  if (s['status'] == 'pending') ...[
                    TextField(
                      controller: _reasonController,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: "Reason (Only if rejecting)",
                        hintStyle: const TextStyle(color: Colors.white24),
                        filled: true,
                        fillColor: Colors.white.withOpacity(0.03),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                      ),
                    ),
                    const SizedBox(height: 32),
                    Row(
                      children: [
                        Expanded(child: _buildActionBtn("Reject", Colors.redAccent, () => _process('reject'))),
                        const SizedBox(width: 16),
                        Expanded(child: _buildActionBtn("Approve", Colors.greenAccent, () => _process('approve'), isPrimary: true)),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionBtn(String label, Color color, VoidCallback onTap, {bool isPrimary = false}) {
    return InkWell(
      onTap: _isProcessing ? null : onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: isPrimary ? color : color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(16),
          border: isPrimary ? null : Border.all(color: color.withOpacity(0.3)),
        ),
        child: Center(
          child: _isProcessing 
            ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(label, style: TextStyle(color: isPrimary ? Colors.white : color, fontWeight: FontWeight.bold)),
        ),
      ),
    );
  }
}


