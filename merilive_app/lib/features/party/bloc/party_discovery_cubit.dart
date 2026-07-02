import 'dart:async';
import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/party_discovery_realtime.dart';
import '../data/party_discovery_repository.dart';
import '../data/party_models.dart';

class PartyDiscoveryState extends Equatable {
  const PartyDiscoveryState({
    required this.rooms,
    required this.activeTab,
    required this.selectedCountry,
    required this.searchQuery,
    required this.isLoading,
    required this.isRefreshing,
    this.errorMessage,
  });

  factory PartyDiscoveryState.initial() => const PartyDiscoveryState(
        rooms: [],
        activeTab: PartyRoomTab.all,
        selectedCountry: 'all',
        searchQuery: '',
        isLoading: true,
        isRefreshing: false,
      );

  final List<PartyRoom> rooms;
  final PartyRoomTab activeTab;
  final String selectedCountry;
  final String searchQuery;
  final bool isLoading;
  final bool isRefreshing;
  final String? errorMessage;

  PartyDiscoveryState copyWith({
    List<PartyRoom>? rooms,
    PartyRoomTab? activeTab,
    String? selectedCountry,
    String? searchQuery,
    bool? isLoading,
    bool? isRefreshing,
    String? errorMessage,
    bool clearError = false,
  }) =>
      PartyDiscoveryState(
        rooms: rooms ?? this.rooms,
        activeTab: activeTab ?? this.activeTab,
        selectedCountry: selectedCountry ?? this.selectedCountry,
        searchQuery: searchQuery ?? this.searchQuery,
        isLoading: isLoading ?? this.isLoading,
        isRefreshing: isRefreshing ?? this.isRefreshing,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      );

  /// Filter + sort — mirrors `filteredRooms` in `Discover.tsx`.
  List<PartyRoom> get filteredRooms {
    Iterable<PartyRoom> list = rooms;

    // Tab
    if (activeTab != PartyRoomTab.all) {
      final t = switch (activeTab) {
        PartyRoomTab.video => PartyRoomType.video,
        PartyRoomTab.audio => PartyRoomType.audio,
        PartyRoomTab.game => PartyRoomType.game,
        _ => PartyRoomType.other,
      };
      list = list.where((r) => r.roomType == t);
    }

    // Country — matches host country_code (web behaviour).
    if (selectedCountry != 'all') {
      list = list.where((r) => r.host?.countryCode == selectedCountry);
    }

    // Search — room name, host display name, or room_code.
    final q = searchQuery.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list.where((r) {
        final rn = r.name.toLowerCase();
        final hn = (r.host?.displayName ?? '').toLowerCase();
        final rc = (r.roomCode ?? '').toLowerCase();
        return rn.contains(q) || hn.contains(q) || rc.contains(q);
      });
    }

    final sorted = list.toList()
      ..sort((a, b) => b.currentParticipants.compareTo(a.currentParticipants));
    return sorted;
  }

  @override
  List<Object?> get props => [
        rooms,
        activeTab,
        selectedCountry,
        searchQuery,
        isLoading,
        isRefreshing,
        errorMessage,
      ];
}

class PartyDiscoveryCubit extends Cubit<PartyDiscoveryState> {
  PartyDiscoveryCubit(this._repo, this._realtime)
      : super(PartyDiscoveryState.initial());

  static const _cacheKey = 'discover:rooms:v1';
  static const _countryPrefsKey = 'discover:country:v1';
  static const _tabPrefsKey = 'discover:tab:v1';

  final PartyDiscoveryRepository _repo;
  final PartyDiscoveryRealtime _realtime;

  StreamSubscription<PartyRealtimeEvent>? _sub;
  Timer? _debounce;

  Future<void> start() async {
    await _hydrateFilters();
    await _paintFromCache();
    unawaited(refresh());
    _realtime.start();
    _sub = _realtime.stream.listen(_onRealtime);
  }

  Future<void> _hydrateFilters() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final country = sp.getString(_countryPrefsKey);
      final tab = sp.getString(_tabPrefsKey);
      emit(state.copyWith(
        selectedCountry: (country == null || country.isEmpty)
            ? state.selectedCountry
            : country,
        activeTab: _tabFromString(tab) ?? state.activeTab,
      ));
    } catch (_) {}
  }

  Future<void> _paintFromCache() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final raw = sp.getString(_cacheKey);
      if (raw == null || raw.isEmpty) return;
      final list = (jsonDecode(raw) as List)
          .whereType<Map>()
          .map((m) => PartyRoom.fromRow(
                Map<String, dynamic>.from(m),
                host: (m['__host'] is Map)
                    ? PartyHost.fromRow(Map<String, dynamic>.from(m['__host']))
                    : null,
              ))
          .toList(growable: false);
      if (list.isNotEmpty) {
        emit(state.copyWith(rooms: list, isLoading: false));
      }
    } catch (_) {}
  }

  Future<void> _writeCache(List<PartyRoom> rooms) async {
    try {
      final sp = await SharedPreferences.getInstance();
      final encoded = rooms.take(60).map((r) {
        final host = r.host;
        return {
          'id': r.id,
          'name': r.name,
          'room_type': r.roomType.label,
          'game_mode': r.gameMode,
          'background_url': r.backgroundUrl,
          'entry_fee': r.entryFee,
          'min_level': r.minLevel,
          'max_participants': r.maxParticipants,
          'current_participants': r.currentParticipants,
          'is_private': r.isPrivate,
          'room_code': r.roomCode,
          'mood': r.mood,
          'description': r.description,
          'welcome_message': r.welcomeMessage,
          '__host': host == null
              ? null
              : {
                  'id': host.id,
                  'display_name': host.displayName,
                  'avatar_url': host.avatarUrl,
                  'user_level': host.userLevel,
                  'host_level': host.hostLevel,
                  'country_code': host.countryCode,
                  'country_flag': host.countryFlag,
                  'gender': host.gender,
                  'is_online': host.isOnline,
                  'is_host': host.isHost,
                },
        };
      }).toList();
      await sp.setString(_cacheKey, jsonEncode(encoded));
    } catch (_) {}
  }

  void _onRealtime(PartyRealtimeEvent e) {
    // Instant-close short-circuit: drop the room without waiting for refetch.
    if (e.kind == PartyRealtimeEventKind.closed && e.roomId != null) {
      final trimmed =
          state.rooms.where((r) => r.id != e.roomId).toList(growable: false);
      if (trimmed.length != state.rooms.length) {
        emit(state.copyWith(rooms: trimmed));
        _writeCache(trimmed);
      }
    }
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 1500), refresh);
  }

  Future<void> refresh({bool userInitiated = false}) async {
    if (userInitiated) emit(state.copyWith(isRefreshing: true, clearError: true));
    try {
      final rooms = await _repo.fetchRooms();
      emit(state.copyWith(
        rooms: rooms,
        isLoading: false,
        isRefreshing: false,
        clearError: true,
      ));
      unawaited(_writeCache(rooms));
    } catch (e) {
      emit(state.copyWith(
        isLoading: false,
        isRefreshing: false,
        errorMessage: e.toString(),
      ));
    }
  }

  void setTab(PartyRoomTab tab) {
    if (tab == state.activeTab) return;
    emit(state.copyWith(activeTab: tab));
    SharedPreferences.getInstance()
        .then((sp) => sp.setString(_tabPrefsKey, tab.name))
        .catchError((_) {});
  }

  void setCountry(String code) {
    if (code == state.selectedCountry) return;
    emit(state.copyWith(selectedCountry: code));
    SharedPreferences.getInstance()
        .then((sp) => sp.setString(_countryPrefsKey, code))
        .catchError((_) {});
  }

  void setSearch(String query) {
    if (query == state.searchQuery) return;
    emit(state.copyWith(searchQuery: query));
  }

  Future<PartyRoom?> findByCode(String code) => _repo.findByCode(code);

  static PartyRoomTab? _tabFromString(String? raw) {
    if (raw == null) return null;
    for (final t in PartyRoomTab.values) {
      if (t.name == raw) return t;
    }
    return null;
  }

  @override
  Future<void> close() async {
    _debounce?.cancel();
    await _sub?.cancel();
    await _realtime.dispose();
    return super.close();
  }
}
