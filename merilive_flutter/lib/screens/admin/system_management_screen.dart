import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../services/api_service.dart';
import '../../widgets/network_asset_loader.dart';

class AdminSystemManagementScreen extends StatefulWidget {
  const AdminSystemManagementScreen({super.key});

  @override
  State<AdminSystemManagementScreen> createState() => _AdminSystemManagementScreenState();
}

class _AdminSystemManagementScreenState extends State<AdminSystemManagementScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  
  List<Map<String, dynamic>> _banners = [];
  List<Map<String, dynamic>> _gifts = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final banners = await _api.getAdminSystemBanners();
    final gifts = await _api.getAdminGifts();
    setState(() {
      _banners = banners;
      _gifts = gifts;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text("System Management", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.indigoAccent,
          tabs: const [
            Tab(text: "Banners", icon: Icon(LucideIcons.image, size: 18)),
            Tab(text: "Gifts", icon: Icon(LucideIcons.gift, size: 18)),
          ],
        ),
      ),
      body: _isLoading 
        ? const Center(child: CircularProgressIndicator(color: Colors.indigoAccent))
        : TabBarView(
            controller: _tabController,
            children: [
              _buildBannersList(),
              _buildGiftsList(),
            ],
          ),
    );
  }

  Widget _buildBannersList() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _banners.length,
      itemBuilder: (context, index) {
        final b = _banners[index];
        final bool isActive = b['is_active'] ?? false;
        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
          child: Column(
            children: [
              ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                child: NetworkAssetLoader(url: b['image_url'], bucket: 'banners', height: 120, width: double.infinity, fit: BoxFit.cover),
              ),
              ListTile(
                title: Text(b['title'] ?? 'Banner', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                subtitle: Text("Position: ${b['position']}", style: const TextStyle(color: Colors.white38, fontSize: 11)),
                trailing: Switch(
                  value: isActive,
                  onChanged: (val) async {
                    await _api.updateAdminBanner(b['id'], {'is_active': val});
                    _loadData();
                  },
                  activeColor: Colors.indigoAccent,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildGiftsList() {
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, childAspectRatio: 0.8, mainAxisSpacing: 12, crossAxisSpacing: 12),
      itemCount: _gifts.length,
      itemBuilder: (context, index) {
        final g = _gifts[index];
        return Container(
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              NetworkAssetLoader(url: g['image_url'], bucket: 'gifts', width: 50, height: 50),
              const SizedBox(height: 8),
              Text(g['name'] ?? 'Gift', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
              Text("${g['price_diamonds']} 💎", style: const TextStyle(color: Colors.amberAccent, fontSize: 10)),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: () => _showEditGift(g),
                child: const Icon(LucideIcons.edit3, color: Colors.indigoAccent, size: 14),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showEditGift(Map<String, dynamic> gift) {
    final TextEditingController priceController = TextEditingController(text: gift['price_diamonds'].toString());
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text("Edit Prize: ${gift['name']}", style: const TextStyle(color: Colors.white, fontSize: 16)),
        content: TextField(
          controller: priceController,
          keyboardType: TextInputType.number,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(hintText: "Enter Bean Price"),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("CANCEL")),
          TextButton(
            onPressed: () async {
              await _api.updateAdminGift(gift['id'], {'price_diamonds': int.parse(priceController.text)});
              Navigator.pop(context);
              _loadData();
            },
            child: const Text("UPDATE", style: TextStyle(color: Colors.indigoAccent)),
          ),
        ],
      ),
    );
  }
}


