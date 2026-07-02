import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../bloc/party_room_cubit.dart';
import '../data/party_models.dart';
import '../data/party_room_models.dart';
import '../data/party_room_repository.dart';

/// PD7 — Gift bridge for party rooms.
///
/// Loads gifts from the admin catalog, lets the sender pick a seated
/// recipient (defaults to host), and inserts a `gift_transactions` row
/// that the server-side triggers convert into coin/bean movement.
Future<void> showPartyGiftSheet(BuildContext context) async {
  final cubit = context.read<PartyRoomCubit>();
  final state = cubit.state;
  if (state.room == null) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF1F1B3A),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => BlocProvider.value(
      value: cubit,
      child: const _PartyGiftSheet(),
    ),
  );
}

class _PartyGiftSheet extends StatefulWidget {
  const _PartyGiftSheet();
  @override
  State<_PartyGiftSheet> createState() => _PartyGiftSheetState();
}

class _PartyGiftSheetState extends State<_PartyGiftSheet> {
  late Future<List<Map<String, dynamic>>> _future;
  String? _selectedGiftId;
  int _quantity = 1;
  String? _recipientId;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _future = context.read<PartyRoomCubit>().repository.loadGifts();
    final host = context.read<PartyRoomCubit>().state.host;
    _recipientId = host?.id;
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<PartyRoomCubit>().state;
    final seatedUsers = <PartySeat>[
      for (final s in state.seats)
        if (!s.isEmpty && s.userId != null) s,
    ];
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
              _RecipientPicker(
                seats: seatedUsers,
                host: state.host,
                selectedId: _recipientId,
                onChanged: (id) => setState(() => _recipientId = id),
              ),
              const SizedBox(height: 10),
              Expanded(
                child: FutureBuilder<List<Map<String, dynamic>>>(
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
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
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
                                  child: (g['icon_url'] as String?)?.isNotEmpty ==
                                          true
                                      ? Image.network(
                                          g['icon_url'] as String,
                                          fit: BoxFit.contain,
                                          errorBuilder: (_, __, ___) =>
                                              const Icon(
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
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  _QtyChip(value: 1, selected: _quantity == 1, onTap: () => setState(() => _quantity = 1)),
                  _QtyChip(value: 10, selected: _quantity == 10, onTap: () => setState(() => _quantity = 10)),
                  _QtyChip(value: 66, selected: _quantity == 66, onTap: () => setState(() => _quantity = 66)),
                  _QtyChip(value: 188, selected: _quantity == 188, onTap: () => setState(() => _quantity = 188)),
                  const Spacer(),
                  ElevatedButton(
                    onPressed: (_sending ||
                            _selectedGiftId == null ||
                            _recipientId == null)
                        ? null
                        : () => _send(context),
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
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _send(BuildContext context) async {
    final cubit = context.read<PartyRoomCubit>();
    final me = Supabase.instance.client.auth.currentUser?.id;
    if (me == null || _selectedGiftId == null || _recipientId == null) return;
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
      await cubit.repository.sendGift(
        roomId: cubit.roomId,
        senderId: me,
        receiverId: _recipientId!,
        giftId: _selectedGiftId!,
        coinCost: coinCost,
        receiverBeans: beans,
        quantity: _quantity,
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

class _RecipientPicker extends StatelessWidget {
  const _RecipientPicker({
    required this.seats,
    required this.host,
    required this.selectedId,
    required this.onChanged,
  });
  final List<PartySeat> seats;
  final PartyHost? host;
  final String? selectedId;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final targets = <({String id, String label, String? avatar})>[
      if (host != null)
        (id: host!.id, label: '${host!.displayName} · Host', avatar: host!.avatarUrl),
      for (final s in seats)
        if (s.userId != null && s.userId != host?.id)
          (
            id: s.userId!,
            label: '${s.displayName ?? 'Guest'} · Seat ${s.seatNumber}',
            avatar: s.avatarUrl,
          ),
    ];
    return SizedBox(
      height: 62,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: targets.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final t = targets[i];
          final active = t.id == selectedId;
          return InkWell(
            onTap: () => onChanged(t.id),
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
                    backgroundImage: (t.avatar != null && t.avatar!.isNotEmpty)
                        ? NetworkImage(t.avatar!)
                        : null,
                    child: (t.avatar == null || t.avatar!.isEmpty)
                        ? const Icon(Icons.person, color: Colors.white70, size: 18)
                        : null,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    t.label,
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
