import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/level_badge.dart';
import '../widgets/avatar_with_frame.dart';
import 'direct_chat_screen.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  String _activeTab = 'messages';
  final ApiService _apiService = ApiService();
  final TextEditingController _searchController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0618),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF0D0618), Color(0xFF0A0A14), Color(0xFF0D0618)],
            stops: [0.0, 0.3, 1.0],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              _buildHeader(),
              _buildTabs(),
              _buildSearchBar(),
              Expanded(child: _buildActiveTabContent()),
            ],
          ),
        ),
      ),
      floatingActionButton: _buildBonusWidget(),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text("Messages", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
          Row(
            children: [
              _buildHeaderIcon(LucideIcons.users),
              const SizedBox(width: 12),
              _buildHeaderIcon(LucideIcons.settings),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderIcon(IconData icon) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle, border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Icon(icon, color: Colors.white, size: 20),
    );
  }

  Widget _buildTabs() {
    return Container(
      height: 44,
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Row(
        children: [
          _buildTabItem('messages', "Messages"),
          _buildTabItem('official', "Official"),
          _buildTabItem('notif', "Notifications"),
          _buildTabItem('groups', "Groups"),
        ],
      ),
    );
  }

  Widget _buildTabItem(String id, String label) {
    bool isActive = _activeTab == id;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() => _activeTab = id);
          HapticFeedback.lightImpact();
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: BoxDecoration(
            gradient: isActive ? const LinearGradient(colors: [Color(0xFFC026D3), Color(0xFF9333EA)]) : null,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Center(
            child: Text(
              label, 
              style: GoogleFonts.outfit(
                color: isActive ? Colors.white : Colors.white38, 
                fontSize: 11, 
                fontWeight: isActive ? FontWeight.bold : FontWeight.normal
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
          child: Container(
            height: 52,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Row(
              children: [
                const Icon(LucideIcons.search, color: Colors.white38, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _searchController, 
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(hintText: "Search chat...", hintStyle: TextStyle(color: Colors.white24, fontSize: 14), border: InputBorder.none)
                  )
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildActiveTabContent() {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      transitionBuilder: (Widget child, Animation<double> animation) {
        return FadeTransition(opacity: animation, child: SlideTransition(
          position: Tween<Offset>(begin: const Offset(0, 0.05), end: Offset.zero).animate(animation),
          child: child,
        ));
      },
      child: _getTabContent(),
    );
  }

  Widget _getTabContent() {
    switch (_activeTab) {
      case 'official': return _buildOfficialTab();
      case 'notif': return _buildNotificationsTab();
      case 'groups': return _buildGroupsTab();
      default: return _buildMessagesTab();
    }
  }

  Widget _buildMessagesTab() {
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: _apiService.getConversationsStream(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator(color: Colors.purple, strokeWidth: 2));
        if (!snapshot.hasData || snapshot.data!.isEmpty) return _buildEmptyState("No messages yet", LucideIcons.messageSquare);
        
        final convs = snapshot.data!;
        return ListView.separated(
          key: const ValueKey('messages'),
          padding: const EdgeInsets.only(bottom: 100),
          itemCount: convs.length,
          separatorBuilder: (context, index) => Divider(color: Colors.white.withOpacity(0.04), height: 1, indent: 80),
          itemBuilder: (context, index) => FadeInUp(
            delay: Duration(milliseconds: index * 50),
            duration: const Duration(milliseconds: 400),
            child: _buildChatTile(convs[index]),
          ),
        );
      },
    );
  }

  Widget _buildGroupsTab() {
    final groups = [
      {'name': 'MeriLive Global 🌍', 'members': '12.5k', 'msg': 'Welcome to the official global group!', 'time': '2m ago', 'unread': 5, 'color': Colors.blue},
      {'name': 'Top Earners 💎', 'members': '850', 'msg': 'New rewards have been distributed.', 'time': '1h ago', 'unread': 0, 'color': Colors.amber},
      {'name': 'Level 5+ VIP 👑', 'members': '1.2k', 'msg': 'Special event starting tonight!', 'time': '3h ago', 'unread': 12, 'color': Colors.purple},
    ];

    return ListView.separated(
      key: const ValueKey('groups'),
      padding: const EdgeInsets.all(16),
      itemCount: groups.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) => FadeInRight(
        delay: Duration(milliseconds: index * 100),
        child: _buildCategoryTile(
          icon: LucideIcons.users,
          color: groups[index]['color'] as Color,
          title: groups[index]['name'] as String,
          subtitle: groups[index]['msg'] as String,
          trailing: groups[index]['time'] as String,
          badge: (groups[index]['unread'] as int) != 0 ? groups[index]['unread'].toString() : null,
          extraInfo: "${groups[index]['members']} members",
        ),
      ),
    );
  }

  Widget _buildNotificationsTab() {
    final notifs = [
      {'icon': LucideIcons.heart, 'color': Colors.pinkAccent, 'title': "Interactions", 'sub': "Sazzad and 5 others liked your reel.", 'time': "Just now", 'badge': "6"},
      {'icon': LucideIcons.userPlus, 'color': Colors.blueAccent, 'title': "New Followers", 'sub': "You have 5 new followers today.", 'time': "1h ago", 'badge': "5"},
      {'icon': LucideIcons.messageCircle, 'color': Colors.greenAccent, 'title': "Comments", 'sub': "Ayesha commented on your live stream.", 'time': "3h ago"},
    ];
    return ListView.separated(
      key: const ValueKey('notif'),
      padding: const EdgeInsets.all(16),
      itemCount: notifs.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) => FadeInLeft(
        delay: Duration(milliseconds: index * 100),
        child: _buildCategoryTile(
          icon: notifs[index]['icon'] as IconData, 
          color: notifs[index]['color'] as Color, 
          title: notifs[index]['title'] as String, 
          subtitle: notifs[index]['sub'] as String, 
          trailing: notifs[index]['time'] as String, 
          badge: notifs[index]['badge'] as String?,
        ),
      ),
    );
  }

  Widget _buildOfficialTab() {
    final officials = [
      {'icon': LucideIcons.shieldCheck, 'color': const Color(0xFF8B5CF6), 'title': "MeriLive Official", 'sub': "Welcome to the family! Start your first live session.", 'time': "Now", 'badge': "New"},
      {'icon': LucideIcons.award, 'color': Colors.amber, 'title': "Weekly Leaderboard", 'sub': "Check out this week's top earners and rankers!", 'time': "1d ago"},
      {'icon': LucideIcons.shieldAlert, 'color': Colors.redAccent, 'title': "Security Alert", 'sub': "Login detected from Dhaka, BD.", 'time': "2d ago"},
    ];
    return ListView.separated(
      key: const ValueKey('official'),
      padding: const EdgeInsets.all(16),
      itemCount: officials.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) => FadeInUp(
        delay: Duration(milliseconds: index * 100),
        child: _buildCategoryTile(
          icon: officials[index]['icon'] as IconData, 
          color: officials[index]['color'] as Color, 
          title: officials[index]['title'] as String, 
          subtitle: officials[index]['sub'] as String, 
          trailing: officials[index]['time'] as String, 
          badge: officials[index]['badge'] as String?,
        ),
      ),
    );
  }


  Widget _buildCategoryTile({required IconData icon, required Color color, required String title, required String subtitle, required String trailing, String? badge, String? extraInfo}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02), 
        borderRadius: BorderRadius.circular(20), 
        border: Border.all(color: Colors.white.withOpacity(0.04)),
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          padding: const EdgeInsets.all(12), 
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [color.withOpacity(0.2), color.withOpacity(0.05)]), 
            shape: BoxShape.circle,
            border: Border.all(color: color.withOpacity(0.2)),
          ), 
          child: Icon(icon, color: color, size: 24)
        ),
        title: Row(
          children: [
            Expanded(child: Text(title, style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.9), fontWeight: FontWeight.bold, fontSize: 15))),
            if (extraInfo != null) Text(extraInfo, style: const TextStyle(color: Colors.white24, fontSize: 10)),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(subtitle, style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(trailing, style: TextStyle(color: Colors.white.withOpacity(0.15), fontSize: 10)),
            if (badge != null) ...[
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), 
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [color.withOpacity(0.8), color]), 
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [BoxShadow(color: color.withOpacity(0.3), blurRadius: 6)],
                ), 
                child: Text(badge, style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w900))
              )
            ]
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(String msg, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.white.withOpacity(0.03), size: 84),
          const SizedBox(height: 16),
          Text(msg, style: GoogleFonts.outfit(color: Colors.white24, fontSize: 16, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }


  Widget _buildChatTile(Map<String, dynamic> conv) {
    final other = conv['other_user'] ?? {};
    final String lastMsg = conv['last_message'] ?? 'No messages yet';
    final int unreadCount = conv['unread_count'] ?? 0;
    final bool isOnline = other['is_online'] ?? false;
    final String countryFlag = other['country_flag'] ?? "🌍";

    return InkWell(
      onTap: () {
        HapticFeedback.selectionClick();
        Navigator.push(context, MaterialPageRoute(builder: (context) => DirectChatScreen(conversationId: conv['id'].toString(), otherUser: other)));
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Stack(
              children: [
                AvatarWithFrame(userId: other['id'] ?? "", src: other['avatar_url'], size: 54, level: other['user_level'] ?? 1),
                if (isOnline)
                  Positioned(
                    right: 2, bottom: 2,
                    child: Container(
                      width: 14, height: 14,
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981), 
                        shape: BoxShape.circle, 
                        border: Border.all(color: const Color(0xFF0D0618), width: 2.5),
                        boxShadow: [BoxShadow(color: const Color(0xFF10B981).withOpacity(0.3), blurRadius: 4)],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(child: Text(other['display_name'] ?? "User", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.9), fontWeight: FontWeight.bold, fontSize: 16), overflow: TextOverflow.ellipsis)),
                      const SizedBox(width: 8),
                      Text(countryFlag, style: const TextStyle(fontSize: 12)),
                      const SizedBox(width: 6),
                      LevelBadge(level: other['user_level'] ?? 1, size: 'xs'),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(lastMsg, style: TextStyle(color: unreadCount > 0 ? Colors.white70 : Colors.white38, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text("Now", style: TextStyle(color: Colors.white.withOpacity(0.15), fontSize: 10, fontWeight: FontWeight.w500)),
                if (unreadCount > 0) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFFEF4444), Color(0xFFDC2626)]),
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: [BoxShadow(color: Colors.red.withOpacity(0.2), blurRadius: 8)],
                    ),
                    child: Text(unreadCount.toString(), style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBonusWidget() {
    return Container(
      width: 60, height: 60,
      decoration: BoxDecoration(
        shape: BoxShape.circle, 
        gradient: const LinearGradient(colors: [Colors.amber, Colors.orange]),
        boxShadow: [BoxShadow(color: Colors.amber.withOpacity(0.3), blurRadius: 15)],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text("150%", style: GoogleFonts.outfit(color: const Color(0xFF0D0618), fontSize: 14, fontWeight: FontWeight.w900)),
          const Text("BONUS", style: TextStyle(color: Color(0xFF0D0618), fontSize: 8, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

