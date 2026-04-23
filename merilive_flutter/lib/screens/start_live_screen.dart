import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../widgets/nebula_background.dart';

class StartLiveScreen extends StatefulWidget {
  const StartLiveScreen({super.key});

  @override
  State<StartLiveScreen> createState() => _StartLiveScreenState();
}

class _StartLiveScreenState extends State<StartLiveScreen> {
  final ApiService _api = ApiService();
  final _titleController = TextEditingController();
  List<String> _selectedTags = [];
  String? _coverImageUrl;

  final List<String> _availableTags = ['Chat', 'Singing', 'Gaming', 'Dating', 'Dance'];

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(),
                  const SizedBox(height: 40),
                  _buildCoverSelector(),
                  const SizedBox(height: 32),
                  _buildSectionTitle("LIVE TITLE"),
                  _buildTitleInput(),
                  const SizedBox(height: 32),
                  _buildSectionTitle("TAGS"),
                  const SizedBox(height: 16),
                  _buildTagSelector(),
                  const SizedBox(height: 60),
                  _buildStartButton(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        GestureDetector(
          onTap: () => Navigator.pop(context),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
            child: const Icon(LucideIcons.chevronLeft, color: Colors.white),
          ),
        ),
        const SizedBox(width: 16),
        Text("Go Live", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: GoogleFonts.outfit(color: Colors.white54, fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 1.5),
    );
  }

  Widget _buildCoverSelector() {
    return Center(
      child: GestureDetector(
        onTap: () {
          // Image picker logic
        },
        child: Container(
          width: 150,
          height: 200,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white12),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(LucideIcons.camera, color: Colors.white24, size: 40),
              const SizedBox(height: 12),
              Text("Set Cover", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 14)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTitleInput() {
    return Container(
      margin: const EdgeInsets.only(top: 12),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
      child: TextField(
        controller: _titleController,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          hintText: "What are you doing today?",
          hintStyle: const TextStyle(color: Colors.white24),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.all(20),
        ),
      ),
    );
  }

  Widget _buildTagSelector() {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: _availableTags.map((tag) {
        final isSelected = _selectedTags.contains(tag);
        return GestureDetector(
          onTap: () {
            setState(() {
              if (isSelected) _selectedTags.remove(tag);
              else _selectedTags.add(tag);
            });
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: isSelected ? const Color(0xFF6366F1).withOpacity(0.2) : Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: isSelected ? const Color(0xFF6366F1) : Colors.white12),
            ),
            child: Text(tag, style: GoogleFonts.outfit(color: isSelected ? Colors.white : Colors.white54, fontSize: 14)),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildStartButton() {
    return GestureDetector(
      onTap: _handleStartLive,
      child: Container(
        width: double.infinity,
        height: 60,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFA855F7)]),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(color: const Color(0xFF6366F1).withOpacity(0.4), blurRadius: 20, offset: const Offset(0, 10)),
          ],
        ),
        child: Center(
          child: Text("GO LIVE NOW", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 2)),
        ),
      ),
    );
  }

  Future<void> _handleStartLive() async {
    if (_titleController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Please enter a title")));
      return;
    }
    try {
      await _api.startLiveStream(
        title: _titleController.text,
        coverUrl: _coverImageUrl ?? '',
        tags: _selectedTags,
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }
}


