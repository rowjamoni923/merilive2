import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';
import '../avatar_with_frame.dart';
import '../../services/api_service.dart';

class CallRatingModal extends StatefulWidget {
  final bool isOpen;
  final VoidCallback onClose;
  final String callId;
  final String remoteUserName;
  final String? remoteUserAvatar;
  final int duration;
  final int coinsSpent;
  final bool isHost;

  const CallRatingModal({
    super.key,
    required this.isOpen,
    required this.onClose,
    required this.callId,
    required this.remoteUserName,
    this.remoteUserAvatar,
    required this.duration,
    required this.coinsSpent,
    required this.isHost,
  });

  @override
  State<CallRatingModal> createState() => _CallRatingModalState();
}

class _CallRatingModalState extends State<CallRatingModal> {
  final _api = ApiService();
  int _rating = 0;
  int _hoveredRating = 0;
  final TextEditingController _reviewController = TextEditingController();
  bool _isSubmitting = false;

  final List<String> _ratingLabels = ["", "Poor 😞", "Okay 😐", "Good 🙂", "Great 😊", "Excellent! 🤩"];

  String _formatDuration(int seconds) {
    int mins = seconds ~/ 60;
    int secs = seconds % 60;
    return "${mins}m ${secs}s";
  }

  Future<void> _submitRating() async {
    if (_rating == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please select a rating"), backgroundColor: Colors.orange),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      final field = widget.isHost ? 'caller_rating' : 'host_rating';
      await _api.supabase.from('private_calls').update({field: _rating}).eq('id', widget.callId);

      await _api.supabase.from('call_events').insert({
        'call_id': widget.callId,
        'event_type': 'rating_submitted',
        'event_data': {
          'rating': _rating,
          'review': _reviewController.text.trim(),
          'rated_by': widget.isHost ? 'host' : 'caller',
        },
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Thank you for your feedback! 🎉"), backgroundColor: Colors.green),
        );
        widget.onClose();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Failed to submit rating"), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isOpen) return const SizedBox.shrink();

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        alignment: Alignment.center,
        children: [
          // Backdrop
          FadeIn(
            duration: const Duration(milliseconds: 300),
            child: GestureDetector(
              onTap: widget.onClose,
              child: Container(
                color: Colors.black.withOpacity(0.9),
                child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10), child: const SizedBox.expand()),
              ),
            ),
          ),

          // Modal
          ZoomIn(
            duration: const Duration(milliseconds: 400),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Container(
                width: double.infinity,
                constraints: const BoxConstraints(maxWidth: 400),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xFF111827), Color(0xFF030712)],
                  ),
                  borderRadius: BorderRadius.circular(32),
                  border: Border.all(color: Colors.white.withOpacity(0.1)),
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Close Button
                      Align(
                        alignment: Alignment.topRight,
                        child: IconButton(
                          onPressed: widget.onClose,
                          icon: const Icon(LucideIcons.x, color: Colors.white38, size: 20),
                        ),
                      ),

                      Padding(
                        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                        child: Column(
                          children: [
                            Text(
                              widget.isHost ? "Rate Your Caller" : "Call Ended",
                              style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              "${_formatDuration(widget.duration)} | ${widget.isHost ? "Earned beans" : "Spent ${widget.coinsSpent} diamonds"}",
                              style: GoogleFonts.outfit(color: Colors.white38, fontSize: 13),
                            ),

                            const SizedBox(height: 32),
                            AvatarWithFrame(avatarUrl: widget.remoteUserAvatar, size: 96, frameUrl: null),
                            const SizedBox(height: 16),
                            Text(widget.remoteUserName, style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                            Text(widget.isHost ? "Caller" : "Host", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 14)),

                            const SizedBox(height: 32),
                            Text("How was your experience?", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 14)),
                            const SizedBox(height: 16),
                            
                            // Rating Stars
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: List.generate(5, (index) {
                                int star = index + 1;
                                return GestureDetector(
                                  onTap: () => setState(() => _rating = star),
                                  onPanUpdate: (_) => setState(() => _hoveredRating = star), // Mobile simple hover fallback
                                  child: ElasticIn(
                                    delay: Duration(milliseconds: 100 * index),
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 4),
                                      child: Icon(
                                        LucideIcons.star,
                                        size: 40,
                                        color: star <= (_hoveredRating != 0 ? _hoveredRating : _rating)
                                            ? Colors.amber
                                            : Colors.white10,
                                        fill: star <= (_hoveredRating != 0 ? _hoveredRating : _rating) ? 1 : 0,
                                      ),
                                    ),
                                  ),
                                );
                              }),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _ratingLabels[_rating],
                              style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
                            ),

                            const SizedBox(height: 24),
                            TextField(
                              controller: _reviewController,
                              style: const TextStyle(color: Colors.white),
                              maxLines: 3,
                              decoration: InputDecoration(
                                hintText: "Write your feedback (optional)...",
                                hintStyle: const TextStyle(color: Colors.white24),
                                filled: true,
                                fillColor: Colors.white.withOpacity(0.05),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                              ),
                            ),

                            const SizedBox(height: 24),
                            Row(
                              children: [
                                Expanded(
                                  child: TextButton(
                                    onPressed: widget.onClose,
                                    child: Text("Skip", style: GoogleFonts.outfit(color: Colors.white38, fontWeight: FontWeight.w600)),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: GestureDetector(
                                    onTap: _submitRating,
                                    child: Container(
                                      height: 56,
                                      decoration: BoxDecoration(
                                        gradient: const LinearGradient(colors: [Color(0xFFEC4899), Color(0xFF8B5CF6)]),
                                        borderRadius: BorderRadius.circular(16),
                                        boxShadow: [BoxShadow(color: Colors.pink.withOpacity(0.3), blurRadius: 15, offset: const Offset(0, 6))],
                                      ),
                                      child: Center(
                                        child: _isSubmitting 
                                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                            : Row(
                                                mainAxisAlignment: MainAxisAlignment.center,
                                                children: [
                                                  const Icon(LucideIcons.send, color: Colors.white, size: 18),
                                                  const SizedBox(width: 8),
                                                  Text("Submit", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                                                ],
                                              ),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
