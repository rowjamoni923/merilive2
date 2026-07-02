import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/gift_animation_config.dart';
import '../data/gift_catalog_repository.dart';
import 'full_screen_gift_overlay.dart';

/// One recipient displayed in the horizontal picker strip.
class GiftRecipient {
  const GiftRecipient({
    required this.id,
    required this.label,
    this.avatarUrl,
    this.badge,
  });
  final String id;
  final String label;
  final String? avatarUrl;
  final String? badge;
}

/// **One gift panel everywhere.**
///
/// Party rooms, live streams, private calls, chat, profile, and reels all
/// mount this exact sheet — same grid, same recipient picker, same quantity
/// chips, same submit button. Only the [recipients] + [surface] change per
/// call site.
///
/// Full-screen VAP/SVGA/Lottie playback is owned by the native Android
/// gift dispatcher (Pkg438) which reacts to the `gift_transactions`
/// realtime broadcast — the sheet itself never plays animations.
Future<void> showUnifiedGiftSheet(
  BuildContext context, {
  required GiftSurface surface,
  required List<GiftRecipient> recipients,
  String? contextId,
  String? initialRecipientId,
}) async {
  if (recipients.isEmpty) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF1F1B3A),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _UnifiedGiftSheet(
      surface: surface,
      recipients: recipients,
      contextId: contextId,
      initialRecipientId: initialRecipientId ?? recipients.first.id,
    ),
  );
}

class _UnifiedGiftSheet extends StatefulWidget {
  const _UnifiedGiftSheet({
    required this.surface,
    required this.recipients,
    required this.contextId,
    required this.initialRecipientId,
  });
  final GiftSurface surface;
  final List<GiftRecipient> recipients;
  final String? contextId;
  final String initialRecipientId;

  @override
  State<_UnifiedGiftSheet> createState() => _UnifiedGiftSheetState();
}

class _UnifiedGiftSheetState extends State<_UnifiedGiftSheet> {
  final GiftCatalogRepository _repo = GiftCatalogRepository();
  late Future<List<Map<String, dynamic>>> _future;
  String? _selectedGiftId;
  int _quantity = 1;
  late String _recipientId;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _future = _repo.loadGifts();
    _recipientId = widget.initialRecipientId;
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: FractionallySizedBox(
        heightFactor: 0.75,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Send Gift',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              _RecipientStrip(
                recipients: widget.recipients,
                selectedId: _recipientId,
                onChanged: (id) => setState(() => _recipientId = id),
              ),
              const SizedBox(height: 10),
              Expanded(child: _buildGrid()),
              const SizedBox(height: 8),
              _buildFooter(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGrid() {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snap) {
        if (!snap.hasData) {
          return const Center(
            child: CircularProgressIndicator(color: Colors.white),
          );
        }
        final gifts = snap.data!;
        if (gifts.isEmpty) {
          return const Center(
            child: Text(
              'No gifts configured by admin',
              style: TextStyle(color: Colors.white70),
            ),
          );
        }
        return GridView.builder(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 4,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 0.78,
          ),
          itemCount: gifts.length,
          itemBuilder: (_, i) {
            final g = gifts[i];
            final id = g['id'].toString();
            final selected = id == _selectedGiftId;
            final price = (g['coin_price'] as num?)?.toInt() ??
                (g['coin_value'] as num?)?.toInt() ??
                0;
            return InkWell(
              onTap: () => setState(() => _selectedGiftId = id),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: selected
                        ? const Color(0xFFF59E0B)
                        : Colors.white.withValues(alpha: 0.08),
                    width: selected ? 1.6 : 1,
                  ),
                ),
                padding: const EdgeInsets.all(6),
                child: Column(
                  children: [
                    Expanded(
                      child: (g['icon_url'] as String?)?.isNotEmpty == true
                          ? Image.network(
                              g['icon_url'] as String,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.card_giftcard,
                                color: Colors.pinkAccent,
                              ),
                            )
                          : const Icon(
                              Icons.card_giftcard,
                              color: Colors.pinkAccent,
                              size: 32,
                            ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      (g['name'] as String?) ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      '$price 💎',
                      style: const TextStyle(
                        color: Color(0xFFFACC15),
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildFooter() {
    return Row(
      children: [
        _QtyChip(value: 1, selected: _quantity == 1, onTap: () => setState(() => _quantity = 1)),
        _QtyChip(value: 10, selected: _quantity == 10, onTap: () => setState(() => _quantity = 10)),
        _QtyChip(value: 66, selected: _quantity == 66, onTap: () => setState(() => _quantity = 66)),
        _QtyChip(value: 188, selected: _quantity == 188, onTap: () => setState(() => _quantity = 188)),
        const Spacer(),
        ElevatedButton(
          onPressed: (_sending || _selectedGiftId == null) ? null : _send,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFFF59E0B),
            foregroundColor: Colors.black,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
          ),
          child: Text(_sending ? 'Sending…' : 'Send'),
        ),
      ],
    );
  }

  Future<void> _send() async {
    final me = Supabase.instance.client.auth.currentUser?.id;
    if (me == null || _selectedGiftId == null) return;
    setState(() => _sending = true);
    try {
      final gifts = await _future;
      final g = gifts.firstWhere(
        (x) => x['id'].toString() == _selectedGiftId,
        orElse: () => <String, dynamic>{},
      );
      if (g.isEmpty) throw StateError('Gift not found');
      final coinCost = (g['coin_price'] as num?)?.toInt() ??
          (g['coin_value'] as num?)?.toInt() ??
          0;
      final beans = (g['receiver_beans'] as num?)?.toInt() ??
          (coinCost * 0.4).round();
      await _repo.sendGift(
        senderId: me,
        receiverId: _recipientId,
        giftId: _selectedGiftId!,
        coinCost: coinCost,
        receiverBeans: beans,
        quantity: _quantity,
        surface: widget.surface,
        contextId: widget.contextId,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Gift sent'), duration: Duration(seconds: 2)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to send: $e')),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }
}

class _RecipientStrip extends StatelessWidget {
  const _RecipientStrip({
    required this.recipients,
    required this.selectedId,
    required this.onChanged,
  });
  final List<GiftRecipient> recipients;
  final String selectedId;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 62,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: recipients.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final r = recipients[i];
          final active = r.id == selectedId;
          final label = r.badge != null ? '${r.label} · ${r.badge}' : r.label;
          return InkWell(
            onTap: () => onChanged(r.id),
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: active ? 0.14 : 0.05),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: active
                      ? const Color(0xFFF59E0B)
                      : Colors.white.withValues(alpha: 0.1),
                ),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: Colors.white.withValues(alpha: 0.1),
                    backgroundImage: (r.avatarUrl != null && r.avatarUrl!.isNotEmpty)
                        ? NetworkImage(r.avatarUrl!)
                        : null,
                    child: (r.avatarUrl == null || r.avatarUrl!.isEmpty)
                        ? const Icon(Icons.person, color: Colors.white70, size: 18)
                        : null,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _QtyChip extends StatelessWidget {
  const _QtyChip({
    required this.value,
    required this.selected,
    required this.onTap,
  });
  final int value;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? const Color(0xFFF59E0B)
                : Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(
            'x$value',
            style: TextStyle(
              color: selected ? Colors.black : Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 12,
            ),
          ),
        ),
      ),
    );
  }
}
