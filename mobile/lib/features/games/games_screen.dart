import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_colors.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/status_badges.dart';
import '../../data/providers.dart';
import 'game_card.dart';
import 'games_providers.dart';

enum GameFilter { all, live, upcoming, finals }

extension on GameFilter {
  String get label => switch (this) {
        GameFilter.all => 'All',
        GameFilter.live => 'Playing now',
        GameFilter.upcoming => 'Upcoming',
        GameFilter.finals => 'Final',
      };

  bool test(GameItem g) => switch (this) {
        GameFilter.all => true,
        GameFilter.live => g.isPlayingNow,
        GameFilter.upcoming => !g.isPlayingNow && !g.isFinal,
        GameFilter.finals => g.isFinal,
      };
}

class GamesScreen extends ConsumerStatefulWidget {
  const GamesScreen({super.key});

  @override
  ConsumerState<GamesScreen> createState() => _GamesScreenState();
}

class _GamesScreenState extends ConsumerState<GamesScreen> {
  GameFilter _filter = GameFilter.all;

  Future<void> _refresh() async {
    ref
      ..invalidate(leaguesProvider)
      ..invalidate(followsProvider)
      ..invalidate(teamsByIdProvider);
    await ref.read(gamesFeedProvider.future);
  }

  @override
  Widget build(BuildContext context) {
    final feed = ref.watch(gamesFeedProvider);
    final liveCount = feed.valueOrNull?.inProgress.length ?? 0;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar(
              pinned: true,
              floating: true,
              backgroundColor: AppColors.surface,
              surfaceTintColor: Colors.transparent,
              title: const Text(
                'GAMES',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 24,
                  letterSpacing: 0.8,
                  color: AppColors.textStrong,
                ),
              ),
              actions: [
                if (liveCount > 0)
                  Padding(
                    padding: const EdgeInsets.only(right: 16),
                    child: Row(
                      children: [
                        const LiveBadge(),
                        const SizedBox(width: 6),
                        Text('$liveCount',
                            style: const TextStyle(fontWeight: FontWeight.w900)),
                      ],
                    ),
                  ),
              ],
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(top: 6, bottom: 4),
                child: SizedBox(
                  height: 42,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    scrollDirection: Axis.horizontal,
                    itemCount: GameFilter.values.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, i) {
                      final f = GameFilter.values[i];
                      return ChoiceChip(
                        label: Text(f.label),
                        selected: _filter == f,
                        selectedColor: AppColors.brandRed,
                        labelStyle: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                          color: _filter == f ? Colors.white : AppColors.textStrong,
                        ),
                        showCheckmark: false,
                        onSelected: (_) => setState(() => _filter = f),
                      );
                    },
                  ),
                ),
              ),
            ),
            AsyncSliver<GamesFeed>(
              value: feed,
              onRetry: _refresh,
              loading: const SkeletonList(itemHeight: 150),
              data: (f) {
                final mine = f.myLeagues.where(_filter.test).toList();
                final following = f.following.where(_filter.test).toList();
                final discover = f.discover.where(_filter.test).toList();

                return SliverList.list(
                  children: [
                    SectionHeader(
                      title: 'My Leagues',
                      subtitle: 'Latest games from leagues you created',
                      icon: Icons.workspace_premium,
                      count: mine.length,
                    ),
                    ..._list(
                      mine,
                      empty: const EmptyState(
                        icon: Icons.sports_basketball_outlined,
                        title: 'No games here',
                        message: 'Schedule games for your league in the web studio.',
                      ),
                    ),
                    SectionHeader(
                      title: 'Following',
                      subtitle: 'Latest games from leagues you follow',
                      icon: Icons.favorite_outline,
                      count: following.length,
                    ),
                    ..._list(
                      following,
                      empty: const EmptyState(
                        icon: Icons.favorite_border,
                        title: 'No followed games',
                        message: 'Follow leagues from the League tab to see their games.',
                      ),
                    ),
                    if (discover.isNotEmpty) ...[
                      SectionHeader(
                        title: 'All League Games',
                        subtitle: 'Tournament games across BOX SCORE',
                        icon: Icons.sports_basketball,
                        count: discover.length,
                      ),
                      ..._list(
                        discover,
                        empty: const EmptyState(
                          icon: Icons.sports_basketball_outlined,
                          title: 'No tournament games',
                          message: 'No tournament games matching this filter.',
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

  List<Widget> _list(List<GameItem> games, {required Widget empty}) {
    if (games.isEmpty) return [empty];
    return [
      for (final g in games)
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: GameCard(game: g),
        ),
    ];
  }
}
