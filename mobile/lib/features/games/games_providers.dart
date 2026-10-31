import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/game.dart';
import '../../data/models/league.dart';
import '../../data/models/team.dart';
import '../../data/providers.dart';

enum GameSource { myLeague, following, discover }

/// View model joining a match with its league, teams and live session.
class GameItem {
  const GameItem({
    required this.match,
    required this.league,
    required this.source,
    this.home,
    this.away,
    this.session,
  });

  final TournamentMatch match;
  final League league;
  final GameSource source;
  final Team? home;
  final Team? away;
  final LiveGameSession? session;

  String get homeName => home?.name ?? match.homeTeamPlaceholder;
  String get awayName => away?.name ?? match.awayTeamPlaceholder;
  String get homeShort => home?.shortName ?? _abbr(match.homeTeamPlaceholder);
  String get awayShort => away?.shortName ?? _abbr(match.awayTeamPlaceholder);

  bool get isFinal => match.status == MatchStatus.finalScore;

  /// Game is in progress (tip-off happened, no final buzzer yet).
  bool get isPlayingNow {
    if (isFinal) return false;
    if (match.status == MatchStatus.live) return true;
    final s = session;
    return s != null &&
        (s.isClockRunning || s.homeScore + s.awayScore > 0 || s.currentPeriod > 1);
  }

  /// Real-time "LIVE": broadcast is on air, or the scorer's game clock is
  /// actively running and syncing right now.
  bool get isLive {
    if (!isPlayingNow) return false;
    final s = session;
    return match.streamUrl != null ||
        (s != null && (s.isStreaming || s.isClockRunning));
  }

  int? get homeScore =>
      isPlayingNow && session != null ? session!.homeScore : match.homeScore;
  int? get awayScore =>
      isPlayingNow && session != null ? session!.awayScore : match.awayScore;

  bool get hasScore => homeScore != null && awayScore != null &&
      (isPlayingNow || isFinal);

  static String _abbr(String s) {
    final t = s.trim();
    if (t.isEmpty) return 'TBD';
    return t.length <= 3 ? t.toUpperCase() : t.substring(0, 3).toUpperCase();
  }
}

class GamesFeed {
  const GamesFeed({
    required this.myLeagues,
    required this.following,
    this.discover = const [],
  });
  final List<GameItem> myLeagues;
  final List<GameItem> following;
  final List<GameItem> discover;

  List<GameItem> get all => [...myLeagues, ...following, ...discover];
  List<GameItem> get inProgress => all.where((g) => g.isPlayingNow).toList();
}

/// Latest games: in-progress first, then the games closest to "now"
/// (recent finals and next tip-offs).
int compareLatest(GameItem a, GameItem b) {
  int rank(GameItem g) => g.isLive ? 0 : (g.isPlayingNow ? 1 : 2);
  final r = rank(a).compareTo(rank(b));
  if (r != 0) return r;
  final now = DateTime.now();
  final da = a.match.scheduledAt, db = b.match.scheduledAt;
  if (da == null && db == null) return b.match.gameNumber.compareTo(a.match.gameNumber);
  if (da == null) return 1;
  if (db == null) return -1;
  return da.difference(now).abs().compareTo(db.difference(now).abs());
}

final gamesFeedProvider = FutureProvider<GamesFeed>((ref) async {
  final uid = ref.watch(currentUserIdProvider);
  final leagues = await ref.watch(leaguesProvider.future);
  final follows = await ref.watch(followsProvider.future);
  final teams = await ref.watch(teamsByIdProvider.future);

  List<GameItem> build(Iterable<League> source, GameSource kind) => [
        for (final l in source)
          for (final m in l.matches)
            GameItem(
              match: m,
              league: l,
              source: kind,
              home: teams[m.homeTeamId],
              away: teams[m.awayTeamId],
              session: l.sessions[m.id],
            ),
      ]..sort(compareLatest);

  final my = build(leagues.where((l) => l.ownerId == uid), GameSource.myLeague);
  final f = build(
    leagues.where((l) => l.ownerId != uid && follows.contains(l.id)),
    GameSource.following,
  );
  final d = build(
    leagues.where((l) => l.ownerId != uid && !follows.contains(l.id)),
    GameSource.discover,
  );

  return GamesFeed(myLeagues: my, following: f, discover: d);
});
