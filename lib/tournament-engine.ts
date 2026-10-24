import {
  BracketingFormatId,
  LeagueCategory,
  LeagueCourt,
  LeagueRecord,
  LeagueTeam,
  LeagueTournamentData,
  PoolStandingRow,
  TournamentMatch,
  TournamentPool,
} from "@/types/boxscore";

export interface BracketingFormatMetadata {
  id: BracketingFormatId;
  title: string;
  subtitle: string;
  tagline: string;
  description: string;
  exampleLeagues: string;
  keyMechanics: string[];
  recommendedMinTeams: number;
}

export const BRACKETING_FORMATS: BracketingFormatMetadata[] = [
  {
    id: "SINGLE_ELIMINATION",
    title: "Single-Elimination (Knockout Bracket)",
    subtitle: "Win or Go Home",
    tagline: "Immediate sudden-death knockout tree",
    description:
      '"Win or go home." If a team loses one game, they are eliminated immediately. Winners advance through Quarterfinals, Semifinals, and the Championship Final.',
    exampleLeagues:
      'NCAA Tournament ("March Madness") and traditional knockout cups',
    keyMechanics: [
      "1 loss = immediate elimination",
      "Automatic BYE handling for top seeds if team count is not a power of 2",
      "Fastest tournament completion for limited court days",
    ],
    recommendedMinTeams: 4,
  },
  {
    id: "DOUBLE_ELIMINATION",
    title: "Double-Elimination Bracket",
    subtitle: "Two-Loss Knockout",
    tagline: "Winners' Bracket + Losers' Consolation Bracket",
    description:
      'Teams must lose twice before being fully knocked out. Teams that lose in the primary "Winners\' Bracket" drop into a "Losers\' Bracket" (or Consolation Bracket) for a second chance to reach the finals.',
    exampleLeagues:
      " Collegiate Invitational Cups, Regional Qualifiers, High-Stakes 3x3 & 5v5 Tournaments",
    keyMechanics: [
      "Every team is guaranteed at least 2 games",
      "Winners' Bracket losers drop into corresponding Losers' Bracket rounds",
      "Grand Finals pits Winners' Bracket Champion vs Losers' Bracket Champion",
    ],
    recommendedMinTeams: 4,
  },
  {
    id: "ROUND_ROBIN",
    title: "Round-Robin (Pool Play / Group Stage)",
    subtitle: "Bracket A / Bracket B Standings",
    tagline: "Every team plays every opponent in its group",
    description:
      "Teams are grouped into brackets or pools (e.g., Bracket A, Bracket B), and every team plays against each other within their group. Advancement is based on win-loss standings and point differentials rather than immediate elimination.",
    exampleLeagues:
      "Regular Season Division Play, Inter-Departmental & Intramural Group Leagues",
    keyMechanics: [
      "Circle-method balanced round-robin matchups within each pool",
      "Live W-L, Win %, Points For/Against, and Point Differential (+/-) standings",
      "Optional Championship Final between Pool A #1 and Pool B #1",
    ],
    recommendedMinTeams: 3,
  },
  {
    id: "MULTI_STAGE",
    title: "Multi-Stage (Hybrid / Pool-to-Knockout)",
    subtitle: "Pool Play → Quarterfinals → Semifinals → Finals",
    tagline: "Most widely used basketball league tournament structure",
    description:
      "The most widely used league tournament structure. Teams play a round-robin group stage (or regular season), and the top teams advance into a playoff knockout tree (Quarterfinals → Semifinals → Finals).",
    exampleLeagues:
      "FIBA World Cup, Olympic Basketball, and local community/barangay inter-color leagues",
    keyMechanics: [
      "Stage 1: Round-Robin Group Stage (Bracket A & Bracket B)",
      "Stage 2: Top qualifiers cross-seed (e.g. A1 vs B2, B1 vs A2 or Top-8 QF) into Knockout Playoffs",
      "1-Click auto-seeding of Playoff Bracket from live Pool Standings",
    ],
    recommendedMinTeams: 4,
  },
  {
    id: "SERIES_PLAYOFF",
    title: "Series Playoff Bracket",
    subtitle: "Best-of-3 / Best-of-5 / Best-of-7",
    tagline: "Multi-game playoff series matchups",
    description:
      "Instead of single games, matchups are played as multi-game series (e.g., Best-of-3, Best-of-5, or Best-of-7). First team to reach the majority win threshold advances.",
    exampleLeagues: "NBA Playoffs, PBA Playoffs, Pro Championship Series",
    keyMechanics: [
      "Configurable Best-of-3 (first to 2), Best-of-5 (first to 3), or Best-of-7 (first to 4)",
      "Tracks live Series Tally (e.g. Series Tied 1-1, Leads 2-1) across individual games",
      "Automatically clinches series and advances winner to Finals when win threshold is met",
    ],
    recommendedMinTeams: 2,
  },
  {
    id: "PAGE_MCINTYRE",
    title: "Page-McIntyre / Stepladder Bracket",
    subtitle: "Seeded Advantage & Sudden-Death Climb",
    tagline: "Top seeds earn byes / double-life while lower seeds battle upward",
    description:
      "Seeded tournament trees where higher-ranked teams receive byes and wait for lower-ranked teams to battle upward in sudden-death matches.",
    exampleLeagues:
      "FIBA Oceania / NBL Finals (Page-McIntyre Top-4), UAAP / KBL Stepladder Playoffs",
    keyMechanics: [
      "Page-McIntyre Top-4: #1 vs #2 (Qualifier — winner to Finals, loser to Prelim) & #3 vs #4 (Elimination)",
      "Stepladder Climb: Lower seeds play sudden-death rounds climbing rung-by-rung toward #2 and #1",
      "Rewards regular-season / top seed rankings with structural bracket protection",
    ],
    recommendedMinTeams: 4,
  },
];

export const DEFAULT_DAILY_TIME_SLOTS = [
  "09:00 AM",
  "11:00 AM",
  "01:30 PM",
  "03:30 PM",
  "05:30 PM",
];

/**
 * Generates an array of ISO date strings (YYYY-MM-DD) between startDate and endDate.
 */
function buildDateRange(startDate: string, endDate: string, totalDaysNeeded = 10): string[] {
  const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
  const end = endDate ? new Date(`${endDate}T00:00:00`) : new Date(start.getTime() + 7 * 86400000);

  const validStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const validEnd =
    Number.isNaN(end.getTime()) || end < validStart
      ? new Date(validStart.getTime() + 7 * 86400000)
      : end;

  const dates: string[] = [];
  const cursor = new Date(validStart);
  while (cursor <= validEnd && dates.length < 60) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  while (dates.length < totalDaysNeeded) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

/**
 * Assigns a date, time slot, and court to each game index sequentially.
 */
function createSlotAssigner(
  league: LeagueRecord,
  timeSlots: string[]
): (gameIndex: number) => {
  scheduledDate: string;
  scheduledTime: string;
  courtId: string;
  courtName: string;
} {
  const slots = timeSlots.length > 0 ? timeSlots : DEFAULT_DAILY_TIME_SLOTS;
  const courts: LeagueCourt[] =
    league.courts && league.courts.length > 0
      ? league.courts
      : [
          {
            id: "default-court-1",
            name: "Main Tournament Arena",
            address: "Championship Court",
            surfaceType: "Hardwood",
          },
        ];

  const dates = buildDateRange(league.startDate, league.endDate, 30);
  const gamesPerDay = slots.length * courts.length;

  return (gameIndex: number) => {
    const dayIdx = Math.floor(gameIndex / Math.max(1, gamesPerDay));
    const withinDay = gameIndex % Math.max(1, gamesPerDay);
    const slotIdx = Math.floor(withinDay / courts.length) % slots.length;
    const courtIdx = withinDay % courts.length;
    const court = courts[courtIdx];

    return {
      scheduledDate: dates[dayIdx % dates.length],
      scheduledTime: slots[slotIdx],
      courtId: court.id,
      courtName: `${court.name} (${court.surfaceType})`,
    };
  };
}

/**
 * Standard Circle-Method Round-Robin generator for a list of teamIds.
 */
function generateRoundRobinPairings(
  teamIds: string[]
): Array<{ round: number; homeId: string; awayId: string }> {
  if (teamIds.length < 2) return [];
  const list: (string | null)[] = [...teamIds];
  if (list.length % 2 !== 0) {
    list.push(null); // BYE dummy
  }

  const n = list.length;
  const rounds = n - 1;
  const half = n / 2;
  const pairings: Array<{ round: number; homeId: string; awayId: string }> = [];

  const rotating = [...list];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const t1 = rotating[i];
      const t2 = rotating[n - 1 - i];
      if (t1 && t2) {
        pairings.push({
          round: r + 1,
          homeId: r % 2 === 0 ? t1 : t2,
          awayId: r % 2 === 0 ? t2 : t1,
        });
      }
    }
    // Rotate all except index 0
    const last = rotating.pop() ?? null;
    rotating.splice(1, 0, last);
  }

  return pairings;
}

/**
 * Splits teams into balanced pools (Bracket A, Bracket B, etc.) using serpentine seeding.
 */
export function buildPoolsFromTeams(
  teamIds: string[],
  poolsCount: 1 | 2 | 4
): TournamentPool[] {
  const actualCount =
    teamIds.length < 4 ? 1 : poolsCount === 4 && teamIds.length < 8 ? 2 : poolsCount;

  const poolLetters = ["A", "B", "C", "D"];
  const pools: TournamentPool[] = Array.from({ length: actualCount }, (_, i) => ({
    id: `pool-${poolLetters[i].toLowerCase()}`,
    name: actualCount === 1 ? "Single League Pool" : `Bracket ${poolLetters[i]}`,
    teamIds: [],
  }));

  teamIds.forEach((id, idx) => {
    const row = Math.floor(idx / actualCount);
    const col = idx % actualCount;
    const targetPoolIdx = row % 2 === 0 ? col : actualCount - 1 - col;
    pools[targetPoolIdx].teamIds.push(id);
  });

  return pools;
}

/**
 * Generates standard NCAA-style bracket seedings for size = 2, 4, 8, 16
 * e.g. for 8: [[1,8], [4,5], [2,7], [3,6]]
 */
function getSeededPairs(bracketSize: number): Array<[number, number]> {
  if (bracketSize <= 2) return [[1, 2]];
  if (bracketSize === 4) {
    return [
      [1, 4],
      [2, 3],
    ];
  }
  if (bracketSize === 8) {
    return [
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ];
  }
  return [
    [1, 16],
    [8, 9],
    [4, 13],
    [5, 12],
    [2, 15],
    [7, 10],
    [3, 14],
    [6, 11],
  ];
}

/**
 * Builds a Single-Elimination Knockout Tree for a given list of seeded teams/placeholders.
 */
function buildSingleEliminationMatches(options: {
  league: LeagueRecord;
  seededEntries: Array<{ teamId: string | null; placeholder: string }>;
  assignSlot: (idx: number) => {
    scheduledDate: string;
    scheduledTime: string;
    courtId: string;
    courtName: string;
  };
  startingGameNumber: number;
  stageOverride?: "WINNERS" | "PLAYOFF";
}): TournamentMatch[] {
  const {
    league,
    seededEntries,
    assignSlot,
    startingGameNumber,
    stageOverride = "PLAYOFF",
  } = options;

  const count = Math.max(2, seededEntries.length);
  const bracketSize =
    count <= 2 ? 2 : count <= 4 ? 4 : count <= 8 ? 8 : 16;
  const totalRounds = Math.log2(bracketSize);
  const pairs = getSeededPairs(bracketSize);

  const roundMatches: TournamentMatch[][] = [];
  let gameCounter = startingGameNumber;

  const getRoundName = (roundIdx: number, numRounds: number): string => {
    const remaining = numRounds - roundIdx;
    if (remaining === 1) return "Championship Finals";
    if (remaining === 2) return "Semifinals";
    if (remaining === 3) return "Quarterfinals";
    return "Round of 16";
  };

  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r + 1);
    const rName = getRoundName(r, totalRounds);
    const currentRound: TournamentMatch[] = [];

    for (let m = 0; m < matchesInRound; m++) {
      const slot = assignSlot(gameCounter - 1);
      const isFinalRound = r === totalRounds - 1;
      currentRound.push({
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameCounter++,
        stage: isFinalRound ? "FINALS" : stageOverride,
        roundNumber: r + 1,
        roundLabel:
          matchesInRound > 1 ? `${rName} • M${m + 1}` : rName,
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: "TBD",
        awayTeamPlaceholder: "TBD",
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...slot,
      });
    }
    roundMatches.push(currentRound);
  }

  // Link rounds: Round r feeds Round r+1
  for (let r = 0; r < totalRounds - 1; r++) {
    const currentRound = roundMatches[r];
    const nextRound = roundMatches[r + 1];
    currentRound.forEach((match, mIdx) => {
      const targetMatch = nextRound[Math.floor(mIdx / 2)];
      const targetSlot: "HOME" | "AWAY" = mIdx % 2 === 0 ? "HOME" : "AWAY";
      match.nextWinnerMatchId = targetMatch.id;
      match.nextWinnerSlot = targetSlot;
      if (targetSlot === "HOME") {
        targetMatch.homeTeamPlaceholder = `Winner G${match.gameNumber}`;
      } else {
        targetMatch.awayTeamPlaceholder = `Winner G${match.gameNumber}`;
      }
    });
  }

  // Populate Round 1 with seeded entries and auto-advance BYEs
  const firstRound = roundMatches[0];
  pairs.forEach(([seedA, seedB], idx) => {
    const match = firstRound[idx];
    if (!match) return;
    const entryA = seededEntries[seedA - 1] ?? {
      teamId: null,
      placeholder: `BYE (#${seedA})`,
    };
    const entryB = seededEntries[seedB - 1] ?? {
      teamId: null,
      placeholder: `BYE (#${seedB})`,
    };

    match.homeTeamId = entryA.teamId;
    match.homeTeamPlaceholder = entryA.placeholder;
    match.awayTeamId = entryB.teamId;
    match.awayTeamPlaceholder = entryB.placeholder;

    // If one side is a real team and the other is a BYE (because seedB > seededEntries.length)
    if (entryA.teamId && !entryB.teamId && seedB > seededEntries.length) {
      match.status = "FINAL";
      match.winnerTeamId = entryA.teamId;
      match.notes = "Automatic BYE Advancement";
      if (match.nextWinnerMatchId && roundMatches[1]) {
        const nextMatch = roundMatches[1].find(
          (nm) => nm.id === match.nextWinnerMatchId
        );
        if (nextMatch) {
          if (match.nextWinnerSlot === "HOME") {
            nextMatch.homeTeamId = entryA.teamId;
          } else {
            nextMatch.awayTeamId = entryA.teamId;
          }
        }
      }
    }
  });

  return roundMatches.flat();
}

/**
 * Master Tournament Schedule & Bracket Generator for all 6 Common Bracketing Types.
 */
export function generateLeagueTournamentData(options: {
  league: LeagueRecord;
  teams: LeagueTeam[];
  formatId: BracketingFormatId;
  poolsCount?: 1 | 2 | 4;
  advancingPerPool?: 2 | 4;
  seriesBestOf?: 3 | 5 | 7;
  stepladderVariant?: "PAGE_MCINTYRE_TOP4" | "STEPLADDER_CLIMB";
  dailyTimeSlots?: string[];
  seedOrderTeamIds?: string[];
}): LeagueTournamentData {
  const {
    league,
    teams,
    formatId,
    poolsCount = 2,
    advancingPerPool = 2,
    seriesBestOf = 3,
    stepladderVariant = "PAGE_MCINTYRE_TOP4",
    dailyTimeSlots = DEFAULT_DAILY_TIME_SLOTS,
  } = options;

  const orderedIds =
    options.seedOrderTeamIds && options.seedOrderTeamIds.length === teams.length
      ? options.seedOrderTeamIds
      : teams.map((t) => t.id);

  const assignSlot = createSlotAssigner(league, dailyTimeSlots);
  let pools: TournamentPool[] = [];
  let matches: TournamentMatch[] = [];

  // ---------------------------------------------------------------------------
  // 1. SINGLE-ELIMINATION (KNOCKOUT BRACKET)
  // ---------------------------------------------------------------------------
  if (formatId === "SINGLE_ELIMINATION") {
    const seededEntries = orderedIds.map((id, i) => ({
      teamId: id,
      placeholder: `Seed #${i + 1}`,
    }));
    matches = buildSingleEliminationMatches({
      league,
      seededEntries,
      assignSlot,
      startingGameNumber: 1,
      stageOverride: "PLAYOFF",
    });
  }

  // ---------------------------------------------------------------------------
  // 2. DOUBLE-ELIMINATION BRACKET (WINNERS' + LOSERS' + GRAND FINALS)
  // ---------------------------------------------------------------------------
  else if (formatId === "DOUBLE_ELIMINATION") {
    const topIds = orderedIds.slice(0, 8);
    const bracketSize = topIds.length <= 4 ? 4 : 8;
    const pairs = getSeededPairs(bracketSize);
    let gameNum = 1;

    if (bracketSize === 4) {
      // 4-Team Double Elimination (6-7 games)
      const wSemi1: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "WINNERS",
        roundNumber: 1,
        roundLabel: "Winners Semifinal 1",
        homeTeamId: topIds[0] ?? null,
        awayTeamId: topIds[3] ?? null,
        homeTeamPlaceholder: "Seed #1",
        awayTeamPlaceholder: "Seed #4",
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(0),
      };
      const wSemi2: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "WINNERS",
        roundNumber: 1,
        roundLabel: "Winners Semifinal 2",
        homeTeamId: topIds[1] ?? null,
        awayTeamId: topIds[2] ?? null,
        homeTeamPlaceholder: "Seed #2",
        awayTeamPlaceholder: "Seed #3",
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(1),
      };
      const lRound1: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "LOSERS",
        roundNumber: 1,
        roundLabel: "Losers Bracket Round 1 (Elimination)",
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Loser G${wSemi1.gameNumber}`,
        awayTeamPlaceholder: `Loser G${wSemi2.gameNumber}`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(2),
      };
      const wFinal: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "WINNERS",
        roundNumber: 2,
        roundLabel: "Winners Bracket Final",
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Winner G${wSemi1.gameNumber}`,
        awayTeamPlaceholder: `Winner G${wSemi2.gameNumber}`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(3),
      };
      const lFinal: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "LOSERS",
        roundNumber: 2,
        roundLabel: "Losers Bracket Final",
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Loser G${wFinal.gameNumber}`,
        awayTeamPlaceholder: `Winner G${lRound1.gameNumber}`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(4),
      };
      const grandFinal: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "FINALS",
        roundNumber: 3,
        roundLabel: "Grand Championship Final",
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Winners Champ (G${wFinal.gameNumber})`,
        awayTeamPlaceholder: `Losers Champ (G${lFinal.gameNumber})`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(5),
      };

      wSemi1.nextWinnerMatchId = wFinal.id;
      wSemi1.nextWinnerSlot = "HOME";
      wSemi1.nextLoserMatchId = lRound1.id;
      wSemi1.nextLoserSlot = "HOME";

      wSemi2.nextWinnerMatchId = wFinal.id;
      wSemi2.nextWinnerSlot = "AWAY";
      wSemi2.nextLoserMatchId = lRound1.id;
      wSemi2.nextLoserSlot = "AWAY";

      lRound1.nextWinnerMatchId = lFinal.id;
      lRound1.nextWinnerSlot = "AWAY";

      wFinal.nextWinnerMatchId = grandFinal.id;
      wFinal.nextWinnerSlot = "HOME";
      wFinal.nextLoserMatchId = lFinal.id;
      wFinal.nextLoserSlot = "HOME";

      lFinal.nextWinnerMatchId = grandFinal.id;
      lFinal.nextWinnerSlot = "AWAY";

      matches = [wSemi1, wSemi2, lRound1, wFinal, lFinal, grandFinal];
    } else {
      // 8-Team Double Elimination Bracket
      const wQF: TournamentMatch[] = pairs.map(([sA, sB], idx) => ({
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "WINNERS",
        roundNumber: 1,
        roundLabel: `Winners QF ${idx + 1}`,
        homeTeamId: topIds[sA - 1] ?? null,
        awayTeamId: topIds[sB - 1] ?? null,
        homeTeamPlaceholder: `Seed #${sA}`,
        awayTeamPlaceholder: `Seed #${sB}`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      }));

      const lR1: TournamentMatch[] = [0, 1].map((idx) => ({
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "LOSERS",
        roundNumber: 1,
        roundLabel: `Losers Round 1 • M${idx + 1}`,
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Loser G${wQF[idx * 2].gameNumber}`,
        awayTeamPlaceholder: `Loser G${wQF[idx * 2 + 1].gameNumber}`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      }));

      const wSF: TournamentMatch[] = [0, 1].map((idx) => ({
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "WINNERS",
        roundNumber: 2,
        roundLabel: `Winners Semifinal ${idx + 1}`,
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Winner G${wQF[idx * 2].gameNumber}`,
        awayTeamPlaceholder: `Winner G${wQF[idx * 2 + 1].gameNumber}`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      }));

      const lR2: TournamentMatch[] = [0, 1].map((idx) => ({
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "LOSERS",
        roundNumber: 2,
        roundLabel: `Losers Quarterfinal ${idx + 1}`,
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Loser G${wSF[idx].gameNumber}`,
        awayTeamPlaceholder: `Winner G${lR1[idx].gameNumber}`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      }));

      const wFinal: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "WINNERS",
        roundNumber: 3,
        roundLabel: "Winners Bracket Final",
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Winner G${wSF[0].gameNumber}`,
        awayTeamPlaceholder: `Winner G${wSF[1].gameNumber}`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      };

      const lSF: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "LOSERS",
        roundNumber: 3,
        roundLabel: "Losers Semifinal",
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Winner G${lR2[0].gameNumber}`,
        awayTeamPlaceholder: `Winner G${lR2[1].gameNumber}`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      };

      const lFinal: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "LOSERS",
        roundNumber: 4,
        roundLabel: "Losers Bracket Final",
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Loser G${wFinal.gameNumber}`,
        awayTeamPlaceholder: `Winner G${lSF.gameNumber}`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      };

      const grandFinal: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "FINALS",
        roundNumber: 5,
        roundLabel: "Grand Championship Final",
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Winners Champ (G${wFinal.gameNumber})`,
        awayTeamPlaceholder: `Losers Champ (G${lFinal.gameNumber})`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      };

      // Wire progression links
      wQF.forEach((m, i) => {
        const sf = wSF[Math.floor(i / 2)];
        const lr = lR1[Math.floor(i / 2)];
        const slot: "HOME" | "AWAY" = i % 2 === 0 ? "HOME" : "AWAY";
        m.nextWinnerMatchId = sf.id;
        m.nextWinnerSlot = slot;
        m.nextLoserMatchId = lr.id;
        m.nextLoserSlot = slot;

        // Auto-advance if away is null (BYE)
        if (m.homeTeamId && !m.awayTeamId) {
          m.status = "FINAL";
          m.winnerTeamId = m.homeTeamId;
          if (slot === "HOME") sf.homeTeamId = m.homeTeamId;
          else sf.awayTeamId = m.homeTeamId;
        }
      });

      lR1.forEach((m, i) => {
        m.nextWinnerMatchId = lR2[i].id;
        m.nextWinnerSlot = "AWAY";
      });

      wSF.forEach((m, i) => {
        m.nextWinnerMatchId = wFinal.id;
        m.nextWinnerSlot = i === 0 ? "HOME" : "AWAY";
        m.nextLoserMatchId = lR2[i].id;
        m.nextLoserSlot = "HOME";
      });

      lR2.forEach((m, i) => {
        m.nextWinnerMatchId = lSF.id;
        m.nextWinnerSlot = i === 0 ? "HOME" : "AWAY";
      });

      wFinal.nextWinnerMatchId = grandFinal.id;
      wFinal.nextWinnerSlot = "HOME";
      wFinal.nextLoserMatchId = lFinal.id;
      wFinal.nextLoserSlot = "HOME";

      lSF.nextWinnerMatchId = lFinal.id;
      lSF.nextWinnerSlot = "AWAY";

      lFinal.nextWinnerMatchId = grandFinal.id;
      lFinal.nextWinnerSlot = "AWAY";

      matches = [...wQF, ...lR1, ...wSF, ...lR2, wFinal, lSF, lFinal, grandFinal];
    }
  }

  // ---------------------------------------------------------------------------
  // 3. ROUND-ROBIN (POOL PLAY / GROUP STAGE)
  // ---------------------------------------------------------------------------
  else if (formatId === "ROUND_ROBIN") {
    pools = buildPoolsFromTeams(orderedIds, poolsCount);
    let gameNum = 1;

    // Build pairings per pool
    const poolPairingsList = pools.map((pool) => ({
      pool,
      pairings: generateRoundRobinPairings(pool.teamIds),
    }));

    // Find the maximum number of rounds among pools
    const maxRounds = Math.max(
      1,
      ...poolPairingsList.map((p) =>
        p.pairings.reduce((max, pr) => Math.max(max, pr.round), 1)
      )
    );

    // Interleave matches across rounds and pools so brackets alternate
    for (let r = 1; r <= maxRounds; r++) {
      for (const { pool, pairings } of poolPairingsList) {
        const roundMatches = pairings.filter((pr) => pr.round === r);
        for (const pair of roundMatches) {
          matches.push({
            id: crypto.randomUUID(),
            leagueId: league.id,
            gameNumber: gameNum++,
            stage: "POOL",
            roundNumber: pair.round,
            roundLabel: `${pool.name} • Round ${pair.round}`,
            poolName: pool.name,
            homeTeamId: pair.homeId,
            awayTeamId: pair.awayId,
            homeTeamPlaceholder: `${pool.name} Team`,
            awayTeamPlaceholder: `${pool.name} Team`,
            homeScore: null,
            awayScore: null,
            status: "SCHEDULED",
            winnerTeamId: null,
            loserTeamId: null,
            ...assignSlot(gameNum - 2),
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. MULTI-STAGE (HYBRID / POOL-TO-KNOCKOUT: GROUP STAGE -> QF -> SF -> FINALS)
  // ---------------------------------------------------------------------------
  else if (formatId === "MULTI_STAGE") {
    const effectivePoolsCount: 1 | 2 | 4 = orderedIds.length >= 6 ? 2 : 1;
    pools = buildPoolsFromTeams(orderedIds, effectivePoolsCount);
    let gameNum = 1;

    // Stage 1: Round-Robin Group Stage (Alternating across Pools & Rounds)
    const poolPairingsList = pools.map((pool) => ({
      pool,
      pairings: generateRoundRobinPairings(pool.teamIds),
    }));

    const maxRounds = Math.max(
      1,
      ...poolPairingsList.map((p) =>
        p.pairings.reduce((max, pr) => Math.max(max, pr.round), 1)
      )
    );

    for (let r = 1; r <= maxRounds; r++) {
      for (const { pool, pairings } of poolPairingsList) {
        const roundMatches = pairings.filter((pr) => pr.round === r);
        for (const pair of roundMatches) {
          matches.push({
            id: crypto.randomUUID(),
            leagueId: league.id,
            gameNumber: gameNum++,
            stage: "POOL",
            roundNumber: pair.round,
            roundLabel: `${pool.name} • Group R${pair.round}`,
            poolName: pool.name,
            homeTeamId: pair.homeId,
            awayTeamId: pair.awayId,
            homeTeamPlaceholder: `${pool.name} Team`,
            awayTeamPlaceholder: `${pool.name} Team`,
            homeScore: null,
            awayScore: null,
            status: "SCHEDULED",
            winnerTeamId: null,
            loserTeamId: null,
            ...assignSlot(gameNum - 2),
          });
        }
      }
    }

    // Stage 2: Knockout Playoff Tree (Quarterfinals -> Semifinals -> Finals)
    const totalAdvancing =
      orderedIds.length >= 8 && advancingPerPool === 4 ? 8 : 4;

    const knockoutPlaceholders =
      totalAdvancing === 8
        ? [
            { teamId: null, placeholder: "Bracket A #1" },
            { teamId: null, placeholder: "Bracket B #1" },
            { teamId: null, placeholder: "Bracket A #2" },
            { teamId: null, placeholder: "Bracket B #2" },
            { teamId: null, placeholder: "Bracket A #3" },
            { teamId: null, placeholder: "Bracket B #3" },
            { teamId: null, placeholder: "Bracket A #4" },
            { teamId: null, placeholder: "Bracket B #4" },
          ]
        : pools.length >= 2
          ? [
              { teamId: null, placeholder: "Bracket A #1" },
              { teamId: null, placeholder: "Bracket B #1" },
              { teamId: null, placeholder: "Bracket A #2" },
              { teamId: null, placeholder: "Bracket B #2" },
            ]
          : [
              { teamId: null, placeholder: "Pool Seed #1" },
              { teamId: null, placeholder: "Pool Seed #2" },
              { teamId: null, placeholder: "Pool Seed #3" },
              { teamId: null, placeholder: "Pool Seed #4" },
            ];

    const knockoutMatches = buildSingleEliminationMatches({
      league,
      seededEntries: knockoutPlaceholders,
      assignSlot,
      startingGameNumber: gameNum,
      stageOverride: "PLAYOFF",
    });

    matches = [...matches, ...knockoutMatches];
  }

  // ---------------------------------------------------------------------------
  // 5. SERIES PLAYOFF BRACKET (BEST-OF-3, BEST-OF-5, OR BEST-OF-7)
  // ---------------------------------------------------------------------------
  else if (formatId === "SERIES_PLAYOFF") {
    const top4 = orderedIds.slice(0, 4);
    let gameNum = 1;

    const sf1SeriesId = "series-sf-1";
    const sf2SeriesId = "series-sf-2";
    const finalsSeriesId = "series-finals";

    // Semifinal Series A (#1 vs #4) & Semifinal Series B (#2 vs #3)
    for (let g = 1; g <= seriesBestOf; g++) {
      const isIfNecessary = g > Math.ceil(seriesBestOf / 2);
      matches.push({
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "SERIES",
        roundNumber: 1,
        roundLabel: `Semifinal Series A (#1 vs #4) • Game ${g}${isIfNecessary ? " *" : ""}`,
        seriesId: sf1SeriesId,
        seriesGameNumber: g,
        seriesBestOf,
        homeTeamId: g % 2 === 1 ? (top4[0] ?? null) : (top4[3] ?? null),
        awayTeamId: g % 2 === 1 ? (top4[3] ?? null) : (top4[0] ?? null),
        homeTeamPlaceholder: g % 2 === 1 ? "Seed #1" : "Seed #4",
        awayTeamPlaceholder: g % 2 === 1 ? "Seed #4" : "Seed #1",
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      });

      matches.push({
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "SERIES",
        roundNumber: 1,
        roundLabel: `Semifinal Series B (#2 vs #3) • Game ${g}${isIfNecessary ? " *" : ""}`,
        seriesId: sf2SeriesId,
        seriesGameNumber: g,
        seriesBestOf,
        homeTeamId: g % 2 === 1 ? (top4[1] ?? null) : (top4[2] ?? null),
        awayTeamId: g % 2 === 1 ? (top4[2] ?? null) : (top4[1] ?? null),
        homeTeamPlaceholder: g % 2 === 1 ? "Seed #2" : "Seed #3",
        awayTeamPlaceholder: g % 2 === 1 ? "Seed #3" : "Seed #2",
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      });
    }

    // Championship Finals Series (Best-of-N)
    for (let g = 1; g <= seriesBestOf; g++) {
      const isIfNecessary = g > Math.ceil(seriesBestOf / 2);
      matches.push({
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "FINALS",
        roundNumber: 2,
        roundLabel: `Championship Finals Series (Best-of-${seriesBestOf}) • Game ${g}${isIfNecessary ? " *" : ""}`,
        seriesId: finalsSeriesId,
        seriesGameNumber: g,
        seriesBestOf,
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: "Winner SF Series A",
        awayTeamPlaceholder: "Winner SF Series B",
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(gameNum - 2),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 6. PAGE-MCINTYRE / STEPLADDER BRACKET
  // ---------------------------------------------------------------------------
  else if (formatId === "PAGE_MCINTYRE") {
    let gameNum = 1;

    if (stepladderVariant === "PAGE_MCINTYRE_TOP4" || orderedIds.length <= 4) {
      // Official Page-McIntyre Top-4 System:
      // M1: #1 vs #2 (Major Semifinal / Qualifier -> Winner to Grand Final, Loser to Prelim Final)
      // M2: #3 vs #4 (Minor Semifinal / Sudden Death -> Winner to Prelim Final, Loser Eliminated)
      // M3: Loser of M1 vs Winner of M2 (Preliminary Final -> Winner to Grand Final)
      // M4: Winner of M1 vs Winner of M3 (Grand Championship Final)
      const m1Qualifier: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "STEPLADDER",
        roundNumber: 1,
        roundLabel: "Page-McIntyre 1v2 Major Semifinal (Double-Life Qualifier)",
        homeTeamId: orderedIds[0] ?? null,
        awayTeamId: orderedIds[1] ?? null,
        homeTeamPlaceholder: "Seed #1",
        awayTeamPlaceholder: "Seed #2",
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(0),
      };

      const m2Elimination: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "STEPLADDER",
        roundNumber: 1,
        roundLabel: "Page-McIntyre 3v4 Minor Semifinal (Sudden-Death Knockout)",
        homeTeamId: orderedIds[2] ?? null,
        awayTeamId: orderedIds[3] ?? null,
        homeTeamPlaceholder: "Seed #3",
        awayTeamPlaceholder: "Seed #4",
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(1),
      };

      const m3PrelimFinal: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "STEPLADDER",
        roundNumber: 2,
        roundLabel: "Preliminary Final (2nd Chance Semifinal)",
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Loser 1v2 (G${m1Qualifier.gameNumber})`,
        awayTeamPlaceholder: `Winner 3v4 (G${m2Elimination.gameNumber})`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(2),
      };

      const m4GrandFinal: TournamentMatch = {
        id: crypto.randomUUID(),
        leagueId: league.id,
        gameNumber: gameNum++,
        stage: "FINALS",
        roundNumber: 3,
        roundLabel: "Page-McIntyre Grand Championship Final",
        homeTeamId: null,
        awayTeamId: null,
        homeTeamPlaceholder: `Winner 1v2 (G${m1Qualifier.gameNumber} • Bye to Final)`,
        awayTeamPlaceholder: `Winner Prelim Final (G${m3PrelimFinal.gameNumber})`,
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
        winnerTeamId: null,
        loserTeamId: null,
        ...assignSlot(3),
      };

      m1Qualifier.nextWinnerMatchId = m4GrandFinal.id;
      m1Qualifier.nextWinnerSlot = "HOME";
      m1Qualifier.nextLoserMatchId = m3PrelimFinal.id;
      m1Qualifier.nextLoserSlot = "HOME";

      m2Elimination.nextWinnerMatchId = m3PrelimFinal.id;
      m2Elimination.nextWinnerSlot = "AWAY";

      m3PrelimFinal.nextWinnerMatchId = m4GrandFinal.id;
      m3PrelimFinal.nextWinnerSlot = "AWAY";

      matches = [m1Qualifier, m2Elimination, m3PrelimFinal, m4GrandFinal];
    } else {
      // Stepladder Climb (Top 6 seeds: #5 vs #6 -> #4 -> #3 -> #2 -> #1)
      const ladderSeeds = orderedIds.slice(0, Math.min(6, orderedIds.length));
      const numSeeds = ladderSeeds.length;
      const ladderMatches: TournamentMatch[] = [];

      for (let step = 0; step < numSeeds - 1; step++) {
        const lowerSeedNumber = numSeeds - step;
        const higherSeedNumber = numSeeds - step - 1;
        const isFinal = higherSeedNumber === 1;

        const m: TournamentMatch = {
          id: crypto.randomUUID(),
          leagueId: league.id,
          gameNumber: gameNum++,
          stage: isFinal ? "FINALS" : "STEPLADDER",
          roundNumber: step + 1,
          roundLabel: isFinal
            ? `Stepladder Championship Final (#1 Seed Bye vs Challenger)`
            : `Stepladder Rung ${step + 1}: #${higherSeedNumber} Seed (Bye) vs ${
                step === 0 ? `#${lowerSeedNumber} Seed` : `Winner Rung ${step}`
              }`,
          homeTeamId: ladderSeeds[higherSeedNumber - 1] ?? null,
          awayTeamId: step === 0 ? (ladderSeeds[lowerSeedNumber - 1] ?? null) : null,
          homeTeamPlaceholder: `Seed #${higherSeedNumber} (Bye)`,
          awayTeamPlaceholder:
            step === 0 ? `Seed #${lowerSeedNumber}` : `Winner Rung ${step}`,
          homeScore: null,
          awayScore: null,
          status: "SCHEDULED",
          winnerTeamId: null,
          loserTeamId: null,
          ...assignSlot(step),
        };
        ladderMatches.push(m);
      }

      for (let i = 0; i < ladderMatches.length - 1; i++) {
        ladderMatches[i].nextWinnerMatchId = ladderMatches[i + 1].id;
        ladderMatches[i].nextWinnerSlot = "AWAY";
      }

      matches = ladderMatches;
    }
  }

  return {
    leagueId: league.id,
    formatId,
    poolsCount,
    advancingPerPool,
    seriesBestOf,
    stepladderVariant,
    dailyTimeSlots,
    pools,
    seedOrderTeamIds: orderedIds,
    matches,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calculates live Pool / Group Standings (W-L, Win %, PF, PA, Point Diff, Streak)
 * from completed POOL stage matches.
 */
export function calculatePoolStandings(
  tournament: LeagueTournamentData,
  teams: LeagueTeam[]
): Record<string, PoolStandingRow[]> {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const result: Record<string, PoolStandingRow[]> = {};

  const poolsToCompute: TournamentPool[] =
    tournament.pools && tournament.pools.length > 0
      ? tournament.pools
      : [
          {
            id: "all-teams",
            name: "Overall Standings",
            teamIds: teams.map((t) => t.id),
          },
        ];

  for (const pool of poolsToCompute) {
    const rowsMap = new Map<string, PoolStandingRow>();
    const resultsHistory = new Map<string, ("W" | "L")[]>();

    for (const tid of pool.teamIds) {
      const team = teamMap.get(tid);
      if (!team) continue;
      rowsMap.set(tid, {
        teamId: tid,
        teamName: team.name,
        poolName: pool.name,
        played: 0,
        wins: 0,
        losses: 0,
        winPct: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
        streak: "-",
      });
      resultsHistory.set(tid, []);
    }

    const poolMatches = tournament.matches.filter(
      (m) =>
        m.status === "FINAL" &&
        m.homeScore !== null &&
        m.awayScore !== null &&
        (m.poolName === pool.name || poolsToCompute.length === 1)
    );

    for (const m of poolMatches) {
      if (!m.homeTeamId || !m.awayTeamId) continue;
      const homeRow = rowsMap.get(m.homeTeamId);
      const awayRow = rowsMap.get(m.awayTeamId);
      const hScore = m.homeScore ?? 0;
      const aScore = m.awayScore ?? 0;

      if (homeRow) {
        homeRow.played += 1;
        homeRow.pointsFor += hScore;
        homeRow.pointsAgainst += aScore;
        homeRow.pointDiff = homeRow.pointsFor - homeRow.pointsAgainst;
        if (hScore >= aScore) {
          homeRow.wins += 1;
          resultsHistory.get(m.homeTeamId)?.push("W");
        } else {
          homeRow.losses += 1;
          resultsHistory.get(m.homeTeamId)?.push("L");
        }
        homeRow.winPct =
          homeRow.played > 0 ? homeRow.wins / homeRow.played : 0;
      }

      if (awayRow) {
        awayRow.played += 1;
        awayRow.pointsFor += aScore;
        awayRow.pointsAgainst += hScore;
        awayRow.pointDiff = awayRow.pointsFor - awayRow.pointsAgainst;
        if (aScore > hScore) {
          awayRow.wins += 1;
          resultsHistory.get(m.awayTeamId)?.push("W");
        } else {
          awayRow.losses += 1;
          resultsHistory.get(m.awayTeamId)?.push("L");
        }
        awayRow.winPct =
          awayRow.played > 0 ? awayRow.wins / awayRow.played : 0;
      }
    }

    // Format streak & sort by Wins DESC, WinPct DESC, PointDiff DESC, PointsFor DESC
    const sortedRows = Array.from(rowsMap.values()).map((row) => {
      const hist = resultsHistory.get(row.teamId) ?? [];
      if (hist.length === 0) {
        return { ...row, streak: "-" };
      }
      const last = hist[hist.length - 1];
      let count = 0;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i] === last) count++;
        else break;
      }
      return { ...row, streak: `${last}${count}` };
    });

    sortedRows.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      return b.pointsFor - a.pointsFor;
    });

    result[pool.name] = sortedRows;
  }

  return result;
}

/**
 * Records a match score and automatically advances Winners and Losers across
 * Single-Elimination, Double-Elimination, Series Playoff, and Page-McIntyre brackets!
 */
export function recordMatchResultAndAdvance(
  tournament: LeagueTournamentData,
  matchId: string,
  homeScore: number,
  awayScore: number
): LeagueTournamentData {
  const clonedMatches: TournamentMatch[] = tournament.matches.map((m) => ({
    ...m,
  }));
  const target = clonedMatches.find((m) => m.id === matchId);
  if (!target) return tournament;

  target.homeScore = homeScore;
  target.awayScore = awayScore;
  target.status = "FINAL";

  const homeWon = homeScore >= awayScore;
  target.winnerTeamId = homeWon ? target.homeTeamId : target.awayTeamId;
  target.loserTeamId = homeWon ? target.awayTeamId : target.homeTeamId;

  // Propagate Winner to nextWinnerMatchId
  if (target.nextWinnerMatchId && target.winnerTeamId) {
    const nextWinnerMatch = clonedMatches.find(
      (m) => m.id === target.nextWinnerMatchId
    );
    if (nextWinnerMatch) {
      if (target.nextWinnerSlot === "HOME") {
        nextWinnerMatch.homeTeamId = target.winnerTeamId;
      } else {
        nextWinnerMatch.awayTeamId = target.winnerTeamId;
      }
    }
  }

  // Propagate Loser to nextLoserMatchId (Double-Elimination & Page-McIntyre 1v2 Qualifier)
  if (target.nextLoserMatchId && target.loserTeamId) {
    const nextLoserMatch = clonedMatches.find(
      (m) => m.id === target.nextLoserMatchId
    );
    if (nextLoserMatch) {
      if (target.nextLoserSlot === "HOME") {
        nextLoserMatch.homeTeamId = target.loserTeamId;
      } else {
        nextLoserMatch.awayTeamId = target.loserTeamId;
      }
    }
  }

  // Series Playoff Advancement: Check if a team clinched the Best-of-N series
  if (
    tournament.formatId === "SERIES_PLAYOFF" &&
    target.seriesId &&
    (target.seriesId === "series-sf-1" || target.seriesId === "series-sf-2")
  ) {
    const seriesMatches = clonedMatches.filter(
      (m) => m.seriesId === target.seriesId
    );
    const bestOf = target.seriesBestOf ?? tournament.seriesBestOf ?? 3;
    const winsNeeded = Math.ceil(bestOf / 2);

    const winCounts = new Map<string, number>();
    for (const sm of seriesMatches) {
      if (sm.status === "FINAL" && sm.winnerTeamId) {
        winCounts.set(
          sm.winnerTeamId,
          (winCounts.get(sm.winnerTeamId) ?? 0) + 1
        );
      }
    }

    let clinchedTeamId: string | null = null;
    for (const [tid, wCount] of winCounts.entries()) {
      if (wCount >= winsNeeded) {
        clinchedTeamId = tid;
        break;
      }
    }

    if (clinchedTeamId) {
      const finalsMatches = clonedMatches.filter(
        (m) => m.seriesId === "series-finals"
      );
      for (const fm of finalsMatches) {
        const gNum = fm.seriesGameNumber ?? 1;
        if (target.seriesId === "series-sf-1") {
          if (gNum % 2 === 1) fm.homeTeamId = clinchedTeamId;
          else fm.awayTeamId = clinchedTeamId;
        } else {
          if (gNum % 2 === 1) fm.awayTeamId = clinchedTeamId;
          else fm.homeTeamId = clinchedTeamId;
        }
      }
    }
  }

  return {
    ...tournament,
    matches: clonedMatches,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Seeds the Stage 2 Playoff Knockout Bracket from Stage 1 Pool Standings in Multi-Stage mode.
 */
export function seedMultiStagePlayoffsFromStandings(
  tournament: LeagueTournamentData,
  teams: LeagueTeam[]
): LeagueTournamentData {
  if (tournament.formatId !== "MULTI_STAGE") return tournament;

  const standingsByPool = calculatePoolStandings(tournament, teams);
  const poolNames = Object.keys(standingsByPool);
  const clonedMatches = tournament.matches.map((m) => ({ ...m }));

  // Find Round 1 playoff matches (lowest roundNumber among stage === "PLAYOFF" or "FINALS")
  const playoffMatches = clonedMatches.filter(
    (m) => m.stage === "PLAYOFF" || m.stage === "FINALS"
  );
  if (playoffMatches.length === 0) return tournament;

  const minPlayoffRound = Math.min(...playoffMatches.map((m) => m.roundNumber));
  const firstPlayoffRoundMatches = playoffMatches.filter(
    (m) => m.roundNumber === minPlayoffRound
  );

  if (poolNames.length >= 2) {
    const poolA = standingsByPool[poolNames[0]] ?? [];
    const poolB = standingsByPool[poolNames[1]] ?? [];

    if (firstPlayoffRoundMatches.length === 2) {
      // 4-team Crossover Semifinals: A1 vs B2, B1 vs A2
      firstPlayoffRoundMatches[0].homeTeamId = poolA[0]?.teamId ?? null;
      firstPlayoffRoundMatches[0].awayTeamId = poolB[1]?.teamId ?? null;
      firstPlayoffRoundMatches[0].homeTeamPlaceholder = `${poolNames[0]} #1`;
      firstPlayoffRoundMatches[0].awayTeamPlaceholder = `${poolNames[1]} #2`;

      firstPlayoffRoundMatches[1].homeTeamId = poolB[0]?.teamId ?? null;
      firstPlayoffRoundMatches[1].awayTeamId = poolA[1]?.teamId ?? null;
      firstPlayoffRoundMatches[1].homeTeamPlaceholder = `${poolNames[1]} #1`;
      firstPlayoffRoundMatches[1].awayTeamPlaceholder = `${poolNames[0]} #2`;
    } else if (firstPlayoffRoundMatches.length >= 4) {
      // 8-team Crossover Quarterfinals: A1 vs B4, B2 vs A3, B1 vs A4, A2 vs B3
      firstPlayoffRoundMatches[0].homeTeamId = poolA[0]?.teamId ?? null;
      firstPlayoffRoundMatches[0].awayTeamId = poolB[3]?.teamId ?? null;

      firstPlayoffRoundMatches[1].homeTeamId = poolB[1]?.teamId ?? null;
      firstPlayoffRoundMatches[1].awayTeamId = poolA[2]?.teamId ?? null;

      firstPlayoffRoundMatches[2].homeTeamId = poolB[0]?.teamId ?? null;
      firstPlayoffRoundMatches[2].awayTeamId = poolA[3]?.teamId ?? null;

      firstPlayoffRoundMatches[3].homeTeamId = poolA[1]?.teamId ?? null;
      firstPlayoffRoundMatches[3].awayTeamId = poolB[2]?.teamId ?? null;
    }
  } else if (poolNames.length === 1) {
    const poolSingle = standingsByPool[poolNames[0]] ?? [];
    if (firstPlayoffRoundMatches.length >= 2) {
      firstPlayoffRoundMatches[0].homeTeamId = poolSingle[0]?.teamId ?? null;
      firstPlayoffRoundMatches[0].awayTeamId = poolSingle[3]?.teamId ?? null;
      firstPlayoffRoundMatches[1].homeTeamId = poolSingle[1]?.teamId ?? null;
      firstPlayoffRoundMatches[1].awayTeamId = poolSingle[2]?.teamId ?? null;
    }
  }

  return {
    ...tournament,
    matches: clonedMatches,
    updatedAt: new Date().toISOString(),
  };
}


/**
 * Generates tournament schedule & brackets with multi-category alternating interleaving.
 * If the league has categories (e.g. Men, Women, Junior, Senior), each category runs its
 * own configured format/bracket rules, and their games are alternated/interleaved into
 * the unified master schedule.
 */
export function generateUnifiedLeagueTournamentData(options: {
  league: LeagueRecord;
  teams: LeagueTeam[];
  formatId?: BracketingFormatId;
  poolsCount?: 1 | 2 | 4;
  advancingPerPool?: 2 | 4;
  seriesBestOf?: 3 | 5 | 7;
  stepladderVariant?: "PAGE_MCINTYRE_TOP4" | "STEPLADDER_CLIMB";
  dailyTimeSlots?: string[];
  seedOrderTeamIds?: string[];
}): LeagueTournamentData {
  const { league, teams, dailyTimeSlots = DEFAULT_DAILY_TIME_SLOTS } = options;
  const categories = league.categories ?? [];

  // If no categories configured, fallback to standard single-division generator
  if (categories.length === 0) {
    return generateLeagueTournamentData({
      league,
      teams,
      formatId: options.formatId ?? "MULTI_STAGE",
      poolsCount: options.poolsCount,
      advancingPerPool: options.advancingPerPool,
      seriesBestOf: options.seriesBestOf,
      stepladderVariant: options.stepladderVariant,
      dailyTimeSlots,
      seedOrderTeamIds: options.seedOrderTeamIds,
    });
  }

  // Generate independent bracket & matches for each category
  const categoryMatchQueues: TournamentMatch[][] = [];
  const allPools: TournamentPool[] = [];
  let combinedSeeds: string[] = [];

  for (const cat of categories) {
    const catTeams = teams.filter(
      (t) => t.categoryId === cat.id || (!t.categoryId && cat.id === categories[0]?.id)
    );

    // If a category has fewer than 2 teams, skip bracket generation for it until teams join
    if (catTeams.length < 2) {
      continue;
    }

    const dummyLeague: LeagueRecord = {
      ...league,
      ruleSetId: cat.ruleSetId || league.ruleSetId,
      rulesConfig: cat.rulesConfig || league.rulesConfig,
    };

    const catTourney = generateLeagueTournamentData({
      league: dummyLeague,
      teams: catTeams,
      formatId: cat.formatId || options.formatId || "MULTI_STAGE",
      poolsCount: cat.poolsCount ?? 2,
      advancingPerPool: cat.advancingPerPool ?? 2,
      seriesBestOf: cat.seriesBestOf ?? 3,
      stepladderVariant: cat.stepladderVariant ?? "PAGE_MCINTYRE_TOP4",
      dailyTimeSlots,
    });

    // Tag each match with category metadata
    const taggedMatches = catTourney.matches.map((m) => ({
      ...m,
      categoryId: cat.id,
      categoryName: cat.name,
      categoryCode: cat.code || cat.name.slice(0, 3).toUpperCase(),
      categoryColor: cat.color || "#0B2F5C",
      roundLabel: `[${cat.code || cat.name}] ${m.roundLabel}`,
    }));

    // Tag pools
    const taggedPools = catTourney.pools.map((p) => ({
      ...p,
      id: `${cat.id}-${p.id}`,
      name: `${cat.name} • ${p.name}`,
    }));

    allPools.push(...taggedPools);
    combinedSeeds.push(...catTourney.seedOrderTeamIds);
    categoryMatchQueues.push(taggedMatches);
  }

  // If no category had enough teams, generate with full team pool
  if (categoryMatchQueues.length === 0) {
    return generateLeagueTournamentData({
      league,
      teams,
      formatId: options.formatId ?? "MULTI_STAGE",
      poolsCount: options.poolsCount,
      advancingPerPool: options.advancingPerPool,
      seriesBestOf: options.seriesBestOf,
      stepladderVariant: options.stepladderVariant,
      dailyTimeSlots,
      seedOrderTeamIds: options.seedOrderTeamIds,
    });
  }

  // Interleave / Alternate matches round-robin across categories
  // e.g. Game 1: Men G1, Game 2: Women G1, Game 3: Junior G1, Game 4: Men G2...
  const interleavedMatches: TournamentMatch[] = [];
  let hasMore = true;
  let roundRobinIndex = 0;

  while (hasMore) {
    hasMore = false;
    for (let i = 0; i < categoryMatchQueues.length; i++) {
      const q = categoryMatchQueues[i];
      if (roundRobinIndex < q.length) {
        interleavedMatches.push(q[roundRobinIndex]);
        if (roundRobinIndex + 1 < q.length) {
          hasMore = true;
        }
      }
    }
    roundRobinIndex++;
  }

  // Assign sequential game numbers, dates, times, and courts uniformly
  const assignSlot = createSlotAssigner(league, dailyTimeSlots);
  const resequencedMatches: TournamentMatch[] = interleavedMatches.map((m, idx) => {
    const slot = assignSlot(idx);
    return {
      ...m,
      gameNumber: idx + 1,
      scheduledDate: slot.scheduledDate,
      scheduledTime: slot.scheduledTime,
      courtId: slot.courtId,
      courtName: slot.courtName,
    };
  });

  return {
    leagueId: league.id,
    formatId: options.formatId ?? categories[0]?.formatId ?? "MULTI_STAGE",
    poolsCount: options.poolsCount ?? 2,
    advancingPerPool: options.advancingPerPool ?? 2,
    seriesBestOf: options.seriesBestOf ?? 3,
    stepladderVariant: options.stepladderVariant ?? "PAGE_MCINTYRE_TOP4",
    dailyTimeSlots,
    pools: allPools,
    seedOrderTeamIds: combinedSeeds,
    matches: resequencedMatches,
    updatedAt: new Date().toISOString(),
  };
}
