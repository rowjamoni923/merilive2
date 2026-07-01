# Profile — 3 Persona Router (Antigravity reference)

```dart
// lib/screens/profile/profile_screen.dart

class ProfileScreen extends StatelessWidget {
  final String? userId; // null = self

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_ProfileBundle>(
      future: _loadBundle(userId),
      builder: (ctx, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const _ShimmerSkeleton();
        }
        if (snap.hasError || !snap.hasData) {
          return const _ProfileNotFound();   // never crash
        }
        final b = snap.data!;
        switch (_detectPersona(b.profile, b.agency)) {
          case ProfilePersona.agency: return AgencyProfileView(bundle: b);
          case ProfilePersona.host:   return HostProfileView(bundle: b);
          case ProfilePersona.user:   return UserProfileView(bundle: b);
        }
      },
    );
  }

  ProfilePersona _detectPersona(ProfileModel p, AgencyModel? a) {
    if (a != null && a.ownerId == p.id) return ProfilePersona.agency;
    if (p.isVerifiedHost) return ProfilePersona.host;
    return ProfilePersona.user;
  }
}

class _ProfileBundle {
  final ProfileModel profile;
  final AgencyModel? agency;
  final HostApplicationModel? hostApp;
  _ProfileBundle({required this.profile, this.agency, this.hostApp});
}

Future<_ProfileBundle> _loadBundle(String? userId) async {
  final supabase = Supabase.instance.client;
  final uid = userId ?? supabase.auth.currentUser!.id;

  // Three parallel queries with 5s timeout each
  final results = await Future.wait([
    supabase.from('profiles').select().eq('id', uid).maybeSingle()
        .timeout(const Duration(seconds: 5)),
    supabase.from('agencies').select().eq('owner_id', uid).maybeSingle()
        .timeout(const Duration(seconds: 5)),
    supabase.from('host_applications').select()
        .eq('user_id', uid).order('created_at', ascending: false).limit(1).maybeSingle()
        .timeout(const Duration(seconds: 5)),
  ]);

  final profileJson = results[0] as Map<String, dynamic>?;
  if (profileJson == null) throw Exception('Profile not found');

  return _ProfileBundle(
    profile: ProfileModel.fromJson(profileJson),
    agency: results[1] != null ? AgencyModel.fromJson(results[1] as Map<String, dynamic>) : null,
    hostApp: results[2] != null ? HostApplicationModel.fromJson(results[2] as Map<String, dynamic>) : null,
  );
}
```

## UserProfileView (auto Apply-as-Host CTA)

```dart
class UserProfileView extends StatelessWidget {
  final _ProfileBundle bundle;
  @override
  Widget build(BuildContext context) {
    final p = bundle.profile;
    final canApplyHost = p.gender?.toLowerCase() == 'female' && !p.isHost;
    final hasPendingApp = bundle.hostApp?.status == 'pending';
    final approvedAwaitingFace = bundle.hostApp?.status == 'approved' && !p.isFaceVerified;

    return CustomScrollView(slivers: [
      const _ProfileHeader(),
      SliverList(delegate: SliverChildListDelegate([
        const _WalletCard(),

        // Conditional CTAs (English only)
        if (canApplyHost && bundle.hostApp == null)
          _ApplyHostBanner(text: 'Become a Host →', onTap: () => Navigator.pushNamed(context, '/host-application')),

        if (hasPendingApp)
          _StatusBanner(text: 'Host application under review', color: Colors.amber),

        if (approvedAwaitingFace)
          _StatusBanner(
            text: 'Approved! Complete Face Verification to go live →',
            color: Colors.green,
            onTap: () => Navigator.pushNamed(context, '/face-verification'),
          ),

        const _QuickLinks(),
        const _ReelsTab(),
      ])),
    ]);
  }
}
```

## HostProfileView

```dart
class HostProfileView extends StatelessWidget {
  final _ProfileBundle bundle;
  @override
  Widget build(BuildContext context) {
    return CustomScrollView(slivers: [
      const _ProfileHeader(),  // shows host_level badge + verified ✓
      SliverList(delegate: SliverChildListDelegate([
        const _EarningsCard(),                  // today/week/month
        const _BeansToDiamondsExchange(),       // exchange_user_beans_to_diamonds RPC
        if (bundle.profile.agencyId != null)
          const _AutoTransferToAgencyToggle(),  // host_settings.auto_transfer_to_agency
        const _GoLiveButton(),
        const _QuickLinks(showWithdraw: true, showHostDashboard: true),
      ])),
    ]);
  }
}
```

## AgencyProfileView

```dart
class AgencyProfileView extends StatelessWidget {
  final _ProfileBundle bundle;
  @override
  Widget build(BuildContext context) {
    final a = bundle.agency!;
    return CustomScrollView(slivers: [
      _AgencyHeader(agency: a),    // logo + name + agency_code
      SliverList(delegate: SliverChildListDelegate([
        _AgencyStatsGrid(agency: a),  // hosts / active / income / pending
        const _AgencyCTAs(),          // manage hosts, withdraw, dashboard, invite
        const _WalletCard(),
        const _QuickLinks(),
      ])),
    ]);
  }
}
```

## Realtime persona-flip subscription

```dart
@override
void initState() {
  super.initState();
  Supabase.instance.client.channel('profile:${widget.userId}')
    .onPostgresChanges(
      event: PostgresChangeEvent.update,
      schema: 'public', table: 'profiles',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq, column: 'id', value: widget.userId),
      callback: (_) => setState(() {}),  // re-evaluate persona
    )
    .subscribe();
}
```

## NEVER-DO

- ❌ Never show "Apply as Host" to non-female users.
- ❌ Never grant `is_host = true` from client. Only the face-verification trigger or admin approve flips it.
- ❌ Never `setState` failures into a thrown widget — always render a graceful fallback.
- ❌ Never read profile from `profiles` directly for non-owners — use `profiles_public` view.
