import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'search_user.dart';

/// Persistent recent-searches store — parity with web `localStorage.recent_searches`.
///
/// Cap 5, most-recent-first. Backed by `shared_preferences` so the list
/// survives app restarts. Reads are memoized so the search screen never
/// blocks on disk after the first hydrate.
class RecentSearchesStore {
  RecentSearchesStore._();
  static final RecentSearchesStore instance = RecentSearchesStore._();

  static const _cap = 5;
  static const _prefsKey = 'recent_searches_v1';

  final List<SearchUser> _items = [];
  bool _hydrated = false;
  Future<void>? _hydrating;

  Future<void> hydrate() {
    if (_hydrated) return Future.value();
    return _hydrating ??= _load();
  }

  Future<void> _load() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final raw = sp.getString(_prefsKey);
      if (raw != null && raw.isNotEmpty) {
        final list = (jsonDecode(raw) as List)
            .whereType<Map>()
            .map((m) => SearchUser.fromJson(Map<String, dynamic>.from(m)))
            .toList();
        _items
          ..clear()
          ..addAll(list.take(_cap));
      }
    } catch (_) {
      // Corrupt cache — treat as empty. Non-fatal.
    } finally {
      _hydrated = true;
    }
  }

  List<SearchUser> get items => List.unmodifiable(_items);

  Future<void> add(SearchUser user) async {
    await hydrate();
    _items.removeWhere((u) => u.id == user.id);
    _items.insert(0, user);
    if (_items.length > _cap) _items.removeRange(_cap, _items.length);
    await _persist();
  }

  Future<void> remove(String userId) async {
    await hydrate();
    _items.removeWhere((u) => u.id == userId);
    await _persist();
  }

  Future<void> clear() async {
    _items.clear();
    await _persist();
  }

  Future<void> _persist() async {
    try {
      final sp = await SharedPreferences.getInstance();
      await sp.setString(
        _prefsKey,
        jsonEncode(_items.map((u) => u.toJson()).toList()),
      );
    } catch (_) {}
  }
}
