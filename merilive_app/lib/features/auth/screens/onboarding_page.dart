import 'package:auto_route/auto_route.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/router/app_router.gr.dart';
import '../../../core/supabase/supabase_client.dart';

class _Slide {
  const _Slide({
    required this.image,
    required this.title,
    required this.description,
    required this.gradient,
    this.isNetwork = false,
  });
  final String image;
  final String title;
  final String description;
  final List<Color> gradient;
  final bool isNetwork;
}

const _fallback = <_Slide>[
  _Slide(
    image: 'assets/onboarding/step-welcome.webp',
    title: 'Welcome to meriLIVE!',
    description:
        'Your new social entertainment hub. Meet amazing people, watch live streams, and have fun!',
    gradient: [Color(0xFF9333EA), Color(0xFFEC4899)],
  ),
  _Slide(
    image: 'assets/onboarding/step-livestream.webp',
    title: 'Watch Live Streams',
    description:
        'Discover talented hosts going live 24/7. Send gifts, chat, and make their day!',
    gradient: [Color(0xFFEC4899), Color(0xFFF43F5E)],
  ),
  _Slide(
    image: 'assets/onboarding/step-party.webp',
    title: 'Join Party Rooms',
    description:
        'Audio & video party rooms where you can hang out, sing karaoke, and play games!',
    gradient: [Color(0xFF3B82F6), Color(0xFF06B6D4)],
  ),
  _Slide(
    image: 'assets/onboarding/step-videocall.webp',
    title: 'Private Video Calls',
    description:
        "Connect 1-on-1 with hosts through private video calls. It's fun and personal!",
    gradient: [Color(0xFFEF4444), Color(0xFFF97316)],
  ),
  _Slide(
    image: 'assets/onboarding/step-bonus.webp',
    title: 'You Got Free Diamonds!',
    description:
        "We've given you welcome bonus Diamonds to get started. Explore and enjoy!",
    gradient: [Color(0xFFF59E0B), Color(0xFFEAB308)],
  ),
];

/// Welcome onboarding carousel — parity with `WelcomeOnboarding.tsx`.
/// Fetches slides from `onboarding_slides` table, falls back to bundled webps.
@RoutePage()
class OnboardingPage extends StatefulWidget {
  const OnboardingPage({super.key});

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  final _pc = PageController();
  int _index = 0;
  List<_Slide> _slides = _fallback;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await sb
          .from('onboarding_slides')
          .select('image_url, title, description, gradient')
          .eq('is_active', true)
          .order('display_order');
      if (!mounted) return;
      final parsed = <_Slide>[];
      for (final r in rows as List<dynamic>) {
        final m = r as Map<String, dynamic>;
        final img = m['image_url'] as String?;
        final title = m['title'] as String?;
        if (img == null || img.isEmpty || title == null || title.isEmpty) {
          continue;
        }
        parsed.add(_Slide(
          image: img,
          title: title,
          description: (m['description'] as String?) ?? '',
          gradient: const [Color(0xFF9333EA), Color(0xFFEC4899)],
          isNetwork: true,
        ));
      }
      if (parsed.isNotEmpty) setState(() => _slides = parsed);
    } catch (_) {
      // keep fallback silently
    }
  }

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  void _finish() {
    context.router.replaceAll([const AuthLandingRoute()]);
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _index == _slides.length - 1;
    return Scaffold(
      backgroundColor: const Color(0xCC0F0C29),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: Material(
                elevation: 24,
                borderRadius: BorderRadius.circular(28),
                clipBehavior: Clip.antiAlias,
                color: const Color(0xFFFFFBF2),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Skip
                    Align(
                      alignment: Alignment.centerRight,
                      child: Visibility(
                        visible: !isLast,
                        maintainSize: true,
                        maintainAnimation: true,
                        maintainState: true,
                        child: IconButton(
                          icon: const Icon(Icons.close_rounded, size: 18),
                          onPressed: _finish,
                          tooltip: 'Skip',
                        ),
                      ),
                    ),
                    // Slide
                    AspectRatio(
                      aspectRatio: 1,
                      child: PageView.builder(
                        controller: _pc,
                        itemCount: _slides.length,
                        onPageChanged: (i) => setState(() => _index = i),
                        itemBuilder: (_, i) {
                          final s = _slides[i];
                          return s.isNetwork
                              ? CachedNetworkImage(
                                  imageUrl: s.image,
                                  fit: BoxFit.cover,
                                )
                              : Image.asset(s.image, fit: BoxFit.cover);
                        },
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 20, 24, 8),
                      child: Column(
                        children: [
                          Text(
                            _slides[_index].title,
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0F172A),
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _slides[_index].description,
                            style: TextStyle(
                              fontSize: 13,
                              height: 1.4,
                              color: Colors.black.withOpacity(0.6),
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                    // Dots
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: List.generate(_slides.length, (i) {
                          final active = i == _index;
                          return AnimatedContainer(
                            duration: const Duration(milliseconds: 250),
                            width: active ? 26 : 8,
                            height: 8,
                            margin: const EdgeInsets.symmetric(horizontal: 3),
                            decoration: BoxDecoration(
                              color: active
                                  ? const Color(0xFF9333EA)
                                  : Colors.black26,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          );
                        }),
                      ),
                    ),
                    // Nav
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          TextButton.icon(
                            onPressed: _index == 0
                                ? null
                                : () {
                                    HapticFeedback.selectionClick();
                                    _pc.previousPage(
                                        duration:
                                            const Duration(milliseconds: 250),
                                        curve: Curves.easeOut);
                                  },
                            icon: const Icon(Icons.chevron_left, size: 18),
                            label: const Text('Back'),
                          ),
                          FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: _slides[_index].gradient.first,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 22, vertical: 10),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            onPressed: () {
                              HapticFeedback.selectionClick();
                              if (isLast) {
                                _finish();
                              } else {
                                _pc.nextPage(
                                    duration:
                                        const Duration(milliseconds: 250),
                                    curve: Curves.easeOut);
                              }
                            },
                            child: Text(
                              isLast ? "🚀 Let's Go!" : 'Next',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700),
                            ),
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
      ),
    );
  }
}
