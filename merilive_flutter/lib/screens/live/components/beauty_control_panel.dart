import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../services/beauty_service.dart';
import '../../../theme/app_theme.dart';
import 'dart:ui';

class BeautyControlPanel extends StatelessWidget {
  const BeautyControlPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final beautyService = context.watch<BeautyService>();
    final settings = beautyService.beautySettings;

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.8),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text("Beauty Enhancements", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                Switch(
                  value: beautyService.beautyEnabled,
                  activeColor: AppTheme.primaryPink,
                  onChanged: (val) => beautyService.setBeautyEnabled(val),
                ),
              ],
            ),
            const SizedBox(height: 20),
            _buildSlider(context, "Skin Smoothing", "smoothness", settings['smoothness'] ?? 0.0),
            _buildSlider(context, "Skin Whitening", "whitening", settings['whitening'] ?? 0.0),
            _buildSlider(context, "Face Slimming", "faceSlim", settings['faceSlim'] ?? 0.0),
            _buildSlider(context, "Eye Enlarging", "eyeEnlarge", settings['eyeEnlarge'] ?? 0.0),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildSlider(BuildContext context, String label, String param, double value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
            Text("${(value * 100).toInt()}%", style: const TextStyle(color: AppTheme.primaryPink, fontSize: 12, fontWeight: FontWeight.bold)),
          ],
        ),
        Slider(
          value: value,
          min: 0.0,
          max: 1.0,
          activeColor: AppTheme.primaryPink,
          inactiveColor: Colors.white12,
          onChanged: (val) {
            context.read<BeautyService>().setBeautyParam(param, val);
          },
        ),
      ],
    );
  }
}
