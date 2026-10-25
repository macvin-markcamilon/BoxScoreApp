import {
  LeagueRecord,
  LeagueRulesConfig,
  RuleSetId,
  UserLeagueRole,
} from "@/types/boxscore";

/**
 * Comprehensive Researched Basketball Rulebook Specifications
 * Covers FIBA Official Basketball Rules, NBA Official Rules, NCAA Men's/Women's Collegiate Rules,
 * FIBA 3x3 Official Half-Court Rules, and Custom Community/Pro-Am Rules.
 */
export const BASKETBALL_RULEBOOK_PRESETS: Record<RuleSetId, LeagueRulesConfig> =
  {
    FIBA: {
      ruleSetId: "FIBA",
      ruleSetName: "FIBA Official Basketball Rules (International Standard)",
      governingBody: "Fédération Internationale de Basketball (FIBA)",
      periodsCount: 4,
      periodLengthMinutes: 10,
      overtimeLengthMinutes: 5,
      shotClockSeconds: 24,
      offensiveReboundResetSeconds: 14,
      personalFoulLimit: 5,
      teamFoulBonusThreshold: 5,
      threePointDistance: "6.75m (22 ft 1.75 in) arc • 6.60m corners",
      timeoutsPolicy:
        "2 in First Half (Q1–Q2), 3 in Second Half (max 2 in final 2:00 of Q4), 1 per OT (60s duration; called via scorer's table on dead ball).",
      defensiveThreeSeconds: false,
      openRimInterferenceAllowed: true,
      alternatingPossessionArrow: true,
      targetScore: null,
      summaryHighlights: [
        "4 × 10-minute quarters (40 mins total); 5-minute overtime periods.",
        "24-second shot clock; resets to 14 seconds after offensive rebound or frontcourt foul (<14s).",
        "Player disqualifies on 5th personal/technical foul.",
        "Team Penalty (Bonus): 2 free throws awarded starting on the 5th team foul in each quarter.",
        "Once the ball strikes the ring on a shot attempt, any offensive or defensive player may legally tap or swat the ball.",
        "No defensive 3-second violation (zone defense unrestricted); Alternating Possession Arrow governs held balls.",
      ],
    },

    NBA: {
      ruleSetId: "NBA",
      ruleSetName: "NBA Official Professional Rules",
      governingBody: "National Basketball Association (NBA)",
      periodsCount: 4,
      periodLengthMinutes: 12,
      overtimeLengthMinutes: 5,
      shotClockSeconds: 24,
      offensiveReboundResetSeconds: 14,
      personalFoulLimit: 6,
      teamFoulBonusThreshold: 5,
      threePointDistance: "7.24m (23 ft 9 in) arc • 6.70m (22 ft) corners",
      timeoutsPolicy:
        "7 timeouts per game (75s each); max 4 in Q4, max 2 inside final 3:00 of Q4; 2 per OT. Players or coach can call live-ball timeout.",
      defensiveThreeSeconds: true,
      openRimInterferenceAllowed: false,
      alternatingPossessionArrow: false,
      targetScore: null,
      summaryHighlights: [
        "4 × 12-minute quarters (48 mins total); 5-minute overtime periods.",
        "Player fouls out on 6th personal foul (or 2nd technical foul).",
        "Team Penalty (Bonus): 2 free throws on 5th team foul per quarter (or 2nd foul in the last 2:00 of a period).",
        "Defensive 3-Second Violation enforced: defender in the 16-ft lane >3s must actively guard an opponent within arm's length (Technical FT + possession).",
        "Strict Imaginary Cylinder Rule: neither team may touch the ball while it is within the imaginary cylinder above the rim.",
        "Held balls are resolved by a live Jump Ball at the nearest circle.",
      ],
    },

    NCAA: {
      ruleSetId: "NCAA",
      ruleSetName: "NCAA Collegiate Basketball Rules",
      governingBody: "National Collegiate Athletic Association (NCAA)",
      periodsCount: 2,
      periodLengthMinutes: 20,
      overtimeLengthMinutes: 5,
      shotClockSeconds: 30,
      offensiveReboundResetSeconds: 20,
      personalFoulLimit: 5,
      teamFoulBonusThreshold: 7,
      threePointDistance: "6.75m (22 ft 1.75 in) arc • 6.60m corners",
      timeoutsPolicy:
        "4 timeouts per game (three 30-second + one 60-second) in games with media timeouts; max 3 carry over to Second Half.",
      defensiveThreeSeconds: false,
      openRimInterferenceAllowed: false,
      alternatingPossessionArrow: true,
      targetScore: null,
      summaryHighlights: [
        "2 × 20-minute halves (40 mins total); 5-minute overtime periods.",
        "30-second shot clock; resets to 20 seconds on offensive rebounds or frontcourt dead-ball resets.",
        "Player disqualifies on 5th personal foul.",
        "Bonus Free Throws: 1-and-1 bonus on 7th team foul of the half; Double Bonus (2 FTs) on 10th team foul of the half.",
        "10-second backcourt count to cross half-court; Alternating Possession Arrow on held balls.",
      ],
    },

    FIBA_3X3: {
      ruleSetId: "FIBA_3X3",
      ruleSetName: "FIBA 3x3 Official Half-Court Rules",
      governingBody: "FIBA 3x3 Commission",
      periodsCount: 1,
      periodLengthMinutes: 10,
      overtimeLengthMinutes: 0,
      shotClockSeconds: 12,
      offensiveReboundResetSeconds: 12,
      personalFoulLimit: 6,
      teamFoulBonusThreshold: 7,
      threePointDistance: "6.75m arc (Worth 2 Points in 3x3; Inside arc = 1 PT)",
      timeoutsPolicy:
        "1 team timeout (30 seconds) per game; can be called by any player on a dead ball.",
      defensiveThreeSeconds: false,
      openRimInterferenceAllowed: true,
      alternatingPossessionArrow: false,
      targetScore: 21,
      summaryHighlights: [
        "Single 10-minute period OR first team to reach 21 points wins immediately in regulation.",
        "Overtime is untimed sudden-death: first team to score 2 points in OT wins.",
        "12-second fast-paced shot clock; continuous play off made baskets (defense must dribble or pass outside the arc).",
        "Scoring: 1 point inside the arc, 2 points behind the arc, 1 point per free throw.",
        "Team Fouls 7, 8, and 9 award 2 free throws; Team Fouls 10+ award 2 free throws PLUS ball possession.",
      ],
    },

    CUSTOM: {
      ruleSetId: "CUSTOM",
      ruleSetName: "Custom Pro-Am / Barangay League Rules",
      governingBody: "League Commissioner Custom Rulebook",
      periodsCount: 4,
      periodLengthMinutes: 10,
      overtimeLengthMinutes: 5,
      shotClockSeconds: 24,
      offensiveReboundResetSeconds: 14,
      personalFoulLimit: 5,
      teamFoulBonusThreshold: 5,
      threePointDistance: "6.75m Standard Arc",
      timeoutsPolicy:
        "2 in First Half, 3 in Second Half, 1 per Overtime (Commissioner customizable).",
      defensiveThreeSeconds: false,
      openRimInterferenceAllowed: true,
      alternatingPossessionArrow: true,
      targetScore: null,
      summaryHighlights: [
        "Fully customizable period count, minutes per period, shot clock, and foul thresholds.",
        "Ideal for community barangay tournaments, corporate leagues, and youth divisions.",
      ],
    },
  };

/**
 * Role-Based Access Control (RBAC) helpers for League Management and Table Officials.
 */
export function getUserLeagueRole(
  league: LeagueRecord | null | undefined,
  userProfileId: string | null | undefined,
  userEmail?: string | null,
  _accountRoles?: string[] | null,
  _displayName?: string | null
): UserLeagueRole {
  if (!league) return "VIEWER";
  
  // 1. If owner id matches profile id
  if (userProfileId && league.ownerId === userProfileId) return "OWNER";

  // 2. Check league members list strictly by user profile id or verified email
  // NOTE: Members must have status === 'ACCEPTED' (or undefined for backward compatibility)
  const members = league.members ?? [];
  const normalizedEmail = userEmail?.trim().toLowerCase();

  const member = members.find((m) => {
    // If explicitly marked as PENDING or DECLINED, member has not accepted role yet
    if (m.status === "PENDING" || m.status === "DECLINED") return false;
    if (userProfileId && m.userId && m.userId === userProfileId) return true;
    if (normalizedEmail && m.email && m.email.trim().toLowerCase() === normalizedEmail) return true;
    return false;
  });

  if (member) return member.role;

  // Local / single-user mode fallback only if league is specifically a local fixture without an owner
  if (league.ownerId === "system" || league.ownerId === "local" || !league.ownerId) {
    return "OWNER";
  }

  // Any other user is strictly a VIEWER (read-only)
  return "VIEWER";
}

export function canEditLeagueDetails(role: UserLeagueRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canManageLeagueRoles(role: UserLeagueRole): boolean {
  return role === "OWNER"; // Only league creator/owner can add admins and table officials
}

export function canOperateScorebook(role: UserLeagueRole): boolean {
  return (
    role === "OWNER" ||
    role === "ADMIN" ||
    role === "OFFICIAL_SCORER" ||
    role === "TABLE_OFFICIAL"
  );
}

export function canOperateGameClock(role: UserLeagueRole): boolean {
  return (
    role === "OWNER" ||
    role === "ADMIN" ||
    role === "GAME_TIMER" ||
    role === "TABLE_OFFICIAL"
  );
}

export function canOperateShotClock(role: UserLeagueRole): boolean {
  return (
    role === "OWNER" ||
    role === "ADMIN" ||
    role === "SHOT_CLOCK" ||
    role === "TABLE_OFFICIAL"
  );
}

export function canManageTeamsAndSchedule(role: UserLeagueRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
