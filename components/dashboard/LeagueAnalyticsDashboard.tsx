"use client";

import React, { useMemo } from "react";
import {
  Activity,
  Award,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Crown,
  Flame,
  GitBranch,
  MapPin,
  Pencil,
  Play,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  canEditLeagueDetails,
  getUserLeagueRole,
} from "@/lib/basketball-rules";
import { generatePortraitAvatarDataUrl } from "@/lib/image-utils";
import {
  BRACKETING_FORMATS,
  calculatePoolStandings,
} from "@/lib/tournament-engine";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import {
  LeagueRecord,
  LeagueTeam,
  LeagueWorkspaceTab,
  PoolStandingRow,
} from "@/types/boxscore";

interface LeagueAnalyticsDashboardProps {
  league: LeagueRecord;
  teams: LeagueTeam[];
  onSwitchTab: (tab: LeagueWorkspaceTab) => void;
  onEditLeague?: () => void;
}

interface AggregatedPlayerLeader {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  position: string;
  imageUrl?: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  gamesPlayed: number;
  points: number;
  reb: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  eff: number;
}

export function LeagueAnalyticsDashboard({
  league,
  teams,
  onSwitchTab,
  onEditLeague,
}: LeagueAnalyticsDashboardProps) {
  const {
    userProfile,
    tournamentsByLeagueId,
    refereesByLeagueId,
    gameSessionsByMatchId,
    openMatchInGameManagement,
  } = useBoxScoreStore();

  const userRole = getUserLeagueRole(league, userProfile?.id, userProfile?.email);
  const canEdit = canEditLeagueDetails(userRole);

  const tournament = tournamentsByLeagueId[league.id] ?? null;
  const referees = refereesByLeagueId[league.id] ?? [];
  const allMatches = tournament?.matches ?? [];
  const teamMap = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams]
  );

  const completedMatches = useMemo(
    () => allMatches.filter((m) => m.status === "FINAL"),
    [allMatches]
  );
  const scheduledMatches = useMemo(
    () => allMatches.filter((m) => m.status !== "FINAL"),
    [allMatches]
  );

  // Active scorebook sessions belonging to this league
  const leagueSessions = useMemo(() => {
    return Object.values(gameSessionsByMatchId).filter(
      (s) => s.leagueId === league.id
    );
  }, [gameSessionsByMatchId, league.id]);

  // Total rosters & staff counts
  const totalPlayersCount = useMemo(
    () => teams.reduce((sum, t) => sum + (t.roster?.length ?? 0), 0),
    [teams]
  );
  const totalCoachesCount = useMemo(
    () =>
      teams.reduce(
        (sum, t) =>
          sum +
          (t.headCoach ? 1 : 0) +
          (t.assistantCoachStaff?.length ?? t.assistantCoaches?.length ?? 0),
        0
      ),
    [teams]
  );

  // Total points across completed matches + live scorebook sessions
  const { totalPointsScored, avgPointsPerGame, totalPlayEventsCount } =
    useMemo(() => {
      let pts = 0;
      let gamesWithPoints = 0;
      const countedMatchIds = new Set<string>();

      for (const m of completedMatches) {
        pts += (m.homeScore ?? 0) + (m.awayScore ?? 0);
        gamesWithPoints += 1;
        countedMatchIds.add(m.id);
      }

      let eventsCount = 0;
      for (const s of leagueSessions) {
        eventsCount += s.playEvents.length;
        if (
          !countedMatchIds.has(s.matchId) &&
          (s.homeScore > 0 || s.awayScore > 0)
        ) {
          pts += s.homeScore + s.awayScore;
          gamesWithPoints += 1;
        }
      }

      return {
        totalPointsScored: pts,
        avgPointsPerGame:
          gamesWithPoints > 0 ? (pts / gamesWithPoints).toFixed(1) : "0.0",
        totalPlayEventsCount: eventsCount,
      };
    }, [completedMatches, leagueSessions]);

  // Unified Standings across all teams in the league
  const overallStandings = useMemo(() => {
    if (tournament) {
      const byPool = calculatePoolStandings(tournament, teams);
      const rows: (PoolStandingRow & { poolName: string })[] = [];
      for (const pool of tournament.pools) {
        const poolRows = byPool[pool.id] ?? [];
        for (const r of poolRows) {
          rows.push({ ...r, poolName: pool.name });
        }
      }
      if (rows.length > 0) {
        return rows.sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          if (b.winPct !== a.winPct) return b.winPct - a.winPct;
          if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
          return b.pointsFor - a.pointsFor;
        });
      }
    }

    // Compute directly from matches if no pools
    return teams
      .map((team) => {
        let gp = 0;
        let wins = 0;
        let losses = 0;
        let pf = 0;
        let pa = 0;

        for (const m of completedMatches) {
          if (m.homeTeamId === team.id || m.awayTeamId === team.id) {
            gp += 1;
            const isHome = m.homeTeamId === team.id;
            const myScore = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
            const oppScore = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
            pf += myScore;
            pa += oppScore;
            if (myScore > oppScore) wins += 1;
            else if (oppScore > myScore) losses += 1;
          }
        }

        return {
          teamId: team.id,
          teamName: team.name,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          imageUrl: team.imageUrl,
          poolName: "League Standings",
          gamesPlayed: gp,
          wins,
          losses,
          winPct: gp > 0 ? wins / gp : 0,
          pointsFor: pf,
          pointsAgainst: pa,
          pointDiff: pf - pa,
          leaguePoints: wins * 2 + losses * 1,
        };
      })
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.winPct !== a.winPct) return b.winPct - a.winPct;
        if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
        return b.pointsFor - a.pointsFor;
      });
  }, [tournament, teams, completedMatches]);

  // Aggregate Player Statistics from Scorebook Sessions + Roster fallback
  const playerLeaderboard = useMemo(() => {
    const map = new Map<string, AggregatedPlayerLeader>();

    // Seed all registered roster players first
    for (const t of teams) {
      for (const p of t.roster ?? []) {
        map.set(p.id, {
          playerId: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          jerseyNumber: p.jerseyNumber,
          position: p.position,
          imageUrl: p.imageUrl,
          teamId: t.id,
          teamName: t.name,
          teamColor: t.primaryColor || "#8B0D0E",
          gamesPlayed: 0,
          points: 0,
          reb: 0,
          oreb: 0,
          dreb: 0,
          ast: 0,
          stl: 0,
          blk: 0,
          tov: 0,
          pf: 0,
          fgm: 0,
          fga: 0,
          tpm: 0,
          tpa: 0,
          ftm: 0,
          fta: 0,
          eff: 0,
        });
      }
    }

    // Accumulate live / recorded game session stats
    for (const session of leagueSessions) {
      const hasActivity =
        session.playEvents.length > 0 ||
        session.homeScore > 0 ||
        session.awayScore > 0;
      if (!hasActivity) continue;

      const allSessionPlayers = [
        ...Object.values(session.homePlayerStats),
        ...Object.values(session.awayPlayerStats),
      ];

      for (const sp of allSessionPlayers) {
        const existing = map.get(sp.playerId);
        const missedFg = Math.max(0, sp.fga - sp.fgm);
        const missedFt = Math.max(0, sp.fta - sp.ftm);
        const singleGameEff =
          sp.points +
          sp.oreb +
          sp.dreb +
          sp.ast +
          sp.stl +
          sp.blk -
          missedFg -
          missedFt -
          sp.tov;

        const participated =
          sp.points > 0 ||
          sp.fga > 0 ||
          sp.fta > 0 ||
          sp.oreb > 0 ||
          sp.dreb > 0 ||
          sp.ast > 0 ||
          sp.stl > 0 ||
          sp.blk > 0 ||
          sp.tov > 0 ||
          sp.pf > 0 ||
          sp.isOnCourt;

        if (existing) {
          if (participated) existing.gamesPlayed += 1;
          existing.points += sp.points;
          existing.oreb += sp.oreb;
          existing.dreb += sp.dreb;
          existing.reb += sp.oreb + sp.dreb;
          existing.ast += sp.ast;
          existing.stl += sp.stl;
          existing.blk += sp.blk;
          existing.tov += sp.tov;
          existing.pf += sp.pf;
          existing.fgm += sp.fgm;
          existing.fga += sp.fga;
          existing.tpm += sp.tpm;
          existing.tpa += sp.tpa;
          existing.ftm += sp.ftm;
          existing.fta += sp.fta;
          existing.eff += singleGameEff;
        } else {
          map.set(sp.playerId, {
            playerId: sp.playerId,
            firstName: sp.firstName,
            lastName: sp.lastName,
            jerseyNumber: sp.jerseyNumber,
            position: sp.position,
            imageUrl: undefined,
            teamId: "team",
            teamName: "League Team",
            teamColor: "#0B2F5C",
            gamesPlayed: participated ? 1 : 0,
            points: sp.points,
            reb: sp.oreb + sp.dreb,
            oreb: sp.oreb,
            dreb: sp.dreb,
            ast: sp.ast,
            stl: sp.stl,
            blk: sp.blk,
            tov: sp.tov,
            pf: sp.pf,
            fgm: sp.fgm,
            fga: sp.fga,
            tpm: sp.tpm,
            tpa: sp.tpa,
            ftm: sp.ftm,
            fta: sp.fta,
            eff: singleGameEff,
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.eff !== a.eff) return b.eff - a.eff;
      if (b.points !== a.points) return b.points - a.points;
      if (b.reb !== a.reb) return b.reb - a.reb;
      return b.ast - a.ast;
    });
  }, [teams, leagueSessions]);

  const topScorer = useMemo(
    () => [...playerLeaderboard].sort((a, b) => b.points - a.points)[0] ?? null,
    [playerLeaderboard]
  );
  const topRebounder = useMemo(
    () => [...playerLeaderboard].sort((a, b) => b.reb - a.reb)[0] ?? null,
    [playerLeaderboard]
  );
  const topPlaymaker = useMemo(
    () => [...playerLeaderboard].sort((a, b) => b.ast - a.ast)[0] ?? null,
    [playerLeaderboard]
  );
  const topMvpCandidate = playerLeaderboard[0] ?? null;

  const formatMeta = tournament
    ? BRACKETING_FORMATS.find((f) => f.id === tournament.formatId)
    : null;

  const completionPct =
    allMatches.length > 0
      ? Math.round((completedMatches.length / allMatches.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* 1. EXECUTIVE KPI SUMMARY STRIP */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Teams & Roster Athletes */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-500">
              Registered Franchises
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-[#8B0D0E]">
              <Users className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900 tabular-nums">
              {teams.length} Teams
            </div>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {totalPlayersCount} Roster Players • {totalCoachesCount} Coaching
              Staff
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onSwitchTab("teams")}
              className="text-xs font-black uppercase text-[#8B0D0E] hover:underline cursor-pointer"
            >
              Manage Teams &amp; Rosters →
            </button>
          </div>
        </div>

        {/* Card 2: Tournament Schedule Progress */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-500">
              Tournament Progress
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0B2F5C]">
              <Calendar className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-black text-slate-900 tabular-nums">
                {completedMatches.length} / {allMatches.length}
              </div>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-700 tabular-nums">
                {completionPct}% Done
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#0B2F5C] transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs font-bold text-slate-500">
              {scheduledMatches.length} games remaining •{" "}
              {formatMeta?.title || "Multi-Stage"}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onSwitchTab("schedule")}
              className="text-xs font-black uppercase text-[#0B2F5C] hover:underline cursor-pointer"
            >
              Open Games Schedule →
            </button>
          </div>
        </div>

        {/* Card 3: Live Scoring & Telemetry */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-500">
              League Scoring Telemetry
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Activity className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900 tabular-nums">
              {totalPointsScored} PTS
            </div>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {avgPointsPerGame} Avg PPG • {totalPlayEventsCount} Play-by-Play
              Events
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onSwitchTab("game_management")}
              className="text-xs font-black uppercase text-[#8B0D0E] hover:underline cursor-pointer"
            >
              Launch Live Scorebook →
            </button>
          </div>
        </div>

        {/* Card 4: League Governance, Venues & Officials */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-500">
              Venues &amp; Officiating
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Award className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900 tabular-nums">
              {league.courts.length}{" "}
              {league.courts.length === 1 ? "Court" : "Courts"}
            </div>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {referees.length} League Referees • {league.ruleSetId} Rulebook
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            {onEditLeague && canEdit ? (
              <button
                type="button"
                onClick={onEditLeague}
                className="inline-flex items-center gap-1 text-xs font-black uppercase text-[#0B2F5C] hover:underline cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit League Settings →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSwitchTab("bracket")}
                className="text-xs font-black uppercase text-[#0B2F5C] hover:underline cursor-pointer"
              >
                View Tournament Bracket →
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. LIVE & UPCOMING GAMES + RECENT FINAL RESULTS */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 Cols: Live & Upcoming Matchups with 1-Click Scorebook Launch */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#8B0D0E]" />
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-slate-900">
                  Upcoming &amp; Active Courtside Games (
                  {scheduledMatches.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Click <strong>Open Scorebook</strong> on any matchup to launch
                  live courtside stat-keeping and clocks.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSwitchTab("schedule")}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-black uppercase text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              All {allMatches.length} Games
            </button>
          </div>

          {scheduledMatches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <p className="text-xs font-bold uppercase text-slate-700">
                {allMatches.length === 0
                  ? "No Tournament Schedule Generated Yet"
                  : "All Scheduled Games Have Been Completed!"}
              </p>
              <button
                type="button"
                onClick={() => onSwitchTab("schedule")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-4 py-2 text-xs font-black uppercase text-white cursor-pointer"
              >
                Go to Games Schedule
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {scheduledMatches.slice(0, 5).map((match) => {
                const homeTeam = match.homeTeamId
                  ? teamMap.get(match.homeTeamId)
                  : undefined;
                const awayTeam = match.awayTeamId
                  ? teamMap.get(match.awayTeamId)
                  : undefined;
                const hName = homeTeam?.name || match.homeTeamPlaceholder;
                const aName = awayTeam?.name || match.awayTeamPlaceholder;
                const liveSession = gameSessionsByMatchId[match.id];
                const hasLiveActivity =
                  liveSession &&
                  (liveSession.playEvents.length > 0 ||
                    liveSession.homeScore > 0 ||
                    liveSession.awayScore > 0);

                return (
                  <div
                    key={match.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 transition-all ${
                      hasLiveActivity
                        ? "border-amber-400 bg-amber-50/50"
                        : "border-slate-200 bg-slate-50/60 hover:bg-slate-50"
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-[#0B2F5C] px-2 py-0.5 text-[0.6rem] font-black uppercase text-white">
                          Game #{match.gameNumber}
                        </span>
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-[0.6rem] font-black uppercase text-slate-700">
                          {match.roundLabel}
                        </span>
                        {hasLiveActivity && (
                          <span className="rounded bg-[#8B0D0E] px-2 py-0.5 text-[0.6rem] font-black uppercase text-white animate-pulse">
                            ● IN PROGRESS ({liveSession.homeScore}-
                            {liveSession.awayScore})
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-black uppercase text-slate-900">
                        {hName}{" "}
                        <span className="text-xs font-bold text-slate-400 mx-1">
                          VS
                        </span>{" "}
                        {aName}
                      </div>
                      <div className="text-[0.68rem] font-semibold text-slate-500">
                        {match.scheduledDate} • {match.scheduledTime} •{" "}
                        {match.courtName}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openMatchInGameManagement(league.id, match.id)
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0D0E] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-2xs hover:opacity-95 cursor-pointer shrink-0"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {hasLiveActivity ? "Resume Scorebook" : "Open Scorebook"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 5 Cols: Recent Final Results & Championship Bracket Status */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#0B2F5C]" />
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-slate-900">
                  Recent Final Results ({completedMatches.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Official finalized scores synced to bracket
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSwitchTab("bracket")}
              className="rounded-xl bg-[#0B2F5C] px-3 py-1.5 text-xs font-black uppercase text-white hover:opacity-95 cursor-pointer"
            >
              View Bracket
            </button>
          </div>

          {completedMatches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center space-y-2">
              <GitBranch className="mx-auto h-8 w-8 text-slate-400" />
              <p className="text-xs font-bold uppercase text-slate-600">
                No Finalized Games Yet
              </p>
              <p className="text-[0.7rem] text-slate-500">
                Record scores in the <strong>Games Schedule</strong> or finalize
                a game in the <strong>Scorebook</strong> to see official results
                here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {completedMatches
                .slice(-5)
                .reverse()
                .map((match) => {
                  const homeTeam = match.homeTeamId
                    ? teamMap.get(match.homeTeamId)
                    : undefined;
                  const awayTeam = match.awayTeamId
                    ? teamMap.get(match.awayTeamId)
                    : undefined;
                  const hName = homeTeam?.name || match.homeTeamPlaceholder;
                  const aName = awayTeam?.name || match.awayTeamPlaceholder;
                  const homeWon =
                    (match.homeScore ?? 0) > (match.awayScore ?? 0);

                  return (
                    <div
                      key={match.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-white">
                            FINAL • G#{match.gameNumber}
                          </span>
                          <span className="truncate text-[0.65rem] font-bold text-slate-500">
                            {match.roundLabel}
                          </span>
                        </div>
                        <div className="truncate font-black uppercase text-slate-900">
                          <span className={homeWon ? "text-[#8B0D0E]" : ""}>
                            {hName} ({match.homeScore})
                          </span>{" "}
                          <span className="text-slate-400">vs</span>{" "}
                          <span className={!homeWon ? "text-[#0B2F5C]" : ""}>
                            {aName} ({match.awayScore})
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          openMatchInGameManagement(league.id, match.id)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[0.65rem] font-black uppercase text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
                      >
                        Box Score
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </section>

      {/* 3. COMPREHENSIVE LEAGUE STANDINGS & TEAM POWER RANKINGS */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#0B2F5C]" />
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                League Standings &amp; Team Power Rankings
              </h2>
              <p className="text-xs text-slate-500">
                Live Win-Loss record, Win %, Points For (PF), Points Against
                (PA), and Point Differential (+/-)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSwitchTab("teams")}
            className="rounded-xl bg-[#0B2F5C] px-3.5 py-2 text-xs font-black uppercase text-white hover:opacity-95 cursor-pointer"
          >
            Manage {teams.length} Teams →
          </button>
        </div>

        {overallStandings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-xs font-bold text-slate-500">
              No teams registered yet. Add teams in the <strong>Teams</strong>{" "}
              tab to populate standings.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[0.65rem] font-black uppercase text-slate-500">
                  <th className="py-2.5 px-3 text-left">Rank</th>
                  <th className="py-2.5 px-3 text-left">Team</th>
                  <th className="py-2.5 px-3 text-left">Division / Pool</th>
                  <th className="py-2.5 px-2.5 text-center">GP</th>
                  <th className="py-2.5 px-2.5 text-center">W</th>
                  <th className="py-2.5 px-2.5 text-center">L</th>
                  <th className="py-2.5 px-2.5 text-center">WIN %</th>
                  <th className="py-2.5 px-2.5 text-center">PF</th>
                  <th className="py-2.5 px-2.5 text-center">PA</th>
                  <th className="py-2.5 px-2.5 text-center">DIFF (+/-)</th>
                  <th className="py-2.5 px-3 text-left">Head Coach</th>
                  <th className="py-2.5 px-3 text-left">Captain Ball</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold tabular-nums">
                {overallStandings.map((row, idx) => {
                  const fullTeam = teamMap.get(row.teamId);
                  const captain = fullTeam?.roster.find(
                    (p) => p.id === fullTeam.captainPlayerId || p.isCaptain
                  );

                  return (
                    <tr
                      key={`${row.poolName}-${row.teamId}`}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-black text-slate-900">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-lg text-[0.68rem] font-black ${
                            idx === 0
                              ? "bg-amber-400 text-slate-950"
                              : idx < 4
                                ? "bg-[#0B2F5C] text-white"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-3.5 w-3.5 rounded-full shrink-0 border border-slate-300"
                            style={{
                              backgroundColor:
                                fullTeam?.primaryColor || "#0B2F5C",
                            }}
                          />
                          <span className="font-black uppercase text-slate-900">
                            {row.teamName}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[0.62rem] font-black uppercase text-slate-700">
                          {row.poolName}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center text-slate-700">
                        {row.wins + row.losses}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-black text-emerald-700">
                        {row.wins}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-black text-rose-700">
                        {row.losses}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-black text-slate-900">
                        {(row.winPct * 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-center text-slate-700">
                        {row.pointsFor}
                      </td>
                      <td className="py-2.5 px-2.5 text-center text-slate-700">
                        {row.pointsAgainst}
                      </td>
                      <td
                        className={`py-2.5 px-2.5 text-center font-black ${
                          row.pointDiff > 0
                            ? "text-emerald-700"
                            : row.pointDiff < 0
                              ? "text-rose-700"
                              : "text-slate-500"
                        }`}
                      >
                        {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {fullTeam?.headCoach || "TBA"}
                      </td>
                      <td className="py-2.5 px-3">
                        {captain ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[0.65rem] font-black uppercase text-amber-950">
                            <Crown className="h-3 w-3 text-amber-600" />#
                            {captain.jerseyNumber} {captain.lastName}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. LEAGUE STATISTICAL LEADERS & MVP EFFICIENCY BOARD */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-[#8B0D0E]" />
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                Player Statistical Leaders &amp; MVP Efficiency Race
              </h2>
              <p className="text-xs text-slate-500">
                Automatically aggregated from official Courtside Scorebook
                sessions (EFF = PTS + REB + AST + STL + BLK − Missed FG −
                Missed FT − TO)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSwitchTab("game_management")}
            className="rounded-xl bg-[#8B0D0E] px-3.5 py-2 text-xs font-black uppercase text-white hover:opacity-95 cursor-pointer"
          >
            Log Player Stats in Scorebook →
          </button>
        </div>

        {/* 4 Leader Highlight Cards */}
        {playerLeaderboard.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "MVP / Efficiency Leader",
                player: topMvpCandidate,
                metricValue: `${topMvpCandidate?.eff ?? 0} EFF`,
                subValue: `${topMvpCandidate?.points ?? 0} PTS • ${topMvpCandidate?.reb ?? 0} REB • ${topMvpCandidate?.ast ?? 0} AST`,
                accent: "#0B2F5C",
              },
              {
                label: "Scoring Leader (PTS)",
                player: topScorer,
                metricValue: `${topScorer?.points ?? 0} PTS`,
                subValue: `FG: ${topScorer?.fgm ?? 0}/${topScorer?.fga ?? 0} • 3PT: ${topScorer?.tpm ?? 0}/${topScorer?.tpa ?? 0}`,
                accent: "#8B0D0E",
              },
              {
                label: "Rebounding Leader (REB)",
                player: topRebounder,
                metricValue: `${topRebounder?.reb ?? 0} REB`,
                subValue: `${topRebounder?.oreb ?? 0} OREB • ${topRebounder?.dreb ?? 0} DREB`,
                accent: "#0B2F5C",
              },
              {
                label: "Playmaking Leader (AST)",
                player: topPlaymaker,
                metricValue: `${topPlaymaker?.ast ?? 0} AST`,
                subValue: `${topPlaymaker?.stl ?? 0} STL • ${topPlaymaker?.blk ?? 0} BLK`,
                accent: "#8B0D0E",
              },
            ].map((card, i) => {
              const p = card.player;
              if (!p) return null;
              const avatar =
                p.imageUrl ||
                generatePortraitAvatarDataUrl({
                  name: `${p.firstName} ${p.lastName}`,
                  primaryColor: p.teamColor,
                  secondaryColor: "#0B2F5C",
                  badgeText: `#${p.jerseyNumber}`,
                  roleLabel: p.position,
                });

              return (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[0.65rem] font-black uppercase tracking-wider text-slate-500">
                      {card.label}
                    </span>
                    <Sparkles
                      className="h-4 w-4"
                      style={{ color: card.accent }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <img
                      src={avatar}
                      alt={`${p.firstName} ${p.lastName}`}
                      className="h-12 w-12 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black uppercase text-slate-900">
                        #{p.jerseyNumber} {p.firstName} {p.lastName}
                      </div>
                      <div className="truncate text-[0.68rem] font-bold text-slate-500">
                        {p.teamName} ({p.position})
                      </div>
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between pt-2 border-t border-slate-200/80">
                    <strong
                      className="text-xl font-black tabular-nums"
                      style={{ color: card.accent }}
                    >
                      {card.metricValue}
                    </strong>
                    <span className="text-[0.65rem] font-bold text-slate-500 tabular-nums">
                      {card.subValue}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Top 10 Players Leaderboard Table */}
        {playerLeaderboard.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[0.65rem] font-black uppercase text-slate-500">
                  <th className="py-2 px-3 text-left">Rank</th>
                  <th className="py-2 px-3 text-left">Player</th>
                  <th className="py-2 px-3 text-left">Team</th>
                  <th className="py-2 px-2 text-center">GP</th>
                  <th className="py-2 px-2 text-center text-[#8B0D0E]">PTS</th>
                  <th className="py-2 px-2 text-center">REB</th>
                  <th className="py-2 px-2 text-center">AST</th>
                  <th className="py-2 px-2 text-center">STL</th>
                  <th className="py-2 px-2 text-center">BLK</th>
                  <th className="py-2 px-2 text-center">FG</th>
                  <th className="py-2 px-2 text-center">3PT</th>
                  <th className="py-2 px-2 text-center">FT</th>
                  <th className="py-2 px-3 text-right text-[#0B2F5C]">EFF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold tabular-nums">
                {playerLeaderboard.slice(0, 10).map((p, idx) => (
                  <tr
                    key={p.playerId}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-2 px-3 font-black text-slate-700">
                      #{idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-black uppercase text-slate-900">
                        #{p.jerseyNumber} {p.firstName} {p.lastName}
                      </span>{" "}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.6rem] font-black text-slate-600">
                        {p.position}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-700">
                      {p.teamName}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600">
                      {p.gamesPlayed}
                    </td>
                    <td className="py-2 px-2 text-center font-black text-[#8B0D0E]">
                      {p.points}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-800">
                      {p.reb}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-800">
                      {p.ast}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-700">
                      {p.stl}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-700">
                      {p.blk}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600">
                      {p.fgm}-{p.fga}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600">
                      {p.tpm}-{p.tpa}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600">
                      {p.ftm}-{p.fta}
                    </td>
                    <td className="py-2 px-3 text-right font-black text-[#0B2F5C]">
                      {p.eff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
