"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Maximize2,
  Minimize2,
  Tv,
} from "lucide-react";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import {
  LeagueRecord,
  LeagueTeam,
  LiveGameSession,
  TournamentMatch,
} from "@/types/boxscore";

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getPeriodLabel(period: number, maxRegularPeriods = 4): string {
  if (period <= maxRegularPeriods) {
    return maxRegularPeriods === 2 ? `Half ${period}` : `Q${period}`;
  }
  const otIndex = period - maxRegularPeriods;
  return otIndex === 1 ? "OT" : `OT${otIndex}`;
}

function ArenaScoreboardContent() {
  const searchParams = useSearchParams();
  const leagueParam = searchParams.get("leagueId");
  const matchParam = searchParams.get("matchId");

  const {
    leagues,
    teams,
    tournamentsByLeagueId,
    gameSessionsByMatchId,
    fetchLeaguesAndTeams,
    initializeSession,
    syncFromLocalStorage,
  } = useBoxScoreStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(
    leagueParam || ""
  );
  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    matchParam || ""
  );
  const [themeMode, setThemeMode] = useState<"broadcast-dark" | "arena-light">(
    "broadcast-dark"
  );
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  useEffect(() => {
    initializeSession();
    fetchLeaguesAndTeams();
  }, [initializeSession, fetchLeaguesAndTeams]);

  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("boxscore_game_sessions_sync");
      bc.onmessage = (evt) => {
        if (evt.data?.type === "GAME_SESSION_UPDATE") {
          syncFromLocalStorage();
        }
      };
    } catch {
      // Ignore if not supported
    }

    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === "boxscore_real_game_sessions_v1" ||
        e.key === "boxscore_real_tournaments_v1"
      ) {
        syncFromLocalStorage();
      }
    };
    window.addEventListener("storage", handleStorage);

    const poller = setInterval(() => {
      syncFromLocalStorage();
    }, 250);

    return () => {
      if (bc) bc.close();
      window.removeEventListener("storage", handleStorage);
      clearInterval(poller);
    };
  }, [syncFromLocalStorage]);

  useEffect(() => {
    if (leagueParam && !selectedLeagueId) {
      setSelectedLeagueId(leagueParam);
    }
    if (matchParam && !selectedMatchId) {
      setSelectedMatchId(matchParam);
    }
  }, [leagueParam, matchParam, selectedLeagueId, selectedMatchId]);

  useEffect(() => {
    if (!selectedLeagueId && leagues.length > 0) {
      setSelectedLeagueId(leagues[0].id);
    }
  }, [leagues, selectedLeagueId]);

  const currentLeague: LeagueRecord | undefined = useMemo(() => {
    return leagues.find((l) => l.id === selectedLeagueId) || leagues[0];
  }, [leagues, selectedLeagueId]);

  const leagueTournament = useMemo(() => {
    if (!currentLeague) return null;
    return tournamentsByLeagueId[currentLeague.id] ?? null;
  }, [currentLeague, tournamentsByLeagueId]);

  const leagueMatches: TournamentMatch[] = useMemo(() => {
    return leagueTournament?.matches ?? [];
  }, [leagueTournament]);

  const activeMatch: TournamentMatch | undefined = useMemo(() => {
    if (selectedMatchId) {
      const found = leagueMatches.find((m) => m.id === selectedMatchId);
      if (found) return found;
    }
    const live = leagueMatches.find((m) => m.status === "LIVE");
    if (live) return live;
    return leagueMatches[0];
  }, [leagueMatches, selectedMatchId]);

  useEffect(() => {
    if (activeMatch && activeMatch.id !== selectedMatchId) {
      setSelectedMatchId(activeMatch.id);
    }
  }, [activeMatch, selectedMatchId]);

  const leagueTeams = useMemo(() => {
    if (!currentLeague) return [];
    return teams.filter((t) => t.leagueId === currentLeague.id);
  }, [teams, currentLeague]);

  const teamMap = useMemo(() => {
    return new Map<string, LeagueTeam>(leagueTeams.map((t) => [t.id, t]));
  }, [leagueTeams]);

  const homeTeam = activeMatch?.homeTeamId
    ? teamMap.get(activeMatch.homeTeamId)
    : undefined;
  const awayTeam = activeMatch?.awayTeamId
    ? teamMap.get(activeMatch.awayTeamId)
    : undefined;

  const homeTeamName =
    homeTeam?.name || activeMatch?.homeTeamPlaceholder || "Home Team";
  const awayTeamName =
    awayTeam?.name || activeMatch?.awayTeamPlaceholder || "Away Team";

  const homeColor = homeTeam?.primaryColor || "#8B0D0E";
  const awayColor = awayTeam?.primaryColor || "#0B2F5C";

  const liveSession: LiveGameSession | undefined = activeMatch
    ? gameSessionsByMatchId[activeMatch.id]
    : undefined;

  const regPeriods = Math.max(1, currentLeague?.rulesConfig?.periodsCount || 4);
  const currentPeriod = liveSession?.currentPeriod ?? 1;
  const periodLabel = getPeriodLabel(currentPeriod, regPeriods);

  const homeScore = liveSession?.homeScore ?? activeMatch?.homeScore ?? 0;
  const awayScore = liveSession?.awayScore ?? activeMatch?.awayScore ?? 0;

  const clockSeconds =
    liveSession?.clockSecondsRemaining ??
    (currentLeague?.rulesConfig?.periodLengthMinutes
      ? currentLeague.rulesConfig.periodLengthMinutes * 60
      : 600);
  const shotClock =
    liveSession?.shotClockSeconds ??
    currentLeague?.rulesConfig?.shotClockSeconds ??
    24;
  const isClockRunning = liveSession?.isClockRunning ?? false;

  const homeQuarterScores = liveSession?.homeQuarterScores ?? [0, 0, 0, 0];
  const awayQuarterScores = liveSession?.awayQuarterScores ?? [0, 0, 0, 0];

  const currentPeriodIndex = Math.max(0, currentPeriod - 1);
  const homePeriodFouls =
    liveSession?.homeTeamFoulsByPeriod?.[currentPeriodIndex] ?? 0;
  const awayPeriodFouls =
    liveSession?.awayTeamFoulsByPeriod?.[currentPeriodIndex] ?? 0;
  const bonusThreshold =
    currentLeague?.rulesConfig?.teamFoulBonusThreshold ?? 5;

  const homeInBonus = homePeriodFouls >= bonusThreshold;
  const awayInBonus = awayPeriodFouls >= bonusThreshold;

  const homeTimeouts = liveSession?.homeTimeoutsRemaining ?? 3;
  const awayTimeouts = liveSession?.awayTimeoutsRemaining ?? 3;

  const toggleFullScreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Ignore user rejection
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // ─── helpers ─────────────────────────────────────────────────────────────────
  const poss = liveSession?.possessionArrow ?? null;

  const TimeoutDots = ({
    remaining,
    max = 5,
  }: {
    remaining: number;
    max?: number;
  }) => (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: i < remaining ? "#f59e0b" : "#1e1c00",
            border: i < remaining ? "1px solid #fbbf24" : "1px solid #333",
            boxShadow: i < remaining ? "0 0 6px #f59e0b88" : "none",
            transition: "all 0.3s",
          }}
        />
      ))}
    </div>
  );

  // ─── render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 select-none ${
        themeMode === "broadcast-dark"
          ? "bg-slate-950 text-white"
          : "bg-slate-100 text-slate-900"
      }`}
    >
      {/* ── TOP CONTROL BAR ── */}
      <header
        className={`w-full border-b px-4 py-2.5 transition-colors ${
          themeMode === "broadcast-dark"
            ? "border-slate-800 bg-slate-900/90 text-slate-300"
            : "border-slate-200 bg-white text-slate-700 shadow-sm"
        }`}
      >
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
                themeMode === "broadcast-dark"
                  ? "bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200"
              }`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Exit to Dashboard
            </Link>

            <BoxScoreLogo
              size="sm"
              variant={themeMode === "broadcast-dark" ? "dark-bg" : "light-bg"}
              showTagline={false}
            />

            <span
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.65rem] font-black uppercase tracking-widest ${
                isClockRunning
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
              }`}
            >
              ●{" "}
              {isClockRunning ? "LIVE CLOCK STREAMING" : "LIVE SCOREBOARD SYNCED"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* League picker */}
            <div className="relative">
              <select
                aria-label="Select League"
                value={selectedLeagueId}
                onChange={(e) => {
                  setSelectedLeagueId(e.target.value);
                  setSelectedMatchId("");
                }}
                className={`rounded-xl border px-3 py-1.5 text-xs font-black uppercase appearance-none pr-8 cursor-pointer ${
                  themeMode === "broadcast-dark"
                    ? "border-slate-700 bg-slate-800 text-white"
                    : "border-slate-300 bg-slate-50 text-slate-900"
                }`}
              >
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
            </div>

            {/* Match picker */}
            <div className="relative">
              <select
                aria-label="Select Game Matchup"
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-black uppercase appearance-none pr-8 cursor-pointer ${
                  themeMode === "broadcast-dark"
                    ? "border-slate-700 bg-slate-800 text-white"
                    : "border-slate-300 bg-slate-50 text-slate-900"
                }`}
              >
                {leagueMatches.length === 0 ? (
                  <option value="">No Games Scheduled</option>
                ) : (
                  leagueMatches.map((m) => {
                    const hName =
                      teamMap.get(m.homeTeamId || "")?.name ||
                      m.homeTeamPlaceholder;
                    const aName =
                      teamMap.get(m.awayTeamId || "")?.name ||
                      m.awayTeamPlaceholder;
                    return (
                      <option key={m.id} value={m.id}>
                        Game #{m.gameNumber}: {hName} vs {aName} (
                        {m.roundLabel})
                      </option>
                    );
                  })
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
            </div>

            <button
              type="button"
              onClick={() =>
                setThemeMode((prev) =>
                  prev === "broadcast-dark" ? "arena-light" : "broadcast-dark"
                )
              }
              className={`rounded-xl border px-3 py-1.5 text-xs font-black uppercase cursor-pointer ${
                themeMode === "broadcast-dark"
                  ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-200"
              }`}
            >
              {themeMode === "broadcast-dark" ? "Light Mode" : "Dark Arena"}
            </button>

            <button
              type="button"
              onClick={toggleFullScreen}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0D0E] px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-white hover:bg-[#a31213] cursor-pointer transition-transform active:scale-95"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  Exit Fullscreen
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  Arena Fullscreen
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 flex flex-col justify-center px-4 py-6 sm:px-8 lg:px-12 max-w-[1920px] mx-auto w-full">
        {/* Game meta strip */}
        {activeMatch && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-bold opacity-80 uppercase tracking-widest border-b pb-3 border-current/15">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-[#0B2F5C] px-3 py-1 font-black text-white text-xs">
                GAME #{activeMatch.gameNumber} • {activeMatch.roundLabel}
              </span>
              <span>
                {currentLeague?.name} • {activeMatch.courtName}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span>{activeMatch.scheduledDate}</span>
              <span>{activeMatch.scheduledTime}</span>
              {poss && (
                <span className="rounded bg-amber-400 px-2 py-0.5 text-slate-950 font-black text-xs">
                  Possession: {poss}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            LED ARCADE SCOREBOARD CABINET
        ══════════════════════════════════════════════════ */}
        <div
          style={{
            background:
              "linear-gradient(160deg, #1c1c1c 0%, #111 40%, #0a0a0a 100%)",
            border: "6px solid #2c2c2c",
            borderRadius: "18px",
            boxShadow:
              "0 0 0 2px #3a3a3a, 0 8px 40px rgba(0,0,0,0.9), 0 0 120px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}
        >
          {/* ── TOP HALF: CLOCK PANEL ── */}
          <div
            style={{
              background:
                "linear-gradient(180deg, #0d0d0d 0%, #141414 100%)",
              borderBottom: "3px solid #222",
              padding: "24px 32px 20px",
              position: "relative",
            }}
          >
            {/* HOME side: POSS + BONUS */}
            <div
              style={{
                position: "absolute",
                left: "24px",
                top: "20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
              }}
            >
              {/* POSS label + arrow */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <span
                  style={{
                    color: "#6b7280",
                    fontSize: "0.6rem",
                    fontWeight: 900,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  POSS
                </span>
                {/* left-pointing triangle (home = left side) */}
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: "12px solid transparent",
                    borderBottom: "12px solid transparent",
                    borderRight:
                      poss === "HOME"
                        ? "22px solid #f59e0b"
                        : "22px solid #2a2000",
                    filter:
                      poss === "HOME"
                        ? "drop-shadow(0 0 8px #f59e0b)"
                        : "none",
                    transition: "all 0.4s ease",
                  }}
                />
              </div>

              {/* BONUS LED */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: homeInBonus ? "#f59e0b" : "#1a1200",
                    border: homeInBonus ? "2px solid #fbbf24" : "2px solid #2a1800",
                    boxShadow: homeInBonus
                      ? "0 0 10px #f59e0b, 0 0 20px #f59e0b66"
                      : "inset 0 0 4px rgba(0,0,0,0.8)",
                    transition: "all 0.3s",
                  }}
                />
                <span
                  style={{
                    color: "#6b7280",
                    fontSize: "0.55rem",
                    fontWeight: 900,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  BONUS
                </span>
              </div>
            </div>

            {/* AWAY side: POSS + BONUS */}
            <div
              style={{
                position: "absolute",
                right: "24px",
                top: "20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <span
                  style={{
                    color: "#6b7280",
                    fontSize: "0.6rem",
                    fontWeight: 900,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  POSS
                </span>
                {/* right-pointing triangle */}
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: "12px solid transparent",
                    borderBottom: "12px solid transparent",
                    borderLeft:
                      poss === "AWAY"
                        ? "22px solid #f59e0b"
                        : "22px solid #2a2000",
                    filter:
                      poss === "AWAY"
                        ? "drop-shadow(0 0 8px #f59e0b)"
                        : "none",
                    transition: "all 0.4s ease",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: awayInBonus ? "#f59e0b" : "#1a1200",
                    border: awayInBonus ? "2px solid #fbbf24" : "2px solid #2a1800",
                    boxShadow: awayInBonus
                      ? "0 0 10px #f59e0b, 0 0 20px #f59e0b66"
                      : "inset 0 0 4px rgba(0,0,0,0.8)",
                    transition: "all 0.3s",
                  }}
                />
                <span
                  style={{
                    color: "#6b7280",
                    fontSize: "0.55rem",
                    fontWeight: 900,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  BONUS
                </span>
              </div>
            </div>

            {/* CENTER: CLOCK + sub-row (fouls | shot | fouls) */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              {/* JUMBO CLOCK */}
              <div
                style={{
                  fontFamily: "'Courier New', 'Lucida Console', monospace",
                  fontSize: "clamp(3.5rem, 10vw, 8rem)",
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                  lineHeight: 1,
                  color: isClockRunning
                    ? "#f59e0b"
                    : clockSeconds <= 60
                    ? "#ef4444"
                    : "#f59e0b",
                  textShadow: isClockRunning
                    ? "0 0 24px #f59e0b, 0 0 48px #f59e0b88, 0 0 96px #f59e0b33"
                    : clockSeconds <= 60
                    ? "0 0 24px #ef4444, 0 0 48px #ef444488"
                    : "0 0 12px #f59e0b88, 0 0 24px #f59e0b44",
                  transition: "color 0.4s, text-shadow 0.4s",
                }}
              >
                {formatClock(clockSeconds)}
              </div>

              {/* Sub-row: HOME fouls | SHOT CLOCK | AWAY fouls */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "clamp(12px, 3vw, 40px)",
                }}
              >
                {/* Home fouls */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span
                    style={{
                      color: "#555",
                      fontSize: "0.55rem",
                      fontWeight: 900,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    FOULS
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "clamp(1.4rem, 3vw, 2rem)",
                      fontWeight: 900,
                      color: "#f59e0b",
                      textShadow: "0 0 8px #f59e0b66",
                      lineHeight: 1.1,
                    }}
                  >
                    {homePeriodFouls}
                  </span>
                </div>

                {/* SHOT CLOCK */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    background: "rgba(0,0,0,0.5)",
                    border: `2px solid ${shotClock <= 5 ? "#ef4444" : "#14532d"}`,
                    borderRadius: "10px",
                    padding: "4px 14px",
                    minWidth: "70px",
                    boxShadow: shotClock <= 5
                      ? "0 0 12px #ef444466"
                      : "0 0 8px #16a34a33",
                    transition: "border-color 0.3s, box-shadow 0.3s",
                  }}
                >
                  <span
                    style={{
                      color: shotClock <= 5 ? "#ef4444" : "#22c55e",
                      fontSize: "0.5rem",
                      fontWeight: 900,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    SHOT CLOCK
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "clamp(1.8rem, 4vw, 3rem)",
                      fontWeight: 900,
                      color: shotClock <= 5 ? "#ef4444" : "#22c55e",
                      textShadow:
                        shotClock <= 5
                          ? "0 0 16px #ef4444, 0 0 32px #ef444466"
                          : "0 0 16px #22c55e, 0 0 32px #22c55e66",
                      lineHeight: 1,
                      transition: "color 0.3s, text-shadow 0.3s",
                    }}
                  >
                    {shotClock}
                  </span>
                </div>

                {/* Away fouls */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span
                    style={{
                      color: "#555",
                      fontSize: "0.55rem",
                      fontWeight: 900,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    FOULS
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "clamp(1.4rem, 3vw, 2rem)",
                      fontWeight: 900,
                      color: "#f59e0b",
                      textShadow: "0 0 8px #f59e0b66",
                      lineHeight: 1.1,
                    }}
                  >
                    {awayPeriodFouls}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* LED strip divider */}
          <div
            style={{
              height: "4px",
              background:
                "linear-gradient(90deg, #111, #f59e0b44, #f59e0b88, #f59e0b44, #111)",
            }}
          />

          {/* ── BOTTOM HALF: HOME | PERIOD | GUEST ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              padding: "28px 24px",
              gap: "16px",
              background: "linear-gradient(180deg, #111 0%, #0d0d0d 100%)",
            }}
          >
            {/* HOME */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              {/* Logo + label */}
              {homeTeam?.imageUrl ? (
                <img
                  src={homeTeam.imageUrl}
                  alt={homeTeamName}
                  style={{
                    width: "clamp(52px, 7vw, 84px)",
                    height: "clamp(52px, 7vw, 84px)",
                    borderRadius: "14px",
                    objectFit: "cover",
                    border: `3px solid ${homeColor}`,
                    boxShadow: `0 0 16px ${homeColor}66`,
                    background: "#0a0a0a",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "clamp(52px, 7vw, 84px)",
                    height: "clamp(52px, 7vw, 84px)",
                    borderRadius: "14px",
                    background: homeColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.4rem",
                    fontWeight: 900,
                    color: "#fff",
                  }}
                >
                  {homeTeamName.slice(0, 2)}
                </div>
              )}

              <span
                style={{
                  color: "#ffffff",
                  fontSize: "clamp(0.9rem, 2.2vw, 1.4rem)",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  textShadow: "0 0 20px rgba(255,255,255,0.25)",
                }}
              >
                HOME
              </span>

              {/* Big LED score */}
              <div
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: "clamp(4rem, 11vw, 9rem)",
                  fontWeight: 900,
                  color: "#cc1111",
                  textShadow:
                    "0 0 24px #cc111199, 0 0 48px #cc111166, 0 0 96px #cc111133",
                  lineHeight: 1,
                  letterSpacing: "0.06em",
                  background: "rgba(0,0,0,0.35)",
                  borderRadius: "14px",
                  padding: "6px 22px",
                  border: "2px solid #200000",
                }}
              >
                {String(homeScore).padStart(2, "0")}
              </div>

              {/* Timeout dots */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    color: "#4b5563",
                    fontSize: "0.55rem",
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  TIMEOUTS
                </span>
                <TimeoutDots remaining={homeTimeouts} />
              </div>

              {/* Team name under score */}
              <span
                style={{
                  color: "#6b7280",
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  textAlign: "center",
                }}
              >
                {homeTeamName}
              </span>
            </div>

            {/* CENTER: PERIOD display */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                padding: "0 16px",
              }}
            >
              {/* Vertical LED dividers */}
              <div
                style={{
                  width: "2px",
                  height: "40px",
                  background:
                    "linear-gradient(to bottom, transparent, #333, transparent)",
                  marginBottom: "4px",
                }}
              />

              <span
                style={{
                  color: "#4b5563",
                  fontSize: "0.55rem",
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                PERIOD
              </span>

              {/* Green period digit */}
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "clamp(2.5rem, 6vw, 5rem)",
                  fontWeight: 900,
                  color: "#22c55e",
                  textShadow:
                    "0 0 20px #22c55e, 0 0 40px #22c55e88, 0 0 80px #22c55e44",
                  lineHeight: 1,
                  background: "rgba(0,0,0,0.5)",
                  borderRadius: "12px",
                  padding: "4px 16px",
                  border: "2px solid #052305",
                  minWidth: "60px",
                  textAlign: "center",
                }}
              >
                {currentPeriod}
              </div>

              <span
                style={{
                  color: "#22c55e",
                  fontSize: "0.65rem",
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  opacity: 0.7,
                }}
              >
                {periodLabel}
              </span>

              <div
                style={{
                  width: "2px",
                  height: "40px",
                  background:
                    "linear-gradient(to bottom, transparent, #333, transparent)",
                  marginTop: "4px",
                }}
              />
            </div>

            {/* GUEST */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              {awayTeam?.imageUrl ? (
                <img
                  src={awayTeam.imageUrl}
                  alt={awayTeamName}
                  style={{
                    width: "clamp(52px, 7vw, 84px)",
                    height: "clamp(52px, 7vw, 84px)",
                    borderRadius: "14px",
                    objectFit: "cover",
                    border: `3px solid ${awayColor}`,
                    boxShadow: `0 0 16px ${awayColor}66`,
                    background: "#0a0a0a",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "clamp(52px, 7vw, 84px)",
                    height: "clamp(52px, 7vw, 84px)",
                    borderRadius: "14px",
                    background: awayColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.4rem",
                    fontWeight: 900,
                    color: "#fff",
                  }}
                >
                  {awayTeamName.slice(0, 2)}
                </div>
              )}

              <span
                style={{
                  color: "#ffffff",
                  fontSize: "clamp(0.9rem, 2.2vw, 1.4rem)",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  textShadow: "0 0 20px rgba(255,255,255,0.25)",
                }}
              >
                GUEST
              </span>

              <div
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: "clamp(4rem, 11vw, 9rem)",
                  fontWeight: 900,
                  color: "#cc1111",
                  textShadow:
                    "0 0 24px #cc111199, 0 0 48px #cc111166, 0 0 96px #cc111133",
                  lineHeight: 1,
                  letterSpacing: "0.06em",
                  background: "rgba(0,0,0,0.35)",
                  borderRadius: "14px",
                  padding: "6px 22px",
                  border: "2px solid #200000",
                }}
              >
                {String(awayScore).padStart(2, "0")}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    color: "#4b5563",
                    fontSize: "0.55rem",
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  TIMEOUTS
                </span>
                <TimeoutDots remaining={awayTimeouts} />
              </div>

              <span
                style={{
                  color: "#6b7280",
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  textAlign: "center",
                }}
              >
                {awayTeamName}
              </span>
            </div>
          </div>

          {/* LED bottom strip divider */}
          <div
            style={{
              height: "4px",
              background:
                "linear-gradient(90deg, #111, #cc111144, #cc111188, #cc111144, #111)",
            }}
          />

          {/* ── QUARTER SCORING TABLE ── */}
          <div
            style={{
              background: "rgba(0,0,0,0.7)",
              borderTop: "2px solid #1a1a1a",
              padding: "16px 24px",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontFamily: "monospace",
                }}
              >
                <thead>
                  <tr
                    style={{
                      color: "#4b5563",
                      fontSize: "0.6rem",
                      fontWeight: 900,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      borderBottom: "1px solid #1f1f1f",
                    }}
                  >
                    <th style={{ padding: "6px 0", textAlign: "left" }}>
                      Franchise
                    </th>
                    {homeQuarterScores.map((_, idx) => (
                      <th
                        key={idx}
                        style={{ padding: "6px 12px", textAlign: "center" }}
                      >
                        {getPeriodLabel(idx + 1, regPeriods)}
                      </th>
                    ))}
                    <th
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        color: "#f59e0b",
                      }}
                    >
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #161616" }}>
                    <td
                      style={{
                        padding: "10px 0",
                        color: "#9ca3af",
                        fontSize: "0.7rem",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        maxWidth: "180px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {homeTeamName}
                    </td>
                    {homeQuarterScores.map((qScore, idx) => (
                      <td
                        key={idx}
                        style={{
                          padding: "10px 12px",
                          textAlign: "center",
                          fontWeight: 900,
                          color:
                            currentPeriod === idx + 1 ? "#cc1111" : "#374151",
                          textShadow:
                            currentPeriod === idx + 1
                              ? "0 0 8px #cc111188"
                              : "none",
                          fontSize: "0.85rem",
                          transition: "color 0.3s",
                        }}
                      >
                        {qScore}
                      </td>
                    ))}
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        color: "#cc1111",
                        fontSize: "1rem",
                        fontWeight: 900,
                        textShadow: "0 0 8px #cc111166",
                      }}
                    >
                      {homeScore}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: "10px 0",
                        color: "#9ca3af",
                        fontSize: "0.7rem",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        maxWidth: "180px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {awayTeamName}
                    </td>
                    {awayQuarterScores.map((qScore, idx) => (
                      <td
                        key={idx}
                        style={{
                          padding: "10px 12px",
                          textAlign: "center",
                          fontWeight: 900,
                          color:
                            currentPeriod === idx + 1 ? "#cc1111" : "#374151",
                          textShadow:
                            currentPeriod === idx + 1
                              ? "0 0 8px #cc111188"
                              : "none",
                          fontSize: "0.85rem",
                          transition: "color 0.3s",
                        }}
                      >
                        {qScore}
                      </td>
                    ))}
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        color: "#cc1111",
                        fontSize: "1rem",
                        fontWeight: 900,
                        textShadow: "0 0 8px #cc111166",
                      }}
                    >
                      {awayScore}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs opacity-60 font-medium">
          <div className="flex items-center gap-2">
            <Tv className="h-4 w-4" />
            <span>
              Real-Time Arena Broadcast View • Connected to BoxScore Telemetry
            </span>
          </div>
          <div>
            Press <strong>F11</strong> or click <strong>Arena Fullscreen</strong>{" "}
            for clean projector display.
          </div>
        </footer>
      </main>
    </div>
  );
}

export default function ScoreboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
          <p className="text-sm font-black uppercase tracking-widest text-slate-400">
            Loading Arena Scoreboard...
          </p>
        </div>
      }
    >
      <ArenaScoreboardContent />
    </Suspense>
  );
}
