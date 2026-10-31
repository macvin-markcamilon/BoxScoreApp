import 'json_utils.dart';

class RosterPlayer {
  const RosterPlayer({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.jerseyNumber,
    this.userId,
    this.position,
    this.imageUrl,
  });

  final String id;
  final String? userId;
  final String firstName;
  final String lastName;
  final int jerseyNumber;
  final String? position;
  final String? imageUrl;

  factory RosterPlayer.fromJson(Json j) => RosterPlayer(
        id: readString(j['id']),
        userId: readStringOrNull(j['userId']),
        firstName: readString(j['firstName']),
        lastName: readString(j['lastName']),
        jerseyNumber: readInt(j['jerseyNumber']),
        position: readStringOrNull(j['position']),
        imageUrl: readStringOrNull(j['imageUrl']),
      );
}

/// Mirrors `public.teams` (snake_case) and `LeagueTeam` (camelCase, used in
/// `rules_config._persistedTeams`).
class Team {
  const Team({
    required this.id,
    required this.leagueId,
    required this.name,
    this.initials,
    this.imageUrl,
    this.primaryColor = '#8B0D0E',
    this.secondaryColor = '#0B2F5C',
    this.roster = const [],
  });

  final String id;
  final String leagueId;
  final String name;
  final String? initials;
  final String? imageUrl;
  final String primaryColor;
  final String secondaryColor;
  final List<RosterPlayer> roster;

  String get shortName {
    final i = initials;
    if (i != null && i.isNotEmpty) return i.toUpperCase();
    final words = name.split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    if (words.length > 1) return words.take(3).map((w) => w[0]).join().toUpperCase();
    return name.length <= 3 ? name.toUpperCase() : name.substring(0, 3).toUpperCase();
  }

  factory Team.fromJson(Json j) {
    Object? f(String snake, String camel) => j[snake] ?? j[camel];
    return Team(
      id: readString(j['id']),
      leagueId: readString(f('league_id', 'leagueId')),
      name: readString(j['name'], 'Team'),
      initials: readStringOrNull(j['initials']),
      imageUrl: readStringOrNull(f('image_url', 'imageUrl')),
      primaryColor: readString(f('primary_color', 'primaryColor'), '#8B0D0E'),
      secondaryColor:
          readString(f('secondary_color', 'secondaryColor'), '#0B2F5C'),
      roster: readJsonList(j['roster']).map(RosterPlayer.fromJson).toList(),
    );
  }
}
