import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminAvatarFramesScreen extends StatefulWidget {
  const AdminAvatarFramesScreen({super.key});

  @override
  State<AdminAvatarFramesScreen> createState() => _AdminAvatarFramesScreenState();
}

class _AdminAvatarFramesScreenState extends State<AdminAvatarFramesScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _frames = [];
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _loadFrames();
  }

  Future<void> _loadFrames() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('avatar_frames').select('*').order('min_level', ascending: true);
      setState(() {
        _frames = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading frames: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _toggleStatus(String id, bool current) async {
    try {
      await _api.getSupabase().from('avatar_frames').update({'is_active': !current}).eq('id', id);
      _loadFrames();
    } catch (e) {
      debugPrint("Error toggling frame status: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildFilterBar(),
        Expanded(
          child: _isLoading 
            ? const Center(child: CircularProgressIndicator(color: Colors.blueAccent))
            : _buildFramesGrid(),
        ),
      ],
    );
  }

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
              child: TextField(
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(hintText: "Search frames...", hintStyle: TextStyle(color: Colors.white24), border: InputBorder.none, icon: Icon(LucideIcons.search, color: Colors.white24, size: 18)),
                onChanged: (v) => setState(() => _searchQuery = v),
              ),
            ),
          ),
          const SizedBox(width: 16),
          _quickAction(LucideIcons.plus, "ADD FRAME", Colors.blueAccent, () {}),
        ],
      ),
    );
  }

  Widget _quickAction(IconData icon, String label, Color color, VoidCallback onTap) {
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 14),
      label: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
      style: ElevatedButton.styleFrom(backgroundColor: color.withOpacity(0.1), foregroundColor: color, padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
    );
  }

  Widget _buildFramesGrid() {
    final filtered = _frames.where((f) => f['name'].toString().toLowerCase().contains(_searchQuery.toLowerCase())).toList();
    
    if (filtered.isEmpty) return const Center(child: Text("No avatar frames found", style: TextStyle(color: Colors.white24)));

    return GridView.builder(
      padding: const EdgeInsets.all(32),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, crossAxisSpacing: 20, mainAxisSpacing: 20, childAspectRatio: 0.75),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final f = filtered[index];
        final bool isActive = f['is_active'] ?? false;
        
        return FadeInUp(
          delay: Duration(milliseconds: 10 * index),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isActive ? Colors.blueAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
            ),
            child: Column(
              children: [
                Expanded(
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      CircleAvatar(backgroundImage: const NetworkImage('https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200'), radius: 35, backgroundColor: Colors.white.withOpacity(0.05)),
                      Image.network(f['frame_url'] ?? '', width: 100, height: 100, errorBuilder: (_, __, ___) => const SizedBox()),
                      Positioned(bottom: 8, left: 12, child: Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: Colors.amberAccent, borderRadius: BorderRadius.circular(4)), child: Text("Lv${f['min_level']}", style: const TextStyle(color: Colors.black, fontSize: 8, fontWeight: FontWeight.bold)))),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text(f['name'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: Colors.purpleAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(4)), child: Text(f['frame_type'].toString().toUpperCase(), style: const TextStyle(color: Colors.purpleAccent, fontSize: 7, fontWeight: FontWeight.bold))),
                          Switch(value: isActive, onChanged: (v) => _toggleStatus(f['id'], isActive), activeColor: Colors.blueAccent, materialTapTargetSize: MaterialTapTargetSize.shrinkWrap),
                        ],
                      ),
                      const Divider(color: Colors.white05, height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _iconBtn(LucideIcons.edit2, Colors.white24, () {}),
                          const SizedBox(width: 8),
                          _iconBtn(LucideIcons.trash2, Colors.redAccent, () {}),
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

  Widget _iconBtn(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.2))),
        child: Icon(icon, color: color, size: 12),
      ),
    );
  }
}
