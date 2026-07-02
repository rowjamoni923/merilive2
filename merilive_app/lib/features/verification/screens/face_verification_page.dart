import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

import '../../embedded/embedded_web_page.dart';

/// Phase C-14 — Face Verification.
///
/// Renders the existing web `/face-verification` page inside an embedded
/// WebView until the native camera-based verification lands. Session is
/// hydrated by `EmbeddedWebPage` so the user is authenticated on entry.
@RoutePage()
class FaceVerificationPage extends StatelessWidget {
  const FaceVerificationPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const EmbeddedWebPage(
      path: '/face-verification',
      title: 'Face Verification',
    );
  }
}
