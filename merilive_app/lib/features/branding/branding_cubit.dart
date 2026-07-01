import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/supabase/supabase_client.dart';
import 'branding.dart';

/// Realtime branding source — parity with `useBrandingRealtime` in web.
class BrandingCubit extends Cubit<Branding> {
  BrandingCubit() : super(Branding.fallback) {
    _load();
    _subscribeRealtime();
  }

  StreamSubscription<List<Map<String, dynamic>>>? _sub;

  Future<void> _load() async {
    try {
      final row = await sb
          .from('branding_settings')
          .select()
          .limit(1)
          .maybeSingle();
      if (row != null) emit(Branding.fromRow(row));
    } catch (_) {
      // keep fallback silently
    }
  }

  void _subscribeRealtime() {
    _sub = sb
        .from('branding_settings')
        .stream(primaryKey: ['id'])
        .listen((rows) {
      if (rows.isNotEmpty) emit(Branding.fromRow(rows.first));
    });
  }

  @override
  Future<void> close() {
    _sub?.cancel();
    return super.close();
  }
}
