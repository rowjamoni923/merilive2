import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminShopScreen extends StatefulWidget {
  const AdminShopScreen({super.key});

  @override
  State<AdminShopScreen> createState() => _AdminShopScreenState();
}

class _AdminShopScreenState extends State<AdminShopScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _items = [];
  String _selectedCategory = "all";
  String _searchQuery = "";

  final List<Map<String, dynamic>> _categories = [
    {'id': 'all', 'name': 'All', 'icon': LucideIcons.shoppingBag},
    {'id': 'frame', 'name': 'Frames', 'icon': LucideIcons.crown},
    {'id': 'entrance', 'name': 'Entrance', 'icon': LucideIcons.sparkles},
    {'id': 'vehicle', 'name': 'Vehicles', 'icon': LucideIcons.car},
    {'id': 'bubble', 'name': 'Bubbles', 'icon': LucideIcons.messageCircle},
    {'id': 'room_theme', 'name': 'Themes', 'icon': LucideIcons.home},
  ];

  @override
  void initState() {
    super.initState();
    _loadItems();
  }

  Future<void> _loadItems() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('shop_items').select('*').order('category').order('display_order');
      setState(() {
        _items = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading shop items: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildCategoryTabs(),
        _buildSearchBar(),
        Expanded(
          child: _isLoading 
            ? const Center(child: CircularProgressIndicator(color: Colors.indigoAccent))
            : _buildItemsGrid(),
        ),
      ],
    );
  }

  Widget _buildCategoryTabs() {
    return Container(
      height: 50,
      margin: const EdgeInsets.symmetric(vertical: 16, horizontal: 32),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _categories.length,
        itemBuilder: (context, index) {
          final cat = _categories[index];
          final bool isSelected = _selectedCategory == cat['id'];
          return GestureDetector(
            onTap: () => setState(() => _selectedCategory = cat['id']),
            child: Container(
              margin: const EdgeInsets.only(right: 12),
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                color: isSelected ? Colors.indigoAccent : Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: isSelected ? Colors.white24 : Colors.white.withOpacity(0.05)),
              ),
              child: Row(
                children: [
                  Icon(cat['icon'], color: isSelected ? Colors.white : Colors.white24, size: 14),
                  const SizedBox(width: 10),
                  Text(cat['name'], style: TextStyle(color: isSelected ? Colors.white : Colors.white24, fontWeight: FontWeight.bold, fontSize: 11)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32, vertical: 8),
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TextField(
        style: const TextStyle(color: Colors.white),
        decoration: const InputDecoration(hintText: "Search items in shop...", hintStyle: TextStyle(color: Colors.white24), border: InputBorder.none, icon: Icon(LucideIcons.search, color: Colors.white24, size: 18)),
        onChanged: (v) => setState(() => _searchQuery = v),
      ),
    );
  }

  Widget _buildItemsGrid() {
    final filtered = _items.where((i) {
      final matchesCat = _selectedCategory == 'all' || i['category'] == _selectedCategory;
      final matchesSearch = i['name'].toString().toLowerCase().contains(_searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    }).toList();

    if (filtered.isEmpty) return const Center(child: Text("No shop items found", style: TextStyle(color: Colors.white24)));

    return GridView.builder(
      padding: const EdgeInsets.all(32),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 4, crossAxisSpacing: 20, mainAxisSpacing: 20, childAspectRatio: 1.2),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final item = filtered[index];
        final bool isActive = item['is_active'] ?? false;
        final rarityColor = _getRarityColor(item['rarity'] ?? 'common');
        
        return FadeInUp(
          delay: Duration(milliseconds: 10 * index),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                Container(
                  width: 120,
                  margin: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.black.withOpacity(0.2), borderRadius: BorderRadius.circular(16)),
                  child: Center(child: Image.network(item['preview_url'] ?? '', width: 80, height: 80, errorBuilder: (_, __, ___) => const Icon(LucideIcons.shoppingBag, color: Colors.white10))),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _rarityBadge(item['rarity']?.toString().toUpperCase() ?? 'COMMON', rarityColor),
                            Switch(value: isActive, onChanged: (v) {}, activeColor: Colors.indigoAccent, materialTapTargetSize: MaterialTapTargetSize.shrinkWrap),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(item['name'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15), maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 4),
                        Text(item['description'] ?? 'No description', style: const TextStyle(color: Colors.white24, fontSize: 10), maxLines: 1, overflow: TextOverflow.ellipsis),
                        const Spacer(),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    const Icon(LucideIcons.diamond, color: Colors.blueAccent, size: 10),
                                    const SizedBox(width: 4),
                                    Text(item['price_diamonds'].toString(), style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                                  ],
                                ),
                                Text("LV ${item['min_level'] ?? 0} REQ", style: const TextStyle(color: Colors.white24, fontSize: 8, fontWeight: FontWeight.bold)),
                              ],
                            ),
                            Row(
                              children: [
                                _miniBtn(LucideIcons.edit3, Colors.white10),
                                const SizedBox(width: 6),
                                _miniBtn(LucideIcons.trash2, Colors.redAccent),
                              ],
                            ),
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
      },
    );
  }

  Widget _rarityBadge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6), border: Border.all(color: color.withOpacity(0.2))),
      child: Text(label, style: TextStyle(color: color, fontSize: 7, fontWeight: FontWeight.bold)),
    );
  }

  Widget _miniBtn(IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.1))),
      child: Icon(icon, color: color, size: 12),
    );
  }

  Color _getRarityColor(String r) {
    switch(r.toLowerCase()) {
      case 'rare': return Colors.blueAccent;
      case 'epic': return Colors.purpleAccent;
      case 'legendary': return Colors.amberAccent;
      case 'mythic': return Colors.redAccent;
      default: return Colors.white24;
    }
  }
}
