import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// M1 — Canonical bottom action bar shared by Live Stream, Party Room
/// (audio/video/game modes), and Private Call. Mirrors the web design
/// in `src/components/party/ChametStyleBottomBar.tsx` — floating glass
/// pill, radial 3D orbs, oversized center action, breathing shine.
///
/// Each call site passes its own [RoomBarSlot] list. The layout stays
/// identical across surfaces so viewers get a single visual language.
enum RoomBarVariant { live, party, call }

class RoomBarSlot {
  const RoomBarSlot({
    required this.id,
    required this.icon,
    required this.label,
    required this.onTap,
    this.gradient,
    this.glow,
    this.badge,
    this.hero = false,
    this.destructive = false,
  });

  final String id;
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final List<Color>? gradient;
  final Color? glow;
  final int? badge;
  final bool hero;
  final bool destructive;
}

class RoomBottomBar extends StatelessWidget {
  const RoomBottomBar({
    super.key,
    required this.variant,
    required this.slots,
  });

  final RoomBarVariant variant;
  final List<RoomBarSlot> slots;

  static void _haptic() {
    HapticFeedback.selectionClick();
  }

  @override
  Widget build(BuildContext context) {
    final safeBottom = MediaQuery.of(context).padding.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(12, 0, 12, safeBottom + 8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xEE0C081E), Color(0xE6190C32)],
          ),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: const Color(0x1AA855F7)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x73000000),
              blurRadius: 40,
              offset: Offset(0, 12),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            for (final s in slots)
              s.hero ? _HeroOrb(slot: s) : _StandardOrb(slot: s),
          ],
        ),
      ),
    );
  }
}

class _StandardOrb extends StatelessWidget {
  const _StandardOrb({required this.slot});
  final RoomBarSlot slot;

  @override
  Widget build(BuildContext context) {
    final gradient = slot.gradient ??
        (slot.destructive
            ? const [Color(0xFFFB7185), Color(0xFFE11D48)]
            : const [Color(0xFF64748B), Color(0xFF1E293B)]);
    final glow = slot.glow ??
        (slot.destructive
            ? const Color(0x99E11D48)
            : const Color(0x66000000));

    return Semantics(
      button: true,
      label: slot.label,
      child: InkResponse(
        radius: 30,
        onTap: slot.onTap == null
            ? null
            : () {
                RoomBottomBar._haptic();
                slot.onTap!();
              },
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: gradient,
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: glow,
                        blurRadius: 18,
                        offset: const Offset(0, 6),
                      ),
                    ],
                    border: Border.all(
                      color: Colors.white.withOpacity(0.14),
                    ),
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Positioned(
                        top: 3,
                        left: 6,
                        right: 6,
                        child: Container(
                          height: 8,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.white.withOpacity(0.5),
                                Colors.transparent,
                              ],
                            ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                      ),
                      Icon(slot.icon, color: Colors.white, size: 20),
                    ],
                  ),
                ),
                if ((slot.badge ?? 0) > 0)
                  Positioned(
                    top: -4,
                    right: -4,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 16),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 4, vertical: 1),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFFEF4444), Color(0xFFF97316)],
                        ),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                            color: const Color(0xFF0C0823), width: 2),
                      ),
                      child: Text(
                        slot.badge! > 99 ? '99+' : '${slot.badge}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              slot.label,
              style: const TextStyle(
                color: Color(0xB3FFFFFF),
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroOrb extends StatefulWidget {
  const _HeroOrb({required this.slot});
  final RoomBarSlot slot;

  @override
  State<_HeroOrb> createState() => _HeroOrbState();
}

class _HeroOrbState extends State<_HeroOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2500),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final gradient = widget.slot.gradient ??
        const [Color(0xFFEC4899), Color(0xFFA855F7), Color(0xFF7C3AED)];
    return Semantics(
      button: true,
      label: widget.slot.label,
      child: InkResponse(
        radius: 36,
        onTap: widget.slot.onTap == null
            ? null
            : () {
                HapticFeedback.mediumImpact();
                widget.slot.onTap!();
              },
        child: Transform.translate(
          offset: const Offset(0, -12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedBuilder(
                animation: _c,
                builder: (context, _) {
                  final v = _c.value;
                  return Stack(
                    alignment: Alignment.center,
                    children: [
                      Container(
                        width: 74,
                        height: 74,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: gradient,
                          ),
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: [
                            BoxShadow(
                              color: gradient.last.withOpacity(0.5 + v * 0.2),
                              blurRadius: 24 + v * 8,
                              offset: const Offset(0, 8),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        width: 62,
                        height: 62,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: gradient,
                          ),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                              color: Colors.white.withOpacity(0.16), width: 2),
                        ),
                        child: Icon(
                          widget.slot.icon,
                          color: Colors.white,
                          size: 32,
                        ),
                      ),
                    ],
                  );
                },
              ),
              const SizedBox(height: 2),
              Text(
                widget.slot.label,
                style: const TextStyle(
                  color: Color(0xD9FFFFFF),
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
