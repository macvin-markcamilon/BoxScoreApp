abstract final class Routes {
  static const signIn = '/sign-in';
  static const signUp = '/sign-up';
  static const forgotPassword = '/forgot-password';

  static const dashboard = '/dashboard';
  static const leagues = '/leagues';
  static const leagueDetails = '/leagues/:id';
  static const games = '/games';
  static const gameDetails = '/games/:id';
  static const courts = '/courts';
  static const profile = '/profile';
  static const editProfile = '/profile/edit';

  static String leagueDetailsPath(String id) => '/leagues/$id';
  static String gameDetailsPath(String id, {String? leagueId}) =>
      leagueId != null ? '/games/$id?leagueId=$leagueId' : '/games/$id';

  static const authRoutes = {signIn, signUp, forgotPassword};
}
