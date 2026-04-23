import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import 'package:pinput/pinput.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../services/admin_controller_service.dart';
import '../../services/api_service.dart';
import 'dart:ui' as ui;
import '../../services/auth_service.dart';
import '../../services/device_service.dart';
import '../../data/country_codes.dart';
import '../../widgets/auth/phone_sign_in_button.dart';
import '../../widgets/auth/gender_selection_modal.dart';

enum AuthStep { start, genderName, email, emailOtp, emailPassword, emailPasswordLogin, phoneInput, phoneOtp, phonePassword }

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with TickerProviderStateMixin {
  bool _isAutoRecovering = true;
  Map<String, dynamic>? _lastUser;
  Map<String, dynamic>? _agencyInfo;
  bool _showReferralInput = false;
  String _manualReferralCode = "";
  final _referralController = TextEditingController();

  late AnimationController _pulseController;
  Map<String, dynamic>? _brandingData;

  @override
  void initState() {
    super.initState();
    _fetchBranding();
    _checkLastUser();
    _performAutoRecovery();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat(reverse: true);
  }

  Future<void> _checkLastUser() async {
    // Web Parity: Check for last logged in user in local storage
    try {
      final supa = Supabase.instance.client;
      final session = supa.auth.currentSession;
      if (session != null) return; // Already logged in

      // Mocking local storage check for now, in a real app use shared_preferences
      // final prefs = await SharedPreferences.getInstance();
      // final lastUserData = prefs.getString('meri_last_user');
      // if (lastUserData != null) setState(() => _lastUser = json.decode(lastUserData));
    } catch (e) {
      debugPrint("Last user check error: $e");
    }
  }

  Future<void> _performAutoRecovery() async {
    setState(() => _isAutoRecovering = true);
    try {
      final auth = Provider.of<AuthService>(context, listen: false);
      
      // 1. Check for active session
      if (auth.isAuthenticated) {
        _navigateToHome();
        return;
      }

      // 2. Check for device account (deterministic recovery)
      final exists = await auth.checkDeviceAccountExists();
      if (exists) {
        // If device account exists, we could auto-login or just show the Start button
        // React web app shows the Start button which then triggers loginWithDevice
      }
      
      // 3. Check for pending referral in deep link/storage
      // final prefs = await SharedPreferences.getInstance();
      // final pendingRef = prefs.getString('meri_pending_referral');
      // if (pendingRef != null) _fetchAgencyInfo(pendingRef);

    } catch (e) {
      debugPrint("Auto recovery error: $e");
    } finally {
      if (mounted) setState(() => _isAutoRecovering = false);
    }
  }

  Future<void> _fetchAgencyInfo(String code) async {
    try {
      final supa = Supabase.instance.client;
      final res = await supa.from('agencies').select('*').eq('agency_code', code).maybeSingle();
      if (res != null) {
        setState(() => _agencyInfo = res);
      }
    } catch (e) {
      debugPrint("Agency fetch error: $e");
    }
  }

  Future<void> _fetchBranding() async {
    // [FIX] Use AdminControllerService as the single source of truth for branding
    final admin = Provider.of<AdminControllerService>(context, listen: false);
    if (mounted) setState(() => _brandingData = admin.branding);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      backgroundColor: Colors.redAccent,
      content: Text(msg, style: const TextStyle(color: Colors.white)),
    ));
  }

  void _showSuccess(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      backgroundColor: Colors.green,
      content: Text(msg, style: const TextStyle(color: Colors.white)),
    ));
  }

  // --- DEVICE LOGIC (Start Button) ---

  Future<void> _handleStartClick() async {
    if (!_agreed) {
      _showError("Please agree to User Agreement and Privacy Policy to continue.");
      return;
    }
    setState(() => _isLoading = true);
    try {
      final auth = Provider.of<AuthService>(context, listen: false);
      final exists = await auth.checkDeviceAccountExists();
      if (exists) {
        final success = await auth.loginWithDevice();
        if (success) _navigateToHome();
        else _showError("Login failed. Please try again.");
      } else {
        // [FIX] New device: Ensure we ask for Gender/Name first
        setState(() => _currentStep = AuthStep.genderName);
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _completeDeviceRegistration() async {
    if (_nameController.text.trim().isEmpty) { _showError("Please enter your name"); return; }
    if (_selectedGender == null) { _showError("Please select your gender"); return; }
    setState(() => _isLoading = true);
    try {
      final auth = Provider.of<AuthService>(context, listen: false);
      final success = await auth.loginWithDevice(); 
      if (success) {
        final user = Supabase.instance.client.auth.currentUser;
        if (user != null) {
          // Update profile with gender and name
          final isHost = _selectedGender == 'female';
          await Supabase.instance.client.from('profiles').update({
            'gender': _selectedGender,
            'display_name': _nameController.text.trim(),
            'is_host': isHost,
            'is_verified': true,
            'host_status': isHost ? 'active' : null,
            'host_availability': isHost ? 'online' : null,
          }).eq('id', user.id);

          // [FIX] Handle Referral/Agency Code attribution (Matches Auth.tsx)
          final finalCode = _manualReferralCode.isNotEmpty ? _manualReferralCode : _enteredReferralCode;
          if (finalCode != null && finalCode.isNotEmpty) {
            final api = Provider.of<ApiService>(context, listen: false);
            // Female users automatically join agency as host
            if (isHost) {
              await api.joinAgencyV2(hostId: user.id, agencyCode: finalCode);
            } else {
              // Male users or general referrals track invitation
              // await api.trackUserInvitation(user.id, finalCode);
            }
          }

          _showSuccess("Welcome, ${_nameController.text.trim()}!");
          _navigateToHome(index: 3); // Web Parity: Go to Profile after signup
        }
      } else {
        _showError("Registration failed");
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // --- PHONE LOGIC ---
  Future<void> _handleSendPhoneOtp() async {
    final cleanPhone = _phoneController.text.replaceAll(RegExp(r'[\s\-\(\)]'), "");
    if (cleanPhone.length < 6) { _showError("Please enter a valid phone number"); return; }
    final fullPhone = _selectedCountryCode + cleanPhone;

    setState(() => _isLoading = true);
    try {
      final res = await Supabase.instance.client.functions.invoke('send-whatsapp-otp', body: {
        'phone_number': fullPhone,
        'action': 'send',
      });
      if (res.data?['success'] == true) {
        _showSuccess("WhatsApp OTP Sent to $fullPhone!");
        setState(() => _currentStep = AuthStep.phoneOtp);
      } else {
        _showError(res.data?['error'] ?? "Failed to send OTP");
      }
    } catch (e) {
      _showError("WhatsApp OTP service error");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleVerifyPhoneOtp() async {
    if (_phoneOtpCode.length != 6) { _showError("Enter 6-digit code"); return; }
    setState(() => _isLoading = true);
    
    final fullPhone = _selectedCountryCode + _phoneController.text.replaceAll(RegExp(r'[\s\-\(\)]'), "");
    try {
      final res = await Supabase.instance.client.functions.invoke('send-whatsapp-otp', body: {
        'phone_number': fullPhone,
        'action': 'verify',
        'otp': _phoneOtpCode
      });

      if (res.data?['verified'] == true) {
        // Try direct sign in if account exists
        final signInRes = await Supabase.instance.client.functions.invoke('otp-direct-signin', body: {
          'email': "phone_$fullPhone@meri.local"
        });
        
        if (signInRes.data?['session'] != null) {
          await Supabase.instance.client.auth.setSession(signInRes.data['session']['access_token']);
          _showSuccess("Welcome Back!");
          _navigateToHome();
        } else {
          // [FIX] Double check if profile exists to ensure auto-login parity
          final phoneEmail = "phone_$fullPhone@meri.local";
          final profileExists = await Provider.of<AuthService>(context, listen: false).checkProfileExistsByEmail(phoneEmail);
          
          if (profileExists) {
             // Auto-sign in if possible via guest/deterministic logic
             await Provider.of<AuthService>(context, listen: false).loginWithDevice();
          } else {
             _showSuccess("Phone Verified! Please create your account.");
             setState(() => _currentStep = AuthStep.phonePassword);
          }
        }
      } else {
        _showError(res.data?['error'] ?? "Invalid code");
      }
    } catch (e) {
      _showError("Verification failed");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleCreatePhoneAccount() async {
    if (_nameController.text.trim().isEmpty) { _showError("Enter a name"); return; }
    if (_passwordController.text.length < 6) { _showError("Min 6 characters password needed"); return; }
    if (_passwordController.text != _confirmPasswordController.text) { _showError("Passwords mismatch"); return; }

    setState(() => _isLoading = true);
    final fullPhone = _selectedCountryCode + _phoneController.text.replaceAll(RegExp(r'[\s\-\(\)]'), "");
    final email = "phone_$fullPhone@meri.local";
    try {
       final authRes = await Supabase.instance.client.auth.signUp(email: email, password: _passwordController.text);
       if (authRes.user != null) {
          final isHost = _selectedGender == 'female';
          await Supabase.instance.client.from('profiles').update({
             'display_name': _nameController.text.trim(),
             'phone_number': fullPhone,
             'is_verified': true,
             'gender': _selectedGender,
             'is_host': isHost,
             'host_status': isHost ? 'active' : null,
             'host_availability': isHost ? 'online' : null,
          }).eq('id', authRes.user!.id);
          _navigateToHome(index: 3); // Web Parity: Go to Profile after signup
       }
    } catch (e) {
       _showError(e.toString());
    } finally {
       if (mounted) setState(() => _isLoading = false);
    }
  }

  // --- EMAIL LOGIC ---
  Future<void> _handleSendEmailOtp() async {
    final email = _emailController.text.trim().toLowerCase();
    if (email.isEmpty || !email.contains("@")) { _showError("Invalid email"); return; }
    setState(() => _isLoading = true);
    try {
      final res = await Supabase.instance.client.functions.invoke('send-email-otp', body: {
        'email': email, 'purpose': 'login'
      });
      if (res.data?['success'] == true) {
        _showSuccess("Verification Code Sent to $email");
        setState(() => _currentStep = AuthStep.emailOtp);
      } else {
        _showError(res.data?['error'] ?? "Failed to send email");
      }
    } catch (e) {
      _showError("Email service error");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleVerifyEmailOtp() async {
     if (_otpCode.length != 6) { _showError("Enter 6-digit code"); return; }
     setState(() => _isLoading = true);
     try {
       final res = await Supabase.instance.client.functions.invoke('verify-email-otp', body: {
          'email': _emailController.text.trim().toLowerCase(),
          'otp': _otpCode,
          'purpose': 'login'
       });

       if (res.data?['success'] == true) {
          final signInRes = await Supabase.instance.client.functions.invoke('otp-direct-signin', body: {
            'email': _emailController.text.trim().toLowerCase(),
            'otp_verified': true
          });
          
          if (signInRes.data?['success'] == true && signInRes.data?['access_token'] != null) {
             await Supabase.instance.client.auth.setSession(signInRes.data['access_token']);
             _showSuccess("Welcome Back!");
             _navigateToHome();
          } else {
             // [FIX] Auto-login check for existing profile via email
             final profileExists = await Provider.of<AuthService>(context, listen: false).checkProfileExistsByEmail(_emailController.text.trim().toLowerCase());
             if (profileExists) {
                _showError("Account exists. Please use Login with Password.");
                setState(() => _currentStep = AuthStep.emailPasswordLogin);
             } else {
                _showSuccess("Email Verified! Create password.");
                setState(() => _currentStep = AuthStep.emailPassword);
             }
          }
       } else {
         _showError(res.data?['error'] ?? "Invalid code");
       }
     } catch(e) {
       _showError("Verification failed.");
     } finally {
        if (mounted) setState(() => _isLoading = false);
     }
  }

  Future<void> _handleCreateEmailAccount() async {
    if (_nameController.text.trim().isEmpty) { _showError("Enter a name"); return; }
    if (_passwordController.text.length < 6) { _showError("Min 6 characters password needed"); return; }
    if (_passwordController.text != _confirmPasswordController.text) { _showError("Passwords mismatch"); return; }
    
    setState(() => _isLoading = true);
    try {
       final authRes = await Supabase.instance.client.auth.signUp(email: _emailController.text.trim().toLowerCase(), password: _passwordController.text);
        if (authRes.user != null) {
          final isHost = _selectedGender == 'female';
          await Supabase.instance.client.from('profiles').update({
             'display_name': _nameController.text.trim(),
             'is_verified': true,
             'gender': _selectedGender,
             'is_host': isHost,
             'host_status': isHost ? 'active' : null,
             'host_availability': isHost ? 'online' : null,
          }).eq('id', authRes.user!.id);

          // [NEW] Join Agency if referral code exists
          if (_enteredReferralCode != null && _enteredReferralCode!.isNotEmpty) {
            final api = Provider.of<ApiService>(context, listen: false);
            await api.joinAgencyV2(hostId: authRes.user!.id, agencyCode: _enteredReferralCode!);
          }

          _navigateToHome(index: 3); // Web Parity: Go to Profile after signup
        }
    } catch (e) {
       _showError(e.toString());
    } finally {
       if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showReferralModal() {
    showDialog(
      context: context,
      builder: (context) => FadeInUp(
        duration: const Duration(milliseconds: 300),
        child: AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: BorderSide(color: const Color(0x33A855F7))),
          title: Text("Referral Code", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text("If you have an agency or referral code, enter it below to join automatically.", style: TextStyle(color: Colors.white54, fontSize: 13)),
              const SizedBox(height: 16),
              Container(
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white12)),
                child: TextField(
                  controller: _referralController,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    hintText: "Enter Code (e.g. AR123)",
                    hintStyle: TextStyle(color: Colors.white24),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text("CANCEL", style: TextStyle(color: Colors.white38))),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF9333EA), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              onPressed: () {
                setState(() => _enteredReferralCode = _referralController.text.trim().toUpperCase());
                Navigator.pop(context);
                if (_enteredReferralCode!.isNotEmpty) {
                  _showSuccess("Code Applied: $_enteredReferralCode");
                }
              },
              child: const Text("APPLY", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  // ========== BUILD METHODS ==========

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: Consumer<AdminControllerService>(
        builder: (context, admin, child) {
          final branding = admin.branding;
          return Stack(
            children: [
              _buildDynamicBackground(branding),
              
              // Main content (Logo + Buttons)
              if (_isAutoRecovering)
                _buildAutoRecoveryScreen(branding)
              else
                SafeArea(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const SizedBox(height: 10),
                      _buildAnimatedLogo(branding),
                      if (_currentStep == AuthStep.start) _buildMainScreen(),
                      const SizedBox(height: 60),
                    ],
                  ),
                ),

              // Overlay Modal for intermediate steps
              if (_currentStep != AuthStep.start)
                _buildModalOverlay(),

              if (_isLoading)
                Container(
                  color: Colors.black.withOpacity(0.5),
                  child: Center(
                    child: FadeIn(
                      duration: const Duration(seconds: 1),
                      child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: Colors.black45, 
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(color: Colors.black26, blurRadius: 10, blurStyle: BlurStyle.outer)
                          ],
                        ),
                        child: const CircularProgressIndicator(color: Color(0xFFEC4899), strokeWidth: 3),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildModalOverlay() {
    return Container(
      color: Colors.black.withOpacity(0.7),
      child: Center(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 400),
                transitionBuilder: (child, animation) {
                   return FadeTransition(
                     opacity: animation,
                     child: SlideTransition(
                       position: Tween<Offset>(begin: const Offset(0.1, 0), end: Offset.zero).animate(animation),
                       child: child,
                     ),
                   );
                },
                child: _buildModalContainer(_buildCurrentState(), key: ValueKey(_currentStep)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildModalContainer(Widget child, {Key? key}) {
    return Container(
      key: key,
      margin: const EdgeInsets.symmetric(horizontal: 24),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(32),
      child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 25, sigmaY: 25),
          child: Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.5),
              borderRadius: BorderRadius.circular(32),
              border: Border.all(color: Colors.white.withOpacity(0.08), width: 1.0),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 40, offset: const Offset(0, 20)),
                BoxShadow(color: const Color(0xFFA855F7).withOpacity(0.12), blurRadius: 30, spreadRadius: -5),
              ],
            ),
            child: Stack(
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 20),
                  child: child,
                ),
                Positioned(
                  top: -10, right: -10,
                  child: IconButton(
                    icon: const Icon(LucideIcons.x, color: Colors.white38, size: 24),
                    onPressed: () => setState(() => _currentStep = AuthStep.start),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCurrentState() {
     switch (_currentStep) {
        case AuthStep.start: return _buildMainScreen();
        case AuthStep.genderName: return _buildGenderNameModal();
        case AuthStep.email: return _buildEmailInputScreen();
        case AuthStep.emailOtp: return _buildOtpScreen(isPhone: false);
        case AuthStep.emailPassword: return _buildPasswordScreen(isPhone: false);
        case AuthStep.emailPasswordLogin: return _buildEmailPasswordLoginScreen();
        case AuthStep.phoneInput: return _buildPhoneInputScreen();
        case AuthStep.phoneOtp: return _buildOtpScreen(isPhone: true);
        case AuthStep.phonePassword: return _buildPasswordScreen(isPhone: true);
        default: return _buildMainScreen();
     }
  }

  Widget _buildDynamicBackground(Map<String, dynamic> branding) {
    final backgroundUrl = branding['background_url'];
    final bool hasBg = backgroundUrl != null && backgroundUrl.toString().isNotEmpty;

    return Stack(
      children: [
        if (hasBg)
          Positioned.fill(
             child: Image.network(
               backgroundUrl.toString(),
               fit: BoxFit.cover,
               color: Colors.black.withOpacity(0.3), // Web Parity: 30% darken
               colorBlendMode: BlendMode.darken,
               loadingBuilder: (context, child, loadingProgress) {
                 if (loadingProgress == null) return FadeIn(duration: const Duration(seconds: 1), child: child);
                 return Container(color: const Color(0xFF0F0C29)); // Fallback while loading
               },
               errorBuilder: (context, error, stackTrace) {
                 return Container( // Fallback to premium gradient if image fails
                   decoration: const BoxDecoration(
                     gradient: LinearGradient(
                       begin: Alignment.topLeft, end: Alignment.bottomRight,
                       colors: [Color(0xFF0F0C29), Color(0xFF302B63), Color(0xFF24243E), Color(0xFF0F0C29)],
                       stops: [0.0, 0.4, 0.7, 1.0],
                     ),
                   ),
                 );
               },
             ),
          )
        else
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft, end: Alignment.bottomRight,
                colors: [Color(0xFF0F0C29), Color(0xFF302B63), Color(0xFF24243E), Color(0xFF0F0C29)],
                stops: [0.0, 0.4, 0.7, 1.0],
              ),
            ),
          ),
          
        if (!hasBg)
        AnimatedBuilder(
          animation: _pulseController,
          builder: (context, child) {
            final val = _pulseController.value;
            return Stack(
              children: [
                Positioned(top: MediaQuery.of(context).size.height * 0.25, left: MediaQuery.of(context).size.width * 0.25, child: Transform.scale(scale: 1.0 + (val * 0.1), child: Container(width: 256, height: 256, decoration: const BoxDecoration(shape: BoxShape.circle, boxShadow: [BoxShadow(color: Color(0x339B87F5), blurRadius: 120, spreadRadius: 60)])))),
                Positioned(bottom: MediaQuery.of(context).size.height * 0.3, right: MediaQuery.of(context).size.width * 0.25, child: Transform.scale(scale: 1.0 + ((1-val) * 0.15), child: Container(width: 192, height: 192, decoration: const BoxDecoration(shape: BoxShape.circle, boxShadow: [BoxShadow(color: Color(0x26F472B6), blurRadius: 100, spreadRadius: 50)])))),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _buildMainScreen() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_agencyInfo != null) _buildAgencyBanner(),
          _buildActionButtons(),
        ],
      ),
    );
  }

  Widget _buildAgencyBanner() {
    return FadeInDown(
      child: Container(
        margin: const EdgeInsets.only(bottom: 20),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFF9333EA), Color(0xFFEC4899)]),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: Colors.purple.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Row(
          children: [
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(color: Colors.white24, shape: BoxShape.circle),
              child: const Icon(LucideIcons.building2, color: Colors.white, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("You are invited by", style: TextStyle(color: Colors.white70, fontSize: 10)),
                  Text(_agencyInfo!['name'] ?? 'Agency', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: Colors.white20, borderRadius: BorderRadius.circular(6)),
                        child: Text("Lv ${_agencyInfo!['level'] ?? 1}", style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold)),
                      ),
                      const SizedBox(width: 8),
                      Text("${_agencyInfo!['total_hosts'] ?? 0} hosts", style: const TextStyle(color: Colors.white70, fontSize: 10)),
                    ],
                  ),
                ],
              ),
            ),
            const Icon(LucideIcons.sparkles, color: Color(0xFFFDE047), size: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildAutoRecoveryScreen(Map<String, dynamic> branding) {
    return Container(
      width: double.infinity,
      color: Colors.black45,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(width: 40, height: 40, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3)),
          const SizedBox(height: 20),
          Text("Recovering your account...", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }

  Widget _buildAnimatedLogo(Map<String, dynamic> branding) {
    final logoText = branding['logo_text_primary'] ?? 'meri';
    final logoSec = branding['logo_text_secondary'] ?? 'LIVE';
    final tagline = branding['tagline'] ?? 'Connect, Share, Live.';
    final logoUrl = branding['logo_url'];
    final bool hasLogoImage = logoUrl != null && logoUrl.toString().isNotEmpty;
    
    return FadeInDown(
      duration: const Duration(milliseconds: 1000),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (hasLogoImage)
            Image.network(
              logoUrl.toString(),
              height: 140, // Web Parity size
              fit: BoxFit.contain,
              errorBuilder: (context, error, stackTrace) => _buildTextLogo(logoText, logoSec),
            )
          else
            _buildTextLogo(logoText, logoSec),
          const SizedBox(height: 12),
          FadeIn(
            delay: const Duration(milliseconds: 800),
            child: Text(
              tagline.toUpperCase(),
              style: GoogleFonts.outfit(
                color: Colors.white.withOpacity(0.5),
                fontSize: 12,
                fontWeight: FontWeight.bold,
                letterSpacing: 4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTextLogo(String primary, String secondary) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            Text(
              primary,
              style: GoogleFonts.pacifico(
                fontSize: 72,
                fontWeight: FontWeight.w900,
                foreground: Paint()
                  ..shader = const LinearGradient(colors: [Colors.white, Color(0xFFFBCFE8), Color(0xFFF472B6)], begin: Alignment.topCenter, end: Alignment.bottomCenter).createShader(const Rect.fromLTWH(0, 0, 200, 70)),
                shadows: [const Shadow(color: Color(0x80EC4899), blurRadius: 30, offset: Offset(0, 4))],
              ),
            ),
            Positioned(right: -10, top: -5, child: Pulse(infinite: true, child: const Text("✦", style: TextStyle(color: Color(0xFFFDE047), fontSize: 28, shadows: [Shadow(color: Color(0xCCFACC15), blurRadius: 10)])))),
          ],
        ),
        const SizedBox(height: 5),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(width: 40, height: 1, decoration: const BoxDecoration(gradient: LinearGradient(colors: [Colors.transparent, Colors.white60]))),
            const SizedBox(width: 12),
            Text(secondary, style: GoogleFonts.montserrat(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 8)),
            const SizedBox(width: 4),
            Container(width: 40, height: 1, decoration: const BoxDecoration(gradient: LinearGradient(colors: [Colors.white60, Colors.transparent]))),
          ],
        ),
      ],
    );
  }

  Widget _buildActionButtons() {
    return FadeInUp(
      delay: const Duration(milliseconds: 400),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_lastUser != null) ...[
            _buildLastUserButton(),
            const SizedBox(height: 12),
          ],
          _buildCustomButton("Start", LucideIcons.sparkles, const LinearGradient(colors: [Color(0xFF9333EA), Color(0xFFD946EF), Color(0xFFEC4899)]), [BoxShadow(color: const Color(0xFF9333EA).withOpacity(0.5), blurRadius: 24, offset: const Offset(0, 6))], const Color(0x4DFFFFFF), Colors.white, _handleStartClick),
          const SizedBox(height: 12),
          _buildCustomButton("Phone Number", LucideIcons.phone, const LinearGradient(colors: [Color(0xFF22C55E), Color(0xFF10B981), Color(0xFF16A34A)]), [BoxShadow(color: const Color(0xFF10B981).withOpacity(0.4), blurRadius: 24, offset: const Offset(0, 6))], const Color(0x4DFFFFFF), Colors.white, () {
             if (!_agreed) { _showError("Please agree to User Agreement"); return; }
             setState(() => _currentStep = AuthStep.phoneInput);
          }),
          const SizedBox(height: 12),
          _buildCustomButton("Email", LucideIcons.mail, const LinearGradient(colors: [Colors.white, Color(0xFFF8FAFC), Colors.white]), [BoxShadow(color: Colors.white.withOpacity(0.3), blurRadius: 24, offset: const Offset(0, 6))], Colors.white.withOpacity(0.6), const Color(0xFF334155), () {
             if (!_agreed) { _showError("Please agree to User Agreement"); return; }
             setState(() => _currentStep = AuthStep.email);
          }, iconColor: const Color(0xFF475569)),
          const SizedBox(height: 20),
          
          // Referral Input (Integrated like web)
          if (!_showReferralInput && _manualReferralCode.isEmpty)
            GestureDetector(
              onTap: () => setState(() => _showReferralInput = true),
              child: Text("🎁 Have a referral code? Tap here", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.w500)),
            )
          else if (_manualReferralCode.isEmpty)
            Row(
              children: [
                Expanded(
                  child: Container(
                    height: 40,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFFACC15).withOpacity(0.3))),
                    child: TextField(
                      controller: _referralController,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      decoration: const InputDecoration(hintText: "Enter referral code", hintStyle: TextStyle(color: Colors.white24, fontSize: 13), border: InputBorder.none, icon: Icon(LucideIcons.gift, color: Color(0xFFFACC15), size: 16)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: () {
                    final code = _referralController.text.trim().toUpperCase();
                    if (code.isNotEmpty) {
                      setState(() {
                        _manualReferralCode = code;
                        _showReferralInput = false;
                      });
                      _fetchAgencyInfo(code);
                      _showSuccess("Code applied: $code");
                    }
                  },
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFF59E0B), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), padding: const EdgeInsets.symmetric(horizontal: 16)),
                  child: const Text("Apply", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ],
            )
          else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: const Color(0xFF10B981).withOpacity(0.15), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3))),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.checkCircle, color: Color(0xFF10B981), size: 14),
                  const SizedBox(width: 6),
                  Text("Referral: $_manualReferralCode", style: const TextStyle(color: Color(0xFF10B981), fontSize: 11, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          
          const SizedBox(height: 20),
          _buildAgreementSection(),
          const SizedBox(height: 30),
        ],
      ),
    );
  }

  Widget _buildLastUserButton() {
    return GestureDetector(
      onTap: () {
        // Handle last user login logic (parity with Auth.tsx)
      },
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.9), borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: const Color(0xFFF59E0B),
              child: Text(_lastUser!['displayName']?[0] ?? 'U', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_lastUser!['displayName'] ?? 'User', style: const TextStyle(color: Color(0xFF1E293B), fontWeight: FontWeight.bold, fontSize: 14)),
                  Text(_lastUser!['email'] ?? '', style: const TextStyle(color: Color(0xFF64748B), fontSize: 11)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: const Color(0xFFF59E0B), borderRadius: BorderRadius.circular(8)),
              child: const Text("Latest Login", style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCustomButton(String label, IconData icon, Gradient gradient, List<BoxShadow> shadow, Color borderColor, Color textColor, VoidCallback onTap, {Color? iconColor}) {
    return GestureDetector(
      onTap: _isLoading ? null : onTap,
      child: Container(
        height: 46, // Slightly taller for premium feel
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16), 
          gradient: gradient, 
          boxShadow: shadow, 
          border: Border.all(color: borderColor, width: 1.0)
        ),
        child: Center(
          child: _isLoading 
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5)) 
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, color: iconColor ?? textColor, size: 18),
                  const SizedBox(width: 10),
                  Text(label, style: GoogleFonts.outfit(color: textColor, fontSize: 15, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                ],
              ),
        ),
      ),
    );
  }

  Widget _buildAgreementSection() {
    return GestureDetector(
      onTap: () => setState(() => _agreed = !_agreed),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            width: 22, height: 22,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _agreed ? const Color(0xFF10B981) : Colors.white10,
              border: Border.all(color: _agreed ? Colors.transparent : Colors.white24, width: 2),
              boxShadow: _agreed ? [BoxShadow(color: const Color(0xFF10B981).withOpacity(0.3), blurRadius: 10)] : null,
            ),
            child: _agreed ? const Icon(Icons.check, size: 14, color: Colors.white) : null,
          ),
          const SizedBox(width: 10),
          Text.rich(
            TextSpan(
              style: GoogleFonts.outfit(color: _agreed ? Colors.white.withOpacity(0.9) : Colors.white38, fontSize: 13),
              children: [
                const TextSpan(text: "Agree to "),
                TextSpan(text: "Terms", style: TextStyle(color: _agreed ? const Color(0xFFC084FC) : Colors.white38, decoration: TextDecoration.underline)),
                const TextSpan(text: " & "),
                TextSpan(text: "Privacy", style: TextStyle(color: _agreed ? const Color(0xFFC084FC) : Colors.white38, decoration: TextDecoration.underline)),
                const TextSpan(text: " • 18+"),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ========== MODALS & SUB-FLOWS ==========

  Widget _buildGenderNameModal() {
    return FadeInUp(
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 24),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF0F172A), Color(0xFF020617)]),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0x4DA855F7), width: 1.5),
            boxShadow: [const BoxShadow(color: Color(0x33A855F7), blurRadius: 20)],
          ),
          child: Column(
             mainAxisSize: MainAxisSize.min,
             children: [
                Container(
                  width: 64, height: 64,
                  decoration: BoxDecoration(shape: BoxShape.circle, gradient: const LinearGradient(colors: [Color(0x4DA855F7), Color(0x4DEC4899)])),
                  child: const Center(child: Icon(LucideIcons.sparkles, color: Color(0xFFC084FC), size: 32)),
                ),
                const SizedBox(height: 12),
                Text("Welcome! 🎉", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                const Text("Enter your name & select gender", style: TextStyle(color: Colors.white60, fontSize: 13)),
                const SizedBox(height: 20),
                Align(alignment: Alignment.centerLeft, child: Text("Your Name", style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600))),
                const SizedBox(height: 6),
                Container(
                  decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white24)),
                  child: TextField(
                    controller: _nameController, 
                    style: const TextStyle(color: Colors.white), 
                    decoration: const InputDecoration(
                      prefixIcon: Icon(LucideIcons.user, color: Colors.white54, size: 18),
                      hintText: "Enter your name", 
                      hintStyle: TextStyle(color: Colors.white30),
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(vertical: 14)
                    )
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: _buildMaleCard()),
                    const SizedBox(width: 12),
                    Expanded(child: _buildFemaleCard()),
                  ],
                ),
                const SizedBox(height: 20),
                _buildCustomButton("Get Started", LucideIcons.check, const LinearGradient(colors: [Color(0xFF9333EA), Color(0xFFDB2777)]), [const BoxShadow(color: Color(0x66DB2777), blurRadius: 10)], Colors.transparent, Colors.white, _completeDeviceRegistration),
             ],
          )
        ),
      ),
    );
  }

  Widget _buildMaleCard() {
    bool isSelected = _selectedGender == 'male';
    return GestureDetector(
      onTap: () => setState(() => _selectedGender = 'male'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0x333B82F6) : Colors.white.withValues(alpha: 0.05),
          border: Border.all(color: isSelected ? const Color(0xFF3B82F6) : Colors.white10, width: 2),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(children: [
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(shape: BoxShape.circle, gradient: const LinearGradient(colors: [Color(0x4D60A5FA), Color(0x4D22D3EE)]), border: isSelected ? Border.all(color: const Color(0xFF3B82F6), width: 2) : null),
            child: const Center(child: Text("👨", style: TextStyle(fontSize: 28))),
          ),
          const SizedBox(height: 8),
          Text("Male", style: TextStyle(color: isSelected ? const Color(0xFF60A5FA) : Colors.white70, fontWeight: FontWeight.bold, fontSize: 14)),
          const Text("User Account", style: TextStyle(color: Colors.white54, fontSize: 10)),
        ]),
      ),
    );
  }

  Widget _buildFemaleCard() {
    bool isSelected = _selectedGender == 'female';
    return GestureDetector(
      onTap: () => setState(() => _selectedGender = 'female'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0x33EC4899) : Colors.white.withValues(alpha: 0.05),
          border: Border.all(color: isSelected ? const Color(0xFFEC4899) : Colors.white10, width: 2),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(children: [
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(shape: BoxShape.circle, gradient: const LinearGradient(colors: [Color(0x4DF472B6), Color(0x4DFB7185)]), border: isSelected ? Border.all(color: const Color(0xFFEC4899), width: 2) : null),
            child: const Center(child: Text("👩", style: TextStyle(fontSize: 28))),
          ),
          const SizedBox(height: 8),
          Text("Female", style: TextStyle(color: isSelected ? const Color(0xFFF472B6) : Colors.white70, fontWeight: FontWeight.bold, fontSize: 14)),
          const Text("👑 Host Account", style: TextStyle(color: Color(0xFFFDE047), fontSize: 10)),
        ]),
      ),
    );
  }

  Widget _buildEmailInputScreen() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
         const Icon(LucideIcons.mail, color: Color(0xFF9333EA), size: 48),
         const SizedBox(height: 16),
         Text("Enter Your Email", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
         const Text("We'll send a verification code to your email", style: TextStyle(color: Colors.white54, fontSize: 13)),
         const SizedBox(height: 24),
         Container(
           decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white12)),
           child: TextField(
             controller: _emailController, 
             style: const TextStyle(color: Colors.white), 
             decoration: const InputDecoration(
               prefixIcon: Icon(LucideIcons.atSign, color: Colors.white38, size: 20),
               hintText: "your@email.com", 
               hintStyle: TextStyle(color: Colors.white30),
               border: InputBorder.none,
               contentPadding: EdgeInsets.symmetric(vertical: 16)
             )
           ),
         ),
         const SizedBox(height: 20),
         _buildCustomButton("Send Verification Code", LucideIcons.send, const LinearGradient(colors: [Color(0xFF9333EA), Color(0xFF7C3AED)]), [], Colors.transparent, Colors.white, _handleSendEmailOtp),
         const SizedBox(height: 20),
         GestureDetector(
           onTap: () => setState(() => _currentStep = AuthStep.emailPasswordLogin),
           child: Text.rich(
             TextSpan(
               text: "Already have an account? ",
               style: GoogleFonts.outfit(color: Colors.white54, fontSize: 13),
               children: const [
                 TextSpan(text: "Login", style: TextStyle(color: Color(0xFFC084FC), fontWeight: FontWeight.bold))
               ]
             )
           ),
         ),
      ],
    );
  }

  Widget _buildEmailPasswordLoginScreen() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
         const Icon(LucideIcons.userCheck, color: Color(0xFF3B82F6), size: 48),
         const SizedBox(height: 16),
         Text("Enter Your Password", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
         const Text("Welcome back! Please login below", style: TextStyle(color: Colors.white54, fontSize: 13)),
         const SizedBox(height: 24),
         Container(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white12)),
            child: TextField(controller: _emailController, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "Email Address", hintStyle: TextStyle(color: Colors.white30), border: InputBorder.none)),
         ),
         const SizedBox(height: 12),
         Container(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white12)),
            child: TextField(controller: _passwordController, obscureText: true, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "Password", hintStyle: TextStyle(color: Colors.white30), border: InputBorder.none)),
         ),
         const SizedBox(height: 24),
         _buildCustomButton("Login", LucideIcons.logIn, const LinearGradient(colors: [Color(0xFF3B82F6), Color(0xFF2563EB)]), [], Colors.transparent, Colors.white, () async {
            setState(() => _isLoading = true);
            try {
              final auth = Provider.of<AuthService>(context, listen: false);
              final success = await auth.signInWithEmail(_emailController.text.trim(), _passwordController.text);
              if (success) _navigateToHome();
              else _showError("Invalid credentials");
            } catch (e) { _showError(e.toString()); }
            finally { if (mounted) setState(() => _isLoading = false); }
         }),
         const SizedBox(height: 16),
         GestureDetector(
           onTap: () => setState(() => _currentStep = AuthStep.email),
           child: Text("Don't have an account? Sign Up", style: GoogleFonts.outfit(color: const Color(0xFF60A5FA), fontSize: 13, fontWeight: FontWeight.w600)),
         ),
      ],
    );
  }

  // ====== PHONE INPUT WITH COUNTRY PICKER ======
  Widget _buildPhoneInputScreen() {
    final selectedCountry = COUNTRY_CODES.firstWhere((c) => c.code == _selectedCountryCode, orElse: () => COUNTRY_CODES.first);
    
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(color: const Color(0xFF10B981).withOpacity(0.1), shape: BoxShape.circle),
            child: const Icon(LucideIcons.phone, color: Color(0xFF10B981), size: 40),
          ),
          const SizedBox(height: 20),
          Text("Enter Phone Number", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
          const Text("We'll send a verification code via WhatsApp", style: TextStyle(color: Colors.white54, fontSize: 13)),
          const SizedBox(height: 24),
          
          if (_showCountryPicker) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFEC4899))),
              child: TextField(
                  onChanged: (v) => setState(() => _countrySearch = v),
                  style: const TextStyle(color: Colors.white), 
                  decoration: const InputDecoration(hintText: "Search Country", hintStyle: TextStyle(color: Colors.white30), border: InputBorder.none),
              ),
            ),
            const SizedBox(height: 10),
            Container(
              height: 200,
              decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12)),
              child: ListView(
                  children: COUNTRY_CODES.where((c) => c.name.toLowerCase().contains(_countrySearch.toLowerCase()) || c.code.contains(_countrySearch)).map((c) {
                      return ListTile(
                          title: Text("${c.flag} ${c.name} (${c.code})", style: const TextStyle(color: Colors.white, fontSize: 13)),
                          onTap: () => setState(() { _selectedCountryCode = c.code; _showCountryPicker = false; }),
                      );
                  }).toList(),
              ),
            )
          ] else ...[
            // Web Style Country Selector
            GestureDetector(
              onTap: () => setState(() => _showCountryPicker = true),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFEC4899))),
                child: Row(
                  children: [
                    Text("${selectedCountry.flag} ${selectedCountry.code}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 8),
                    Text(selectedCountry.name, style: const TextStyle(color: Colors.white70)),
                    const Spacer(),
                    const Icon(Icons.keyboard_arrow_down, color: Colors.white54),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white12)),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(4)),
                    child: Text("${selectedCountry.flag} ${selectedCountry.code}", style: const TextStyle(color: Colors.white60, fontSize: 12)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                        controller: _phoneController, keyboardType: TextInputType.phone,
                        style: const TextStyle(color: Colors.white), 
                        decoration: const InputDecoration(hintText: "1XXXXXXXXX", hintStyle: TextStyle(color: Colors.white24), border: InputBorder.none),
                    ),
                  ),
                ],
              ),
            ),
          ],
          
          if (!_showCountryPicker) ...[
            const SizedBox(height: 16),
            Container(
               padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
               decoration: BoxDecoration(color: const Color(0xFF10B981).withOpacity(0.05), border: Border.all(color: const Color(0xFF10B981).withOpacity(0.2)), borderRadius: BorderRadius.circular(8)),
               child: Row(children: [const Icon(LucideIcons.messageSquare, color: Color(0xFF10B981), size: 16), const SizedBox(width: 8), const Text("Verification code will be sent via WhatsApp", style: TextStyle(color: Color(0xFF10B981), fontSize: 11))]),
            ),
            const SizedBox(height: 24),
            _buildCustomButton("Send WhatsApp Code", LucideIcons.messageCircle, const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF059669)]), [], Colors.transparent, Colors.white, _handleSendPhoneOtp),
            const SizedBox(height: 16),
            GestureDetector(
              onTap: () => setState(() => _currentStep = AuthStep.email),
              child: Text.rich(
                TextSpan(
                  text: "Use email instead? ",
                  style: GoogleFonts.outfit(color: Colors.white54, fontSize: 13),
                  children: const [
                    TextSpan(text: "Email Sign Up", style: TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold))
                  ]
                )
              ),
            ),
          ],
      ],
    );
  }

  // ====== OTP VERIFICATION (SHARED UI) ======
  Widget _buildOtpScreen({required bool isPhone}) {
    final defaultPinTheme = PinTheme(
      width: 48, height: 48,
      textStyle: const TextStyle(fontSize: 22, color: Colors.white, fontWeight: FontWeight.bold),
      decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white24)),
    );

    return FadeInUp(
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 24), padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: const Color(0xFF0F172A), borderRadius: BorderRadius.circular(24), border: Border.all(color: const Color(0x4DA855F7))),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
               Icon(LucideIcons.shieldCheck, color: isPhone ? const Color(0xFF10B981) : const Color(0xFFEC4899), size: 32),
               const SizedBox(height: 12),
               Text("6-Digit Code", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
               Text("Sent to ${isPhone ? _phoneController.text : _emailController.text.trim()}", style: const TextStyle(color: Colors.white54, fontSize: 12)),
               const SizedBox(height: 32),
               Pinput(
                 length: 6,
                 defaultPinTheme: defaultPinTheme,
                 focusedPinTheme: defaultPinTheme.copyWith(decoration: defaultPinTheme.decoration!.copyWith(border: Border.all(color: const Color(0xFFA855F7), width: 2))),
                 onCompleted: (pin) {
                   if (isPhone) {
                     _phoneOtpCode = pin;
                     _handleVerifyPhoneOtp();
                   } else {
                     _otpCode = pin;
                     _handleVerifyEmailOtp();
                   }
                 },
               ),
               const SizedBox(height: 32),
               _buildCustomButton("Verify", LucideIcons.check, const LinearGradient(colors: [Color(0xFF3B82F6), Color(0xFF2563EB)]), [], Colors.transparent, Colors.white, isPhone ? _handleVerifyPhoneOtp : _handleVerifyEmailOtp),
               const SizedBox(height: 12),
               TextButton(onPressed: () => setState(() => _currentStep = AuthStep.start), child: const Text("Change Info", style: TextStyle(color: Colors.white30, fontSize: 12))),
            ],
          ),
        ),
      ),
    );
  }

  // ====== PASSWORDS / COMPLETED REGISTRATION ======
  Widget _buildPasswordScreen({required bool isPhone}) {
    return FadeInUp(
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 24), padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: const Color(0xFF0F172A), borderRadius: BorderRadius.circular(24), border: Border.all(color: const Color(0x4DA855F7))),
          child: SingleChildScrollView(
             child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                   Text("Setup Account", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                   const SizedBox(height: 16),
                   TextField(controller: _nameController, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "Your Name", hintStyle: TextStyle(color: Colors.white30))),
                   const SizedBox(height: 16),
                   TextField(controller: _passwordController, obscureText: true, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "New Password", hintStyle: TextStyle(color: Colors.white30))),
                   const SizedBox(height: 16),
                   TextField(controller: _confirmPasswordController, obscureText: true, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "Confirm Password", hintStyle: TextStyle(color: Colors.white30))),
                   const SizedBox(height: 16),
                   Row(
                     children: [
                       Expanded(child: _buildMaleCard()),
                       const SizedBox(width: 12),
                       Expanded(child: _buildFemaleCard()),
                     ],
                   ),
                   const SizedBox(height: 24),
                   _buildCustomButton("Complete", LucideIcons.check, const LinearGradient(colors: [Color(0xFF9333EA), Color(0xFFDB2777)]), [], Colors.transparent, Colors.white, isPhone ? _handleCreatePhoneAccount : _handleCreateEmailAccount),
                ],
             )
          )
        ),
      ),
    );
  }

  void _navigateToHome({int index = 0}) {
    if (mounted) {
      Navigator.pushReplacementNamed(context, '/home', arguments: index);
    }
  }
}


