import 'game.dart';
import 'json_utils.dart';
import 'team.dart';

class LeagueCourt {
  const LeagueCourt({required this.id, required this.name, required this.address});
  final String id;
  final String name;
  final String address;

  factory LeagueCourt.fromJson(Json j) => LeagueCourt(
        id: readString(j['id']),
        name: readString(j['name'], 'Court'),
        address: readString(j['address']),
      );
}

class LeagueMember {
  const LeagueMember({
    required this.id,
    required this.leagueId,
    this.userId,
    required this.email,
    required this.displayName,
    required this.role,
    this.status = 'PENDING',
  });

  final String id;
  final String leagueId;
  final String? userId;
  final String email;
  final String displayName;
  final String role;
  final String status;

  factory LeagueMember.fromJson(Json j) => LeagueMember(
        id: readString(j['id']),
        leagueId: readString(j['leagueId'] ?? j['league_id']),
        userId: readStringOrNull(j['userId'] ?? j['user_id']),
        email: readString(j['email']),
        displayName: readString(j['displayName'] ?? j['display_name'] ?? j['email']),
        role: readString(j['role'], 'MEMBER'),
        status: readString(j['status'], 'PENDING'),
      );
}

class LeagueRulesInfo {
  const LeagueRulesInfo({
    this.ruleSetName = 'FIBA Official Rules',
    this.periodsCount = 4,
    this.periodLengthMinutes = 10,
    this.shotClockSeconds = 24,
    this.personalFoulLimit = 5,
    this.teamFoulBonusThreshold = 5,
  });

  final String ruleSetName;
  final int periodsCount;
  final int periodLengthMinutes;
  final int shotClockSeconds;
  final int personalFoulLimit;
  final int teamFoulBonusThreshold;

  factory LeagueRulesInfo.fromJson(Json j) => LeagueRulesInfo(
        ruleSetName: readString(j['ruleSetName'], 'FIBA Official Rules'),
        periodsCount: readInt(j['periodsCount'], 4),
        periodLengthMinutes: readInt(j['periodLengthMinutes'], 10),
        shotClockSeconds: readInt(j['shotClockSeconds'], 24),
        personalFoulLimit: readInt(j['personalFoulLimit'], 5),
        teamFoulBonusThreshold: readInt(j['teamFoulBonusThreshold'], 5),
      );
}

class League {
  const League({
    required this.id,
    required this.ownerId,
    required this.ownerName,
    required this.name,
    required this.ruleSetId,
    this.imageUrl,
    this.startDate,
    this.endDate,
    this.courts = const [],
    this.matches = const [],
    this.sessions = const {},
    this.embeddedTeams = const [],
    this.members = const [],
    this.rulesInfo = const LeagueRulesInfo(),
    this.createdAt,
  });

  final String id;
  final String ownerId;
  final String ownerName;
  final String name;
  final String ruleSetId;
  final String? imageUrl;
  final DateTime? startDate;
  final DateTime? endDate;
  final List<LeagueCourt> courts;
  final List<TournamentMatch> matches;
  final Map<String, LiveGameSession> sessions;
  final List<Team> embeddedTeams;
  final List<LeagueMember> members;
  final LeagueRulesInfo rulesInfo;
  final DateTime? createdAt;

  bool get isOngoing {
    final now = DateTime.now();
    final s = startDate, e = endDate;
    if (s == null || e == null) return false;
    return !now.isBefore(s) && !now.isAfter(e.add(const Duration(days: 1)));
  }

  bool get isUpcoming => startDate != null && DateTime.now().isBefore(startDate!);

  int get liveGameCount =>
      matches.where((m) => m.status == MatchStatus.live).length;

  /// Returns a copy with [session] merged in (used by realtime broadcasts).
  League withSession(LiveGameSession session) => League(
        id: id,
        ownerId: ownerId,
        ownerName: ownerName,
        name: name,
        ruleSetId: ruleSetId,
        imageUrl: imageUrl,
        startDate: startDate,
        endDate: endDate,
        courts: courts,
        matches: matches,
        sessions: {...sessions, session.matchId: session},
        embeddedTeams: embeddedTeams,
        members: members,
        rulesInfo: rulesInfo,
        createdAt: createdAt,
      );

  factory League.fromRow(Json row) {
    final id = readString(row['id']);
    final rules = readJson(row['rules_config']);
    final tournament = readJson(rules['_persistedTournament']);
    final sessionsRaw = readJson(rules['_persistedGameSessions']);

    final courts = <LeagueCourt>[];
    for (final c in readJsonList(row['courts'])) {
      try {
        courts.add(LeagueCourt.fromJson(c));
      } catch (_) {}
    }

    final matches = <TournamentMatch>[];
    for (final m in readJsonList(tournament['matches'])) {
      try {
        matches.add(TournamentMatch.fromJson(m, leagueId: id));
      } catch (_) {}
    }

    final sessions = <String, LiveGameSession>{};
    for (final e in sessionsRaw.entries) {
      try {
        sessions[e.key] = LiveGameSession.fromJson(e.key, readJson(e.value));
      } catch (_) {}
    }

    final embeddedTeams = <Team>[];
    for (final t in readJsonList(rules['_persistedTeams'])) {
      try {
        embeddedTeams.add(Team.fromJson(t));
      } catch (_) {}
    }

    final members = <LeagueMember>[];
    for (final m in readJsonList(rules['_persistedMembers'])) {
      try {
        members.add(LeagueMember.fromJson(m));
      } catch (_) {}
    }

    final rulesInfo = LeagueRulesInfo.fromJson(rules);

    return League(
      id: id,
      ownerId: readString(row['owner_id']),
      ownerName: readString(row['owner_name'], 'League Commissioner'),
      name: readString(row['name'], 'Untitled League'),
      ruleSetId: readString(row['rule_set_id'], 'FIBA'),
      imageUrl: readStringOrNull(row['image_url']),
      startDate: readDate(row['start_date']),
      endDate: readDate(row['end_date']),
      courts: courts,
      matches: matches,
      sessions: sessions,
      embeddedTeams: embeddedTeams,
      members: members,
      rulesInfo: rulesInfo,
      createdAt: readDate(row['created_at']),
    );
  }
}
