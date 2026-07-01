import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class PhoneSignInButton extends StatefulWidget {
  final bool agreed;
  final String? referralCode;
  final VoidCallback onSuccess;

  const PhoneSignInButton({
    super.key,
    required this.agreed,
    this.referralCode,
    required this.onSuccess,
  });

  @override
  State<PhoneSignInButton> createState() => _PhoneSignInButtonState();
}

class _PhoneSignInButtonState extends State<PhoneSignInButton> {
  final ApiService _api = ApiService();
  bool _isLoading = false;

  void _handlePhoneClick() {
    if (!widget.agreed) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please agree to User Agreement and Privacy Policy to continue.")),
      );
      return;
    }
    
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => PhoneAuthDialog(
        referralCode: widget.referralCode,
        onSuccess: widget.onSuccess,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: 48,
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF14B8A6), Color(0xFF06B6D4)]),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: const Color(0xFF10B981).withOpacity(0.3), blurRadius: 24, offset: const Offset(0, 6)),
        ],
        border: Border.all(color: const Color(0xFF34D399).withOpacity(0.3)),
      ),
      child: ElevatedButton(
        onPressed: _isLoading ? null : _handlePhoneClick,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(LucideIcons.phone, size: 16),
            SizedBox(width: 12),
            Text("Phone", style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class PhoneAuthDialog extends StatefulWidget {
  final String? referralCode;
  final VoidCallback onSuccess;

  const PhoneAuthDialog({super.key, this.referralCode, required this.onSuccess});

  @override
  State<PhoneAuthDialog> createState() => _PhoneAuthDialogState();
}

class _PhoneAuthDialogState extends State<PhoneAuthDialog> {
  final ApiService _api = ApiService();
  String _step = "phone"; // phone, gender, name, otp
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _otpController = TextEditingController();
  String? _selectedGender;
  bool _isLoading = false;

  void _nextStep(String step) => setState(() => _step = step);

  Future<void> _handleSendOtp() async {
    if (_phoneController.text.length < 6) return;
    setState(() => _isLoading = true);
    // Simulate OTP send
    await Future.delayed(const Duration(seconds: 1));
    setState(() => _isLoading = false);
    _nextStep("gender");
  }

  Future<void> _handleVerifyOtp() async {
    if (_otpController.text.length != 6) return;
    setState(() => _isLoading = true);
    try {
      // Logic would call apiService.verifyOtp
      await Future.delayed(const Duration(seconds: 1));
      Navigator.pop(context);
      widget.onSuccess();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Invalid OTP")));
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF111827), Color(0xFF4C1D95), Color(0xFF111827)],
          ),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(color: Colors.purple.withOpacity(0.3)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_step == "phone") _buildPhoneStep(),
            if (_step == "gender") _buildGenderStep(),
            if (_step == "name") _buildNameStep(),
            if (_step == "otp") _buildOtpStep(),
          ],
        ),
      ),
    );
  }

  Widget _buildPhoneStep() {
    return Column(
      children: [
        Container(
          width: 64, height: 64,
          decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Colors.emerald, Colors.teal])),
          child: const Icon(LucideIcons.phone, color: Colors.white, size: 32),
        ),
        const SizedBox(height: 24),
        Text("Enter Phone Number", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const Text("We'll send you a verification code", style: TextStyle(color: Colors.white60, fontSize: 13)),
        const SizedBox(height: 32),
        TextField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          style: const TextStyle(color: Colors.white, fontSize: 18),
          textAlign: TextAlign.center,
          decoration: InputDecoration(
            hintText: "Phone number",
            hintStyle: TextStyle(color: Colors.white.withOpacity(0.2)),
            filled: true, fillColor: Colors.white.withOpacity(0.05),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity, height: 56,
          child: ElevatedButton(
            onPressed: _isLoading ? null : _handleSendOtp,
            style: ElevatedButton.styleFrom(backgroundColor: Colors.emerald, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
            child: _isLoading ? const CircularProgressIndicator(color: Colors.white) : const Text("Send OTP", style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ),
      ],
    );
  }

  Widget _buildGenderStep() {
    return Column(
      children: [
        Text("Select Gender", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 32),
        Row(
          children: [
            _genderBtn("male", "👨", "Male", Colors.blue),
            const SizedBox(width: 16),
            _genderBtn("female", "👩", "Female", Colors.pink),
          ],
        ),
      ],
    );
  }

  Widget _genderBtn(String val, String emoji, String label, Color color) {
    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() => _selectedGender = val);
          _nextStep("name");
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 24),
          decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.3))),
          child: Column(children: [Text(emoji, style: const TextStyle(fontSize: 40)), const SizedBox(height: 12), Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))]),
        ),
      ),
    );
  }

  Widget _buildNameStep() {
    return Column(
      children: [
        Text("Your Name", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 32),
        TextField(
          controller: _nameController,
          style: const TextStyle(color: Colors.white, fontSize: 18),
          textAlign: TextAlign.center,
          decoration: InputDecoration(
            hintText: "Enter your name",
            hintStyle: TextStyle(color: Colors.white.withOpacity(0.2)),
            filled: true, fillColor: Colors.white.withOpacity(0.05),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity, height: 56,
          child: ElevatedButton(
            onPressed: () => _nextStep("otp"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.purple, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
            child: const Text("Next", style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ),
      ],
    );
  }

  Widget _buildOtpStep() {
    return Column(
      children: [
        Text("Enter OTP Code", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 32),
        TextField(
          controller: _otpController,
          keyboardType: TextInputType.number,
          maxLength: 6,
          style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold, letterSpacing: 8),
          textAlign: TextAlign.center,
          decoration: InputDecoration(
            counterText: "",
            hintText: "000000",
            hintStyle: TextStyle(color: Colors.white.withOpacity(0.1)),
            filled: true, fillColor: Colors.white.withOpacity(0.05),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity, height: 56,
          child: ElevatedButton(
            onPressed: _isLoading ? null : _handleVerifyOtp,
            style: ElevatedButton.styleFrom(backgroundColor: Colors.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
            child: _isLoading ? const CircularProgressIndicator(color: Colors.white) : const Text("Verify & Continue", style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ),
      ],
    );
  }
}
