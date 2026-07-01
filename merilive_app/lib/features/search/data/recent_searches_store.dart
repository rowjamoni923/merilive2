import 'search_user.dart';

/// In-memory recent-searches store — parity with the web
/// `localStorage.recent_searches` list (max 5, most recent first).
///
/// TODO(H-later): swap to `shared_preferences` for cross-session persistence
/// once the pubspec picks up the dependency. Session-scoped is acceptable for
/// H7 shipping — the web copy also survives only the current install.
class RecentSearchesStore {
  RecentSearchesStore._();
  static final RecentSearchesStore instance = RecentSearchesStore._();

  static const _cap = 5;
  final List<SearchUser> _items = [];

  List<SearchUser> get items => List.unmodifiable(_items);

  void add(SearchUser user) {
    _items.removeWhere((u) => u.id == user.id);
    _items.insert(0, user);
    if (_items.length > _cap) _items.removeRange(_cap, _items.length);
  }

  void remove(String userId) => _items.removeWhere((u) => u.id == userId);
  void clear() => _items.clear();
}
