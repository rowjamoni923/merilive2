# VIP Membership — Flutter Layout (Antigravity reference)

Mirrors `src/pages/VIP.tsx` (lines 1038–1280).

```dart
class VipScreen extends StatefulWidget {
  @override
  State<VipScreen> createState() => _VipScreenState();
}

class _VipScreenState extends State<VipScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  int _idx = 0;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [Color(0xFF0F172A), Color(0xFF581C87), Color(0xFF0F172A)],
          ),
        ),
        child: SafeArea(child: Column(children: [
          _buildHeader(),
          _buildTabs(),
          Expanded(child: IndexedStack(index: _idx, children: const [
            VipPlansTab(),
            VipProgressTab(),
          ])),
        ])),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xE6581C87), Color(0xE6831843), Color(0xE6581C87)],
        ),
        border: Border(bottom: BorderSide(color: Colors.white12)),
      ),
      child: SizedBox(
        height: 56,
        child: Row(children: [
          IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context)),
          const Expanded(child: Text('👑 VIP Membership',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 18))),
          Container(
            margin: const EdgeInsets.only(right: 12),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.amber.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.amber.withOpacity(0.3)),
            ),
            child: Row(children: const [
              Icon(Icons.diamond, color: Colors.amber, size: 14),
              SizedBox(width: 4),
              Text('12,345', style: TextStyle(color: Colors.amber, fontSize: 13, fontWeight: FontWeight.w700)),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        _tab(0, 'VIP Plans'),
        _tab(1, 'My Progress'),
      ]),
    );
  }

  Widget _tab(int i, String label) {
    final active = _idx == i;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _idx = i),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            gradient: active ? const LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFFEC4899)]) : null,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(child: Text(label,
            style: TextStyle(color: active ? Colors.white : Colors.white70, fontWeight: FontWeight.w600))),
        ),
      ),
    );
  }
}
```

## VipPlansTab — tier cards

```dart
class VipPlansTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<VipTierModel>>(
      future: _fetchTiers(),
      builder: (ctx, snap) {
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        return ListView.separated(
          padding: const EdgeInsets.all(12),
          itemCount: snap.data!.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (_, i) => _VipTierCard(tier: snap.data![i]),
        );
      },
    );
  }

  Future<List<VipTierModel>> _fetchTiers() async {
    final res = await Supabase.instance.client
        .from('vip_tiers').select().eq('is_active', true).order('tier_level');
    return (res as List).map((e) => VipTierModel.fromJson(e)).toList();
  }
}

class _VipTierCard extends StatelessWidget {
  final VipTierModel tier;
  const _VipTierCard({required this.tier});

  static const _gradients = {
    1: [Color(0xFFCD7F32), Color(0xFF8B4513)],   // Bronze
    2: [Color(0xFFC0C0C0), Color(0xFF808080)],   // Silver
    3: [Color(0xFFFFD700), Color(0xFFDAA520)],   // Gold
    4: [Color(0xFFE5E4E2), Color(0xFFBCC6CC)],   // Platinum
    5: [Color(0xFFB9F2FF), Color(0xFF00CED1)],   // Diamond
  };

  @override
  Widget build(BuildContext context) {
    final colors = _gradients[tier.tierLevel] ?? _gradients[1]!;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Colors.white.withOpacity(0.05),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: colors),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Row(children: [
            const Icon(Icons.workspace_premium, color: Colors.white, size: 32),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tier.tierName, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
              Text('${tier.durationDays} Days',
                style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 13)),
            ])),
            Text('${tier.priceDiamonds} 💎',
              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(tier.description ?? '',
              style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 13)),
            const SizedBox(height: 12),
            ...tier.benefits.map((b) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(children: [
                const Icon(Icons.check_circle, size: 16, color: Colors.greenAccent),
                const SizedBox(width: 6),
                Text(b, style: const TextStyle(color: Colors.white, fontSize: 13)),
              ]),
            )),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  backgroundColor: const Color(0xFF8B5CF6),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: () => _subscribe(tier),
                child: const Text('Subscribe', style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ]),
        ),
      ]),
    );
  }

  Future<void> _subscribe(VipTierModel tier) async {
    // ALWAYS use RPC — never direct table update
    await Supabase.instance.client.rpc('purchase_vip_subscription', params: {
      'tier_id': tier.id,
    });
  }
}
```

## VipProgressTab — privileges grid (Choose 1 per category)

```dart
class VipProgressTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<VipPrivilegeCategoryModel>>(
      future: _fetchCategories(),
      builder: (ctx, snap) {
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: snap.data!.length,
          itemBuilder: (_, i) => _CategorySection(category: snap.data![i]),
        );
      },
    );
  }
}

class _CategorySection extends StatelessWidget {
  final VipPrivilegeCategoryModel category;
  const _CategorySection({required this.category});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(children: [
            Text(category.title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
            const Spacer(),
            Text('Choose 1', style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 12)),
          ]),
        ),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 4, crossAxisSpacing: 8, mainAxisSpacing: 8, childAspectRatio: 0.85,
          ),
          itemCount: category.items.length,
          itemBuilder: (_, i) => _PrivilegeItemTile(item: category.items[i]),
        ),
      ]),
    );
  }
}
```

## Progress bar (top of My Progress)

Use `LinearProgressIndicator` with gold gradient, shows `current_xp / next_tier_xp` from `user_vip_progress` view.
