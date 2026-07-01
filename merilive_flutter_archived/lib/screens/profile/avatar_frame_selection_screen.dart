import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../services/api_service.dart';
import '../../services/dynamic_assets_service.dart';
import '../../widgets/avatar_with_frame.dart';
import '../../utils/design_system.dart';

class AvatarFrameSelectionScreen extends StatefulWidget {
  const AvatarFrameSelectionScreen({super.key});

  @override
  State<AvatarFrameSelectionScreen> createState() => _AvatarFrameSelectionScreenState();
}

class _AvatarFrameSelectionScreenState extends State<AvatarFrameSelectionScreen> {
  final _supabase = Supabase.instance.client;
  final ApiService _api = ApiService();
  
  List<Map<String, dynamic>> _frames = [];
  bool _isLoading = true;
  String? _selectedFrameId;
  String? _equippedFrameId;
  Map<String, dynamic>? _myProfile;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      _myProfile = await _api.getMyProfile();
      _equippedFrameId = _myProfile?['equipped_frame_id'];
      _selectedFrameId = _equippedFrameId;

      final res = await _supabase
          .from('avatar_frames')
          .select('*')
          .eq('is_active', true)
          .order('min_level', ascending: true);
      
      setState(() {
        _frames = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading frames: $e");
      setState(() => _isLoading = false);
    }
  }

  Future<void> _handleEquip() async {
    if (_selectedFrameId == null) return;
    
    setState(() => _isLoading = true);
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) return;

      // Update profile
      await _supabase.from('profiles').update({
        'equipped_frame_id': _selectedFrameId == 'none' ? null : _selectedFrameId
      }).eq('id', userId);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Frame updated successfully!"), backgroundColor: Colors.green),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: App3DDesign.spaceDark,
      body: Stack(
        children: [
          App3DDesign.buildAmbientGlow(context),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                _buildPreviewSection(),
                Expanded(child: _buildFrameGrid()),
                _buildBottomAction(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.chevronLeft, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          Text(
            "Avatar Frames",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Widget _buildPreviewSection() {
    return Container(
      padding: const EdgeInsets.all(32),
      child: Center(
        child: Column(
          children: [
            AvatarWithFrame(
              userId: _myProfile?['id'] ?? "",
              src: _myProfile?['avatar_url'],
              size: 120,
              // Force local preview of selected frame
              // We'll need to modify AvatarWithFrame to accept an override frameId if possible
              // For now, it will show the current equipped one unless we pass something else
            ),
            const SizedBox(height: 16),
            Text(
              "Preview",
              style: GoogleFonts.outfit(color: Colors.white38, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFrameGrid() {
    if (_isLoading && _frames.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: Colors.purple));
    }

    return GridView.builder(
      padding: const EdgeInsets.all(20),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 16,
        crossAxisSpacing: 16,
        childAspectRatio: 0.8,
      ),
      itemCount: _frames.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) return _buildNoneOption();
        
        final frame = _frames[index - 1];
        final isSelected = _selectedFrameId == frame['id'];
        final isEquipped = _equippedFrameId == frame['id'];

        return GestureDetector(
          onTap: () => setState(() => _selectedFrameId = frame['id']),
          child: Container(
            decoration: BoxDecoration(
              color: isSelected ? Colors.white.withOpacity(0.1) : Colors.white.withOpacity(0.03),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isSelected ? App3DDesign.primaryPurple : Colors.white10,
                width: 2,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Image.network(
                      _api.resolveAssetUrl(frame['frame_url'], bucket: 'avatar_frames'),
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                  child: Text(
                    frame['name'] ?? 'Frame',
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.outfit(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                ),
                if (isEquipped)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    decoration: const BoxDecoration(
                      color: Colors.green,
                      borderRadius: BorderRadius.only(bottomLeft: Radius.circular(14), bottomRight: Radius.circular(14)),
                    ),
                    child: const Center(child: Text("EQUIPPED", style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold))),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildNoneOption() {
    final isSelected = _selectedFrameId == 'none' || _selectedFrameId == null;
    return GestureDetector(
      onTap: () => setState(() => _selectedFrameId = 'none'),
      child: Container(
        decoration: BoxDecoration(
          color: isSelected ? Colors.white.withOpacity(0.1) : Colors.white.withOpacity(0.03),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? App3DDesign.primaryPurple : Colors.white10,
            width: 2,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(LucideIcons.ban, color: Colors.white24, size: 32),
            const SizedBox(height: 8),
            Text(
              "None",
              style: GoogleFonts.outfit(color: Colors.white70, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomAction() {
    return Container(
      padding: const EdgeInsets.all(20),
      child: ElevatedButton(
        onPressed: _selectedFrameId == _equippedFrameId ? null : _handleEquip,
        style: ElevatedButton.styleFrom(
          backgroundColor: App3DDesign.primaryPurple,
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 56),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          elevation: 0,
        ),
        child: Text(
          "Apply Frame",
          style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}
