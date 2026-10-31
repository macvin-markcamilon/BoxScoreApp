import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/status_badges.dart';
import '../../data/models/game.dart';
import '../../data/models/league.dart';
import '../../data/models/team.dart';
import '../../data/providers.dart';

class LeagueDetailsScreen extends ConsumerStatefulWidget {
  const LeagueDetailsScreen({super.key, required this.leagueId});
  final String leagueId;

  @override
  ConsumerState<LeagueDetailsScreen> createState() => _LeagueDetailsScreenState();
}

class _LeagueDetailsScreenState extends ConsumerState<LeagueDetailsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Widget _buildBanner(League league) {
    final img = league.imageUrl;
    if (img != null && img.startsWith('data:image')) {
      try {
        final comma = img.indexOf(',');
        if (comma != -1) {
          final bytes = base64Decode(img.substring(comma + 1));
          return Image.memory(bytes, fit: BoxFit.cover);
        }
      } catch (_) {}
    } else if (img != null && img.startsWith('http')) {
      return Image.network(img, fit: BoxFit.cover, errorBuilder: (_, _, _) => _defaultBanner());
    }
    return _defaultBanner();
  }

  Widget _defaultBanner() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.brandNavy, Color(0xFF1E3A8A), AppColors.brandRed],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Center(
        child: Icon(Icons.emoji_events_rounded, size: 72, color: Colors.white.withValues(alpha: 0.2)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final leaguesAsync = ref.watch(leaguesProvider);
    final teamsAsync = ref.watch(teamsByIdProvider);
    final follows = ref.watch(followsProvider).valueOrNull ?? const {};
    final isFollowed = follows.contains(widget.leagueId);

    return Scaffold(
      backgroundColor: AppColors.surfaceAlt,
      body: leaguesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: ErrorView(
            error: e,
            onRetry: () => ref.refresh(leaguesProvider),
          ),
        ),
        data: (leagues) {
          final league = leagues.cast<League?>().firstWhere(
                (l) => l?.id == widget.leagueId,
                orElse: () => null,
              );

          if (league == null) {
            return Scaffold(
              appBar: AppBar(title: const Text('League Not Found')),
              body: const Center(child: Text('This tournament league could not be found.')),
            );
          }

          final allTeams = teamsAsync.valueOrNull ?? const {};
          final leagueTeams = allTeams.values
              .where((t) => t.leagueId == league.id || league.embeddedTeams.any((e) => e.id == t.id))
              .toList();
          final effectiveTeams = leagueTeams.isNotEmpty ? leagueTeams : league.embeddedTeams;
          final teamsMap = {for (final t in effectiveTeams) t.id: t};

          return NestedScrollView(
            headerSliverBuilder: (context, innerBoxIsScrolled) => [
              SliverAppBar(
                expandedHeight: 250,
                pinned: true,
                backgroundColor: AppColors.brandNavy,
                foregroundColor: Colors.white,
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white),
                  onPressed: () => context.pop(),
                ),
                actions: [
                  IconButton(
                    icon: Icon(
                      isFollowed ? Icons.favorite : Icons.favorite_border,
                      color: isFollowed ? Colors.redAccent : Colors.white,
                    ),
                    onPressed: () => ref.read(followsProvider.notifier).toggle(league.id),
                  ),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  background: Stack(
                    fit: StackFit.expand,
                    children: [
                      _buildBanner(league),
                      Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.black.withValues(alpha: 0.3),
                              AppColors.brandNavy.withValues(alpha: 0.95),
                            ],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 20,
                        right: 20,
                        bottom: 16,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: AppColors.brandRed,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    league.ruleSetId.toUpperCase(),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                if (league.liveGameCount > 0) ...[
                                  const LiveBadge(),
                                  const SizedBox(width: 8),
                                ],
                                Text(
                                  league.isOngoing ? 'ONGOING' : (league.isUpcoming ? 'UPCOMING' : 'FINISHED'),
                                  style: TextStyle(
                                    color: Colors.white.withValues(alpha: 0.8),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              league.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                                height: 1.15,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.person_pin, size: 14, color: AppColors.surfaceAlt),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    'Commissioner: ${league.ownerName}',
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: 0.85),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Container(
                  color: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _metric(label: 'TEAMS', value: '${effectiveTeams.length}', icon: Icons.shield_outlined),
                      _divider(),
                      _metric(label: 'MATCHES', value: '${league.matches.length}', icon: Icons.sports_basketball),
                      _divider(),
                      _metric(label: 'VENUES', value: '${league.courts.length}', icon: Icons.place_outlined),
                      _divider(),
                      _metric(label: 'LIVE', value: '${league.liveGameCount}', icon: Icons.sensors, highlight: league.liveGameCount > 0),
                    ],
                  ),
                ),
              ),
              SliverPersistentHeader(
                pinned: true,
                delegate: _SliverTabHeaderDelegate(
                  TabBar(
                    controller: _tabController,
                    labelColor: AppColors.brandRed,
                    unselectedLabelColor: AppColors.textMuted,
                    labelStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13),
                    unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    indicatorColor: AppColors.brandRed,
                    indicatorWeight: 3,
                    tabs: const [
                      Tab(text: 'MATCHES'),
                      Tab(text: 'TEAMS'),
                      Tab(text: 'STANDINGS'),
                      Tab(text: 'COURTS'),
                    ],
                  ),
                ),
              ),
            ],
            body: TabBarView(
              controller: _tabController,
              children: [
                _buildMatchesTab(league, teamsMap),
                _buildTeamsTab(effectiveTeams),
                _buildStandingsTab(league, effectiveTeams),
                _buildCourtsTab(league),
              ],
            ),
          );
        },
      ),
    );
  }

  static Widget _divider() => Container(width: 1, height: 28, color: AppColors.border);

  static Widget _metric({
    required String label,
    required String value,
    required IconData icon,
    bool highlight = false,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: highlight ? AppColors.brandRed : AppColors.brandNavy),
            const SizedBox(width: 4),
            Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 16,
                color: highlight ? AppColors.brandRed : AppColors.brandNavy,
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: AppColors.textMuted,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }

  Widget _buildMatchesTab(League league, Map<String, Team> teams) {
    if (league.matches.isEmpty) {
      return const Center(
        child: EmptyState(
          icon: Icons.sports_basketball_outlined,
          title: 'No Matches Scheduled',
          message: 'The schedule for this tournament has not been generated yet.',
        ),
      );
    }

    final sorted = [...league.matches]..sort((a, b) => a.gameNumber.compareTo(b.gameNumber));

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      itemCount: sorted.length,
      itemBuilder: (context, i) {
        final match = sorted[i];
        final session = league.sessions[match.id];
        final home = teams[match.homeTeamId];
        final away = teams[match.awayTeamId];

        final homeName = home?.name ?? match.homeTeamPlaceholder;
        final awayName = away?.name ?? match.awayTeamPlaceholder;
        final homeScore = session != null ? session.homeScore : match.homeScore;
        final awayScore = session != null ? session.awayScore : match.awayScore;
        final isLive = match.status == MatchStatus.live || (session != null && session.isClockRunning);

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(
              color: isLive ? AppColors.brandRed.withValues(alpha: 0.6) : AppColors.border,
              width: isLive ? 1.5 : 1,
            ),
          ),
          color: Colors.white,
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => context.push(
              Routes.gameDetailsPath(match.id, leagueId: league.id),
            ),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceAlt,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          'GAME #${match.gameNumber} • ${match.roundLabel.toUpperCase()}',
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textMuted,
                          ),
                        ),
                      ),
                      const Spacer(),
                      if (isLive)
                        const LiveBadge()
                      else if (match.status == MatchStatus.finalScore)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'FINAL',
                            style: TextStyle(
                              color: Color(0xFF047857),
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        )
                      else if (match.scheduledTime != null)
                        Text(
                          '${match.scheduledDate ?? ''} ${match.scheduledTime ?? ''}'.trim(),
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Teams row
                  Row(
                    children: [
                      _teamSide(homeName, home?.primaryColor, homeScore, isWinner: (homeScore ?? 0) > (awayScore ?? 0)),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Text(
                          'VS',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.grey.shade400),
                        ),
                      ),
                      _teamSide(awayName, away?.primaryColor, awayScore, isWinner: (awayScore ?? 0) > (homeScore ?? 0)),
                    ],
                  ),
                  if (match.courtName != null && match.courtName!.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        const Icon(Icons.place, size: 12, color: AppColors.textMuted),
                        const SizedBox(width: 4),
                        Text(
                          match.courtName!,
                          style: const TextStyle(fontSize: 11, color: AppColors.textMuted, fontWeight: FontWeight.w600),
                        ),
                        const Spacer(),
                        const Text(
                          'Tap for Box Score >',
                          style: TextStyle(fontSize: 11, color: AppColors.brandNavy, fontWeight: FontWeight.w800),
                        ),
                      ],
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

  Widget _teamSide(String name, String? colorHex, int? score, {required bool isWinner}) {
    Color teamColor = AppColors.brandNavy;
    if (colorHex != null) {
      try {
        final clean = colorHex.replaceAll('#', '');
        teamColor = Color(int.parse('FF$clean', radix: 16));
      } catch (_) {}
    }

    return Expanded(
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(shape: BoxShape.circle, color: teamColor),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              name,
              style: TextStyle(
                fontWeight: isWinner ? FontWeight.w900 : FontWeight.w700,
                fontSize: 14,
                color: isWinner ? AppColors.textStrong : AppColors.textMuted,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (score != null) ...[
            const SizedBox(width: 6),
            Text(
              '$score',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 16,
                color: isWinner ? AppColors.brandNavy : AppColors.textMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTeamsTab(List<Team> teams) {
    if (teams.isEmpty) {
      return const Center(
        child: EmptyState(
          icon: Icons.shield_outlined,
          title: 'No Teams Enrolled',
          message: 'No teams have been registered in this tournament yet.',
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      itemCount: teams.length,
      itemBuilder: (context, i) {
        final t = teams[i];
        Color teamColor = AppColors.brandNavy;
        if (t.primaryColor.isNotEmpty) {
          try {
            final clean = t.primaryColor.replaceAll('#', '');
            teamColor = Color(int.parse('FF$clean', radix: 16));
          } catch (_) {}
        }

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: AppColors.border),
          ),
          color: Colors.white,
          child: ExpansionTile(
            shape: const Border(),
            leading: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: teamColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: teamColor.withValues(alpha: 0.4)),
              ),
              child: Center(
                child: Text(
                  t.shortName.isNotEmpty ? t.shortName : (t.name.length >= 3 ? t.name.substring(0, 3) : t.name).toUpperCase(),
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: teamColor),
                ),
              ),
            ),
            title: Text(
              t.name,
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: AppColors.textStrong),
            ),
            subtitle: Text(
              '${t.roster.length} Players on active roster',
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted, fontWeight: FontWeight.w600),
            ),
            children: [
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'TEAM ROSTER',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        color: AppColors.textMuted,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (t.roster.isEmpty)
                      const Text('No players listed on roster', style: TextStyle(fontSize: 12, color: AppColors.textMuted))
                    else
                      for (final p in t.roster)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              Container(
                                width: 26,
                                height: 20,
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceAlt,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  '#${p.jerseyNumber}',
                                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: AppColors.brandNavy),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  '${p.firstName} ${p.lastName}',
                                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textStrong),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceAlt,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  (p.position != null && p.position!.isNotEmpty) ? p.position! : 'G',
                                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 10, color: AppColors.textMuted),
                                ),
                              ),
                            ],
                          ),
                        ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStandingsTab(League league, List<Team> teams) {
    final wins = <String, int>{};
    final losses = <String, int>{};
    final ptsFor = <String, int>{};
    final ptsAgainst = <String, int>{};

    for (final t in teams) {
      wins[t.id] = 0;
      losses[t.id] = 0;
      ptsFor[t.id] = 0;
      ptsAgainst[t.id] = 0;
    }

    for (final m in league.matches) {
      final session = league.sessions[m.id];
      final hs = session != null ? session.homeScore : m.homeScore;
      final as_ = session != null ? session.awayScore : m.awayScore;
      final hid = m.homeTeamId;
      final aid = m.awayTeamId;

      if (hs != null && as_ != null && hid != null && aid != null && (m.status == MatchStatus.finalScore || session != null)) {
        ptsFor[hid] = (ptsFor[hid] ?? 0) + hs;
        ptsAgainst[hid] = (ptsAgainst[hid] ?? 0) + as_;
        ptsFor[aid] = (ptsFor[aid] ?? 0) + as_;
        ptsAgainst[aid] = (ptsAgainst[aid] ?? 0) + hs;

        if (hs > as_) {
          wins[hid] = (wins[hid] ?? 0) + 1;
          losses[aid] = (losses[aid] ?? 0) + 1;
        } else if (as_ > hs) {
          wins[aid] = (wins[aid] ?? 0) + 1;
          losses[hid] = (losses[hid] ?? 0) + 1;
        }
      }
    }

    final sortedTeams = [...teams]..sort((a, b) {
        final wA = wins[a.id] ?? 0;
        final wB = wins[b.id] ?? 0;
        if (wA != wB) return wB.compareTo(wA);
        final diffA = (ptsFor[a.id] ?? 0) - (ptsAgainst[a.id] ?? 0);
        final diffB = (ptsFor[b.id] ?? 0) - (ptsAgainst[b.id] ?? 0);
        return diffB.compareTo(diffA);
      });

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.border),
        ),
        color: Colors.white,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            children: [
              // Header
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Row(
                  children: [
                    SizedBox(width: 24, child: Text('#', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: AppColors.textMuted))),
                    Expanded(child: Text('TEAM', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: AppColors.textMuted))),
                    SizedBox(width: 32, child: Text('W', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: AppColors.textMuted))),
                    SizedBox(width: 32, child: Text('L', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: AppColors.textMuted))),
                    SizedBox(width: 44, child: Text('PCT', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: AppColors.textMuted))),
                    SizedBox(width: 44, child: Text('DIFF', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: AppColors.textMuted))),
                  ],
                ),
              ),
              const Divider(height: 1),
              for (var idx = 0; idx < sortedTeams.length; idx++) ...[
                () {
                  final t = sortedTeams[idx];
                  final w = wins[t.id] ?? 0;
                  final l = losses[t.id] ?? 0;
                  final total = w + l;
                  final pct = total > 0 ? (w / total).toStringAsFixed(3).replaceFirst('0.', '.') : '.000';
                  final diff = (ptsFor[t.id] ?? 0) - (ptsAgainst[t.id] ?? 0);

                  return Container(
                    color: idx.isEven ? Colors.transparent : AppColors.surfaceAlt.withValues(alpha: 0.5),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 24,
                          child: Text(
                            '${idx + 1}',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 12,
                              color: idx < 4 ? AppColors.brandNavy : AppColors.textMuted,
                            ),
                          ),
                        ),
                        Expanded(
                          child: Text(
                            t.name,
                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.textStrong),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        SizedBox(width: 32, child: Text('$w', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13))),
                        SizedBox(width: 32, child: Text('$l', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textMuted))),
                        SizedBox(width: 44, child: Text(pct, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12))),
                        SizedBox(
                          width: 44,
                          child: Text(
                            diff > 0 ? '+$diff' : '$diff',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                              color: diff > 0 ? const Color(0xFF047857) : (diff < 0 ? AppColors.brandRed : AppColors.textMuted),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }(),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCourtsTab(League league) {
    if (league.courts.isEmpty) {
      return const Center(
        child: EmptyState(
          icon: Icons.place_outlined,
          title: 'No Courts Assigned',
          message: 'Venues will appear here once configured by the commissioner.',
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      itemCount: league.courts.length,
      itemBuilder: (context, i) {
        final c = league.courts[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: AppColors.border),
          ),
          color: Colors.white,
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            leading: Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: AppColors.surfaceAlt,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.sports_basketball, color: AppColors.brandRed),
            ),
            title: Text(
              c.name,
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: AppColors.brandNavy),
            ),
            subtitle: Text(
              c.address.isNotEmpty ? c.address : 'Venue address not specified',
              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ),
        );
      },
    );
  }
}

class _SliverTabHeaderDelegate extends SliverPersistentHeaderDelegate {
  _SliverTabHeaderDelegate(this._tabBar);
  final TabBar _tabBar;

  @override
  double get minExtent => _tabBar.preferredSize.height;
  @override
  double get maxExtent => _tabBar.preferredSize.height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: Colors.white,
      child: _tabBar,
    );
  }

  @override
  bool shouldRebuild(covariant _SliverTabHeaderDelegate oldDelegate) => false;
}
