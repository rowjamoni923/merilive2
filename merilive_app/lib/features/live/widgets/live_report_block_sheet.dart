import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// M3 — Report / Block sheet.
///
/// Web-truth reference: `src/components/live/ReportBlockSheet.tsx`.
/// Inserts into `user_reports` (with both legacy `reason/reported_id` and
/// current `report_category/reported_user_id` columns filled) and
/// `blocked_users` (server-side unique constraint prevents duplicates).
class LiveReportBlockSheet extends StatefulWidget {
  const LiveReportBlockSheet({
    super.key,
    required this.targetUserId,
    required this.targetName,
    required this.streamId,
  });

  final String targetUserId;
  final String targetName;
  final String streamId;

  static Future<void> show(
    BuildContext context, {
    required String targetUserId,
    required String targetName,
    required String streamId,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => LiveReportBlockSheet(
        targetUserId: targetUserId,
        targetName: targetName,
        streamId: streamId,
      ),
    );
  }

  @override
  State<LiveReportBlockSheet> createState() => _LiveReportBlockSheetState();
}

class _LiveReportBlockSheetState extends State<LiveReportBlockSheet> {
  static const _reasons = <String>[
    'Inappropriate content',
    'Harassment or bullying',
    'Nudity or sexual content',
    'Violence or threats',
    'Scam or fraud',
    'Hate speech',
    'Underage host',
    'Other',
  ];

  String? _selected;
  final _notesCtrl = TextEditingController();
  bool _busy = false;

  Future<void> _report() async {
    final me = Supabase.instance.client.auth.currentUser;
    if (me == null || _selected == null || _busy) return;
    setState(() => _busy = true);
    try {
      await Supabase.instance.client.from('user_reports').insert({
        'reporter_id': me.id,
        'reported_id': widget.targetUserId,
        'reported_user_id': widget.targetUserId,
        'reason': _selected,
        'report_category': _selected,
        'description': _notesCtrl.text.trim(),
        'context_type': 'live_stream',
        'context_id': widget.streamId,
        'status': 'pending',
      });
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Report submitted. Thank you.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Report failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _block() async {
    final me = Supabase.instance.client.auth.currentUser;
    if (me == null || _busy) return;
    setState(() => _busy = true);
    try {
      await Supabase.instance.client.from('blocked_users').insert({
        'blocker_id': me.id,
        'blocked_id': widget.targetUserId,
      });
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${widget.targetName} blocked')),
      );
    } catch (e) {
      // Duplicate-key = already blocked, still treat as success.
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${widget.targetName} blocked')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.68,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      expand: false,
      builder: (_, scroll) => Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xF01F2937), Color(0xF00F172A)],
          ),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 12,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: ListView(
          controller: scroll,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text('Report ${widget.targetName}',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text('Choose a reason. Reports are reviewed by our team.',
                style: TextStyle(color: Colors.white54, fontSize: 12)),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _reasons.map((r) {
                final on = _selected == r;
                return GestureDetector(
                  onTap: () => setState(() => _selected = r),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: on
                          ? const Color(0xFFEC4899).withOpacity(0.9)
                          : Colors.white10,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                          color: on
                              ? const Color(0xFFEC4899)
                              : Colors.white24),
                    ),
                    child: Text(r,
                        style: TextStyle(
                            color: on ? Colors.white : Colors.white70,
                            fontSize: 12,
                            fontWeight: FontWeight.w600)),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _notesCtrl,
              minLines: 2,
              maxLines: 4,
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Add details (optional)',
                hintStyle: const TextStyle(color: Colors.white38),
                filled: true,
                fillColor: Colors.white10,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed:
                    _busy || _selected == null ? null : _report,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFEC4899),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: _busy
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Text('Submit report',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _busy ? null : _block,
                icon: const Icon(Icons.block_rounded,
                    color: Colors.white70, size: 18),
                label: Text('Block ${widget.targetName}',
                    style: const TextStyle(color: Colors.white70)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Colors.white24),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
