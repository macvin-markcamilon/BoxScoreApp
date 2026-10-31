import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/status_badges.dart';
import '../../data/models/game.dart';
import '../../data/models/league.dart';
import '../../data/models/team.dart';
import '../../data/providers.dart';

class GameDetailsScreen extends ConsumerStatefulWidget {
  const GameDetailsScreen({super.key, required this.matchId, this.leagueId});
  final String matchId;
  final String? leagueId;

  @override
  ConsumerState<GameDetailsScreen> createState() => _GameDetailsScreenState();
}

class _GameDetailsScreenState extends ConsumerState<GameDetailsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  bool _showingHomeTeam = true;
  Timer? _clockTicker;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    // Ticks every second so live game clocks advance in real-time smoothly
    _clockTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _clockTicker?.cancel();
    _tabController.dispose();
    super.dispose();
  }

  Color _teamColor(String? hex, Color fallback) {
    if (hex == null || hex.isEmpty) return fallback;
    try {
      final clean = hex.replaceAll('#', '');
      return Color(int.parse('FF$clean', radix: 16));
    } catch (_) {
      return fallback;
    }
  }

  @override
  Widget build(BuildContext context) {
    final leaguesAsync = ref.watch(leaguesProvider);
    final teamsAsync = ref.watch(teamsByIdProvider);

    return Scaffold(
      backgroundColor: AppColors.surfaceAlt,
      body: leaguesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: ErrorView(error: e, onRetry: () => ref.refresh(leaguesProvider)),
        ),
        data: (leagues) {
          League? matchedLeague;
          TournamentMatch? matchedMatch;
          LiveGameSession? matchedSession;

          for (final l in leagues) {
            if (widget.leagueId != null && l.id != widget.leagueId) continue;
            for (final m in l.matches) {
              if (m.id == widget.matchId) {
                matchedLeague = l;
                matchedMatch = m;
                matchedSession = l.sessions[m.id];
                break;
              }
            }
            if (matchedMatch != null) break;
          }

          if (matchedMatch == null || matchedLeague == null) {
            // Check if matches has it in any league regardless of filter
            for (final l in leagues) {
              for (final m in l.matches) {
                if (m.id == widget.matchId) {
                  matchedLeague = l;
                  matchedMatch = m;
                  matchedSession = l.sessions[m.id];
                  break;
                }
              }
              if (matchedMatch != null) break;
            }
          }

          if (matchedMatch == null || matchedLeague == null) {
            return Scaffold(
              appBar: AppBar(title: const Text('Game Not Found')),
              body: const Center(child: Text('This match could not be found.')),
            );
          }

          final match = matchedMatch;
          final league = matchedLeague;

          final allTeams = teamsAsync.valueOrNull ?? const {};
          final homeTeam = allTeams[match.homeTeamId];
          final awayTeam = allTeams[match.awayTeamId];

          final homeName = homeTeam?.name ?? match.homeTeamPlaceholder;
          final awayName = awayTeam?.name ?? match.awayTeamPlaceholder;
          final homeColor = _teamColor(homeTeam?.primaryColor, AppColors.brandNavy);
          final awayColor = _teamColor(awayTeam?.primaryColor, AppColors.brandRed);

          final isLive = match.status == MatchStatus.live ||
              (matchedSession != null && matchedSession.isClockRunning);
          final isFinal = match.status == MatchStatus.finalScore;

          final homeScore = matchedSession != null ? matchedSession.homeScore : (match.homeScore ?? 0);
          final awayScore = matchedSession != null ? matchedSession.awayScore : (match.awayScore ?? 0);

          return NestedScrollView(
            headerSliverBuilder: (context, innerBoxIsScrolled) => [
              SliverAppBar(
                pinned: true,
                backgroundColor: AppColors.brandNavy,
                foregroundColor: Colors.white,
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white),
                  onPressed: () => context.pop(),
                ),
                title: Text(
                  'GAME #${match.gameNumber}',
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 0.8),
                ),
                centerTitle: true,
              ),
              // Scoreboard Jumbotron
              SliverToBoxAdapter(
                child: Container(
                  color: AppColors.brandNavy,
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                  child: Column(
                    children: [
                      // Status / Clock Header
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (isLive) ...[
                            const LiveBadge(),
                            const SizedBox(width: 8),
                            Text(
                              '${matchedSession?.periodLabel ?? 'LIVE'} • ${matchedSession?.clockDisplay ?? 'IN PLAY'}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 13,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ] else if (isFinal) ...[
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                              decoration: BoxDecoration(
                                color: const Color(0xFF10B981).withValues(alpha: 0.25),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                'FINAL SCORE',
                                style: TextStyle(
                                  color: Color(0xFF34D399),
                                  fontWeight: FontWeight.w900,
                                  fontSize: 11,
                                  letterSpacing: 0.8,
                                ),
                              ),
                            ),
                          ] else ...[
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                match.scheduledTime != null
                                    ? '${match.scheduledDate ?? ''} • ${match.scheduledTime}'
                                    : 'SCHEDULED',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 11,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 18),
                      // Home vs Away Scoreboard
                      Row(
                        children: [
                          // Home team
                          Expanded(
                            child: Column(
                              children: [
                                Container(
                                  width: 52,
                                  height: 52,
                                  decoration: BoxDecoration(
                                    color: homeColor.withValues(alpha: 0.2),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: homeColor, width: 2),
                                  ),
                                  alignment: Alignment.center,
                                  child: Text(
                                    homeTeam?.shortName ?? (homeName.length >= 3 ? homeName.substring(0, 3).toUpperCase() : homeName),
                                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: homeColor == AppColors.brandNavy ? Colors.white : homeColor),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  homeName,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 14,
                                  ),
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                const Text('HOME', style: TextStyle(color: AppColors.surfaceAlt, fontSize: 10, fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                          // Scores
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  '$homeScore',
                                  style: TextStyle(
                                    color: homeScore >= awayScore ? Colors.white : Colors.white60,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 40,
                                    fontFamily: 'monospace',
                                  ),
                                ),
                                const Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 8),
                                  child: Text(':', style: TextStyle(color: Colors.white38, fontSize: 32, fontWeight: FontWeight.bold)),
                                ),
                                Text(
                                  '$awayScore',
                                  style: TextStyle(
                                    color: awayScore >= homeScore ? Colors.white : Colors.white60,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 40,
                                    fontFamily: 'monospace',
                                  ),
                                ),
                              ],
                            ),
                          ),
                          // Away team
                          Expanded(
                            child: Column(
                              children: [
                                Container(
                                  width: 52,
                                  height: 52,
                                  decoration: BoxDecoration(
                                    color: awayColor.withValues(alpha: 0.2),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: awayColor, width: 2),
                                  ),
                                  alignment: Alignment.center,
                                  child: Text(
                                    awayTeam?.shortName ?? (awayName.length >= 3 ? awayName.substring(0, 3).toUpperCase() : awayName),
                                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: awayColor == AppColors.brandRed ? Colors.redAccent : awayColor),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  awayName,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 14,
                                  ),
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                const Text('AWAY', style: TextStyle(color: AppColors.surfaceAlt, fontSize: 10, fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      // Quarter scores breakdown
                      _buildQuarterScoresTable(
                        homeName: homeName,
                        awayName: awayName,
                        homeQuarters: matchedSession?.homeQuarterScores ?? const [],
                        awayQuarters: matchedSession?.awayQuarterScores ?? const [],
                        homeTotal: homeScore,
                        awayTotal: awayScore,
                      ),
                    ],
                  ),
                ),
              ),
              // TabBar
              SliverPersistentHeader(
                pinned: true,
                delegate: _SliverTabHeaderDelegate(
                  TabBar(
                    controller: _tabController,
                    labelColor: AppColors.brandRed,
                    unselectedLabelColor: AppColors.textMuted,
                    labelStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13),
                    indicatorColor: AppColors.brandRed,
                    indicatorWeight: 3,
                    tabs: const [
                      Tab(text: 'BOX SCORE'),
                      Tab(text: 'PLAY-BY-PLAY'),
                      Tab(text: 'MATCH INFO'),
                    ],
                  ),
                ),
              ),
            ],
            body: TabBarView(
              controller: _tabController,
              children: [
                _buildBoxScoreTab(
                  homeName: homeName,
                  awayName: awayName,
                  homeTeam: homeTeam,
                  awayTeam: awayTeam,
                  homeStats: matchedSession?.homePlayerStats.values.toList() ?? const [],
                  awayStats: matchedSession?.awayPlayerStats.values.toList() ?? const [],
                ),
                _buildPlayByPlayTab(
                  plays: matchedSession?.plays ?? const [],
                  homeName: homeName,
                  awayName: awayName,
                ),
                _buildMatchInfoTab(
                  league: league,
                  match: match,
                  session: matchedSession,
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildQuarterScoresTable({
    required String homeName,
    required String awayName,
    required List<int> homeQuarters,
    required List<int> awayQuarters,
    required int homeTotal,
    required int awayTotal,
  }) {
    final qCount = (homeQuarters.length > 4 ? homeQuarters.length : 4);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Table(
        columnWidths: const {
          0: FlexColumnWidth(2.5),
          1: FlexColumnWidth(1),
          2: FlexColumnWidth(1),
          3: FlexColumnWidth(1),
          4: FlexColumnWidth(1),
          5: FlexColumnWidth(1.4),
        },
        children: [
          TableRow(
            children: [
              const Text('TEAM', style: TextStyle(color: Colors.white54, fontSize: 10, fontWeight: FontWeight.w800)),
              for (var i = 1; i <= qCount && i <= 4; i++)
                Text('Q$i', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white54, fontSize: 10, fontWeight: FontWeight.w800)),
              const Text('TOTAL', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
            ],
          ),
          const TableRow(children: [SizedBox(height: 4), SizedBox(height: 4), SizedBox(height: 4), SizedBox(height: 4), SizedBox(height: 4), SizedBox(height: 4)]),
          TableRow(
            children: [
              Text(homeName, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
              for (var i = 0; i < 4; i++)
                Text(
                  i < homeQuarters.length ? '${homeQuarters[i]}' : '-',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                ),
              Text('$homeTotal', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900)),
            ],
          ),
          const TableRow(children: [SizedBox(height: 4), SizedBox(height: 4), SizedBox(height: 4), SizedBox(height: 4), SizedBox(height: 4), SizedBox(height: 4)]),
          TableRow(
            children: [
              Text(awayName, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
              for (var i = 0; i < 4; i++)
                Text(
                  i < awayQuarters.length ? '${awayQuarters[i]}' : '-',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                ),
              Text('$awayTotal', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBoxScoreTab({
    required String homeName,
    required String awayName,
    required Team? homeTeam,
    required Team? awayTeam,
    required List<PlayerGameStats> homeStats,
    required List<PlayerGameStats> awayStats,
  }) {
    final currentStats = _showingHomeTeam ? homeStats : awayStats;
    final teamRoster = (_showingHomeTeam ? homeTeam?.roster : awayTeam?.roster) ?? const [];
    final rosterMap = {for (final p in teamRoster) p.id: p};

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        children: [
          // Team Switcher Pill
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            padding: const EdgeInsets.all(4),
            child: Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() => _showingHomeTeam = true),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: _showingHomeTeam ? AppColors.brandNavy : Colors.transparent,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        homeName,
                        style: TextStyle(
                          color: _showingHomeTeam ? Colors.white : AppColors.textStrong,
                          fontWeight: FontWeight.w900,
                          fontSize: 13,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() => _showingHomeTeam = false),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: !_showingHomeTeam ? AppColors.brandNavy : Colors.transparent,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        awayName,
                        style: TextStyle(
                          color: !_showingHomeTeam ? Colors.white : AppColors.textStrong,
                          fontWeight: FontWeight.w900,
                          fontSize: 13,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (currentStats.isEmpty)
            const Card(
              color: Colors.white,
              child: Padding(
                padding: EdgeInsets.all(24),
                child: EmptyState(
                  icon: Icons.table_chart_outlined,
                  title: 'No Box Score Recorded',
                  message: 'Individual player statistics have not been logged for this match.',
                ),
              ),
            )
          else
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: const BorderSide(color: AppColors.border),
              ),
              color: Colors.white,
              clipBehavior: Clip.antiAlias,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columnSpacing: 14,
                  horizontalMargin: 12,
                  headingRowColor: WidgetStatePropertyAll(AppColors.surfaceAlt.withValues(alpha: 0.6)),
                  headingTextStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: AppColors.textMuted),
                  dataTextStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textStrong),
                  columns: const [
                    DataColumn(label: Text('PLAYER')),
                    DataColumn(label: Text('PTS', style: TextStyle(fontWeight: FontWeight.w900))),
                    DataColumn(label: Text('REB')),
                    DataColumn(label: Text('AST')),
                    DataColumn(label: Text('STL')),
                    DataColumn(label: Text('BLK')),
                    DataColumn(label: Text('FG')),
                    DataColumn(label: Text('3PT')),
                    DataColumn(label: Text('FT')),
                    DataColumn(label: Text('PF')),
                    DataColumn(label: Text('TOV')),
                  ],
                  rows: [
                    for (final s in currentStats) ...[
                      () {
                        final rosterP = rosterMap[s.playerId];
                        final num = s.jerseyNumber ?? rosterP?.jerseyNumber;
                        final name = (s.firstName != null && s.lastName != null)
                            ? '${s.firstName} ${s.lastName}'
                            : (rosterP != null ? '${rosterP.firstName} ${rosterP.lastName}' : 'Player');

                        return DataRow(
                          cells: [
                            DataCell(
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (num != null) ...[
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                      decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(4)),
                                      child: Text('#$num', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
                                    ),
                                    const SizedBox(width: 6),
                                  ],
                                  Text(name, style: const TextStyle(fontWeight: FontWeight.w800)),
                                ],
                              ),
                            ),
                            DataCell(Text('${s.points}', style: const TextStyle(fontWeight: FontWeight.w900, color: AppColors.brandNavy))),
                            DataCell(Text('${s.reb}')),
                            DataCell(Text('${s.ast}')),
                            DataCell(Text('${s.stl}')),
                            DataCell(Text('${s.blk}')),
                            DataCell(Text('${s.fgm}-${s.fga}')),
                            DataCell(Text('${s.tpm}-${s.tpa}')),
                            DataCell(Text('${s.ftm}-${s.fta}')),
                            DataCell(Text('${s.pf}')),
                            DataCell(Text('${s.tov}')),
                          ],
                        );
                      }(),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildPlayByPlayTab({
    required List<PlayScoreEvent> plays,
    required String homeName,
    required String awayName,
  }) {
    if (plays.isEmpty) {
      return const Center(
        child: EmptyState(
          icon: Icons.list_alt,
          title: 'No Play-by-Play Logged',
          message: 'Scoring sequences will appear in real time once tipped off.',
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      itemCount: plays.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final play = plays[i];
        final team = play.isHome ? homeName : awayName;

        return Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: AppColors.border),
          ),
          color: Colors.white,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: play.isHome ? AppColors.brandNavy.withValues(alpha: 0.1) : AppColors.brandRed.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    'Q${play.period}',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 11,
                      color: play.isHome ? AppColors.brandNavy : AppColors.brandRed,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$team #${play.jerseyNumber}',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.textStrong),
                      ),
                      Text(
                        'Made ${play.shotType} Shot',
                        style: const TextStyle(fontSize: 12, color: AppColors.textMuted, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceAlt,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'PT #${play.pointNumber}',
                    style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: AppColors.brandNavy),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildMatchInfoTab({
    required League league,
    required TournamentMatch match,
    required LiveGameSession? session,
  }) {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: AppColors.border),
          ),
          color: Colors.white,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'MATCH INFORMATION',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: AppColors.textMuted, letterSpacing: 0.7),
                ),
                const SizedBox(height: 14),
                _infoRow(label: 'League', value: league.name, icon: Icons.emoji_events),
                const Divider(height: 20),
                _infoRow(label: 'Round', value: match.roundLabel, icon: Icons.sports),
                const Divider(height: 20),
                _infoRow(label: 'Rulebook', value: league.ruleSetId.toUpperCase(), icon: Icons.menu_book),
                const Divider(height: 20),
                _infoRow(label: 'Venue / Court', value: match.courtName ?? 'Main Arena', icon: Icons.place),
                const Divider(height: 20),
                _infoRow(
                  label: 'Scheduled',
                  value: match.scheduledTime != null ? '${match.scheduledDate} at ${match.scheduledTime}' : 'To Be Announced',
                  icon: Icons.calendar_today,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _infoRow({required String label, required String value, required IconData icon}) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.brandNavy),
        const SizedBox(width: 10),
        Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textMuted, fontWeight: FontWeight.w700)),
        const Spacer(),
        Flexible(
          child: Text(
            value,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: AppColors.textStrong),
            textAlign: TextAlign.end,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
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
