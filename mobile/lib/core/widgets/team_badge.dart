import 'package:flutter/material.dart';

import '../../data/models/team.dart';
import '../utils/formatters.dart';
import 'app_image.dart';

class TeamBadge extends StatelessWidget {
  const TeamBadge({super.key, this.team, required this.fallbackLabel, this.size = 44});
  final Team? team;
  final String fallbackLabel;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = hexToColor(team?.primaryColor);
    final initials = Container(
      color: color,
      alignment: Alignment.center,
      child: Text(
        fallbackLabel,
        maxLines: 1,
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w900,
          fontSize: size * 0.3,
          letterSpacing: 0.5,
        ),
      ),
    );
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: color.withValues(alpha: 0.25), width: 2),
      ),
      child: ClipOval(child: AppImage(url: team?.imageUrl, fallback: initials)),
    );
  }
}
