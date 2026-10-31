import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/config/env.dart';
import 'models/game.dart';
import 'models/json_utils.dart';
import 'models/league.dart';
import 'models/team.dart';
import 'models/user_profile.dart';
import 'repositories/auth_repository.dart';
import 'repositories/league_repository.dart';
import 'repositories/profile_repository.dart';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

final supabaseClientProvider =
    Provider<SupabaseClient>((_) => Supabase.instance.client);

/// Dedicated unauthenticated client using the anon publishable key.
/// Bypasses any oversized auth Bearer headers caused by base64 avatars in JWT.
final anonSupabaseClientProvider = Provider<SupabaseClient>((_) => SupabaseClient(
      Env.supabaseUrl,
      Env.supabasePublishableKey,
    ));

final authRepositoryProvider =
    Provider((ref) => AuthRepository(ref.watch(supabaseClientProvider)));

final profileRepositoryProvider =
    Provider((ref) => ProfileRepository(
          ref.watch(supabaseClientProvider),
          anonClient: ref.watch(anonSupabaseClientProvider),
        ));

final leagueRepositoryProvider =
    Provider((ref) => LeagueRepository(
          ref.watch(supabaseClientProvider),
          anonClient: ref.watch(anonSupabaseClientProvider),
        ));

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

final authStateProvider = StreamProvider<AuthState>(
  (ref) => ref.watch(authRepositoryProvider).authStateChanges(),
);

final currentUserIdProvider = Provider<String?>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(authRepositoryProvider).currentUser?.id;
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

class ProfileController extends AsyncNotifier<UserProfile?> {
  @override
  Future<UserProfile?> build() async {
    final uid = ref.watch(currentUserIdProvider);
    if (uid == null) return null;
    return ref.read(profileRepositoryProvider).fetchCurrent();
  }

  Future<void> save(UserProfile updated) async {
    final previous = state;
    state = AsyncData(updated); // optimistic
    try {
      final saved = await ref.read(profileRepositoryProvider).update(updated);
      state = AsyncData(saved);
    } catch (e) {
      state = previous;
      rethrow;
    }
  }
}

final profileProvider =
    AsyncNotifierProvider<ProfileController, UserProfile?>(ProfileController.new);

// ---------------------------------------------------------------------------
// Leagues, teams & follows
// ---------------------------------------------------------------------------

class LeaguesController extends AsyncNotifier<List<League>> {
  @override
  Future<List<League>> build() async {
    ref.watch(currentUserIdProvider);
    try {
      return await ref.read(leagueRepositoryProvider).fetchLeagues();
    } catch (e) {
      if (state.hasValue && state.value!.isNotEmpty) {
        return state.value!;
      }
      return const [];
    }
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(leagueRepositoryProvider).fetchLeagues(),
    );
  }

  bool _syncing = false;

  /// Re-fetches in the background without flashing a loading state.
  /// Keeps newer realtime sessions if the fetched row is older.
  Future<void> silentRefresh() async {
    if (_syncing) return;
    _syncing = true;
    try {
      final fresh = await ref.read(leagueRepositoryProvider).fetchLeagues();
      if (fresh.isEmpty && (state.valueOrNull?.isNotEmpty ?? false)) return;
      final current = {for (final l in state.valueOrNull ?? const <League>[]) l.id: l};
      state = AsyncData([
        for (final l in fresh) _keepNewerSessions(l, current[l.id]),
      ]);
    } catch (_) {
      // Keep showing the last good data.
    } finally {
      _syncing = false;
    }
  }

  League _keepNewerSessions(League fresh, League? old) {
    if (old == null) return fresh;
    var merged = fresh;
    for (final s in old.sessions.values) {
      final f = fresh.sessions[s.matchId];
      if (f == null || !s.isOlderThan(f)) merged = merged.withSession(s);
    }
    return merged;
  }

  /// Applies a live session pushed via Supabase Realtime broadcast.
  void applySession(LiveGameSession session) {
    final leagues = state.valueOrNull;
    if (leagues == null) return;
    var changed = false;
    final next = [
      for (final l in leagues)
        if ((session.leagueId == null || l.id == session.leagueId) &&
            l.matches.any((m) => m.id == session.matchId))
          () {
            final existing = l.sessions[session.matchId];
            if (existing != null && !existing.isOlderThan(session)) return l;
            changed = true;
            return l.withSession(session);
          }()
        else
          l,
    ];
    if (changed) state = AsyncData(next);
  }
}

final leaguesProvider =
    AsyncNotifierProvider<LeaguesController, List<League>>(LeaguesController.new);

final teamsByIdProvider = FutureProvider<Map<String, Team>>((ref) async {
  ref.watch(currentUserIdProvider);
  final leagues = await ref.watch(leaguesProvider.future);
  final dbTeams = await ref.read(leagueRepositoryProvider).fetchTeams();
  final map = {for (final t in dbTeams) t.id: t};
  for (final l in leagues) {
    for (final t in l.embeddedTeams) {
      map.putIfAbsent(t.id, () => t);
    }
  }
  return map;
});

final followerCountsProvider = FutureProvider<Map<String, int>>((ref) {
  ref.watch(currentUserIdProvider);
  return ref.read(leagueRepositoryProvider).fetchFollowerCounts();
});

class FollowsController extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() async {
    final uid = ref.watch(currentUserIdProvider);
    if (uid == null) return {};
    return ref.read(leagueRepositoryProvider).fetchFollowedLeagueIds(uid);
  }

  Future<void> toggle(String leagueId) async {
    final uid = ref.read(currentUserIdProvider);
    if (uid == null) return;
    final current = {...?state.valueOrNull};
    final willFollow = !current.contains(leagueId);
    state = AsyncData(
      willFollow ? (current..add(leagueId)) : (current..remove(leagueId)),
    );
    try {
      final repo = ref.read(leagueRepositoryProvider);
      willFollow
          ? await repo.follow(uid, leagueId)
          : await repo.unfollow(uid, leagueId);
      ref.invalidate(followerCountsProvider);
    } catch (e) {
      ref.invalidateSelf();
      rethrow;
    }
  }
}

final followsProvider =
    AsyncNotifierProvider<FollowsController, Set<String>>(FollowsController.new);

// ---------------------------------------------------------------------------
// Supabase Realtime Sync Manager
// ---------------------------------------------------------------------------

final realtimeSyncProvider = Provider<RealtimeChannel>((ref) {
  final anonClient = ref.watch(anonSupabaseClientProvider);
  final leaguesNotifier = ref.read(leaguesProvider.notifier);

  final channel = anonClient.channel('boxscore_realtime_sync');

  channel
      .onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'leagues',
        callback: (payload) {
          leaguesNotifier.silentRefresh();
        },
      )
      .onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'teams',
        callback: (payload) {
          ref.invalidate(teamsByIdProvider);
        },
      )
      .onBroadcast(
        event: 'GAME_SESSION_UPDATE',
        callback: (payload) {
          try {
            final inner = payload['payload'];
            if (inner is Map<String, dynamic>) {
              final matchId = inner['matchId']?.toString();
              final rawSession = inner['session'];
              if (matchId != null && rawSession is Map<String, dynamic>) {
                final session = LiveGameSession.fromJson(matchId, Json.from(rawSession));
                leaguesNotifier.applySession(session);
              }
            }
          } catch (_) {}
        },
      )
      .onBroadcast(
        event: 'NOTIFICATION_EVENT',
        callback: (_) {
          leaguesNotifier.silentRefresh();
        },
      )
      .subscribe();

  ref.onDispose(() {
    channel.unsubscribe();
  });

  return channel;
});
