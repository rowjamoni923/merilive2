import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/router/app_router.gr.dart';
import '../../core/theme/design_tokens.dart';
import '../home/data/thumbnail.dart';
import 'bloc/search_cubit.dart';
import 'data/search_repository.dart';
import 'data/search_user.dart';
import 'data/tag_catalog.dart';

/// H7 — Search screen. Mirrors `src/pages/SearchUsers.tsx`:
///   • Digits-only App-UID query with 300 ms debounce.
///   • Multi-select tag filter sheet driving `profiles_public.tags` overlap.
///   • Recent searches (in-memory, capped at 5).
///   • Follow / Unfollow inline with optimistic update + error rollback.
///   • Tapping a result → `/profile-detail/:userId`.
@RoutePage()
class SearchPage extends StatefulWidget {
  const SearchPage({super.key});

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  late final SearchCubit _cubit;
  final _controller = TextEditingController();

  @override
  void initState() {
    super.initState();
    final client = Supabase.instance.client;
    _cubit = SearchCubit(
      SearchRepository(client),
      currentUserId: client.auth.currentUser?.id,
    )..bootstrap();
  }

  @override
  void dispose() {
    _cubit.close();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _cubit,
      child: Scaffold(
        backgroundColor: DT.homeBg,
        body: SafeArea(
          child: Column(
            children: [
              _SearchHeader(controller: _controller),
              const _SelectedTagsBar(),
              Expanded(
                child: BlocBuilder<SearchCubit, SearchState>(
                  builder: (context, state) {
                    if (!state.hasActiveInput) {
                      return _RecentSearchesView(
                        recents: state.recents,
                        onOpen: _openProfile,
                        onRemove: (id) => _cubit.removeRecent(id),
                        onClearAll: () => _cubit.clearRecents(),
                      );
                    }
                    if (state.isLoading && state.results.isEmpty) {
                      return const Center(
                        child: CircularProgressIndicator(strokeWidth: 2),
                      );
                    }
                    if (state.errorMessage != null && state.results.isEmpty) {
                      return _MessageView(
                        icon: Icons.wifi_off_rounded,
                        title: 'Search failed',
                        subtitle: state.errorMessage!,
                        iconColor: DT.statusLive,
                      );
                    }
                    if (state.results.isEmpty) {
                      return const _MessageView(
                        icon: Icons.search_off_rounded,
                        title: 'No matches',
                        subtitle:
                            'Try a different App ID or clear a few tag filters.',
                      );
                    }
                    return _ResultsList(
                      results: state.results,
                      followingIds: state.followingIds,
                      onOpen: _openProfile,
                      onFollow: _handleFollow,
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openProfile(SearchUser user) {
    _cubit.rememberTap(user);
    HapticFeedback.selectionClick();
    context.router.push(ProfileDetailPlaceholderRoute(userId: user.id));
  }

  Future<void> _handleFollow(SearchUser user) async {
    final err = await _cubit.toggleFollow(user.id);
    if (!mounted) return;
    if (err != null) _toast(err);
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

class _SearchHeader extends StatelessWidget {
  const _SearchHeader({required this.controller});
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<SearchCubit>();
    return Container(
      decoration: const BoxDecoration(
        color: DT.homeHeaderCard,
        border: Border(bottom: BorderSide(color: DT.homeChipBorder)),
      ),
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 10),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            color: DT.homeHeading,
            onPressed: () => Navigator.of(context).maybePop(),
            tooltip: 'Back',
          ),
          Expanded(
            child: Container(
              height: 40,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: DT.subTabTrack,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: DT.subTabTrackBorder),
              ),
              child: Row(
                children: [
                  const Icon(Icons.search_rounded,
                      size: 18, color: DT.homeMutedInk),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: controller,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(10),
                      ],
                      onChanged: cubit.setQuery,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: DT.homeHeading,
                      ),
                      decoration: const InputDecoration(
                        isCollapsed: true,
                        border: InputBorder.none,
                        hintText: 'Search by App ID',
                        hintStyle: TextStyle(
                          color: DT.homeMutedInk,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                  BlocBuilder<SearchCubit, SearchState>(
                    buildWhen: (p, n) => p.query != n.query,
                    builder: (context, state) => state.query.isEmpty
                        ? const SizedBox.shrink()
                        : IconButton(
                            padding: EdgeInsets.zero,
                            constraints:
                                const BoxConstraints.tightFor(width: 28, height: 28),
                            iconSize: 16,
                            icon: const Icon(Icons.close_rounded,
                                color: DT.homeMutedInk),
                            onPressed: () {
                              controller.clear();
                              cubit.setQuery('');
                            },
                          ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          _FilterButton(onTap: () => _openFilterSheet(context)),
        ],
      ),
    );
  }

  void _openFilterSheet(BuildContext context) {
    final cubit = context.read<SearchCubit>();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: const _FilterSheet(),
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SearchCubit, SearchState>(
      buildWhen: (p, n) => p.selectedTags.length != n.selectedTags.length,
      builder: (context, state) {
        final count = state.selectedTags.length;
        final active = count > 0;
        return Material(
          color: Colors.transparent,
          child: InkResponse(
            onTap: onTap,
            radius: 26,
            child: Container(
              height: 40,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: active ? DT.homeHeading : DT.homeChipBg,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: active ? DT.homeHeading : DT.homeChipBorder,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.tune_rounded,
                      size: 18,
                      color: active ? Colors.white : DT.homeHeading),
                  if (active) ...[
                    const SizedBox(width: 6),
                    Text(
                      '$count',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Selected-tags horizontal strip
// ─────────────────────────────────────────────────────────────────────────────

class _SelectedTagsBar extends StatelessWidget {
  const _SelectedTagsBar();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SearchCubit, SearchState>(
      buildWhen: (p, n) => p.selectedTags != n.selectedTags,
      builder: (context, state) {
        if (state.selectedTags.isEmpty) return const SizedBox.shrink();
        return Container(
          height: 44,
          color: DT.homeHeaderCard,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            scrollDirection: Axis.horizontal,
            itemCount: state.selectedTags.length + 1,
            separatorBuilder: (_, __) => const SizedBox(width: 6),
            itemBuilder: (context, i) {
              if (i == state.selectedTags.length) {
                return TextButton.icon(
                  onPressed: () => context.read<SearchCubit>().clearTags(),
                  icon: const Icon(Icons.close, size: 14),
                  label: const Text('Clear'),
                  style: TextButton.styleFrom(
                    foregroundColor: DT.homeMutedInk,
                    textStyle:
                        const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                );
              }
              final tag = state.selectedTags[i];
              return _RemovableTagChip(
                label: tag,
                onRemove: () => context.read<SearchCubit>().toggleTag(tag),
              );
            },
          ),
        );
      },
    );
  }
}

class _RemovableTagChip extends StatelessWidget {
  const _RemovableTagChip({required this.label, required this.onRemove});
  final String label;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: DT.homeHeading,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              )),
          const SizedBox(width: 6),
          GestureDetector(
            onTap: onRemove,
            child: const Icon(Icons.close, size: 14, color: Colors.white),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter sheet
// ─────────────────────────────────────────────────────────────────────────────

class _FilterSheet extends StatelessWidget {
  const _FilterSheet();

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: DT.homeHeaderCard,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: DT.homeChipBorder,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 12, 6),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Filter by tags',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: DT.homeHeading,
                        ),
                      ),
                    ),
                    BlocBuilder<SearchCubit, SearchState>(
                      buildWhen: (p, n) =>
                          p.selectedTags.length != n.selectedTags.length,
                      builder: (context, state) => state.selectedTags.isEmpty
                          ? const SizedBox.shrink()
                          : TextButton(
                              onPressed: () =>
                                  context.read<SearchCubit>().clearTags(),
                              child: const Text('Reset'),
                            ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => Navigator.of(context).maybePop(),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                  itemCount: kTagCategories.length,
                  itemBuilder: (context, i) {
                    final cat = kTagCategories[i];
                    return _TagCategoryBlock(category: cat);
                  },
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  child: SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: FilledButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      style: FilledButton.styleFrom(
                        backgroundColor: DT.homeHeading,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      child: const Text(
                        'Apply',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _TagCategoryBlock extends StatelessWidget {
  const _TagCategoryBlock({required this.category});
  final TagCategory category;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8, left: 2),
            child: Text(
              '${category.icon}  ${category.name}',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: DT.homeHeading,
                letterSpacing: 0.2,
              ),
            ),
          ),
          BlocBuilder<SearchCubit, SearchState>(
            buildWhen: (p, n) => p.selectedTags != n.selectedTags,
            builder: (context, state) => Wrap(
              spacing: 8,
              runSpacing: 8,
              children: category.tags.map((t) {
                final selected = state.selectedTags.contains(t);
                return GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    context.read<SearchCubit>().toggleTag(t);
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: selected ? DT.homeHeading : DT.subTabTrack,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color:
                            selected ? DT.homeHeading : DT.subTabTrackBorder,
                      ),
                    ),
                    child: Text(
                      t,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: selected ? Colors.white : DT.homeHeading,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Results / Recents
// ─────────────────────────────────────────────────────────────────────────────

class _ResultsList extends StatelessWidget {
  const _ResultsList({
    required this.results,
    required this.followingIds,
    required this.onOpen,
    required this.onFollow,
  });

  final List<SearchUser> results;
  final Set<String> followingIds;
  final ValueChanged<SearchUser> onOpen;
  final ValueChanged<SearchUser> onFollow;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 6),
      itemCount: results.length,
      separatorBuilder: (_, __) => const Divider(
        height: 1,
        thickness: 0.5,
        indent: 78,
        color: Color(0xFFEDE6D3),
      ),
      itemBuilder: (context, i) {
        final u = results[i];
        return _UserRow(
          user: u,
          following: followingIds.contains(u.id),
          onTap: () => onOpen(u),
          onFollow: () => onFollow(u),
        );
      },
    );
  }
}

class _RecentSearchesView extends StatelessWidget {
  const _RecentSearchesView({
    required this.recents,
    required this.onOpen,
    required this.onRemove,
    required this.onClearAll,
  });

  final List<SearchUser> recents;
  final ValueChanged<SearchUser> onOpen;
  final ValueChanged<String> onRemove;
  final VoidCallback onClearAll;

  @override
  Widget build(BuildContext context) {
    if (recents.isEmpty) {
      return const _MessageView(
        icon: Icons.search_rounded,
        title: 'Search users',
        subtitle:
            'Enter an App ID or pick tags to find people. Recent taps will appear here.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Recent',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: DT.homeHeading,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
              TextButton(
                onPressed: onClearAll,
                child: const Text('Clear all'),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            padding: EdgeInsets.zero,
            itemCount: recents.length,
            separatorBuilder: (_, __) => const Divider(
              height: 1,
              thickness: 0.5,
              indent: 78,
              color: Color(0xFFEDE6D3),
            ),
            itemBuilder: (context, i) {
              final u = recents[i];
              return _UserRow(
                user: u,
                following: false,
                onTap: () => onOpen(u),
                onFollow: null,
                trailing: IconButton(
                  icon: const Icon(Icons.close_rounded,
                      size: 18, color: DT.homeMutedInk),
                  onPressed: () => onRemove(u.id),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// User row
// ─────────────────────────────────────────────────────────────────────────────

class _UserRow extends StatelessWidget {
  const _UserRow({
    required this.user,
    required this.following,
    required this.onTap,
    this.onFollow,
    this.trailing,
  });

  final SearchUser user;
  final bool following;
  final VoidCallback onTap;
  final VoidCallback? onFollow;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final photo = enhanceThumbnail(user.avatarUrl, width: 120, quality: 82);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 12, 10),
        child: Row(
          children: [
            _Avatar(url: photo, name: user.bestName, online: user.isOnline == true),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          user.bestName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: DT.homeHeading,
                          ),
                        ),
                      ),
                      if (user.countryFlag != null &&
                          user.countryFlag!.isNotEmpty) ...[
                        const SizedBox(width: 6),
                        Text(user.countryFlag!,
                            style: const TextStyle(fontSize: 14)),
                      ],
                      if (user.isVerified == true) ...[
                        const SizedBox(width: 4),
                        const Icon(Icons.verified_rounded,
                            size: 14, color: Color(0xFF3B82F6)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    user.appUid != null && user.appUid!.isNotEmpty
                        ? 'ID: ${user.appUid}'
                        : (user.bio ?? ''),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: DT.homeMutedInk,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (trailing != null) trailing! else _FollowButton(
              following: following,
              onTap: onFollow,
            ),
          ],
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.url, required this.name, required this.online});
  final String? url;
  final String name;
  final bool online;

  @override
  Widget build(BuildContext context) {
    final initials = name.trim().isEmpty
        ? '?'
        : name.trim().substring(0, 1).toUpperCase();
    return SizedBox(
      width: 52,
      height: 52,
      child: Stack(
        children: [
          Positioned.fill(
            child: ClipOval(
              child: url == null
                  ? Container(
                      color: const Color(0xFFF1E9D0),
                      alignment: Alignment.center,
                      child: Text(
                        initials,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: DT.homeHeading,
                        ),
                      ),
                    )
                  : Image.network(
                      url!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: const Color(0xFFF1E9D0),
                        alignment: Alignment.center,
                        child: Text(initials,
                            style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: DT.homeHeading)),
                      ),
                    ),
            ),
          ),
          if (online)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: 14,
                height: 14,
                decoration: BoxDecoration(
                  color: const Color(0xFF22C55E),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _FollowButton extends StatelessWidget {
  const _FollowButton({required this.following, required this.onTap});
  final bool following;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    if (onTap == null) return const SizedBox.shrink();
    return SizedBox(
      height: 30,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          minimumSize: const Size(0, 30),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          side: BorderSide(
            color: following ? DT.homeChipBorder : DT.homeHeading,
          ),
          backgroundColor:
              following ? DT.homeChipBg : DT.homeHeading,
          foregroundColor: following ? DT.homeHeading : Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(999),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              following ? Icons.check_rounded : Icons.person_add_alt_1_rounded,
              size: 14,
            ),
            const SizedBox(width: 4),
            Text(
              following ? 'Following' : 'Follow',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty / error message
// ─────────────────────────────────────────────────────────────────────────────

class _MessageView extends StatelessWidget {
  const _MessageView({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.iconColor = DT.homeMutedInk,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: iconColor),
            const SizedBox(height: 10),
            Text(title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: DT.homeHeading,
                )),
            const SizedBox(height: 4),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: DT.homeMutedInk),
            ),
          ],
        ),
      ),
    );
  }
}
