import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_colors.dart';
import '../../core/widgets/common.dart';
import '../../data/models/league.dart';
import '../../data/providers.dart';
import 'league_card.dart';
import 'league_providers.dart';

enum LeagueTab { all, created, followed }

class LeaguesScreen extends ConsumerStatefulWidget {
  const LeaguesScreen({super.key});

  @override
  ConsumerState<LeaguesScreen> createState() => _LeaguesScreenState();
}

class _LeaguesScreenState extends ConsumerState<LeaguesScreen> {
  String _query = '';
  LeagueTab _currentTab = LeagueTab.all;

  Future<void> _refresh() async {
    ref
      ..invalidate(leaguesProvider)
      ..invalidate(followsProvider)
      ..invalidate(followerCountsProvider)
      ..invalidate(teamsByIdProvider);
    await ref.read(leagueSectionsProvider.future);
  }

  bool _matches(League l) =>
      _query.isEmpty ||
      l.name.toLowerCase().contains(_query) ||
      l.courts.any((c) => '${c.name} ${c.address}'.toLowerCase().contains(_query));

  @override
  Widget build(BuildContext context) {
    final sections = ref.watch(leagueSectionsProvider);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            const SliverAppBar(
              pinned: true,
              floating: true,
              backgroundColor: AppColors.surface,
              surfaceTintColor: Colors.transparent,
              title: Text(
                'LEAGUES',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 24,
                  letterSpacing: 0.8,
                  color: AppColors.textStrong,
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 6, 20, 8),
                child: SearchBar(
                  hintText: 'Search leagues, courts or cities',
                  leading: const Icon(Icons.search),
                  elevation: const WidgetStatePropertyAll(0),
                  backgroundColor: const WidgetStatePropertyAll(Colors.white),
                  side: const WidgetStatePropertyAll(BorderSide(color: AppColors.border)),
                  shape: WidgetStatePropertyAll(
                    RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
                ),
              ),
            ),
            AsyncSliver<LeagueSections>(
              value: sections,
              onRetry: _refresh,
              data: (s) {
                final allMatching = s.all.where(_matches).toList();
                final ownedMatching = s.owned.where(_matches).toList();
                final followedMatching = s.followed.where(_matches).toList();

                return SliverList.list(
                  children: [
                    // Web-app identical tab selector: All Leagues | My Created Leagues | Followed Leagues
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 4, 20, 14),
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            _FilterTabChip(
                              label: 'All Leagues (${s.all.length})',
                              icon: Icons.public,
                              selected: _currentTab == LeagueTab.all,
                              selectedColor: AppColors.brandNavy,
                              onTap: () => setState(() => _currentTab = LeagueTab.all),
                            ),
                            const SizedBox(width: 8),
                            _FilterTabChip(
                              label: 'My Leagues (${s.owned.length})',
                              icon: Icons.workspace_premium,
                              selected: _currentTab == LeagueTab.created,
                              selectedColor: AppColors.brandNavy,
                              onTap: () => setState(() => _currentTab = LeagueTab.created),
                            ),
                            const SizedBox(width: 8),
                            _FilterTabChip(
                              label: 'Following (${s.followed.length})',
                              icon: Icons.favorite,
                              selected: _currentTab == LeagueTab.followed,
                              selectedColor: AppColors.brandRed,
                              onTap: () => setState(() => _currentTab = LeagueTab.followed),
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Tab View Rendering
                    if (_currentTab == LeagueTab.all) ...[
                      if (allMatching.isEmpty)
                        const EmptyState(
                          icon: Icons.emoji_events_outlined,
                          title: 'No leagues found',
                          message: 'No leagues match your search or have been registered yet.',
                        )
                      else
                        for (final l in allMatching)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                            child: LeagueCard(
                              league: l,
                              isOwner: s.owned.any((o) => o.id == l.id),
                            ),
                          ),
                    ] else if (_currentTab == LeagueTab.created) ...[
                      if (ownedMatching.isEmpty)
                        const EmptyState(
                          icon: Icons.emoji_events_outlined,
                          title: 'No leagues created yet',
                          message:
                              'Create a league from the BOX SCORE web studio and it will appear here.',
                        )
                      else
                        for (final l in ownedMatching)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                            child: LeagueCard(league: l, isOwner: true),
                          ),
                    ] else ...[
                      if (followedMatching.isEmpty)
                        const EmptyState(
                          icon: Icons.favorite_border,
                          title: 'Not following any leagues',
                          message: 'Tap Follow on a league to pin it to your following list.',
                        )
                      else
                        for (final l in followedMatching)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                            child: LeagueCard(
                              league: l,
                              isOwner: s.owned.any((o) => o.id == l.id),
                            ),
                          ),
                    ],
                    const SizedBox(height: 32),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterTabChip extends StatelessWidget {
  const _FilterTabChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.selectedColor,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final Color selectedColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? selectedColor : Colors.white,
      borderRadius: BorderRadius.circular(12),
      elevation: selected ? 1 : 0,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? selectedColor : AppColors.border,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 15,
                color: selected ? Colors.white : AppColors.textMuted,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                  color: selected ? Colors.white : AppColors.textStrong,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
