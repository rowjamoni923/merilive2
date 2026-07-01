import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminAllowedLinksScreen extends StatefulWidget {
  const AdminAllowedLinksScreen({super.key});

  @override
  State<AdminAllowedLinksScreen> createState() => _AdminAllowedLinksScreenState();
}

class _AdminAllowedLinksScreenState extends State<AdminAllowedLinksScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _links = [];

  final Map<String, dynamic> _categoryConfig = {
    'internal': {'label': 'Internal', 'icon': LucideIcons.globe, 'color': Colors.blueAccent},
    'payment': {'label': 'Payment', 'icon': LucideIcons.creditCard, 'color': Colors.greenAccent},
    'store': {'label': 'Store', 'icon': LucideIcons.shoppingBag, 'color': Colors.purpleAccent},
    'social': {'label': 'Social', 'icon': LucideIcons.externalLink, 'color': Colors.pinkAccent},
    'general': {'label': 'General', 'icon': LucideIcons.link2, 'color': Colors.grey},
  };

  @override
  void initState() {
    super.initState();
    _loadLinks();
  }

  Future<void> _loadLinks() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('allowed_external_links').select('*').order('category', ascending: true);
      setState(() {
        _links = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading links: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildStatsBar(),
        _buildActionHeader(),
        Expanded(
          child: _isLoading 
            ? const Center(child: CircularProgressIndicator(color: Colors.emeraldAccent))
            : _buildLinksList(),
        ),
      ],
    );
  }

  Widget _buildStatsBar() {
    final active = _links.where((l) => l['is_active'] == true).length;
    return Container(
      padding: const EdgeInsets.all(32),
      child: Row(
        children: [
          _statCard("ACTIVE LINKS", active.toString(), Colors.emeraldAccent),
          const SizedBox(width: 16),
          _statCard("BLOCKED", (_links.length - active).toString(), Colors.redAccent),
        ],
      ),
    );
  }

  Widget _statCard(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: color.withOpacity(0.1))),
        child: Column(
          children: [
            Text(value, style: GoogleFonts.outfit(color: color, fontSize: 24, fontWeight: FontWeight.bold)),
            Text(label, style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _buildActionHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Text("Whitelisted Domains", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 14),
            label: const Text("ADD LINK", style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.emeraldAccent.withOpacity(0.1), foregroundColor: Colors.emeraldAccent, padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
          ),
        ],
      ),
    );
  }

  Widget _buildLinksList() {
    if (_links.isEmpty) return const Center(child: Text("No allowed links configured", style: TextStyle(color: Colors.white24)));

    return ListView.builder(
      padding: const EdgeInsets.all(32),
      itemCount: _links.length,
      itemBuilder: (context, index) {
        final link = _links[index];
        final cat = _categoryConfig[link['category']] ?? _categoryConfig['general'];
        final bool isActive = link['is_active'] ?? false;
        
        return FadeInUp(
          delay: Duration(milliseconds: 15 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: isActive ? Colors.emeraldAccent.withOpacity(0.1) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: cat['color'].withOpacity(0.1), shape: BoxShape.circle), child: Icon(cat['icon'], color: cat['color'], size: 16)),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(link['label'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                          const SizedBox(width: 8),
                          _miniBadge(link['link_type'].toString().toUpperCase(), Colors.white10),
                        ],
                      ),
                      Text(link['url_pattern'], style: GoogleFonts.robotoMono(color: Colors.white24, fontSize: 10)),
                    ],
                  ),
                ),
                Switch(value: isActive, onChanged: (v) {}, activeColor: Colors.emeraldAccent),
                const SizedBox(width: 12),
                _iconBtn(LucideIcons.trash2, Colors.redAccent, () {}),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _miniBadge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
      child: Text(label, style: const TextStyle(color: Colors.white54, fontSize: 7, fontWeight: FontWeight.bold)),
    );
  }

  Widget _iconBtn(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: color, size: 14),
      ),
    );
  }
}
