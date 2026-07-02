import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../gifting/data/gift_catalog_repository.dart';
import '../../gifting/widgets/unified_gift_sheet.dart';
import '../bloc/party_room_cubit.dart';
import '../data/party_models.dart';

/// PD7 — Party gift entry point.
///
/// Thin adapter that builds a recipient list from the current party seats
/// and delegates to the app-wide [showUnifiedGiftSheet]. The panel, grid,
/// quantities, and submit flow are identical across every surface.
Future<void> showPartyGiftSheet(BuildContext context) async {
  final cubit = context.read<PartyRoomCubit>();
  final state = cubit.state;
  if (state.room == null) return;

  final host = state.host;
  final recipients = <GiftRecipient>[
    if (host != null)
      GiftRecipient(
        id: host.id,
        label: host.displayName,
        avatarUrl: host.avatarUrl,
        badge: 'Host',
      ),
    for (final s in state.seats)
      if (!s.isEmpty && s.userId != null && s.userId != host?.id)
        GiftRecipient(
          id: s.userId!,
          label: s.displayName ?? 'Guest',
          avatarUrl: s.avatarUrl,
          badge: 'Seat ${s.seatNumber}',
        ),
  ];
  if (recipients.isEmpty) return;

  // Video / audio / game rooms are distinguished by the room type so admin
  // analytics can attribute gifts to the exact surface.
  final surface = switch (state.room?.roomType) {
    PartyRoomType.audio => GiftSurface.partyAudio,
    PartyRoomType.game => GiftSurface.partyGame,
    _ => GiftSurface.partyVideo,
  };

  await showUnifiedGiftSheet(
    context,
    surface: surface,
    recipients: recipients,
    contextId: cubit.roomId,
    initialRecipientId: host?.id,
  );
}
