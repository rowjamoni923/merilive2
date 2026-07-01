import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:ui';
import 'dart:async';
import 'package:marquee/marquee.dart' as mq;
import '../../services/api_service.dart';
import '../../services/sound_service.dart';
import '../../utils/design_system.dart';

class TeenPattiScreen extends StatefulWidget {
  const TeenPattiScreen({super.key});

  @override
  State<TeenPattiScreen> createState() => _TeenPattiScreenState();
}

class _TeenPattiScreenState extends State<TeenPattiScreen> with TickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  final SoundService _soundService = SoundService();
  
  bool _isLoading = true;
  bool _isDealing = false;
  int _selectedChip = 500;
  String? _betHand; // 'A', 'B', or 'C'
  
  Map<String, List<CardModel>> _hands = {
    'A': [],
    'B': [],
    'C': [],
  };
  
  String _gameStatus = "PLACE YOUR BETS!";
  int _timerValue = 30;
  Timer? _gameTimer;

  @override
  void initState() {
    super.initState();
    _startTimer();
    _loadConfig();
  }

  void _startTimer() {
    _gameTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          if (_timerValue > 0) {
            _timerValue--;
          } else {
            _timerValue = 30;
            _clearTable();
          }
        });
      }
    });
  }

  void _clearTable() {
     setState(() {
       _hands = {'A': [], 'B': [], 'C': []};
       _betHand = null;
       _gameStatus = "PLACE YOUR BETS!";
     });
  }

  Future<void> _loadConfig() async {
    await Future.delayed(const Duration(milliseconds: 500));
    if (mounted) setState(() => _isLoading = false);
  }

  Future<void> _placeBet(String hand) async {
    if (_isDealing || _timerValue < 3) return;
    _soundService.playClick();
    
    setState(() {
      _betHand = hand;
      _isDealing = true;
      _gameStatus = "DEALING CARDS...";
    });

    final res = await _apiService.playSecureGame(gameId: 'teen_patti', amount: _selectedChip);

    if (!res['success']) {
       setState(() { _isDealing = false; _betHand = null; _gameStatus = res['error'] ?? "Error"; });
       return;
    }

    _soundService.playEffect('audio/games/card_shuffle.mp3');
    await Future.delayed(const Duration(milliseconds: 1000));

    final data = res['result_data'];
    if (mounted) {
      setState(() {
        _isDealing = false;
        _hands['A'] = (data['hand_a'] as List).map((c) => CardModel(suit: c['suit'], rank: c['rank'])).toList();
        _hands['B'] = (data['hand_b'] as List).map((c) => CardModel(suit: c['suit'], rank: c['rank'])).toList();
        _hands['C'] = (data['hand_c'] as List).map((c) => CardModel(suit: c['suit'], rank: c['rank'])).toList();
        
        bool won = res['is_win'] ?? false;
        _gameStatus = won ? "WINNER HAND $_betHand! 🎉" : "BET LOST! TRY AGAIN.";
      });
      
      if (res['is_win'] == true) _soundService.playWin();
      else _soundService.playEffect('audio/games/loss_low.mp3');
    }
  }

  @override
  void dispose() {
    _gameTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF450A0A),
      body: Stack(
        children: [
          _buildCasinoFeltBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                _buildWinnerTicker(),
                const Spacer(),
                _buildGameArena(),
                const Spacer(),
                _buildBettingControls(),
                const SizedBox(height: 10),
              ],
            ),
          ),
          if (_isLoading) _buildLoadingOverlay(),
        ],
      ),
    );
  }

  Widget _buildCasinoFeltBackground() {
    return Container(
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          colors: [Color(0xFF991B1B), Color(0xFF450A0A)],
          center: Alignment.center,
          radius: 1.2,
        ),
      ),
      child: CustomPaint(painter: PokerTablePainter(), child: Container()),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(icon: const Icon(LucideIcons.chevronLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          Column(
            children: [
              Text("PRO TEEN PATTI", style: GoogleFonts.lexend(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2)),
              Text("3 HANDS BETTING", style: GoogleFonts.inter(color: Colors.amberAccent, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
            ],
          ),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: const BoxDecoration(color: Colors.black26, shape: BoxShape.circle),
            child: const Icon(LucideIcons.info, color: Colors.white54, size: 18),
          ),
        ],
      ),
    );
  }

  Widget _buildWinnerTicker() {
    return Container(
      height: 32,
      width: double.infinity,
      color: Colors.black.withOpacity(0.3),
      child: mq.Marquee(
         text: "Sazzad won 50K gems on Hand A! • Maria won 10K gems on Hand B! • ProPlayer won 100K on Hand C!",
         style: GoogleFonts.inter(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w500),
         scrollAxis: Axis.horizontal,
         blankSpace: 50.0,
         velocity: 40.0,
      ),
    );
  }

  Widget _buildGameArena() {
    return Column(
      children: [
        Container(
          width: 60, height: 60,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: Colors.amberAccent, width: 3),
            boxShadow: [BoxShadow(color: Colors.amberAccent.withOpacity(0.2), blurRadius: 10)],
          ),
          child: Center(child: Text("$_timerValue", style: GoogleFonts.lexend(color: Colors.amberAccent, fontSize: 24, fontWeight: FontWeight.w900))),
        ),
        const SizedBox(height: 20),
        Text(_gameStatus, style: GoogleFonts.lexend(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
        const SizedBox(height: 30),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _buildHandArea('A', _hands['A']!),
            _buildHandArea('B', _hands['B']!),
            _buildHandArea('C', _hands['C']!),
          ],
        ),
      ],
    );
  }

  Widget _buildHandArea(String label, List<CardModel> cards) {
    return Column(
      children: [
        Text("HAND $label", style: GoogleFonts.inter(color: Colors.white54, fontSize: 10, fontWeight: FontWeight.w900)),
        const SizedBox(height: 10),
        SizedBox(
          width: 80,
          height: 100,
          child: Stack(
            children: cards.isEmpty
              ? [Positioned.fill(child: _buildEmptyCard())]
              : cards.asMap().entries.map((e) => Positioned(
                  left: e.key * 15.0,
                  top: e.key * 2.0,
                  child: _buildCardItem(e.value),
                )).toList(),
          ),
        ),
        const SizedBox(height: 10),
        _buildBetZone(label),
      ],
    );
  }

  Widget _buildBetZone(String hand) {
    bool isSelected = _betHand == hand;
    return GestureDetector(
      onTap: () => _placeBet(hand),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 90, height: 50,
        decoration: BoxDecoration(
          color: isSelected ? Colors.amberAccent.withOpacity(0.2) : Colors.black26,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isSelected ? Colors.amberAccent : Colors.white12, width: 2),
        ),
        child: Center(child: Text("BET $hand", style: GoogleFonts.lexend(color: isSelected ? Colors.amberAccent : Colors.white70, fontSize: 12, fontWeight: FontWeight.w900))),
      ),
    );
  }

  Widget _buildEmptyCard() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white10),
      ),
      child: const Center(child: Icon(LucideIcons.clover, color: Colors.white10, size: 24)),
    );
  }

  Widget _buildCardItem(CardModel card) {
    Color cardColor = (card.suit == 'HEARTS' || card.suit == 'DIAMONDS') ? Colors.red.shade900 : Colors.black87;
    return Container(
      width: 50, height: 75,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(6),
        boxShadow: [BoxShadow(color: Colors.black45, blurRadius: 4, offset: const Offset(2, 2))],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(card.rank, style: GoogleFonts.inter(color: cardColor, fontSize: 14, fontWeight: FontWeight.w900)),
          Text(_getSuitSymbol(card.suit), style: TextStyle(color: cardColor, fontSize: 18)),
        ],
      ),
    );
  }

  String _getSuitSymbol(String suit) {
    switch (suit.toUpperCase()) {
      case 'SPADES': return '♠';
      case 'HEARTS': return '♥';
      case 'DIAMONDS': return '♦';
      case 'CLUBS': return '♣';
      default: return suit;
    }
  }

  Widget _buildBettingControls() {
    final chips = [500, 1000, 5000, 10000, 20000];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.black38,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: chips.map((val) => GestureDetector(
              onTap: () => setState(() => _selectedChip = val),
              child: _buildChip(val, isSelected: _selectedChip == val),
            )).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildChip(int value, {required bool isSelected}) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: 55, height: 55,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: isSelected ? Colors.amberAccent : Colors.white10,
        boxShadow: isSelected ? [BoxShadow(color: Colors.amberAccent.withOpacity(0.5), blurRadius: 10)] : [],
        border: Border.all(color: Colors.white24, width: 2),
      ),
      child: Center(child: Text("${value ~/ 1000}k", style: GoogleFonts.lexend(color: isSelected ? Colors.black : Colors.white, fontSize: 12, fontWeight: FontWeight.w900))),
    );
  }

  Widget _buildLoadingOverlay() {
    return Container(color: Colors.black87, child: const Center(child: CircularProgressIndicator(color: Colors.amberAccent)));
  }
}

class PokerTablePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withOpacity(0.04)..style = PaintingStyle.stroke..strokeWidth = 2;
    canvas.drawOval(Rect.fromLTRB(20, 60, size.width - 20, size.height - 180), paint);
    canvas.drawOval(Rect.fromLTRB(40, 80, size.width - 40, size.height - 200), paint);
  }
  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}

class CardModel {
  final String suit;
  final String rank;
  CardModel({required this.suit, required this.rank});
}
