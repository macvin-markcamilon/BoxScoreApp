import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/user_avatar.dart';
import '../../data/models/user_profile.dart';
import '../../data/providers.dart';
import '../games/game_card.dart';
import '../games/games_providers.dart';
import '../leagues/league_card.dart';
import '../leagues/league_providers.dart';
import '../profile/career_stats.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref
      ..invalidate(profileProvider)
      ..invalidate(leaguesProvider)
      ..invalidate(followsProvider)
      ..invalidate(teamsByIdProvider)
      ..invalidate(followerCountsProvider);
    await ref.read(gamesFeedProvider.future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider).valueOrNull;
    final feed = ref.watch(gamesFeedProvider);
    final sections = ref.watch(leagueSectionsProvider).valueOrNull;
    final career = ref.watch(careerStatsProvider).valueOrNull ?? CareerStats.empty;

    final all = feed.valueOrNull?.all ?? const <GameItem>[];
    final inProgress = all.where((g) => g.isPlayingNow).toList()..sort(compareLatest);
    final now = DateTime.now();
    final upcoming = all
        .where((g) => !g.isPlayingNow && !g.isFinal &&
            (g.match.scheduledAt?.isAfter(now.subtract(const Duration(hours: 3))) ?? true))
        .toList()
      ..sort((a, b) => (a.match.scheduledAt ?? DateTime(9999))
          .compareTo(b.match.scheduledAt ?? DateTime(9999)));
    final recent = all.where((g) => g.isFinal).toList()
      ..sort((a, b) => (b.match.scheduledAt ?? DateTime(0))
          .compareTo(a.match.scheduledAt ?? DateTime(0)));

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(child: _Hero(profile: profile)),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: _QuickStats(
                  owned: sections?.owned.length,
                  following: sections?.followed.length,
                  live: feed.hasValue ? inProgress.length : null,
                  gamesPlayed: career.gp,
                ),
              ),
            ),
            if (feed.isLoading && !feed.hasValue)
              const SliverToBoxAdapter(child: SkeletonList(count: 2, itemHeight: 150))
            else if (feed.hasError && !feed.hasValue)
              SliverToBoxAdapter(
                child: ErrorView(error: feed.error!, onRetry: () => _refresh(ref)),
              )
            else
              SliverList.list(
                children: [
                  if (inProgress.isNotEmpty) ...[
                    SectionHeader(
                      title: 'Happening Now',
                      icon: Icons.sensors,
                      count: inProgress.length,
                      trailing: _SeeAll(onTap: () => context.go(Routes.games)),
                    ),
                    _GameCarousel(games: inProgress),
                  ],
                  SectionHeader(
                    title: 'Up Next',
                    icon: Icons.event_available,
                    trailing: _SeeAll(onTap: () => context.go(Routes.games)),
                  ),
                  if (upcoming.isEmpty)
                    const EmptyState(
                      icon: Icons.event_busy,
                      title: 'No upcoming games',
                      message: 'Follow more leagues to fill up your schedule.',
                    )
                  else
                    _GameCarousel(games: upcoming.take(6).toList()),
                  _CareerCard(career: career, profile: profile),
                  if (sections != null && (sections.owned.isNotEmpty || sections.followed.isNotEmpty)) ...[
                    SectionHeader(
                      title: 'Your Leagues',
                      icon: Icons.emoji_events_outlined,
                      trailing: _SeeAll(onTap: () => context.go(Routes.leagues)),
                    ),
                    _LeagueStrip(sections: sections),
                  ],
                  if (recent.isNotEmpty) ...[
                    SectionHeader(
                      title: 'Recent Results',
                      icon: Icons.scoreboard_outlined,
                      trailing: _SeeAll(onTap: () => context.go(Routes.games)),
                    ),
                    for (final g in recent.take(3))
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                        child: GameCard(game: g, dense: true),
                      ),
                  ],
                  const _QuickActions(),
                  const SizedBox(height: 32),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.profile});
  final UserProfile? profile;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Container(
      padding: EdgeInsets.fromLTRB(20, top + 6, 20, 20),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.brandNavy, AppColors.brandNavyDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.1),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Image.asset(
                  'assets/branding/logo_banner.png',
                  height: 28,
                  fit: BoxFit.contain,
                  semanticLabel: 'BOX SCORE',
                ),
              ),
              const Spacer(),
              InkWell(
                customBorder: const CircleBorder(),
                onTap: () => context.go(Routes.profile),
                child: UserAvatar(profile: profile, radius: 18, ring: Colors.white24),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            '${greetingFor(DateTime.now())},',
            style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            profile == null ? 'Athlete' : (profile!.firstName.isEmpty ? profile!.fullName : profile!.firstName),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
              fontSize: 26,
              letterSpacing: 0.5,
            ),
          ),
          if ((profile?.accountRoles.isNotEmpty ?? false) || (profile?.positions.isNotEmpty ?? false)) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final r in profile?.accountRoles ?? const <AccountRole>[])
                  _HeroChip(r.value.toUpperCase()),
                for (final p in profile?.positions ?? const <PlayerPosition>[])
                  _HeroChip(p.code, accent: true),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  const _HeroChip(this.label, {this.accent = false});
  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
        decoration: BoxDecoration(
          color: accent ? AppColors.brandRed : Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.8,
          ),
        ),
      );
}

class _QuickStats extends StatelessWidget {
  const _QuickStats({
    required this.owned,
    required this.following,
    required this.live,
    required this.gamesPlayed,
  });
  final int? owned, following, live;
  final int gamesPlayed;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: IntrinsicHeight(
          child: Row(
            children: [
              _Stat(value: owned, label: 'My Leagues', icon: Icons.workspace_premium),
              const VerticalDivider(),
              _Stat(value: following, label: 'Following', icon: Icons.favorite),
              const VerticalDivider(),
              _Stat(value: live, label: 'Live Now', icon: Icons.sensors, color: AppColors.live),
              const VerticalDivider(),
              _Stat(value: gamesPlayed, label: 'Games', icon: Icons.sports_basketball),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, required this.icon, this.color});
  final int? value;
  final String label;
  final IconData icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Expanded(
      child: Column(
        children: [
          Icon(icon, size: 18, color: color ?? AppColors.brandRed),
          const SizedBox(height: 4),
          Text(
            value?.toString() ?? '0',
            style: t.titleMedium?.copyWith(fontWeight: FontWeight.w900),
          ),
          Text(
            label.toUpperCase(),
            textAlign: TextAlign.center,
            style: t.labelSmall?.copyWith(
              color: AppColors.textMuted,
              fontWeight: FontWeight.w800,
              fontSize: 9.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _GameCarousel extends StatelessWidget {
  const _GameCarousel({required this.games});
  final List<GameItem> games;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    return SizedBox(
      height: 196,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        scrollDirection: Axis.horizontal,
        itemCount: games.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (_, i) => SizedBox(
          width: games.length == 1 ? width - 40 : width * 0.82,
          child: GameCard(game: games[i], dense: true),
        ),
      ),
    );
  }
}

class _CareerCard extends StatelessWidget {
  const _CareerCard({required this.career, required this.profile});
  final CareerStats career;
  final UserProfile? profile;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.go(Routes.profile),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: const LinearGradient(
              colors: [AppColors.brandRed, AppColors.brandRedDark],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.insights, color: Colors.white),
                  const SizedBox(width: 8),
                  Text(
                    'CAREER SNAPSHOT',
                    style: t.titleSmall?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${career.gp} GP',
                    style: t.labelLarge?.copyWith(
                      color: Colors.white70,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _CareerStat('PPG', Fmt.oneDecimal(career.ppg)),
                  _CareerStat('RPG', Fmt.oneDecimal(career.rpg)),
                  _CareerStat('APG', Fmt.oneDecimal(career.apg)),
                  _CareerStat('FG%', Fmt.pct(career.fgPct)),
                ],
              ),
              if (career.gp == 0) ...[
                const SizedBox(height: 10),
                Text(
                  'Get added to a team roster to start tracking your stats.',
                  style: t.bodySmall?.copyWith(color: Colors.white70),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CareerStat extends StatelessWidget {
  const _CareerStat(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value,
              style: t.headlineSmall?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              )),
          Text(label,
              style: t.labelSmall?.copyWith(
                color: Colors.white70,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
              )),
        ],
      ),
    );
  }
}

class _LeagueStrip extends StatelessWidget {
  const _LeagueStrip({required this.sections});
  final LeagueSections sections;

  @override
  Widget build(BuildContext context) {
    final items = [
      for (final l in sections.owned) (l, true),
      for (final l in sections.followed) (l, false),
    ];
    final t = Theme.of(context).textTheme;
    return SizedBox(
      height: 120,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, i) {
          final (league, owner) = items[i];
          return InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => showLeagueSheet(context, league, isOwner: owner),
            child: Container(
              width: 112,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: [
                  LeagueLogo(league: league, size: 48),
                  const SizedBox(height: 8),
                  Text(
                    league.name,
                    maxLines: 2,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: t.labelMedium?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions();

  @override
  Widget build(BuildContext context) {
    Widget tile(IconData icon, String title, String sub, String route, Color c) =>
        Expanded(
          child: Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => context.go(route),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: c.withValues(alpha: 0.1),
                      child: Icon(icon, color: c, size: 20),
                    ),
                    const SizedBox(height: 10),
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
                    Text(sub,
                        style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                  ],
                ),
              ),
            ),
          ),
        );

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Row(
        children: [
          tile(Icons.location_on_outlined, 'Find a Court', 'Courts near you',
              Routes.courts, AppColors.success),
          const SizedBox(width: 12),
          tile(Icons.travel_explore, 'Explore Leagues', 'Follow & discover',
              Routes.leagues, AppColors.brandNavy),
        ],
      ),
    );
  }
}

class _SeeAll extends StatelessWidget {
  const _SeeAll({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TextButton(
        onPressed: onTap,
        child: const Text('See all', style: TextStyle(fontWeight: FontWeight.w800)),
      );
}
