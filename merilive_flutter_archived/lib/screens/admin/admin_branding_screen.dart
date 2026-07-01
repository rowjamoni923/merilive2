import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminBrandingScreen extends StatefulWidget {
  const AdminBrandingScreen({super.key});

  @override
  State<AdminBrandingScreen> createState() => _AdminBrandingScreenState();
}

class _AdminBrandingScreenState extends State<AdminBrandingScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  bool _isSaving = false;

  final TextEditingController _primaryTextController = TextEditingController(text: "meri");
  final TextEditingController _secondaryTextController = TextEditingController(text: "LIVE");
  final TextEditingController _taglineController = TextEditingController(text: "Connect • Chat • Share");
  String _backgroundUrl = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800";
  String _bgType = "image"; // image or video
  String? _logoUrl;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('branding_settings').select('*').eq('setting_key', 'default').maybeSingle();
      
      if (res != null) {
        final val = res['setting_value'];
        setState(() {
          _primaryTextController.text = val['logo_text_primary'] ?? "meri";
          _secondaryTextController.text = val['logo_text_secondary'] ?? "LIVE";
          _taglineController.text = val['tagline'] ?? "Connect • Chat • Share";
          _backgroundUrl = val['background_url'] ?? _backgroundUrl;
          _bgType = val['background_type'] ?? "image";
          _logoUrl = val['logo_image_url'];
        });
      }
      setState(() => _isLoading = false);
    } catch (e) {
      debugPrint("Error loading branding: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _isLoading 
      ? const Center(child: CircularProgressIndicator(color: Colors.amberAccent))
      : SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 3, child: _buildSettingsPanel()),
              const SizedBox(width: 32),
              Expanded(flex: 2, child: _buildLivePreview()),
            ],
          ),
        );
  }

  Widget _buildSettingsPanel() {
    return Column(
      children: [
        _buildSectionCard(
          LucideIcons.type, "Logo Identity", "Text or image based branding",
          Column(
            children: [
              Row(
                children: [
                  Expanded(child: _input("Primary Text", _primaryTextController)),
                  const SizedBox(width: 16),
                  Expanded(child: _input("Secondary Text", _secondaryTextController)),
                ],
              ),
              const SizedBox(height: 20),
              _input("Tagline", _taglineController),
            ],
          ),
        ),
        const SizedBox(height: 24),
        _buildSectionCard(
          LucideIcons.video, "Background Atmosphere", "Set a static image or dynamic video",
          Column(
            children: [
              Row(
                children: [
                  _bgTypeBtn("image", LucideIcons.image),
                  const SizedBox(width: 12),
                  _bgTypeBtn("video", LucideIcons.video),
                ],
              ),
              const SizedBox(height: 20),
              _input("Background URL", TextEditingController(text: _backgroundUrl), onChanged: (v) => setState(() => _backgroundUrl = v)),
            ],
          ),
        ),
        const SizedBox(height: 32),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.save, size: 14),
            label: const Text("SAVE BRANDING", style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.amberAccent.withOpacity(0.1), foregroundColor: Colors.amberAccent, padding: const EdgeInsets.symmetric(vertical: 24), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
          ),
        ),
      ],
    );
  }

  Widget _buildSectionCard(IconData icon, String title, String subtitle, Widget child) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: Colors.white24, size: 20),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  Text(subtitle, style: const TextStyle(color: Colors.white24, fontSize: 11)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 32),
          child,
        ],
      ),
    );
  }

  Widget _bgTypeBtn(String type, IconData icon) {
    bool sel = _bgType == type;
    return GestureDetector(
      onTap: () => setState(() => _bgType = type),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        decoration: BoxDecoration(color: sel ? Colors.amberAccent : Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(12), border: Border.all(color: sel ? Colors.amberAccent : Colors.white.withOpacity(0.05))),
        child: Row(
          children: [
            Icon(icon, color: sel ? Colors.black : Colors.white24, size: 14),
            const SizedBox(width: 10),
            Text(type.toUpperCase(), style: TextStyle(color: sel ? Colors.black : Colors.white24, fontWeight: FontWeight.bold, fontSize: 10)),
          ],
        ),
      ),
    );
  }

  Widget _input(String label, TextEditingController ctrl, {Function(String)? onChanged}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        TextField(
          controller: ctrl,
          onChanged: (v) { 
            setState(() {}); 
            if(onChanged != null) onChanged(v); 
          },
          style: const TextStyle(color: Colors.white, fontSize: 13),
          decoration: InputDecoration(filled: true, fillColor: Colors.white.withOpacity(0.02), enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.white.withOpacity(0.05))), focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Colors.amberAccent))),
        ),
      ],
    );
  }

  Widget _buildLivePreview() {
    return Container(
      height: 600,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: Colors.white10),
        image: DecorationImage(image: NetworkImage(_backgroundUrl), fit: BoxFit.cover),
      ),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(32),
          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black.withOpacity(0.3), Colors.transparent, Colors.black.withOpacity(0.6)]),
        ),
        child: Column(
          children: [
            const SizedBox(height: 100),
            _logoUrl != null 
              ? Image.network(_logoUrl!, height: 80)
              : Column(
                  children: [
                    Text(_primaryTextController.text, style: GoogleFonts.outfit(color: Colors.white, fontSize: 50, fontWeight: FontWeight.w900, letterSpacing: 10)),
                    Container(height: 1, width: 60, color: Colors.white38),
                    const SizedBox(height: 4),
                    Text(_secondaryTextController.text, style: GoogleFonts.outfit(color: Colors.white70, fontSize: 20, fontWeight: FontWeight.w300, letterSpacing: 15)),
                  ],
                ),
            const SizedBox(height: 20),
            Text(_taglineController.text, style: const TextStyle(color: Colors.white38, fontSize: 10, letterSpacing: 4, fontWeight: FontWeight.w300)),
            const Spacer(),
            Container(
              margin: const EdgeInsets.all(32),
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.9), borderRadius: BorderRadius.circular(30)),
              child: const Center(child: Text("START EXPERIENCE", style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 12))),
            ),
          ],
        ),
      ),
    );
  }
}
