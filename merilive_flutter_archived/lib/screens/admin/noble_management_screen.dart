import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class NobleManagementScreen extends StatefulWidget {
  const NobleManagementScreen({super.key});

  @override
  State<NobleManagementScreen> createState() => _NobleManagementScreenState();
}

class _NobleManagementScreenState extends State<NobleManagementScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _nobleCards = [];

  @override
  void initState() {
    super.initState();
    _loadNobleCards();
  }

  Future<void> _loadNobleCards() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('level_privileges')
          .select('*')
          .eq('privilege_type', 'noble_card')
          .order('unlock_level', ascending: true);
      
      setState(() {
        _nobleCards = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading noble cards: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 32),
          Expanded(child: _buildNobleGrid()),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("NOBLE & SEAT CARDS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              const Text("Manage premium seat animations and entry cards for party rooms", style: TextStyle(color: Colors.white38, fontSize: 14)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("NEW NOBLE CARD"),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildNobleGrid() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    
    return GridView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 0.9,
        crossAxisSpacing: 24,
        mainAxisSpacing: 24,
      ),
      itemCount: _nobleCards.length,
      itemBuilder: (context, index) {
        final card = _nobleCards[index];
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: _buildNobleCard(card),
        );
      },
    );
  }

  Widget _buildNobleCard(Map<String, dynamic> card) {
    final bool isActive = card['is_active'] ?? true;
    
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.01),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Opacity(
        opacity: isActive ? 1.0 : 0.5,
        child: Column(
          children: [
            Expanded(
              flex: 3,
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Colors.rose500.withOpacity(0.2), Colors.pink500.withOpacity(0.2)],
                  ),
                ),
                child: card['preview_url'] != null 
                    ? CachedNetworkImage(imageUrl: card['preview_url'], fit: BoxFit.contain)
                    : const Icon(LucideIcons.creditCard, color: Colors.roseAccent, size: 48),
              ),
            ),
            Expanded(
              flex: 2,
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(card['name'] ?? 'Noble Card', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                        Switch(value: isActive, onChanged: (v) {}, activeColor: const Color(0xFF6366F1)),
                      ],
                    ),
                    Text("Unlock Level: ${card['unlock_level']}+", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                    const Spacer(),
                    Row(
                      children: [
                        _buildSmallBtn(LucideIcons.eye, "Preview"),
                        const SizedBox(width: 8),
                        _buildSmallBtn(LucideIcons.edit, "Edit"),
                        const Spacer(),
                        IconButton(icon: const Icon(LucideIcons.trash2, color: Colors.redAccent, size: 18), onPressed: () {}),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSmallBtn(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(8)),
      child: Row(
        children: [
          Icon(icon, color: Colors.white38, size: 12),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
