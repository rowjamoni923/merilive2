import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';

class EventPopupBanner extends StatefulWidget {
  const EventPopupBanner({super.key});

  @override
  State<EventPopupBanner> createState() => _EventPopupBannerState();
}

class _EventPopupBannerState extends State<EventPopupBanner> with SingleTickerProviderStateMixin {
  bool _visible = false;
  Map<String, dynamic>? _banner;
  int _elapsed = 0;
  Timer? _timer;
  
  late AnimationController _fadeController;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _fadeController = AnimationController(vsync: this, duration: const Duration(milliseconds: 300));
    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(CurvedAnimation(parent: _fadeController, curve: Curves.easeOutBack));
    
    _checkAndFetchBanner();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _fadeController.dispose();
    super.dispose();
  }

  Future<void> _checkAndFetchBanner() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool('popup_banner_shown') == true) return;

    final api = ApiService();
    final session = api.getSupabase().auth.currentSession;
    if (session == null) return;

    await prefs.setBool('popup_banner_shown', true);

    try {
      final banner = await api.getEntryPopupBanner();

      if (banner != null && mounted) {
        setState(() {
          _banner = banner;
          _elapsed = 0;
          _visible = true;
        });
        _fadeController.forward();
        _startTimer();
      }
    } catch (e) {
      debugPrint('[EventPopupBanner] Error: $e');
      await prefs.remove('popup_banner_shown');
    }
  }

  void _startTimer() {
    final autoDismiss = _banner?['auto_dismiss_seconds'] ?? 10;
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        _elapsed++;
        if (_elapsed >= autoDismiss) {
          _dismiss();
        }
      });
    });
  }

  void _dismiss() {
    if (!_visible) return;
    _timer?.cancel();
    _fadeController.reverse().then((_) {
      if (mounted) {
        setState(() => _visible = false);
      }
    });
  }

  void _handleBannerClick() async {
    final linkUrl = _banner?['link_url']?.toString();
    final linkType = _banner?['link_type']?.toString() ?? 'internal';
    
    if (linkUrl == null || linkUrl.isEmpty) return;
    
    _dismiss();

    if (linkType == 'internal' || linkUrl.startsWith('/')) {
      if (linkUrl.contains('recharge') || linkUrl.contains('wallet')) {
        Navigator.pushNamed(context, '/recharge');
      } else if (linkUrl.contains('tasks') || linkUrl.contains('task')) {
        Navigator.pushNamed(context, '/tasks');
      } else if (linkUrl.contains('agency') || linkUrl.contains('policy')) {
        Navigator.pushNamed(context, '/agency_policy');
      } else if (linkUrl.contains('vip')) {
        Navigator.pushNamed(context, '/vip_shop');
      } else {
        try {
          Navigator.pushNamed(context, linkUrl);
        } catch (e) {
          debugPrint("Route not found: $linkUrl");
        }
      }
    } else {
      try {
        final uri = Uri.parse(linkUrl);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible || _banner == null) return const SizedBox.shrink();

    final skipDelay = _banner?['skip_delay_seconds'] ?? 3;
    final autoDismiss = _banner?['auto_dismiss_seconds'] ?? 10;
    final canSkip = _elapsed >= skipDelay;

    return Positioned.fill(
      child: GestureDetector(
        onTap: canSkip ? _dismiss : null,
        child: Container(
          color: Colors.black,
          child: Stack(
            children: [
              // Full Screen Image
              GestureDetector(
                onTap: _handleBannerClick,
                child: SizedBox(
                  width: double.infinity,
                  height: double.infinity,
                  child: Image.network(
                    _banner!['image_url'],
                    fit: BoxFit.cover,
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) return child;
                      return Container(
                        color: Colors.black,
                        child: const Center(child: CircularProgressIndicator(strokeWidth: 2, color: Colors.amber)),
                      );
                    },
                    errorBuilder: (context, error, stackTrace) {
                      return Container(
                        color: const Color(0xFF1A1028),
                        child: Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(LucideIcons.imageOff, color: Colors.white24, size: 60),
                              const SizedBox(height: 16),
                              Text(
                                _banner!['title'] ?? 'Event Campaign',
                                style: const TextStyle(color: Colors.white54, fontSize: 18, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),

              // Top Overlay Actions (Skip/Timer)
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Row(
                    children: [
                      // Timer Badge
                      ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: BackdropFilter(
                          filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.6),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: Colors.white.withOpacity(0.1)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(LucideIcons.clock, color: Colors.amber, size: 14),
                                const SizedBox(width: 8),
                                Text(
                                  "${(autoDismiss - _elapsed).clamp(0, 99)}s",
                                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      
                      // Skip Action
                      if (canSkip)
                        ClipOval(
                          child: BackdropFilter(
                            filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
                            child: GestureDetector(
                              onTap: _dismiss,
                              child: Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: Colors.black.withOpacity(0.6),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white.withOpacity(0.2)),
                                ),
                                child: const Icon(LucideIcons.x, color: Colors.white, size: 24),
                              ),
                            ),
                          ),
                        )
                      else
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.5),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.white.withOpacity(0.1)),
                          ),
                          child: Text(
                            "Skip in ${(skipDelay - _elapsed).clamp(0, 99)}s",
                            style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              
              // Bottom Indicator (Optional, but gives it a 'premium' feel)
              Positioned(
                bottom: 40,
                left: 0,
                right: 0,
                child: Center(
                  child: Text(
                    "TAP TO VIEW DETAILS",
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.5),
                      fontSize: 12,
                      letterSpacing: 2,
                      fontWeight: FontWeight.w300,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}


