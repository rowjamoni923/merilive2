import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/router/app_router.dart';
import '../../../core/supabase/supabase_client.dart';
import '../../../core/theme/design_tokens.dart';
import '../data/start_flow_repository.dart';
import '../widgets/auth_background.dart';

/// Gender + Name onboarding for freshly-created guest accounts.
/// Parity with web `GenderSelectionModal.tsx`.
///
/// Route arg: `userId` (String, required) — the auth.users id whose profile
/// row must be filled in. Navigated from the Start flow after guest signup.
@RoutePage()
class GenderStepPage extends StatefulWidget {
  const GenderStepPage({super.key, required this.userId});
  final String userId;

  @override
  State<GenderStepPage> createState() => _GenderStepPageState();
}

class _GenderStepPageState extends State<GenderStepPage> {
  final _nameCtrl = TextEditingController();
  String? _gender; // 'male' | 'female'
  bool _saving = false;

  late final StartFlowRepository _repo =
      StartFlowRepository(SupabaseBootstrap.client);

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  static final _nameRe = RegExp(r"^[\p{L}\p{N} .'\-_]+$", unicode: true);
  static const _blocked = <String>{
    'admin', 'administrator', 'root', 'system', 'support', 'moderator',
    'staff', 'null', 'undefined', 'test', 'fuck', 'shit', 'bitch', 'nigger',
    'chudir', 'chuda', 'randi', 'madarchod', 'bhenchod',
  };

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.length < 2) {
      _snack('Name must be at least 2 characters', const Color(0xFFDC2626));
      return;
    }
    if (name.length > 30) {
      _snack('Name must be under 30 characters', const Color(0xFFDC2626));
      return;
    }
    if (!_nameRe.hasMatch(name)) {
      _snack('Name can only contain letters, numbers, spaces, . \' - _',
          const Color(0xFFDC2626));
      return;
    }
    final lower = name.toLowerCase();
    if (_blocked.any((w) => lower.contains(w))) {
      _snack('Please choose a different name', const Color(0xFFDC2626));
      return;
    }
    if (_gender == null) {
      _snack('Please select your gender', const Color(0xFFDC2626));
      return;
    }
    setState(() => _saving = true);
    HapticFeedback.mediumImpact();
    try {
      await _repo.finalizeGuestProfile(
        userId: widget.userId,
        displayName: name,
        gender: _gender!,
      );
      if (!mounted) return;
      _snack(
        _gender == 'female'
            ? '🎉 Your host account is now active!'
            : 'Welcome! Your account is ready.',
        const Color(0xFF10B981),
      );
      // Back to splash — Splash reroutes based on the now-completed profile.
      await context.router.replaceAll([const SplashRoute()]);
    } catch (e) {
      if (!mounted) return;
      final msg = e is PostgrestException
          ? (e.message)
          : (e is AuthException ? e.message : e.toString());
      _snack('Failed to save: $msg', const Color(0xFFDC2626));
      setState(() => _saving = false);
    }
  }

  void _snack(String msg, Color bg) {
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: bg,
        content: Text(msg, style: const TextStyle(color: Colors.white)),
      ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AuthBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              child: _card(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _card() {
    return Container(
      constraints: const BoxConstraints(maxWidth: 380),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: DT.cardCream,
        ),
        borderRadius: BorderRadius.circular(DT.cardRadius),
        border: Border.all(color: const Color(0x4D9333EA)), // purple-500/30
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.25),
            blurRadius: 30,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _header(),
          const SizedBox(height: 20),
          const _Label('Your Name'),
          const SizedBox(height: 6),
          _nameField(),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(child: _genderCard(male: true)),
              const SizedBox(width: 12),
              Expanded(child: _genderCard(male: false)),
            ],
          ),
          if (_gender == 'female') ...[
            const SizedBox(height: 12),
            _hostNotice(),
          ],
          const SizedBox(height: 20),
          _continueBtn(),
        ],
      ),
    );
  }

  Widget _header() {
    return Column(
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              colors: [
                const Color(0xFF9333EA).withOpacity(0.30),
                const Color(0xFFEC4899).withOpacity(0.30),
              ],
            ),
          ),
          child: const Icon(
            Icons.auto_awesome_rounded,
            color: Color(0xFF9333EA),
            size: 34,
          ),
        ),
        const SizedBox(height: 12),
        ShaderMask(
          shaderCallback: (r) => const LinearGradient(
            colors: [Color(0xFFBE185D), Color(0xFFE11D48), Color(0xFFD97706)],
          ).createShader(r),
          child: const Text(
            'Welcome aboard',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Enter your name and select your gender',
          style: TextStyle(fontSize: 12, color: Color(0xFF475569)),
        ),
      ],
    );
  }

  Widget _nameField() {
    return TextField(
      controller: _nameCtrl,
      maxLength: 30,
      textInputAction: TextInputAction.done,
      style: const TextStyle(fontSize: 14, color: Color(0xFF0F172A)),
      decoration: InputDecoration(
        counterText: '',
        hintText: 'Enter your name',
        hintStyle: const TextStyle(color: Color(0xFF94A3B8)),
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFEC4899), width: 1.4),
        ),
      ),
    );
  }

  Widget _genderCard({required bool male}) {
    final key = male ? 'male' : 'female';
    final selected = _gender == key;
    final accent = male ? const Color(0xFF3B82F6) : const Color(0xFFEC4899);
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        setState(() => _gender = key);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
        decoration: BoxDecoration(
          color: selected ? accent.withOpacity(0.15) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? accent : const Color(0xFFFDE68A),
            width: 2,
          ),
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: male
                        ? const Color(0xFFDBEAFE)
                        : const Color(0xFFFCE7F3),
                    border: Border.all(
                      color: selected ? accent : Colors.transparent,
                      width: 2,
                    ),
                  ),
                  child: Icon(
                    male ? Icons.person_rounded : Icons.person_2_rounded,
                    size: 30,
                    color: accent,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  male ? 'Male' : 'Female',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: selected ? accent : const Color(0xFF475569),
                  ),
                ),
                const SizedBox(height: 4),
                if (male)
                  const Text(
                    'User Account',
                    style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
                  )
                else
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: const [
                      Icon(Icons.emoji_events_rounded,
                          size: 12, color: Color(0xFFEAB308)),
                      SizedBox(width: 3),
                      Text(
                        'Host Account',
                        style: TextStyle(
                          fontSize: 10,
                          color: Color(0xFFEAB308),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
            if (selected)
              Positioned(
                top: -6,
                right: -6,
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: accent,
                  ),
                  child: const Icon(Icons.check_rounded,
                      color: Colors.white, size: 14),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _hostNotice() {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [
          const Color(0xFFEC4899).withOpacity(0.10),
          const Color(0xFF9333EA).withOpacity(0.10),
        ]),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x33EC4899)),
      ),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.emoji_events_rounded, size: 12, color: Color(0xFFBE185D)),
          SizedBox(width: 6),
          Flexible(
            child: Text(
              'Selecting Female will activate your Host account.',
              style: TextStyle(fontSize: 11, color: Color(0xFFBE185D)),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }

  Widget _continueBtn() {
    final enabled =
        !_saving && _nameCtrl.text.trim().isNotEmpty && _gender != null;
    return SizedBox(
      height: DT.dialogBtnHeight,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: enabled ? _save : null,
          child: Ink(
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: DT.btnStart),
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFEC4899).withOpacity(enabled ? 0.5 : 0),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (_saving)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      valueColor: AlwaysStoppedAnimation(Colors.white),
                    ),
                  )
                else ...[
                  const Icon(Icons.auto_awesome_rounded,
                      color: Colors.white, size: 18),
                  const SizedBox(width: 8),
                  const Text(
                    'Get Started',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Color(0xFF334155),
        ),
      );
}
