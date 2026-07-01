import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../services/api_service.dart';
import 'ban_popup_dialog.dart';

class ProtectedRoute extends StatefulWidget {
  final Widget child;

  const ProtectedRoute({super.key, required this.child});

  @override
  State<ProtectedRoute> createState() => _ProtectedRouteState();
}

class _ProtectedRouteState extends State<ProtectedRoute> {
  final ApiService _api = ApiService();
  bool _isBanned = false;
  String? _banReason;
  String? _bannedUntil;
  bool _isLoading = true;
  RealtimeChannel? _banChannel;

  @override
  void initState() {
    super.initState();
    _checkInitialStatus();
    _setupRealtimeBanCheck();
  }

  @override
  void dispose() {
    _banChannel?.unsubscribe();
    super.dispose();
  }

  Future<void> _checkInitialStatus() async {
    final user = _api.getSupabase().auth.currentUser;
    if (user == null) {
      setState(() => _isLoading = false);
      return;
    }

    try {
      final data = await _api.getSupabase()
          .from('profiles')
          .select('is_blocked, blocked_reason, banned_until')
          .eq('id', user.id)
          .maybeSingle();

      if (data != null && data['is_blocked'] == true) {
        setState(() {
          _isBanned = true;
          _banReason = data['blocked_reason'];
          _bannedUntil = data['banned_until'];
        });
      }
    } catch (e) {
      debugPrint("Error checking ban status: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _setupRealtimeBanCheck() {
    final user = _api.getSupabase().auth.currentUser;
    if (user == null) return;

    _banChannel = _api.getSupabase()
        .channel('public:profiles:id=eq.${user.id}')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'profiles',
          filter: 'id=eq.${user.id}',
          callback: (payload) {
            final newData = payload.newRecord;
            if (newData['is_blocked'] == true) {
              if (mounted) {
                setState(() {
                  _isBanned = true;
                  _banReason = newData['blocked_reason'];
                  _bannedUntil = newData['banned_until'];
                });
              }
            }
          },
        )
        .subscribe();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: Color(0xFF020617),
        body: Center(
          child: CircularProgressIndicator(color: Colors.purpleAccent),
        ),
      );
    }

    return Stack(
      children: [
        widget.child,
        if (_isBanned)
          Positioned.fill(
            child: Container(
              color: Colors.black54,
              child: BanPopupDialog(
                reason: _banReason,
                bannedUntil: _bannedUntil,
              ),
            ),
          ),
      ],
    );
  }
}
