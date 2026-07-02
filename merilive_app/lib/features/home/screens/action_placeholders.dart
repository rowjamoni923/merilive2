import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';


import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';
import '../../live/data/live_host_bridge.dart';
import '../../live/widgets/live_sticker_sheet.dart';

// ============================================================================
// M14 — Create section: full web-parity Go Live prep + Create Party prep.
//
// Ports the professional Chamet-style prep experience from
// src/pages/GoLive.tsx + src/pages/CreateParty.tsx into Flutter with the
// exact same controls: beauty / cover / category / privacy / flip / mic /
// mirror. Native pieces (beauty sliders, sticker overlay, snapshot) route
// through additive LiveKitBridge methods that safely no-op on old APKs.
// ============================================================================

/// Shared "Coming Soon" chrome kept for the two lightweight placeholders
/// (profile detail + party room shell) at the bottom of this file.
class _ComingSoon extends StatelessWidget {
  const _ComingSoon({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.gradient,
    required this.sector,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final List<Color> gradient;
  final String sector;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
        title: Text(title,
            style: const TextStyle(
                fontWeight: FontWeight.w800, color: Colors.white)),
      ),
      extendBodyBehindAppBar: true,
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: gradient,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      shape: BoxShape.circle,
                      border: Border.all(
                          color: Colors.white.withOpacity(0.4), width: 2),
                    ),
                    child: Icon(icon, color: Colors.white, size: 48),
                  ),
                  const SizedBox(height: 24),
                  Text(title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                      ),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text(subtitle,
                      style: TextStyle(
                          color: Colors.white.withOpacity(0.9),
                          fontSize: 14,
                          height: 1.4),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(999),
                      border:
                          Border.all(color: Colors.white.withOpacity(0.3)),
                    ),
                    child: Text('Lands in $sector',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.4,
                        )),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared preview + control primitives (used by both Go Live and Create Party)
// ─────────────────────────────────────────────────────────────────────────────

/// Small icon + label pill used in the left/right side rails.
class _RailButton extends StatelessWidget {
  const _RailButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
    this.tint,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final bg = active
        ? (tint ?? const Color(0xFFEC4899)).withOpacity(0.85)
        : Colors.black.withOpacity(0.45);
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: Container(
        width: 52,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.16)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.35),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white, size: 22),
            const SizedBox(height: 4),
            Text(label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                )),
          ],
        ),
      ),
    );
  }
}

/// Top chip (privacy / category / mode) rendered as a glassy pill.
class _TopChip extends StatelessWidget {
  const _TopChip({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.5),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(0.18)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white, size: 16),
            const SizedBox(width: 6),
            Text(label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                )),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Beauty sheet — persisted 5-slider panel (parity with web BeautyFilterPanel).
// ─────────────────────────────────────────────────────────────────────────────

class BeautySettings {
  double smooth;
  double whiten;
  double slim;
  double eye;
  double rosy;
  bool enabled;

  BeautySettings({
    this.smooth = 0.35,
    this.whiten = 0.20,
    this.slim = 0.15,
    this.eye = 0.10,
    this.rosy = 0.08,
    this.enabled = true,
  });

  Map<String, dynamic> toJson() => {
        'smooth': smooth,
        'whiten': whiten,
        'slim': slim,
        'eye': eye,
        'rosy': rosy,
        'enabled': enabled,
      };

  factory BeautySettings.fromJson(Map<String, dynamic> j) => BeautySettings(
        smooth: (j['smooth'] ?? 0.35).toDouble(),
        whiten: (j['whiten'] ?? 0.20).toDouble(),
        slim: (j['slim'] ?? 0.15).toDouble(),
        eye: (j['eye'] ?? 0.10).toDouble(),
        rosy: (j['rosy'] ?? 0.08).toDouble(),
        enabled: j['enabled'] ?? true,
      );

  static const _kKey = 'beauty_settings_v2';

  static Future<BeautySettings> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_kKey);
      if (raw == null) return BeautySettings();
      return BeautySettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return BeautySettings();
    }
  }

  Future<void> save() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kKey, jsonEncode(toJson()));
    } catch (_) {}
  }

  Future<void> pushToNative() async {
    await LiveKitBridge.instance.setBeautyEnabled(enabled);
    if (enabled) {
      await LiveKitBridge.instance.setBeautyParams(
        smooth: smooth,
        whiten: whiten,
        slim: slim,
        eye: eye,
        rosy: rosy,
      );
    }
  }
}

class _BeautySheet extends StatefulWidget {
  const _BeautySheet({required this.initial, required this.onChanged});
  final BeautySettings initial;
  final ValueChanged<BeautySettings> onChanged;

  static Future<void> show(
    BuildContext context, {
    required BeautySettings settings,
    required ValueChanged<BeautySettings> onChanged,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _BeautySheet(initial: settings, onChanged: onChanged),
    );
  }

  @override
  State<_BeautySheet> createState() => _BeautySheetState();
}

class _BeautySheetState extends State<_BeautySheet> {
  late BeautySettings s;

  @override
  void initState() {
    super.initState();
    s = widget.initial;
  }

  void _apply() {
    widget.onChanged(s);
    s.save();
    s.pushToNative();
  }

  void _preset(String name) {
    switch (name) {
      case 'Natural':
        s = BeautySettings(smooth: 0.20, whiten: 0.10, slim: 0.08, eye: 0.06, rosy: 0.04);
        break;
      case 'Soft':
        s = BeautySettings(smooth: 0.40, whiten: 0.25, slim: 0.15, eye: 0.12, rosy: 0.10);
        break;
      case 'Sweet':
        s = BeautySettings(smooth: 0.55, whiten: 0.35, slim: 0.25, eye: 0.22, rosy: 0.18);
        break;
      case 'Glam':
        s = BeautySettings(smooth: 0.75, whiten: 0.55, slim: 0.40, eye: 0.35, rosy: 0.30);
        break;
    }
    setState(() {});
    _apply();
  }

  Widget _slider(String label, double value, ValueChanged<double> onChanged) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            children: [
              Expanded(
                child: Text(label,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600)),
              ),
              Text('${(value * 100).round()}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ],
          ),
        ),
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            activeTrackColor: const Color(0xFFEC4899),
            inactiveTrackColor: Colors.white.withOpacity(0.14),
            thumbColor: Colors.white,
            overlayColor: const Color(0x33EC4899),
            trackHeight: 3,
          ),
          child: Slider(
            value: value,
            onChanged: (v) {
              setState(() => onChanged(v));
              _apply();
            },
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xF01F1B2E), Color(0xF00A0714)],
          ),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                const Icon(Icons.auto_awesome_rounded,
                    color: Color(0xFFEC4899), size: 20),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text('Beauty',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800)),
                ),
                Switch.adaptive(
                  value: s.enabled,
                  activeColor: const Color(0xFFEC4899),
                  onChanged: (v) {
                    setState(() => s.enabled = v);
                    _apply();
                  },
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: ['Natural', 'Soft', 'Sweet', 'Glam']
                  .map((p) => ActionChip(
                        label: Text(p,
                            style: const TextStyle(color: Colors.white)),
                        backgroundColor: Colors.white.withOpacity(0.08),
                        side: BorderSide(color: Colors.white.withOpacity(0.18)),
                        onPressed: () => _preset(p),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 12),
            _slider('Smooth', s.smooth, (v) => s.smooth = v),
            _slider('Whiten', s.whiten, (v) => s.whiten = v),
            _slider('Slim', s.slim, (v) => s.slim = v),
            _slider('Eye', s.eye, (v) => s.eye = v),
            _slider('Rosy', s.rosy, (v) => s.rosy = v),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Category picker sheet
// ─────────────────────────────────────────────────────────────────────────────

class _CategoryItem {
  const _CategoryItem({required this.id, required this.name, this.icon});
  final String id;
  final String name;
  final String? icon;
}

class _CategoryPicker {
  static Future<_CategoryItem?> show(
    BuildContext context, {
    required String table, // 'live_categories' or 'party_categories'
  }) async {
    List<_CategoryItem> items = [];
    try {
      final res = await Supabase.instance.client
          .from(table)
          .select('id, name, icon')
          .eq('is_active', true)
          .order('display_order', ascending: true);
      items = (res as List)
          .map((r) => _CategoryItem(
                id: r['id'].toString(),
                name: (r['name'] ?? '').toString(),
                icon: r['icon']?.toString(),
              ))
          .where((i) => i.name.isNotEmpty)
          .toList();
    } catch (_) {}

    if (!context.mounted) return null;
    return showModalBottomSheet<_CategoryItem>(
      context: context,
      backgroundColor: const Color(0xFF12101C),
      builder: (_) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Choose Category',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (items.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Text('No categories available yet.',
                      style: TextStyle(color: Colors.white54)),
                )
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: items
                      .map((c) => ActionChip(
                            avatar: c.icon != null && c.icon!.isNotEmpty
                                ? Text(c.icon!,
                                    style: const TextStyle(fontSize: 16))
                                : null,
                            label: Text(c.name,
                                style: const TextStyle(color: Colors.white)),
                            backgroundColor: Colors.white.withOpacity(0.08),
                            side: BorderSide(
                                color: Colors.white.withOpacity(0.18)),
                            onPressed: () => Navigator.of(context).pop(c),
                          ))
                      .toList(),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Privacy picker sheet — Public / Private / Password (4-digit PIN)
// ─────────────────────────────────────────────────────────────────────────────

class _PrivacyResult {
  const _PrivacyResult({required this.mode, this.password});
  final String mode; // 'public' | 'private' | 'password'
  final String? password;
}

class _PrivacyPicker {
  static Future<_PrivacyResult?> show(BuildContext context,
      {required String current}) async {
    final pinCtrl = TextEditingController();
    return showModalBottomSheet<_PrivacyResult>(
      context: context,
      backgroundColor: const Color(0xFF12101C),
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
        ),
        child: StatefulBuilder(builder: (ctx, setSt) {
          String selected = current;
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Live Privacy',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              ...[
                ('public', Icons.public, 'Public', 'Anyone can join'),
                ('private', Icons.lock_outline, 'Private',
                    'Only followers can see'),
                ('password', Icons.pin_rounded, 'Password',
                    '4-digit PIN required'),
              ].map((it) {
                final active = selected == it.$1;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => setSt(() => selected = it.$1),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: active
                            ? const Color(0xFFEC4899).withOpacity(0.18)
                            : Colors.white.withOpacity(0.05),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: active
                              ? const Color(0xFFEC4899)
                              : Colors.white.withOpacity(0.12),
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(it.$2, color: Colors.white, size: 20),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(it.$3,
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700)),
                                Text(it.$4,
                                    style: const TextStyle(
                                        color: Colors.white54, fontSize: 11)),
                              ],
                            ),
                          ),
                          if (active)
                            const Icon(Icons.check_circle,
                                color: Color(0xFFEC4899)),
                        ],
                      ),
                    ),
                  ),
                );
              }),
              if (selected == 'password') ...[
                const SizedBox(height: 6),
                TextField(
                  controller: pinCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 4,
                  style: const TextStyle(
                      color: Colors.white,
                      letterSpacing: 8,
                      fontSize: 20,
                      fontWeight: FontWeight.w800),
                  textAlign: TextAlign.center,
                  decoration: InputDecoration(
                    counterText: '',
                    hintText: '••••',
                    hintStyle: TextStyle(
                        color: Colors.white24, letterSpacing: 8, fontSize: 20),
                    filled: true,
                    fillColor: Colors.white.withOpacity(0.06),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  if (selected == 'password' &&
                      pinCtrl.text.trim().length != 4) {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      const SnackBar(content: Text('Enter a 4-digit PIN')),
                    );
                    return;
                  }
                  Navigator.of(ctx).pop(_PrivacyResult(
                    mode: selected,
                    password: selected == 'password' ? pinCtrl.text.trim() : null,
                  ));
                },
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  backgroundColor: const Color(0xFFEC4899),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999)),
                ),
                child: const Text('Save',
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 15)),
              ),
            ],
          );
        }),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cover picker — camera / gallery / current-frame snapshot → uploads to
// Supabase Storage bucket `host-covers` and returns a public URL.
// ─────────────────────────────────────────────────────────────────────────────

class _CoverPicker {
  static Future<String?> pick(BuildContext context) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF12101C),
      builder: (ctx) => SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _sheetTile(ctx, Icons.camera_alt_rounded, 'Take Photo', 'camera'),
            _sheetTile(ctx, Icons.image_rounded, 'Choose from Gallery', 'gallery'),
            _sheetTile(ctx, Icons.center_focus_strong_rounded,
                'Use Current Frame', 'snapshot'),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
    if (choice == null) return null;

    Uint8List? bytes;
    try {
      if (choice == 'snapshot') {
        final res = await LiveKitBridge.instance.snapshotLocalPreview();
        final b64 = res['base64'] as String?;
        if (b64 != null) bytes = base64Decode(b64);
      } else {
        final picker = ImagePicker();
        final XFile? file = await picker.pickImage(
          source: choice == 'camera'
              ? ImageSource.camera
              : ImageSource.gallery,
          imageQuality: 85,
          maxWidth: 1200,
        );
        if (file != null) bytes = await File(file.path).readAsBytes();
      }
    } catch (_) {}
    if (bytes == null || bytes.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not read cover image')),
        );
      }
      return null;
    }

    try {
      final client = Supabase.instance.client;
      final uid = client.auth.currentUser?.id ?? 'anon';
      final path = '$uid/${DateTime.now().millisecondsSinceEpoch}.jpg';
      await client.storage.from('host-covers').uploadBinary(
            path,
            bytes,
            fileOptions: const FileOptions(
                contentType: 'image/jpeg', upsert: true, cacheControl: '3600'),
          );
      return client.storage.from('host-covers').getPublicUrl(path);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Cover upload failed: $e')),
        );
      }
      return null;
    }
  }

  static Widget _sheetTile(
      BuildContext context, IconData icon, String label, String value) {
    return ListTile(
      leading: Icon(icon, color: Colors.white),
      title: Text(label, style: const TextStyle(color: Colors.white)),
      onTap: () => Navigator.of(context).pop(value),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Go Live prep — full-screen professional Chamet-style prep
// ─────────────────────────────────────────────────────────────────────────────

@RoutePage()
class GoLivePlaceholderPage extends StatefulWidget {
  const GoLivePlaceholderPage({super.key});
  @override
  State<GoLivePlaceholderPage> createState() => _GoLivePlaceholderPageState();
}

class _GoLivePlaceholderPageState extends State<GoLivePlaceholderPage>
    with WidgetsBindingObserver {
  final _titleCtrl = TextEditingController();

  bool _checking = true;
  bool _previewing = false;
  bool _allowed = false;
  bool _starting = false;
  bool _endingExisting = false;
  bool _preservePreviewOnDispose = false;

  // Prep state
  bool _front = true;
  bool _mic = true;
  bool _mirror = true;
  bool _grid = false;
  String? _displayName;
  String? _coverUrl;
  _CategoryItem? _category;
  _PrivacyResult _privacy = const _PrivacyResult(mode: 'public');
  BeautySettings _beauty = BeautySettings();
  StickerItem? _sticker;

  // Denial state
  String? _denyCode;
  String? _denyMessage;
  int? _requiredLevel;
  int? _currentLevel;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    BeautySettings.load().then((b) => setState(() => _beauty = b));
    _runGate();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _titleCtrl.dispose();
    if (_previewing && !_preservePreviewOnDispose) {
      LiveKitBridge.instance.stopLocalPreview();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_allowed) _runGate();
  }

  Future<void> _runGate() async {
    setState(() {
      _checking = true;
      _denyCode = null;
      _denyMessage = null;
    });

    try {
      final data = await Supabase.instance.client.rpc('can_user_go_live');
      final gate = (data is Map)
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};
      final allowed = gate['allowed'] == true;
      if (allowed) {
        setState(() {
          _allowed = true;
          _checking = false;
        });
        await LiveKitBridge.instance.initialize();
        final res =
            await LiveKitBridge.instance.startLocalPreview(front: _front);
        if (!mounted) return;
        setState(() =>
            _previewing = res['success'] == true || res['pending'] == true);
        await LiveKitBridge.instance.setMirror(_mirror);
        await _beauty.pushToNative();
      } else {
        setState(() {
          _allowed = false;
          _checking = false;
          _denyCode = (gate['code'] ?? 'denied').toString();
          _denyMessage =
              (gate['reason'] ?? 'You cannot go live right now.').toString();
          _requiredLevel = (gate['required_level'] as num?)?.toInt();
          _currentLevel = (gate['current_level'] as num?)?.toInt();
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _allowed = false;
        _checking = false;
        _denyCode = 'error';
        _denyMessage = 'Gate check failed. Please try again.';
      });
    }
  }

  ({String title, String message, String? cta, IconData icon}) _denyCopy() {
    switch (_denyCode) {
      case 'face':
        return (
          title: 'Face Verification Required',
          message:
              'Verify your face before you can go live. This keeps the community safe.',
          cta: 'Start Verification',
          icon: Icons.verified_user_rounded
        );
      case 'host_not_approved':
        return (
          title: 'Host Approval Pending',
          message:
              'Your host application is not approved yet. Please wait for admin review.',
          cta: null,
          icon: Icons.hourglass_bottom_rounded
        );
      case 'agency_required':
        return (
          title: 'Agency Required',
          message: 'Join an agency before going live as a registered host.',
          cta: null,
          icon: Icons.groups_rounded
        );
      case 'account_blocked':
        return (
          title: 'Account Blocked',
          message: 'Your account cannot start live streams.',
          cta: null,
          icon: Icons.block_rounded
        );
      case 'banned':
        return (
          title: 'Live Ban Active',
          message: 'You currently have an active live streaming ban.',
          cta: null,
          icon: Icons.gavel_rounded
        );
      case 'already_live':
        return (
          title: 'Already Live',
          message:
              'You already have an active live stream. End it to start a new session.',
          cta: _endingExisting ? 'Ending…' : 'End Existing Stream',
          icon: Icons.podcasts_rounded
        );
      case 'disabled':
        return (
          title: 'Live Streaming Disabled',
          message: 'Live streaming is temporarily disabled by admin.',
          cta: null,
          icon: Icons.pause_circle_filled_rounded
        );
      case 'level':
        final req = _requiredLevel ?? '?';
        final cur = _currentLevel ?? 0;
        return (
          title: 'Level $req Required',
          message:
              'You need level $req to go live. Your current level is $cur. Recharge, chat and receive gifts to level up.',
          cta: null,
          icon: Icons.trending_up_rounded
        );
      case 'auth':
        return (
          title: 'Please Sign In',
          message: 'Your session expired. Please sign in again.',
          cta: 'Sign In',
          icon: Icons.login_rounded
        );
      default:
        return (
          title: 'Cannot Go Live',
          message: _denyMessage ?? 'You cannot go live right now.',
          cta: 'Retry',
          icon: Icons.error_outline_rounded
        );
    }
  }

  Future<void> _endExistingStream() async {
    if (_endingExisting) return;
    setState(() => _endingExisting = true);
    try {
      await Supabase.instance.client
          .rpc('end_live_stream', params: {'p_reason': 'user_switch'});
    } catch (_) {}
    if (!mounted) return;
    setState(() => _endingExisting = false);
    _runGate();
  }

  void _handleDenyCta() {
    switch (_denyCode) {
      case 'face':
        try {
          context.router.pushNamed('/face-verification');
        } catch (_) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Face verification screen lands with Sector 6.')));
        }
        break;
      case 'already_live':
        _endExistingStream();
        break;
      case 'auth':
        context.router.replaceNamed('/auth');
        break;
      default:
        _runGate();
    }
  }

  Future<void> _flipCamera() async {
    setState(() => _front = !_front);
    HapticFeedback.selectionClick();
    await LiveKitBridge.instance.switchCamera();
    // Front cam typically wants mirror on; rear off.
    _mirror = _front;
    await LiveKitBridge.instance.setMirror(_mirror);
    if (mounted) setState(() {});
  }

  Future<void> _toggleMic() async {
    setState(() => _mic = !_mic);
    HapticFeedback.selectionClick();
    await LiveKitBridge.instance.setMicEnabled(_mic);
  }

  Future<void> _toggleMirror() async {
    setState(() => _mirror = !_mirror);
    await LiveKitBridge.instance.setMirror(_mirror);
  }

  Future<void> _pickCover() async {
    final url = await _CoverPicker.pick(context);
    if (url != null && mounted) setState(() => _coverUrl = url);
  }

  Future<void> _pickCategory() async {
    final c = await _CategoryPicker.show(context, table: 'live_categories');
    if (c != null && mounted) setState(() => _category = c);
  }

  Future<void> _pickPrivacy() async {
    final r = await _PrivacyPicker.show(context, current: _privacy.mode);
    if (r != null && mounted) setState(() => _privacy = r);
  }

  Future<void> _handleStartLive() async {
    if (_starting) return;
    setState(() => _starting = true);
    final client = Supabase.instance.client;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final user = client.auth.currentUser;
      if (user == null) {
        if (mounted) context.router.replaceNamed('/auth');
        return;
      }

      final banned = await client
          .rpc('is_user_live_banned', params: {'p_user_id': user.id});
      if (banned == true) {
        messenger.showSnackBar(
            const SnackBar(content: Text('Your live has been banned.')));
        return;
      }

      _displayName ??= await _fetchDisplayName(client, user.id);
      final titleTrim = _titleCtrl.text.trim();
      final streamTitle = titleTrim.isNotEmpty
          ? titleTrim
          : "${_displayName ?? 'User'}'s Live";

      final startResult = await client.rpc('start_live_stream', params: {
        'p_title': streamTitle,
        'p_thumbnail_url': _coverUrl,
        'p_display_name': _displayName ?? 'User',
        'p_category_id': _category?.id,
        'p_live_privacy': _privacy.mode,
        'p_password': _privacy.password,
      });

      final parsed = startResult is Map
          ? Map<String, dynamic>.from(startResult)
          : const {};
      final success = parsed['success'] == true;
      final stream = parsed['stream'] is Map
          ? Map<String, dynamic>.from(parsed['stream'])
          : null;
      final streamId = stream?['id']?.toString();

      if (!success || streamId == null) {
        final reason = (parsed['reason'] ??
                parsed['error'] ??
                'Failed to start live stream')
            .toString();
        messenger.showSnackBar(SnackBar(content: Text(reason)));
        return;
      }

      try {
        await LiveHostBridge.instance.startAsHost(
          streamId: streamId,
          participantName: _displayName ?? 'Host',
        );
      } catch (e) {
        try {
          await client.rpc('end_live_stream',
              params: {'p_reason': 'publish_failed'});
        } catch (_) {}
        messenger
            .showSnackBar(SnackBar(content: Text('Publish failed: $e')));
        return;
      }

      _preservePreviewOnDispose = true;
      if (!mounted) return;
      context.router.replaceNamed('/live/$streamId');
    } catch (e) {
      messenger
          .showSnackBar(SnackBar(content: Text('Failed to start live: $e')));
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  Future<String?> _fetchDisplayName(SupabaseClient client, String userId) async {
    try {
      final row = await client
          .from('profiles')
          .select('display_name')
          .eq('id', userId)
          .maybeSingle();
      return row?['display_name'] as String?;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: _checking
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : _allowed
              ? _buildAllowedBody()
              : _buildDeniedBody(),
    );
  }

  Widget _buildAllowedBody() {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Native camera preview mounts BEHIND this Scaffold via LiveKitBridge.
        // The transparent black backdrop lets the SurfaceViewRenderer through.
        if (!_previewing)
          Container(
            color: const Color(0xFF0B0B12),
            alignment: Alignment.center,
            child: const Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Camera preview mounts natively.\nOn Android with the LiveKit host, your face appears here.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: Colors.white70, fontSize: 13, height: 1.4),
              ),
            ),
          ),
        if (_grid) const _GridOverlay(),
        // Top bar
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                _CircleIconButton(
                    icon: Icons.close_rounded,
                    onTap: () => context.router.maybePop()),
                const SizedBox(width: 8),
                _TopChip(
                  icon: _privacy.mode == 'public'
                      ? Icons.public
                      : _privacy.mode == 'private'
                          ? Icons.lock_outline
                          : Icons.pin_rounded,
                  label: _privacy.mode == 'public'
                      ? 'Public'
                      : _privacy.mode == 'private'
                          ? 'Private'
                          : 'PIN',
                  onTap: _pickPrivacy,
                ),
                const SizedBox(width: 8),
                _TopChip(
                  icon: Icons.category_rounded,
                  label: _category?.name ?? 'Category',
                  onTap: _pickCategory,
                ),
                const Spacer(),
                _CircleIconButton(
                  icon: _grid ? Icons.grid_on : Icons.grid_off,
                  onTap: () => setState(() => _grid = !_grid),
                ),
              ],
            ),
          ),
        ),
        // Left rail
        Positioned(
          top: MediaQuery.of(context).padding.top + 72,
          left: 12,
          child: Column(
            children: [
              _RailButton(
                icon: Icons.auto_awesome_rounded,
                label: 'Beauty',
                active: _beauty.enabled,
                onTap: () => _BeautySheet.show(
                  context,
                  settings: _beauty,
                  onChanged: (b) => setState(() => _beauty = b),
                ),
              ),
              _RailButton(
                icon: Icons.emoji_emotions_rounded,
                label: _sticker?.name ?? 'Sticker',
                active: _sticker != null,
                onTap: () => LiveStickerSheet.show(
                  context,
                  activeStickerId: _sticker?.id,
                  onChanged: (s) => setState(() => _sticker = s),
                ),
              ),
              _RailButton(
                icon: _coverUrl != null
                    ? Icons.image_rounded
                    : Icons.add_photo_alternate_rounded,
                label: 'Cover',
                active: _coverUrl != null,
                onTap: _pickCover,
              ),
            ],
          ),
        ),
        // Right rail
        Positioned(
          top: MediaQuery.of(context).padding.top + 72,
          right: 12,
          child: Column(
            children: [
              _RailButton(
                  icon: Icons.cameraswitch_rounded,
                  label: _front ? 'Front' : 'Rear',
                  onTap: _flipCamera),
              _RailButton(
                icon: _mic ? Icons.mic_rounded : Icons.mic_off_rounded,
                label: _mic ? 'Mic' : 'Muted',
                active: !_mic,
                tint: Colors.redAccent,
                onTap: _toggleMic,
              ),
              _RailButton(
                icon: _mirror ? Icons.flip : Icons.flip_outlined,
                label: 'Mirror',
                active: _mirror,
                onTap: _toggleMirror,
              ),
            ],
          ),
        ),
        // Cover thumbnail preview
        if (_coverUrl != null)
          Positioned(
            top: MediaQuery.of(context).padding.top + 72,
            right: 76,
            child: Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white, width: 2),
                image: DecorationImage(
                    image: NetworkImage(_coverUrl!), fit: BoxFit.cover),
              ),
            ),
          ),
        // Bottom composer
        Align(
          alignment: Alignment.bottomCenter,
          child: SafeArea(
            top: false,
            child: Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.55),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white.withOpacity(0.12)),
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
                      hintText: 'Stream title (optional)',
                      hintStyle:
                          TextStyle(color: Colors.white.withOpacity(0.5)),
                      counterStyle:
                          TextStyle(color: Colors.white.withOpacity(0.4)),
                      filled: true,
                      fillColor: Colors.white.withOpacity(0.08),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 54,
                    child: ElevatedButton(
                      onPressed: _starting ? null : _handleStartLive,
                      style: ElevatedButton.styleFrom(
                        padding: EdgeInsets.zero,
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(999)),
                      ),
                      child: Ink(
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(colors: [
                            Color(0xFFEF4444),
                            Color(0xFFEC4899),
                          ]),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Container(
                          alignment: Alignment.center,
                          child: _starting
                              ? const SizedBox(
                                  height: 22,
                                  width: 22,
                                  child: CircularProgressIndicator(
                                      color: Colors.white, strokeWidth: 2.4),
                                )
                              : Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: const [
                                    Icon(Icons.radio_rounded,
                                        color: Colors.white),
                                    SizedBox(width: 8),
                                    Text('Start Live',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: 16,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 0.4,
                                        )),
                                  ],
                                ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDeniedBody() {
    final d = _denyCopy();
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1F0B3D), Color(0xFF3B0A5E), Color(0xFF0B0714)],
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Align(
                alignment: Alignment.topLeft,
                child: _CircleIconButton(
                    icon: Icons.close_rounded,
                    onTap: () => context.router.maybePop()),
              ),
              const Spacer(),
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.14),
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: Colors.white.withOpacity(0.4), width: 2),
                ),
                child: Icon(d.icon, color: Colors.white, size: 46),
              ),
              const SizedBox(height: 20),
              Text(d.title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text(d.message,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Colors.white.withOpacity(0.85),
                      fontSize: 14,
                      height: 1.5)),
              const Spacer(),
              if (d.cta != null)
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _handleDenyCta,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEC4899),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999)),
                    ),
                    child: Text(d.cta!,
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 15)),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withOpacity(0.5),
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

class _GridOverlay extends StatelessWidget {
  const _GridOverlay();
  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: CustomPaint(
        painter: _GridPainter(),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = Colors.white.withOpacity(0.24)
      ..strokeWidth = 0.5;
    for (var i = 1; i < 3; i++) {
      final x = size.width * i / 3;
      final y = size.height * i / 3;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), p);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Party prep — professional Chamet-style, mirrors GoLive controls
// ─────────────────────────────────────────────────────────────────────────────

enum _PartyMode { video, audio, game }

class _GameOption {
  const _GameOption({
    required this.id,
    required this.name,
    required this.emoji,
    required this.color,
    this.logoUrl,
  });
  final String id;
  final String name;
  final String emoji;
  final String color;
  final String? logoUrl;
}

const _kAllowedGames = <String>[
  'lucky_28',
  'aviator',
  'plinko',
  'dragon_tiger',
  'andar_bahar',
  'crash',
];

@RoutePage()
class CreatePartyPlaceholderPage extends StatefulWidget {
  const CreatePartyPlaceholderPage({super.key});
  @override
  State<CreatePartyPlaceholderPage> createState() =>
      _CreatePartyPlaceholderPageState();
}

class _CreatePartyPlaceholderPageState
    extends State<CreatePartyPlaceholderPage> {
  _PartyMode _mode = _PartyMode.video;
  bool _loading = true;
  bool _creating = false;
  bool _previewing = false;
  bool _preserveOnDispose = false;

  // Prep state
  bool _front = true;
  bool _mic = true;
  bool _mirror = true;
  String? _selectedGameId;
  String? _coverUrl;
  _CategoryItem? _category;
  int _seats = 6;
  final _titleCtrl = TextEditingController();
  final _entryFeeCtrl = TextEditingController();
  BeautySettings _beauty = BeautySettings();

  List<_GameOption> _games = const [];
  String? _denyMessage;

  @override
  void initState() {
    super.initState();
    BeautySettings.load().then((b) => setState(() => _beauty = b));
    _bootstrap();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _entryFeeCtrl.dispose();
    if (_previewing && !_preserveOnDispose) {
      LiveKitBridge.instance.stopLocalPreview();
    }
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final client = Supabase.instance.client;
    try {
      final games = await client
          .from('game_settings')
          .select('game_id, game_name, game_emoji, game_color, logo_url')
          .eq('is_active', true)
          .inFilter('game_id', _kAllowedGames)
          .order('display_order', ascending: true);
      _games = (games as List)
          .map((g) => _GameOption(
                id: g['game_id']?.toString() ?? '',
                name: g['game_name']?.toString() ?? '',
                emoji: g['game_emoji']?.toString() ?? '🎮',
                color: g['game_color']?.toString() ?? '#7C3AED',
                logoUrl: g['logo_url']?.toString(),
              ))
          .where((g) => g.id.isNotEmpty)
          .toList();

      if (!mounted) return;
      setState(() => _loading = false);
      await _warmPreviewForMode();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _denyMessage = 'Failed to load party options. Please try again.';
      });
    }
  }

  Future<void> _warmPreviewForMode() async {
    final needsCamera = _mode != _PartyMode.audio;
    if (needsCamera && !_previewing) {
      await LiveKitBridge.instance.initialize();
      final res = await LiveKitBridge.instance.startLocalPreview(front: _front);
      if (!mounted) return;
      setState(() =>
          _previewing = res['success'] == true || res['pending'] == true);
      await LiveKitBridge.instance.setMirror(_mirror);
      await _beauty.pushToNative();
    } else if (!needsCamera && _previewing) {
      await LiveKitBridge.instance.stopLocalPreview();
      if (!mounted) return;
      setState(() => _previewing = false);
    }
  }

  Future<void> _handleModeChange(_PartyMode next) async {
    if (next == _mode) return;
    HapticFeedback.selectionClick();
    setState(() {
      _mode = next;
      if (next != _PartyMode.game) _selectedGameId = null;
    });
    await _warmPreviewForMode();
  }

  Future<void> _flipCamera() async {
    setState(() => _front = !_front);
    HapticFeedback.selectionClick();
    await LiveKitBridge.instance.switchCamera();
    _mirror = _front;
    await LiveKitBridge.instance.setMirror(_mirror);
    if (mounted) setState(() {});
  }

  Future<void> _toggleMic() async {
    setState(() => _mic = !_mic);
    HapticFeedback.selectionClick();
    await LiveKitBridge.instance.setMicEnabled(_mic);
  }

  Future<void> _toggleMirror() async {
    setState(() => _mirror = !_mirror);
    await LiveKitBridge.instance.setMirror(_mirror);
  }

  Future<void> _pickCover() async {
    final url = await _CoverPicker.pick(context);
    if (url != null && mounted) setState(() => _coverUrl = url);
  }

  Future<void> _pickCategory() async {
    final c = await _CategoryPicker.show(context, table: 'party_categories');
    if (c != null && mounted) setState(() => _category = c);
  }

  Future<void> _handleCreate() async {
    if (_creating) return;
    if (_mode == _PartyMode.game && (_selectedGameId?.isEmpty ?? true)) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Select a game to continue')));
      return;
    }

    setState(() => _creating = true);
    final client = Supabase.instance.client;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final user = client.auth.currentUser;
      if (user == null) {
        if (mounted) context.router.replaceNamed('/auth');
        return;
      }

      final profile = await client
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
      final displayName =
          (profile?['display_name']?.toString() ?? 'User').trim();
      final titleTrim = _titleCtrl.text.trim();
      final roomName =
          titleTrim.isNotEmpty ? titleTrim : "$displayName's Party";
      final entryFee = int.tryParse(_entryFeeCtrl.text.trim()) ?? 0;

      final res = await client.rpc('create_party_room', params: {
        'p_name': roomName,
        'p_room_type': _mode.name,
        'p_game_mode': _mode == _PartyMode.game ? _selectedGameId : null,
        'p_password': null,
        'p_entry_fee': entryFee < 0 ? 0 : entryFee,
      });

      final roomId = res?.toString();
      if (roomId == null || roomId.isEmpty) {
        throw StateError('Party room was not created');
      }

      if (!mounted) return;
      if (_mode != _PartyMode.audio) _preserveOnDispose = true;
      context.router.pushNamed('/party/$roomId');
    } on PostgrestException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      messenger.showSnackBar(
          const SnackBar(content: Text('Failed to create party')));
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : Stack(
              fit: StackFit.expand,
              children: [
                _buildStage(),
                SafeArea(
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Row(
                      children: [
                        _CircleIconButton(
                            icon: Icons.close_rounded,
                            onTap: () => context.router.maybePop()),
                        const SizedBox(width: 8),
                        Expanded(child: _ModeSegmented(
                            mode: _mode, onChange: _handleModeChange)),
                        const SizedBox(width: 8),
                        _CircleIconButton(
                            icon: Icons.event_seat_rounded,
                            onTap: _pickSeats),
                      ],
                    ),
                  ),
                ),
                if (_mode != _PartyMode.audio)
                  Positioned(
                    top: MediaQuery.of(context).padding.top + 72,
                    left: 12,
                    child: Column(children: [
                      _RailButton(
                        icon: Icons.auto_awesome_rounded,
                        label: 'Beauty',
                        active: _beauty.enabled,
                        onTap: () => _BeautySheet.show(context,
                            settings: _beauty,
                            onChanged: (b) => setState(() => _beauty = b)),
                      ),
                      _RailButton(
                        icon: _coverUrl != null
                            ? Icons.image_rounded
                            : Icons.add_photo_alternate_rounded,
                        label: 'Cover',
                        active: _coverUrl != null,
                        onTap: _pickCover,
                      ),
                      _RailButton(
                        icon: Icons.category_rounded,
                        label: _category?.name ?? 'Category',
                        onTap: _pickCategory,
                      ),
                    ]),
                  ),
                Positioned(
                  top: MediaQuery.of(context).padding.top + 72,
                  right: 12,
                  child: Column(children: [
                    if (_mode != _PartyMode.audio)
                      _RailButton(
                          icon: Icons.cameraswitch_rounded,
                          label: _front ? 'Front' : 'Rear',
                          onTap: _flipCamera),
                    _RailButton(
                      icon: _mic ? Icons.mic_rounded : Icons.mic_off_rounded,
                      label: _mic ? 'Mic' : 'Muted',
                      active: !_mic,
                      tint: Colors.redAccent,
                      onTap: _toggleMic,
                    ),
                    if (_mode != _PartyMode.audio)
                      _RailButton(
                        icon: _mirror ? Icons.flip : Icons.flip_outlined,
                        label: 'Mirror',
                        active: _mirror,
                        onTap: _toggleMirror,
                      ),
                  ]),
                ),
                Align(
                  alignment: Alignment.bottomCenter,
                  child: SafeArea(
                    top: false,
                    child: Container(
                      margin: const EdgeInsets.all(16),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.6),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                            color: Colors.white.withOpacity(0.12)),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_mode == _PartyMode.game &&
                              _selectedGameId == null)
                            _GamesGrid(
                                games: _games,
                                selected: _selectedGameId,
                                onSelect: (id) =>
                                    setState(() => _selectedGameId = id)),
                          if (_mode == _PartyMode.game &&
                              _selectedGameId == null)
                            const SizedBox(height: 12),
                          TextField(
                            controller: _titleCtrl,
                            maxLength: 40,
                            style: const TextStyle(color: Colors.white),
                            decoration: InputDecoration(
                              hintText: 'Party name (optional)',
                              hintStyle: TextStyle(
                                  color: Colors.white.withOpacity(0.5)),
                              counterStyle: TextStyle(
                                  color: Colors.white.withOpacity(0.4)),
                              filled: true,
                              fillColor: Colors.white.withOpacity(0.08),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: BorderSide.none,
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          _EntryFeeField(controller: _entryFeeCtrl),
                          if (_denyMessage != null) ...[
                            const SizedBox(height: 10),
                            Text(_denyMessage!,
                                style: const TextStyle(
                                    color: Color(0xFFFCA5A5), fontSize: 12)),
                          ],
                          const SizedBox(height: 12),
                          _CreateCta(
                            creating: _creating,
                            onTap: _handleCreate,
                            label: _mode == _PartyMode.audio
                                ? 'Start Audio Party'
                                : _mode == _PartyMode.game
                                    ? 'Start Game Party'
                                    : 'Start Video Party',
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

  Widget _buildStage() {
    if (_mode == _PartyMode.audio) {
      return Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF1F0B3D),
              Color(0xFF3B0A5E),
              Color(0xFF12061F),
            ],
          ),
        ),
        alignment: Alignment.center,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 140,
              height: 140,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(colors: [
                  Color(0xFFEC4899),
                  Color(0xFF9333EA),
                ]),
                boxShadow: [
                  BoxShadow(
                      color: const Color(0xFFEC4899).withOpacity(0.4),
                      blurRadius: 40,
                      spreadRadius: 4),
                ],
              ),
              child: const Icon(Icons.mic_rounded,
                  color: Colors.white, size: 60),
            ),
            const SizedBox(height: 24),
            const Text('Audio Party',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('Voice-only room · $_seats seats',
                style: const TextStyle(color: Colors.white70, fontSize: 13)),
          ],
        ),
      );
    }
    if (!_previewing) {
      return Container(
        color: const Color(0xFF0B0B12),
        alignment: Alignment.center,
        child: const Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Camera preview mounts natively on Android.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white70, fontSize: 13),
          ),
        ),
      );
    }
    return const SizedBox.expand();
  }

  Future<void> _pickSeats() async {
    final res = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: const Color(0xFF12101C),
      builder: (ctx) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Seats',
                  style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 16)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                children: [4, 6, 8, 9]
                    .map((n) => ChoiceChip(
                          label: Text('$n seats',
                              style: const TextStyle(color: Colors.white)),
                          selected: _seats == n,
                          selectedColor: const Color(0xFFEC4899),
                          backgroundColor: Colors.white.withOpacity(0.08),
                          onSelected: (_) => Navigator.of(ctx).pop(n),
                        ))
                    .toList(),
              ),
            ],
          ),
        ),
      ),
    );
    if (res != null && mounted) setState(() => _seats = res);
  }
}

class _ModeSegmented extends StatelessWidget {
  const _ModeSegmented({required this.mode, required this.onChange});
  final _PartyMode mode;
  final ValueChanged<_PartyMode> onChange;

  @override
  Widget build(BuildContext context) {
    final items = <(_PartyMode, IconData, String)>[
      (_PartyMode.video, Icons.videocam_rounded, 'Video'),
      (_PartyMode.audio, Icons.mic_rounded, 'Audio'),
      (_PartyMode.game, Icons.sports_esports_rounded, 'Game'),
    ];
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.14)),
      ),
      child: Row(
        children: items.map((it) {
          final selected = it.$1 == mode;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChange(it.$1),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  gradient: selected
                      ? const LinearGradient(colors: [
                          Color(0xFFEC4899),
                          Color(0xFF9333EA),
                        ])
                      : null,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(it.$2, color: Colors.white, size: 16),
                    const SizedBox(width: 6),
                    Text(it.$3,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _GamesGrid extends StatelessWidget {
  const _GamesGrid({
    required this.games,
    required this.selected,
    required this.onSelect,
  });
  final List<_GameOption> games;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    if (games.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withOpacity(0.1)),
        ),
        child: const Text(
          'No games enabled by admin.',
          style: TextStyle(color: Colors.white70, fontSize: 12),
        ),
      );
    }
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 3,
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 1.05,
      children: games.map((g) {
        Color parseHex(String h) {
          final v = h.replaceAll('#', '');
          if (v.length == 6) return Color(int.parse('FF$v', radix: 16));
          if (v.length == 8) return Color(int.parse(v, radix: 16));
          return const Color(0xFF7C3AED);
        }

        final tint = parseHex(g.color);
        final isSel = g.id == selected;
        return GestureDetector(
          onTap: () => onSelect(g.id),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [tint.withOpacity(0.55), tint.withOpacity(0.25)],
              ),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                  color: isSel ? Colors.white : Colors.white.withOpacity(0.15),
                  width: isSel ? 2 : 1),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(g.emoji, style: const TextStyle(fontSize: 24)),
                const SizedBox(height: 4),
                Text(g.name,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 11)),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _EntryFeeField extends StatelessWidget {
  const _EntryFeeField({required this.controller});
  final TextEditingController controller;
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: TextField(
        controller: controller,
        keyboardType: TextInputType.number,
        style: const TextStyle(color: Colors.white, fontSize: 14),
        decoration: const InputDecoration(
          border: InputBorder.none,
          icon: Icon(Icons.diamond_rounded, color: Color(0xFF60A5FA), size: 20),
          hintText: 'Entry fee (diamonds) — 0 for free',
          hintStyle: TextStyle(color: Colors.white38, fontSize: 12),
        ),
      ),
    );
  }
}

class _CreateCta extends StatelessWidget {
  const _CreateCta({
    required this.creating,
    required this.onTap,
    required this.label,
  });
  final bool creating;
  final VoidCallback onTap;
  final String label;
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      child: ElevatedButton(
        onPressed: creating ? null : onTap,
        style: ElevatedButton.styleFrom(
          padding: EdgeInsets.zero,
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        ),
        child: Ink(
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [
              Color(0xFFEC4899),
              Color(0xFF9333EA),
            ]),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Container(
            alignment: Alignment.center,
            child: creating
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(
                        color: Colors.white, strokeWidth: 2.4),
                  )
                : Text(label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.4,
                    )),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kept lightweight placeholders (referenced by router / home tabs)
// ─────────────────────────────────────────────────────────────────────────────

@RoutePage()
class ProfileDetailPlaceholderPage extends StatelessWidget {
  const ProfileDetailPlaceholderPage({
    super.key,
    @PathParam('userId') required this.userId,
  });
  final String userId;
  @override
  Widget build(BuildContext context) => _ComingSoon(
        title: 'Profile',
        subtitle:
            'User ID: $userId\n\nFull profile (avatar frame, bio, gifts received, follow / call CTAs) lands with the Profile sector.',
        icon: Icons.account_circle_rounded,
        gradient: const [Color(0xFF06B6D4), Color(0xFF3B82F6)],
        sector: 'Sector 8 (Profile)',
      );
}

@RoutePage()
class PartyRoomPlaceholderPage extends StatelessWidget {
  const PartyRoomPlaceholderPage({
    super.key,
    @PathParam('roomId') required this.roomId,
  });
  final String roomId;
  @override
  Widget build(BuildContext context) => _ComingSoon(
        title: 'Party Room',
        subtitle:
            'Room ID: $roomId\n\nFull party room (seats, mic queue, chat, gifts, mini-games) lands with the Party broadcast step.',
        icon: Icons.celebration_rounded,
        gradient: const [Color(0xFF9333EA), Color(0xFF6366F1)],
        sector: 'Sector 4 (Party broadcast)',
      );
}
