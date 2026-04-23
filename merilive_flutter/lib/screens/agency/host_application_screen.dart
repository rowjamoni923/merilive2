import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';
import '../face_verification_screen.dart';

class HostApplicationScreen extends StatefulWidget {
  final Map<String, dynamic> agency;
  const HostApplicationScreen({super.key, required this.agency});

  @override
  State<HostApplicationScreen> createState() => _HostApplicationScreenState();
}

class _HostApplicationScreenState extends State<HostApplicationScreen> {
  final ApiService _api = ApiService();
  final PageController _pageController = PageController();
  final ImagePicker _picker = ImagePicker();

  int _currentStep = 0; // 0: Bio, 1: Portfolio, 2: Finalize
  bool _isLoading = false;

  // Step 1 Controllers
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _ageController = TextEditingController();
  String _selectedLanguage = 'en';
  final TextEditingController _agencyCodeController = TextEditingController();
  Map<String, dynamic>? _verifiedAgency;
  bool _isSearchingAgency = false;

  // Step 2 Media
  XFile? _profilePhoto;
  final List<XFile> _portfolioPhotos = [];
  XFile? _introVideo;

  final List<Map<String, String>> _languages = [
    {'code': 'bn', 'name': 'Bengali', 'flag': '🇧🇩'},
    {'code': 'en', 'name': 'English', 'flag': '🇺🇸'},
    {'code': 'hi', 'name': 'Hindi', 'flag': '🇮🇳'},
    {'code': 'ar', 'name': 'Arabic', 'flag': '🇸🇦'},
    {'code': 'ur', 'name': 'Urdu', 'flag': '🇵🇰'},
  ];

  @override
  void initState() {
    super.initState();
    _agencyCodeController.text = widget.agency['agency_code'] ?? '';
    if (_agencyCodeController.text.isNotEmpty) {
      _handleAgencySearch();
    }
  }

  Future<void> _handleAgencySearch() async {
    final code = _agencyCodeController.text.trim();
    if (code.isEmpty) return;

    setState(() => _isSearchingAgency = true);
    final agency = await _api.searchAgencyByCode(code);
    setState(() {
      _verifiedAgency = agency;
      _isSearchingAgency = false;
    });
  }

  Future<void> _pickMedia(String type, {bool isPortfolio = false}) async {
    try {
      if (type == 'photo') {
        final photo = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
        if (photo != null) {
          setState(() {
            if (isPortfolio) {
              if (_portfolioPhotos.length < 3) _portfolioPhotos.add(photo);
            } else {
              _profilePhoto = photo;
            }
          });
        }
      } else if (type == 'video') {
        final video = await _picker.pickVideo(source: ImageSource.gallery, maxDuration: const Duration(seconds: 60));
        if (video != null) {
          setState(() => _introVideo = video);
        }
      }
    } catch (e) {
      _showError("Failed to pick media: $e");
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: Colors.redAccent,
      behavior: SnackBarBehavior.floating,
    ));
  }

  Future<void> _nextStep() async {
    if (_currentStep == 0) {
      if (_nameController.text.isEmpty || _ageController.text.isEmpty || _profilePhoto == null) {
        _showError("Please complete your profile details and photo");
        return;
      }
      final age = int.tryParse(_ageController.text) ?? 0;
      if (age < 18) {
        _showError("You must be 18+ to apply as a host");
        return;
      }
    } else if (_currentStep == 1) {
      if (_portfolioPhotos.length < 3 || _introVideo == null) {
        _showError("Please upload 3 portfolio photos and 1 intro video");
        return;
      }
    }

    if (_currentStep < 2) {
      setState(() => _currentStep++);
      _pageController.animateToPage(_currentStep, duration: const Duration(milliseconds: 400), curve: Curves.easeInOut);
    } else {
      _handleSubmit();
    }
  }

  Future<void> _handleSubmit() async {
    setState(() => _isLoading = true);
    try {
      // 1. Upload All Media
      final photoPaths = [_profilePhoto!.path, ..._portfolioPhotos.map((e) => e.path), _introVideo!.path];
      final urls = await _api.uploadHostMedia(photoPaths);
      
      if (urls.isEmpty) throw Exception("Failed to upload media");

      final profileUrl = urls[0];
      final portfolioUrls = urls.sublist(1, 4);
      final videoUrl = urls[4];

      // 2. Submit Application
      final res = await _api.submitHostApplication(
        fullName: _nameController.text.trim(),
        age: int.parse(_ageController.text),
        language: _selectedLanguage,
        photoUrl: profileUrl,
        portfolioUrls: portfolioUrls,
        videoUrl: videoUrl,
        agencyCode: _verifiedAgency?['agency_code'],
      );

      if (res['success'] == true) {
        // 3. Move to Face Verification
        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => const FaceVerificationScreen()),
          );
        }
      } else {
        throw Exception(res['error'] ?? "Submission failed");
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                _buildProgressBar(),
                Expanded(
                  child: PageView(
                    controller: _pageController,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      _buildStep1(),
                      _buildStep2(),
                      _buildStep3(),
                    ],
                  ),
                ),
                _buildFooterActions(),
              ],
            ),
          ),
          if (_isLoading)
            Container(
              color: Colors.black54,
              child: const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1))),
            ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Row(
        children: [
          GestureDetector(
            onTap: () {
              if (_currentStep > 0) {
                setState(() => _currentStep--);
                _pageController.previousPage(duration: const Duration(milliseconds: 400), curve: Curves.easeInOut);
              } else {
                Navigator.pop(context);
              }
            },
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
              child: const Icon(LucideIcons.chevronLeft, color: Colors.white, size: 20),
            ),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("Host Registration", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
              Text("Achieve Parity Step ${_currentStep + 1}/3", style: const TextStyle(color: Colors.white38, fontSize: 12)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProgressBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Row(
        children: List.generate(3, (index) {
          bool isDone = index < _currentStep;
          bool isActive = index == _currentStep;
          return Expanded(
            child: Container(
              height: 4,
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(
                color: isDone ? Colors.greenAccent : (isActive ? const Color(0xFF6366F1) : Colors.white12),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildStep1() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Basic Information", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          Center(
            child: GestureDetector(
              onTap: () => _pickMedia('photo'),
              child: Stack(
                children: [
                  Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: Colors.white10,
                      shape: BoxShape.circle,
                      border: Border.all(color: const Color(0xFF6366F1), width: 2),
                      image: _profilePhoto != null ? DecorationImage(image: FileImage(File(_profilePhoto!.path)), fit: BoxFit.cover) : null,
                    ),
                    child: _profilePhoto == null ? const Icon(LucideIcons.camera, color: Colors.white38, size: 32) : null,
                  ),
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: const BoxDecoration(color: Color(0xFF6366F1), shape: BoxShape.circle),
                      child: const Icon(LucideIcons.plus, size: 16, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          _buildTextField(_nameController, "Full Name", LucideIcons.user),
          const SizedBox(height: 16),
          _buildTextField(_ageController, "Age", LucideIcons.calendar, keyboardType: TextInputType.number),
          const SizedBox(height: 16),
          _buildLanguageDropdown(),
          const SizedBox(height: 32),
          Text("Agency Connection", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          _buildAgencyField(),
          if (_verifiedAgency != null)
            FadeInDown(
              child: Container(
                margin: const EdgeInsets.only(top: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.greenAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.greenAccent.withOpacity(0.2))),
                child: Row(
                  children: [
                    const Icon(LucideIcons.checkCircle, color: Colors.greenAccent, size: 16),
                    const SizedBox(width: 8),
                    Expanded(child: Text("Connected to ${_verifiedAgency!['name']}", style: const TextStyle(color: Colors.greenAccent, fontSize: 13))),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildStep2() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Media Portfolio", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const Text("Upload 3 photos and 1 intro video to proceed.", style: TextStyle(color: Colors.white38, fontSize: 12)),
          const SizedBox(height: 24),
          Text("Photos (3 Required)", style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 12, mainAxisSpacing: 12),
            itemCount: 3,
            itemBuilder: (context, index) {
              bool hasImage = index < _portfolioPhotos.length;
              return GestureDetector(
                onTap: () => _pickMedia('photo', isPortfolio: true),
                child: Container(
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white12)),
                  child: hasImage
                      ? Stack(
                          fit: StackFit.expand,
                          children: [
                            ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.file(File(_portfolioPhotos[index].path), fit: BoxFit.cover)),
                            Positioned(
                              top: 4,
                              right: 4,
                              child: GestureDetector(
                                onTap: () => setState(() => _portfolioPhotos.removeAt(index)),
                                child: Container(padding: const EdgeInsets.all(2), decoration: const BoxDecoration(color: Colors.redAccent, shape: BoxShape.circle), child: const Icon(LucideIcons.x, size: 12, color: Colors.white)),
                              ),
                            ),
                          ],
                        )
                      : const Icon(LucideIcons.imagePlus, color: Colors.white24),
                ),
              );
            },
          ),
          const SizedBox(height: 32),
          Text("Intro Video (Required)", style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => _pickMedia('video'),
            child: Container(
              width: double.infinity,
              height: 160,
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white12)),
              child: _introVideo == null
                  ? const Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(LucideIcons.video, color: Colors.white38, size: 32),
                        SizedBox(height: 8),
                        Text("Record or Upload Video", style: TextStyle(color: Colors.white38, fontSize: 13)),
                      ],
                    )
                  : Stack(
                      fit: StackFit.expand,
                      children: [
                        const Center(child: Icon(LucideIcons.playCircle, color: Colors.white, size: 48)),
                        Positioned(
                          top: 12,
                          right: 12,
                          child: GestureDetector(
                            onTap: () => setState(() => _introVideo = null),
                            child: Container(padding: const EdgeInsets.all(4), decoration: const BoxDecoration(color: Colors.redAccent, shape: BoxShape.circle), child: const Icon(LucideIcons.trash2, size: 16, color: Colors.white)),
                          ),
                        ),
                        const Positioned(
                          bottom: 12,
                          left: 12,
                          child: Text("Video Selected ✅", style: TextStyle(color: Colors.greenAccent, fontSize: 12, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStep3() {
    return FadeInUp(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(padding: const EdgeInsets.all(24), decoration: BoxDecoration(color: const Color(0xFF6366F1).withOpacity(0.1), shape: BoxShape.circle), child: const Icon(LucideIcons.shieldCheck, color: Color(0xFF6366F1), size: 64)),
              const SizedBox(height: 24),
              Text("Ready for Identity Check", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              const Text(
                "Your profile and media are ready. The final step is an AI Face Scan to ensure account security and platform integrity.",
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white54, fontSize: 14),
              ),
              const SizedBox(height: 32),
              _buildSummaryRow(LucideIcons.user, "Name", _nameController.text),
              _buildSummaryRow(LucideIcons.calendar, "Age", _ageController.text),
              _buildSummaryRow(LucideIcons.languages, "Language", _selectedLanguage.toUpperCase()),
              _buildSummaryRow(LucideIcons.building, "Agency", _verifiedAgency?['name'] ?? "None"),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSummaryRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, color: Colors.white38, size: 16),
          const SizedBox(width: 12),
          Text(label, style: const TextStyle(color: Colors.white38, fontSize: 13)),
          const Spacer(),
          Text(value, style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildFooterActions() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF6366F1),
            padding: const EdgeInsets.symmetric(vertical: 18),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            elevation: 8,
            shadowColor: const Color(0xFF6366F1).withOpacity(0.5),
          ),
          onPressed: _isLoading ? null : _nextStep,
          child: Text(
            _currentStep == 2 ? "START FACE VERIFICATION" : "CONTINUE",
            style: GoogleFonts.outfit(fontWeight: FontWeight.bold, letterSpacing: 1.2),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField(TextEditingController controller, String hint, IconData icon, {TextInputType? keyboardType}) {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white12)),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: Colors.white24, fontSize: 14),
          prefixIcon: Icon(icon, color: Colors.white38, size: 20),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.all(16),
        ),
      ),
    );
  }

  Widget _buildLanguageDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white12)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _selectedLanguage,
          dropdownColor: const Color(0xFF1E293B),
          style: const TextStyle(color: Colors.white),
          icon: const Icon(LucideIcons.chevronDown, color: Colors.white38, size: 18),
          onChanged: (v) => setState(() => _selectedLanguage = v!),
          items: _languages.map((l) {
            return DropdownMenuItem(
              value: l['code'],
              child: Row(
                children: [
                  Text(l['flag']!, style: const TextStyle(fontSize: 18)),
                  const SizedBox(width: 12),
                  Text(l['name']!),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildAgencyField() {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white12)),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _agencyCodeController,
              onChanged: (_) => setState(() => _verifiedAgency = null),
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                hintText: "Enter Agency Code (Optional)",
                hintStyle: TextStyle(color: Colors.white24, fontSize: 14),
                prefixIcon: Icon(LucideIcons.building, color: Colors.white38, size: 20),
                border: InputBorder.none,
                contentPadding: EdgeInsets.all(16),
              ),
            ),
          ),
          IconButton(
            onPressed: _handleAgencySearch,
            icon: _isSearchingAgency ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white38)) : const Icon(LucideIcons.search, color: Colors.white38, size: 20),
          ),
        ],
      ),
    );
  }
}
