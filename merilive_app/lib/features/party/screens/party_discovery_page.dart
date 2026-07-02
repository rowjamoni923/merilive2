import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/router/app_router.gr.dart';
import '../bloc/party_discovery_cubit.dart';
import '../data/party_discovery_realtime.dart';
import '../data/party_discovery_repository.dart';
import '../data/party_models.dart';
import '../widgets/party_preview_sheet.dart';
import '../widgets/party_room_card.dart';
import '../widgets/room_code_dialog.dart';

/// Party discovery — party rooms only. NO live streaming cards.
///
/// 1:1 port of `src/pages/Discover.tsx`.
class PartyDiscoveryPage extends StatefulWidget {
  const PartyDiscoveryPage({super.key});

  @override
  State<PartyDiscoveryPage> createState() => _PartyDiscoveryPageState();
}

class _PartyDiscoveryPageState extends State<PartyDiscoveryPage>
    with AutomaticKeepAliveClientMixin {
  late final PartyDiscoveryCubit _cubit;
  late final TextEditingController _searchController;

  @override
  void initState() {
    super.initState();
    final client = Supabase.instance.client;
    _cubit = PartyDiscoveryCubit(
      PartyDiscoveryRepository(client),
      PartyDiscoveryRealtime(client),
    );
    _searchController = TextEditingController();
    _cubit.start().whenComplete(() {
      if (mounted && _searchController.text != _cubit.state.searchQuery) {
        _searchController.text = _cubit.state.searchQuery;
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _cubit.close();
    super.dispose();
  }

  @override
  bool get wantKeepAlive => true;

  void _openRoomCode() {
    showDialog(
      context: context,
      builder: (_) => RoomCodeDialog(
        onSubmit: (code) async {
          final room = await _cubit.findByCode(code);
          if (!mounted) return;
          if (room == null) {
            Navigator.of(context).maybePop();
            _toast('Room not found');
            return;
          }
          Navigator.of(context).maybePop();
          _openPreview(room);
        },
      ),
    );
  }

  void _openPreview(PartyRoom room) {
    HapticFeedback.selectionClick();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withOpacity(0.45),
      builder: (_) => PartyPreviewSheet(
        room: room,
        onEnter: () => _enterRoom(room),
      ),
    );
  }

  void _enterRoom(PartyRoom room) {
    HapticFeedback.mediumImpact();
    context.router.push(PartyRoomPlaceholderRoute(roomId: room.id));
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ));
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return BlocProvider.value(
      value: _cubit,
      child: Scaffold(
        backgroundColor: const Color(0xFFFAF7F0),
        body: BlocBuilder<PartyDiscoveryCubit, PartyDiscoveryState>(
          builder: (context, state) {
            return Column(
              children: [
                _Header(
                  searchController: _searchController,
                  onSearchChanged: _cubit.setSearch,
                  onRoomCodeTap: _openRoomCode,
                  onRefreshTap: () => _cubit.refresh(userInitiated: true),
                  refreshing: state.isRefreshing,
                ),
                _TabStrip(
                  active: state.activeTab,
                  onSelect: _cubit.setTab,
                ),
                _CountryStrip(
                  selected: state.selectedCountry,
                  onSelect: _cubit.setCountry,
                ),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: () => _cubit.refresh(userInitiated: true),
                    color: const Color(0xFF6366F1),
                    child: _RoomsGrid(
                      state: state,
                      onTapRoom: _openPreview,
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// ─── Header ────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  const _Header({
    required this.searchController,
    required this.onSearchChanged,
    required this.onRoomCodeTap,
    required this.onRefreshTap,
    required this.refreshing,
  });

  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onRoomCodeTap;
  final VoidCallback onRefreshTap;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF6D28D9),
            Color(0xFF7C3AED),
            Color(0xFF4F46E5),
          ],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 12, 14),
          child: Column(
            children: [
              Row(
                children: [
                  const SizedBox(width: 44),
                  const Expanded(
                    child: Text(
                      'Party Rooms',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: refreshing ? null : onRefreshTap,
                    icon: refreshing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.refresh_rounded,
                            color: Colors.white),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 40,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.18),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        children: [
                          const SizedBox(width: 12),
                          const Icon(Icons.search_rounded,
                              size: 18, color: Colors.white),
                          const SizedBox(width: 6),
                          Expanded(
                            child: TextField(
                              controller: searchController,
                              onChanged: onSearchChanged,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 13.5,
                              ),
                              decoration: InputDecoration(
                                hintText: 'Search rooms, hosts, or code...',
                                hintStyle: TextStyle(
                                  color: Colors.white.withOpacity(0.7),
                                  fontSize: 13,
                                ),
                                border: InputBorder.none,
                                isCollapsed: true,
                              ),
                            ),
                          ),
                          if (searchController.text.isNotEmpty)
                            IconButton(
                              iconSize: 16,
                              icon: const Icon(Icons.close_rounded,
                                  color: Colors.white),
                              onPressed: () {
                                searchController.clear();
                                onSearchChanged('');
                              },
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.22),
                      shape: BoxShape.circle,
                    ),
                    child: IconButton(
                      onPressed: onRoomCodeTap,
                      icon: const Icon(Icons.vpn_key_rounded,
                          color: Colors.white, size: 18),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Tab strip ─────────────────────────────────────────────────────────
class _TabStrip extends StatelessWidget {
  const _TabStrip({required this.active, required this.onSelect});

  final PartyRoomTab active;
  final ValueChanged<PartyRoomTab> onSelect;

  static const _tabs = <(PartyRoomTab, String, IconData?, List<Color>)>[
    (PartyRoomTab.all, 'All', null, [Color(0xFF6366F1), Color(0xFFA855F7)]),
    (PartyRoomTab.video, 'Video', Icons.videocam_rounded,
        [Color(0xFF10B981), Color(0xFF059669)]),
    (PartyRoomTab.audio, 'Audio', Icons.mic_rounded,
        [Color(0xFF3B82F6), Color(0xFF2563EB)]),
    (
      PartyRoomTab.game,
      'Game',
      Icons.sports_esports_rounded,
      [Color(0xFF7C3AED), Color(0xFF6366F1)]
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      child: Container(
        height: 40,
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          children: _tabs.map((entry) {
            final isActive = entry.$1 == active;
            return Expanded(
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  onSelect(entry.$1);
                },
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    gradient: isActive
                        ? LinearGradient(colors: entry.$4)
                        : null,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  alignment: Alignment.center,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (entry.$3 != null) ...[
                        Icon(entry.$3,
                            size: 12,
                            color: isActive
                                ? Colors.white
                                : const Color(0xFF64748B)),
                        const SizedBox(width: 3),
                      ],
                      Text(
                        entry.$2,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: isActive
                              ? Colors.white
                              : const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

// ─── Country strip ─────────────────────────────────────────────────────
class _CountryStrip extends StatelessWidget {
  const _CountryStrip({required this.selected, required this.onSelect});

  final String selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        scrollDirection: Axis.horizontal,
        itemCount: kPartyCountries.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final c = kPartyCountries[i];
          final active = c.code == selected;
          return GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              onSelect(c.code);
            },
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                gradient: active
                    ? const LinearGradient(colors: [
                        Color(0xFFEC4899),
                        Color(0xFFF43F5E),
                      ])
                    : null,
                color: active ? null : Colors.white,
                borderRadius: BorderRadius.circular(999),
                border: active
                    ? null
                    : Border.all(color: const Color(0xFFE2E8F0)),
                boxShadow: active
                    ? [
                        BoxShadow(
                          color: const Color(0xFFEC4899).withOpacity(0.35),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ]
                    : null,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(c.flag, style: const TextStyle(fontSize: 13)),
                  const SizedBox(width: 5),
                  Text(
                    c.name,
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                      color: active
                          ? Colors.white
                          : const Color(0xFF0F172A),
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

// ─── Grid ──────────────────────────────────────────────────────────────
class _RoomsGrid extends StatelessWidget {
  const _RoomsGrid({required this.state, required this.onTapRoom});

  final PartyDiscoveryState state;
  final void Function(PartyRoom room) onTapRoom;

  @override
  Widget build(BuildContext context) {
    final rooms = state.filteredRooms;
    if (state.isLoading && rooms.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.only(top: 40),
          child: CircularProgressIndicator(color: Color(0xFF6366F1)),
        ),
      );
    }
    if (rooms.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 64),
          _EmptyState(),
        ],
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
      physics: const AlwaysScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 0.82,
      ),
      itemCount: rooms.length,
      itemBuilder: (_, i) => PartyRoomCard(
        room: rooms[i],
        onTap: () => onTapRoom(rooms[i]),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          Container(
            width: 88,
            height: 88,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [
                Color(0xFF6366F1),
                Color(0xFFA855F7),
              ]),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF6366F1).withOpacity(0.45),
                  blurRadius: 24,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: const Icon(Icons.sports_esports_rounded,
                color: Colors.white, size: 42),
          ),
          const SizedBox(height: 18),
          const Text(
            'No Active Rooms',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Rooms will appear when hosts start streaming!',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12.5, color: Color(0xFF64748B)),
          ),
        ],
      ),
    );
  }
}
