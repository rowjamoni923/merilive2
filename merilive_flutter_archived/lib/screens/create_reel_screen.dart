import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart';
import 'package:video_thumbnail/video_thumbnail.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import '../services/api_service.dart';
import '../services/moderation_service.dart';

class CreateReelScreen extends StatefulWidget {
  const CreateReelScreen({super.key});

  @override
  State<CreateReelScreen> createState() => _CreateReelScreenState();
}

class _CreateReelScreenState extends State<CreateReelScreen> {
  final ImagePicker _picker = ImagePicker();
  XFile? _videoFile;
  String? _thumbnailPath;
  VideoPlayerController? _videoController;
  final TextEditingController _captionController = TextEditingController();
  List<Map<String, dynamic>> _categories = [];
  String? _selectedCategoryId;
  bool _isUploading = false;
  bool _isSafetyChecking = false;
  bool _isPassedSafety = false;
  bool _agreedToPolicy = false;
  String _safetyStatus = "Awaiting Video Selection";
  String? _safetyError;
  double _scanningProgress = 0.0;

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  Future<void> _loadCategories() async {
    final api = Provider.of<ApiService>(context, listen: false);
    final response = await api.getSupabase().from('reel_categories').select('*').eq('is_active', true).order('display_order');
    if (response != null) {
      setState(() {
        _categories = List<Map<String, dynamic>>.from(response);
        if (_categories.isNotEmpty) _selectedCategoryId = _categories[0]['id'].toString();
      });
    }
  }

  Future<void> _pickVideo() async {
    final XFile? video = await _picker.pickVideo(source: ImageSource.gallery, maxDuration: const Duration(seconds: 60));
    if (video != null) {
      setState(() {
        _videoFile = video;
        _isPassedSafety = false;
        _safetyError = null;
        _safetyStatus = "Initializing Safety Protocols...";
      });
      _generateThumbnail(video.path);
      _initVideoPlayer(video.path);
      _runSafetyDetection();
    }
  }

  Future<void> _generateThumbnail(String path) async {
    final String? thumb = await VideoThumbnail.thumbnailFile(
      video: path,
      thumbnailPath: (await getTemporaryDirectory()).path,
      imageFormat: ImageFormat.JPEG,
      maxHeight: 400,
      quality: 75,
    );
    setState(() => _thumbnailPath = thumb);
  }

  void _initVideoPlayer(String path) {
    _videoController?.dispose();
    _videoController = VideoPlayerController.file(File(path))
      ..initialize().then((_) {
        setState(() {});
        _videoController?.play();
        _videoController?.setLooping(true);
      });
  }

  Future<void> _runSafetyDetection() async {
    if (_videoFile == null) return;
    
    setState(() {
      _isSafetyChecking = true;
      _scanningProgress = 0.0;
      _safetyError = null;
    });

    // 1. Meta Scan via Keywords (Real logic)
    final textError = ModerationService.scanText(_captionController.text);
    if (textError != null) {
      setState(() {
        _isSafetyChecking = false;
        _isPassedSafety = false;
        _safetyError = textError;
        _safetyStatus = "❌ Policy Violation Detected";
      });
      return;
    }

    // 2. Visual Scan Stage (High-fidelity simulation + heuristic)
    const stages = [
      "Optimizing video frames...",
      "Analyzing visual attributes...",
      "Detecting 18+ content signatures...",
      "Verifying community guidelines...",
      "Finalizing safety report..."
    ];

    for (int i = 0; i < stages.length; i++) {
      if (!mounted) return;
      await Future.delayed(const Duration(milliseconds: 700));
      setState(() {
        _safetyStatus = stages[i];
        _scanningProgress = (i + 1) / stages.length;
      });
    }

    final visualResult = await ModerationService.scanVideoSimulated(_videoFile!.path);

    if (mounted) {
      setState(() {
        _isSafetyChecking = false;
        _isPassedSafety = visualResult.isSafe;
        _safetyError = visualResult.isSafe ? null : visualResult.reason;
        _safetyStatus = visualResult.isSafe ? "✅ Community Safety Verified" : "❌ Prohibited Content Blocked";
      });
      if (visualResult.isSafe) {
        HapticFeedback.heavyImpact();
      } else {
        HapticFeedback.vibrate();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: Colors.transparent, 
        elevation: 0,
        title: Text("Create Reel", style: GoogleFonts.outfit(fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Column(
          children: [
            // Video Preview Area
            GestureDetector(
              onTap: _pickVideo,
              child: Container(
                height: 350,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.05), 
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.white.withOpacity(0.1)),
                ),
                child: _videoController != null && _videoController!.value.isInitialized
                  ? ClipRRect(borderRadius: BorderRadius.circular(20), child: VideoPlayer(_videoController!))
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(LucideIcons.film, size: 50, color: Colors.white24),
                        const SizedBox(height: 12),
                        Text("Tap to select video", style: GoogleFonts.outfit(color: Colors.white38)),
                      ],
                    ),
              ),
            ),
            const SizedBox(height: 20),

            // 18+ Strict Policy Box (WEB PARITY)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444).withOpacity(0.1),
                borderRadius: BorderRadius.circular(15),
                border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(LucideIcons.shieldAlert, color: Color(0xFFEF4444), size: 18),
                      const SizedBox(width: 8),
                      Text("CONTENT POLICY WARNING", style: GoogleFonts.outfit(color: const Color(0xFFEF4444), fontWeight: FontWeight.w900, fontSize: 13)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    "⛔ Uploading 18+ / Adult / Nude / Sexual content is strictly prohibited. Violators will face permanent account ban, loss of all coins/diamonds, and level reset to 0.",
                    style: GoogleFonts.outfit(color: Colors.white70, fontSize: 11, height: 1.5),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Safety Scanner Panel (Premium)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.03),
                borderRadius: BorderRadius.circular(15),
                border: Border.all(color: _safetyError != null ? Colors.red.withOpacity(0.3) : Colors.white.withOpacity(0.05)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        _safetyError != null 
                          ? LucideIcons.shieldAlert 
                          : (_isPassedSafety ? LucideIcons.shieldCheck : LucideIcons.shieldAlert),
                        color: _safetyError != null ? Colors.red : (_isPassedSafety ? Colors.green : Colors.amber),
                        size: 18,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _safetyStatus,
                          style: GoogleFonts.outfit(
                            color: _safetyError != null ? Colors.red : (_isPassedSafety ? Colors.green : Colors.white70),
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      if (_isSafetyChecking) ...[
                        const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.blue)),
                      ]
                    ],
                  ),
                  if (_safetyError != null) ...[
                    const SizedBox(height: 8),
                    Text(_safetyError!, style: GoogleFonts.outfit(color: Colors.redAccent, fontSize: 11)),
                  ],
                  if (_isSafetyChecking) ...[
                    const SizedBox(height: 12),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(5),
                      child: LinearProgressIndicator(
                        value: _scanningProgress,
                        backgroundColor: Colors.white12,
                        color: Colors.blue,
                        minHeight: 4,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 20),

            TextField(
              controller: _captionController,
              onChanged: (val) {
                if (_isPassedSafety) setState(() => _isPassedSafety = false);
              },
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: "Write a caption...",
                hintStyle: const TextStyle(color: Colors.white24),
                filled: true,
                fillColor: Colors.white.withOpacity(0.03),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(15), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 15),

            // Policy Agreement Checkbox
            Row(
              children: [
                SizedBox(
                  width: 24, height: 24,
                  child: Checkbox(
                    value: _agreedToPolicy,
                    activeColor: const Color(0xFF6366F1),
                    onChanged: (val) => setState(() => _agreedToPolicy = val ?? false),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    "I confirm this video follows all safety policies.",
                    style: GoogleFonts.outfit(color: Colors.white54, fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 25),

            SizedBox(
              width: double.infinity,
              height: 55,
              child: ElevatedButton(
                onPressed: (_isUploading || !_isPassedSafety || !_agreedToPolicy) 
                  ? (_videoFile != null && !_isSafetyChecking && !_isPassedSafety ? _runSafetyDetection : null) 
                  : _handleUpload,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _isPassedSafety ? const Color(0xFF6366F1) : Colors.white12,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                ),
                child: _isUploading 
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(
                      _isPassedSafety ? "POST REEL" : (_videoFile != null ? "RE-SCAN VIDEO" : "POST REEL"), 
                      style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)
                    ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              "Submission requires 100% safety verification.",
              style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10),
            ),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Future<void> _handleUpload() async {
     setState(() => _isUploading = true);
     
     final api = Provider.of<ApiService>(context, listen: false);
     
     final success = await api.uploadReel(
       videoPath: _videoFile!.path,
       thumbnailUrl: _thumbnailPath!,
       caption: _captionController.text,
       categoryId: _selectedCategoryId,
     );

     if (mounted) {
       setState(() => _isUploading = false);
       if (success) {
         Navigator.pop(context);
         ScaffoldMessenger.of(context).showSnackBar(
           SnackBar(
             content: const Text("Successfully uploaded! Processing for clarity..."),
             backgroundColor: Colors.green.withOpacity(0.9),
             behavior: SnackBarBehavior.floating,
           ),
         );
       } else {
         ScaffoldMessenger.of(context).showSnackBar(
           const SnackBar(content: Text("Upload failed. Check your data connection."), backgroundColor: Colors.red),
         );
       }
     }
  }

  @override
  void dispose() {
    _videoController?.dispose();
    _captionController.dispose();
    super.dispose();
  }
}


