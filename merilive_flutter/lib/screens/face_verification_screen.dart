import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider/path_provider.dart';
import '../services/api_service.dart';
import '../utils/face_utils.dart';

class FaceVerificationScreen extends StatefulWidget {
  const FaceVerificationScreen({super.key});

  @override
  State<FaceVerificationScreen> createState() => _FaceVerificationScreenState();
}

class _FaceVerificationScreenState extends State<FaceVerificationScreen> with TickerProviderStateMixin {
  CameraController? _controller;
  final ApiService _api = ApiService();
  bool _isInitialized = false;
  bool _isBusy = false;
  
  // Verification Flow Control
  int _currentFlowStep = 1; // 1, 2, or 3
  bool _isHostVerification = false;
  
  // Data State
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _ageController = TextEditingController();
  String _selectedLanguage = 'en';
  XFile? _profilePhoto;
  XFile? _introVideo;
  List<XFile> _hostPhotos = [];
  
  // Face Scan Logic
  bool _isRecording = false;
  int _currentPoseIdx = 0;
  List<bool> _stepsCompleted = [false, false, false, false, false];
  int _secondsElapsed = 0;
  Timer? _timer;
  Timer? _poseCheckTimer;
  String _scanningStatus = 'idle'; // idle, scanning, pass, fail
  List<Map<String, double>> _poseHistory = [];
  int _failedAttempts = 0;
  
  // Status Tracking
  String? _verificationStatus; // 'pending', 'verified', 'rejected', 'unverified'
  String? _rejectionReason;
  Map<String, dynamic>? _profile;
  String _targetCountry = 'Bangladesh';
  
  late AnimationController _scanningLineController;
  late AnimationController _pulseController;
  
  final List<Map<String, String>> _languages = [
    {'code': 'bn', 'name': 'Bengali', 'flag': '🇧🇩'},
    {'code': 'en', 'name': 'English', 'flag': '🇺🇸'},
    {'code': 'hi', 'name': 'Hindi', 'flag': '🇮🇳'},
    {'code': 'ar', 'name': 'Arabic', 'flag': '🇸🇦'},
    {'code': 'ur', 'name': 'Urdu', 'flag': '🇵🇰'},
    {'code': 'id', 'name': 'Indonesian', 'flag': '🇮🇩'},
  ];

  @override
  void initState() {
    super.initState();
    _loadInitialState();
    _scanningLineController = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat();
    _pulseController = AnimationController(vsync: this, duration: const Duration(seconds: 1))..repeat(reverse: true);
  }

  Future<void> _loadInitialState() async {
    setState(() => _isBusy = true);
    final p = await _api.getMyProfile();
    
    // Check submission status via Supabase
    final res = await _api.getSupabase()
        .from('face_verification_submissions')
        .select('*')
        .eq('user_id', _api.currentUserId ?? '')
        .order('created_at', ascending: false)
        .limit(1)
        .maybeSingle();

    if (mounted) {
      setState(() {
        _profile = p;
        _isHostVerification = p?['gender'] == 'female' || p?['gender'] == 'Female';
        _targetCountry = p?['country_name'] ?? 'Bangladesh';
        if (res != null) {
          _verificationStatus = res['status'];
          _rejectionReason = res['rejection_reason'];
        } else {
          _verificationStatus = 'unverified';
        }
        _isBusy = false;
      });
      if (_verificationStatus == 'unverified' || _verificationStatus == 'rejected') {
        _initializeCamera();
      }
    }
  }

  Future<void> _initializeCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) return;
      final front = cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.front, orElse: () => cameras.first);
      _controller = CameraController(front, ResolutionPreset.high, enableAudio: true, imageFormatGroup: ImageFormatGroup.jpeg);
      await _controller!.initialize();
      if (mounted) setState(() => _isInitialized = true);
    } catch (e) {
      debugPrint("Camera Initialization Error: $e");
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _poseCheckTimer?.cancel();
    _controller?.dispose();
    _scanningLineController.dispose();
    _pulseController.dispose();
    _nameController.dispose();
    _ageController.dispose();
    super.dispose();
  }

  // Localized Data (Parity with Web FaceVerification.tsx)
  List<Map<String, dynamic>> get _instructions {
    final country = _targetCountry.toLowerCase();
    if (country.contains('bangladesh')) {
      return [
        {'id': 'center', 'dir': 'সামনে তাকান', 'desc': 'মুখ সোজা রাখুন', 'icon': LucideIcons.scanFace},
        {'id': 'left', 'dir': 'বামে ঘুরুন', 'desc': 'মাথা বামে ঘোরান', 'icon': LucideIcons.arrowLeft},
        {'id': 'right', 'dir': 'ডানে ঘুরুন', 'desc': 'মাথা ডানে ঘোরান', 'icon': LucideIcons.arrowRight},
        {'id': 'up', 'dir': 'উপরে তাকান', 'desc': 'মাথা উপরে তুলুন', 'icon': LucideIcons.arrowUp},
        {'id': 'down', 'dir': 'নিচে তাকান', 'desc': 'মাথা নিচে নামান', 'icon': LucideIcons.arrowDown},
      ];
    }
    return [
      {'id': 'center', 'dir': 'Look Forward', 'desc': 'Keep face straight', 'icon': LucideIcons.scanFace},
      {'id': 'left', 'dir': 'Turn Left', 'desc': 'Turn head left', 'icon': LucideIcons.arrowLeft},
      {'id': 'right', 'dir': 'Turn Right', 'desc': 'Turn head right', 'icon': LucideIcons.arrowRight},
      {'id': 'up', 'dir': 'Look Up', 'desc': 'Tilt head up', 'icon': LucideIcons.arrowUp},
      {'id': 'down', 'dir': 'Look Down', 'desc': 'Tilt head down', 'icon': LucideIcons.arrowDown},
    ];
  }

  void _startVerificationScan() async {
    if (!_isInitialized) return;
    
    setState(() {
      _isRecording = true;
      _currentPoseIdx = 0;
      _stepsCompleted = [false, false, false, false, false];
      _secondsElapsed = 0;
      _scanningStatus = 'idle';
      _poseHistory = [];
    });

    try {
      await _controller!.startVideoRecording();
    } catch (e) {
      debugPrint("Recording Start Error: $e");
    }

    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      setState(() {
        _secondsElapsed++;
        if (_secondsElapsed >= 30) _finishVerification(false);
      });
    });

    _startPoseCheckingLoop();
  }

  void _startPoseCheckingLoop() {
    _poseCheckTimer = Timer.periodic(const Duration(milliseconds: 1500), (t) async {
      if (_isBusy || !_isRecording) return;
      _isBusy = true;

      try {
        final xFile = await _controller!.takePicture();
        final bytes = await File(xFile.path).readAsBytes();
        final base64Image = base64Encode(bytes);

        setState(() => _scanningStatus = 'scanning');
        
        final res = await _api.callFaceCheck(base64Image);
        if (res == null || res['faceDetected'] != true) {
          setState(() => _scanningStatus = 'fail');
          _isBusy = false;
          return;
        }

        final pose = res['pose'] ?? {'yaw': 0.0, 'pitch': 0.0};
        _poseHistory.add({'yaw': pose['yaw'].toDouble(), 'pitch': pose['pitch'].toDouble()});

        _validateCurrentPose(pose['yaw'].toDouble(), pose['pitch'].toDouble());
      } catch (e) {
        debugPrint("Pose API Error: $e");
      } finally {
        _isBusy = false;
      }
    });
  }

  void _validateCurrentPose(double yaw, double pitch) {
    final stepId = _instructions[_currentPoseIdx]['id'];
    bool passed = false;

    if (stepId == 'center') {
      if (yaw.abs() < 15 && pitch.abs() < 15) passed = true;
    } else if (stepId == 'left') {
      if (yaw > 18) passed = true;
    } else if (stepId == 'right') {
      if (yaw < -18) passed = true;
    } else if (stepId == 'up') {
      if (pitch < -12) passed = true;
    } else if (stepId == 'down') {
      if (pitch > 12) passed = true;
    }

    if (passed) {
      setState(() {
        _scanningStatus = 'pass';
        _stepsCompleted[_currentPoseIdx] = true;
        if (_currentPoseIdx < _instructions.length - 1) {
          _currentPoseIdx++;
        } else {
          _finishVerification(true);
        }
      });
    }
  }

  Future<void> _finishVerification(bool success) async {
    _timer?.cancel();
    _poseCheckTimer?.cancel();
    
    XFile? videoFile;
    if (_controller!.value.isRecordingVideo) {
      videoFile = await _controller!.stopVideoRecording();
    }

    setState(() {
      _isRecording = false;
      _scanningStatus = 'idle';
    });

    if (success) {
      // Anti-Spoof Pose History Variance Check (Master Parity Line 963)
      if (_poseHistory.length >= 3) {
        final yaws = _poseHistory.map((p) => p['yaw']!).toList();
        final pitches = _poseHistory.map((p) => p['pitch']!).toList();
        final yawVar = yaws.reduce((a, b) => a > b ? a : b) - yaws.reduce((a, b) => a < b ? a : b);
        final pitchVar = pitches.reduce((a, b) => a > b ? a : b) - pitches.reduce((a, b) => a < b ? a : b);
        
        if (yawVar < 5 && pitchVar < 5) {
          _showParityError("Static face detected. This is a security violation.");
          return;
        }
      }
      _submitFinal(videoFile);
    } else {
      setState(() => _failedAttempts++);
      _showParityError("Verification failed. Please follow instructions precisely.");
    }
  }

  Future<void> _submitFinal(XFile? faceVideo) async {
    setState(() => _isBusy = true);
    try {
      // 1. Take capture for matching
      final xPhoto = await _controller!.takePicture();
      final photoBytes = await File(xPhoto.path).readAsBytes();
      
      // 2. Duplicate Face Check (Master Parity Line 1126)
      final faceHash = FaceUtils.generateFaceHash(photoBytes);
      final duplicate = await _api.findAccountByFace(faceHash);
      
      if (duplicate != null && duplicate['user_id'] != _api.currentUserId) {
        // PERMANENT BAN (Master Parity Line 1142)
        await _api.enforceDuplicateFaceBan(
          duplicateUserId: duplicate['user_id'],
          duplicateUid: (duplicate as Map).containsKey('app_uid') ? duplicate['app_uid'] : null,
        );
        _showPermanentBanDialog(duplicate['display_name'] ?? 'Unknown');
        return;
      }

      // 3. Upload Media with strict validation (Master Parity Line 1273)
      if (faceVideo != null && (await File(faceVideo.path).length()) < 10000) {
        throw "Invalid video recorded. Please try again.";
      }

      String? profileUrl = await _api.uploadChatMedia(_profilePhoto!.path, 'face_verification');
      String? faceVideoUrl = faceVideo != null ? await _api.uploadChatMedia(faceVideo.path, 'face_verification') : null;
      String? introUrl = _introVideo != null ? await _api.uploadChatMedia(_introVideo!.path, 'face_verification') : null;
      
      List<String> hostPhotoUrls = [];
      if (_isHostVerification) {
        for (var p in _hostPhotos) {
          final url = await _api.uploadChatMedia(p.path, 'face_verification');
          if (url != null) hostPhotoUrls.add(url);
        }
      }

      // 4. Create Submission to face_verification_submissions table
      final res = await _api.createFaceVerificationSubmission(
        verificationType: _isHostVerification ? 'host' : 'user',
        fullName: _nameController.text,
        age: int.parse(_ageController.text),
        language: _selectedLanguage,
        profilePhotoUrl: profileUrl ?? '',
        faceVideoUrl: faceVideoUrl ?? '',
        introVideoUrl: introUrl,
        hostPhotos: hostPhotoUrls,
        faceHash: faceHash,
      );

      if (res['success'] == true) {
        setState(() => _verificationStatus = 'pending');
      } else {
        _showParityError(res['error'] ?? "Submission Error");
      }
    } catch (e) {
      _showParityError("System Error: $e");
    } finally {
      setState(() => _isBusy = false);
    }
  }

  void _showParityError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      backgroundColor: Colors.redAccent,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ));
  }

  void _showPermanentBanDialog(String existingName) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A0606),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text("SECURITY ALERT", style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
        content: Text("Duplicate face detected. This face is already registered with account: $existingName.\n\nYour account is now permanently banned for identity spoofing."),
        actions: [
          TextButton(
            onPressed: () => Navigator.popUntil(context, (route) => route.isFirst),
            child: const Text("EXIT SYSTEM", style: TextStyle(color: Colors.redAccent)),
          )
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_verificationStatus == 'pending') return _buildPendingScreen();
    if (_verificationStatus == 'verified') return _buildVerifiedScreen();
    if (_verificationStatus == 'rejected') return _buildRejectedScreen();
    
    return Scaffold(
      backgroundColor: const Color(0xFF0D0618),
      body: Stack(
        children: [
          if (_currentFlowStep == 3) _buildFaceScanUI()
          else _buildFormUI(),
          
          if (_isBusy) Container(color: Colors.black87, child: const Center(child: CircularProgressIndicator(color: Color(0xFF6D28D9)))),
        ],
      ),
    );
  }

  Widget _buildFormUI() {
    return SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(24),
            child: _buildHeader("VERIFY IDENTITY", "Step $_currentFlowStep of 3"),
          ),
          _buildProgressStepper(),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
              child: Column(
                children: [
                  if (_currentFlowStep == 1) _buildInfoForm(),
                  if (_currentFlowStep == 2) _buildMediaForm(),
                  const SizedBox(height: 100), // Action button space
                ],
              ),
            ),
          ),
          _buildActionFooter(),
        ],
      ),
    );
  }

  Widget _buildProgressStepper() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [1, 2, 3].map((step) {
          bool isActive = _currentFlowStep == step;
          bool isDone = _currentFlowStep > step;
          return Expanded(
            child: Row(
              children: [
                Container(
                  width: 35, height: 35,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isDone ? Colors.green : (isActive ? const Color(0xFF6D28D9) : Colors.white10),
                    border: Border.all(color: isActive ? Colors.purpleAccent : Colors.transparent),
                  ),
                  child: Center(
                    child: isDone ? const Icon(Icons.check, size: 18, color: Colors.white) : Text("$step", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ),
                if (step < 3) Expanded(child: Container(height: 2, color: isDone ? Colors.green : Colors.white10)),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildInfoForm() {
    return FadeInUp(
      child: Column(
        children: [
          const SizedBox(height: 20),
          _buildInput("Full Name", _nameController, LucideIcons.user),
          const SizedBox(height: 20),
          _buildInput("Age (Must be 18+)", _ageController, LucideIcons.calendar, isNumber: true),
          const SizedBox(height: 20),
          _buildLanguageSelector(),
          if (!_isHostVerification) ...[
            const SizedBox(height: 20),
            _buildPhotoPicker("Profile Photo", _profilePhoto, (file) => setState(() => _profilePhoto = file)),
          ],
        ],
      ),
    );
  }

  Widget _buildMediaForm() {
    return FadeInUp(
      child: Column(
        children: [
          if (_isHostVerification) ...[
            _buildPhotoPicker("Main Profile Photo", _profilePhoto, (file) => setState(() => _profilePhoto = file)),
            const SizedBox(height: 20),
            _buildVideoPicker("Introduction Video (15s)", _introVideo, (file) => setState(() => _introVideo = file)),
            const SizedBox(height: 20),
            _buildMultiPhotoPicker(),
          ] else ...[
            // User photo comparison note (Master Parity)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Colors.blue.withOpacity(0.1), borderRadius: BorderRadius.circular(15), border: Border.all(color: Colors.blue.withOpacity(0.2))),
              child: const Row(
                children: [
                  Icon(LucideIcons.info, color: Colors.blueAccent),
                  SizedBox(width: 15),
                  Expanded(child: Text("We will compare this photo with your live face scan to verify your identity.", style: TextStyle(color: Colors.blueAccent, fontSize: 13))),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildActionFooter() {
    bool canProceed = false;
    if (_currentFlowStep == 1) {
      bool infoOk = _nameController.text.isNotEmpty && _ageController.text.isNotEmpty && int.tryParse(_ageController.text) != null && int.parse(_ageController.text) >= 18;
      canProceed = _isHostVerification ? infoOk : (infoOk && _profilePhoto != null);
    } else if (_currentFlowStep == 2) {
      canProceed = _isHostVerification ? (_profilePhoto != null && _introVideo != null && _hostPhotos.length == 3) : true;
    }

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ElevatedButton(
            onPressed: canProceed ? () => setState(() => _currentFlowStep++) : null,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6D28D9),
              minimumSize: const Size(double.infinity, 60),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
              elevation: 8,
              shadowColor: const Color(0xFF6D28D9).withOpacity(0.3),
            ),
            child: Text(_currentFlowStep == 2 ? "START LIVE FACE SCAN" : "NEXT STEP", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          ),
          if (_currentFlowStep > 1)
            TextButton(
              onPressed: () => setState(() => _currentFlowStep--),
              child: const Text("Go Back", style: TextStyle(color: Colors.white38)),
            ),
        ],
      ),
    );
  }

  Widget _buildFaceScanUI() {
    if (!_isInitialized) return const Center(child: CircularProgressIndicator());
    
    return Stack(
      children: [
        Transform.scale(
          scale: 1.1,
          child: Center(
            child: AspectRatio(
              aspectRatio: 1 / _controller!.value.aspectRatio,
              child: CameraPreview(_controller!),
            ),
          ),
        ),
        _buildOvalOverlayUI(),
        SafeArea(
          child: Column(
            children: [
              _buildHeader("AI LIVENESS SCAN", _isRecording ? "Capturing Pose ${_currentPoseIdx + 1}/5" : "Position face in oval"),
              _buildScanProgressBar(),
              const Spacer(),
              _buildInstructionBannerUI(),
              const SizedBox(height: 40),
              if (!_isRecording) _buildScanActionFooter(),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildOvalOverlayUI() {
    final borderColor = _scanningStatus == 'pass' ? Colors.greenAccent : (_scanningStatus == 'fail' ? Colors.redAccent : (_scanningStatus == 'scanning' ? Colors.amberAccent : const Color(0xFFA855F7)));
    return Stack(
      children: [
        BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 3, sigmaY: 3),
          child: Container(color: Colors.black.withOpacity(0.5)),
        ),
        Center(
          child: Container(
            width: 280, height: 380,
            decoration: BoxDecoration(
              border: Border.all(color: borderColor, width: 4),
              borderRadius: BorderRadius.circular(140),
              boxShadow: [BoxShadow(color: borderColor.withOpacity(0.4), blurRadius: 30, spreadRadius: 2)],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(140),
              child: Stack(
                children: [
                  if (_isRecording && _scanningStatus == 'scanning')
                    AnimatedBuilder(
                      animation: _scanningLineController,
                      builder: (context, child) => Positioned(
                        top: _scanningLineController.value * 380,
                        left: 0, right: 0,
                        child: Container(height: 3, decoration: BoxDecoration(gradient: LinearGradient(colors: [Colors.cyanAccent.withOpacity(0), Colors.cyanAccent, Colors.cyanAccent.withOpacity(0)]))),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildScanProgressBar() {
    if (!_isRecording) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 10),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text("AI POSE VALIDATION", style: TextStyle(color: Colors.white54, fontSize: 10, fontWeight: FontWeight.bold)),
              Text("${30 - _secondsElapsed}s left", style: const TextStyle(color: Colors.redAccent, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 5),
          LinearProgressIndicator(
            value: _stepsCompleted.where((e) => e).length / 5,
            backgroundColor: Colors.white10,
            valueColor: const AlwaysStoppedAnimation(Color(0xFF6D28D9)),
            minHeight: 6,
          ),
        ],
      ),
    );
  }

  Widget _buildInstructionBannerUI() {
    if (!_isRecording) return const SizedBox.shrink();
    final instr = _instructions[_currentPoseIdx];
    return FadeInDown(
      key: ValueKey(_currentPoseIdx),
      child: Container(
        padding: const EdgeInsets.all(20),
        margin: const EdgeInsets.symmetric(horizontal: 40),
        decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 10)]),
        child: Row(
          children: [
            Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: Colors.purple.withOpacity(0.2), shape: BoxShape.circle), child: Icon(instr['icon'], color: Colors.purpleAccent)),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(instr['dir'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                  Text(instr['desc'], style: const TextStyle(color: Colors.white38, fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildScanActionFooter() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Column(
        children: [
          ElevatedButton(
            onPressed: _startVerificationScan,
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6D28D9), minimumSize: const Size(double.infinity, 65), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
            child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(LucideIcons.play), SizedBox(width: 15), Text("START SCAN", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18))]),
          ),
          const SizedBox(height: 15),
          TextButton(onPressed: () => setState(() => _currentFlowStep = 2), child: const Text("Go Back", style: TextStyle(color: Colors.white38))),
        ],
      ),
    );
  }

  // --- Header & Generic Widgets ---
  Widget _buildHeader(String title, String sub) {
    return Row(
      children: [
        IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
        const SizedBox(width: 15),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 22)),
          Text(sub, style: const TextStyle(color: Colors.white38, fontSize: 12)),
        ]),
      ],
    );
  }

  Widget _buildInput(String label, TextEditingController ctrl, IconData icon, {bool isNumber = false}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: Colors.white70, fontSize: 14)),
      const SizedBox(height: 10),
      TextField(
        controller: ctrl,
        keyboardType: isNumber ? TextInputType.number : TextInputType.text,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          prefixIcon: Icon(icon, color: Colors.white38),
          filled: true,
          fillColor: Colors.white.withOpacity(0.05),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(15), borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(15), borderSide: const BorderSide(color: Color(0xFF6D28D9))),
        ),
      ),
    ]);
  }

  Widget _buildLanguageSelector() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text("Verification Language", style: TextStyle(color: Colors.white70, fontSize: 14)),
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(15), border: Border.all(color: Colors.white.withOpacity(0.1))),
        child: DropdownButton<String>(
          value: _selectedLanguage,
          isExpanded: true,
          dropdownColor: const Color(0xFF1A0A2E),
          underline: const SizedBox(),
          style: const TextStyle(color: Colors.white),
          items: _languages.map((l) => DropdownMenuItem(value: l['code']!, child: Text("${l['flag']} ${l['name']}"))).toList(),
          onChanged: (val) => setState(() => _selectedLanguage = val!),
        ),
      ),
    ]);
  }

  Widget _buildPhotoPicker(String label, XFile? file, Function(XFile) onPicked) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: Colors.white70, fontSize: 14)),
      const SizedBox(height: 10),
      GestureDetector(
        onTap: () async {
          final xFile = await _controller!.takePicture();
          onPicked(xFile);
        },
        child: Container(
          height: 150, width: double.infinity,
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.1))),
          child: file == null ? const Icon(LucideIcons.camera, color: Colors.white38, size: 50) : ClipRRect(borderRadius: BorderRadius.circular(20), child: Image.file(File(file.path), fit: BoxFit.cover)),
        ),
      ),
    ]);
  }

  Widget _buildVideoPicker(String label, XFile? file, Function(XFile) onPicked) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: Colors.white70, fontSize: 14)),
      const SizedBox(height: 10),
      Row(
        children: [
          Expanded(
            child: GestureDetector(
              onTap: () async {
                setState(() => _isBusy = true);
                await _controller!.startVideoRecording();
                await Future.delayed(const Duration(seconds: 15));
                final res = await _controller!.stopVideoRecording();
                setState(() => _isBusy = false);
                onPicked(res);
              },
              child: Container(
                height: 120,
                decoration: BoxDecoration(color: Colors.red.withOpacity(0.1), borderRadius: BorderRadius.circular(15), border: Border.all(color: Colors.red.withOpacity(0.2))),
                child: const Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(LucideIcons.film, color: Colors.redAccent), SizedBox(height: 10), Text("Record 15s", style: TextStyle(color: Colors.redAccent))]),
              ),
            ),
          ),
          const SizedBox(width: 15),
          Expanded(
            child: Container(
              height: 120,
              decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(15), border: Border.all(color: Colors.white10)),
              child: file == null ? const Center(child: Text("Or Pick Video", style: TextStyle(color: Colors.white38))) : const Icon(Icons.check_circle, color: Colors.green),
            ),
          ),
        ],
      ),
    ]);
  }

  Widget _buildMultiPhotoPicker() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text("Gallery Photos (3 Required)", style: TextStyle(color: Colors.white70, fontSize: 14)),
      const SizedBox(height: 10),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(3, (idx) => GestureDetector(
          onTap: () async {
            final xFile = await _controller!.takePicture();
            setState(() {
              if (_hostPhotos.length > idx) _hostPhotos[idx] = xFile;
              else _hostPhotos.add(xFile);
            });
          },
          child: Container(
            width: 85, height: 85,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(15), border: Border.all(color: Colors.white.withOpacity(0.1))),
            child: _hostPhotos.length > idx ? ClipRRect(borderRadius: BorderRadius.circular(15), child: Image.file(File(_hostPhotos[idx].path), fit: BoxFit.cover)) : const Icon(LucideIcons.image, color: Colors.white38),
          ),
        )),
      ),
    ]);
  }

  // --- Final Screens (Parity with Web JSX) ---
  Widget _buildPendingScreen() {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0618),
      body: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(LucideIcons.loader2, color: Colors.amber, size: 90).animate().rotate(duration: const Duration(seconds: 2)),
          const SizedBox(height: 30),
          const Text("UNDER REVIEW", style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 40), child: Text("Your identity verification has been submitted and is pending admin review. Please check back later.", textAlign: TextAlign.center, style: TextStyle(color: Colors.white54))),
          const SizedBox(height: 50),
          ElevatedButton(onPressed: () => Navigator.pop(context), style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6D28D9), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)), minimumSize: const Size(200, 50)), child: const Text("BACK TO PROFILE")),
        ]),
      ),
    );
  }

  Widget _buildVerifiedScreen() {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0618),
      body: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(LucideIcons.checkCircle2, color: Colors.greenAccent, size: 90).animate().scale(),
          const SizedBox(height: 30),
          const Text("ALREADY VERIFIED!", style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          const Text("Your identity check is complete and verified.", style: TextStyle(color: Colors.white54)),
          const SizedBox(height: 50),
          ElevatedButton(onPressed: () => Navigator.pop(context), style: ElevatedButton.styleFrom(backgroundColor: Colors.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)), minimumSize: const Size(200, 50)), child: const Text("GO BACK")),
        ]),
      ),
    );
  }

  Widget _buildRejectedScreen() {
    bool isContactSupportRequired = _rejectionReason?.toLowerCase().contains('support') == true || _rejectionReason?.toLowerCase().contains('contact us') == true;

    return Scaffold(
      backgroundColor: const Color(0xFF1A0606),
      body: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(LucideIcons.xCircle, color: Colors.redAccent, size: 90).animate().shake(),
          const SizedBox(height: 30),
          const Text("VERIFICATION REJECTED", style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 40), child: Text("Reason: ${_rejectionReason ?? 'Incomplete data or spoofing attempt.'}", textAlign: TextAlign.center, style: const TextStyle(color: Colors.redAccent, fontSize: 13))),
          const SizedBox(height: 50),
          if (isContactSupportRequired) ...[
            ElevatedButton(
              onPressed: () => Navigator.pushNamed(context, '/support'),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)), minimumSize: const Size(220, 55)),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [Icon(LucideIcons.messageSquare), SizedBox(width: 10), Text("💬 Support Chat", style: TextStyle(fontWeight: FontWeight.bold))]),
            ),
          ] else ...[
            ElevatedButton(onPressed: () => setState(() => _verificationStatus = 'unverified'), style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)), minimumSize: const Size(200, 55)), child: const Text("TRY AGAIN", style: TextStyle(fontWeight: FontWeight.bold))),
          ],
          const SizedBox(height: 15),
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("Cancel", style: TextStyle(color: Colors.white38))),
        ]),
      ),
    );
  }
}
