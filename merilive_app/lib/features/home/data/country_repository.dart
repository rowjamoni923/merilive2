import 'package:supabase_flutter/supabase_flutter.dart';

import 'iso_country_names.dart';

/// Home country filter data.
///
/// Web parity: `src/pages/Index.tsx` calls
/// `supabase.rpc('get_public_host_countries_v1')` (SECURITY DEFINER, stable)
/// which returns `{country_code, country_flag}` rows of every approved +
/// face-verified female host. We merge those with a small static seed and
/// prepend a synthetic `all` option — identical shape to the web feed.
class HomeCountry {
  const HomeCountry({
    required this.code,
    required this.name,
    required this.flag,
  });

  final String code;
  final String name;
  final String flag;

  HomeCountry copyWith({String? name, String? flag}) => HomeCountry(
        code: code,
        name: name ?? this.name,
        flag: flag ?? this.flag,
      );
}

class CountryRepository {
  CountryRepository(this._supabase);

  final SupabaseClient _supabase;

  /// Seed list — matches `STATIC_COUNTRIES` on web so the strip is populated
  /// instantly even before the RPC resolves.
  static const List<HomeCountry> seed = <HomeCountry>[
    HomeCountry(code: 'BD', name: 'Bangladesh', flag: '🇧🇩'),
    HomeCountry(code: 'IN', name: 'India', flag: '🇮🇳'),
    HomeCountry(code: 'PK', name: 'Pakistan', flag: '🇵🇰'),
    HomeCountry(code: 'NP', name: 'Nepal', flag: '🇳🇵'),
    HomeCountry(code: 'PH', name: 'Philippines', flag: '🇵🇭'),
    HomeCountry(code: 'ID', name: 'Indonesia', flag: '🇮🇩'),
  ];

  static const HomeCountry allOption =
      HomeCountry(code: 'all', name: 'All', flag: '🌍');

  /// Fetch every distinct `{country_code, country_flag}` currently exposed by
  /// the public host RPC. Filters bad rows the same way web does
  /// (skip empty / `NONE` flag) and dedupes by code.
  Future<List<HomeCountry>> fetchDynamic() async {
    final raw = await _supabase.rpc('get_public_host_countries_v1');
    if (raw is! List) return const [];
    final byCode = <String, HomeCountry>{};
    for (final row in raw) {
      if (row is! Map) continue;
      final code = (row['country_code'] as String?)?.trim();
      final flag = (row['country_flag'] as String?)?.trim();
      if (code == null || code.isEmpty) continue;
      if (flag == null || flag.isEmpty || flag == 'NONE') continue;
      final name = isoCountryNameFor(code) ?? code;
      byCode[code] = HomeCountry(code: code, name: name, flag: flag);
    }
    return byCode.values.toList(growable: false);
  }

  /// Merge seed + dynamic exactly like web:
  ///   • dedupe by code (seed wins on collision — keeps human-friendly name)
  ///   • sort by name A→Z
  ///   • prepend `all`
  List<HomeCountry> merge(Iterable<HomeCountry> dynamic_) {
    final map = <String, HomeCountry>{};
    for (final c in seed) {
      map[c.code] = c;
    }
    for (final c in dynamic_) {
      map.putIfAbsent(c.code, () => c);
    }
    final list = map.values.toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return <HomeCountry>[allOption, ...list];
  }
}
