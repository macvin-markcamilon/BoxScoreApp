"use client";

import React, { useMemo } from "react";
import {
  Activity,
  Award,
  Calendar,
  ClipboardList,
  GitBranch,
  Heart,
  LayoutDashboard,
  MapPin,
  Play,
  Plus,
  Shield,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import { LeagueWorkspaceTab } from "@/types/boxscore";

/**
 * Comprehensive Platform App Dashboard — Commissioner, Athlete & Officials Command Center
 */
export function AppDashboardBlank() {
  const {
    userProfile,
    leagues,
    followedLeagueIds,
    teams,
    tournamentsByLeagueId,
    refereesByLeagueId,
    gameSessionsByMatchId,
    setActiveSection,
    setSelectedLeagueId,
    setSelectedLeagueTab,
    openMatchInGameManagement,
  } = useBoxScoreStore();

  const createdLeagues = useMemo(
    () => leagues.filter((l) => l.ownerId === userProfile?.id),
    [leagues, userProfile?.id]
  );

  const followedLeagues = useMemo(
    () => leagues.filter((l) => followedLeagueIds.includes(l.id)),
    [leagues, followedLeagueIds]
  );

  const totalPlayersCount = useMemo(
    () => teams.reduce((sum, t) => sum + (t.roster?.length ?? 0), 0),
    [teams]
  );

  const { totalMatchesCount, completedMatchesCount } = useMemo(() => {
    let total = 0;
    let completed = 0;
    const activeLeagueIds = new Set(leagues.map((l) => l.id));
    for (const [lId, tData] of Object.entries(tournamentsByLeagueId)) {
      if (!activeLeagueIds.has(lId)) continue;
      total += tData.matches.length;
      completed += tData.matches.filter((m) => m.status === "FINAL").length;
    }
    return { totalMatchesCount: total, completedMatchesCount: completed };
  }, [leagues, tournamentsByLeagueId]);

  const totalRefereesCount = useMemo(() => {
    const activeLeagueIds = new Set(leagues.map((l) => l.id));
    return Object.entries(refereesByLeagueId).reduce(
      (sum, [lId, list]) => sum + (activeLeagueIds.has(lId) ? (list?.length ?? 0) : 0),
      0
    );
  }, [leagues, refereesByLeagueId]);

  const activeGameSessions = useMemo(() => {
    const activeLeagueIds = new Set(leagues.map((l) => l.id));
    return Object.values(gameSessionsByMatchId).filter(
      (s) => s.leagueId && activeLeagueIds.has(s.leagueId)
    );
  }, [leagues, gameSessionsByMatchId]);

  const recentPlayEvents = useMemo(() => {
    const activeLeagueIds = new Set(leagues.map((l) => l.id));
    const allEvents = Object.values(gameSessionsByMatchId)
      .filter((s) => s.leagueId && activeLeagueIds.has(s.leagueId))
      .flatMap((s) =>
        s.playEvents.map((ev) => ({
          ...ev,
          leagueId: s.leagueId,
        }))
      );
    return allEvents
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
  }, [leagues, gameSessionsByMatchId]);

  const handleOpenLeagueTab = (leagueId: string, tab: LeagueWorkspaceTab) => {
    setSelectedLeagueId(leagueId);
    setSelectedLeagueTab(tab);
    setActiveSection("leagues");
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
      {/* 1. WELCOME HERO & ATHLETE / COMMISSIONER PROFILE BANNER */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#0B2F5C] px-2.5 py-1 text-xs font-black uppercase tracking-wider text-white">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Box Score Platform Command Center
              </span>
              {(userProfile?.accountRoles ?? []).map((role) => (
                <span
                  key={role}
                  className="rounded-md bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-black uppercase text-[#8B0D0E]"
                >
                  {role}
                </span>
              ))}
              {(userProfile?.positions ?? []).map((pos) => (
                <span
                  key={pos}
                  className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-black uppercase text-slate-900"
                >
                  {pos}
                </span>
              ))}
            </div>

            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-slate-900">
              Welcome Back, {userProfile?.firstName} {userProfile?.lastName}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
              {userProfile?.address && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-[#8B0D0E]" />
                  {userProfile.address}
                </span>
              )}
              {userProfile?.heightCm ? (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-[#0B2F5C]" />
                  {userProfile.heightCm} cm • {userProfile.weightKg} kg
                </span>
              ) : null}
              <span>• {userProfile?.email}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedLeagueId(null);
                setActiveSection("leagues");
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#8B0D0E] px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:opacity-95 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Create or Manage Leagues
            </button>
          </div>
        </div>
      </section>

      {/* 2. PLATFORM-WIDE KPI CARDS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-500">
              Active Leagues
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0B2F5C]">
              <Trophy className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900 tabular-nums">
            {leagues.length}
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {createdLeagues.length} Created • {followedLeagues.length} Followed
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-500">
              Teams &amp; Athletes
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-[#8B0D0E]">
              <Users className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900 tabular-nums">
            {teams.length} Teams
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {totalPlayersCount} Registered Roster Players
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-500">
              Scheduled &amp; Final Games
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Calendar className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900 tabular-nums">
            {completedMatchesCount} / {totalMatchesCount}
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Games Completed Across Tournaments
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-500">
              Officiating &amp; Live Sessions
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Award className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900 tabular-nums">
            {activeGameSessions.length} Scorebooks
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {totalRefereesCount} Referees &amp; Table Officials
          </p>
        </div>
      </section>

      {/* 3. ACTIVE LEAGUES QUICK-LAUNCH & LIVE PLAY-BY-PLAY FEED */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 8 Cols: Active Leagues Command Cards */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">
                Your Leagues &amp; Tournament Workspaces ({leagues.length})
              </h2>
              <p className="text-xs text-slate-500">
                Jump directly into any league&apos;s Dashboard, Teams, Schedule,
                Bracket, or Live Courtside Scorebook
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedLeagueId(null);
                setActiveSection("leagues");
              }}
              className="rounded-xl bg-[#0B2F5C] px-3.5 py-2 text-xs font-black uppercase text-white hover:opacity-95 cursor-pointer"
            >
              Open League Hub →
            </button>
          </div>

          {leagues.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center space-y-3">
              <Shield className="mx-auto h-10 w-10 text-slate-400" />
              <h3 className="text-base font-black uppercase text-slate-800">
                No Leagues Created Yet
              </h3>
              <p className="mx-auto max-w-md text-xs text-slate-500">
                Go to the League Page to create your first basketball tournament
                with official FIBA, NBA, NCAA, or 3x3 rules.
              </p>
              <button
                type="button"
                onClick={() => setActiveSection("leagues")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0D0E] px-4 py-2.5 text-xs font-black uppercase text-white cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Go to League Page
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {leagues.map((lg) => {
                const lgTeams = teams.filter((t) => t.leagueId === lg.id);
                const lgTourney = tournamentsByLeagueId[lg.id];
                const lgMatches = lgTourney?.matches ?? [];
                const lgCompleted = lgMatches.filter(
                  (m) => m.status === "FINAL"
                ).length;
                const isFollowing = followedLeagueIds.includes(lg.id);

                return (
                  <div
                    key={lg.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {lg.imageUrl ? (
                          <img
                            src={lg.imageUrl}
                            alt={lg.name}
                            className="h-14 w-14 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#8B0D0E] text-white">
                            <Trophy className="h-6 w-6" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-[#8B0D0E] px-2 py-0.5 text-[0.6rem] font-black uppercase text-white">
                              {lg.ruleSetId} Rules
                            </span>
                            <span className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[0.6rem] font-black uppercase text-slate-700">
                              {lgTeams.length} Teams
                            </span>
                            <span className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[0.6rem] font-black uppercase text-[#0B2F5C]">
                              {lgCompleted}/{lgMatches.length} Games Final
                            </span>
                            {isFollowing && (
                              <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[0.6rem] font-black uppercase text-rose-800">
                                <Heart className="h-2.5 w-2.5 fill-current" />
                                Following
                              </span>
                            )}
                          </div>
                          <h3 className="mt-1 truncate text-xl font-black uppercase tracking-tight text-slate-900">
                            {lg.name}
                          </h3>
                          <p className="text-xs font-semibold text-slate-500">
                            {lg.startDate} → {lg.endDate} • Courts:{" "}
                            {lg.courts.map((c) => c.name).join(", ")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenLeagueTab(lg.id, "league_dashboard")
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-3 py-1.5 text-xs font-black uppercase text-white hover:opacity-95 cursor-pointer"
                      >
                        <LayoutDashboard className="h-3.5 w-3.5" />
                        League Dashboard
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenLeagueTab(lg.id, "teams")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-800 hover:bg-slate-100 cursor-pointer"
                      >
                        <Users className="h-3.5 w-3.5 text-[#8B0D0E]" />
                        Teams ({lgTeams.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenLeagueTab(lg.id, "schedule")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-800 hover:bg-slate-100 cursor-pointer"
                      >
                        <Calendar className="h-3.5 w-3.5 text-[#0B2F5C]" />
                        Schedule ({lgMatches.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenLeagueTab(lg.id, "bracket")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-800 hover:bg-slate-100 cursor-pointer"
                      >
                        <GitBranch className="h-3.5 w-3.5 text-[#8B0D0E]" />
                        Bracket
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenLeagueTab(lg.id, "game_management")
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0D0E] px-3 py-1.5 text-xs font-black uppercase text-white hover:opacity-95 cursor-pointer ml-auto"
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                        Live Scorebook →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 4 Cols: Recent Live Courtside Play-by-Play Feed */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#8B0D0E]" />
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-slate-900">
                  Recent Courtside Telemetry
                </h2>
                <p className="text-xs text-slate-500">
                  Latest play-by-play actions logged across games
                </p>
              </div>
            </div>
          </div>

          {recentPlayEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center space-y-2">
              <Play className="mx-auto h-8 w-8 text-slate-400" />
              <p className="text-xs font-bold uppercase text-slate-600">
                No Courtside Plays Logged Yet
              </p>
              <p className="text-[0.7rem] text-slate-500">
                Open any game in <strong>Game Management (Scorebook)</strong>{" "}
                and tap player actions to stream live play-by-play telemetry.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/50 max-h-[520px] overflow-y-auto">
              {recentPlayEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start justify-between gap-2.5 p-3 text-xs bg-white hover:bg-slate-50"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[0.58rem] font-black text-slate-800 tabular-nums">
                        {ev.periodLabel} • {ev.gameClockDisplay}
                      </span>
                      <span className="rounded bg-[#0B2F5C] px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-white">
                        {ev.teamName}
                      </span>
                    </div>
                    <p className="font-bold text-slate-800 leading-snug">
                      {ev.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      openMatchInGameManagement(ev.leagueId, ev.matchId)
                    }
                    className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 font-black tabular-nums text-slate-900 hover:bg-slate-200 cursor-pointer"
                  >
                    {ev.homeScoreAfter}-{ev.awayScoreAfter}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
