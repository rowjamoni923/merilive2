import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';

class BeautyPanel extends StatefulWidget {
  final Function(String? filter, double intensity) onFilterSelected;
  final Function(String? sticker) onStickerSelected;
  final Function(double smooth, double whiten, double slim) onRetouchChanged;

  const BeautyPanel({
    super.key,
    required this.onFilterSelected,
    required this.onStickerSelected,
    required this.onRetouchChanged,
  });

  @override
  State<BeautyPanel> createState() => _BeautyPanelState();
}

class _BeautyPanelState extends State<BeautyPanel> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String? _selectedFilterId = 'None';
  String? _selectedStickerId = 'None';
  
  double _filterIntensity = 0.8;
  double _smoothValue = 0.5;
  double _whitenValue = 0.3;
  double _slimValue = 0.0;

  final List<Map<String, dynamic>> _filters = [
    {'id': 'None', 'name': 'Original', 'color': Colors.grey},
    {'id': 'Natural', 'name': 'Natural', 'color': Colors.orangeAccent},
    {'id': 'Bright', 'name': 'Bright', 'color': Colors.white},
    {'id': 'Rosy', 'name': 'Rosy', 'color': Colors.pinkAccent},
    {'id': 'Fresh', 'name': 'Fresh', 'color': Colors.cyanAccent},
    {'id': 'Cinema', 'name': 'Cinema', 'color': Colors.blueGrey},
    {'id': 'Clear', 'name': 'Clear', 'color': Colors.indigoAccent},
  ];

  final List<Map<String, dynamic>> _stickers = [
    {'id': 'None', 'name': 'None', 'emoji': '🚫'},
    {'id': 'Crown', 'name': 'Crown', 'emoji': '👑'},
    {'id': 'Heart', 'name': 'Love', 'emoji': '💖'},
    {'id': 'Star', 'name': 'Glow', 'emoji': '✨'},
    {'id': 'Cat', 'name': 'Cat', 'emoji': '🐱'},
    {'id': 'Angel', 'name': 'Angel', 'emoji': '😇'},
    {'id': 'Fire', 'name': 'Hot', 'emoji': '🔥'},
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 420,
      decoration: BoxDecoration(
        color: const Color(0xFF0F0C29).withOpacity(0.92),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(36)),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(36)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 25, sigmaY: 25),
          child: Column(
            children: [
              const SizedBox(height: 12),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
              
              const SizedBox(height: 8),
              TabBar(
                controller: _tabController,
                indicatorColor: const Color(0xFFD946EF),
                indicatorWeight: 3,
                labelColor: Colors.white,
                unselectedLabelColor: Colors.white38,
                labelStyle: GoogleFonts.inter(fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 1),
                tabs: const [
                  Tab(text: "RETCH"),
                  Tab(text: "BEAUTY"),
                  Tab(text: "FILTER"),
                  Tab(text: "STICKER"),
                ],
              ),

              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      _buildRetouchTab(),
                      _buildBeautyTab(),
                      _buildFilterTab(),
                      _buildStickerTab(),
                    ],
                  ),
                ),
              ),

              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton.icon(
                      onPressed: _resetAll,
                      icon: const Icon(LucideIcons.rotateCcw, size: 14, color: Colors.white54),
                      label: Text("RESET", style: GoogleFonts.inter(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w900)),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.pop(context),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                        decoration: BoxDecoration(color: const Color(0xFFD946EF), borderRadius: BorderRadius.circular(20)),
                        child: Text("DONE", style: GoogleFonts.inter(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900)),
                      ),
                    )
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _resetAll() {
    setState(() {
      _selectedFilterId = 'None';
      _selectedStickerId = 'None';
      _smoothValue = 0.5;
      _whitenValue = 0.3;
      _slimValue = 0.0;
      _filterIntensity = 0.8;
    });
    widget.onFilterSelected(null, 0.8);
    widget.onStickerSelected(null);
    widget.onRetouchChanged(0.5, 0.3, 0.0);
  }

  Widget _buildRetouchTab() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          _buildSliderRow(LucideIcons.user, "Smooth", _smoothValue, (val) {
            setState(() => _smoothValue = val);
            widget.onRetouchChanged(_smoothValue, _whitenValue, _slimValue);
          }),
          const SizedBox(height: 20),
          _buildSliderRow(LucideIcons.sun, "Whiten", _whitenValue, (val) {
            setState(() => _whitenValue = val);
            widget.onRetouchChanged(_smoothValue, _whitenValue, _slimValue);
          }),
        ],
      ),
    );
  }

  Widget _buildBeautyTab() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          _buildSliderRow(LucideIcons.smile, "Slim", _slimValue, (val) {
            setState(() => _slimValue = val);
            widget.onRetouchChanged(_smoothValue, _whitenValue, _slimValue);
          }),
          const SizedBox(height: 20),
          _buildSliderRow(LucideIcons.eye, "Big Eyes", 0.0, (val) {}),
        ],
      ),
    );
  }

  Widget _buildFilterTab() {
    return Column(
      children: [
        if (_selectedFilterId != 'None')
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
            child: _buildSliderRow(LucideIcons.droplets, "Intensity", _filterIntensity, (val) {
              setState(() => _filterIntensity = val);
              widget.onFilterSelected(_selectedFilterId, _filterIntensity);
            }),
          ),
        Expanded(
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _filters.length,
            itemBuilder: (context, index) {
              final f = _filters[index];
              final isSelected = _selectedFilterId == f['id'];
              return GestureDetector(
                onTap: () {
                  setState(() => _selectedFilterId = f['id']);
                  widget.onFilterSelected(f['id'] == 'None' ? null : f['id'], _filterIntensity);
                },
                child: Container(
                  margin: const EdgeInsets.only(right: 18),
                  child: Column(
                    children: [
                      Container(
                        width: 60, height: 60,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: isSelected ? const Color(0xFFD946EF) : Colors.white10, width: 2),
                          image: f['id'] == 'None' ? null : const DecorationImage(image: NetworkImage('https://i.pravatar.cc/100?u=filter'), fit: BoxFit.cover),
                          color: f['id'] == 'None' ? Colors.white10 : null,
                        ),
                        child: isSelected ? Container(decoration: BoxDecoration(color: const Color(0xFFD946EF).withOpacity(0.4), shape: BoxShape.circle), child: const Icon(LucideIcons.check, color: Colors.white, size: 20)) : null,
                      ),
                      const SizedBox(height: 10),
                      Text(f['name'], style: GoogleFonts.inter(color: isSelected ? Colors.white : Colors.white54, fontSize: 11, fontWeight: isSelected ? FontWeight.w900 : FontWeight.w500)),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildStickerTab() {
    return GridView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, mainAxisSpacing: 15, crossAxisSpacing: 15),
      itemCount: _stickers.length,
      itemBuilder: (context, index) {
        final s = _stickers[index];
        final isSelected = _selectedStickerId == s['id'];
        return GestureDetector(
          onTap: () {
            setState(() => _selectedStickerId = s['id']);
            widget.onStickerSelected(s['id'] == 'None' ? null : s['id']);
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            decoration: BoxDecoration(
              color: isSelected ? const Color(0xFFD946EF).withOpacity(0.15) : Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: isSelected ? const Color(0xFFD946EF) : Colors.white10, width: 1.5),
            ),
            alignment: Alignment.center,
            child: Text(s['emoji'], style: const TextStyle(fontSize: 24)),
          ),
        );
      },
    );
  }

  Widget _buildSliderRow(IconData icon, String label, double value, Function(double) onChanged) {
    return Row(
      children: [
        Icon(icon, color: Colors.white60, size: 16),
        const SizedBox(width: 12),
        SizedBox(width: 65, child: Text(label, style: GoogleFonts.inter(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold))),
        Expanded(
          child: SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: const Color(0xFFD946EF),
              inactiveTrackColor: Colors.white.withOpacity(0.05),
              trackHeight: 3,
              thumbColor: Colors.white,
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
            ),
            child: Slider(value: value, onChanged: onChanged),
          ),
        ),
        SizedBox(width: 30, child: Text("${(value * 100).toInt()}", style: GoogleFonts.inter(color: const Color(0xFFD946EF), fontSize: 12, fontWeight: FontWeight.w900), textAlign: TextAlign.right)),
      ],
    );
  }
}


