import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';
import '../services/gifting_service.dart';
import 'package:cached_network_image/cached_network_image.dart';

class PremiumGiftPanel extends StatefulWidget {
  final int userCoins;
  final Function(Gift) onGiftSelected;

  const PremiumGiftPanel({
    super.key,
    required this.userCoins,
    required this.onGiftSelected,
  });

  @override
  State<PremiumGiftPanel> createState() => _PremiumGiftPanelState();
}

class _PremiumGiftPanelState extends State<PremiumGiftPanel> {
  final GiftingService _giftingService = GiftingService();
  Gift? _selectedGift;

  @override
  void initState() {
    super.initState();
    _giftingService.fetchGifts().then((_) => setState(() {}));
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 450,
      decoration: BoxDecoration(
        color: const Color(0xFF1E1B4B),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text("Send Gift", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                Text("${widget.userCoins} 💎", style: const TextStyle(color: Colors.amber)),
              ],
            ),
          ),
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _giftingService.availableGifts.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 4, mainAxisSpacing: 10, crossAxisSpacing: 10),
              itemBuilder: (context, index) {
                final gift = _giftingService.availableGifts[index];
                final isSelected = _selectedGift?.id == gift.id;
                return GestureDetector(
                  onTap: () => setState(() => _selectedGift = gift),
                  child: Container(
                    decoration: BoxDecoration(
                      color: isSelected ? Colors.blueAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(16),
                      border: isSelected ? Border.all(color: Colors.blueAccent) : null,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (gift.iconUrl != null) 
                          CachedNetworkImage(imageUrl: gift.iconUrl!, width: 40, height: 40)
                        else
                          const Icon(Icons.redeem, color: Colors.white24),
                        const SizedBox(height: 4),
                        Text("${gift.coinValue}", style: const TextStyle(color: Colors.amber, fontSize: 10)),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: ElevatedButton(
              onPressed: _selectedGift == null ? null : () {
                widget.onGiftSelected(_selectedGift!);
                Navigator.pop(context);
              },
              child: const Text("SEND"),
            ),
          ),
        ],
      ),
    );
  }
}


