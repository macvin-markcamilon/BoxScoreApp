import 'package:flutter_test/flutter_test.dart';
import 'package:boxscore_mobile/data/models/user_profile.dart';
import 'package:boxscore_mobile/data/models/game.dart';
import 'package:boxscore_mobile/core/utils/formatters.dart';

void main() {
  group('BOX SCORE Models & Formatters Unit Tests', () {
    test('UserProfile formats name and initials correctly', () {
      const profile = UserProfile(
        id: 'u-1',
        email: 'athlete@boxscore.ph',
        firstName: 'Kiefer',
        lastName: 'Ravena',
        positions: [PlayerPosition.pg, PlayerPosition.sg],
        accountRoles: [AccountRole.player],
      );

      expect(profile.fullName, 'Kiefer Ravena');
      expect(profile.initials, 'KR');
      expect(profile.positions.length, 2);
      expect(profile.accountRoles.first.value, 'Player');
    });

    test('LiveGameSession formats game clock correctly', () {
      final session = LiveGameSession(
        matchId: 'm-1',
        currentPeriod: 4,
        clockSecondsRemaining: 125,
        isClockRunning: false,
        homeScore: 88,
        awayScore: 86,
      );

      expect(session.clockDisplay, '2:05');
      expect(session.periodLabel, 'Q4');
    });

    test('LiveGameSession parses quarters, stats and play events', () {
      final session = LiveGameSession.fromJson('m-1', {
        'matchId': 'm-1',
        'currentPeriod': 1,
        'clockSecondsRemaining': 208,
        'isClockRunning': true,
        'homeScore': 37,
        'awayScore': 52,
        'homeQuarterScores': [37, 0, 0, 0],
        'awayQuarterScores': [52, 0, 0, 0],
        'homeRunningScore': {
          '3': {'period': 1, 'shotType': '3PT', 'pointNumber': 3, 'jerseyNumber': 11},
        },
        'awayRunningScore': {
          '3': {'period': 1, 'shotType': '3PT', 'pointNumber': 3, 'jerseyNumber': 15},
        },
        'awayPlayerStats': {
          'p-1': {
            'playerId': 'p-1',
            'points': 35,
            'jerseyNumber': 15,
            'firstName': 'Mark Ronnel',
            'lastName': 'Camilon',
            'ast': 5,
            'dreb': 3,
          },
        },
      });

      expect(session.homeQuarterScores.first, 37);
      expect(session.awayQuarterScores.first, 52);
      expect(session.plays.length, 2);
      expect(session.awayPlayerStats['p-1']?.points, 35);
      expect(session.awayPlayerStats['p-1']?.reb, 3);
      expect(session.awayPlayerStats['p-1']?.ast, 5);
      expect(session.awayPlayerStats['p-1']?.playerName, 'Mark Ronnel Camilon');
    });

    test('Fmt relative dates test', () {
      final now = DateTime.now();
      expect(Fmt.relative(now), startsWith('Today'));
    });
  });
}
