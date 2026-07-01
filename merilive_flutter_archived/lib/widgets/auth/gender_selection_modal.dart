import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class GenderSelectionModal extends StatefulWidget {
  final String userId;
  final VoidCallback onComplete;

  const GenderSelectionModal({
    super.key,
    required this.userId,
    required this.onComplete,
  });

  @override
  State<GenderSelectionModal> createState() => _GenderSelectionModalState();
}

class _GenderSelectionModalState extends State<GenderSelectionModal> {
  final ApiService _api = ApiService();
  final TextEditingController _nameController = TextEditingController();
  String? _selectedGender;
  bool _isSaving = false;

  Future<void> _handleSave() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Please enter your name")));
      return;
    }
    if (_selectedGender == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Please select your gender")));
      return;
    }

    setState(() => _isSaving = true);
    try {
      final supa = _api.getSupabase();
      
      final updateData = {
        'display_name': name,
        'gender': _selectedGender,
      };

      final response = await supa.from('profiles').update(updateData).eq('id', widget.userId);
      
      // Note: Supabase 2.x doesn't return error in the same way, usually throws if unsuccessful or you check response
      
      if (_selectedGender == 'female') {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("🎉 Congratulations! Your host account is now active!")));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Welcome! Your account is ready!")));
      }
      
      widget.onComplete();
    } catch (e) {
      debugPrint("Error saving gender: $e");
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to save. Please try again.")));
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF0F172A), Color(0xFF020617)],
        ),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        border: Border.all(color: Colors.purple.withOpacity(0.3), width: 1),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          FadeInDown(
            child: Column(
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: [Colors.purple.withOpacity(0.3), Colors.pink.withOpacity(0.3)]),
                  ),
                  child: const Icon(LucideIcons.sparkles, color: Colors.purpleAccent, size: 32),
                ),
                const SizedBox(height: 16),
                Text("Welcome! 🎉", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                const Text("Enter your name & select gender", style: TextStyle(color: Colors.white60, fontSize: 13)),
              ],
            ),
          ),
          const SizedBox(height: 32),

          // Name Input
          FadeInUp(
            delay: const Duration(milliseconds: 200),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Your Name", style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500)),
                const SizedBox(height: 8),
                TextField(
                  controller: _nameController,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: "Enter your name",
                    hintStyle: TextStyle(color: Colors.white.withOpacity(0.2)),
                    filled: true,
                    fillColor: Colors.white.withOpacity(0.05),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Colors.purpleAccent)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Gender Options
          FadeInUp(
            delay: const Duration(milliseconds: 300),
            child: Row(
              children: [
                _buildGenderOption("male", "Male", "User Account", Colors.blue),
                const SizedBox(width: 16),
                _buildGenderOption("female", "Female", "Host Account", Colors.pink),
              ],
            ),
          ),
          const SizedBox(height: 32),

          // Action Button
          FadeInUp(
            delay: const Duration(milliseconds: 400),
            child: SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: _isSaving ? null : _handleSave,
                style: ElevatedButton.styleFrom(
                  padding: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.purpleAccent.withOpacity(0.3),
                ),
                child: Ink(
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Colors.purple, Colors.pinkAccent]),
                    borderRadius: BorderRadius.circular(28),
                  ),
                  child: Container(
                    alignment: Alignment.center,
                    child: _isSaving
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: const [
                            Icon(LucideIcons.sparkles, size: 20),
                            SizedBox(width: 12),
                            Text("Get Started", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                          ],
                        ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildGenderOption(String value, String label, String subLabel, Color color) {
    bool isSelected = _selectedGender == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _selectedGender = value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isSelected ? color.withOpacity(0.15) : Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: isSelected ? color : Colors.white.withOpacity(0.1), width: 2),
          ),
          child: Column(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: color.withOpacity(0.1),
                  border: isSelected ? Border.all(color: color, width: 2) : null,
                ),
                child: Icon(value == 'male' ? LucideIcons.user : LucideIcons.userCheck, color: color, size: 28),
              ),
              const SizedBox(height: 12),
              Text(label, style: TextStyle(color: isSelected ? color : Colors.white70, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (value == 'female') const Icon(LucideIcons.crown, color: Colors.amberAccent, size: 10),
                  if (value == 'female') const SizedBox(width: 4),
                  Text(subLabel, style: TextStyle(color: value == 'female' ? Colors.amberAccent : Colors.white24, fontSize: 9)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
