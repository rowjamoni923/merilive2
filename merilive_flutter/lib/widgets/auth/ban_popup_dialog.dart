import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class BanPopupDialog extends StatefulWidget {
  final String? reason;
  final String? bannedUntil;

  const BanPopupDialog({
    super.key,
    this.reason,
    this.bannedUntil,
  });

  @override
  State<BanPopupDialog> createState() => _BanPopupDialogState();
}

class _BanPopupDialogState extends State<BanPopupDialog> {
  final ApiService _api = ApiService();
  bool _isLoggingOut = false;

  String _getDurationLabel() {
    if (widget.bannedUntil == null) return "Permanently Banned";
    try {
      final expiry = DateTime.parse(widget.bannedUntil!);
      final now = DateTime.now();
      final diff = expiry.difference(now);
      
      if (diff.isNegative) return "Ban Expired";
      
      if (diff.inHours < 24) {
        final hours = diff.inHours;
        return "Banned for $hours hour${hours > 1 ? "s" : ""}";
      } else {
        final days = diff.inDays;
        return "Banned for $days day${days > 1 ? "s" : ""}";
      }
    } catch (e) {
      return "Permanently Banned";
    }
  }

  Future<void> _handleLogout() async {
    if (_isLoggingOut) return;
    setState(() => _isLoggingOut = true);
    try {
      await _api.logout();
      if (mounted) {
        Navigator.of(context).pushReplacementNamed('/login');
      }
    } catch (e) {
      debugPrint("Logout error: $e");
      if (mounted) {
        Navigator.of(context).pushReplacementNamed('/login');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      child: ZoomIn(
        duration: const Duration(milliseconds: 300),
        child: Container(
          width: 320,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: const Color(0xFF1A0A0A), // Very dark red
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: Colors.red.withOpacity(0.3), width: 1),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Icon
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      Colors.red.withOpacity(0.3),
                      Colors.red.shade900.withOpacity(0.4),
                    ],
                  ),
                  border: Border.all(color: Colors.red.withOpacity(0.5), width: 2),
                ),
                child: const Icon(LucideIcons.shieldX, color: Colors.redAccent, size: 32),
              ),
              const SizedBox(height: 20),

              // Title
              Text(
                "Your ID has been ${widget.bannedUntil != null ? "temporarily" : "permanently"} banned",
                textAlign: TextAlign.center,
                style: GoogleFonts.outfit(
                  color: Colors.red.shade200,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),

              // Duration
              Text(
                _getDurationLabel(),
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 20),

              // Reason
              if (widget.reason != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.red.shade900.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.red.withOpacity(0.2)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        "Reason",
                        style: TextStyle(color: Colors.redAccent, fontSize: 10, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        widget.reason!,
                        style: const TextStyle(color: Colors.white70, fontSize: 13, height: 1.4),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),

              // Support info
              Text(
                "If you believe this is a mistake, please contact support at support@merilive.com",
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11),
              ),
              const SizedBox(height: 24),

              // OK Button
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: _handleLogout,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red.shade600,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: _isLoggingOut
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text("OK", style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
