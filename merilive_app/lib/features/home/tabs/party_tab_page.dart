import 'package:flutter/material.dart';

import '../../party/screens/party_discovery_page.dart';

/// Party tab — renders the Party Discovery page (party rooms only, no live
/// streaming cards). Fully wired data + filters + realtime; entering a room
/// pushes to the Party Room placeholder until the broadcast step lands.
class PartyTabPage extends StatelessWidget {
  const PartyTabPage({super.key});

  @override
  Widget build(BuildContext context) => const PartyDiscoveryPage();
}
