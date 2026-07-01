import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// Services
import 'services/auth_service.dart';
import 'services/wallet_service.dart';
import 'services/agency_service.dart';
import 'services/admin_service.dart';
import 'services/social_service.dart';
import 'services/stream_service.dart';
import 'services/game_service.dart';
import 'services/reels_service.dart';
import 'services/live_service.dart';
import 'services/livekit_service.dart';
import 'services/beauty_service.dart';
import 'services/permission_service.dart';
import 'services/notification_service.dart';
import 'services/supabase_realtime_service.dart';
import 'services/app_lifecycle_service.dart';
import 'services/security_service.dart';
import 'services/sound_service.dart';

// Screens
import 'screens/splash_screen.dart';
import 'screens/live/go_live_preview_screen.dart';
import 'screens/live/live_streaming_screen.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Colors.black,
    systemNavigationBarIconBrightness: Brightness.light,
  ));

  // ⚠️ PRODUCTION SUPABASE — same server as web admin & user app
  // Project ref: ayjdlvuurscxucatbbah
  await Supabase.initialize(
    url: 'https://ayjdlvuurscxucatbbah.supabase.co',
    anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc',
  );

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthService()),
        ChangeNotifierProvider(create: (_) => WalletService()),
        ChangeNotifierProvider(create: (_) => AgencyService()),
        ChangeNotifierProvider(create: (_) => AdminService()),
        ChangeNotifierProvider(create: (_) => SocialService()),
        ChangeNotifierProvider(create: (_) => StreamService()),
        ChangeNotifierProvider(create: (_) => GameService()),
        ChangeNotifierProvider(create: (_) => BeautyEffectService()),
        ChangeNotifierProvider(create: (_) => LiveKitService()),
        ChangeNotifierProvider(create: (_) => GiftService()),
        ChangeNotifierProvider(create: (_) => PartyService()),
        ChangeNotifierProvider(create: (_) => GameService()..fetchGames()),
        // ProxyProvider to inject dependencies into LiveService
        ChangeNotifierProxyProvider2<LiveKitService, BeautyEffectService, LiveService>(
          create: (context) => LiveService(
            context.read<LiveKitService>(),
            context.read<BeautyEffectService>(),
          ),
          update: (context, liveKit, beauty, previous) => previous ?? LiveService(liveKit, beauty),
        ),
        ChangeNotifierProvider(create: (_) => ReelsService()..init()),
        ChangeNotifierProvider(create: (_) => PermissionService()),
        ChangeNotifierProvider(create: (_) => NotificationService()),
        ChangeNotifierProvider(create: (_) => SupabaseRealtimeService()),
        ChangeNotifierProvider(create: (_) => AppLifecycleService()),
        ChangeNotifierProvider(create: (_) => SecurityService()..init()),
        ChangeNotifierProvider(create: (_) => SoundService()),
      ],
      child: const MeriLiveApp(),
    ),
  );
}

class MeriLiveApp extends StatelessWidget {
  const MeriLiveApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MeriLive',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      initialRoute: '/',
      routes: {
        '/': (context) => const SplashScreen(),
        '/go_live_preview': (context) => const GoLivePreviewScreen(),
        '/live_stream': (context) => const LiveStreamingScreen(),
      },
    );
  }
}
