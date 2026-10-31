import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/providers.dart';
import '../../features/auth/forgot_password_screen.dart';
import '../../features/auth/sign_in_screen.dart';
import '../../features/auth/sign_up_screen.dart';
import '../../features/courts/courts_screen.dart';
import '../../features/dashboard/dashboard_screen.dart';
import '../../features/games/game_details_screen.dart';
import '../../features/games/games_screen.dart';
import '../../features/leagues/league_details_screen.dart';
import '../../features/leagues/leagues_screen.dart';
import '../../features/profile/edit_profile_screen.dart';
import '../../features/profile/profile_screen.dart';
import 'app_shell.dart';
import 'routes.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _dashboardNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'dashboard');
final _leaguesNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'leagues');
final _gamesNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'games');
final _courtsNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'courts');
final _profileNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'profile');

class AuthNotifier extends ChangeNotifier {
  AuthNotifier(Stream<AuthState> stream) {
    _subscription = stream.listen((_) => notifyListeners());
  }
  late final dynamic _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

final authNotifierProvider = Provider<AuthNotifier>((ref) {
  final repo = ref.watch(authRepositoryProvider);
  final notifier = AuthNotifier(repo.authStateChanges());
  ref.onDispose(notifier.dispose);
  return notifier;
});

final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = ref.watch(authNotifierProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: Routes.dashboard,
    refreshListenable: authNotifier,
    redirect: (context, state) {
      final session = Supabase.instance.client.auth.currentSession;
      final isLoggingIn = Routes.authRoutes.contains(state.matchedLocation);

      if (session == null) {
        return isLoggingIn ? null : Routes.signIn;
      }

      if (isLoggingIn) {
        return Routes.dashboard;
      }

      return null;
    },
    routes: [
      // Auth routes outside bottom nav shell
      GoRoute(
        path: Routes.signIn,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const SignInScreen(),
      ),
      GoRoute(
        path: Routes.signUp,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const SignUpScreen(),
      ),
      GoRoute(
        path: Routes.forgotPassword,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const ForgotPasswordScreen(),
      ),

      // Edit profile subpage pushed on root navigator
      GoRoute(
        path: Routes.editProfile,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const EditProfileScreen(),
      ),

      // League details pushed on root navigator
      GoRoute(
        path: Routes.leagueDetails,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => LeagueDetailsScreen(
          leagueId: state.pathParameters['id'] ?? '',
        ),
      ),

      // Game details pushed on root navigator
      GoRoute(
        path: Routes.gameDetails,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => GameDetailsScreen(
          matchId: state.pathParameters['id'] ?? '',
          leagueId: state.uri.queryParameters['leagueId'],
        ),
      ),

      // Main Stateful Shell with 5 bottom navigation tabs
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          // 1. Dashboard
          StatefulShellBranch(
            navigatorKey: _dashboardNavigatorKey,
            routes: [
              GoRoute(
                path: Routes.dashboard,
                builder: (context, state) => const DashboardScreen(),
              ),
            ],
          ),

          // 2. League
          StatefulShellBranch(
            navigatorKey: _leaguesNavigatorKey,
            routes: [
              GoRoute(
                path: Routes.leagues,
                builder: (context, state) => const LeaguesScreen(),
              ),
            ],
          ),

          // 3. Games
          StatefulShellBranch(
            navigatorKey: _gamesNavigatorKey,
            routes: [
              GoRoute(
                path: Routes.games,
                builder: (context, state) => const GamesScreen(),
              ),
            ],
          ),

          // 4. Courts
          StatefulShellBranch(
            navigatorKey: _courtsNavigatorKey,
            routes: [
              GoRoute(
                path: Routes.courts,
                builder: (context, state) => const CourtsScreen(),
              ),
            ],
          ),

          // 5. Profile
          StatefulShellBranch(
            navigatorKey: _profileNavigatorKey,
            routes: [
              GoRoute(
                path: Routes.profile,
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
