import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';
import '../../../core/router/app_router.gr.dart';
import '../data/live_host_bridge.dart';

/// Phase I13 — Flutter port of `src/pages/GoLive.tsx` (core path).
///
/// Not a 1:1 pixel copy of the 2200-line web page. This screen ports the
/// professional-live-app essentials that every Chamet/Bigo/Poppo host expects
/// before pressing "Go Live":
///   • Live camera preview (native, via LiveKitBridge.startLocalPreview)
///   • Front/back camera swap
///   • Stream title + tag/category
///   • Public-only (per project constraint `live-party-always-public`)
///   • "Start Live" that (1) inserts a `live_streams` row, (2) promotes the
///     preview into a publishing Room via `LiveHostBridge.startAsHost`,
///     (3) navigates to `LiveStreamRoute` where every overlay from Phases
///     I1–I12 mounts automatically.
///
/// Camera continuity is preserved: we stop the standalone preview only
/// AFTER `startAsHost` succeeds (the same track is re-published), matching
/// the zero-gap handoff documented in `LiveHostBridge`.
@RoutePage(name: 'GoLiveRoute')
class GoLivePage extends StatefulWidget {
  const GoLivePage({super.key});

  @override
  State<GoLivePage> createState() => _GoLivePageState();
}

class _GoLivePageState extends State<GoLivePage> {
  final _client = Supabase.instance.client;
  final _titleCtrl = TextEditingController();
  bool _previewReady = false;
  bool _front = true;
  bool _starting = false;
  String? _error;
  String _category = 'chat';

  static const _categories = <String>[
    'chat',
    'music',
    'dance',
    'game',
    'talent',
    'other',
  ];

  @override
  void initState() {
    super.initState();
    _bootPreview();
  }

  Future<void> _bootPreview() async {
    try {
      await LiveKitBridge.instance.startLocalPreview(front: _front);
      if (mounted) setState(() => _previewReady = true);
    } catch (e) {
      if (mounted) setState(() => _error = 'Camera unavailable: $e');
    }
  }

  Future<void> _swapCamera() async {
    if (!_previewReady) return;
    _front = !_front;
    try {
      await LiveKitBridge.instance.switchCamera();
      if (mounted) setState(() {});
    } catch (_) {}
  }

  Future<void> _startLive() async {
    if (_starting) return;
    final uid = _client.auth.currentUser?.id;
    if (uid == null) {
      setState(() => _error = 'Sign in required to go live.');
      return;
    }
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      final title = _titleCtrl.text.trim().isEmpty
          ? 'Live now'
          : _titleCtrl.text.trim();
      // 1) Create the stream row. `live_privacy` is legacy dead code —
      // hardcode 'public' per the project constraint.
      final row = await _client
          .from('live_streams')
          .insert({
            'host_id': uid,
            'title': title,
            'category': _category,
            'status': 'live',
            'live_privacy': 'public',
            'password_hash': null,
            'started_at': DateTime.now().toUtc().toIso8601String(),
          })
          .select('id')
          .single();
      final streamId = row['id'].toString();
      // 2) Promote preview into a publishing Room (zero-gap handoff).
      await LiveHostBridge.instance.startAsHost(streamId: streamId);
      // 3) Preview is now published by the Room; drop the standalone
      // renderer so we don't hold the camera twice.
      await LiveKitBridge.instance.stopLocalPreview();
      if (!mounted) return;
      // 4) Enter the live room. Replace so back button won't return here.
      context.router.replace(LiveStreamRoute(streamId: streamId));
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Unable to go live: $e';
          _starting = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    // If we're leaving without going live, release the camera.
    if (!LiveHostBridge.instance.isActive) {
      LiveKitBridge.instance.stopLocalPreview();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // The native preview renderer sits behind the transparent Flutter
          // surface (see LiveKitPlugin.startLocalPreview). Show a neutral
          // placeholder until the plugin confirms the camera came up.
          if (!_previewReady)
            const Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
          // Top bar
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  _RoundIcon(
                    icon: Icons.close,
                    onTap: () => context.router.maybePop(),
                  ),
                  const Spacer(),
                  _RoundIcon(
                    icon: Icons.cameraswitch_outlined,
                    onTap: _swapCamera,
                  ),
                ],
              ),
            ),
          ),
          // Bottom sheet with form + Go Live CTA.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Color(0xEE000000)],
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _titleCtrl,
                      maxLength: 60,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        counterText: '',
                        hintText: "What's your stream about?",
                        hintStyle: const TextStyle(color: Colors.white54),
                        filled: true,
                        fillColor: Colors.white12,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 36,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: _categories.map((c) {
                          final selected = c == _category;
                          return Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(c),
                              selected: selected,
                              onSelected: (_) =>
                                  setState(() => _category = c),
                              labelStyle: TextStyle(
                                color: selected ? Colors.black : Colors.white,
                                fontWeight: FontWeight.w600,
                              ),
                              backgroundColor: Colors.white12,
                              selectedColor: Colors.white,
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _error!,
                        style: const TextStyle(
                          color: Color(0xFFFCA5A5),
                          fontSize: 12,
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        onPressed: _starting ? null : _startLive,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFEC4899),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(26),
                          ),
                          textStyle: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        child: _starting
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Go Live'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundIcon extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _RoundIcon({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black45,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(icon, color: Colors.white, size: 20),
        ),
      ),
    );
  }
}
