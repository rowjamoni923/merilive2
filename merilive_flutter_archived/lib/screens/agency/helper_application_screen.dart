import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';

class HelperApplicationScreen extends StatefulWidget {
  const HelperApplicationScreen({super.key});

  @override
  State<HelperApplicationScreen> createState() => _HelperApplicationScreenState();
}

class _HelperApplicationScreenState extends State<HelperApplicationScreen> {
  final ApiService _api = ApiService();
  final _supabase = Supabase.instance.client;
  
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();
  final TextEditingController _remarksController = TextEditingController();
  
  File? _idFront;
  File? _idBack;
  bool _isLoading = false;
  bool _agreed = false;
  bool _requestPayroll = true;
  String _selectedCountry = "BD";

  Future<void> _pickImage(bool isFront) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (picked != null) {
      setState(() {
        if (isFront) _idFront = File(picked.path);
        else _idBack = File(picked.path);
      });
    }
  }

  Future<void> _submitApplication() async {
    if (!_agreed) return;
    if (_nameController.text.isEmpty || _addressController.text.isEmpty || _idFront == null || _idBack == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Please complete all fields and upload ID images.")));
      return;
    }
    
    setState(() => _isLoading = true);
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return;

      // 1. Upload Images
      final frontUrl = await _api.uploadChatMedia(_idFront!.path, 'helper_verifications');
      final backUrl = await _api.uploadChatMedia(_idBack!.path, 'helper_verifications');

      // 2. Insert Application
      await _supabase.from('helper_applications').insert({
        'user_id': user.id,
        'full_name': _nameController.text.trim(),
        'address': _addressController.text.trim(),
        'id_front_url': frontUrl,
        'id_back_url': backUrl,
        'country_code': _selectedCountry,
        'payroll_access_requested': _requestPayroll,
        'remarks': _remarksController.text.trim(),
        'status': 'pending',
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("🎉 Application submitted for Master Review!"), backgroundColor: Colors.greenAccent, foregroundColor: Colors.black),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      debugPrint("Application Error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(),
                  const SizedBox(height: 32),
                  _buildIntroCard(),
                  const SizedBox(height: 32),
                  _buildIdentitySection(),
                  const SizedBox(height: 32),
                  _buildVerificationSection(),
                  const SizedBox(height: 32),
                  _buildPreferencesSection(),
                  const SizedBox(height: 32),
                  _buildAgreementToggle(),
                  const SizedBox(height: 40),
                  _buildSubmitButton(),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
          if (_isLoading)
            const Center(child: CircularProgressIndicator(color: Colors.cyanAccent)),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        IconButton(icon: const Icon(LucideIcons.chevronLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Helper Application", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
            Text("Master Copy • Global Payroll Permit", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11)),
          ],
        ),
      ],
    );
  }

  Widget _buildIntroCard() {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.shieldCheck, color: Colors.cyanAccent, size: 28),
          const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Verification Required", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                Text("To manage high-fidelity settlements, identity verification is mandatory.", style: TextStyle(color: Colors.white38, fontSize: 11, height: 1.4)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIdentitySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("LEGAL IDENTITY", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)),
        const SizedBox(height: 16),
        _buildTextField("FULL NAME (AS PER ID)", _nameController, LucideIcons.user),
        const SizedBox(height: 16),
        _buildTextField("FULL RESIDENTIAL ADDRESS", _addressController, LucideIcons.mapPin, maxLines: 2),
      ],
    );
  }

  Widget _buildTextField(String label, TextEditingController controller, IconData icon, {int maxLines = 1}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        style: const TextStyle(color: Colors.white, fontSize: 14),
        decoration: InputDecoration(
          icon: Icon(icon, color: Colors.white24, size: 18),
          labelText: label,
          labelStyle: const TextStyle(color: Colors.white24, fontSize: 10),
          border: InputBorder.none,
        ),
      ),
    );
  }

  Widget _buildVerificationSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("ID VERIFICATION (FRONT & BACK)", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: _buildIdUploadTile("FRONT SIDE", _idFront, () => _pickImage(true))),
            const SizedBox(width: 16),
            Expanded(child: _buildIdUploadTile("BACK SIDE", _idBack, () => _pickImage(false))),
          ],
        ),
      ],
    );
  }

  Widget _buildIdUploadTile(String label, File? file, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 120,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
          image: file != null ? DecorationImage(image: FileImage(file), fit: BoxFit.cover) : null,
        ),
        child: file == null ? Column(mainAxisAlignment: MainAxisAlignment.center, children: [const Icon(LucideIcons.camera, color: Colors.white24), const SizedBox(height: 8), Text(label, style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold))]) : null,
      ),
    );
  }

  Widget _buildPreferencesSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("NEXUS PREFERENCES", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)),
        const SizedBox(height: 16),
        SwitchListTile(
          value: _requestPayroll,
          onChanged: (v) => setState(() => _requestPayroll = v),
          title: Text("Request Payroll Access", style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
          subtitle: const Text("Allow me to settle agency withdrawals", style: TextStyle(color: Colors.white24, fontSize: 11)),
          activeColor: Colors.cyanAccent,
          contentPadding: EdgeInsets.zero,
        ),
      ],
    );
  }

  Widget _buildAgreementToggle() {
    return Row(
      children: [
        Checkbox(
          value: _agreed,
          onChanged: (v) => setState(() => _agreed = v!),
          activeColor: Colors.cyanAccent,
          checkColor: Colors.black,
          side: const BorderSide(color: Colors.white24),
        ),
        const Expanded(
          child: Text("I certify that all identification documents and info provided are accurate and legal.", style: TextStyle(color: Colors.white38, fontSize: 11)),
        ),
      ],
    );
  }

  Widget _buildSubmitButton() {
    return FadeInUp(
      child: SizedBox(
        width: double.infinity,
        height: 60,
        child: ElevatedButton(
          onPressed: _agreed && !_isLoading ? _submitApplication : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.cyanAccent,
            foregroundColor: Colors.black,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          ),
          child: Text("SUBMIT FOR MASTER REVIEW", style: GoogleFonts.outfit(fontWeight: FontWeight.w900, fontSize: 14, letterSpacing: 1.5)),
        ),
      ),
    );
  }
}
