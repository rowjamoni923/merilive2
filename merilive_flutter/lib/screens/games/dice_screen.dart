import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:ui';
import 'dart:math' as math;
import '../../services/api_service.dart';
import '../../services/sound_service.dart';
import '../../utils/financial_math.dart';
import '../../utils/design_system.dart';
import 'package:intl/intl.dart';

class DiceScreen extends StatefulWidget {
  const DiceScreen({super.key});

  @override
  State<DiceScreen> createState() => _DiceScreenState();
}

class _DiceScreenState extends State<DiceScreen> with TickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  final SoundService _soundService = SoundService();
  final _supabase = Supabase.instance.client;
  
  late AnimationController _shakeController;
  
  bool _isLoading = true;
  bool _isRolling = false;
  int _userWallet = 0;
  
  // Dynamic Config from Admin Panel
  Map<String, dynamic> _gameConfig = {};
  int _selectedBet = 1000;
  List<int> _betOptions = [1000, 5000, 10000, 50000];
  
  List<int> _diceValues = [1, 1, 1];
  String? _gameResultMessage;
  bool? _lastWin;
  final List<int> _history = [];

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
    _loadAll();
  }

  Future<void> _loadAll() async {
    final user = _supabase.auth.currentUser;
    if (user == null) return;

    // Parallel fetch for speed
    final results = await Future.wait<dynamic>([
      _apiService.getGameConfig('dice'),
      _supabase.from('profiles').select('coin_balance').eq('id', user.id).maybeSingle(),
    ]);

    if (mounted) {
      setState(() {
        _gameConfig = results[0] as Map<String, dynamic>;
        _betOptions = List<int>.from(_gameConfig['preset_bets'] ?? [1000, 5000, 10000, 50000]);
        _selectedBet = _betOptions.first;
        _userWallet = (results[1] as Map<String, dynamic>?)?['coin_balance'] ?? 0;
        _isLoading = false;
      });
    }
  }

  Future<void> _refreshWallet() async {
    final user = _supabase.auth.currentUser;
    if (user == null) return;
    final res = await _supabase.from('profiles').select('coin_balance').eq('id', user.id).maybeSingle();
    if (mounted && res != null) setState(() => _userWallet = res['coin_balance'] ?? 0);
  }

  @override
  void dispose() {
    _shakeController.dispose();
    super.dispose();
  }

  Future<void> _rollDice() async {
    if (_isRolling || _userWallet < _selectedBet) {
      if (_userWallet < _selectedBet) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Insufficient Diamonds!')));
      }
      return;
    }

    setState(() {
      _isRolling = true;
      _gameResultMessage = null;
      _lastWin = null;
    });

    // 1. Play Secure Game via Server-Side RPC (Step 1 Integration)
    final res = await _apiService.playSecureGame(
      gameId: 'dice', 
      amount: _selectedBet
    );
    
    if (!res['success']) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(res['error'] ?? 'Engine Error'),
          backgroundColor: Colors.redAccent,
        ));
        setState(() => _isRolling = false);
      }
      return;
    }

    // 2. Extract Server-Side Result
    final bool isWin = res['is_win'] ?? false;
    final int payout = (res['payout'] ?? 0).toInt();
    final int newBalance = (res['new_balance'] ?? _userWallet).toInt();
    final Map<String, dynamic> resultData = res['result_data'] ?? {};
    
    // Server determined dice value (e.g. 1-6)
    final int serverDiceValue = (resultData['dice_value'] ?? (math.Random().nextInt(6) + 1)).toInt();

    // Start Animation
    _soundService.playEffect('audio/games/dice_shake.mp3');
    _shakeController.repeat(reverse: true);

    // Simulate physical delay while we already have the result from server
    await Future.delayed(const Duration(seconds: 2));
    
    if (!mounted) return;
    _shakeController.stop();
    _soundService.playEffect('audio/games/dice_drop.mp3');

    // 3. Update State with Server Truth
    if (isWin) {
      _soundService.playWin();
    } else {
      _soundService.playEffect('audio/games/loss_low.mp3');
    }

    setState(() {
      // Show 3 dice but the total or one of them reflects the server logic
      // For visual parity we can randomize others if the server only sends one, 
      // but here we align with the server's dice_value
      _diceValues = [serverDiceValue, math.Random().nextInt(6)+1, math.Random().nextInt(6)+1];
      _userWallet = newBalance;
      _isRolling = false;
      _lastWin = isWin;
      _gameResultMessage = isWin ? "YOU WON $payout!" : "BETTER LUCK NEXT TIME!";
      
      final int total = _diceValues.reduce((a, b) => a + b);
      _history.insert(0, total);
      if (_history.length > 8) _history.removeLast();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(backgroundColor: Color(0xFF0F172A), body: Center(child: CircularProgressIndicator(color: Colors.redAccent)));

    return Scaffold(
      backgroundColor: App3DDesign.spaceDark,
      body: Stack(
        fit: StackFit.expand,
        children: [
          App3DDesign.buildAmbientGlow(context),
          Column(
             children: [
                 _buildHeader(),
                 const SizedBox(height: 20),
                 _buildHistoryRow(),
                 const Spacer(),
                 _buildDiceTable(),
                 _buildStatusSection(),
                 const Spacer(),
             ],
          ),
          Positioned(bottom: 0, left: 0, right: 0, child: _buildBettingFooter()),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          Column(
            children: [
              Text("DICE SMASH", style: GoogleFonts.inter(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2)),
              Text("PREMIUM ARENA", style: GoogleFonts.inter(color: Colors.redAccent, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
          _buildBalanceBadge(),
        ],
      ),
    );
  }

  Widget _buildBalanceBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: App3DDesign.glassDecoration(opacity: 0.1),
      child: Row(
        children: [
          App3DDesign.diamondIcon(size: 14),
          const SizedBox(width: 8),
          Text(NumberFormat('#,###').format(_userWallet), style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildHistoryRow() {
    return Container(
      height: 32,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 40),
        itemCount: _history.length,
        itemBuilder: (ctx, i) => Container(
          width: 32, margin: const EdgeInsets.only(right: 8),
          decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withOpacity(0.05), ),
          child: Center(child: Text("${_history[i]}", style: const TextStyle(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.bold))),
        ),
      ),
    );
  }

  Widget _buildDiceTable() {
    return AnimatedBuilder(
      animation: _shakeController,
      builder: (ctx, child) {
        final shake = _isRolling ? math.sin(_shakeController.value * math.pi * 15) * 8 : 0.0;
        return Transform.translate(
          offset: Offset(shake, 0),
          child: Column(
            children: [
              Image.asset(
                'assets/3d/dice.png',
                height: 180,
                fit: BoxFit.contain,
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: _diceValues.map((v) => _buildDice(v)).toList(),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDice(int val) {
    return Container(
      width: 64, height: 64, margin: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: Colors.white, borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: GridView.count(
        padding: const EdgeInsets.all(12),
        crossAxisCount: 3, physics: const NeverScrollableScrollPhysics(),
        children: List.generate(9, (i) {
          final active = [
            [], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]
          ][val].contains(i);
          return Container(margin: const EdgeInsets.all(2), decoration: BoxDecoration(shape: BoxShape.circle, color: active ? Colors.black87 : Colors.transparent));
        }),
      ),
    );
  }

  Widget _buildStatusSection() {
    if (_gameResultMessage == null) return const SizedBox(height: 60);
    return Padding(
      padding: const EdgeInsets.only(top: 40),
      child: Column(
        children: [
          Text(_lastWin == true ? "JACKPOT!" : "UNLUCKY", style: GoogleFonts.inter(color: _lastWin == true ? Colors.yellow : Colors.white24, fontWeight: FontWeight.w900, fontSize: 12, letterSpacing: 4)),
          const SizedBox(height: 8),
          Text(_gameResultMessage!, style: GoogleFonts.lexend(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildBettingFooter() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: App3DDesign.glassDecoration(opacity: 0.15).copyWith(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(36)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: _betOptions.map((v) => _betChip(v)).toList(),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity, height: 64,
            child: ElevatedButton(
              onPressed: _isRolling ? null : _rollDice,
              style: ElevatedButton.styleFrom(
                backgroundColor: _isRolling ? Colors.white10 : App3DDesign.accentPink,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(32)),
                elevation: 10,
                shadowColor: App3DDesign.accentPink.withOpacity(0.5),
              ),
              child: Text(_isRolling ? "ROLLING..." : "BET $_selectedBet", style: GoogleFonts.inter(fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 1)),
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _betChip(int val) {
    final active = _selectedBet == val;
    return GestureDetector(
      onTap: () { _soundService.playClick(); setState(() => _selectedBet = val); },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.symmetric(horizontal: 6),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: active ? Colors.redAccent : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(NumberFormat.compact().format(val), style: TextStyle(color: active ? Colors.white : Colors.white38, fontWeight: FontWeight.bold, fontSize: 13)),
      ),
    );
  }
}


