import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../theme/app_theme.dart';
import 'dart:ui';

class UnifiedViewerPanel extends StatelessWidget {
  final String streamId;

  const UnifiedViewerPanel({super.key, required this.streamId});

  @override
  Widget build(BuildContext context) {
    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
      child: Container(
        height: 500,
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.8),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          children: [
            // Handle
            Container(
              margin: const EdgeInsets.symmetric(vertical: 15),
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
            ),

            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Text("Online Viewers", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  Spacer(),
                  Icon(Icons.people_outline, color: Colors.white54, size: 20),
                ],
              ),
            ),
            const SizedBox(height: 15),

            Expanded(
              child: FutureBuilder(
                future: Supabase.instance.client
                    .from('stream_viewers')
                    .select('*, viewer:profiles(*)')
                    .eq('stream_id', streamId)
                    .is_('left_at', null),
                builder: (context, snapshot) {
                  if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                  
                  final viewers = snapshot.data as List;
                  if (viewers.isEmpty) return const Center(child: Text("No viewers yet", style: TextStyle(color: Colors.white54)));

                  return ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    itemCount: viewers.length,
                    separatorBuilder: (context, index) => const Divider(color: Colors.white10),
                    itemBuilder: (context, index) {
                      final viewer = viewers[index]['viewer'];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(backgroundImage: NetworkImage(viewer['avatar_url'] ?? '')),
                        title: Text(viewer['display_name'] ?? 'User', style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                        subtitle: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(color: Colors.amber, borderRadius: BorderRadius.circular(5)),
                              child: Text("Lv.${viewer['user_level'] ?? 1}", style: const TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                        trailing: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 6),
                          decoration: BoxDecoration(border: Border.all(color: AppTheme.primaryPink), borderRadius: BorderRadius.circular(20)),
                          child: const Text("View", style: TextStyle(color: AppTheme.primaryPink, fontSize: 12)),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
