import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class BrandingManagementScreen extends StatefulWidget {
  const BrandingManagementScreen({super.key});

  @override
  State<BrandingManagementScreen> createState() => _BrandingManagementScreenState();
}

class _BrandingManagementScreenState extends State<BrandingManagementScreen> {
  final ApiService _api = ApiService();
  final _formKey = GlobalKey<FormState>();
  
  bool _isLoading = true;
  Map<String, dynamic> _brandingData = {};
  
  final TextEditingController _primaryText = TextEditingController();
  final TextEditingController _secondaryText = TextEditingController();
  final TextEditingController _tagline = TextEditingController();
  final TextEditingController _logoUrl = TextEditingController();
  final TextEditingController _bgUrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadBranding();
  }

  Future<void> _loadBranding() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('branding_settings').select('*').limit(1).maybeSingle();
      if (res != null) {
        setState(() {
          _brandingData = res;
          _primaryText.text = res['logo_text_primary'] ?? 'meri';
          _secondaryText.text = res['logo_text_secondary'] ?? 'LIVE';
          _tagline.text = res['tagline'] ?? '';
          _logoUrl.text = res['logo_url'] ?? '';
          _bgUrl.text = res['background_url'] ?? '';
        });
      }
    } catch (e) {
      debugPrint("Error loading branding: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _saveBranding() async {
    if (!_formKey.currentState!.validate()) return;
    
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final updates = {
        'logo_text_primary': _primaryText.text,
        'logo_text_secondary': _secondaryText.text,
        'tagline': _tagline.text,
        'logo_url': _logoUrl.text,
        'background_url': _bgUrl.text,
        'updated_at': DateTime.now().toIso8601String(),
      };

      if (_brandingData.isEmpty) {
        await supa.from('branding_settings').insert(updates);
      } else {
        await supa.from('branding_settings').update(updates).eq('id', _brandingData['id']);
      }

      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Branding updated successfully!")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));

    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: ListView(
        padding: const EdgeInsets.all(32),
        children: [
          _buildHeader(),
          const SizedBox(height: 48),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 3, child: _buildForm()),
              const SizedBox(width: 48),
              Expanded(flex: 2, child: _buildLivePreview()),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "BRAND IDENTITY CONFIG",
          style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900),
        ),
        const Text(
          "Manage application logos, text marks, and global visual assets for the 'Nebula' theme",
          style: TextStyle(color: Colors.white38, fontSize: 14),
        ),
      ],
    );
  }

  Widget _buildForm() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionTitle("TEXTUAL BRANDING"),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(child: _buildTextField("Primary Text", _primaryText, "e.g. meri")),
              const SizedBox(width: 16),
              Expanded(child: _buildTextField("Secondary Text", _secondaryText, "e.g. LIVE")),
            ],
          ),
          const SizedBox(height: 16),
          _buildTextField("Global Tagline", _tagline, "e.g. Connect, Share, Live."),
          const SizedBox(height: 40),
          _buildSectionTitle("VISUAL ASSETS (URLS)"),
          const SizedBox(height: 24),
          _buildTextField("Logo SVG/PNG URL", _logoUrl, "https://example.com/logo.png"),
          const SizedBox(height: 16),
          _buildTextField("Login Background URL", _bgUrl, "https://example.com/bg.jpg"),
          const SizedBox(height: 48),
          SizedBox(
            width: double.infinity,
            height: 60,
            child: ElevatedButton(
              onPressed: _saveBranding,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6366F1),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: Text("APPLY GLOBAL BRANDING", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Row(
      children: [
        Container(width: 4, height: 16, decoration: BoxDecoration(color: const Color(0xFF6366F1), borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 12),
        Text(title, style: GoogleFonts.outfit(color: Colors.white24, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 2)),
      ],
    );
  }

  Widget _buildTextField(String label, TextEditingController controller, String hint) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.02),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white10),
          ),
          child: TextFormField(
            controller: controller,
            style: const TextStyle(color: Colors.white, fontSize: 14),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: const TextStyle(color: Colors.white10, fontSize: 14),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLivePreview() {
    return FadeInRight(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionTitle("REAL-TIME PREVIEW"),
          const SizedBox(height: 24),
          Container(
            height: 400,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(32),
              border: Border.all(color: Colors.white10),
              image: _bgUrl.text.isNotEmpty 
                ? DecorationImage(image: NetworkImage(_bgUrl.text), fit: BoxFit.cover) 
                : null,
              color: Colors.black45,
            ),
            child: Stack(
              children: [
                Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(32),
                    gradient: LinearGradient(
                      begin: Alignment.topCenter, end: Alignment.bottomCenter,
                      colors: [Colors.black.withOpacity(0.8), Colors.transparent, Colors.black.withOpacity(0.8)],
                    ),
                  ),
                ),
                Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (_logoUrl.text.isNotEmpty)
                        CachedNetworkImage(imageUrl: _logoUrl.text, height: 60, placeholder: (c,u) => const Icon(LucideIcons.image, color: Colors.white10))
                      else
                        const Icon(LucideIcons.image, color: Colors.white10, size: 48),
                      const SizedBox(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(_primaryText.text, style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w200)),
                          Text(_secondaryText.text, style: GoogleFonts.outfit(color: const Color(0xFF6366F1), fontSize: 24, fontWeight: FontWeight.w900)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(_tagline.text, style: const TextStyle(color: Colors.white38, fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Center(child: Text("This is how users will see the login screen", style: TextStyle(color: Colors.white10, fontSize: 11))),
        ],
      ),
    );
  }
}
