import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../services/beauty_service.dart';
import '../../../theme/app_theme.dart';
import 'dart:ui';

class StickerSelectorPanel extends StatelessWidget {
  const StickerSelectorPanel({super.key});

  @override
  Widget build(BuildContext context) {
    // Mock sticker data - in production these would come from an API sync
    final List<Map<String, String>> stickers = [
      {'name': 'None', 'icon': '🚫', 'path': ''},
      {'name': 'Cat Ears', 'icon': '🐱', 'path': 'assets/effects/cat_ears.deepar'},
      {'name': 'Cute Dog', 'icon': '🐶', 'path': 'assets/effects/dog.deepar'},
      {'name': 'Neon Glasses', 'icon': '👓', 'path': 'assets/effects/neon_glasses.deepar'},
      {'name': 'Flower Crown', 'icon': '🌸', 'path': 'assets/effects/flower_crown.deepar'},
      {'name': 'Fire Mask', 'icon': '🔥', 'path': 'assets/effects/fire.deepar'},
      {'name': 'Angel Wings', 'icon': '👼', 'path': 'assets/effects/angel.deepar'},
    ];

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
      child: Container(
        height: 300,
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.8),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 24, vertical: 10),
              child: Row(
                children: [
                  Icon(Icons.auto_awesome, color: Colors.amber, size: 20),
                  SizedBox(width: 10),
                  Text("AI AR Stickers", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                itemCount: stickers.length,
                itemBuilder: (context, index) {
                  final sticker = stickers[index];
                  return GestureDetector(
                    onTap: () {
                      context.read<BeautyService>().applySticker(sticker['path']!);
                      Navigator.pop(context);
                    },
                    child: Container(
                      width: 80,
                      margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.05),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white10),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(sticker['icon']!, style: const TextStyle(fontSize: 32)),
                          const SizedBox(height: 8),
                          Text(sticker['name']!, style: const TextStyle(color: Colors.white70, fontSize: 10)),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
