import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/user_avatar.dart';
import '../../data/models/user_profile.dart';
import '../../data/providers.dart';
import 'career_stats.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref
      ..invalidate(profileProvider)
      ..invalidate(careerStatsProvider);
    await ref.read(profileProvider.future);
  }

  Future<void> _signOut() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign Out', style: TextStyle(fontWeight: FontWeight.w900)),
        content: const Text('Are you sure you want to sign out of BOX SCORE?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.brandRed),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );

    if (confirm == true && mounted) {
      await ref.read(authRepositoryProvider).signOut();
      if (mounted) {
        context.go(Routes.signIn);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(profileProvider);
    final careerAsync = ref.watch(careerStatsProvider);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.surfaceAlt,
        body: RefreshIndicator(
          onRefresh: _refresh,
          child: profileAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, _) => Center(
              child: ErrorView(error: err, onRetry: _refresh),
            ),
            data: (profile) {
              if (profile == null) {
                return Center(
                  child: EmptyState(
                    icon: Icons.person_off_outlined,
                    title: 'No Profile Found',
                    message: 'Please sign in to view your player profile.',
                    action: FilledButton(
                      onPressed: () => context.go(Routes.signIn),
                      child: const Text('Sign In'),
                    ),
                  ),
                );
              }

              final career = careerAsync.valueOrNull ?? CareerStats.empty;

              return CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverAppBar(
                    expandedHeight: 230,
                    pinned: true,
                    backgroundColor: AppColors.brandNavy,
                    foregroundColor: Colors.white,
                    systemOverlayStyle: SystemUiOverlayStyle.light,
                    actions: [
                      IconButton(
                        icon: const Icon(Icons.edit_outlined),
                        tooltip: 'Edit Profile',
                        onPressed: () => context.push(Routes.editProfile),
                      ),
                      IconButton(
                        icon: const Icon(Icons.logout),
                        tooltip: 'Sign Out',
                        onPressed: _signOut,
                      ),
                    ],
                    flexibleSpace: FlexibleSpaceBar(
                      background: _ProfileHeroHeader(profile: profile),
                    ),
                    bottom: TabBar(
                      controller: _tabController,
                      indicatorColor: AppColors.brandRed,
                      indicatorWeight: 3,
                      labelColor: Colors.white,
                      unselectedLabelColor: Colors.white60,
                      labelStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 0.8),
                      tabs: const [
                        Tab(text: 'OVERVIEW & BIO'),
                        Tab(text: 'CAREER STATS & LOGS'),
                      ],
                    ),
                  ),
                  SliverFillRemaining(
                    child: TabBarView(
                      controller: _tabController,
                      children: [
                        _ProfileOverviewTab(profile: profile, career: career),
                        _ProfileStatsTab(career: career),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ProfileHeroHeader extends StatelessWidget {
  const _ProfileHeroHeader({required this.profile});
  final UserProfile profile;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final topPadding = MediaQuery.paddingOf(context).top;

    return Container(
      padding: EdgeInsets.fromLTRB(20, topPadding + 10, 20, 52),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.brandNavy, AppColors.brandNavyDark],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Stack(
            children: [
              UserAvatar(profile: profile, radius: 36, ring: Colors.white30),
              if (profile.jerseyNumber != null)
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.brandRed,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.white, width: 1.5),
                    ),
                    child: Text(
                      '#${profile.jerseyNumber}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 10,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.fullName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: t.titleLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  profile.email,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: t.bodySmall?.copyWith(color: Colors.white70),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    for (final role in profile.accountRoles)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.white12,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          role.value.toUpperCase(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    for (final pos in profile.positions)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.brandRed,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          pos.code,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileOverviewTab extends StatelessWidget {
  const _ProfileOverviewTab({required this.profile, required this.career});
  final UserProfile profile;
  final CareerStats career;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        if (profile.bio != null && profile.bio!.trim().isNotEmpty) ...[
          const Text(
            'ABOUT',
            style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.8, color: AppColors.brandNavy),
          ),
          const SizedBox(height: 6),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                profile.bio!,
                style: const TextStyle(height: 1.5, color: AppColors.textStrong),
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],

        const Text(
          'ATHLETE VITALS',
          style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.8, color: AppColors.brandNavy),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            _VitalsBox(
              label: 'HEIGHT',
              value: profile.heightCm != null ? '${profile.heightCm!.round()} cm' : '—',
              subValue: profile.heightCm != null ? _formatFeetInches(profile.heightCm!) : null,
              icon: Icons.height,
            ),
            const SizedBox(width: 10),
            _VitalsBox(
              label: 'WEIGHT',
              value: profile.weightKg != null ? '${profile.weightKg!.round()} kg' : '—',
              subValue: profile.weightKg != null ? '${(profile.weightKg! * 2.20462).round()} lbs' : null,
              icon: Icons.scale,
            ),
            const SizedBox(width: 10),
            _VitalsBox(
              label: 'AGE',
              value: profile.age != null ? '${profile.age}' : '—',
              subValue: profile.birthday != null ? Fmt.date(profile.birthday) : null,
              icon: Icons.cake_outlined,
            ),
          ],
        ),
        const SizedBox(height: 16),

        const Text(
          'COURT ROLES & SPECIALIZATION',
          style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.8, color: AppColors.brandNavy),
        ),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Positions Played', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.textMuted)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    if (profile.positions.isEmpty)
                      const Text('No positions selected', style: TextStyle(color: AppColors.textMuted)),
                    for (final pos in profile.positions)
                      Chip(
                        avatar: CircleAvatar(
                          backgroundColor: AppColors.brandRed,
                          child: Text(pos.code, style: const TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.w900)),
                        ),
                        label: Text(pos.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                  ],
                ),
                const Divider(height: 24),
                const Text('Account Capacities', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.textMuted)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    if (profile.accountRoles.isEmpty)
                      const Text('No roles specified', style: TextStyle(color: AppColors.textMuted)),
                    for (final role in profile.accountRoles)
                      Chip(
                        avatar: Icon(_roleIcon(role), size: 16, color: AppColors.brandNavy),
                        label: Text(role.value, style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        const Text(
          'HOME COURT & CONTACT',
          style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.8, color: AppColors.brandNavy),
        ),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _InfoRow(
                  icon: Icons.place_outlined,
                  label: 'Home Court / Address',
                  value: profile.address.trim().isNotEmpty ? profile.address : 'Not specified',
                ),
                if (profile.phone != null && profile.phone!.isNotEmpty) ...[
                  const Divider(height: 20),
                  _InfoRow(
                    icon: Icons.phone_outlined,
                    label: 'Contact Number',
                    value: profile.phone!,
                  ),
                ],
                const Divider(height: 20),
                _InfoRow(
                  icon: Icons.email_outlined,
                  label: 'Account Email',
                  value: profile.email,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        if (career.teams.isNotEmpty) ...[
          const Text(
            'ACTIVE TEAM ROSTERS',
            style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.8, color: AppColors.brandNavy),
          ),
          const SizedBox(height: 8),
          for (final team in career.teams)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: AppColors.brandNavy,
                  child: Text(
                    team.jerseyNumber != null ? '#${team.jerseyNumber}' : '🏀',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13),
                  ),
                ),
                title: Text(team.teamName, style: const TextStyle(fontWeight: FontWeight.w900)),
                subtitle: Text(team.leagueName, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
              ),
            ),
        ],
      ],
    );
  }

  IconData _roleIcon(AccountRole role) => switch (role) {
        AccountRole.player => Icons.sports_basketball,
        AccountRole.coach => Icons.sports,
        AccountRole.referee => Icons.sports_score,
        AccountRole.manager => Icons.badge_outlined,
      };

  static String _formatFeetInches(double cm) {
    final inches = cm / 2.54;
    final feet = inches ~/ 12;
    final remInches = (inches % 12).round();
    return '$feet\'$remInches"';
  }
}

class _ProfileStatsTab extends StatelessWidget {
  const _ProfileStatsTab({required this.career});
  final CareerStats career;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;

    if (career.gp == 0) {
      return const Center(
        child: EmptyState(
          icon: Icons.leaderboard_outlined,
          title: 'No Game Stats Yet',
          message: 'When you compete in leagues scored on BOX SCORE, your points, rebounds, assists and shooting percentages will automatically populate here.',
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: const LinearGradient(
              colors: [AppColors.brandRed, AppColors.brandRedDark],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'CAREER AVERAGES',
                    style: t.labelLarge?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1,
                    ),
                  ),
                  Text(
                    '${career.gp} GAMES PLAYED',
                    style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800, fontSize: 12),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _CareerBannerStat('PPG', Fmt.oneDecimal(career.ppg)),
                  _CareerBannerStat('RPG', Fmt.oneDecimal(career.rpg)),
                  _CareerBannerStat('APG', Fmt.oneDecimal(career.apg)),
                  _CareerBannerStat('SPG', Fmt.oneDecimal(career.spg)),
                  _CareerBannerStat('BPG', Fmt.oneDecimal(career.bpg)),
                ],
              ),
              const Divider(color: Colors.white24, height: 28),
              Row(
                children: [
                  _CareerBannerStat('FG%', Fmt.pct(career.fgPct)),
                  _CareerBannerStat('3P%', Fmt.pct(career.tpPct)),
                  _CareerBannerStat('FT%', Fmt.pct(career.ftPct)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        const Text(
          'CAREER TOTALS ACCUMULATED',
          style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.8, color: AppColors.brandNavy),
        ),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Wrap(
              runSpacing: 14,
              spacing: 20,
              children: [
                _TotalStatItem('Points', '${career.pts}'),
                _TotalStatItem('Rebounds', '${career.reb}'),
                _TotalStatItem('Assists', '${career.ast}'),
                _TotalStatItem('Steals', '${career.stl}'),
                _TotalStatItem('Blocks', '${career.blk}'),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        const Text(
          'GAME-BY-GAME LOG',
          style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.8, color: AppColors.brandNavy),
        ),
        const SizedBox(height: 8),
        for (final entry in career.log)
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        entry.date != null ? Fmt.shortDate(entry.date) : 'Final',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: AppColors.textMuted),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '·  ${entry.leagueName}',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: AppColors.brandNavy),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${entry.teamName} vs ${entry.opponentName}',
                    style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _StatBadge('PTS', entry.stats.points),
                      const SizedBox(width: 6),
                      _StatBadge('REB', entry.stats.reb),
                      const SizedBox(width: 6),
                      _StatBadge('AST', entry.stats.ast),
                      const SizedBox(width: 6),
                      _StatBadge('STL', entry.stats.stl),
                      const SizedBox(width: 6),
                      _StatBadge('BLK', entry.stats.blk),
                    ],
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _VitalsBox extends StatelessWidget {
  const _VitalsBox({
    required this.label,
    required this.value,
    this.subValue,
    required this.icon,
  });

  final String label;
  final String value;
  final String? subValue;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 18, color: AppColors.brandRed),
              const SizedBox(height: 8),
              Text(
                value,
                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
              ),
              if (subValue != null)
                Text(
                  subValue!,
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                ),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: AppColors.brandNavy),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted)),
              const SizedBox(height: 2),
              Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ],
    );
  }
}

class _CareerBannerStat extends StatelessWidget {
  const _CareerBannerStat(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800, fontSize: 10.5)),
        ],
      ),
    );
  }
}

class _TotalStatItem extends StatelessWidget {
  const _TotalStatItem(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 90,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textMuted, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _StatBadge extends StatelessWidget {
  const _StatBadge(this.label, this.val);
  final String label;
  final int val;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('$val ', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13)),
          Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 10, color: AppColors.textMuted)),
        ],
      ),
    );
  }
}
