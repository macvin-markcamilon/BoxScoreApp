import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/json_utils.dart';
import '../models/league.dart';
import '../models/team.dart';

class LeagueRepository {
  LeagueRepository(this._client, {SupabaseClient? anonClient})
      : _anonClient = anonClient ?? _client;

  final SupabaseClient _client;
  final SupabaseClient _anonClient;

  static const _localFollowsPrefix = 'boxscore_follows_';

  Future<List<League>> fetchLeagues() async {
    // 1. Try fetching via anon client first to avoid 400 Bad Request if user's JWT has a large base64 avatar
    try {
      final rows = await _anonClient
          .from('leagues')
          .select()
          .order('created_at', ascending: false);
      final list = <League>[];
      for (final r in rows) {
        try {
          list.add(League.fromRow(Json.from(r)));
        } catch (_) {}
      }
      if (list.isNotEmpty) return list;
    } catch (_) {}

    // 2. Fallback to default client
    try {
      final rows = await _client
          .from('leagues')
          .select()
          .order('created_at', ascending: false);
      return rows.map((r) => League.fromRow(Json.from(r))).toList();
    } catch (_) {
      try {
        final rows = await _client.from('leagues').select();
        return rows.map((r) => League.fromRow(Json.from(r))).toList();
      } catch (err) {
        return [];
      }
    }
  }

  Future<List<Team>> fetchTeams() async {
    try {
      final rows = await _anonClient
          .from('teams')
          .select()
          .order('created_at', ascending: true);
      return rows.map((r) => Team.fromJson(Json.from(r))).toList();
    } catch (_) {
      try {
        final rows = await _client
            .from('teams')
            .select()
            .order('created_at', ascending: true);
        return rows.map((r) => Team.fromJson(Json.from(r))).toList();
      } catch (_) {
        return [];
      }
    }
  }

  Future<Set<String>> fetchFollowedLeagueIds(String userId) async {
    final result = <String>{};
    // 1. Read locally cached follows (matches web app localStorage boxscore_follows)
    try {
      final sp = await SharedPreferences.getInstance();
      final local = sp.getStringList('$_localFollowsPrefix$userId') ?? [];
      result.addAll(local);
    } catch (_) {}

    // 2. Fetch remote DB follows if available
    try {
      final rows = await _anonClient
          .from('league_follows')
          .select('league_id')
          .eq('user_id', userId);
      for (final r in rows) {
        result.add(r['league_id'].toString());
      }
    } catch (_) {
      try {
        final rows = await _client
            .from('league_follows')
            .select('league_id')
            .eq('user_id', userId);
        for (final r in rows) {
          result.add(r['league_id'].toString());
        }
      } catch (_) {}
    }

    return result;
  }

  Future<Map<String, int>> fetchFollowerCounts() async {
    try {
      final rows = await _anonClient.from('league_follows').select('league_id');
      final counts = <String, int>{};
      for (final r in rows) {
        final id = r['league_id'].toString();
        counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    } catch (_) {
      try {
        final rows = await _client.from('league_follows').select('league_id');
        final counts = <String, int>{};
        for (final r in rows) {
          final id = r['league_id'].toString();
          counts[id] = (counts[id] ?? 0) + 1;
        }
        return counts;
      } catch (_) {
        return {};
      }
    }
  }

  Future<void> follow(String userId, String leagueId) async {
    // 1. Local persist immediately
    try {
      final sp = await SharedPreferences.getInstance();
      final key = '$_localFollowsPrefix$userId';
      final current = sp.getStringList(key) ?? [];
      if (!current.contains(leagueId)) {
        await sp.setStringList(key, [...current, leagueId]);
      }
    } catch (_) {}

    // 2. Remote upsert
    try {
      await _client
          .from('league_follows')
          .upsert({'user_id': userId, 'league_id': leagueId},
              onConflict: 'user_id,league_id');
    } catch (_) {}
  }

  Future<void> unfollow(String userId, String leagueId) async {
    // 1. Local persist immediately
    try {
      final sp = await SharedPreferences.getInstance();
      final key = '$_localFollowsPrefix$userId';
      final current = sp.getStringList(key) ?? [];
      if (current.contains(leagueId)) {
        await sp.setStringList(key, current.where((id) => id != leagueId).toList());
      }
    } catch (_) {}

    // 2. Remote delete
    try {
      await _client
          .from('league_follows')
          .delete()
          .eq('user_id', userId)
          .eq('league_id', leagueId);
    } catch (_) {}
  }
}
