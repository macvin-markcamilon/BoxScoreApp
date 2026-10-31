import 'json_utils.dart';

enum MatchStatus {
  scheduled,
  live,
  finalScore;

  static MatchStatus parse(Object? v) => switch (v?.toString().toUpperCase()) {
        'LIVE' => MatchStatus.live,
        'FINAL' => MatchStatus.finalScore,
        _ => MatchStatus.scheduled,
      };
}

/// Mirrors `TournamentMatch` stored in `leagues.rules_config._persistedTournament`.
class TournamentMatch {
  const TournamentMatch({
    required this.id,
    required this.leagueId,
    required this.gameNumber,
    required this.status,
    required this.roundLabel,
    required this.homeTeamPlaceholder,
    required this.awayTeamPlaceholder,
    this.homeTeamId,
    this.awayTeamId,
    this.homeScore,
    this.awayScore,
    this.scheduledDate,
    this.scheduledTime,
    this.courtName,
    this.categoryName,
    this.categoryColor,
    this.recapHeadline,
    this.streamUrl,
  });

  final String id;
  final String leagueId;
  final int gameNumber;
  final MatchStatus status;
  final String roundLabel;
  final String? homeTeamId;
  final String? awayTeamId;
  final String homeTeamPlaceholder;
  final String awayTeamPlaceholder;
  final int? homeScore;
  final int? awayScore;
  final String? scheduledDate; // yyyy-MM-dd
  final String? scheduledTime; // HH:mm
  final String? courtName;
  final String? categoryName;
  final String? categoryColor;
  final String? recapHeadline;

  /// Optional broadcast link (Facebook / YouTube). Forward-compatible: the
  /// web studio does not persist it yet.
  final String? streamUrl;

  DateTime? get scheduledAt {
    final d = scheduledDate;
    if (d == null || d.isEmpty) return null;
    final t = (scheduledTime == null || scheduledTime!.isEmpty)
        ? '00:00'
        : scheduledTime!;
    return DateTime.tryParse('${d}T${t.length == 5 ? '$t:00' : t}') ??
        DateTime.tryParse(d);
  }

  factory TournamentMatch.fromJson(Json j, {required String leagueId}) =>
      TournamentMatch(
        id: readString(j['id']),
        leagueId: readString(j['leagueId'], leagueId),
        gameNumber: readInt(j['gameNumber']),
        status: MatchStatus.parse(j['status']),
        roundLabel: readString(j['roundLabel'], 'Game'),
        homeTeamId: readStringOrNull(j['homeTeamId']),
        awayTeamId: readStringOrNull(j['awayTeamId']),
        homeTeamPlaceholder: readString(j['homeTeamPlaceholder'], 'TBD'),
        awayTeamPlaceholder: readString(j['awayTeamPlaceholder'], 'TBD'),
        homeScore: readIntOrNull(j['homeScore']),
        awayScore: readIntOrNull(j['awayScore']),
        scheduledDate: readStringOrNull(j['scheduledDate']),
        scheduledTime: readStringOrNull(j['scheduledTime']),
        courtName: readStringOrNull(j['courtName']),
        categoryName: readStringOrNull(j['categoryName']),
        categoryColor: readStringOrNull(j['categoryColor']),
        recapHeadline: readStringOrNull(j['recapHeadline']),
        streamUrl: readStringOrNull(
          j['streamUrl'] ?? j['liveStreamUrl'] ?? j['broadcastUrl'],
        ),
      );
}

class PlayerGameStats {
  const PlayerGameStats({
    required this.playerId,
    this.points = 0,
    this.fgm = 0,
    this.fga = 0,
    this.tpm = 0,
    this.tpa = 0,
    this.ftm = 0,
    this.fta = 0,
    this.oreb = 0,
    this.dreb = 0,
    this.ast = 0,
    this.stl = 0,
    this.blk = 0,
    this.pf = 0,
    this.tov = 0,
    this.jerseyNumber,
    this.firstName,
    this.lastName,
    this.position,
    this.minutesPlayed,
  });

  final String playerId;
  final int points, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, ast, stl, blk, pf, tov;
  final int? jerseyNumber;
  final String? firstName;
  final String? lastName;
  final String? position;
  final String? minutesPlayed;

  int get reb => oreb + dreb;
  String get playerName {
    final fn = firstName ?? '';
    final ln = lastName ?? '';
    final full = '$fn $ln'.trim();
    return full.isNotEmpty ? full : 'Player #$jerseyNumber';
  }

  factory PlayerGameStats.fromJson(String id, Json j) => PlayerGameStats(
        playerId: readString(j['playerId'], id),
        points: readInt(j['points']),
        fgm: readInt(j['fgm']),
        fga: readInt(j['fga']),
        tpm: readInt(j['tpm']),
        tpa: readInt(j['tpa']),
        ftm: readInt(j['ftm']),
        fta: readInt(j['fta']),
        oreb: readInt(j['oreb']),
        dreb: readInt(j['dreb']),
        ast: readInt(j['ast']),
        stl: readInt(j['stl']),
        blk: readInt(j['blk']),
        pf: readInt(j['pf']),
        tov: readInt(j['tov']),
        jerseyNumber: readIntOrNull(j['jerseyNumber']),
        firstName: readStringOrNull(j['firstName']),
        lastName: readStringOrNull(j['lastName']),
        position: readStringOrNull(j['position']),
        minutesPlayed: readStringOrNull(j['minutesPlayed']),
      );
}

class PlayScoreEvent {
  const PlayScoreEvent({
    required this.pointNumber,
    required this.period,
    required this.shotType,
    required this.jerseyNumber,
    required this.isHome,
  });
  final int pointNumber;
  final int period;
  final String shotType;
  final int jerseyNumber;
  final bool isHome;
}

/// Mirrors `LiveGameSession` stored in `rules_config._persistedGameSessions`.
class LiveGameSession {
  LiveGameSession({
    required this.matchId,
    required this.currentPeriod,
    required this.clockSecondsRemaining,
    required this.isClockRunning,
    required this.homeScore,
    required this.awayScore,
    this.leagueId,
    this.homePlayerStats = const {},
    this.awayPlayerStats = const {},
    this.homeQuarterScores = const [],
    this.awayQuarterScores = const [],
    this.homeTimeoutsRemaining = 4,
    this.awayTimeoutsRemaining = 4,
    this.isStreaming = false,
    this.plays = const [],
    this.updatedAt,
    DateTime? receivedAt,
  }) : receivedAt = receivedAt ?? DateTime.now();

  final String matchId;
  final String? leagueId;
  final int currentPeriod;
  final int clockSecondsRemaining;
  final bool isClockRunning;
  final int homeScore;
  final int awayScore;
  final Map<String, PlayerGameStats> homePlayerStats;
  final Map<String, PlayerGameStats> awayPlayerStats;
  final List<int> homeQuarterScores;
  final List<int> awayQuarterScores;
  final int homeTimeoutsRemaining;
  final int awayTimeoutsRemaining;
  final bool isStreaming;
  final List<PlayScoreEvent> plays;
  final DateTime? updatedAt;

  /// Local device time when this snapshot arrived. Used to keep the game
  /// clock ticking smoothly between realtime updates.
  final DateTime receivedAt;

  /// Clock value extrapolated to "now" while the clock is running.
  int get liveClockSeconds {
    if (!isClockRunning) return clockSecondsRemaining;
    final elapsed = DateTime.now().difference(receivedAt).inSeconds;
    final v = clockSecondsRemaining - elapsed;
    return v < 0 ? 0 : v;
  }

  String get clockDisplay {
    final secs = liveClockSeconds;
    final m = secs ~/ 60;
    final s = secs % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  /// True when [other] is a newer snapshot of the same game than this one.
  bool isOlderThan(LiveGameSession other) {
    final a = updatedAt, b = other.updatedAt;
    if (a == null || b == null) return true;
    return !b.isBefore(a);
  }

  String get periodLabel => currentPeriod <= 4 ? 'Q$currentPeriod' : 'OT${currentPeriod - 4}';

  static Map<String, PlayerGameStats> _stats(Object? v) => {
        for (final e in readJson(v).entries)
          e.key: PlayerGameStats.fromJson(e.key, readJson(e.value)),
      };

  static List<int> _quarters(Object? v) {
    if (v is List) {
      return v.map((e) => readInt(e)).toList();
    }
    return const [];
  }

  static List<PlayScoreEvent> _parsePlays(Json j) {
    final list = <PlayScoreEvent>[];
    final homeRunning = readJson(j['homeRunningScore']);
    for (final e in homeRunning.entries) {
      final val = readJson(e.value);
      list.add(PlayScoreEvent(
        pointNumber: readInt(val['pointNumber'], int.tryParse(e.key) ?? 0),
        period: readInt(val['period'], 1),
        shotType: readString(val['shotType'], 'PTS'),
        jerseyNumber: readInt(val['jerseyNumber']),
        isHome: true,
      ));
    }
    final awayRunning = readJson(j['awayRunningScore']);
    for (final e in awayRunning.entries) {
      final val = readJson(e.value);
      list.add(PlayScoreEvent(
        pointNumber: readInt(val['pointNumber'], int.tryParse(e.key) ?? 0),
        period: readInt(val['period'], 1),
        shotType: readString(val['shotType'], 'PTS'),
        jerseyNumber: readInt(val['jerseyNumber']),
        isHome: false,
      ));
    }
    list.sort((a, b) => a.pointNumber.compareTo(b.pointNumber));
    return list;
  }

  factory LiveGameSession.fromJson(String matchId, Json j) => LiveGameSession(
        matchId: readString(j['matchId'], matchId),
        leagueId: readStringOrNull(j['leagueId']),
        currentPeriod: readInt(j['currentPeriod'], 1),
        clockSecondsRemaining: readInt(j['clockSecondsRemaining']),
        isClockRunning: readBool(j['isClockRunning']),
        homeScore: readInt(j['homeScore']),
        awayScore: readInt(j['awayScore']),
        homePlayerStats: _stats(j['homePlayerStats']),
        awayPlayerStats: _stats(j['awayPlayerStats']),
        homeQuarterScores: _quarters(j['homeQuarterScores']),
        awayQuarterScores: _quarters(j['awayQuarterScores']),
        homeTimeoutsRemaining: readInt(j['homeTimeoutsRemaining'], 4),
        awayTimeoutsRemaining: readInt(j['awayTimeoutsRemaining'], 4),
        isStreaming: readBool(j['isStreaming'] ?? j['isStreamingLive']),
        plays: _parsePlays(j),
        updatedAt: readDate(j['updatedAt']),
      );
}
