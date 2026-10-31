import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/user_profile.dart';

/// Thin wrapper over Supabase Auth that reproduces the web registration flow:
/// profile details go into `user_metadata` (consumed by the
/// `handle_new_user` trigger) and are also upserted into `public.profiles`.
class AuthRepository {
  AuthRepository(this._client);
  final SupabaseClient _client;

  GoTrueClient get _auth => _client.auth;

  Stream<AuthState> authStateChanges() => _auth.onAuthStateChange;
  Session? get currentSession => _auth.currentSession;
  User? get currentUser => _auth.currentUser;

  Future<void> signIn({required String email, required String password}) =>
      _auth.signInWithPassword(email: email.trim(), password: password);

  /// Returns `true` when a session was created immediately, `false` when the
  /// user must confirm their email first.
  Future<bool> signUp({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    required DateTime birthday,
    required String address,
    required double heightCm,
    required double weightKg,
    required List<PlayerPosition> positions,
    required List<AccountRole> roles,
  }) async {
    final birthdayIso = birthday.toIso8601String().split('T').first;
    final metadata = <String, dynamic>{
      'first_name': firstName.trim(),
      'last_name': lastName.trim(),
      'birthday': birthdayIso,
      'address': address.trim(),
      'height_cm': heightCm.toString(),
      'weight_kg': weightKg.toString(),
      'positions': positions.map((p) => p.code).toList(),
      'account_roles': roles.map((r) => r.value).toList(),
    };

    final res = await _auth.signUp(
      email: email.trim(),
      password: password,
      data: metadata,
    );

    final user = res.user;
    if (user != null && res.session != null) {
      // Best effort — the DB trigger also creates the row.
      try {
        await _client.from('profiles').upsert({
          'id': user.id,
          'email': email.trim(),
          'first_name': firstName.trim(),
          'last_name': lastName.trim(),
          'birthday': birthdayIso,
          'address': address.trim(),
          'height_cm': heightCm,
          'weight_kg': weightKg,
          'positions': metadata['positions'],
          'account_roles': metadata['account_roles'],
        });
      } on PostgrestException {
        // Ignored: trigger-created row is the source of truth.
      }
    }
    return res.session != null;
  }

  Future<void> sendPasswordReset(String email) =>
      _auth.resetPasswordForEmail(email.trim());

  Future<void> signOut() => _auth.signOut();
}

/// Maps Supabase/network errors to user-friendly copy.
String describeAuthError(Object error) {
  if (error is AuthException) {
    final code = error.statusCode;
    if (code == '504' || error.message.contains('504')) {
      return 'BOX SCORE servers are warming up. Please wait a few seconds and try again.';
    }
    if (error.message.toLowerCase().contains('invalid login')) {
      return 'Incorrect email or password.';
    }
    return error.message;
  }
  if (error is PostgrestException) return error.message;
  return 'Something went wrong. Check your connection and try again.';
}
