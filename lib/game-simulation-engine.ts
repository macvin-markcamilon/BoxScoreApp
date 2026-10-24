import {
  LeagueRecord,
  LeagueTeam,
  LiveGameSession,
  PlayerGameStats,
  RosterPlayer,
  RunningScoreEntry,
  ScorebookActionType,
  ScorebookPlayEvent,
  TournamentMatch,
} from "@/types/boxscore";
import { generateUUID } from "@/lib/uuid";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function simulateFullBasketballGame(
  league: LeagueRecord,
  match: TournamentMatch,
  homeTeam: LeagueTeam,
  awayTeam: LeagueTeam
): {
  session: LiveGameSession;
  finalHomeScore: number;
  finalAwayScore: number;
} {
  const periodsCount = Math.max(1, league.rulesConfig?.periodsCount || 4);
  const periodLengthMins = league.rulesConfig?.periodLengthMinutes || 10;
  const periodTotalSecs = periodLengthMins * 60;
  const shotClockDefault = league.rulesConfig?.shotClockSeconds || 24;

  // Initialize stats for every roster player
  const homeStats: Record<string, PlayerGameStats> = {};
  homeTeam.roster.forEach((p, idx) => {
    homeStats[p.id] = {
      playerId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      jerseyNumber: p.jerseyNumber,
      position: p.position,
      imageUrl: p.imageUrl,
      isOnCourt: idx < 5,
      points: 0,
      fgm: 0,
      fga: 0,
      tpm: 0,
      tpa: 0,
      ftm: 0,
      fta: 0,
      oreb: 0,
      dreb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      pf: 0,
      techFouls: 0,
    };
  });

  const awayStats: Record<string, PlayerGameStats> = {};
  awayTeam.roster.forEach((p, idx) => {
    awayStats[p.id] = {
      playerId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      jerseyNumber: p.jerseyNumber,
      position: p.position,
      imageUrl: p.imageUrl,
      isOnCourt: idx < 5,
      points: 0,
      fgm: 0,
      fga: 0,
      tpm: 0,
      tpa: 0,
      ftm: 0,
      fta: 0,
      oreb: 0,
      dreb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      pf: 0,
      techFouls: 0,
    };
  });

  let homeScore = 0;
  let awayScore = 0;
  const homeQuarterScores: number[] = Array(periodsCount).fill(0);
  const awayQuarterScores: number[] = Array(periodsCount).fill(0);
  const homeTeamFouls: number[] = Array(periodsCount).fill(0);
  const awayTeamFouls: number[] = Array(periodsCount).fill(0);
  const homeRunningScore: Record<number, RunningScoreEntry> = {};
  const awayRunningScore: Record<number, RunningScoreEntry> = {};
  const playEvents: ScorebookPlayEvent[] = [];

  let currentPossession: "HOME" | "AWAY" = Math.random() > 0.5 ? "HOME" : "AWAY";

  // Simulate Period by Period
  for (let pIdx = 0; pIdx < periodsCount; pIdx++) {
    const periodNum = pIdx + 1;
    const periodLabel =
      periodsCount === 1
        ? "REG"
        : periodsCount === 2
          ? `H${periodNum}`
          : `Q${periodNum}`;

    let clockRemaining = periodTotalSecs;

    // Period Start / Jump Ball Event
    if (periodNum === 1) {
      const homeCenter =
        Object.values(homeStats).find((p) => p.isOnCourt && (p.position === "C" || p.position === "PF")) ||
        Object.values(homeStats).filter((p) => p.isOnCourt)[0];
      const awayCenter =
        Object.values(awayStats).find((p) => p.isOnCourt && (p.position === "C" || p.position === "PF")) ||
        Object.values(awayStats).filter((p) => p.isOnCourt)[0];

      playEvents.push({
        id: generateUUID(),
        matchId: match.id,
        period: periodNum,
        periodLabel,
        gameClockDisplay: formatClock(clockRemaining),
        teamSide: currentPossession,
        teamId: currentPossession === "HOME" ? homeTeam.id : awayTeam.id,
        teamName: currentPossession === "HOME" ? homeTeam.name : awayTeam.name,
        teamLogo: currentPossession === "HOME" ? homeTeam.imageUrl : awayTeam.imageUrl,
        categoryLabel: match.categoryName,
        actionType: "JUMP_BALL_ARROW",
        pointsDelta: 0,
        description: `Start of 1st Period — Jump Ball ${homeCenter?.lastName || "Center"} vs. ${awayCenter?.lastName || "Center"}: Tip to ${currentPossession === "HOME" ? homeTeam.name : awayTeam.name}`,
        homeScoreAfter: homeScore,
        awayScoreAfter: awayScore,
        createdAt: new Date().toISOString(),
      });
    }

    // Possession loop for this period
    let possessionsInPeriod = randInt(22, 28); // average realistic possessions per quarter
    let nextSubClock = clockRemaining - randInt(90, 180);

    while (clockRemaining > 0 && possessionsInPeriod > 0) {
      possessionsInPeriod--;
      const elapsed = Math.min(clockRemaining, randInt(12, 24));
      clockRemaining -= elapsed;
      const clockDisplay = formatClock(clockRemaining);

      // Track secondsPlayed for all on-court players
      Object.values(homeStats).forEach((p) => {
        if (p.isOnCourt) {
          p.secondsPlayed = (p.secondsPlayed ?? 0) + elapsed;
          const mins = Math.floor(p.secondsPlayed / 60);
          const secs = p.secondsPlayed % 60;
          p.minutesPlayed = `${mins}:${String(secs).padStart(2, "0")}`;
        }
      });
      Object.values(awayStats).forEach((p) => {
        if (p.isOnCourt) {
          p.secondsPlayed = (p.secondsPlayed ?? 0) + elapsed;
          const mins = Math.floor(p.secondsPlayed / 60);
          const secs = p.secondsPlayed % 60;
          p.minutesPlayed = `${mins}:${String(secs).padStart(2, "0")}`;
        }
      });

      const attackingSide = currentPossession;
      const defendingSide = attackingSide === "HOME" ? "AWAY" : "HOME";
      const attackingTeam = attackingSide === "HOME" ? homeTeam : awayTeam;
      const defendingTeam = attackingSide === "HOME" ? awayTeam : homeTeam;
      const attackingStats = attackingSide === "HOME" ? homeStats : awayStats;
      const defendingStats = attackingSide === "HOME" ? awayStats : homeStats;

      const attackingOnCourt = Object.values(attackingStats).filter((p) => p.isOnCourt);
      const defendingOnCourt = Object.values(defendingStats).filter((p) => p.isOnCourt);

      if (attackingOnCourt.length === 0 || defendingOnCourt.length === 0) {
        currentPossession = defendingSide;
        continue;
      }

      // Check for realistic substitution if clock hit milestone
      if (clockRemaining <= nextSubClock && clockRemaining > 60) {
        const attackingBench = Object.values(attackingStats).filter((p) => !p.isOnCourt);
        if (attackingBench.length > 0) {
          const subOut = pick(attackingOnCourt);
          const subIn = pick(attackingBench);
          subOut.isOnCourt = false;
          subIn.isOnCourt = true;

          playEvents.push({
            id: generateUUID(),
            matchId: match.id,
            period: periodNum,
            periodLabel,
            gameClockDisplay: clockDisplay,
            teamSide: attackingSide,
            teamId: attackingTeam.id,
            teamName: attackingTeam.name,
            teamLogo: attackingTeam.imageUrl,
            categoryLabel: match.categoryName,
            playerId: subIn.playerId,
            playerName: `${subIn.firstName} ${subIn.lastName}`,
            playerJersey: subIn.jerseyNumber,
            subOutPlayerId: subOut.playerId,
            subOutPlayerName: `${subOut.firstName} ${subOut.lastName}`,
            actionType: "SUBSTITUTION",
            pointsDelta: 0,
            description: `${subIn.lastName} enters the game for ${subOut.lastName}`,
            homeScoreAfter: homeScore,
            awayScoreAfter: awayScore,
            createdAt: new Date().toISOString(),
          });
        }
        nextSubClock = clockRemaining - randInt(120, 200);
      }

      const primaryShooter = pick(attackingOnCourt);
      const roll = Math.random();

      // Possibility 1: Turnover (14%)
      if (roll < 0.14) {
        primaryShooter.tov++;
        const isSteal = Math.random() < 0.65;
        const defender = pick(defendingOnCourt);
        if (isSteal) defender.stl++;

        const toDesc = isSteal
          ? `${defender.lastName} STEAL (1 STL) — ${primaryShooter.lastName} Lost Ball Turnover`
          : `${primaryShooter.lastName} Bad Pass Turnover`;

        playEvents.push({
          id: generateUUID(),
          matchId: match.id,
          period: periodNum,
          periodLabel,
          gameClockDisplay: clockDisplay,
          teamSide: attackingSide,
          teamId: attackingTeam.id,
          teamName: attackingTeam.name,
          teamLogo: attackingTeam.imageUrl,
          categoryLabel: match.categoryName,
          playerId: primaryShooter.playerId,
          playerName: `${primaryShooter.firstName} ${primaryShooter.lastName}`,
          playerJersey: primaryShooter.jerseyNumber,
          actionType: "TURNOVER",
          pointsDelta: 0,
          description: toDesc,
          homeScoreAfter: homeScore,
          awayScoreAfter: awayScore,
          createdAt: new Date().toISOString(),
        });

        currentPossession = defendingSide;
        continue;
      }

      // Possibility 2: Shooting Foul / Personal Foul (12%)
      if (roll < 0.26) {
        const foulingDefender = pick(defendingOnCourt);
        foulingDefender.pf++;
        if (attackingSide === "HOME") {
          awayTeamFouls[pIdx]++;
        } else {
          homeTeamFouls[pIdx]++;
        }

        const is3PtFoul = Math.random() < 0.2;
        const ftCount = is3PtFoul ? 3 : 2;

        playEvents.push({
          id: generateUUID(),
          matchId: match.id,
          period: periodNum,
          periodLabel,
          gameClockDisplay: clockDisplay,
          teamSide: defendingSide,
          teamId: defendingTeam.id,
          teamName: defendingTeam.name,
          teamLogo: defendingTeam.imageUrl,
          categoryLabel: match.categoryName,
          playerId: foulingDefender.playerId,
          playerName: `${foulingDefender.firstName} ${foulingDefender.lastName}`,
          playerJersey: foulingDefender.jerseyNumber,
          actionType: "PERSONAL_FOUL",
          pointsDelta: 0,
          description: `${foulingDefender.lastName} S.FOUL (P${foulingDefender.pf}.PN) (Shooting Foul)`,
          homeScoreAfter: homeScore,
          awayScoreAfter: awayScore,
          createdAt: new Date().toISOString(),
        });

        for (let ft = 1; ft <= ftCount; ft++) {
          primaryShooter.fta++;
          const ftIn = Math.random() < 0.76;
          if (ftIn) {
            primaryShooter.ftm++;
            primaryShooter.points++;
            if (attackingSide === "HOME") {
              homeScore++;
              homeQuarterScores[pIdx]++;
              homeRunningScore[homeScore] = {
                pointNumber: homeScore,
                period: periodNum,
                jerseyNumber: primaryShooter.jerseyNumber,
                shotType: "1PT",
              };
            } else {
              awayScore++;
              awayQuarterScores[pIdx]++;
              awayRunningScore[awayScore] = {
                pointNumber: awayScore,
                period: periodNum,
                jerseyNumber: primaryShooter.jerseyNumber,
                shotType: "1PT",
              };
            }

            playEvents.push({
              id: generateUUID(),
              matchId: match.id,
              period: periodNum,
              periodLabel,
              gameClockDisplay: clockDisplay,
              teamSide: attackingSide,
              teamId: attackingTeam.id,
              teamName: attackingTeam.name,
              teamLogo: attackingTeam.imageUrl,
              categoryLabel: match.categoryName,
              playerId: primaryShooter.playerId,
              playerName: `${primaryShooter.firstName} ${primaryShooter.lastName}`,
              playerJersey: primaryShooter.jerseyNumber,
              actionType: "MADE_FT",
              pointsDelta: 1,
              description: `${primaryShooter.lastName} Free Throw ${ft} of ${ftCount} MADE`,
              homeScoreAfter: homeScore,
              awayScoreAfter: awayScore,
              createdAt: new Date().toISOString(),
            });
          } else {
            playEvents.push({
              id: generateUUID(),
              matchId: match.id,
              period: periodNum,
              periodLabel,
              gameClockDisplay: clockDisplay,
              teamSide: attackingSide,
              teamId: attackingTeam.id,
              teamName: attackingTeam.name,
              teamLogo: attackingTeam.imageUrl,
              categoryLabel: match.categoryName,
              playerId: primaryShooter.playerId,
              playerName: `${primaryShooter.firstName} ${primaryShooter.lastName}`,
              playerJersey: primaryShooter.jerseyNumber,
              actionType: "MISS_FT",
              pointsDelta: 0,
              description: `MISS ${primaryShooter.lastName} Free Throw ${ft} of ${ftCount}`,
              homeScoreAfter: homeScore,
              awayScoreAfter: awayScore,
              createdAt: new Date().toISOString(),
            });
          }
        }

        currentPossession = defendingSide;
        continue;
      }

      // Possibility 3: Field Goal Attempt (3-Point or 2-Point) (74%)
      const is3Pt = Math.random() < 0.38;
      if (is3Pt) {
        primaryShooter.fga++;
        primaryShooter.tpa++;
        const makes3Pt = Math.random() < 0.36; // 36% 3PT shooting

        if (makes3Pt) {
          primaryShooter.fgm++;
          primaryShooter.tpm++;
          primaryShooter.points += 3;

          const passer = pick(attackingOnCourt.filter((p) => p.playerId !== primaryShooter.playerId) || attackingOnCourt);
          const hasAssist = Math.random() < 0.72;
          if (hasAssist && passer) passer.ast++;

          if (attackingSide === "HOME") {
            for (let pts = 1; pts <= 3; pts++) {
              homeScore++;
              homeQuarterScores[pIdx]++;
              homeRunningScore[homeScore] = {
                pointNumber: homeScore,
                period: periodNum,
                jerseyNumber: primaryShooter.jerseyNumber,
                shotType: "3PT",
              };
            }
          } else {
            for (let pts = 1; pts <= 3; pts++) {
              awayScore++;
              awayQuarterScores[pIdx]++;
              awayRunningScore[awayScore] = {
                pointNumber: awayScore,
                period: periodNum,
                jerseyNumber: primaryShooter.jerseyNumber,
                shotType: "3PT",
              };
            }
          }

          const shotDist = randInt(23, 28);
          playEvents.push({
            id: generateUUID(),
            matchId: match.id,
            period: periodNum,
            periodLabel,
            gameClockDisplay: clockDisplay,
            teamSide: attackingSide,
            teamId: attackingTeam.id,
            teamName: attackingTeam.name,
            teamLogo: attackingTeam.imageUrl,
            categoryLabel: match.categoryName,
            playerId: primaryShooter.playerId,
            playerName: `${primaryShooter.firstName} ${primaryShooter.lastName}`,
            playerJersey: primaryShooter.jerseyNumber,
            actionType: "MADE_3PT",
            pointsDelta: 3,
            description: `${primaryShooter.lastName} ${shotDist}' 3PT Jump Shot (${primaryShooter.points} PTS)${hasAssist && passer ? ` (${passer.lastName} ${passer.ast} AST)` : ""}`,
            homeScoreAfter: homeScore,
            awayScoreAfter: awayScore,
            createdAt: new Date().toISOString(),
          });
          currentPossession = defendingSide;
        } else {
          // Missed 3-pointer
          const shotDist = randInt(23, 28);
          playEvents.push({
            id: generateUUID(),
            matchId: match.id,
            period: periodNum,
            periodLabel,
            gameClockDisplay: clockDisplay,
            teamSide: attackingSide,
            teamId: attackingTeam.id,
            teamName: attackingTeam.name,
            teamLogo: attackingTeam.imageUrl,
            categoryLabel: match.categoryName,
            playerId: primaryShooter.playerId,
            playerName: `${primaryShooter.firstName} ${primaryShooter.lastName}`,
            playerJersey: primaryShooter.jerseyNumber,
            actionType: "MISS_3PT",
            pointsDelta: 0,
            description: `MISS ${primaryShooter.lastName} ${shotDist}' 3PT Jump Shot`,
            homeScoreAfter: homeScore,
            awayScoreAfter: awayScore,
            createdAt: new Date().toISOString(),
          });

          // Rebound
          const isOffReb = Math.random() < 0.22;
          if (isOffReb) {
            const orebPlayer = pick(attackingOnCourt);
            orebPlayer.oreb++;
            playEvents.push({
              id: generateUUID(),
              matchId: match.id,
              period: periodNum,
              periodLabel,
              gameClockDisplay: clockDisplay,
              teamSide: attackingSide,
              teamId: attackingTeam.id,
              teamName: attackingTeam.name,
              teamLogo: attackingTeam.imageUrl,
              categoryLabel: match.categoryName,
              playerId: orebPlayer.playerId,
              playerName: `${orebPlayer.firstName} ${orebPlayer.lastName}`,
              playerJersey: orebPlayer.jerseyNumber,
              actionType: "OFF_REB",
              pointsDelta: 0,
              description: `${orebPlayer.lastName} REBOUND (Off:${orebPlayer.oreb} Def:${orebPlayer.dreb})`,
              homeScoreAfter: homeScore,
              awayScoreAfter: awayScore,
              createdAt: new Date().toISOString(),
            });
            // stays with attackingSide
          } else {
            const drebPlayer = pick(defendingOnCourt);
            drebPlayer.dreb++;
            playEvents.push({
              id: generateUUID(),
              matchId: match.id,
              period: periodNum,
              periodLabel,
              gameClockDisplay: clockDisplay,
              teamSide: defendingSide,
              teamId: defendingTeam.id,
              teamName: defendingTeam.name,
              teamLogo: defendingTeam.imageUrl,
              categoryLabel: match.categoryName,
              playerId: drebPlayer.playerId,
              playerName: `${drebPlayer.firstName} ${drebPlayer.lastName}`,
              playerJersey: drebPlayer.jerseyNumber,
              actionType: "DEF_REB",
              pointsDelta: 0,
              description: `${drebPlayer.lastName} REBOUND (Off:${drebPlayer.oreb} Def:${drebPlayer.dreb})`,
              homeScoreAfter: homeScore,
              awayScoreAfter: awayScore,
              createdAt: new Date().toISOString(),
            });
            currentPossession = defendingSide;
          }
        }
      } else {
        // 2-Point Attempt
        primaryShooter.fga++;
        const isBlocked = Math.random() < 0.08;
        const blocker = isBlocked ? pick(defendingOnCourt) : null;
        if (isBlocked && blocker) {
          blocker.blk++;
        }

        const shotTypeNames = ["Driving Layup", "Pullup Jump Shot", "Hook Shot", "Floating Jump Shot", "Dunk", "Step Back Jump Shot"];
        const shotName = pick(shotTypeNames);
        const shotDist = randInt(2, 18);

        const makes2Pt = !isBlocked && Math.random() < 0.52; // 52% 2PT shooting

        if (makes2Pt) {
          primaryShooter.fgm++;
          primaryShooter.points += 2;
          const passer = pick(attackingOnCourt.filter((p) => p.playerId !== primaryShooter.playerId) || attackingOnCourt);
          const hasAssist = Math.random() < 0.6;
          if (hasAssist && passer) passer.ast++;

          if (attackingSide === "HOME") {
            for (let pts = 1; pts <= 2; pts++) {
              homeScore++;
              homeQuarterScores[pIdx]++;
              homeRunningScore[homeScore] = {
                pointNumber: homeScore,
                period: periodNum,
                jerseyNumber: primaryShooter.jerseyNumber,
                shotType: "2PT",
              };
            }
          } else {
            for (let pts = 1; pts <= 2; pts++) {
              awayScore++;
              awayQuarterScores[pIdx]++;
              awayRunningScore[awayScore] = {
                pointNumber: awayScore,
                period: periodNum,
                jerseyNumber: primaryShooter.jerseyNumber,
                shotType: "2PT",
              };
            }
          }

          playEvents.push({
            id: generateUUID(),
            matchId: match.id,
            period: periodNum,
            periodLabel,
            gameClockDisplay: clockDisplay,
            teamSide: attackingSide,
            teamId: attackingTeam.id,
            teamName: attackingTeam.name,
            teamLogo: attackingTeam.imageUrl,
            categoryLabel: match.categoryName,
            playerId: primaryShooter.playerId,
            playerName: `${primaryShooter.firstName} ${primaryShooter.lastName}`,
            playerJersey: primaryShooter.jerseyNumber,
            actionType: "MADE_2PT",
            pointsDelta: 2,
            description: `${primaryShooter.lastName} ${shotDist}' ${shotName} (${primaryShooter.points} PTS)${hasAssist && passer ? ` (${passer.lastName} ${passer.ast} AST)` : ""}`,
            homeScoreAfter: homeScore,
            awayScoreAfter: awayScore,
            createdAt: new Date().toISOString(),
          });
          currentPossession = defendingSide;
        } else {
          // Missed 2-pointer
          playEvents.push({
            id: generateUUID(),
            matchId: match.id,
            period: periodNum,
            periodLabel,
            gameClockDisplay: clockDisplay,
            teamSide: attackingSide,
            teamId: attackingTeam.id,
            teamName: attackingTeam.name,
            teamLogo: attackingTeam.imageUrl,
            categoryLabel: match.categoryName,
            playerId: primaryShooter.playerId,
            playerName: `${primaryShooter.firstName} ${primaryShooter.lastName}`,
            playerJersey: primaryShooter.jerseyNumber,
            actionType: "MISS_2PT",
            pointsDelta: 0,
            description: `MISS ${primaryShooter.lastName} ${shotDist}' ${shotName}`,
            homeScoreAfter: homeScore,
            awayScoreAfter: awayScore,
            createdAt: new Date().toISOString(),
          });

          if (isBlocked && blocker) {
            playEvents.push({
              id: generateUUID(),
              matchId: match.id,
              period: periodNum,
              periodLabel,
              gameClockDisplay: clockDisplay,
              teamSide: defendingSide,
              teamId: defendingTeam.id,
              teamName: defendingTeam.name,
              teamLogo: defendingTeam.imageUrl,
              categoryLabel: match.categoryName,
              playerId: blocker.playerId,
              playerName: `${blocker.firstName} ${blocker.lastName}`,
              playerJersey: blocker.jerseyNumber,
              actionType: "BLOCK",
              pointsDelta: 0,
              description: `${blocker.lastName} BLOCK (${blocker.blk} BLK)`,
              homeScoreAfter: homeScore,
              awayScoreAfter: awayScore,
              createdAt: new Date().toISOString(),
            });
          }

          // Rebound
          const isOffReb = Math.random() < 0.25;
          if (isOffReb) {
            const orebPlayer = pick(attackingOnCourt);
            orebPlayer.oreb++;
            playEvents.push({
              id: generateUUID(),
              matchId: match.id,
              period: periodNum,
              periodLabel,
              gameClockDisplay: clockDisplay,
              teamSide: attackingSide,
              teamId: attackingTeam.id,
              teamName: attackingTeam.name,
              teamLogo: attackingTeam.imageUrl,
              categoryLabel: match.categoryName,
              playerId: orebPlayer.playerId,
              playerName: `${orebPlayer.firstName} ${orebPlayer.lastName}`,
              playerJersey: orebPlayer.jerseyNumber,
              actionType: "OFF_REB",
              pointsDelta: 0,
              description: `${orebPlayer.lastName} REBOUND (Off:${orebPlayer.oreb} Def:${orebPlayer.dreb})`,
              homeScoreAfter: homeScore,
              awayScoreAfter: awayScore,
              createdAt: new Date().toISOString(),
            });
          } else {
            const drebPlayer = pick(defendingOnCourt);
            drebPlayer.dreb++;
            playEvents.push({
              id: generateUUID(),
              matchId: match.id,
              period: periodNum,
              periodLabel,
              gameClockDisplay: clockDisplay,
              teamSide: defendingSide,
              teamId: defendingTeam.id,
              teamName: defendingTeam.name,
              teamLogo: defendingTeam.imageUrl,
              categoryLabel: match.categoryName,
              playerId: drebPlayer.playerId,
              playerName: `${drebPlayer.firstName} ${drebPlayer.lastName}`,
              playerJersey: drebPlayer.jerseyNumber,
              actionType: "DEF_REB",
              pointsDelta: 0,
              description: `${drebPlayer.lastName} REBOUND (Off:${drebPlayer.oreb} Def:${drebPlayer.dreb})`,
              homeScoreAfter: homeScore,
              awayScoreAfter: awayScore,
              createdAt: new Date().toISOString(),
            });
            currentPossession = defendingSide;
          }
        }
      }
    }

    // End of period event
    playEvents.push({
      id: generateUUID(),
      matchId: match.id,
      period: periodNum,
      periodLabel,
      gameClockDisplay: "00:00",
      teamSide: "HOME",
      teamId: homeTeam.id,
      teamName: homeTeam.name,
      teamLogo: homeTeam.imageUrl,
      categoryLabel: match.categoryName,
      actionType: "TIMEOUT",
      pointsDelta: 0,
      description: `End of ${periodLabel} — Score: ${homeTeam.name} ${homeScore}, ${awayTeam.name} ${awayScore}`,
      homeScoreAfter: homeScore,
      awayScoreAfter: awayScore,
      createdAt: new Date().toISOString(),
    });
  }

  // Prevent ties: sudden-death/overtime basket if scores equal
  if (homeScore === awayScore) {
    const winnerSide = Math.random() > 0.5 ? "HOME" : "AWAY";
    const scoringPlayer =
      winnerSide === "HOME"
        ? pick(Object.values(homeStats).filter((p) => p.isOnCourt))
        : pick(Object.values(awayStats).filter((p) => p.isOnCourt));

    if (scoringPlayer) {
      scoringPlayer.points += 2;
      scoringPlayer.fgm++;
      scoringPlayer.fga++;
      if (winnerSide === "HOME") {
        homeScore += 2;
        homeQuarterScores[periodsCount - 1] += 2;
        homeRunningScore[homeScore - 1] = { pointNumber: homeScore - 1, period: periodsCount, jerseyNumber: scoringPlayer.jerseyNumber, shotType: "2PT" };
        homeRunningScore[homeScore] = { pointNumber: homeScore, period: periodsCount, jerseyNumber: scoringPlayer.jerseyNumber, shotType: "2PT" };
      } else {
        awayScore += 2;
        awayQuarterScores[periodsCount - 1] += 2;
        awayRunningScore[awayScore - 1] = { pointNumber: awayScore - 1, period: periodsCount, jerseyNumber: scoringPlayer.jerseyNumber, shotType: "2PT" };
        awayRunningScore[awayScore] = { pointNumber: awayScore, period: periodsCount, jerseyNumber: scoringPlayer.jerseyNumber, shotType: "2PT" };
      }

      playEvents.push({
        id: generateUUID(),
        matchId: match.id,
        period: periodsCount,
        periodLabel: periodsCount === 1 ? "REG" : `OT`,
        gameClockDisplay: "00:01",
        teamSide: winnerSide,
        teamId: winnerSide === "HOME" ? homeTeam.id : awayTeam.id,
        teamName: winnerSide === "HOME" ? homeTeam.name : awayTeam.name,
        teamLogo: winnerSide === "HOME" ? homeTeam.imageUrl : awayTeam.imageUrl,
        categoryLabel: match.categoryName,
        playerId: scoringPlayer.playerId,
        playerName: `${scoringPlayer.firstName} ${scoringPlayer.lastName}`,
        playerJersey: scoringPlayer.jerseyNumber,
        actionType: "MADE_2PT",
        pointsDelta: 2,
        description: `${scoringPlayer.lastName} Game-Winning 15' Pullup Jump Shot (${scoringPlayer.points} PTS)`,
        homeScoreAfter: homeScore,
        awayScoreAfter: awayScore,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Ensure any player without recorded seconds gets a fallback formatted minute string
  Object.values(homeStats).forEach((p) => {
    const secs = p.secondsPlayed ?? 0;
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    p.minutesPlayed = `${mins}:${String(rem).padStart(2, "0")}`;
  });
  Object.values(awayStats).forEach((p) => {
    const secs = p.secondsPlayed ?? 0;
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    p.minutesPlayed = `${mins}:${String(rem).padStart(2, "0")}`;
  });

  // Construct complete LiveGameSession
  const session: LiveGameSession = {
    matchId: match.id,
    leagueId: league.id,
    currentPeriod: periodsCount,
    clockSecondsRemaining: 0,
    shotClockSeconds: shotClockDefault,
    isClockRunning: false,
    possessionArrow: currentPossession,
    activeBallPossession: currentPossession,
    homeScore,
    awayScore,
    homeTimeoutsRemaining: 2,
    awayTimeoutsRemaining: 2,
    assignedRefereeIds: [],
    homeQuarterScores,
    awayQuarterScores,
    homeTeamFoulsByPeriod: homeTeamFouls,
    awayTeamFoulsByPeriod: awayTeamFouls,
    homePlayerStats: homeStats,
    awayPlayerStats: awayStats,
    homeRunningScore,
    awayRunningScore,
    playEvents,
    updatedAt: new Date().toISOString(),
  };

  return {
    session,
    finalHomeScore: homeScore,
    finalAwayScore: awayScore,
  };
}
