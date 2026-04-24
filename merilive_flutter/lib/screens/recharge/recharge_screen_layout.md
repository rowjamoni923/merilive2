# Recharge Screen — Flutter Widget Tree (Antigravity reference)

> Implement this widget tree exactly. It mirrors `src/pages/Recharge.tsx` lines 1922–2000 (header), 2003–2150 (banner), and the package grid below.

```dart
// lib/screens/recharge/recharge_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class RechargeScreen extends StatefulWidget {
  const RechargeScreen({super.key});
  @override
  State<RechargeScreen> createState() => _RechargeScreenState();
}

class _RechargeScreenState extends State<RechargeScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  int _selectedTab = 0; // 0=google, 1=recommend, 2=helper
  int _balance = 0;
  bool _isFirstRecharge = false;
  String _currencyCode = 'USD';
  String _currencySymbol = '\$';

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _loadAll();
    _subscribeRealtime();
  }

  Future<void> _loadAll() async {
    // 1. fetch profile.coins
    // 2. fetch currency_rates by user country
    // 3. fetch first_recharge_claims to set _isFirstRecharge
    // 4. fetch coin_packages where is_active=true ordered by display_order
  }

  void _subscribeRealtime() {
    final uid = Supabase.instance.client.auth.currentUser!.id;
    Supabase.instance.client
        .channel('recharge:user:$uid')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'profiles',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq, column: 'id', value: uid),
          callback: (p) => setState(() => _balance = p.newRecord['coins'] ?? 0),
        )
        .subscribe();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [Color(0xFF2D1045), Color(0xFF1A0A2E), Color(0xFF0D0618)],
            stops: [0.0, 0.3, 1.0],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              _buildHeader(),
              if (_isFirstRecharge) _buildFirstRechargeBanner(),
              Expanded(child: _buildBody()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF8B5CF6), Color(0xFFEC4899), Color(0xFF8B5CF6)],
        ),
      ),
      child: Column(
        children: [
          // Title row
          SizedBox(
            height: 56,
            child: Row(children: [
              IconButton(
                icon: const Icon(Icons.arrow_back, color: Colors.white),
                onPressed: () => Navigator.pop(context),
              ),
              const Expanded(
                child: Center(
                  child: Text('Diamond Store',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 18)),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.receipt_long, color: Colors.white),
                onPressed: () => Navigator.pushNamed(context, '/recharge-history'),
              ),
            ]),
          ),
          // Balance card
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.15),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withOpacity(0.2)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(children: [
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.diamond, color: Colors.cyanAccent, size: 22),
                    ),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Your Balance',
                          style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 10)),
                        Text('${_formatNumber(_balance)}',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 20)),
                      ],
                    ),
                  ]),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('Currency', style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 9)),
                        Text('$_currencySymbol $_currencyCode',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Tabs
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(children: [
                _tabPill(0, '💎 Diamonds'),
                _tabPill(1, '🎁 Offers'),
                _tabPill(2, '👥 Helpers'),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tabPill(int idx, String label) {
    final active = _selectedTab == idx;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _selectedTab = idx),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(
            child: Text(label,
              style: TextStyle(
                color: active ? const Color(0xFF8B5CF6) : Colors.white.withOpacity(0.8),
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFirstRechargeBanner() {
    return Container(
      height: 80,
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        gradient: const LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF1A0A2E), Color(0xFF2D1045), Color(0xFF0D0618)],
        ),
        boxShadow: [BoxShadow(color: Colors.amber.withOpacity(0.2), blurRadius: 12)],
      ),
      child: Row(children: [
        const SizedBox(width: 4),
        Image.asset('assets/treasure_chest_3d.png', width: 72, height: 72)
            .animate(onPlay: (c) => c.repeat(reverse: true))
            .scale(duration: 2500.ms, begin: const Offset(0.95, 0.95), end: const Offset(1.05, 1.05)),
        const SizedBox(width: 12),
        Expanded(
          child: ShaderMask(
            shaderCallback: (b) => const LinearGradient(
              colors: [Color(0xFFFFF8DC), Color(0xFFFFD700), Color(0xFFFFA500)],
            ).createShader(b),
            child: const Text('FIRST RECHARGE 2X BONUS',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 2)),
          ),
        ),
      ]),
    );
  }

  Widget _buildBody() {
    switch (_selectedTab) {
      case 0: return _buildPackageGrid(filterType: 'diamonds');
      case 1: return _buildPackageGrid(filterType: 'offers');
      case 2: return _buildHelpersList();
      default: return const SizedBox.shrink();
    }
  }

  Widget _buildPackageGrid({required String filterType}) {
    // GridView.builder with crossAxisCount: 3, childAspectRatio: 0.85
    // Each cell = _buildPackageCard(pkg)
    return const Placeholder();
  }

  Widget _buildHelpersList() {
    // ListView of helper cards (L1-L4 traders) + Local Pay section (L5 methods)
    return const Placeholder();
  }

  String _formatNumber(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }
}
```

## Package Card

```dart
Widget _buildPackageCard(CoinPackageModel pkg) {
  return Stack(children: [
    Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          colors: pkg.isPopular
            ? [const Color(0xFF8B5CF6), const Color(0xFFEC4899)]
            : [Colors.white.withOpacity(0.1), Colors.white.withOpacity(0.05)],
        ),
        border: Border.all(
          color: pkg.isPopular ? const Color(0xFFFFD700) : Colors.white.withOpacity(0.1),
          width: pkg.isPopular ? 2 : 1,
        ),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.diamond, size: 32, color: Color(0xFF06B6D4)),
          const SizedBox(height: 6),
          Text('${pkg.diamonds}', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
          if (pkg.bonusDiamonds > 0) ...[
            const SizedBox(height: 2),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.amber.withOpacity(0.2),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text('+${pkg.bonusDiamonds}',
                style: const TextStyle(color: Colors.amber, fontSize: 10, fontWeight: FontWeight.w700)),
            ),
          ],
          const Spacer(),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text(pkg.priceDisplay,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
            ),
          ),
        ],
      ),
    ),
    if (pkg.isPopular)
      Positioned(top: 4, right: 4, child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFFFFD700), Color(0xFFFFA500)]),
          borderRadius: BorderRadius.circular(6),
        ),
        child: const Text('★ POPULAR', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, color: Colors.black)),
      )),
    if ((pkg.discount ?? 0) > 0)
      Positioned(top: 4, left: 4, child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(6)),
        child: Text('-${pkg.discount}%', style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: Colors.white)),
      )),
  ]);
}
```

## Purchase flow

```dart
Future<void> _purchase(CoinPackageModel pkg) async {
  // 1. If Android native → invoke Play Billing via platform channel
  // 2. Else → call edge function `create-stripe-checkout` and open in-app browser
  // 3. Both paths end with edge function calling `recharge_user_diamonds` RPC
  // 4. UI updates via realtime subscription on profiles
}
```
