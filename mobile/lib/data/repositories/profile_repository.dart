import 'dart:convert';
import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/json_utils.dart';
import '../models/user_profile.dart';

class ProfileRepository {
  ProfileRepository(this._client, {SupabaseClient? anonClient})
      : _anonClient = anonClient ?? _client;

  final SupabaseClient _client;
  final SupabaseClient _anonClient;

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
          .maybeSingle();
      if (res != null) {
        row = Json.from(res);
      }
    } catch (_) {
      try {
        final res = await _client
            .from('profiles')
            .select('id, email, first_name, last_name, birthday, address, height_cm, weight_kg, positions, account_roles, created_at, bio, jersey_number, phone, updated_at, avatar_url')
            .eq('id', user.id)
            .maybeSingle();
        if (res != null) {
          row = Json.from(res);
        }
      } catch (_) {}
    }

    return UserProfile.fromRow(
      id: user.id,
      email: user.email ?? '',
      row: row,
      metadata: user.userMetadata,
      createdAt: DateTime.tryParse(user.createdAt),
    );
  }

  Future<UserProfile> update(UserProfile profile) async {
    final row = await _client
        .from('profiles')
        .update(profile.toUpdateRow())
        .eq('id', profile.id)
        .select()
        .single();

    final user = _client.auth.currentUser;
    return UserProfile.fromRow(
      id: profile.id,
      email: profile.email,
      row: Json.from(row),
      metadata: user?.userMetadata,
    );
  }

  /// The web app stores avatars as compressed data URLs in `avatar_url`.
  /// We keep the same contract so both clients render the same image.
  String encodeAvatar(Uint8List bytes, {String mime = 'image/jpeg'}) =>
      'data:$mime;base64,${base64Encode(bytes)}';
}
