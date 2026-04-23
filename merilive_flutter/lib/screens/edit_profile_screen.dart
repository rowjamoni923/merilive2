import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../widgets/avatar_with_frame.dart';
import '../utils/design_system.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final ApiService _api = ApiService();
  final _nameController = TextEditingController();
  final _bioController = TextEditingController();
  final _ageController = TextEditingController();
  final _districtController = TextEditingController();
  
  Map<String, dynamic>? _profile;
  bool _isLoading = true;
  bool _isSaving = false;
  bool _isUploading = false;
  
  // Field States
  String? _gender;
  String? _avatarUrl;
  String? _language = "Bengali";
  String? _secondLanguage;
  List<String> _tags = [];
  bool _hideLocation = false;
  String? _userEmail;
  String? _userPhone;
  bool _isFaceVerified = false;
  bool _isIdVerified = false;
  List<Map<String, dynamic>> _posters = [];

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _bioController.dispose();
    _ageController.dispose();
    _districtController.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() => _isLoading = true);
    try {
      final userId = _api.currentUserId;
      if (userId == null) return;

      _profile = await _api.getMyProfile();
      if (_profile != null) {
        _nameController.text = _profile!['display_name'] ?? '';
        _bioController.text = _profile!['bio'] ?? '';
        _ageController.text = _profile!['age']?.toString() ?? '';
        _districtController.text = _profile!['district'] ?? '';
        _gender = _profile!['gender'];
        _avatarUrl = _profile!['avatar_url'];
        _language = _profile!['primary_language'] ?? "Bengali";
        _secondLanguage = _profile!['secondary_language'];
        _tags = List<String>.from(_profile!['tags'] ?? []);
        _hideLocation = _profile!['hide_location'] ?? false;
        _isFaceVerified = _profile!['is_face_verified'] ?? false;
        _isIdVerified = _profile!['is_verified'] ?? false;
        
        // Fetch User Details (Auth)
        final user = _api.getSupabase().auth.currentUser;
        _userEmail = user?.email;
        _userPhone = user?.phone;

        // Fetch Posters
        final posterRes = await _api.getSupabase()
            .from('poster_images')
            .select('*')
            .eq('user_id', userId)
            .order('display_order');
        _posters = List<Map<String, dynamic>>.from(posterRes);
      }
    } catch (e) {
      debugPrint("Error loading profile: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _pickAndCropAvatar() async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: ImageSource.gallery);
    
    if (pickedFile != null) {
      final croppedFile = await ImageCropper().cropImage(
        sourcePath: pickedFile.path,
        aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'Crop Avatar',
            toolbarColor: const Color(0xFF8B5CF6),
            toolbarWidgetColor: Colors.white,
            initAspectRatio: CropAspectRatioPreset.square,
            lockAspectRatio: true,
          ),
          IOSUiSettings(title: 'Crop Avatar'),
        ],
      );

      if (croppedFile != null) {
        setState(() => _isUploading = true);
        try {
          final fileName = "${_api.currentUserId}/${DateTime.now().millisecondsSinceEpoch}.jpg";
          await _api.getSupabase().storage.from('avatars').upload(
            fileName,
            File(croppedFile.path),
            fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: true),
          );
          
          final publicUrl = _api.getSupabase().storage.from('avatars').getPublicUrl(fileName);
          setState(() {
            _avatarUrl = publicUrl;
            _isUploading = false;
          });
          await _api.updateProfile({'avatar_url': publicUrl});
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Avatar updated!")));
        } catch (e) {
          debugPrint("Upload error: $e");
          setState(() => _isUploading = false);
        }
      }
    }
  }

  Future<void> _handleSave() async {
    if (_nameController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Nickname cannot be empty")));
      return;
    }

    setState(() => _isSaving = true);
    try {
      final data = {
        'display_name': _nameController.text.trim(),
        'bio': _bioController.text.trim(),
        'age': int.tryParse(_ageController.text),
        'district': _districtController.text.trim(),
        'primary_language': _language,
        'secondary_language': _secondLanguage,
        'tags': _tags,
        'hide_location': _hideLocation,
      };
      
      await _api.updateProfile(data);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("✅ Profile updated successfully!")));
        Navigator.pop(context);
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(child: CircularProgressIndicator(color: Color(0xFF8B5CF6))),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          // Premium Background Gradient
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFF1E293B), Color(0xFF0F172A), Colors.black],
                ),
              ),
            ),
          ),
          
          CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              _buildAppBar(),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    children: [
                      const SizedBox(height: 24),
                      _buildAvatarHero(),
                      const SizedBox(height: 32),
                      _buildPosterSection(),
                      const SizedBox(height: 32),
                      _buildSectionHeader("Basic Information", LucideIcons.user),
                      const SizedBox(height: 16),
                      _buildEditCard(
                        label: "Nickname",
                        value: _nameController.text,
                        icon: LucideIcons.user,
                        onTap: () => _showTextEditor("Edit Nickname", _nameController, maxLength: 20),
                      ),
                      _buildEditCard(
                        label: "Bio",
                        value: _bioController.text.isEmpty ? "Set bio" : _bioController.text,
                        icon: LucideIcons.text,
                        onTap: () => _showTextEditor("Edit Bio", _bioController, maxLines: 3, maxLength: 100),
                      ),
                      _buildEditCard(
                        label: "Gender",
                        value: _gender?.toUpperCase() ?? "Select",
                        icon: LucideIcons.users,
                        color: _gender == 'female' ? Colors.pinkAccent : (_gender == 'male' ? Colors.blueAccent : null),
                        isLocked: _gender != null && _gender != 'other' && _gender!.isNotEmpty,
                        onTap: _showGenderSelection,
                      ),
                      _buildEditCard(
                        label: "Age",
                        value: _ageController.text.isEmpty ? "Set age" : _ageController.text,
                        icon: LucideIcons.star,
                        onTap: () => _showTextEditor("Edit Age", _ageController, keyboardType: TextInputType.number),
                      ),
                      const SizedBox(height: 32),
                      _buildSectionHeader("Location & Language", LucideIcons.globe),
                      const SizedBox(height: 16),
                      _buildEditCard(
                        label: "Region",
                        value: _profile?['country_name'] ?? "Unknown",
                        icon: LucideIcons.mapPin,
                        isLocked: true,
                      ),
                      _buildEditCard(
                        label: "District",
                        value: _districtController.text.isEmpty ? "Set district" : _districtController.text,
                        icon: LucideIcons.map,
                        onTap: () => _showTextEditor("Edit District", _districtController),
                      ),
                      _buildToggleCard(
                        label: "Hide Location",
                        subtitle: "Others won't see your precise city",
                        value: _hideLocation,
                        icon: _hideLocation ? LucideIcons.eyeOff : LucideIcons.eye,
                        onChanged: (val) => setState(() => _hideLocation = val),
                      ),
                      _buildEditCard(
                        label: "Language",
                        value: _language ?? "Bengali",
                        icon: LucideIcons.languages,
                        onTap: () => _showLanguageSelection(false),
                      ),
                      _buildEditCard(
                        label: "Second Language",
                        value: _secondLanguage ?? "None",
                        icon: LucideIcons.globe,
                        onTap: () => _showLanguageSelection(true),
                      ),
                      const SizedBox(height: 32),
                      _buildSectionHeader("Interests & Tags", LucideIcons.tag),
                      const SizedBox(height: 16),
                      _buildTagsSection(),
                      const SizedBox(height: 32),
                      _buildSectionHeader("Account Security", LucideIcons.shieldCheck),
                      const SizedBox(height: 16),
                      _buildReadOnlyCard(
                        label: "UID",
                        value: _profile?['app_uid']?.toString() ?? "N/A",
                        icon: LucideIcons.hash,
                        onAction: () {
                          Clipboard.setData(ClipboardData(text: _profile?['app_uid']?.toString() ?? ""));
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("ID Copied!")));
                        },
                        actionIcon: LucideIcons.copy,
                      ),
                      _buildEditCard(
                        label: "Email",
                        value: _userEmail ?? "Link Email",
                        icon: LucideIcons.mail,
                        onTap: () => _showSecurityDialog("Email"),
                      ),
                      _buildEditCard(
                        label: "Phone",
                        value: _userPhone ?? "Link Phone",
                        icon: LucideIcons.phone,
                        onTap: () => _showSecurityDialog("Phone"),
                      ),
                      _buildEditCard(
                        label: "Password",
                        value: "********",
                        icon: LucideIcons.lock,
                        onTap: () => _showSecurityDialog("Password"),
                      ),
                      const SizedBox(height: 32),
                      _buildSectionHeader("Verification Status", LucideIcons.checkCircle2),
                      const SizedBox(height: 16),
                      _buildStatusCard(
                        label: "Face Verification",
                        status: _isFaceVerified ? "Verified" : "Not Verified",
                        isVerified: _isFaceVerified,
                        icon: LucideIcons.userCheck,
                        onTap: _isFaceVerified ? null : () => Navigator.pushNamed(context, '/face_verify'),
                      ),
                      _buildStatusCard(
                        label: "ID Verification",
                        status: _isIdVerified ? "Verified" : "Not Verified",
                        isVerified: _isIdVerified,
                        icon: LucideIcons.shieldCheck,
                        onTap: _isIdVerified ? null : () => Navigator.pushNamed(context, '/id_verify'),
                      ),
                      const SizedBox(height: 80),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar() {
    return SliverAppBar(
      pinned: true,
      backgroundColor: const Color(0xFF0F172A).withOpacity(0.9),
      elevation: 0,
      leading: IconButton(
        icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
        onPressed: () => Navigator.pop(context),
      ),
      title: Text(
        "Edit Profile",
        style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
      ),
      actions: [
        if (_isSaving)
          const Padding(
            padding: EdgeInsets.all(16),
            child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Color(0xFF8B5CF6), strokeWidth: 2)),
          )
        else
          TextButton(
            onPressed: _handleSave,
            child: Text("Save", style: GoogleFonts.outfit(color: const Color(0xFF8B5CF6), fontWeight: FontWeight.w900, fontSize: 16)),
          ),
      ],
    );
  }

  Widget _buildAvatarHero() {
    return FadeInDown(
      child: Center(
        child: Stack(
          alignment: Alignment.bottomRight,
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  colors: [Color(0xFF8B5CF6), Color(0xFFD946EF), Color(0xFF8B5CF6)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: [
                  BoxShadow(color: const Color(0xFF8B5CF6).withOpacity(0.4), blurRadius: 30, spreadRadius: 2),
                ],
              ),
              child: Hero(
                tag: 'profile_avatar',
                child: AvatarWithFrame(src: _avatarUrl, size: 120),
              ),
            ),
            GestureDetector(
              onTap: _pickAndCropAvatar,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFF6D28D9)]),
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFF0F172A), width: 4),
                  boxShadow: [BoxShadow(color: Colors.black45, blurRadius: 10)],
                ),
                child: _isUploading 
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Icon(LucideIcons.camera, color: Colors.white, size: 20),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPosterSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _buildSubHeader("My Poster"),
            TextButton.icon(
              onPressed: () => Navigator.pushNamed(context, '/my-poster'),
              icon: const Icon(LucideIcons.image, size: 14, color: Color(0xFF8B5CF6)),
              label: const Text("Manage", style: TextStyle(color: Color(0xFF8B5CF6), fontSize: 12, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 100,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: _posters.length + 1,
            itemBuilder: (context, index) {
              if (index == _posters.length) {
                return _buildAddPosterBtn();
              }
              return _buildPosterItem(_posters[index]['image_url']);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildPosterItem(String url) {
    return Container(
      margin: const EdgeInsets.only(right: 12),
      width: 100,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        image: DecorationImage(image: NetworkImage(url), fit: BoxFit.cover),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
    );
  }

  Widget _buildAddPosterBtn() {
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/my-poster'),
      child: Container(
        width: 100,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.05), style: BorderStyle.solid),
        ),
        child: const Icon(LucideIcons.plus, color: Colors.white38),
      ),
    );
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return FadeInLeft(
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: const Color(0xFF8B5CF6).withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: const Color(0xFF8B5CF6), size: 16),
          ),
          const SizedBox(width: 12),
          Text(
            title.toUpperCase(),
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 1.5),
          ),
          const Spacer(),
          Container(width: 40, height: 1, color: Colors.white.withOpacity(0.05)),
        ],
      ),
    );
  }

  Widget _buildSubHeader(String title) {
    return Text(
      title,
      style: GoogleFonts.outfit(color: Colors.white70, fontSize: 15, fontWeight: FontWeight.bold),
    );
  }

  Widget _buildEditCard({
    required String label,
    required String value,
    required IconData icon,
    Color? color,
    bool isLocked = false,
    VoidCallback? onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: isLocked ? null : onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.03),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withOpacity(0.05)),
          ),
          child: Row(
            children: [
              Icon(icon, color: color ?? Colors.white24, size: 20),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                    const SizedBox(height: 4),
                    Text(
                      value,
                      style: GoogleFonts.outfit(
                        color: color ?? Colors.white.withOpacity(0.9),
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              if (isLocked)
                const Icon(LucideIcons.lock, color: Colors.white10, size: 14)
              else
                Icon(LucideIcons.chevronRight, color: Colors.white.withOpacity(0.1), size: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReadOnlyCard({
    required String label,
    required String value,
    required IconData icon,
    required IconData actionIcon,
    required VoidCallback onAction,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.white24, size: 20),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(value, style: GoogleFonts.spaceMono(color: Colors.white70, fontSize: 15, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          GestureDetector(
            onTap: onAction,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: const Color(0xFF8B5CF6).withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
              child: Icon(actionIcon, color: const Color(0xFF8B5CF6), size: 14),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToggleCard({
    required String label,
    required String subtitle,
    required bool value,
    required IconData icon,
    required ValueChanged<bool> onChanged,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          Icon(icon, color: value ? const Color(0xFF8B5CF6) : Colors.white24, size: 20),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                Text(subtitle, style: const TextStyle(color: Colors.white24, fontSize: 10)),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: const Color(0xFF8B5CF6),
            activeTrackColor: const Color(0xFF8B5CF6).withOpacity(0.2),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusCard({
    required String label,
    required String status,
    required bool isVerified,
    required IconData icon,
    VoidCallback? onTap,
  }) {
    final Color color = isVerified ? const Color(0xFF10B981) : Colors.amber;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          decoration: BoxDecoration(
            color: color.withOpacity(0.05),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: color.withOpacity(0.1)),
          ),
          child: Row(
            children: [
              Icon(icon, color: color.withOpacity(0.5), size: 20),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(status, style: GoogleFonts.outfit(color: color, fontSize: 14, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              if (!isVerified)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)),
                  child: const Text("VERIFY", style: TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.w900)),
                )
              else
                const Icon(LucideIcons.checkCircle, color: Color(0xFF10B981), size: 18),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTagsSection() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ..._tags.map((tag) => _buildTagChip(tag)),
              GestureDetector(
                onTap: _showTagSelection,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF8B5CF6).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFF8B5CF6).withOpacity(0.3)),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(LucideIcons.plus, color: Color(0xFF8B5CF6), size: 12),
                      SizedBox(width: 4),
                      Text("Add Tag", style: TextStyle(color: Color(0xFF8B5CF6), fontSize: 11, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTagChip(String tag) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(tag, style: const TextStyle(color: Colors.white70, fontSize: 11)),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: () => setState(() => _tags.remove(tag)),
            child: const Icon(LucideIcons.x, color: Colors.white24, size: 12),
          ),
        ],
      ),
    );
  }

  // Sheets & Editors
  void _showTextEditor(String title, TextEditingController controller, {int? maxLength, int maxLines = 1, TextInputType? keyboardType}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 24, right: 24, top: 24),
        decoration: const BoxDecoration(color: Color(0xFF1E293B), borderRadius: BorderRadius.vertical(top: Radius.circular(32))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 24),
            Text(title, style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
              child: TextField(
                controller: controller,
                autofocus: true,
                maxLength: maxLength,
                maxLines: maxLines,
                keyboardType: keyboardType,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(border: InputBorder.none, counterStyle: TextStyle(color: Colors.white24)),
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: () {
                  setState(() {});
                  Navigator.pop(context);
                },
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF8B5CF6), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                child: const Text("Apply", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  void _showGenderSelection() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(32),
        decoration: const BoxDecoration(color: Color(0xFF1E293B), borderRadius: BorderRadius.vertical(top: Radius.circular(32))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text("Select Gender", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text("⚠️ This can only be set once", style: TextStyle(color: Colors.amber, fontSize: 12)),
            const SizedBox(height: 32),
            Row(
              children: [
                Expanded(child: _buildGenderOption("Male", "male", LucideIcons.user, Colors.blue)),
                const SizedBox(width: 16),
                Expanded(child: _buildGenderOption("Female", "female", LucideIcons.user, Colors.pink)),
              ],
            ),
            const SizedBox(height: 24),
            const Text("Selecting 'Female' will convert account to Official Host", style: TextStyle(color: Colors.white24, fontSize: 10)),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildGenderOption(String label, String value, IconData icon, Color color) {
    return GestureDetector(
      onTap: () async {
        setState(() => _gender = value);
        Navigator.pop(context);
        await _api.updateProfile({'gender': value});
        if (value == 'female') {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("🎉 Welcome! You are now an Official Host.")));
        }
        _loadProfile();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 24),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 12),
            Text(label, style: GoogleFonts.outfit(color: color, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  void _showLanguageSelection(bool isSecondary) {
    final List<String> langs = ["Bengali", "English", "Hindi", "Arabic", "Spanish", "Chinese", "French", "Urdu"];
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(color: Color(0xFF1E293B), borderRadius: BorderRadius.vertical(top: Radius.circular(32))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(isSecondary ? "Second Language" : "Primary Language", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 24),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: langs.map((l) => GestureDetector(
                onTap: () {
                  setState(() {
                    if (isSecondary) _secondLanguage = l;
                    else _language = l;
                  });
                  Navigator.pop(context);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  decoration: BoxDecoration(
                    color: (isSecondary ? _secondLanguage == l : _language == l) ? const Color(0xFF8B5CF6) : Colors.black26,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: Text(l, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              )).toList(),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  void _showTagSelection() {
    final List<String> allTags = ["Music", "Dance", "Gaming", "Chat", "Art", "Movie", "Sports", "Travel", "Food", "Fashion"];
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(color: Color(0xFF1E293B), borderRadius: BorderRadius.vertical(top: Radius.circular(32))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text("Interest Tags", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 24),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: allTags.map((t) {
                final bool isSelected = _tags.contains(t);
                return GestureDetector(
                  onTap: () {
                    setState(() {
                      if (isSelected) _tags.remove(t);
                      else if (_tags.length < 5) _tags.add(t);
                      else ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Max 5 tags allowed")));
                    });
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: isSelected ? const Color(0xFF8B5CF6) : Colors.black26,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: isSelected ? Colors.transparent : Colors.white10),
                    ),
                    child: Text(t, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF8B5CF6), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                child: const Text("Done", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  void _showSecurityDialog(String type) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text("Update $type", style: const TextStyle(color: Colors.white)),
        content: Text("For security reasons, changing your $type requires OTP verification. Would you like to proceed?", style: const TextStyle(color: Colors.white60, fontSize: 14)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("Cancel", style: TextStyle(color: Colors.white24))),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("OTP sent to your registered device")));
            }, 
            child: const Text("Send OTP", style: TextStyle(color: Color(0xFF8B5CF6), fontWeight: FontWeight.bold))
          ),
        ],
      ),
    );
  }
}
