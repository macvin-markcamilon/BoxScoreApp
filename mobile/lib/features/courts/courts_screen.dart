import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/status_badges.dart';
import 'court_painters.dart';
import 'mock_courts.dart';

enum CourtFilter { all, openNow, indoor, outdoor, free }

extension on CourtFilter {
  String get label => switch (this) {
        CourtFilter.all => 'All',
        CourtFilter.openNow => 'Open now',
        CourtFilter.indoor => 'Indoor',
        CourtFilter.outdoor => 'Outdoor',
        CourtFilter.free => 'Free',
      };
  bool test(MockCourt c) => switch (this) {
        CourtFilter.all => true,
        CourtFilter.openNow => c.openNow,
        CourtFilter.indoor => c.type == CourtType.indoor,
        CourtFilter.outdoor => c.type == CourtType.outdoor,
        CourtFilter.free => c.pricePerHour == null,
      };
}

/// Courts tab — design mock. Data comes from [mockCourts].
class CourtsScreen extends StatefulWidget {
  const CourtsScreen({super.key});

  @override
  State<CourtsScreen> createState() => _CourtsScreenState();
}

class _CourtsScreenState extends State<CourtsScreen> {
  CourtFilter _filter = CourtFilter.all;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final courts = mockCourts
        .where(_filter.test)
        .where((c) =>
            _query.isEmpty ||
            '${c.name} ${c.address}'.toLowerCase().contains(_query))
        .toList();
    final featured = mockCourts.where((c) => c.featured).toList();

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          const SliverAppBar(
            pinned: true,
            floating: true,
            backgroundColor: AppColors.surface,
            surfaceTintColor: Colors.transparent,
            title: Text(
              'COURTS',
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 24,
                letterSpacing: 0.8,
                color: AppColors.textStrong,
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 10),
              child: SearchBar(
                hintText: 'Search courts or city',
                leading: const Icon(Icons.search),
                trailing: const [Icon(Icons.tune)],
                elevation: const WidgetStatePropertyAll(0),
                backgroundColor: const WidgetStatePropertyAll(Colors.white),
                side: const WidgetStatePropertyAll(BorderSide(color: AppColors.border)),
                shape: WidgetStatePropertyAll(
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
              ),
            ),
          ),
          SliverToBoxAdapter(child: _MapPreview(courts: courts)),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 48,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
                scrollDirection: Axis.horizontal,
                itemCount: CourtFilter.values.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final f = CourtFilter.values[i];
                  final sel = f == _filter;
                  return ChoiceChip(
                    label: Text(f.label),
                    selected: sel,
                    showCheckmark: false,
                    selectedColor: AppColors.brandNavy,
                    labelStyle: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      color: sel ? Colors.white : AppColors.textStrong,
                    ),
                    onSelected: (_) => setState(() => _filter = f),
                  );
                },
              ),
            ),
          ),
          const SliverToBoxAdapter(
            child: SectionHeader(
              title: 'Featured Courts',
              icon: Icons.star_rounded,
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 210,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                scrollDirection: Axis.horizontal,
                itemCount: featured.length,
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemBuilder: (_, i) => _FeaturedCourtCard(court: featured[i]),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: SectionHeader(
              title: 'Nearby Courts',
              icon: Icons.near_me_outlined,
              count: courts.length,
            ),
          ),
          if (courts.isEmpty)
            const SliverToBoxAdapter(
              child: EmptyState(
                icon: Icons.location_off_outlined,
                title: 'No courts match',
                message: 'Try a different filter or search.',
              ),
            )
          else
            SliverList.builder(
              itemCount: courts.length,
              itemBuilder: (_, i) => Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: _CourtTile(court: courts[i]),
              ),
            ),
          const SliverToBoxAdapter(child: _ComingSoonBanner()),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }
}

class _MapPreview extends StatelessWidget {
  const _MapPreview({required this.courts});
  final List<MockCourt> courts;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: SizedBox(
          height: 180,
          child: LayoutBuilder(
            builder: (context, c) => Stack(
              children: [
                const Positioned.fill(child: CustomPaint(painter: MockMapPainter())),
                for (final court in courts)
                  Positioned(
                    left: court.mapPos.dx * (c.maxWidth - 36),
                    top: court.mapPos.dy * (c.maxHeight - 44),
                    child: _MapPin(court: court),
                  ),
                Positioned(
                  left: c.maxWidth / 2 - 9,
                  top: c.maxHeight / 2 - 9,
                  child: Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      color: Colors.blue,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 3),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.blue.withValues(alpha: 0.35),
                          blurRadius: 12,
                          spreadRadius: 6,
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  right: 10,
                  bottom: 10,
                  child: FilledButton.icon(
                    onPressed: () => _comingSoon(context),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 36),
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.brandNavy,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                    ),
                    icon: const Icon(Icons.map_outlined, size: 18),
                    label: const Text('Open map'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MapPin extends StatelessWidget {
  const _MapPin({required this.court});
  final MockCourt court;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: court.name,
        child: Column(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: court.color,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 3),
                boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 6)],
              ),
              child: const Icon(Icons.sports_basketball, color: Colors.white, size: 18),
            ),
            CustomPaint(size: const Size(10, 8), painter: PinTailPainter(court.color)),
          ],
        ),
      );
}

class _FeaturedCourtCard extends StatelessWidget {
  const _FeaturedCourtCard({required this.court});
  final MockCourt court;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return SizedBox(
      width: 260,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _showCourt(context, court),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                height: 110,
                width: double.infinity,
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: CustomPaint(painter: CourtArtPainter(court.color)),
                    ),
                    Positioned(
                      left: 10,
                      top: 10,
                      child: _RatingPill(rating: court.rating),
                    ),
                    if (court.activeGames > 0)
                      const Positioned(right: 10, top: 10, child: LiveBadge(compact: true)),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(court.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: t.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 2),
                    Text(
                      '${court.distanceKm} km · ${court.surface}',
                      style: t.bodySmall?.copyWith(color: AppColors.textMuted),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      court.pricePerHour == null ? 'FREE' : '₱${court.pricePerHour}/hr',
                      style: t.labelLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: court.pricePerHour == null
                            ? AppColors.success
                            : AppColors.brandRed,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CourtTile extends StatelessWidget {
  const _CourtTile({required this.court});
  final MockCourt court;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _showCourt(context, court),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 78,
                  height: 78,
                  child: CustomPaint(painter: CourtArtPainter(court.color)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(court.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: t.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
                    Text(court.address,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: t.bodySmall?.copyWith(color: AppColors.textMuted)),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        StatusPill(
                          label: court.openNow ? 'OPEN' : 'CLOSED',
                          color: court.openNow ? AppColors.success : AppColors.textMuted,
                        ),
                        StatusPill(
                          label: court.type == CourtType.indoor ? 'INDOOR' : 'OUTDOOR',
                          color: AppColors.brandNavy,
                        ),
                        if (court.activeGames > 0)
                          StatusPill(
                            label: '${court.activeGames} GAME${court.activeGames > 1 ? 'S' : ''} ON',
                            color: AppColors.live,
                            icon: Icons.sports_basketball,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('${court.distanceKm} km',
                      style: t.labelLarge?.copyWith(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.star_rounded, size: 16, color: Colors.amber),
                      Text('${court.rating}',
                          style: t.labelMedium?.copyWith(fontWeight: FontWeight.w800)),
                    ],
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

class _RatingPill extends StatelessWidget {
  const _RatingPill({required this.rating});
  final double rating;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.star_rounded, size: 14, color: Colors.amber),
            const SizedBox(width: 2),
            Text('$rating',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900)),
          ],
        ),
      );
}

class _ComingSoonBanner extends StatelessWidget {
  const _ComingSoonBanner();

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: AppColors.brandNavy.withValues(alpha: 0.06),
          border: Border.all(color: AppColors.brandNavy.withValues(alpha: 0.15)),
        ),
        child: Row(
          children: [
            const Icon(Icons.rocket_launch_outlined, color: AppColors.brandNavy),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Court booking, live availability and pickup game check-ins are coming soon.',
                style: t.bodySmall?.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

void _comingSoon(BuildContext context) => ScaffoldMessenger.of(context)
  ..hideCurrentSnackBar()
  ..showSnackBar(const SnackBar(content: Text('Coming soon')));

Future<void> _showCourt(BuildContext context, MockCourt court) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    builder: (context) {
      final t = Theme.of(context).textTheme;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: SizedBox(
                  height: 140,
                  width: double.infinity,
                  child: CustomPaint(painter: CourtArtPainter(court.color)),
                ),
              ),
              const SizedBox(height: 14),
              Text(court.name, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
              Text(court.address, style: t.bodyMedium?.copyWith(color: AppColors.textMuted)),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(Icons.star_rounded, color: Colors.amber, size: 18),
                  Text(' ${court.rating} (${court.reviews} reviews)'),
                  const Spacer(),
                  const Icon(Icons.schedule, size: 16, color: AppColors.textMuted),
                  Text(' ${court.hours}'),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final a in court.amenities)
                    Chip(label: Text(a), visualDensity: VisualDensity.compact),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _comingSoon(context),
                      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      icon: const Icon(Icons.directions),
                      label: const Text('Directions'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => _comingSoon(context),
                      icon: const Icon(Icons.event_available),
                      label: const Text('BOOK'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    },
  );
}
