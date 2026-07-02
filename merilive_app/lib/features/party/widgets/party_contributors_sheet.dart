import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// G9 — Gift contributors leaderboard for the current party room.
///
/// Aggregates `gift_transactions` rows by sender for the last 24h in this
/// room and renders a Chamet-style top-senders sheet.
class PartyContributorsSheet extends StatefulWidget {
  const PartyContributorsSheet({super.key, required this.roomId});
  final String roomId;

  static Future<void> show(BuildContext context, String roomId) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => PartyContributorsSheet(roomId: roomId),
    );
  }

  @override
  State<PartyContributorsSheet> createState() => _PartyContributorsSheetState();
}

class _PartyContributorsSheetState extends State<PartyContributorsSheet> {
  bool _loading = true;
  List<_Row> _rows = const [];
  int _totalCoins = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final since = DateTime.now()
          .toUtc()
          .subtract(const Duration(hours: 24))
          .toIso8601String();
      final rows = await Supabase.instance.client
          .from('gift_transactions')
          .select('sender_id, total_coins, coin_amount')
          .eq('party_room_id', widget.roomId)
          .gte('created_at', since)
          .limit(500);

      final agg = <String, int>{};
      var total = 0;
      for (final r in (rows as List).cast<Map>()) {
        final uid = r['sender_id']?.toString();
        if (uid == null) continue;
        final coins = (r['total_coins'] as num?)?.toInt() ??
            (r['coin_amount'] as num?)?.toInt() ??
            0;
        total += coins;
        agg[uid] = (agg[uid] ?? 0) + coins;
      }
      final ids = agg.keys.toList();
      final profileMap = <String, Map<String, dynamic>>{};
      if (ids.isNotEmpty) {
        final profs = await Supabase.instance.client
            .from('profiles_public')
            .select('id, display_name, avatar_url')
            .inFilter('id', ids);
        for (final p in (profs as List).cast<Map>()) {
          profileMap[p['id'].toString()] = p.cast<String, dynamic>();
        }
      }
      final list = agg.entries
          .map((e) => _Row(
                userId: e.key,
                name: (profileMap[e.key]?['display_name'] as String?) ?? 'User',
                avatar: profileMap[e.key]?['avatar_url'] as String?,
                coins: e.value,
              ))
          .toList()
        ..sort((a, b) => b.coins.compareTo(a.coins));
      if (mounted) setState(() {
        _rows = list.take(50).toList();
        _totalCoins = total;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scroll) => Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF1E1B4B), Color(0xFF0F172A)],
          ),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.emoji_events_rounded,
                  color: Color(0xFFFACC15), size: 20),
              const SizedBox(width: 8),
              const Text('Top Contributors (24h)',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700)),
              const Spacer(),
              Text('$_totalCoins💰',
                  style: const TextStyle(
                      color: Color(0xFFFACC15),
                      fontSize: 13,
                      fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 10),
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(color: Colors.white))
                  : _rows.isEmpty
                      ? const Center(
                          child: Text('No contributions yet',
                              style: TextStyle(color: Colors.white54)))
                      : ListView.builder(
                          controller: scroll,
                          itemCount: _rows.length,
                          itemBuilder: (_, i) {
                            final r = _rows[i];
                            final rank = i + 1;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Row(children: [
                                SizedBox(
                                  width: 26,
                                  child: Text('#$rank',
                                      style: TextStyle(
                                          color: rank <= 3
                                              ? const Color(0xFFFACC15)
                                              : Colors.white54,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 13)),
                                ),
                                CircleAvatar(
                                  radius: 18,
                                  backgroundColor: const Color(0xFF6D28D9),
                                  backgroundImage: (r.avatar != null &&
                                          r.avatar!.isNotEmpty)
                                      ? NetworkImage(r.avatar!)
                                      : null,
                                  child: (r.avatar == null ||
                                          r.avatar!.isEmpty)
                                      ? const Icon(Icons.person,
                                          size: 18, color: Colors.white70)
                                      : null,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    r.name,
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                Text('${r.coins}💰',
                                    style: const TextStyle(
                                        color: Color(0xFFFACC15),
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700)),
                              ]),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Row {
  _Row(
      {required this.userId,
      required this.name,
      required this.avatar,
      required this.coins});
  final String userId;
  final String name;
  final String? avatar;
  int coins;
}
