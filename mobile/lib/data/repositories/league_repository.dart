import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
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
  static const _cachedLeaguesKey = 'boxscore_cache_leagues_v1';
  static const _cachedTeamsKey = 'boxscore_cache_teams_v1';

  static List<League>? _memLeagues;
  static List<Team>? _memTeams;

  Future<List<League>> fetchLeagues() async {
    // 1. Return in-memory cache if available for instant UI rendering
    if (_memLeagues != null && _memLeagues!.isNotEmpty) {
      // Refresh in background without blocking
      unawaited(_fetchRemoteLeagues().then((fresh) {
        if (fresh.isNotEmpty) _memLeagues = fresh;
      }).catchError((_) {}));
      return _memLeagues!;
    }

    // 2. Read locally cached leagues from SharedPreferences (0 ms offline fallback)
    try {
      final sp = await SharedPreferences.getInstance();
      final cachedStr = sp.getString(_cachedLeaguesKey);
      if (cachedStr != null && cachedStr.isNotEmpty) {
        final decoded = jsonDecode(cachedStr);
        if (decoded is List) {
          final list = <League>[];
          for (final item in decoded) {
            try {
              list.add(League.fromRow(Json.from(item as Map)));
            } catch (_) {}
          }
          if (list.isNotEmpty) {
            _memLeagues = list;
            // Fetch fresh in background
            unawaited(_fetchRemoteLeagues().then((fresh) {
              if (fresh.isNotEmpty) _memLeagues = fresh;
            }).catchError((_) {}));
            return list;
          }
        }
      }
    } catch (_) {}

    // 3. Fetch from remote Supabase with 8s timeout
    final remote = await _fetchRemoteLeagues();
    if (remote.isNotEmpty) {
      _memLeagues = remote;
      return remote;
    }

    return _memLeagues ?? const [];
  }

  Future<List<League>> _fetchRemoteLeagues() async {
    List<dynamic>? rawRows;

    // Try via anonClient first to avoid bloated JWT token header
    try {
      final rows = await _anonClient
          .from('leagues')
          .select()
          .order('created_at', ascending: false)
          .timeout(const Duration(seconds: 8));
      rawRows = rows as List<dynamic>;
    } catch (e) {
      debugPrint('[LeagueRepository] anonClient fetchLeagues error: $e');
    }

    // Fallback to authenticated client if anonClient had issues
    if (rawRows == null || rawRows.isEmpty) {
      try {
        final rows = await _client
            .from('leagues')
            .select()
            .order('created_at', ascending: false)
            .timeout(const Duration(seconds: 8));
        rawRows = rows as List<dynamic>;
      } catch (e) {
        debugPrint('[LeagueRepository] client fetchLeagues error: $e');
      }
    }

    if (rawRows == null || rawRows.isEmpty) return const [];

    final list = <League>[];
    for (final r in rawRows) {
      try {
        list.add(League.fromRow(Json.from(r as Map)));
      } catch (e) {
        debugPrint('[LeagueRepository] League.fromRow error: $e');
      }
    }

    if (list.isNotEmpty) {
      _memLeagues = list;
      // Persist to SharedPreferences
      try {
        final sp = await SharedPreferences.getInstance();
        await sp.setString(_cachedLeaguesKey, jsonEncode(rawRows));
      } catch (_) {}
    }

    return list;
  }

  Future<List<Team>> fetchTeams() async {
    if (_memTeams != null && _memTeams!.isNotEmpty) {
      unawaited(_fetchRemoteTeams().then((fresh) {
        if (fresh.isNotEmpty) _memTeams = fresh;
      }).catchError((_) {}));
      return _memTeams!;
    }

    try {
      final sp = await SharedPreferences.getInstance();
      final cachedStr = sp.getString(_cachedTeamsKey);
      if (cachedStr != null && cachedStr.isNotEmpty) {
        final decoded = jsonDecode(cachedStr);
        if (decoded is List) {
          final list = decoded.map((e) => Team.fromJson(Json.from(e as Map))).toList();
          if (list.isNotEmpty) {
            _memTeams = list;
            unawaited(_fetchRemoteTeams().then((fresh) {
              if (fresh.isNotEmpty) _memTeams = fresh;
            }).catchError((_) {}));
            return list;
          }
        }
      }
    } catch (_) {}

    final remote = await _fetchRemoteTeams();
    if (remote.isNotEmpty) {
      _memTeams = remote;
      return remote;
    }

    return _memTeams ?? const [];
  }

  Future<List<Team>> _fetchRemoteTeams() async {
    List<dynamic>? rawRows;

    try {
      final rows = await _anonClient
          .from('teams')
          .select()
          .order('created_at', ascending: true)
          .timeout(const Duration(seconds: 8));
      rawRows = rows as List<dynamic>;
    } catch (e) {
      debugPrint('[LeagueRepository] anonClient fetchTeams error: $e');
    }

    if (rawRows == null || rawRows.isEmpty) {
      try {
        final rows = await _client
            .from('teams')
            .select()
            .order('created_at', ascending: true)
            .timeout(const Duration(seconds: 8));
        rawRows = rows as List<dynamic>;
      } catch (e) {
        debugPrint('[LeagueRepository] client fetchTeams error: $e');
      }
    }

    if (rawRows == null || rawRows.isEmpty) return const [];

    final list = rawRows.map((r) => Team.fromJson(Json.from(r as Map))).toList();
    if (list.isNotEmpty) {
      _memTeams = list;
      try {
        final sp = await SharedPreferences.getInstance();
        await sp.setString(_cachedTeamsKey, jsonEncode(rawRows));
      } catch (_) {}
    }
    return list;
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
          .eq('user_id', userId)
          .timeout(const Duration(seconds: 6));
      for (final r in rows) {
        result.add(r['league_id'].toString());
      }
    } catch (_) {
      try {
        final rows = await _client
            .from('league_follows')
            .select('league_id')
            .eq('user_id', userId)
            .timeout(const Duration(seconds: 6));
        for (final r in rows) {
          result.add(r['league_id'].toString());
        }
      } catch (_) {}
    }

    // Persist combined follows to SharedPreferences
    if (result.isNotEmpty) {
      try {
        final sp = await SharedPreferences.getInstance();
        await sp.setStringList('$_localFollowsPrefix$userId', result.toList());
      } catch (_) {}
    }

    return result;
  }

  Future<Map<String, int>> fetchFollowerCounts() async {
    try {
      final rows = await _anonClient
          .from('league_follows')
          .select('league_id')
          .timeout(const Duration(seconds: 6));
      final counts = <String, int>{};
      for (final r in rows) {
        final id = r['league_id'].toString();
        counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    } catch (_) {
      try {
        final rows = await _client
            .from('league_follows')
            .select('league_id')
            .timeout(const Duration(seconds: 6));
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
