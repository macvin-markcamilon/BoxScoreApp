import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/json_utils.dart';
import '../models/user_profile.dart';

class ProfileRepository {
  ProfileRepository(this._client, {SupabaseClient? anonClient})
      : _anonClient = anonClient ?? _client;

  final SupabaseClient _client;
  final SupabaseClient _anonClient;

  static const _localAvatarPrefix = 'boxscore_avatar_';

  Future<UserProfile> fetchCurrent() async {
    final user = _client.auth.currentUser;
    if (user == null) throw const AuthException('Not signed in');

    Json? row;
    try {
      // Query with anonClient to bypass Cloudflare 400 header limits on JWT
      final res = await _anonClient
          .from('profiles')
          .select('id, email, first_name, last_name, birthday, address, height_cm, weight_kg, positions, account_roles, created_at, bio, jersey_number, phone, updated_at, avatar_url')
          .eq('id', user.id)
          .maybeSingle()
          .timeout(const Duration(seconds: 8));
      if (res != null) {
        row = Json.from(res);
      }
    } catch (_) {
      try {
        final res = await _client
            .from('profiles')
            .select('id, email, first_name, last_name, birthday, address, height_cm, weight_kg, positions, account_roles, created_at, bio, jersey_number, phone, updated_at, avatar_url')
            .eq('id', user.id)
            .maybeSingle()
            .timeout(const Duration(seconds: 8));
        if (res != null) {
          row = Json.from(res);
        }
      } catch (_) {}
    }

    var profile = UserProfile.fromRow(
      id: user.id,
      email: user.email ?? '',
      row: row,
      metadata: user.userMetadata,
      createdAt: DateTime.tryParse(user.createdAt),
    );

    // If avatarUrl is missing or empty, resolve from cache or team rosters
    if (profile.avatarUrl == null || profile.avatarUrl!.isEmpty) {
      final resolved = await _resolveAvatar(profile);
      if (resolved != null && resolved.isNotEmpty) {
        profile = profile.copyWith(avatarUrl: resolved);
      }
    } else {
      // Save valid avatarUrl to local cache
      try {
        final sp = await SharedPreferences.getInstance();
        await sp.setString('$_localAvatarPrefix${user.id}', profile.avatarUrl!);
      } catch (_) {}
    }

    return profile;
  }

  Future<String?> _resolveAvatar(UserProfile p) async {
    // 1. Check local SharedPreferences cache first
    try {
      final sp = await SharedPreferences.getInstance();
      final cached = sp.getString('$_localAvatarPrefix${p.id}');
      if (cached != null && cached.isNotEmpty) return cached;
    } catch (_) {}

    // 2. Search team rosters for a matching player with an avatar
    try {
      final rows = await _anonClient
          .from('teams')
          .select('roster')
          .timeout(const Duration(seconds: 6));
      final pFirst = p.firstName.trim().toLowerCase();
      final pLast = p.lastName.trim().toLowerCase();

      for (final r in rows) {
        final roster = readJsonList(r['roster']);
        for (final item in roster) {
          final first = readString(item['firstName']).trim().toLowerCase();
          final last = readString(item['lastName']).trim().toLowerCase();
          final img = readStringOrNull(item['imageUrl'] ?? item['image_url']);
          final num = readIntOrNull(item['jerseyNumber']);

          final nameMatch = pFirst.isNotEmpty && pLast.isNotEmpty && first == pFirst && last == pLast;
          final jerseyMatch = p.jerseyNumber != null && num == p.jerseyNumber && last == pLast;

          if ((nameMatch || jerseyMatch) && img != null && img.isNotEmpty) {
            // Save to local cache
            try {
              final sp = await SharedPreferences.getInstance();
              await sp.setString('$_localAvatarPrefix${p.id}', img);
            } catch (_) {}
            return img;
          }
        }
      }
    } catch (e) {
      debugPrint('[ProfileRepository] _resolveAvatar error: $e');
    }

    return null;
  }

  Future<UserProfile> update(UserProfile profile) async {
    final row = await _client
        .from('profiles')
        .update(profile.toUpdateRow())
        .eq('id', profile.id)
        .select()
        .single();

    final user = _client.auth.currentUser;
    final updated = UserProfile.fromRow(
      id: profile.id,
      email: profile.email,
      row: Json.from(row),
      metadata: user?.userMetadata,
    );

    if (profile.avatarUrl != null && profile.avatarUrl!.isNotEmpty) {
      try {
        final sp = await SharedPreferences.getInstance();
        await sp.setString('$_localAvatarPrefix${profile.id}', profile.avatarUrl!);
      } catch (_) {}
    }

    return updated;
  }

  /// The web app stores avatars as compressed data URLs in `avatar_url`.
  /// We keep the same contract so both clients render the same image.
  String encodeAvatar(Uint8List bytes, {String mime = 'image/jpeg'}) =>
      'data:$mime;base64,${base64Encode(bytes)}';
}
