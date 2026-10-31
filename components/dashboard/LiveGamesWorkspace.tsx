"use client";

import React, { useMemo, useState } from "react";
import {
  Video,
  Tv,
  Radio,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Trophy,
  Calendar,
  Clock,
  Flame,
  Volume2,
  Maximize2,
  Share2,
} from "lucide-react";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import { TournamentMatch, LiveGameSession, LeagueTeam } from "@/types/boxscore";

interface LiveMatchItem {
  match: TournamentMatch;
  session: LiveGameSession | null;
  leagueId: string;
  leagueName: string;
  homeTeam: LeagueTeam | null;
  awayTeam: LeagueTeam | null;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  streamUrl: string;
  periodText: string;
  clockText: string;
  isClockRunning: boolean;
}

export function LiveGamesWorkspace() {
  const {
    leagues,
    teams,
    tournamentsByLeagueId,
    gameSessionsByMatchId,
    setSelectedLeagueId,
    setSelectedLeagueTab,
    setActiveManageMatchId,
    setActiveSection,
  } = useBoxScoreStore();

  const [selectedStreamMatchId, setSelectedStreamMatchId] = useState<string | null>(null);

  // Aggregate all matches across all leagues that have a streamUrl or active session stream
  const liveStreamGames: LiveMatchItem[] = useMemo(() => {
    const list: LiveMatchItem[] = [];

    for (const league of leagues) {
      const tourney = tournamentsByLeagueId[league.id];
      const matches = tourney?.matches ?? [];
      const leagueTeams = teams.filter((t) => t.leagueId === league.id);
      const teamMap = new Map<string, LeagueTeam>(leagueTeams.map((t) => [t.id, t]));

      for (const m of matches) {
        const session = gameSessionsByMatchId[m.id] ?? null;
        const streamUrl = m.streamUrl || session?.streamUrl;

        // Check if game has a streamUrl OR is marked as streaming
        if (streamUrl && streamUrl.trim().length > 0) {
          const homeTeam = m.homeTeamId ? teamMap.get(m.homeTeamId) ?? null : null;
          const awayTeam = m.awayTeamId ? teamMap.get(m.awayTeamId) ?? null : null;
          const homeTeamName = homeTeam?.name || m.homeTeamPlaceholder || "Home Team";
          const awayTeamName = awayTeam?.name || m.awayTeamPlaceholder || "Away Team";

          const homeScore = session?.homeScore ?? m.homeScore ?? 0;
          const awayScore = session?.awayScore ?? m.awayScore ?? 0;

          const periodText = session
            ? `Q${session.currentPeriod}`
            : m.status === "FINAL"
            ? "FINAL"
            : "LIVE";

          const seconds = session?.clockSecondsRemaining ?? 0;
          const mm = Math.floor(seconds / 60);
          const ss = seconds % 60;
          const clockText = session ? `${mm}:${ss < 10 ? "0" : ""}${ss}` : "00:00";

          list.push({
            match: m,
            session,
            leagueId: league.id,
            leagueName: league.name,
            homeTeam,
            awayTeam,
            homeTeamName,
            awayTeamName,
            homeScore,
            awayScore,
            streamUrl: streamUrl.trim(),
            periodText,
            clockText,
            isClockRunning: session?.isClockRunning ?? false,
          });
        }
      }
    }

    return list;
  }, [leagues, tournamentsByLeagueId, gameSessionsByMatchId, teams]);

  // The actively focused video stream item
  const activeFocusItem = useMemo(() => {
    if (selectedStreamMatchId) {
      const found = liveStreamGames.find((g) => g.match.id === selectedStreamMatchId);
      if (found) return found;
    }
    return liveStreamGames[0] ?? null;
  }, [liveStreamGames, selectedStreamMatchId]);

  const handleOpenTelemetry = (item: LiveMatchItem) => {
    setSelectedLeagueId(item.leagueId);
    setActiveManageMatchId(item.match.id);
    setSelectedLeagueTab("game_details");
    setActiveSection("leagues");
  };

  const handleOpenScoringDesk = (item: LiveMatchItem) => {
    setSelectedLeagueId(item.leagueId);
    setActiveManageMatchId(item.match.id);
    setSelectedLeagueTab("game_management");
    setActiveSection("leagues");
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Banner Header */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-r from-[#071931] via-[#0B2F5C] to-[#1a365d] p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-500 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-red-600/30 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-red-300 border border-red-500/40 backdrop-blur-xs">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span>Facebook Live Broadcast Arena</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              Live Games on Facebook Live
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm text-slate-300">
              Watch games streaming live on Facebook Live across all tournaments. Follow the video stream, real-time scoreboard, quarter stats, and live telemetry without leaving the app.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 backdrop-blur-md text-center">
              <span className="block text-2xl font-black text-white">
                {liveStreamGames.length}
              </span>
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-300">
                Streaming Now
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      {liveStreamGames.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Video className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-lg font-black uppercase text-slate-800">
            No Active Facebook Live Streams Found
          </h2>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            When a game goes live on Facebook Live, connect its stream URL in <strong>Live Game Scoring</strong> or the <strong>OBS Live Studio</strong> to broadcast it here for all spectators and the iOS app.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setActiveSection("leagues");
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B2F5C] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-xs hover:bg-[#071931] cursor-pointer"
            >
              <Trophy className="h-4 w-4" />
              Go to Leagues &amp; Games
            </button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (8 cols): Large Active Stream Video Player + Match Scoreboard */}
          <div className="lg:col-span-8 space-y-5">
            {activeFocusItem && (
              <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl text-white">
                {/* Video Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase text-red-400">
                          {activeFocusItem.leagueName}
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="text-xs font-bold text-slate-300">
                          Game #{activeFocusItem.match.gameNumber} ({activeFocusItem.match.roundLabel || "Match"})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={activeFocusItem.streamUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-blue-400 hover:bg-slate-700 hover:text-blue-300 transition-colors"
                      title="Open Facebook Live in a new window"
                    >
                      <span>Open on Facebook</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>

                    <button
                      type="button"
                      onClick={() => handleOpenTelemetry(activeFocusItem)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-black uppercase text-white hover:bg-blue-700 transition-colors cursor-pointer"
                    >
                      <span>Full Box Score</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* 16:9 Embedded Facebook Player */}
                <div className="relative aspect-video w-full bg-black">
                  <iframe
                    key={activeFocusItem.match.id + activeFocusItem.streamUrl}
                    src={`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
                      activeFocusItem.streamUrl
                    )}&show_text=0&autoplay=1`}
                    className="absolute inset-0 h-full w-full border-0"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>

                {/* Live Match Scoreboard Bottom Bar */}
                <div className="p-5 bg-linear-to-b from-slate-900 to-slate-950 border-t border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    {/* Home Team */}
                    <div className="flex items-center gap-3">
                      {activeFocusItem.homeTeam?.imageUrl ? (
                        <img
                          src={activeFocusItem.homeTeam.imageUrl}
                          alt={activeFocusItem.homeTeamName}
                          className="h-12 w-12 rounded-full object-contain border border-slate-700 bg-white p-0.5"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0B2F5C] text-sm font-black text-white border border-slate-600">
                          {activeFocusItem.homeTeamName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span className="block text-base font-black uppercase text-white leading-tight">
                          {activeFocusItem.homeTeamName}
                        </span>
                        <span className="text-[0.65rem] font-bold text-slate-400 uppercase">
                          HOME
                        </span>
                      </div>
                    </div>

                    {/* Score Center */}
                    <div className="flex items-center gap-4 bg-slate-800/80 px-6 py-2.5 rounded-2xl border border-slate-700">
                      <span className="text-3xl font-black tabular-nums text-white">
                        {activeFocusItem.homeScore}
                      </span>
                      <div className="text-center">
                        <span className="block text-xs font-black uppercase text-red-400">
                          {activeFocusItem.periodText}
                        </span>
                        <span className="block text-xs font-bold text-slate-400 tabular-nums">
                          {activeFocusItem.clockText}
                        </span>
                      </div>
                      <span className="text-3xl font-black tabular-nums text-white">
                        {activeFocusItem.awayScore}
                      </span>
                    </div>

                    {/* Away Team */}
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <span className="block text-base font-black uppercase text-white leading-tight">
                          {activeFocusItem.awayTeamName}
                        </span>
                        <span className="text-[0.65rem] font-bold text-slate-400 uppercase">
                          AWAY
                        </span>
                      </div>
                      {activeFocusItem.awayTeam?.imageUrl ? (
                        <img
                          src={activeFocusItem.awayTeam.imageUrl}
                          alt={activeFocusItem.awayTeamName}
                          className="h-12 w-12 rounded-full object-contain border border-slate-700 bg-white p-0.5"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#8B0D0E] text-sm font-black text-white border border-slate-600">
                          {activeFocusItem.awayTeamName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <span className="text-slate-400 text-xs">
                      Stream sync active • Supabase realtime telemetry connected
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenScoringDesk(activeFocusItem)}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
                      >
                        Open Scoring Desk
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenTelemetry(activeFocusItem)}
                        className="rounded-lg bg-[#0B2F5C] px-3.5 py-1.5 font-black uppercase text-white hover:bg-blue-900 transition-colors cursor-pointer"
                      >
                        View Full Telemetry
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column (4 cols): Stream Playlist / Active Games List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-red-600 animate-pulse" />
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                    All Live Streams ({liveStreamGames.length})
                  </h2>
                </div>
                <span className="text-[0.65rem] font-bold uppercase text-slate-400">
                  Select to Watch
                </span>
              </div>

              <div className="mt-3 space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                {liveStreamGames.map((item) => {
                  const isSelected = activeFocusItem?.match.id === item.match.id;

                  return (
                    <div
                      key={item.match.id}
                      onClick={() => setSelectedStreamMatchId(item.match.id)}
                      className={`group relative rounded-2xl p-3.5 border transition-all cursor-pointer ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/60 shadow-xs ring-1 ring-blue-500"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[0.65rem] font-black uppercase text-slate-500 truncate max-w-[150px]">
                          {item.leagueName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[0.6rem] font-black text-white">
                            <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping"></span>
                            LIVE
                          </span>
                          <span className="text-[0.65rem] font-black text-slate-700">
                            {item.periodText}
                          </span>
                        </div>
                      </div>

                      {/* Teams & Score */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 truncate">
                            {item.homeTeamName}
                          </span>
                          <span className="font-black text-slate-900 tabular-nums">
                            {item.homeScore}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 truncate">
                            {item.awayTeamName}
                          </span>
                          <span className="font-black text-slate-900 tabular-nums">
                            {item.awayScore}
                          </span>
                        </div>
                      </div>

                      {/* Stream Indicator Footer */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[0.68rem]">
                        <span className="text-slate-500 font-bold flex items-center gap-1">
                          <Video className="h-3 w-3 text-red-500" />
                          Facebook Live Stream
                        </span>
                        <span className="font-black text-blue-600 group-hover:underline">
                          {isSelected ? "Watching Now" : "Watch Stream →"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
