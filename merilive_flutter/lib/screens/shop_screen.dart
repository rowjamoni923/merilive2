import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';

class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key});

  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  String _selectedCategory = "all";
  int _diamonds = 0;
  int _userLevel = 0;
  List<Map<String, dynamic>> _userPurchases = [];
  List<Map<String, dynamic>> _allShopItems = [];
  List<Map<String, dynamic>> _filteredItems = [];
  
  final List<Map<String, dynamic>> _categories = [
    {"id": "all", "name": "All", "icon": LucideIcons.shoppingBag},
    {"id": "frame", "name": "Frames", "icon": LucideIcons.crown},
    {"id": "portrait_frame", "name": "Portrait", "icon": LucideIcons.crown},
    {"id": "entrance", "name": "Entrance", "icon": LucideIcons.sparkles},
    {"id": "entrance_effect", "name": "Entry Effect", "icon": LucideIcons.sparkles},
    {"id": "entry_bar", "name": "Entry Bar", "icon": LucideIcons.sparkles},
    {"id": "vehicle", "name": "Vehicles", "icon": LucideIcons.car},
    {"id": "bubble", "name": "Bubbles", "icon": LucideIcons.messageCircle},
    {"id": "badge", "name": "Badges", "icon": LucideIcons.award},
    {"id": "party_background", "name": "Party BG", "icon": LucideIcons.image},
    {"id": "seat_effect", "name": "Seat Effects", "icon": LucideIcons.sofa},
    {"id": "gift_effect", "name": "Gift Effects", "icon": LucideIcons.gift},
    {"id": "privilege_gift", "name": "VIP Gift", "icon": LucideIcons.gift},
    {"id": "privilege_sticker", "name": "Stickers", "icon": LucideIcons.smile},
    {"id": "profile_decoration", "name": "Profile", "icon": LucideIcons.wand2},
    {"id": "room_theme", "name": "Room Theme", "icon": LucideIcons.home},
    {"id": "emoji", "name": "Emojis", "icon": LucideIcons.smile},
    {"id": "lucky_gift", "name": "Lucky Gift", "icon": LucideIcons.star},
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      if (mounted && profile != null) {
        _diamonds = profile['diamond_balance'] ?? profile['diamonds'] ?? 0;
        _userLevel = profile['user_level'] ?? 0;
        _allShopItems = await _api.getShopItems();
        _userPurchases = await _api.getUserPurchases();
        _filterItems();
      }
    } catch (e) {
      debugPrint("Error loading shop data: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _filterItems() {
    if (_selectedCategory == "all") {
      _filteredItems = _allShopItems;
    } else {
      _filteredItems = _allShopItems.where((i) => i['category'] == _selectedCategory).toList();
    }
  }

  bool _isOwned(String itemId) {
    return _userPurchases.any((p) => p['item_id'] == itemId);
  }

  void _showItemDetail(Map<String, dynamic> item) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => _buildDetailSheet(item),
    );
  }

  Future<void> _handlePurchase(Map<String, dynamic> item) async {
    if (_diamonds < (item['price_diamonds'] ?? 0)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Insufficient Diamonds!")));
      return;
    }
    
    // Show confirmation
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1F1235),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text("Confirm Purchase", style: GoogleFonts.outfit(color: Colors.white)),
        content: Text("Buy ${item['name']} for ${item['price_diamonds']} diamonds?", style: const TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Cancel")),
          ElevatedButton(onPressed: () => Navigator.pop(context, true), style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF8B5CF6)), child: const Text("Buy")),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _isLoading = true);
    final res = await _api.purchaseShopItem(item);
    if (res['success']) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Purchased & Equipped successfully!")));
      _loadData();
      Navigator.pop(context); // Close detail sheet
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['error'] ?? "Purchase failed")));
      setState(() => _isLoading = false);
    }
  }

  bool _isEntryCategory(String cat) {
    return ['entrance', 'entrance_effect', 'entry_bar', 'vehicle'].contains(cat);
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(backgroundColor: Color(0xFF0F1015), body: Center(child: CircularProgressIndicator(color: Colors.purple)));

    return Scaffold(
      backgroundColor: const Color(0xFF0F051A),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF1A0533), Color(0xFF0D0118), Color(0xFF0A0014)],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              _buildHeader(),
              _buildCategoryTabs(),
              Expanded(
                child: _filteredItems.isEmpty 
                  ? _buildEmptyState()
                  : GridView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: _isEntryCategory(_selectedCategory) ? 1 : 2,
                        mainAxisSpacing: 16,
                        crossAxisSpacing: 16,
                        childAspectRatio: _isEntryCategory(_selectedCategory) ? 1.6 : 0.75,
                      ),
                      itemCount: _filteredItems.length,
                      itemBuilder: (context, index) => FadeInUp(
                        duration: Duration(milliseconds: 300 + (index % 10) * 50),
                        child: _buildItemCard(_filteredItems[index]),
                      ),
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(LucideIcons.packageOpen, color: Colors.white10, size: 64),
          const SizedBox(height: 16),
          Text("No items in this category", style: GoogleFonts.outfit(color: Colors.white24)),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [const Color(0xFF581C87).withOpacity(0.9), const Color(0xFF310A64).withOpacity(0.95)]),
        border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.1))),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft, color: Colors.white, size: 20), 
            onPressed: () => Navigator.pop(context),
            visualDensity: VisualDensity.compact,
          ),
          const SizedBox(width: 8),
          Text("My Store", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [const Color(0xFFFBBF24).withOpacity(0.15), const Color(0xFFF59E0B).withOpacity(0.1)]),
              borderRadius: BorderRadius.circular(20), 
              border: Border.all(color: const Color(0xFFFBBF24).withOpacity(0.3))
            ),
            child: Row(
              children: [
                const Icon(LucideIcons.gem, color: Color(0xFFF59E0B), size: 14),
                const SizedBox(width: 6),
                Text(NumberFormat('#,###').format(_diamonds), style: GoogleFonts.spaceMono(color: const Color(0xFFF59E0B), fontSize: 13, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryTabs() {
    return Container(
      height: 48,
      margin: const EdgeInsets.only(top: 12, bottom: 4),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: _categories.length,
        itemBuilder: (context, index) {
          final cat = _categories[index];
          final bool isSelected = _selectedCategory == cat['id'];
          return GestureDetector(
            onTap: () {
              setState(() => _selectedCategory = cat['id']);
              _filterItems();
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.only(right: 10),
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                gradient: isSelected ? const LinearGradient(colors: [Color(0xFFD946EF), Color(0xFF7C3AED)]) : null,
                color: isSelected ? null : Colors.white.withOpacity(0.05), 
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: isSelected ? Colors.white24 : Colors.white.withOpacity(0.05)),
                boxShadow: isSelected ? [BoxShadow(color: const Color(0xFF8B5CF6).withOpacity(0.3), blurRadius: 10, offset: const Offset(0, 4))] : null,
              ),
              child: Row(
                children: [
                  Icon(cat['icon'], color: isSelected ? Colors.white : Colors.white38, size: 14),
                  const SizedBox(width: 8),
                  Text(cat['name'], style: GoogleFonts.outfit(color: isSelected ? Colors.white : Colors.white38, fontSize: 13, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildItemCard(Map<String, dynamic> item) {
    final bool owned = _isOwned(item['id']);
    final bool isEquipped = _userPurchases.any((p) => p['item_id'] == item['id'] && p['is_equipped'] == true);
    final bool isFullWidth = _isEntryCategory(item['category'] ?? '');

    return GestureDetector(
      onTap: () => _showItemDetail(item),
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [const Color(0xFF581C87).withOpacity(0.5), const Color(0xFF1E0A3C).withOpacity(0.9)],
          ),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withOpacity(0.1), width: 1),
          boxShadow: [BoxShadow(color: const Color(0xFF581C87).withOpacity(0.2), blurRadius: 20, offset: const Offset(0, 8))],
        ),
        child: Column(
          children: [
            Expanded(
              child: Stack(
                children: [
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(16), 
                      child: Image.network(
                        _api.resolveAssetUrl(item['image_url'] ?? item['preview_url'] ?? ''), 
                        fit: BoxFit.contain, 
                        errorBuilder: (c, e, s) => Icon(LucideIcons.package, color: Colors.white.withOpacity(0.05), size: 48)
                      )
                    )
                  ),
                  if (item['is_featured'] == true)
                    Positioned(
                      top: 10, right: 10,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(color: Colors.amber, shape: BoxShape.circle),
                        child: const Icon(LucideIcons.zap, color: Colors.white, size: 10),
                      ),
                    ),
                  if (owned) 
                    Positioned(
                      top: 10, left: 10,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(color: isEquipped ? const Color(0xFF8B5CF6) : const Color(0xFF10B981), shape: BoxShape.circle),
                        child: Icon(LucideIcons.check, color: Colors.white, size: 10)
                      )
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                children: [
                  Text(item['name'] ?? 'Item', style: GoogleFonts.outfit(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(LucideIcons.gem, color: Color(0xFFF59E0B), size: 12),
                      const SizedBox(width: 4),
                      Text(NumberFormat('#,###').format(item['price_diamonds'] ?? 0), style: GoogleFonts.spaceMono(color: const Color(0xFFF59E0B), fontSize: 11, fontWeight: FontWeight.bold)),
                      if (item['duration_days'] != null) Text("/${item['duration_days']}d", style: const TextStyle(color: Colors.white38, fontSize: 9)),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    height: 34,
                    decoration: BoxDecoration(
                      gradient: !owned ? const LinearGradient(colors: [Color(0xFFD946EF), Color(0xFF7C3AED)]) : null,
                      color: owned ? const Color(0xFF10B981).withOpacity(0.1) : null,
                      borderRadius: BorderRadius.circular(17),
                      border: Border.all(color: owned ? const Color(0xFF10B981).withOpacity(0.5) : Colors.transparent)
                    ),
                    child: Center(child: Text(owned ? (isEquipped ? "Equipped" : "Equip") : "Purchase", style: GoogleFonts.outfit(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold))),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailSheet(Map<String, dynamic> item) {
    final bool owned = _isOwned(item['id']);
    final bool meetsLevel = _userLevel >= (item['min_level'] ?? 0);

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF2D1054), Color(0xFF0A0418)]),
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 24),
          Text(item['name'] ?? '', style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          Container(
            height: 200,
            width: double.infinity,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.03),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white.withOpacity(0.05))
            ),
            child: Center(
              child: Image.network(
                _api.resolveAssetUrl(item['animation_file_url'] ?? item['image_url'] ?? item['preview_url'] ?? ''),
                fit: BoxFit.contain,
                errorBuilder: (c, e, s) => const Icon(LucideIcons.package, color: Colors.white10, size: 80),
              )
            ),
          ),
          if (item['description'] != null) ...[
            const SizedBox(height: 16),
            Text(item['description'], style: const TextStyle(color: Colors.white60, fontSize: 14), textAlign: TextAlign.center),
          ],
          const SizedBox(height: 32),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20)),
                  child: Column(
                    children: [
                      const Text("Price", style: TextStyle(color: Colors.white38, fontSize: 12)),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(LucideIcons.gem, color: Color(0xFFF59E0B), size: 16),
                          const SizedBox(width: 6),
                          Text(NumberFormat('#,###').format(item['price_diamonds'] ?? 0), style: GoogleFonts.spaceMono(color: const Color(0xFFF59E0B), fontSize: 18, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20)),
                  child: Column(
                    children: [
                      Text(item['duration_days'] != null ? "Duration" : "Min Level", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                      const SizedBox(height: 4),
                      Text(item['duration_days'] != null ? "${item['duration_days']} Days" : "Lv.${item['min_level'] ?? 0}", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: owned ? null : (meetsLevel ? () => _handlePurchase(item) : null),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF8B5CF6),
                disabledBackgroundColor: Colors.white10,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(27)),
                elevation: 0,
              ),
              child: Text(
                owned ? "Already Owned" : (meetsLevel ? "Purchase Now" : "Level ${item['min_level']} Required"),
                style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
