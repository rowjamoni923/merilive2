import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminChatBubblesScreen extends StatefulWidget {
  const AdminChatBubblesScreen({super.key});

  @override
  State<AdminChatBubblesScreen> createState() => _AdminChatBubblesScreenState();
}

class _AdminChatBubblesScreenState extends State<AdminChatBubblesScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _bubbles = [];
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _loadBubbles();
  }

  Future<void> _loadBubbles() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('level_privileges').select('*').eq('privilege_type', 'chat_bubble').order('unlock_level', ascending: true);
      setState(() {
        _bubbles = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading bubbles: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildHeader(),
        Expanded(
          child: _isLoading 
            ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
            : _buildBubblesGrid(),
        ),
      ],
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
              child: TextField(
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(hintText: "Search chat bubbles...", hintStyle: TextStyle(color: Colors.white24), border: InputBorder.none, icon: Icon(LucideIcons.search, color: Colors.white24, size: 18)),
                onChanged: (v) => setState(() => _searchQuery = v),
              ),
            ),
          ),
          const SizedBox(width: 16),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 14),
            label: const Text("NEW BUBBLE", style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.cyanAccent.withOpacity(0.1), foregroundColor: Colors.cyanAccent, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
          ),
        ],
      ),
    );
  }

  Widget _buildBubblesGrid() {
    final filtered = _bubbles.where((b) => b['name'].toString().toLowerCase().contains(_searchQuery.toLowerCase())).toList();
    
    if (filtered.isEmpty) return const Center(child: Text("No chat bubbles found", style: TextStyle(color: Colors.white24)));

    return GridView.builder(
      padding: const EdgeInsets.all(32),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, crossAxisSpacing: 20, mainAxisSpacing: 20, childAspectRatio: 0.8),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final b = filtered[index];
        final bool isActive = b['is_active'] ?? false;
        
        return FadeInUp(
          delay: Duration(milliseconds: 10 * index),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            child: Column(
              children: [
                Expanded(
                  child: Container(
                    margin: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: Colors.black.withOpacity(0.2), borderRadius: BorderRadius.circular(20), image: b['preview_url'] != null ? DecorationImage(image: NetworkImage(b['preview_url']), fit: BoxFit.contain) : null),
                    child: b['preview_url'] == null ? const Center(child: Icon(LucideIcons.messageSquare, color: Colors.white10, size: 32)) : null,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text(b['name'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: Colors.amberAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(6)), child: Text("LV ${b['unlock_level']}", style: const TextStyle(color: Colors.amberAccent, fontSize: 8, fontWeight: FontWeight.bold))),
                          Switch(value: isActive, onChanged: (v) {}, activeColor: Colors.cyanAccent, materialTapTargetSize: MaterialTapTargetSize.shrinkWrap),
                        ],
                      ),
                      const Divider(color: Colors.white05, height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _actionBtn(LucideIcons.edit2, Colors.white24),
                          const SizedBox(width: 12),
                          _actionBtn(LucideIcons.trash2, Colors.redAccent),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _actionBtn(IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withOpacity(0.1))),
      child: Icon(icon, color: color, size: 12),
    );
  }
}
