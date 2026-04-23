import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../theme/app_theme.dart';
import '../../../services/gift_service.dart';
import '../../../services/wallet_service.dart';
import 'dart:ui';

class PremiumGiftPanel extends StatefulWidget {
  final Function(GiftData gift, int count) onSend;

  const PremiumGiftPanel({super.key, required this.onSend});

  @override
  State<PremiumGiftPanel> createState() => _PremiumGiftPanelState();
}

class _PremiumGiftPanelState extends State<PremiumGiftPanel> with SingleTickerProviderStateMixin {
  String _activeCategory = 'all';
  GiftData? _selectedGift;
  int _count = 1;

  @override
  void initState() {
    super.initState();
    // Load gifts if not loaded
    Future.microtask(() => context.read<GiftService>().fetchGifts());
  }

  @override
  Widget build(BuildContext context) {
    final giftService = context.watch<GiftService>();
    final wallet = context.watch<WalletService>();
    final categories = giftService.getCategories();
    final gifts = giftService.getGiftsByCategory(_activeCategory);

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
      child: Container(
        height: 520,
        decoration: BoxDecoration(
          color: const Color(0xFF0F0F18).withOpacity(0.95),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
          border: Border.all(color: Colors.white10),
          boxShadow: [
            BoxShadow(color: AppTheme.primaryPink.withOpacity(0.1), blurRadius: 40, spreadRadius: -10),
          ],
        ),
        child: Column(
          children: [
            // Handle & Header
            _buildHeader(wallet.balance),
            
            // Dynamic Categories
            _buildCategoryTabs(categories),

            // Gift Grid
            Expanded(
              child: giftService.isLoading 
                ? const Center(child: CircularProgressIndicator(color: AppTheme.primaryPink))
                : _buildGiftGrid(gifts),
            ),

            // Action Section (Visible when gift selected)
            if (_selectedGift != null) _buildActionSection(wallet.balance),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(double balance) {
    return Column(
      children: [
        Container(
          margin: const EdgeInsets.only(top: 10, bottom: 5),
          width: 40, height: 4,
          decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("Send Gift", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  Text("Choose a premium gift", style: TextStyle(color: Colors.white38, fontSize: 10)),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
                child: Row(
                  children: [
                    const Icon(Icons.diamond, color: Colors.cyanAccent, size: 16),
                    const SizedBox(width: 6),
                    Text("${balance.toInt()}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                    const SizedBox(width: 5),
                    const Icon(Icons.add_circle, color: AppTheme.primaryPink, size: 18),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCategoryTabs(List<String> categories) {
    return Container(
      height: 45,
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 15),
        itemCount: categories.length,
        itemBuilder: (context, index) {
          final cat = categories[index];
          final isSelected = _activeCategory == cat;
          return GestureDetector(
            onTap: () => setState(() => _activeCategory = cat),
            child: Container(
              margin: const EdgeInsets.only(right: 10),
              padding: const EdgeInsets.symmetric(horizontal: 15),
              decoration: BoxDecoration(
                gradient: isSelected ? AppTheme.primaryGradient : null,
                color: isSelected ? null : Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(15),
                border: Border.all(color: isSelected ? Colors.transparent : Colors.white10),
              ),
              child: Center(
                child: Text(
                  cat.toUpperCase(),
                  style: TextStyle(color: isSelected ? Colors.white : Colors.white54, fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildGiftGrid(List<GiftData> gifts) {
    if (gifts.isEmpty) {
      return const Center(child: Text("No gifts available", style: TextStyle(color: Colors.white38)));
    }
    return GridView.builder(
      padding: const EdgeInsets.all(15),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.8,
      ),
      itemCount: gifts.length,
      itemBuilder: (context, index) {
        final gift = gifts[index];
        final isSelected = _selectedGift?.id == gift.id;
        return GestureDetector(
          onTap: () => setState(() => _selectedGift = gift),
          child: Container(
            decoration: BoxDecoration(
              color: isSelected ? AppTheme.primaryPink.withOpacity(0.1) : Colors.white.withOpacity(0.03),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: isSelected ? AppTheme.primaryPink : Colors.white10),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (gift.iconUrl != null)
                  Image.network(gift.iconUrl!, width: 45, height: 45, fit: BoxFit.contain)
                else
                  const Icon(Icons.card_giftcard, color: Colors.white24, size: 30),
                const SizedBox(height: 5),
                Text(gift.name, style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w500), textAlign: TextAlign.center, maxLines: 1),
                const SizedBox(height: 2),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.diamond, color: Colors.cyanAccent, size: 9),
                    const SizedBox(width: 2),
                    Text("${gift.coins}", style: const TextStyle(color: Colors.white60, fontSize: 9, fontWeight: FontWeight.bold)),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildActionSection(double balance) {
    final total = (_selectedGift?.coins ?? 0) * _count;
    final hasBalance = balance >= total;

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 15, 20, 25),
      decoration: const BoxDecoration(
        color: Colors.black26,
        border: Border(top: BorderSide(color: Colors.white10)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              // Quantity Selector
              Container(
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(15)),
                child: Row(
                  children: [
                    IconButton(icon: const Icon(Icons.remove, color: Colors.white54, size: 18), onPressed: () => setState(() => _count = _count > 1 ? _count - 1 : 1)),
                    Text("$_count", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    IconButton(icon: const Icon(Icons.add, color: Colors.white54, size: 18), onPressed: () => setState(() => _count++)),
                  ],
                ),
              ),
              const Spacer(),
              // Preset buttons
              _buildPresetBtn(10),
              const SizedBox(width: 8),
              _buildPresetBtn(99),
            ],
          ),
          const SizedBox(height: 15),
          Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("Total Cost", style: TextStyle(color: Colors.white38, fontSize: 10)),
                  Row(
                    children: [
                      const Icon(Icons.diamond, color: Colors.cyanAccent, size: 14),
                      const SizedBox(width: 4),
                      Text("$total", style: TextStyle(color: hasBalance ? Colors.white : Colors.redAccent, fontSize: 18, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ],
              ),
              const Spacer(),
              GestureDetector(
                onTap: hasBalance ? () => widget.onSend(_selectedGift!, _count) : null,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 12),
                  decoration: BoxDecoration(
                    gradient: hasBalance ? AppTheme.primaryGradient : null,
                    color: hasBalance ? null : Colors.white10,
                    borderRadius: BorderRadius.circular(30),
                    boxShadow: hasBalance ? [BoxShadow(color: AppTheme.primaryPink.withOpacity(0.3), blurRadius: 10, offset: const Offset(0, 4))] : null,
                  ),
                  child: Text("SEND", style: TextStyle(color: hasBalance ? Colors.white : Colors.white24, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPresetBtn(int n) {
    final isSelected = _count == n;
    return GestureDetector(
      onTap: () => setState(() => _count = n),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryPink : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text("x$n", style: TextStyle(color: isSelected ? Colors.white : Colors.white54, fontSize: 12, fontWeight: FontWeight.bold)),
      ),
    );
  }
}
