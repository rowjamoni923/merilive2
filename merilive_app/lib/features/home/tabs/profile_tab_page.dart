import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/design_tokens.dart';
import '../../../core/router/app_router.gr.dart';
import 'package:auto_route/auto_route.dart';
import '../../auth/bloc/auth_bloc.dart';
import '../../auth/bloc/auth_event.dart';

class ProfileTabPage extends StatelessWidget {
  const ProfileTabPage({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ShaderMask(
                blendMode: BlendMode.srcIn,
                shaderCallback: (r) =>
                    const LinearGradient(colors: DT.tabProfile).createShader(r),
                child: const Icon(Icons.person_rounded,
                    size: 64, color: Colors.white),
              ),
              const SizedBox(height: 14),
              const Text(
                'My profile',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Profile, wallet, settings land in Step K',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: DT.navInkMuted),
              ),
              const SizedBox(height: 24),
              // Temporary sign-out for owner testing during scaffold phase.
              OutlinedButton.icon(
                onPressed: () async {
                  context.read<AuthBloc>().add(const SignedOut());
                  await context.router.replaceAll([const AuthLandingRoute()]);
                },
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0x33C9A84C)),
                  foregroundColor: const Color(0xFF334155),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 20, vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                icon: const Icon(Icons.logout_rounded, size: 18),
                label: const Text('Sign out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
