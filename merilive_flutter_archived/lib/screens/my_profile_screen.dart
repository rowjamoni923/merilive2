import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../services/api_service.dart';
import '../widgets/avatar_with_frame.dart';
import '../widgets/nebula_background.dart';
import '../widgets/profile_editor_sheets.dart';

class MyProfileScreen extends StatefulWidget {
  const MyProfileScreen({super.key});

  @override
  State<MyProfileScreen> createState() => _MyProfileScreenState();
}

class _MyProfileScreenState extends State<MyProfileScreen> {
  final ApiService _api = ApiService();
  
  Map<String, dynamic>? _profile;
  bool _isLoading = true;
  bool _isSaving = false;
  File? _newAvatar;

  // Local state for edits
  String? _displayName;
  String? _bio;
  int? _age;
  String? _gender;
  String? _lang;
  String? _secondLang;
  bool _hideLocation = false;
  List<String> _tags = [];

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    setState(() => _isLoading = true);
    try {
      _profile = await _api.getMyProfile();
      if (_profile != null) {
        _displayName = _profile!['display_name'];
        _bio = _profile!['bio'];
        _age = _profile!['age'];
        _gender = _profile!['gender'];
        _lang = _profile!['language'];
        _secondLang = _profile!['second_language'];
        _hideLocation = _profile!['hide_location'] ?? false;
        _tags = List<String>.from(_profile!['tags'] ?? []);
      }
    } catch (e) {
      debugPrint("Error loading profile: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSave() async {
    if (_isSaving) return;
    setState(() => _isSaving = true);
    try {
      final updates = <String, dynamic>{};
      updates['display_name'] = _displayName;
      updates['bio'] = _bio;
      updates['age'] = _age;
      updates['gender'] = _gender;
      updates['language'] = _lang;
      updates['second_language'] = _secondLang;
      updates['hide_location'] = _hideLocation;
      updates['tags'] = _tags;
      
      final success = await _api.updateProfile(updates);
      if (success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile saved successfully!'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: ImageSource.gallery);
    if (pickedFile != null) {
      setState(() => _newAvatar = File(pickedFile.path));
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Uploading new avatar...")));
    }
  }

  void _copyID() {
    if (_profile?['app_uid'] != null) {
      Clipboard.setData(ClipboardData(text: _profile!['app_uid'].toString()));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Row(children: [Icon(LucideIcons.copy, color: Colors.white, size: 16), SizedBox(width: 8), Text("ID copied to clipboard")]), duration: Duration(seconds: 1)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0515),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
                    : SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        physics: const BouncingScrollPhysics(),
                        child: Column(
                          children: [
                            const SizedBox(height: 20),
                            _buildIdentityHero(),
                            const SizedBox(height: 32),
                            
                            _buildSectionHeader("IDENTITY"),
                            _buildSettingsGroup([
                              _buildSettingItem("My Avatar", trailing: _buildMiniAvatar(), onTap: _pickImage),
                              _buildSettingItem("Avatar Frame", trailing: const Icon(LucideIcons.sparkles, color: Colors.amber, size: 18), onTap: () {
                                Navigator.pushNamed(context, '/avatar_frame_selection');
                              }),
                              _buildSettingItem("ID", trailing: Row(children: [Text(_profile?['app_uid']?.toString() ?? 'N/A', style: const TextStyle(color: Colors.white70)), const SizedBox(width: 8), const Icon(LucideIcons.copy, color: Colors.white24, size: 14)]), onTap: _copyID),
                              _buildSettingItem("Nickname", trailing: Text(_displayName ?? 'Set Nickname', style: const TextStyle(color: Colors.white70)), onTap: () async {
                                final res = await ProfileEditorSheets.showNicknameSheet(context, _displayName ?? '');
                                if (res != null) setState(() => _displayName = res);
                              }),
                              _buildSettingItem("Gender", trailing: Text(_gender?.toUpperCase() ?? 'Set Gender', style: TextStyle(color: _gender != null ? Colors.white30 : Colors.indigoAccent)), 
                                onTap: _gender != null ? null : () async {
                                  final res = await ProfileEditorSheets.showGenderSheet(context);
                                  if (res != null) setState(() => _gender = res);
                                }
                              ),
                              _buildSettingItem("Age", trailing: Text(_age?.toString() ?? 'Set Age', style: const TextStyle(color: Colors.white70)), onTap: () async {
                                final res = await ProfileEditorSheets.showAgeSheet(context, _age ?? 20);
                                if (res != null) setState(() => _age = res);
                              }),
                              _buildSettingItem("Region", trailing: Text(_profile?['country_code'] ?? 'Global', style: const TextStyle(color: Colors.white70)), onTap: () {}),
                            ]),

                            const SizedBox(height: 24),
                            _buildSectionHeader("LOCALIZATION & PRIVACY"),
                            _buildSettingsGroup([
                              _buildSettingItem("Language", trailing: Text(_lang ?? 'Bengali', style: const TextStyle(color: Colors.white70)), onTap: () async {
                                final res = await ProfileEditorSheets.showLanguageSheet(context, _lang ?? 'Bengali');
                                if (res != null) setState(() => _lang = res);
                              }),
                              _buildSettingItem("Second Language", trailing: Text(_secondLang ?? 'None', style: const TextStyle(color: Colors.white70)), onTap: () async {
                                final res = await ProfileEditorSheets.showLanguageSheet(context, _secondLang, isSecond: true);
                                if (res != null) setState(() => _secondLang = res == 'None' ? null : res);
                              }),
                              _buildSettingItem("Hide Location", trailing: Switch(
                                value: _hideLocation,
                                onChanged: (v) => setState(() => _hideLocation = v),
                                activeColor: const Color(0xFF6366F1),
                              )),
                            ]),

                            const SizedBox(height: 24),
                            _buildSectionHeader("BIO & INTERESTS"),
                            _buildSettingsGroup([
                              _buildSettingItem("Self Introduction", subtitle: _bio ?? "Write about yourself...", onTap: () async {
                                final res = await ProfileEditorSheets.showNicknameSheet(context, _bio ?? ''); 
                                if (res != null) setState(() => _bio = res);
                              }),
                              _buildSettingItem("Tags", subtitle: _tags.isEmpty ? "Add your interests" : _tags.join(", "), onTap: () {}),
                            ]),

                            const SizedBox(height: 40),
                          ],
                        ),
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0C0515).withOpacity(0.5),
        border: const Border(bottom: BorderSide(color: Colors.white10)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
                  child: const Icon(LucideIcons.chevronLeft, color: Colors.white, size: 20),
                ),
              ),
              const SizedBox(width: 16),
              Text("My Profile", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            ],
          ),
          TextButton(
            onPressed: _isSaving ? null : _handleSave,
            style: TextButton.styleFrom(
              backgroundColor: const Color(0xFF6366F1),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: _isSaving 
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : Text("Save", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildIdentityHero() {
    return Column(
      children: [
        Center(
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 130, height: 130,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(colors: [const Color(0xFF6366F1).withOpacity(0.4), Colors.transparent]),
                ),
              ),
              GestureDetector(
                onTap: _pickImage,
                child: _newAvatar != null
                    ? CircleAvatar(radius: 48, backgroundImage: FileImage(_newAvatar!))
                    : AvatarWithFrame(userId: _profile?['id'] ?? "", src: _profile?['avatar_url'], size: 96),
              ),
              Positioned(
                bottom: 5, right: 5,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: const Color(0xFF6366F1), shape: BoxShape.circle, border: Border.all(color: const Color(0xFF0C0515), width: 3)),
                  child: const Icon(LucideIcons.camera, color: Colors.white, size: 16),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(
          _displayName ?? 'User',
          style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 8, bottom: 12),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          title,
          style: GoogleFonts.outfit(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.2),
        ),
      ),
    );
  }

  Widget _buildSettingsGroup(List<Widget> children) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildSettingItem(String title, {String? subtitle, Widget? trailing, VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Colors.white10))),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: GoogleFonts.inter(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle, style: const TextStyle(color: Colors.white24, fontSize: 12)),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing,
            if (onTap != null && trailing == null) const Icon(LucideIcons.chevronRight, color: Colors.white10, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildMiniAvatar() {
    return Container(
      width: 40, height: 40,
      decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white10)),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: _newAvatar != null 
          ? Image.file(_newAvatar!, fit: BoxFit.cover)
          : (_profile?['avatar_url'] != null ? Image.network(_profile!['avatar_url'], fit: BoxFit.cover) : const Icon(LucideIcons.user, color: Colors.white24)),
      ),
    );
  }
}
