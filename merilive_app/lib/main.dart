import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'core/router/app_router.dart';
import 'core/storage/hydrated_storage.dart';
import 'core/supabase/supabase_client.dart';
import 'features/gifting/data/gift_animation_config.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/bloc/auth_bloc.dart';
import 'features/auth/bloc/auth_event.dart';
import 'features/branding/branding_cubit.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Portrait-only (matches web app + Chamet parity).
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
  ]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));

  await HydratedStorageBootstrap.init();
  await SupabaseBootstrap.init();

  runApp(const MeriLiveApp());
}

class MeriLiveApp extends StatefulWidget {
  const MeriLiveApp({super.key});

  @override
  State<MeriLiveApp> createState() => _MeriLiveAppState();
}

class _MeriLiveAppState extends State<MeriLiveApp> {
  final _router = AppRouter();

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<AuthBloc>(
          create: (_) => AuthBloc()..add(const AppStarted()),
        ),
        BlocProvider<BrandingCubit>(create: (_) => BrandingCubit()),
      ],
      child: MaterialApp.router(
        title: 'MeriLive',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark,
        routerConfig: _router.config(),
      ),
    );
  }
}
