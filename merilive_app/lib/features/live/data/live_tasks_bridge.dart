import 'package:supabase_flutter/supabase_flutter.dart';

import '../widgets/live_tasks_card.dart';

/// H5 P0 #5 — Live Tasks bridge (Flutter parity with
/// `src/components/live/LiveTasksCard.tsx`).
///
/// Reads active in-live tasks + host progress and calls the
/// `claim_task_reward` RPC. All reward numbers are admin-configured — never
/// hardcoded (see `daily_tasks` admin table).
class LiveTasksBridge {
  LiveTasksBridge._();
  static final instance = LiveTasksBridge._();

  final _client = Supabase.instance.client;

  /// Loads in-live tasks + progress for [hostId] on the current day.
  Future<List<LiveTask>> loadForHost(String hostId) async {
    final tasks = await _client
        .from('daily_tasks')
        .select(
            'id,title,reward_coins,reward_beans,required_count,display_order')
        .eq('is_active', true)
        .eq('show_in_live', true)
        .order('display_order');

    if (tasks.isEmpty) return const <LiveTask>[];

    final today = _taskDate();
    final progressRows = await _client
        .from('user_task_progress')
        .select('task_id,current_progress,is_completed,is_claimed')
        .eq('user_id', hostId)
        .eq('reset_date', today);
    final progress = <String, Map<String, dynamic>>{};
    for (final r in progressRows) {
      progress[r['task_id'] as String] = Map<String, dynamic>.from(r);
    }

    return tasks.map<LiveTask>((row) {
      final id = row['id'] as String;
      final title = (row['title'] as String?) ?? 'Task';
      final goal = (row['required_count'] as num?)?.toInt() ?? 1;
      final rewardCoins = ((row['reward_coins'] as num?)?.toInt() ?? 0) +
          ((row['reward_beans'] as num?)?.toInt() ?? 0);
      final p = progress[id];
      final progressN = (p?['current_progress'] as num?)?.toInt() ?? 0;
      final completed = (p?['is_completed'] as bool?) ?? false;
      final claimed = (p?['is_claimed'] as bool?) ?? false;
      return LiveTask(
        id: id,
        title: title,
        progress: progressN,
        goal: goal,
        rewardCoins: rewardCoins,
        completed: completed,
        claimed: claimed,
      );
    }).toList(growable: false);
  }

  /// Calls `claim_task_reward` RPC. Returns error string or `null` on success.
  Future<String?> claim(String taskId) async {
    try {
      final res = await _client.rpc('claim_task_reward', params: {
        '_task_id': taskId,
      });
      if (res is Map && res['success'] == true) return null;
      if (res is Map) return (res['error'] as String?) ?? 'Failed to claim';
      return 'Failed to claim';
    } catch (e) {
      return e.toString();
    }
  }

  String _taskDate() {
    final now = DateTime.now().toUtc();
    return '${now.year.toString().padLeft(4, '0')}-'
        '${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
  }
}
