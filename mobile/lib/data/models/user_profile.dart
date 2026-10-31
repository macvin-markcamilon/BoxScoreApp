import 'json_utils.dart';

enum PlayerPosition {
  pg('PG', 'Point Guard'),
  sg('SG', 'Shooting Guard'),
  sf('SF', 'Small Forward'),
  pf('PF', 'Power Forward'),
  c('C', 'Center');

  const PlayerPosition(this.code, this.label);
  final String code;
  final String label;

  static PlayerPosition? fromCode(String code) {
    for (final p in values) {
      if (p.code == code.toUpperCase()) return p;
    }
    return null;
  }
}

enum AccountRole {
  player('Player', 'Compete on team rosters & track box scores'),
  coach('Coach', 'Manage lineups, rotations & tactical sets'),
  referee('Referee', 'Officiate league games & enforce rulebooks'),
  manager('Manager', 'Organize franchises, logistics & registrations');

  const AccountRole(this.value, this.description);

  /// Value persisted in `profiles.account_roles` (matches the web app).
  final String value;
  final String description;

  static AccountRole? fromValue(String v) {
    for (final r in values) {
      if (r.value.toLowerCase() == v.toLowerCase()) return r;
    }
    return null;
  }
}

/// Mirrors `public.profiles` + `UserProfile` in the web app.
class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    this.birthday,
    this.address = '',
    this.heightCm,
    this.weightKg,
    this.positions = const [],
    this.accountRoles = const [],
    this.avatarUrl,
    this.bio,
    this.jerseyNumber,
    this.phone,
    this.createdAt,
  });

  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final DateTime? birthday;
  final String address;
  final double? heightCm;
  final double? weightKg;
  final List<PlayerPosition> positions;
  final List<AccountRole> accountRoles;
  final String? avatarUrl;
  final String? bio;
  final int? jerseyNumber;
  final String? phone;
  final DateTime? createdAt;

  String get fullName {
    final n = '$firstName $lastName'.trim();
    return n.isEmpty ? email : n;
  }

  String get initials {
    final parts = fullName.split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    return parts.take(2).map((p) => p[0]).join().toUpperCase();
  }

  int? get age {
    final b = birthday;
    if (b == null) return null;
    final now = DateTime.now();
    var a = now.year - b.year;
    if (now.month < b.month || (now.month == b.month && now.day < b.day)) a--;
    return a;
  }

  /// Builds a profile from a `profiles` row, falling back to auth metadata
  /// exactly like the web's `mapAuthUserToProfile`.
  factory UserProfile.fromRow({
    required String id,
    required String email,
    Json? row,
    Json? metadata,
    DateTime? createdAt,
  }) {
    final r = row ?? const <String, dynamic>{};
    final m = metadata ?? const <String, dynamic>{};
    Object? pick(String key) {
      final v = r[key];
      if (v != null && v.toString().isNotEmpty) return v;
      return m[key];
    }

    final positionsRaw = r['positions'] is List ? r['positions'] : m['positions'];
    final rolesRaw =
        r['account_roles'] is List ? r['account_roles'] : m['account_roles'];

    return UserProfile(
      id: id,
      email: readString(r['email'], email),
      firstName: readString(pick('first_name')),
      lastName: readString(pick('last_name')),
      birthday: readDate(pick('birthday')),
      address: readString(pick('address')),
      heightCm: readDoubleOrNull(pick('height_cm')),
      weightKg: readDoubleOrNull(pick('weight_kg')),
      positions: readStringList(positionsRaw)
          .map(PlayerPosition.fromCode)
          .whereType<PlayerPosition>()
          .toList(),
      accountRoles: readStringList(rolesRaw)
          .map(AccountRole.fromValue)
          .whereType<AccountRole>()
          .toList(),
      avatarUrl: readStringOrNull(
        pick('avatar_url') ?? pick('image_url'),
      ),
      bio: readStringOrNull(pick('bio')),
      jerseyNumber: readIntOrNull(pick('jersey_number')),
      phone: readStringOrNull(pick('phone')),
      createdAt: readDate(r['created_at']) ?? createdAt,
    );
  }

  /// Payload for `profiles.update(...)`.
  Json toUpdateRow() => {
        'first_name': firstName,
        'last_name': lastName,
        'birthday': birthday?.toIso8601String().split('T').first,
        'address': address,
        'height_cm': heightCm,
        'weight_kg': weightKg,
        'positions': positions.map((p) => p.code).toList(),
        'account_roles': accountRoles.map((r) => r.value).toList(),
        'avatar_url': avatarUrl,
        'bio': bio,
        'jersey_number': jerseyNumber,
        'phone': phone,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      };

  UserProfile copyWith({
    String? firstName,
    String? lastName,
    DateTime? birthday,
    String? address,
    double? heightCm,
    double? weightKg,
    List<PlayerPosition>? positions,
    List<AccountRole>? accountRoles,
    String? avatarUrl,
    String? bio,
    int? jerseyNumber,
    String? phone,
  }) =>
      UserProfile(
        id: id,
        email: email,
        firstName: firstName ?? this.firstName,
        lastName: lastName ?? this.lastName,
        birthday: birthday ?? this.birthday,
        address: address ?? this.address,
        heightCm: heightCm ?? this.heightCm,
        weightKg: weightKg ?? this.weightKg,
        positions: positions ?? this.positions,
        accountRoles: accountRoles ?? this.accountRoles,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        bio: bio ?? this.bio,
        jerseyNumber: jerseyNumber ?? this.jerseyNumber,
        phone: phone ?? this.phone,
        createdAt: createdAt,
      );
}
