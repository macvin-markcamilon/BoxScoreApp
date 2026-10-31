import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/status_badges.dart';
import '../../core/widgets/team_badge.dart';
import 'games_providers.dart';

/// Scoreboard-style game card with PLAYING NOW / LIVE indicators.
class GameCard extends StatelessWidget {
  const GameCard({super.key, required this.game, this.onTap, this.dense = false});
  final GameItem game;
  final VoidCallback? onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final m = game.match;
    final inProgress = game.isPlayingNow;

    return Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: game.isLive
              ? AppColors.live.withValues(alpha: 0.5)
              : inProgress
                  ? AppColors.playing.withValues(alpha: 0.5)
                  : AppColors.border,
          width: inProgress ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        onTap: onTap ??
            () => context.push(
                  Routes.gameDetailsPath(game.match.id, leagueId: game.league.id),
                ),
        child: Padding(
          padding: EdgeInsets.all(dense ? 12 : 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header: league + status indicators
              Row(
                children: [
                  Expanded(
                    child: Text(
                      game.league.name.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: t.labelSmall?.copyWith(
                        color: AppColors.textMuted,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                  if (game.isPlayingNow) const PlayingNowBadge(),
                  if (game.isLive) ...[
                    const SizedBox(width: 6),
                    const LiveBadge(),
                  ],
                  if (game.isFinal)
                    const StatusPill(label: 'FINAL', color: AppColors.brandNavy),
                  if (!game.isFinal && !game.isPlayingNow)
                    const StatusPill(
                      label: 'UPCOMING',
                      color: AppColors.success,
                      icon: Icons.schedule,
                    ),
                ],
              ),
              SizedBox(height: dense ? 10 : 14),
              _TeamRow(
                badge: TeamBadge(team: game.home, fallbackLabel: game.homeShort, size: dense ? 34 : 40),
                name: game.homeName,
                score: game.hasScore ? game.homeScore : null,
                isWinner: game.isFinal && (game.homeScore ?? 0) > (game.awayScore ?? 0),
              ),
              const SizedBox(height: 8),
              _TeamRow(
                badge: TeamBadge(team: game.away, fallbackLabel: game.awayShort, size: dense ? 34 : 40),
                name: game.awayName,
                score: game.hasScore ? game.awayScore : null,
                isWinner: game.isFinal && (game.awayScore ?? 0) > (game.homeScore ?? 0),
              ),
              SizedBox(height: dense ? 10 : 12),
              const Divider(),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    inProgress ? Icons.timer_outlined : Icons.event,
                    size: 14,
                    color: inProgress ? AppColors.live : AppColors.textMuted,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    inProgress && game.session != null
                        ? '${game.session!.periodLabel} · ${game.session!.clockDisplay}'
                        : Fmt.relative(m.scheduledAt),
                    style: t.labelMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: inProgress ? AppColors.live : AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(width: 12),
                  if (m.courtName != null) ...[
                    const Icon(Icons.place_outlined, size: 14, color: AppColors.textMuted),
                    const SizedBox(width: 2),
                    Expanded(
                      child: Text(
                        m.courtName!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: t.labelMedium?.copyWith(color: AppColors.textMuted),
                      ),
                    ),
                  ] else
                    const Spacer(),
                  Text(
                    m.categoryName != null
                        ? '${m.categoryName} · G${m.gameNumber}'
                        : '${m.roundLabel} · G${m.gameNumber}',
                    style: t.labelSmall?.copyWith(
                      color: AppColors.textMuted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TeamRow extends StatelessWidget {
  const _TeamRow({
    required this.badge,
    required this.name,
    required this.score,
    required this.isWinner,
  });

  final Widget badge;
  final String name;
  final int? score;
  final bool isWinner;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Row(
      children: [
        badge,
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: t.titleMedium?.copyWith(
              fontWeight: isWinner ? FontWeight.w900 : FontWeight.w700,
            ),
          ),
        ),
        Text(
          score?.toString() ?? '–',
          style: t.headlineSmall?.copyWith(
            fontWeight: FontWeight.w900,
            fontFeatures: const [FontFeature.tabularFigures()],
            color: isWinner || score == null
                ? AppColors.textStrong
                : AppColors.textStrong.withValues(alpha: 0.7),
          ),
        ),
      ],
    );
  }
}
