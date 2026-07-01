# Invitation & Tasks Screens — Flutter Layout (Antigravity reference)

Both screens share the same gradient header pattern as Recharge/VIP.

---

## My Invitation — `/invitation`

```dart
class InvitationScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [Color(0xFF2D1045), Color(0xFF1A0A2E), Color(0xFF0D0618)],
          ),
        ),
        child: SafeArea(child: Column(children: [
          _GradientHeader(title: 'My Invitation'),
          Expanded(child: ListView(padding: const EdgeInsets.all(12), children: [
            const _ShareCard(),
            const SizedBox(height: 12),
            const _StatsCard(),
            const SizedBox(height: 12),
            const _InvitedUsersList(),
          ])),
        ])),
      ),
    );
  }
}

class _ShareCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<InvitationCodeModel>(
      future: _fetchMyCode(),
      builder: (ctx, snap) {
        if (!snap.hasData) return const SizedBox(height: 180);
        final code = snap.data!.code;
        final url = 'https://merilive.com/?ref=$code';
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: const LinearGradient(
              colors: [Color(0xFF8B5CF6), Color(0xFFEC4899)],
            ),
          ),
          child: Column(children: [
            const Text('Earn 10% of your invitee\'s recharges forever 💎',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(children: [
                Expanded(child: Text('Code: $code',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
                IconButton(
                  icon: const Icon(Icons.copy, color: Colors.white, size: 18),
                  onPressed: () => Clipboard.setData(ClipboardData(text: code)),
                ),
              ]),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: ElevatedButton.icon(
                icon: const Icon(Icons.share),
                label: const Text('Share Link'),
                onPressed: () => Share.share(url),
              )),
              const SizedBox(width: 8),
              Expanded(child: OutlinedButton.icon(
                icon: const Icon(Icons.qr_code, color: Colors.white),
                label: const Text('QR Code', style: TextStyle(color: Colors.white)),
                onPressed: () => _showQrDialog(context, url),
              )),
            ]),
          ]),
        );
      },
    );
  }
}
```

## Stats card

Reads `invitation_referrals` (count), `invitation_earnings` (sum):
```
┌─────────────────────────────┐
│ 👥 12 Invited  │  $45 Earned │
└─────────────────────────────┘
```

## Invited users list

```dart
ListView.builder(
  itemCount: referrals.length,
  itemBuilder: (_, i) {
    final r = referrals[i];
    return ListTile(
      leading: AvatarWithFrame(avatarUrl: r.avatarUrl, size: 40),
      title: Text(r.displayName),
      subtitle: Text('Level ${r.level}'),
      trailing: Text('+\$${r.earnings.toStringAsFixed(2)}',
        style: const TextStyle(color: Colors.greenAccent, fontWeight: FontWeight.w700)),
    );
  },
)
```

---

## My Tasks — `/tasks` (Daily Missions)

```dart
class TasksScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [Color(0xFF2D1045), Color(0xFF1A0A2E), Color(0xFF0D0618)],
          ),
        ),
        child: SafeArea(child: Column(children: [
          _GradientHeader(title: 'Daily Missions'),
          const _DailyProgressBar(),
          const Expanded(child: _TasksList()),
        ])),
      ),
    );
  }
}

class _DailyProgressBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(
          colors: [Color(0xFFF59E0B), Color(0xFFEAB308)],
        ),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('3 / 7 completed', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          Text('+500 💎 today', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: 3 / 7,
            backgroundColor: Colors.white.withOpacity(0.3),
            valueColor: const AlwaysStoppedAnimation(Colors.white),
            minHeight: 8,
          ),
        ),
      ]),
    );
  }
}

class _TasksList extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<DailyTaskModel>>(
      future: _fetchTasks(),
      builder: (ctx, snap) {
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        return ListView.separated(
          padding: const EdgeInsets.all(12),
          itemCount: snap.data!.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) => _TaskTile(task: snap.data![i]),
        );
      },
    );
  }
}

class _TaskTile extends StatelessWidget {
  final DailyTaskModel task;
  const _TaskTile({required this.task});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: Row(children: [
        Text(task.icon, style: const TextStyle(fontSize: 24)),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(task.title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
          Text('+${task.rewardDiamonds} 💎',
            style: const TextStyle(color: Colors.amber, fontSize: 12)),
        ])),
        if (task.canClaim)
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            ),
            onPressed: () async {
              // ALWAYS use RPC — never direct profile.coins update
              await Supabase.instance.client.rpc('claim_task_reward',
                params: {'task_id': task.id});
            },
            child: const Text('Claim'),
          )
        else
          Text('${task.currentProgress}/${task.targetCount}',
            style: TextStyle(color: Colors.white.withOpacity(0.6))),
      ]),
    );
  }
}
```

## Realtime updates

```dart
Supabase.instance.client.channel('tasks:user:$uid')
  .onPostgresChanges(
    event: PostgresChangeEvent.update,
    schema: 'public', table: 'user_task_progress',
    filter: PostgresChangeFilter(
      type: PostgresChangeFilterType.eq, column: 'user_id', value: uid),
    callback: (_) => refresh(),
  ).subscribe();
```
