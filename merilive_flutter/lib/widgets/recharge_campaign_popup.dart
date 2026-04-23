import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'dart:ui';
import '../services/campaign_service.dart';
import '../services/api_service.dart';

class CampaignTemplate {
  final String id;
  final String name;
  final List<Color> popupBg;
  final Color popupBorder;
  final List<Color> badgeBg;
  final Color badgeText;
  final Color titleColor;
  final Color subtitleColor;
  final Color priceColor;
  final Color bonusColor;
  final List<Color> buttonBg;
  final Color buttonText;
  final Color timerBg;
  final Color timerText;
  final Color glowColor;
  final String icon;

  CampaignTemplate({
    required this.id,
    required this.name,
    required this.popupBg,
    required this.popupBorder,
    required this.badgeBg,
    required this.badgeText,
    required this.titleColor,
    required this.subtitleColor,
    required this.priceColor,
    required this.bonusColor,
    required this.buttonBg,
    required this.buttonText,
    required this.timerBg,
    required this.timerText,
    required this.glowColor,
    required this.icon,
  });
}

final List<CampaignTemplate> campaignTemplates = [
  CampaignTemplate(
    id: "royal-gold",
    name: "Royal Gold",
    popupBg: [Color(0xFF1A1000), Color(0xFF2D1F00), Color(0xFF1A1000)],
    popupBorder: Color(0xFFF5A623),
    badgeBg: [Color(0xFFF5A623), Color(0xFFFFD700)],
    badgeText: Colors.black,
    titleColor: Color(0xFFFFD700),
    subtitleColor: Color(0xFFC9A84C),
    priceColor: Color(0xFFFFD700),
    bonusColor: Color(0xFF4ADE80),
    buttonBg: [Color(0xFFF5A623), Color(0xFFFFD700), Color(0xFFF5A623)],
    buttonText: Colors.black,
    timerBg: Color(0xFFF5A623).withOpacity(0.15),
    timerText: Color(0xFFFFD700),
    glowColor: Color(0xFFFFD700).withOpacity(0.3),
    icon: "👑",
  ),
  CampaignTemplate(
    id: "neon-purple",
    name: "Neon Purple",
    popupBg: [Color(0xFF0D0020), Color(0xFF1A0533), Color(0xFF0D0020)],
    popupBorder: Color(0xFFA855F7),
    badgeBg: [Color(0xFFA855F7), Color(0xFFD946EF)],
    badgeText: Colors.white,
    titleColor: Color(0xFFE0B3FF),
    subtitleColor: Color(0xFFA78BFA),
    priceColor: Color(0xFFD8B4FE),
    bonusColor: Color(0xFF34D399),
    buttonBg: [Color(0xFFA855F7), Color(0xFFD946EF), Color(0xFFA855F7)],
    buttonText: Colors.white,
    timerBg: Color(0xFFA855F7).withOpacity(0.15),
    timerText: Color(0xFFD8B4FE),
    glowColor: Color(0xFFA855F7).withOpacity(0.3),
    icon: "💎",
  ),
  CampaignTemplate(
    id: "midnight-blue",
    name: "Midnight Blue",
    popupBg: [Color(0xFF000820), Color(0xFF001233), Color(0xFF000820)],
    popupBorder: Color(0xFF3B82F6),
    badgeBg: [Color(0xFF3B82F6), Color(0xFF60A5FA)],
    badgeText: Colors.white,
    titleColor: Color(0xFF93C5FD),
    subtitleColor: Color(0xFF60A5FA),
    priceColor: Color(0xFF93C5FD),
    bonusColor: Color(0xFF4ADE80),
    buttonBg: [Color(0xFF2563EB), Color(0xFF3B82F6), Color(0xFF2563EB)],
    buttonText: Colors.white,
    timerBg: Color(0xFF3B82F6).withOpacity(0.15),
    timerText: Color(0xFF93C5FD),
    glowColor: Color(0xFF3B82F6).withOpacity(0.3),
    icon: "🌙",
  ),
  CampaignTemplate(
    id: "ruby-red",
    name: "Ruby Red",
    popupBg: [Color(0xFF1A0005), Color(0xFF330010), Color(0xFF1A0005)],
    popupBorder: Color(0xFFEF4444),
    badgeBg: [Color(0xFFEF4444), Color(0xFFF87171)],
    badgeText: Colors.white,
    titleColor: Color(0xFFFCA5A5),
    subtitleColor: Color(0xFFF87171),
    priceColor: Color(0xFFFCA5A5),
    bonusColor: Color(0xFFFBBF24),
    buttonBg: [Color(0xFFDC2626), Color(0xFFEF4444), Color(0xFFDC2626)],
    buttonText: Colors.white,
    timerBg: Color(0xFFEF4444).withOpacity(0.15),
    timerText: Color(0xFFFCA5A5),
    glowColor: Color(0xFFEF4444).withOpacity(0.3),
    icon: "🔥",
  ),
  CampaignTemplate(
    id: "emerald-luxe",
    name: "Emerald Luxe",
    popupBg: [Color(0xFF001A0D), Color(0xFF00331A), Color(0xFF001A0D)],
    popupBorder: Color(0xFF10B981),
    badgeBg: [Color(0xFF10B981), Color(0xFF34D399)],
    badgeText: Colors.black,
    titleColor: Color(0xFF6EE7B7),
    subtitleColor: Color(0xFF34D399),
    priceColor: Color(0xFF6EE7B7),
    bonusColor: Color(0xFFFBBF24),
    buttonBg: [Color(0xFF059669), Color(0xFF10B981), Color(0xFF059669)],
    buttonText: Colors.white,
    timerBg: Color(0xFF10B981).withOpacity(0.15),
    timerText: Color(0xFF6EE7B7),
    glowColor: Color(0xFF10B981).withOpacity(0.3),
    icon: "💚",
  ),
];

class RechargeCampaignPopup extends StatefulWidget {
  final Map<String, dynamic> campaign;

  const RechargeCampaignPopup({super.key, required this.campaign});

  @override
  State<RechargeCampaignPopup> createState() => _RechargeCampaignPopupState();
}

class _RechargeCampaignPopupState extends State<RechargeCampaignPopup> {
  String _popupView = 'main'; // 'main', 'payment'
  String _selectedTab = 'recommend'; // 'google', 'recommend'
  
  @override
  Widget build(BuildContext context) {
    final templateId = widget.campaign['template_id'] ?? 'royal-gold';
    final template = campaignTemplates.firstWhere((t) => t.id == templateId, orElse: () => campaignTemplates[0]);
    final campaignService = Provider.of<CampaignService>(context);

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 40),
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          // Background Glow
          Container(
            width: 320,
            height: 480,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: template.glowColor, blurRadius: 100, spreadRadius: 20)],
            ),
          ),
          
          // Main Container
          ClipRRect(
            borderRadius: BorderRadius.circular(32),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
              child: Container(
                width: 320,
                decoration: BoxDecoration(
                  gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: template.popupBg),
                  borderRadius: BorderRadius.circular(32),
                  border: Border.all(color: template.popupBorder.withOpacity(0.3), width: 1.5),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildTopShine(template),
                    _buildContent(template, campaignService),
                  ],
                ),
              ),
            ),
          ),
          
          // Close Button
          Positioned(
            top: 15, right: 15,
            child: GestureDetector(
              onTap: () => Navigator.pop(context),
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.1), shape: BoxShape.circle),
                child: Icon(LucideIcons.x, color: Colors.white.withOpacity(0.6), size: 16),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopShine(CampaignTemplate t) {
    return Container(
      height: 1,
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [Colors.transparent, t.popupBorder.withOpacity(0.4), Colors.transparent]),
      ),
    );
  }

  Widget _buildContent(CampaignTemplate t, CampaignService service) {
    if (_popupView == 'payment') return _buildPaymentView(t);

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: t.badgeBg),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              widget.campaign['badge_text'] ?? "LIMITED OFFER",
              style: GoogleFonts.inter(color: t.badgeText, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            widget.campaign['campaign_name']?.toUpperCase() ?? "SUPER SALE",
            style: GoogleFonts.inter(color: t.titleColor, fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(t.icon, style: const TextStyle(fontSize: 24)),
              const SizedBox(width: 10),
              Text(
                "${widget.campaign['diamonds_amount']}",
                style: GoogleFonts.inter(color: t.priceColor, fontSize: 32, fontWeight: FontWeight.w900),
              ),
            ],
          ),
          if ((widget.campaign['bonus_diamonds'] ?? 0) > 0)
            Text(
              "+${widget.campaign['bonus_diamonds']} BONUS (${widget.campaign['bonus_percentage'] ?? 0}%)",
              style: GoogleFonts.inter(color: t.bonusColor, fontSize: 12, fontWeight: FontWeight.w900),
            ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 20),
            decoration: BoxDecoration(color: t.timerBg, borderRadius: BorderRadius.circular(16)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.clock, color: Colors.orangeAccent, size: 16),
                const SizedBox(width: 8),
                Text(
                  _formatSeconds(service.remainingSeconds),
                  style: GoogleFonts.jetBrainsMono(color: t.timerText, fontSize: 14, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: () => setState(() => _popupView = 'payment'),
              style: ElevatedButton.styleFrom(padding: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)), elevation: 0),
              child: Container(
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: t.buttonBg),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [BoxShadow(color: t.popupBorder.withOpacity(0.4), blurRadius: 15, offset: const Offset(0, 5))],
                ),
                child: Text("BUY NOW", style: GoogleFonts.inter(color: t.buttonText, fontWeight: FontWeight.w900, letterSpacing: 1)),
              ),
            ),
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Text("NOT NOW", style: GoogleFonts.inter(color: t.subtitleColor.withOpacity(0.4), fontSize: 10, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentView(CampaignTemplate t) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(icon: Icon(LucideIcons.arrowLeft, color: t.subtitleColor, size: 18), onPressed: () => setState(() => _popupView = 'main')),
              Text("SELECT PAYMENT", style: GoogleFonts.inter(color: t.titleColor, fontSize: 12, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 16),
          _buildTabItem("recommend", "⭐", "RECOMMENDED", "Local Pay", t),
          const SizedBox(height: 12),
          _buildTabItem("google", "🎮", "GOOGLE PLAY", "One-tap", t),
          const SizedBox(height: 24),
          _buildPaymentContinueButton(t),
        ],
      ),
    );
  }

  Widget _buildTabItem(String id, String icon, String label, String sub, CampaignTemplate t) {
    bool isSelected = _selectedTab == id;
    return GestureDetector(
      onTap: () => setState(() => _selectedTab = id),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white.withOpacity(0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: isSelected ? Border.all(color: t.popupBorder.withOpacity(0.5)) : null,
        ),
        child: Row(
          children: [
            Text(icon, style: const TextStyle(fontSize: 24)),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                   Text(label, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 12)),
                   Text(sub, style: GoogleFonts.inter(color: Colors.white38, fontSize: 10)),
                ],
              ),
            ),
            if (isSelected) Icon(LucideIcons.checkCircle, color: t.popupBorder, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildPaymentContinueButton(CampaignTemplate t) {
     return SizedBox(
       width: double.infinity,
       height: 56,
       child: ElevatedButton(
         onPressed: () {
            Navigator.pop(context); // Close modal
            if (_selectedTab == 'google') {
               // Assuming in_app_purchase logic is handled globally or they need to go to recharge
               Navigator.pushNamed(context, '/shop');
            } else {
               // Recommended local helpers offline flow
               Navigator.pushNamed(context, '/recharge', arguments: widget.campaign);
            }
         },
         style: ElevatedButton.styleFrom(backgroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
         child: Text("CONTINUE", style: GoogleFonts.inter(color: Colors.black, fontWeight: FontWeight.w900)),
       ),
     );
  }

  String _formatSeconds(int totalSeconds) {
    if (totalSeconds <= 0) return "00:00";
    final m = totalSeconds ~/ 60;
    final s = totalSeconds % 60;
    return "${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}";
  }
}


