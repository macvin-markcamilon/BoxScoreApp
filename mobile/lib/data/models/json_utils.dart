/// Defensive JSON readers. Supabase rows and the `rules_config` JSONB blob
/// written by the web app are loosely typed, so every field is parsed safely.
typedef Json = Map<String, dynamic>;

String readString(Object? v, [String fallback = '']) {
  if (v == null) return fallback;
  final s = v.toString();
  return s.isEmpty ? fallback : s;
}

String? readStringOrNull(Object? v) {
  if (v == null) return null;
  final s = v.toString();
  return s.isEmpty ? null : s;
}

int readInt(Object? v, [int fallback = 0]) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? double.tryParse(v)?.toInt() ?? fallback;
  return fallback;
}

int? readIntOrNull(Object? v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? double.tryParse(v)?.toInt();
  return null;
}

double? readDoubleOrNull(Object? v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

bool readBool(Object? v, [bool fallback = false]) {
  if (v is bool) return v;
  if (v is String) return v.toLowerCase() == 'true';
  return fallback;
}

List<String> readStringList(Object? v) =>
    v is List ? v.map((e) => e.toString()).toList() : const [];

List<Json> readJsonList(Object? v) => v is List
    ? v.whereType<Map<dynamic, dynamic>>().map(Json.from).toList()
    : const [];

Json readJson(Object? v) => v is Map ? Json.from(v) : <String, dynamic>{};

DateTime? readDate(Object? v) =>
    v == null ? null : DateTime.tryParse(v.toString());
