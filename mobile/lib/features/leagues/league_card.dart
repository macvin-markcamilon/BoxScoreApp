import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/app_image.dart';
import '../../core/widgets/status_badges.dart';
import '../../data/models/game.dart';
import '../../data/models/league.dart';
import '../../data/providers.dart';
import 'league_providers.dart';

class LeagueLogo extends StatelessWidget {
  const LeagueLogo({super.key, required this.league, this.size = 56});
  final League league;
  final double size;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.brandNavy, AppColors.brandRed],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        league.name.isEmpty ? '?' : league.name[0].toUpperCase(),
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w900,
          fontSize: size * 0.42,
        ),
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.25),
      child: SizedBox.square(
        dimension: size,
        child: AppImage(url: league.imageUrl, fallback: fallback),
      ),
    );
  }
}

/// List tile style league card (used in League tab sections).
class LeagueCard extends ConsumerWidget {
  const LeagueCard({
    super.key,
    required this.league,
    this.isOwner = false,
    this.reason,
  });

  final League league;
  final bool isOwner;
  final SuggestionReason? reason;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context).textTheme;
    final following =
        ref.watch(followsProvider).valueOrNull?.contains(league.id) ?? false;
    final teamCount = league.embeddedTeams.isNotEmpty
        ? league.embeddedTeams.length
        : (ref
                .watch(teamsByIdProvider)
                .valueOrNull
                ?.values
                .where((t) => t.leagueId == league.id)
                .length ??
            0);
    final bannerProvider = AppImage.provider(league.imageUrl);

    return Card(
      elevation: 1,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push(Routes.leagueDetailsPath(league.id)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top Cover Banner if image exists or gradient
            Container(
              height: 120,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.brandNavy, AppColors.brandRed],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                image: bannerProvider != null
                    ? DecorationImage(
                        image: bannerProvider,
                        fit: BoxFit.cover,
                        colorFilter: ColorFilter.mode(
                          Colors.black.withValues(alpha: 0.35),
                          BlendMode.darken,
                        ),
                      )
                    : null,
              ),
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          if (reason != null) ...[
                            _reasonPill(reason!),
                            const SizedBox(width: 6),
                          ],
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppColors.brandRed,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              '${league.ruleSetId} RULES',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.75),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              '$teamCount TEAMS',
                              style: const TextStyle(
                                color: Color(0xFFFBBF24),
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          if (league.liveGameCount > 0) ...[
                            const SizedBox(width: 6),
                            const LiveBadge(compact: true),
                          ],
                        ],
                      ),
                      _FollowButton(leagueId: league.id, following: following),
                    ],
                  ),
                  Text(
                    league.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.3,
                      shadows: [
                        Shadow(color: Colors.black54, blurRadius: 4, offset: Offset(0, 1)),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Card Body (Organizer, Dates, Courts, Rules)
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.person_outline, size: 14, color: AppColors.textMuted),
                      const SizedBox(width: 4),
                      Text(
                        'Organizer: ${league.ownerName}',
                        style: t.bodySmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: AppColors.textMuted,
                        ),
                      ),
                      const Spacer(),
                      if (isOwner)
                        const StatusPill(
                          label: 'ADMIN / OWNER',
                          color: AppColors.brandRed,
                          icon: Icons.workspace_premium,
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.calendar_today, size: 14, color: AppColors.brandNavy),
                      const SizedBox(width: 6),
                      Text(
                        Fmt.dateRange(league.startDate, league.endDate),
                        style: t.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  if (league.courts.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.place_outlined, size: 14, color: AppColors.brandRed),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Courts (${league.courts.length}): ${league.courts.map((c) => c.name).join(", ")}',
                            style: t.bodySmall?.copyWith(color: AppColors.textMuted),
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 10),
                  // Rules box
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Text(
                      '${league.rulesInfo.shotClockSeconds}s Shot Clock • PF Limit: ${league.rulesInfo.personalFoulLimit} • Bonus on ${league.rulesInfo.teamFoulBonusThreshold}th Foul',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.brandNavy,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _reasonPill(SuggestionReason r) => switch (r) {
        SuggestionReason.nearYou =>
          const StatusPill(label: 'NEAR YOU', icon: Icons.near_me, color: AppColors.success),
        SuggestionReason.live =>
          const StatusPill(label: 'LIVE NOW', icon: Icons.bolt, color: AppColors.live),
        SuggestionReason.upcoming =>
          const StatusPill(label: 'STARTING SOON', icon: Icons.schedule, color: AppColors.playing),
        SuggestionReason.trending =>
          const StatusPill(label: 'TRENDING', icon: Icons.trending_up, color: AppColors.brandRed),
      };
}

class _FollowButton extends ConsumerWidget {
  const _FollowButton({required this.leagueId, required this.following});
  final String leagueId;
  final bool following;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    Future<void> toggle() async {
      try {
        await ref.read(followsProvider.notifier).toggle(leagueId);
      } catch (_) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not update follow. Try again.')),
          );
        }
      }
    }

    return following
        ? OutlinedButton(
            onPressed: toggle,
            style: OutlinedButton.styleFrom(
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.symmetric(horizontal: 12),
            ),
            child: const Text('Following'),
          )
        : FilledButton(
            onPressed: toggle,
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 36),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              visualDensity: VisualDensity.compact,
            ),
            child: const Text('Follow'),
          );
  }
}

Future<void> showLeagueSheet(
  BuildContext context,
  League league, {
  bool isOwner = false,
  int? teamCount,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: Colors.white,
    builder: (context) {
      final t = Theme.of(context).textTheme;
      final finals = league.matches.where((m) => m.status == MatchStatus.finalScore).length;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  LeagueLogo(league: league, size: 64),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(league.name,
                            style: t.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                        Text('by ${league.ownerName}',
                            style: t.bodySmall?.copyWith(color: AppColors.textMuted)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  _SheetStat(label: 'Games', value: '${league.matches.length}'),
                  _SheetStat(label: 'Final', value: '$finals'),
                  _SheetStat(label: 'Live', value: '${league.liveGameCount}'),
                  _SheetStat(label: 'Teams', value: '${teamCount ?? league.embeddedTeams.length}'),
                ],
              ),
              const SizedBox(height: 16),
              _SheetRow(icon: Icons.event, text: Fmt.dateRange(league.startDate, league.endDate)),
              _SheetRow(icon: Icons.gavel, text: '${league.ruleSetId} rulebook'),
              for (final c in league.courts)
                _SheetRow(
                  icon: Icons.place_outlined,
                  text: c.address.isEmpty ? c.name : '${c.name} · ${c.address}',
                ),
              if (isOwner) ...[
                const SizedBox(height: 12),
                Text(
                  'Manage schedules, rosters and live scoring from the BOX SCORE web studio.',
                  style: t.bodySmall?.copyWith(color: AppColors.textMuted),
                ),
              ],
            ],
          ),
        ),
      );
    },
  );
}

class _SheetStat extends StatelessWidget {
  const _SheetStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Expanded(
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          children: [
            Text(value, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
            Text(label.toUpperCase(),
                style: t.labelSmall?.copyWith(
                  color: AppColors.textMuted,
                  fontWeight: FontWeight.w800,
                )),
          ],
        ),
      ),
    );
  }
}

class _SheetRow extends StatelessWidget {
  const _SheetRow({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.brandNavy),
            const SizedBox(width: 10),
            Expanded(child: Text(text)),
          ],
        ),
      );
}
