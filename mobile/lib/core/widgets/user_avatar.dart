import 'package:flutter/material.dart';

import '../../data/models/user_profile.dart';
import '../theme/app_colors.dart';
import 'app_image.dart';

class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, required this.profile, this.radius = 24, this.ring});
  final UserProfile? profile;
  final double radius;
  final Color? ring;

  @override
  Widget build(BuildContext context) {
    final initials = Container(
      color: AppColors.brandRed,
      alignment: Alignment.center,
      child: Text(
        profile?.initials ?? '',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w900,
          fontSize: radius * 0.75,
        ),
      ),
    );
    return Container(
      padding: EdgeInsets.all(ring == null ? 0 : 2),
      decoration: BoxDecoration(color: ring, shape: BoxShape.circle),
      child: ClipOval(
        child: SizedBox.square(
          dimension: radius * 2,
          child: AppImage(url: profile?.avatarUrl, fallback: initials),
        ),
      ),
    );
  }
}
