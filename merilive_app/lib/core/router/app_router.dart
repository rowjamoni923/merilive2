import 'package:auto_route/auto_route.dart';

import '../../features/auth/screens/auth_landing_page.dart';
import '../../features/auth/screens/auth_stubs.dart';
import '../../features/auth/screens/email_input_page.dart';
import '../../features/auth/screens/email_otp_page.dart';
import '../../features/auth/screens/email_password_page.dart';
import '../../features/auth/screens/gender_step_page.dart';
import '../../features/auth/screens/login_page.dart';
import '../../features/auth/screens/onboarding_page.dart';
import '../../features/auth/screens/phone_input_page.dart';
import '../../features/auth/screens/phone_otp_page.dart';
import '../../features/auth/screens/phone_password_page.dart';
import '../../features/splash/splash_page.dart';

part 'app_router.gr.dart';

/// auto_route configuration.
/// After editing, run:
///   flutter pub run build_runner build --delete-conflicting-outputs
@AutoRouterConfig(replaceInRouteName: 'Page,Route')
class AppRouter extends _$AppRouter {
  @override
  List<AutoRoute> get routes => [
        AutoRoute(page: SplashRoute.page, path: '/', initial: true),
        AutoRoute(page: OnboardingRoute.page, path: '/onboarding'),
        AutoRoute(page: AuthLandingRoute.page, path: '/auth'),

        // Start flow
        AutoRoute(page: GenderStepRoute.page, path: '/auth/gender'),

        // Email flow
        AutoRoute(page: EmailInputRoute.page, path: '/auth/email'),
        AutoRoute(page: EmailOtpRoute.page, path: '/auth/email-otp'),
        AutoRoute(page: EmailPasswordRoute.page, path: '/auth/email-password'),
        AutoRoute(page: LoginRoute.page, path: '/auth/login'),

        // Phone flow
        AutoRoute(page: PhoneInputRoute.page, path: '/auth/phone'),
        AutoRoute(page: PhoneOtpRoute.page, path: '/auth/phone-otp'),
        AutoRoute(page: PhonePasswordRoute.page, path: '/auth/phone-password'),

        // Deep-link entry points
        AutoRoute(page: AuthCallbackRoute.page, path: '/auth/callback'),
        AutoRoute(page: ResetPasswordRoute.page, path: '/reset-password'),
      ];
}
