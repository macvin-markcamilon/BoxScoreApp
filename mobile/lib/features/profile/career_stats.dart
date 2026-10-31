import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/game.dart';
import '../../data/models/team.dart';
import '../../data/providers.dart';

class GameLogEntry {
  const GameLogEntry({
    required this.matchId,
    required this.leagueName,
    required this.teamName,
    required this.opponentName,
    required this.date,
    required this.stats,
  });
  final String matchId;
  final String leagueName;
  final String teamName;
  final String opponentName;
  final DateTime? date;
  final PlayerGameStats stats;
}

class TeamMembership {
  const TeamMembership(this.teamName, this.leagueName, this.jerseyNumber);
  final String teamName;
  final String leagueName;
  final int? jerseyNumber;
}

class CareerStats {
  const CareerStats({
    required this.log,
    required this.teams,
  });

  final List<GameLogEntry> log;
  final List<TeamMembership> teams;

  int get gp => log.length;
  int _sum(int Function(PlayerGameStats s) f) =>
      log.fold(0, (a, e) => a + f(e.stats));

  int get pts => _sum((s) => s.points);
  int get reb => _sum((s) => s.reb);
  int get ast => _sum((s) => s.ast);
  int get stl => _sum((s) => s.stl);
  int get blk => _sum((s) => s.blk);

  double _avg(int total) => gp == 0 ? 0 : total / gp;
  double get ppg => _avg(pts);
  double get rpg => _avg(reb);
  double get apg => _avg(ast);
  double get spg => _avg(stl);
  double get bpg => _avg(blk);

  double? _pct(int made, int att) => att == 0 ? null : made / att;
  double? get fgPct => _pct(_sum((s) => s.fgm), _sum((s) => s.fga));
  double? get tpPct => _pct(_sum((s) => s.tpm), _sum((s) => s.tpa));
  double? get ftPct => _pct(_sum((s) => s.ftm), _sum((s) => s.fta));

  static const empty = CareerStats(log: [], teams: []);
}

/// Port of the web `UserProfileWorkspace` career aggregation: finds the
/// user's roster entries (by userId or exact name) and sums their box scores
/// from every persisted game session.
final careerStatsProvider = FutureProvider<CareerStats>((ref) async {
  final profile = await ref.watch(profileProvider.future);
  if (profile == null) return CareerStats.empty;
  final leagues = await ref.watch(leaguesProvider.future);
  final teams = await ref.watch(teamsByIdProvider.future);

  final first = profile.firstName.trim().toLowerCase();
  final last = profile.lastName.trim().toLowerCase();
  final leagueNames = {for (final l in leagues) l.id: l.name};

  final playerTeam = <String, Team>{};
  final memberships = <TeamMembership>[];
  for (final team in teams.values) {
    for (final p in team.roster) {
      final idMatch = p.userId != null && p.userId == profile.id;
      final nameMatch = first.isNotEmpty &&
          last.isNotEmpty &&
          p.firstName.trim().toLowerCase() == first &&
          p.lastName.trim().toLowerCase() == last;
      if (idMatch || nameMatch) {
        playerTeam[p.id] = team;
        memberships.add(TeamMembership(
          team.name,
          leagueNames[team.leagueId] ?? 'Independent',
          p.jerseyNumber,
        ));
      }
    }
  }
  if (playerTeam.isEmpty) return CareerStats(log: const [], teams: memberships);

  final log = <GameLogEntry>[];
  for (final league in leagues) {
    final matchesById = {for (final m in league.matches) m.id: m};
    for (final session in league.sessions.values) {
      final match = matchesById[session.matchId];
      String nameOf(String? id, String fallback) => teams[id]?.name ?? fallback;
      final homeName = nameOf(match?.homeTeamId, 'Home');
      final awayName = nameOf(match?.awayTeamId, 'Away');

      void collect(Map<String, PlayerGameStats> stats, bool isHome) {
        for (final e in stats.entries) {
          var team = playerTeam[e.key];
          if (team == null) {
            final sFirst = (e.value.firstName ?? '').trim().toLowerCase();
            final sLast = (e.value.lastName ?? '').trim().toLowerCase();
            if (sFirst.isNotEmpty && sLast.isNotEmpty && sFirst == first && sLast == last) {
              final tId = isHome ? match?.homeTeamId : match?.awayTeamId;
              team = teams[tId] ??
                  Team(
                    id: tId ?? '',
                    leagueId: league.id,
                    name: isHome ? homeName : awayName,
                    primaryColor: '',
                  );
            }
          }
          if (team == null) continue;
          log.add(GameLogEntry(
            matchId: session.matchId,
            leagueName: league.name,
            teamName: team.name,
            opponentName: isHome ? awayName : homeName,
            date: match?.scheduledAt ?? session.updatedAt,
            stats: e.value,
          ));
        }
      }

      collect(session.homePlayerStats, true);
      collect(session.awayPlayerStats, false);
    }
  }
  log.sort((a, b) => (b.date ?? DateTime(0)).compareTo(a.date ?? DateTime(0)));
  return CareerStats(log: log, teams: memberships);
});
