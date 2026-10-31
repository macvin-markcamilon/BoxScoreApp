import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/league.dart';
import '../../data/models/user_profile.dart';
import '../../data/providers.dart';

enum SuggestionReason { nearYou, live, trending, upcoming }

class SuggestedLeague {
  const SuggestedLeague(this.league, this.reason, this.score);
  final League league;
  final SuggestionReason reason;
  final int score;
}

class LeagueSections {
  const LeagueSections({
    required this.all,
    required this.owned,
    required this.followed,
    required this.suggested,
  });
  final List<League> all;
  final List<League> owned;
  final List<League> followed;
  final List<SuggestedLeague> suggested;

  bool get isEmpty => all.isEmpty;
}

/// Splits leagues into: all → created/administered by me → followed → near me / suggested.
final leagueSectionsProvider = FutureProvider<LeagueSections>((ref) async {
  final uid = ref.watch(currentUserIdProvider);
  final profile = ref.watch(profileProvider).valueOrNull;
  final leagues = await ref.watch(leaguesProvider.future);
  final follows = await ref.watch(followsProvider.future);
  final counts = ref.watch(followerCountsProvider).valueOrNull ?? const {};

  final normalizedEmail = profile?.email.trim().toLowerCase();

  // User is owner if ownerId == uid OR user is an accepted Admin/Manager in members
  bool isUserAffiliated(League l) {
    if (uid != null && l.ownerId == uid) return true;
    for (final m in l.members) {
      if (m.status == 'DECLINED') continue;
      if (uid != null && m.userId != null && m.userId == uid) return true;
      if (normalizedEmail != null && m.email.trim().toLowerCase() == normalizedEmail) {
        return true;
      }
    }
    return false;
  }

  final owned = leagues.where(isUserAffiliated).toList();
  final followed = leagues
      .where((l) => follows.contains(l.id))
      .toList();

  final tokens = _locationTokens(profile);
  final suggested = leagues
      .where((l) => !isUserAffiliated(l) && !follows.contains(l.id))
      .map((l) => _score(l, tokens, counts[l.id] ?? 0))
      .toList()
    ..sort((a, b) => b.score.compareTo(a.score));

  return LeagueSections(
    all: leagues,
    owned: owned,
    followed: followed,
    suggested: suggested.take(20).toList(),
  );
});

const _stopWords = {
  'city', 'street', 'st', 'brgy', 'barangay', 'ave', 'avenue', 'road', 'rd',
  'the', 'and', 'province', 'metro', 'philippines', 'ph',
};

Set<String> _locationTokens(UserProfile? p) {
  if (p == null || p.address.trim().isEmpty) return {};
  return p.address
      .toLowerCase()
      .split(RegExp(r'[^a-z0-9ñ]+'))
      .where((t) => t.length >= 3 && !_stopWords.contains(t))
      .toSet();
}

SuggestedLeague _score(League l, Set<String> tokens, int followers) {
  final haystack = l.courts
      .map((c) => '${c.name} ${c.address}')
      .join(' ')
      .toLowerCase();
  final nearHits =
      tokens.isEmpty ? 0 : tokens.where((t) => haystack.contains(t)).length;

  var score = nearHits * 40 + followers * 3;
  if (l.liveGameCount > 0) score += 30;
  if (l.isOngoing) score += 15;
  if (l.isUpcoming) score += 8;

  final reason = nearHits > 0
      ? SuggestionReason.nearYou
      : l.liveGameCount > 0
          ? SuggestionReason.live
          : l.isUpcoming
              ? SuggestionReason.upcoming
              : SuggestionReason.trending;
  return SuggestedLeague(l, reason, score);
}
