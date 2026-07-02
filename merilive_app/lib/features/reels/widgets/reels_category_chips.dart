// R2 — Category chip strip.
//
// Horizontal, sticky under the top overlay of the Reels tab. Scroll-position
// preserved via ScrollController. Selected chip uses a bright accent pill;
// unselected chips are translucent white on the dark video canvas.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/reels_models.dart';

class ReelsCategoryChips extends StatefulWidget {
  const ReelsCategoryChips({
    super.key,
    required this.categories,
    required this.selectedSlug,
    required this.onSelected,
  });

  final List<ReelCategory> categories;
  final String selectedSlug;
  final ValueChanged<String> onSelected;

  @override
  State<ReelsCategoryChips> createState() => _ReelsCategoryChipsState();
}

class _ReelsCategoryChipsState extends State<ReelsCategoryChips> {
  final ScrollController _controller = ScrollController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        controller: _controller,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        physics: const BouncingScrollPhysics(),
        itemCount: widget.categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final cat = widget.categories[i];
          final selected = cat.slug == widget.selectedSlug;
          return _Chip(
            label: cat.name,
            selected: selected,
            onTap: () {
              HapticFeedback.selectionClick();
              widget.onSelected(cat.slug);
            },
          );
        },
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.white.withOpacity(0.14),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected
                ? Colors.white
                : Colors.white.withOpacity(0.22),
            width: 1,
          ),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            color: selected ? const Color(0xFF0F172A) : Colors.white,
            letterSpacing: 0.1,
          ),
        ),
      ),
    );
  }
}
