export type PlayerPosition = "PG" | "SG" | "SF" | "PF" | "C";

export type UserAccountRole = "Player" | "Coach" | "Referee" | "Manager";

export type RuleSetId = "FIBA" | "NBA" | "NCAA" | "FIBA_3X3" | "CUSTOM";

export type LeagueWorkspaceTab =
  | "league_dashboard"
  | "categories"
  | "teams"
  | "schedule"
  | "bracket"
  | "game_management"
  | "game_details";

export type RefereeRole =
  | "Crew Chief"
  | "Umpire 1"
  | "Umpire 2"
  | "Table Commissioner"
  | "Scorekeeper"
  | "Official Scorer"
  | "Game Timer"
  | "Shot Clock Operator";

export type LeagueMemberRole =
  | "ADMIN"
  | "OFFICIAL_SCORER"
  | "GAME_TIMER"
  | "SHOT_CLOCK"
  | "TABLE_OFFICIAL";

export interface LeagueMember {
  id: string;
  leagueId: string;
  userId?: string;
  email: string;
  displayName: string;
  role: LeagueMemberRole;
  status?: "PENDING" | "ACCEPTED" | "DECLINED";
  addedBy: string;
  createdAt: string;
}

export type AppNotificationType = "LEAGUE_ROLE_ASSIGNMENT";

export interface AppNotification {
  id: string;
  recipientEmail: string;
  recipientUserId?: string;
  senderUserId: string;
  senderName: string;
  type: AppNotificationType;
  title: string;
  message: string;
  leagueId: string;
  leagueName: string;
  assignedRole: LeagueMemberRole;
  memberId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  isRead: boolean;
  createdAt: string;
}

export type UserLeagueRole = "OWNER" | LeagueMemberRole | "VIEWER";

export interface LeagueCategory {
  id: string;
  leagueId: string;
  name: string; // e.g. "Men's Open", "Women's Division", "Junior (U18)", "Senior (40+)"
  code: string; // e.g. "MEN", "WOMEN", "JR", "SR"
  color?: string; // e.g. "#0B2F5C", "#8B0D0E", "#D97706", "#059669"
  ageGroup?: string;
  ruleSetId: RuleSetId;
  rulesConfig: LeagueRulesConfig;
  formatId: BracketingFormatId;
  poolsCount?: 1 | 2 | 4;
  advancingPerPool?: 2 | 4;
  seriesBestOf?: 3 | 5 | 7;
  stepladderVariant?: "PAGE_MCINTYRE_TOP4" | "STEPLADDER_CLIMB";
  createdAt: string;
}

export interface LeagueReferee {
  id: string;
  leagueId: string;
  name: string;
  role: RefereeRole;
  accreditation: string;
  jerseyNumber: number;
  imageUrl?: string;
}

export type ScorebookActionType =
  | "MADE_2PT"
  | "MISS_2PT"
  | "MADE_3PT"
  | "MISS_3PT"
  | "MADE_FT"
  | "MISS_FT"
  | "OFF_REB"
  | "DEF_REB"
  | "ASSIST"
  | "STEAL"
  | "BLOCK"
  | "TURNOVER"
  | "PERSONAL_FOUL"
  | "TECHNICAL_FOUL"
  | "UNSPORTSMANLIKE_FOUL"
  | "TIMEOUT"
  | "SUBSTITUTION"
  | "JUMP_BALL_ARROW"
  | "TEAM_REBOUND"
  | "POSSESSION_CHANGE";

export interface ScorebookPlayEvent {
  id: string;
  matchId: string;
  period: number;
  periodLabel: string;
  gameClockDisplay: string;
  teamSide: "HOME" | "AWAY";
  teamId: string;
  teamName: string;
  teamLogo?: string;
  categoryLabel?: string;
  playerId?: string;
  playerName?: string;
  playerJersey?: number;
  subOutPlayerId?: string;
  subOutPlayerName?: string;
  actionType: ScorebookActionType;
  pointsDelta: number;
  description: string;
  refereeId?: string;
  refereeName?: string;
  homeScoreAfter: number;
  awayScoreAfter: number;
  createdAt: string;
}

export interface PlayerGameStats {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  position: PlayerPosition;
  imageUrl?: string;
  isOnCourt: boolean;
  secondsPlayed?: number;
  minutesPlayed?: string;
  points: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  techFouls: number;
}

export interface RunningScoreEntry {
  pointNumber: number;
  period: number;
  jerseyNumber: number;
  shotType: "1PT" | "2PT" | "3PT";
}

export interface LiveGameSession {
  matchId: string;
  leagueId: string;
  currentPeriod: number;
  clockSecondsRemaining: number;
  shotClockSeconds: number;
  isClockRunning: boolean;
  clockLeaderId?: string;
  possessionArrow: "HOME" | "AWAY";
  activeBallPossession?: "HOME" | "AWAY";
  homeScore: number;
  awayScore: number;
  homeQuarterScores: number[];
  awayQuarterScores: number[];
  homeTeamFoulsByPeriod: number[];
  awayTeamFoulsByPeriod: number[];
  homeTimeoutsRemaining: number;
  awayTimeoutsRemaining: number;
  assignedRefereeIds: string[];
  homePlayerStats: Record<string, PlayerGameStats>;
  awayPlayerStats: Record<string, PlayerGameStats>;
  homeRunningScore: Record<number, RunningScoreEntry>;
  awayRunningScore: Record<number, RunningScoreEntry>;
  playEvents: ScorebookPlayEvent[];
  streamUrl?: string;
  isStreaming?: boolean;
  updatedAt: string;
}

export type BracketingFormatId =
  | "SINGLE_ELIMINATION"
  | "DOUBLE_ELIMINATION"
  | "ROUND_ROBIN"
  | "MULTI_STAGE"
  | "SERIES_PLAYOFF"
  | "PAGE_MCINTYRE";

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  birthday: string;
  address: string;
  heightCm: string;
  weightKg: string;
  positions: PlayerPosition[];
  accountRoles: UserAccountRole[];
  imageUrl?: string;
  bio?: string;
  jerseyNumber?: number;
  phone?: string;
  createdAt: string;
}

export interface LeagueCourt {
  id: string;
  name: string;
  address: string;
  surfaceType: "Hardwood" | "Acrylic Outdoor" | "Covered Gym" | "Sport Court";
}

export interface LeagueRulesConfig {
  ruleSetId: RuleSetId;
  ruleSetName: string;
  governingBody: string;
  periodsCount: number;
  periodLengthMinutes: number;
  overtimeLengthMinutes: number;
  shotClockSeconds: number;
  offensiveReboundResetSeconds: number;
  personalFoulLimit: number;
  teamFoulBonusThreshold: number;
  threePointDistance: string;
  timeoutsPolicy: string;
  defensiveThreeSeconds: boolean;
  openRimInterferenceAllowed: boolean;
  alternatingPossessionArrow: boolean;
  targetScore: number | null;
  summaryHighlights: string[];
}

export interface AssistantCoachMember {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface RosterPlayer {
  id: string;
  userId?: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  position: PlayerPosition;
  isCaptain: boolean;
  imageUrl?: string;
}

export interface LeagueTeam {
  id: string;
  leagueId: string;
  categoryId?: string | null;
  categoryName?: string;
  createdBy: string;
  name: string;
  initials?: string;
  imageUrl: string;
  primaryColor: string;
  secondaryColor: string;
  headCoach: string;
  headCoachImageUrl?: string;
  assistantCoaches: string[];
  assistantCoachStaff?: AssistantCoachMember[];
  manager: string;
  managerImageUrl?: string;
  captainPlayerId: string | null;
  roster: RosterPlayer[];
  createdAt: string;
}

export interface TournamentPool {
  id: string;
  name: string;
  teamIds: string[];
}

export type TournamentMatchStage =
  | "POOL"
  | "WINNERS"
  | "LOSERS"
  | "PLAYOFF"
  | "SERIES"
  | "STEPLADDER"
  | "FINALS";

export interface TournamentMatch {
  id: string;
  leagueId: string;
  categoryId?: string | null;
  categoryName?: string;
  categoryCode?: string;
  categoryColor?: string;
  gameNumber: number;
  stage: TournamentMatchStage;
  roundNumber: number;
  roundLabel: string;
  poolName?: string;
  seriesId?: string;
  seriesGameNumber?: number;
  seriesBestOf?: 3 | 5 | 7;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamPlaceholder: string;
  awayTeamPlaceholder: string;
  homeScore: number | null;
  awayScore: number | null;
  status: "SCHEDULED" | "LIVE" | "FINAL";
  winnerTeamId: string | null;
  loserTeamId: string | null;
  scheduledDate: string;
  scheduledTime: string;
  courtId: string;
  courtName: string;
  nextWinnerMatchId?: string | null;
  nextWinnerSlot?: "HOME" | "AWAY";
  nextLoserMatchId?: string | null;
  nextLoserSlot?: "HOME" | "AWAY";
  notes?: string;
  recapHeadline?: string;
  recapArticle?: string;
  recapTakeaways?: string[];
  recapUpdatedAt?: string;
  streamUrl?: string;
  isStreaming?: boolean;
}

export interface LeagueTournamentData {
  leagueId: string;
  formatId: BracketingFormatId;
  poolsCount: 1 | 2 | 4;
  advancingPerPool: 2 | 4;
  seriesBestOf: 3 | 5 | 7;
  stepladderVariant: "PAGE_MCINTYRE_TOP4" | "STEPLADDER_CLIMB";
  dailyTimeSlots: string[];
  pools: TournamentPool[];
  seedOrderTeamIds: string[];
  matches: TournamentMatch[];
  aiLastSummary?: string;
  updatedAt: string;
}

export interface PoolStandingRow {
  teamId: string;
  teamName: string;
  poolName: string;
  played: number;
  wins: number;
  losses: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  streak: string;
}

export interface LeagueRecord {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  imageUrl: string;
  startDate: string;
  endDate: string;
  courts: LeagueCourt[];
  ruleSetId: RuleSetId;
  rulesConfig: LeagueRulesConfig;
  members?: LeagueMember[];
  categories?: LeagueCategory[];
  createdAt: string;
}

export type AppSection = "dashboard" | "leagues" | "profile";
