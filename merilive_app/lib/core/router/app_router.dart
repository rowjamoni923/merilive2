import 'package:auto_route/auto_route.dart';

import '../../features/auth/screens/auth_callback_page.dart';
import '../../features/auth/screens/auth_landing_page.dart';
import '../../features/auth/screens/email_input_page.dart';
import '../../features/auth/screens/email_otp_page.dart';
import '../../features/auth/screens/email_password_page.dart';
import '../../features/auth/screens/gender_step_page.dart';
import '../../features/auth/screens/login_page.dart';
import '../../features/auth/screens/onboarding_page.dart';
import '../../features/auth/screens/phone_input_page.dart';
import '../../features/auth/screens/phone_otp_page.dart';
import '../../features/auth/screens/phone_password_page.dart';
import '../../features/auth/screens/reset_password_page.dart';
import '../../features/call/screens/incoming_call_page.dart';
import '../../features/home/home_shell_page.dart';


import '../../features/home/screens/action_placeholders.dart';
import '../../features/live/screens/live_feed_page.dart';
import '../../features/live/screens/live_stream_page.dart';
import '../../features/match/screens/match_call_page.dart';
import '../../features/leaderboard/leaderboard_page.dart';
import '../../features/party/screens/party_room_page.dart';
import '../../features/search/search_page.dart';
import '../../features/splash/splash_page.dart';
import '../../features/verification/screens/face_verification_page.dart';


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
        AutoRoute(page: HomeShellRoute.page, path: '/home'),

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

        // "+" FAB honest placeholders (full features land in later sectors)
        AutoRoute(page: GoLivePlaceholderRoute.page, path: '/go-live'),
        AutoRoute(page: CreatePartyPlaceholderRoute.page, path: '/create-party'),
        AutoRoute(page: RandomCallPlaceholderRoute.page, path: '/match-call'),
        AutoRoute(page: FaceVerificationRoute.page, path: '/face-verification'),

        // M13 — Incoming private-call ringer (fullscreen). Accept path uses
        // an imperative Navigator.push to ActiveCallPage with the connected
        // PrivateCallBridge (URL-friendly route not needed for post-accept).
        AutoRoute(
          page: IncomingCallRoute.page,
          path: '/call/incoming/:callId',
          fullscreenDialog: true,
        ),



        // Home HostCard tap destinations (H4)
        AutoRoute(
          page: LiveStreamRoute.page,
          path: '/live/:streamId',
        ),
        // Live viewer feed swipe (TikTok/Chamet/Bigo/Hollah/WeJoy style).
        AutoRoute(page: LiveFeedRoute.page, path: '/live-feed'),
        AutoRoute(page: LiveFeedRoute.page, path: '/live-feed/:streamId'),
        AutoRoute(
          page: ProfileDetailPlaceholderRoute.page,
          path: '/profile-detail/:userId',
        ),

        // Party Discovery → Party Room (real broadcast + viewer page, PD5).
        AutoRoute(
          page: PartyRoomRoute.page,
          path: '/party/:roomId',
        ),


        // H7 — user search (App-ID + tag filters).
        AutoRoute(page: SearchRoute.page, path: '/search'),

        // H8 — leaderboard (Charm / Game / Wealth / PK × D/W/M).
        AutoRoute(page: LeaderboardRoute.page, path: '/leaderboard'),
      ];
}
