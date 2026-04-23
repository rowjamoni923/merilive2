import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';

import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:io';

class RatingProofDialog extends StatefulWidget {
  const RatingProofDialog({super.key});

  @override
  State<RatingProofDialog> createState() => _RatingProofDialogState();
}

class _RatingProofDialogState extends State<RatingProofDialog> {
  bool _isSuccess = false;
  bool _isUploading = false;
  File? _selectedImage;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20),
      child: FadeInScale(
        duration: const Duration(milliseconds: 400),
        child: Container(
          padding: const EdgeInsets.all(30),
          decoration: BoxDecoration(
            color: const Color(0xFF0F172A),
            borderRadius: BorderRadius.circular(32),
            border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.3), width: 2),
            boxShadow: [
              BoxShadow(color: const Color(0xFF6366F1).withOpacity(0.2), blurRadius: 20, spreadRadius: 5),
            ],
          ),
          child: _isSuccess ? _buildSuccess() : _buildForm(),
        ),
      ),
    );
  }

  Widget _buildForm() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.amber.withOpacity(0.1), shape: BoxShape.circle),
          child: const Icon(LucideIcons.star, color: Colors.amber, size: 48),
        ),
        const SizedBox(height: 24),
        Text(
          'RATE US 5 STARS',
          style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold, letterSpacing: 1),
        ),
        const SizedBox(height: 12),
        Text(
          'Submit a screenshot of your 5-star review to get 500 bonus beans!',
          textAlign: TextAlign.center,
          style: GoogleFonts.outfit(color: Colors.white54, fontSize: 14),
        ),
        const SizedBox(height: 32),
        GestureDetector(
          onTap: () async {
             final ImagePicker picker = ImagePicker();
             final XFile? image = await picker.pickImage(source: ImageSource.gallery);
             if (image != null) {
               setState(() => _selectedImage = File(image.path));
             }
          },
          child: Container(
            height: 160,
            width: double.infinity,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white12, style: BorderStyle.solid),
            ),
            child: _isUploading
              ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
              : _selectedImage != null
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: Image.file(_selectedImage!, fit: BoxFit.cover),
                  )
                : Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(LucideIcons.uploadCloud, color: Colors.white24, size: 48),
                      const SizedBox(height: 12),
                      Text("Tap to select screenshot", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 13)),
                    ],
                  ),
          ),
        ),
        const SizedBox(height: 32),
        _buildActionButton("SUBMIT PROOF", const Color(0xFF6366F1), () async {
          if (_selectedImage == null) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select an image first')));
            return;
          }
          final user = Supabase.instance.client.auth.currentSession?.user;
          if (user == null) return;
          
          setState(() => _isUploading = true);
          try {
            final ext = _selectedImage!.path.split('.').last;
            final fileName = '${user.id}/rating_${DateTime.now().millisecondsSinceEpoch}.$ext';
            
            await Supabase.instance.client.storage
                .from('rating-screenshots')
                .upload(fileName, _selectedImage!);
                
            final urlData = Supabase.instance.client.storage
                .from('rating-screenshots')
                .getPublicUrl(fileName);
                
            await Supabase.instance.client.from('rating_reward_claims').insert({
              'user_id': user.id,
              'screenshot_url': urlData,
            });
            
            final prefs = await SharedPreferences.getInstance();
            await prefs.remove('rating_reward_return_pending');
            
            if (mounted) setState(() { _isUploading = false; _isSuccess = true; });
          } catch (e) {
            if (mounted) setState(() => _isUploading = false);
            if (e.toString().contains('23505') || e.toString().contains('duplicate key')) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('You have already submitted a rating claim')));
            } else {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload failed: $e')));
            }
          }
        }),
        const SizedBox(height: 12),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text("Maybe Later", style: GoogleFonts.outfit(color: Colors.white24)),
        ),
      ],
    );
  }

  Widget _buildSuccess() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(LucideIcons.checkCircle, color: Colors.greenAccent, size: 80),
        const SizedBox(height: 24),
        Text("SUCCESS!", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Text(
          "Your proof has been submitted. Our team will verify it within 24 hours.",
          textAlign: TextAlign.center,
          style: GoogleFonts.outfit(color: Colors.white54, fontSize: 14),
        ),
        const SizedBox(height: 32),
        _buildActionButton("GREAT, THANKS!", Colors.greenAccent.withOpacity(0.2), () => Navigator.pop(context), isOutline: true),
      ],
    );
  }

  Widget _buildActionButton(String label, Color color, VoidCallback onTap, {bool isOutline = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        height: 56,
        decoration: BoxDecoration(
          color: isOutline ? Colors.transparent : color,
          borderRadius: BorderRadius.circular(16),
          border: isOutline ? Border.all(color: Colors.greenAccent.withOpacity(0.5)) : null,
          boxShadow: isOutline ? [] : [
            BoxShadow(color: color.withOpacity(0.3), blurRadius: 15, offset: const Offset(0, 8)),
          ],
        ),
        child: Center(
          child: Text(
            label,
            style: GoogleFonts.outfit(
              color: isOutline ? Colors.greenAccent : Colors.white,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.5,
            ),
          ),
        ),
      ),
    );
  }
}

class FadeInScale extends StatelessWidget {
  final Widget child;
  final Duration duration;
  const FadeInScale({super.key, required this.child, required this.duration});

  @override
  Widget build(BuildContext context) {
    return FadeIn(
      duration: duration,
      child: ZoomIn(
        duration: duration,
        child: child,
      ),
    );
  }
}


