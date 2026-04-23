import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';

class JoinAgencyScreen extends StatefulWidget {
  const JoinAgencyScreen({super.key});

  @override
  State<JoinAgencyScreen> createState() => _JoinAgencyScreenState();
}

class _JoinAgencyScreenState extends State<JoinAgencyScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _codeController = TextEditingController();
  
  bool _isLoading = true;
  bool _isSearching = false;
  bool _isJoining = false;
  Map<String, dynamic>? _pendingRequest;
  Map<String, dynamic>? _foundAgency;
  bool _agencyNotFound = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final userId = _api.getSupabase().auth.currentUser?.id;
      if (userId == null) return;

      // Check for pending/active request via RPC (Parity with web)
      final request = await _api.getHostAgencyRequest(userId);
      
      if (mounted) {
        setState(() {
          _pendingRequest = request;
          _isLoading = false;
        });

        if (request != null && request['status'] == 'active') {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("✅ Already a member of ${request['agency_name']}")),
          );
          Navigator.pop(context);
        }
      }
    } catch (e) {
      debugPrint("Error loading data: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSearch() async {
    final code = _codeController.text.trim().toUpperCase();
    if (code.isEmpty) return;

    setState(() {
      _isSearching = true;
      _foundAgency = null;
      _agencyNotFound = false;
    });

    try {
      final agency = await _api.searchAgencyByCode(code);
      if (mounted) {
        setState(() {
          _foundAgency = agency;
          _agencyNotFound = agency == null;
          _isSearching = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _isSearching = false; _agencyNotFound = true; });
    }
  }

  Future<void> _handleJoin() async {
    if (_foundAgency == null) return;
    
    setState(() => _isJoining = true);
    try {
      final userId = _api.getSupabase().auth.currentUser?.id;
      if (userId == null) return;

      final res = await _api.joinAgencyV2(
        hostId: userId, 
        agencyCode: _foundAgency!['agency_code'],
        joinedVia: 'code'
      );

      if (res['success']) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("✅ Request sent to ${_foundAgency!['name']}")),
        );
        _loadData();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['error'] ?? "Failed to join"), backgroundColor: Colors.redAccent),
        );
      }
    } catch (e) {
      debugPrint("Join error: $e");
    } finally {
      if (mounted) setState(() => _isJoining = false);
    }
  }

  Future<void> _handleCancel() async {
    final userId = _api.getSupabase().auth.currentUser?.id;
    if (userId == null) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1F1235),
        title: const Text("Cancel Request", style: TextStyle(color: Colors.white)),
        content: const Text("Are you sure you want to cancel your join request?", style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("No")),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text("Yes, Cancel", style: TextStyle(color: Colors.redAccent))),
        ],
      ),
    );

    if (confirm != true) return;

    final ok = await _api.cancelAgencyRequestV2(userId);
    if (ok) {
      setState(() {
        _pendingRequest = null;
        _foundAgency = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Request cancelled")));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        backgroundColor: const Color(0xFF0F051A),
        body: Center(child: CircularProgressIndicator(color: Colors.greenAccent.shade400)),
      );
    }

    if (_pendingRequest != null) {
      if (_pendingRequest!['status'] == 'rejected') return _buildRejectedView();
      return _buildTimelineView();
    }

    return _buildSearchView();
  }

  Widget _buildSearchView() {
    return Scaffold(
      backgroundColor: const Color(0xFF0F051A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text("Join Agency", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
        centerTitle: true,
      ),
      body: Stack(
        children: [
          const NebulaBackground(),
          SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FadeInDown(
                  child: Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [Colors.green.shade600, Colors.emerald.shade700]),
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [BoxShadow(color: Colors.green.withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 10))],
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(16)),
                          child: const Icon(LucideIcons.userPlus, color: Colors.white, size: 28),
                        ),
                        const SizedBox(width: 16),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text("Join Agency", style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                              Text("Join with agency code", style: TextStyle(color: Colors.white70, fontSize: 13)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 32),
                Text("Enter Agency Code", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _buildTextField(
                        controller: _codeController,
                        hint: "e.g. AG123ABC",
                        icon: LucideIcons.search,
                        onSubmitted: (_) => _handleSearch(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    GestureDetector(
                      onTap: _isSearching ? null : _handleSearch,
                      child: Container(
                        height: 56,
                        width: 56,
                        decoration: BoxDecoration(color: const Color(0xFF6366F1), borderRadius: BorderRadius.circular(16)),
                        child: _isSearching 
                          ? const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)))
                          : const Icon(LucideIcons.arrowRight, color: Colors.white),
                      ),
                    ),
                  ],
                ),
                if (_foundAgency != null) FadeInUp(child: _buildFoundAgencyCard()),
                if (_agencyNotFound) FadeInUp(child: _buildNotFoundCard()),
                const SizedBox(height: 32),
                _buildInfoSection(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFoundAgencyCard() {
    return Container(
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.greenAccent.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 60, height: 60,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Colors.purple, Colors.indigo]),
                  borderRadius: BorderRadius.circular(16)
                ),
                child: const Icon(LucideIcons.building2, color: Colors.white, size: 30),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_foundAgency!['name'] ?? '', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                    Text("Code: ${_foundAgency!['agency_code']}", style: const TextStyle(color: Colors.greenAccent, fontSize: 12, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: Colors.greenAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                child: Text(_foundAgency!['level'] ?? 'A1', style: const TextStyle(color: Colors.greenAccent, fontSize: 12, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: _isJoining ? null : _handleJoin,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.greenAccent.shade700,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: _isJoining 
                ? const CircularProgressIndicator(color: Colors.white)
                : const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(LucideIcons.userPlus, size: 20),
                      SizedBox(width: 12),
                      Text("SEND JOIN REQUEST", style: TextStyle(fontWeight: FontWeight.bold)),
                    ],
                  ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimelineView() {
    return Scaffold(
      backgroundColor: const Color(0xFF0F051A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text("Waiting for Approval"),
        centerTitle: true,
      ),
      body: Stack(
        children: [
          const NebulaBackground(),
          SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                FadeInDown(
                  child: Container(
                    padding: const EdgeInsets.all(32),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(32),
                      border: Border.all(color: Colors.white12),
                    ),
                    child: Column(
                      children: [
                        Container(
                          width: 80, height: 80,
                          decoration: BoxDecoration(color: Colors.amber.withOpacity(0.1), shape: BoxShape.circle),
                          child: const Icon(LucideIcons.clock, color: Colors.amber, size: 40),
                        ),
                        const SizedBox(height: 24),
                        const Text("Request Pending", style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        const Text("Your request is waiting for agency approval", style: TextStyle(color: Colors.white54, fontSize: 14), textAlign: TextAlign.center),
                        const SizedBox(height: 32),
                        _buildMiniAgencyCard(),
                        const SizedBox(height: 40),
                        _buildTimeline(),
                        const SizedBox(height: 40),
                        _buildActions(),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                _buildTipsSection(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniAgencyCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(20)),
      child: Row(
        children: [
          Container(
            width: 50, height: 50,
            decoration: BoxDecoration(color: Colors.indigo.withOpacity(0.2), borderRadius: BorderRadius.circular(12)),
            child: const Icon(LucideIcons.building2, color: Colors.indigoAccent, size: 24),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_pendingRequest!['agency_name'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                Text("Code: ${_pendingRequest!['agency_code']}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
              ],
            ),
          ),
          Text(_pendingRequest!['agency_level'] ?? 'A1', style: const TextStyle(color: Colors.amber, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildTimeline() {
    return Column(
      children: [
        _buildStep(true, "Request Submitted", "Your application has been sent."),
        _buildLine(true),
        _buildStep(false, "Waiting for Approval", "Agency owner will review your request.", isCurrent: true),
        _buildLine(false),
        _buildStep(false, "Join Approved", "You'll be notified when approved."),
      ],
    );
  }

  Widget _buildStep(bool done, String title, String subtitle, {bool isCurrent = false}) {
    return Row(
      children: [
        Container(
          width: 32, height: 32,
          decoration: BoxDecoration(
            color: done ? Colors.greenAccent : (isCurrent ? Colors.amber : Colors.white10),
            shape: BoxShape.circle,
          ),
          child: Icon(
            done ? LucideIcons.check : (isCurrent ? LucideIcons.clock : LucideIcons.userPlus),
            size: 16, color: done || isCurrent ? Colors.black : Colors.white24,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: TextStyle(color: done || isCurrent ? Colors.white : Colors.white38, fontWeight: FontWeight.bold)),
              Text(subtitle, style: const TextStyle(color: Colors.white38, fontSize: 11)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLine(bool done) {
    return Container(
      margin: const EdgeInsets.only(left: 15),
      width: 2, height: 30,
      color: done ? Colors.greenAccent.withOpacity(0.3) : Colors.white10,
    );
  }

  Widget _buildActions() {
    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          height: 50,
          child: OutlinedButton.icon(
            onPressed: _loadData,
            icon: const Icon(LucideIcons.refreshCw, size: 18),
            label: const Text("CHECK STATUS"),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.amber,
              side: const BorderSide(color: Colors.amber),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextButton.icon(
          onPressed: _handleCancel,
          icon: const Icon(LucideIcons.xCircle, size: 18, color: Colors.redAccent),
          label: const Text("CANCEL REQUEST", style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
        ),
      ],
    );
  }

  Widget _buildRejectedView() {
    return Scaffold(
      backgroundColor: const Color(0xFF0F051A),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(40),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 100, height: 100,
                decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.1), shape: BoxShape.circle),
                child: const Icon(LucideIcons.xCircle, color: Colors.redAccent, size: 50),
              ),
              const SizedBox(height: 32),
              const Text("Request Rejected", style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Text("Your request to join ${_pendingRequest!['agency_name']} was rejected.", style: const TextStyle(color: Colors.white54), textAlign: TextAlign.center),
              const SizedBox(height: 48),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: () => setState(() => _pendingRequest = null),
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.greenAccent.shade700, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                  child: const Text("TRY ANOTHER AGENCY"),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNotFoundCard() {
    return Container(
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.redAccent.withOpacity(0.3))),
      child: const Row(
        children: [
          Icon(LucideIcons.alertCircle, color: Colors.redAccent),
          SizedBox(width: 16),
          Text("Agency not found. Check code.", style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildInfoSection() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.amber.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.amber.withOpacity(0.1))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(LucideIcons.info, color: Colors.amber.shade400, size: 20),
              const SizedBox(width: 12),
              const Text("How it works", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 16),
          _infoItem("Get agency code from the owner"),
          _infoItem("Search using the code"),
          _infoItem("Click 'Send Join Request'"),
          _infoItem("Wait for agency approval"),
        ],
      ),
    );
  }

  Widget _infoItem(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          const Icon(LucideIcons.checkCircle, color: Colors.amber, size: 14),
          const SizedBox(width: 12),
          Text(text, style: const TextStyle(color: Colors.white60, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildTipsSection() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.blueAccent.withOpacity(0.1))),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("💡 Tips", style: TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold)),
          SizedBox(height: 12),
          Text("• Approval usually takes 24-48 hours", style: TextStyle(color: Colors.white60, fontSize: 12)),
          Text("• You'll be notified when approved", style: TextStyle(color: Colors.white60, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildTextField({required TextEditingController controller, required String hint, required IconData icon, Function(String)? onSubmitted}) {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white12)),
      child: TextField(
        controller: controller,
        onSubmitted: onSubmitted,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: Colors.white24, fontSize: 14),
          prefixIcon: Icon(icon, color: Colors.white38, size: 20),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.all(16),
        ),
      ),
    );
  }
}
}


