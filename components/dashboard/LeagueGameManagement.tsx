"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Award,
  Bell,
  Camera,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
  Save,
  Shield,
  Shuffle,
  Sparkles,
  Trash2,
  Undo2,
  UserCheck,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  BellRing,
} from "lucide-react";
import {
  canOperateGameClock,
  canOperateScorebook,
  canOperateShotClock,
  getUserLeagueRole,
} from "@/lib/basketball-rules";
import {
  playGameClockBuzzer,
  playShotClockBuzzer,
  playTimeoutBuzzer,
  playTimeoutWarningBeep,
} from "@/lib/buzzer-audio";
import { CourtPlayerActionCard } from "@/components/dashboard/CourtPlayerActionCard";
import {
  PlayFlowState,
  PlayFlowWizardBanner,
} from "@/components/dashboard/PlayFlowWizardBanner";
import { ScorebookAndPlayByPlaySection } from "@/components/dashboard/ScorebookAndPlayByPlaySection";
import {
  compressImageFile,
  generatePortraitAvatarDataUrl,
  generateRandomRefereeCrew,
} from "@/lib/image-utils";
import {
  DEFAULT_DAILY_TIME_SLOTS,
  generateLeagueTournamentData,
} from "@/lib/tournament-engine";
import { generateUUID } from "@/lib/uuid";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import {
  LeagueRecord,
  LeagueReferee,
  LeagueTeam,
  LeagueWorkspaceTab,
  LiveGameSession,
  PlayerGameStats,
  RefereeRole,
  RosterPlayer,
  ScorebookActionType,
  ScorebookPlayEvent,
  TournamentMatch,
} from "@/types/boxscore";

interface LeagueGameManagementProps {
  league: LeagueRecord;
  teams: LeagueTeam[];
  onSwitchTab: (tab: LeagueWorkspaceTab) => void;
}

const REFEREE_ROLES: RefereeRole[] = [
  "Crew Chief",
  "Umpire 1",
  "Umpire 2",
  "Table Commissioner",
  "Scorekeeper",
  "Official Scorer",
  "Game Timer",
  "Shot Clock Operator",
];

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getPeriodLabel(period: number, regPeriodsCount: number): string {
  if (regPeriodsCount === 1) {
    return period === 1 ? "REG" : `OT${period - 1}`;
  }
  if (regPeriodsCount === 2) {
    return period <= 2 ? `H${period}` : `OT${period - 2}`;
  }
  return period <= regPeriodsCount
    ? `Q${period}`
    : `OT${period - regPeriodsCount}`;
}

function buildInitialPlayerStatsMap(
  roster: RosterPlayer[]
): Record<string, PlayerGameStats> {
  const map: Record<string, PlayerGameStats> = {};
  roster.forEach((p, idx) => {
    map[p.id] = {
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
  return map;
}

function createInitialGameSession(
  league: LeagueRecord,
  match: TournamentMatch,
  homeTeam: LeagueTeam | null,
  awayTeam: LeagueTeam | null,
  leagueReferees: LeagueReferee[]
): LiveGameSession {
  const periodsCount = Math.max(1, league.rulesConfig.periodsCount || 4);
  const periodSeconds = (league.rulesConfig.periodLengthMinutes || 10) * 60;
  const shotClockDefault = league.rulesConfig.shotClockSeconds || 24;

  const initialHomeScore = match.homeScore ?? 0;
  const initialAwayScore = match.awayScore ?? 0;

  const homeQuarters = Array.from(
    { length: Math.max(4, periodsCount) },
    (_, i) => (i === 0 ? initialHomeScore : 0)
  );
  const awayQuarters = Array.from(
    { length: Math.max(4, periodsCount) },
    (_, i) => (i === 0 ? initialAwayScore : 0)
  );

  return {
    matchId: match.id,
    leagueId: league.id,
    currentPeriod: 1,
    clockSecondsRemaining: periodSeconds,
    shotClockSeconds: shotClockDefault,
    isClockRunning: false,
    possessionArrow: "HOME",
    activeBallPossession: "HOME",
    homeScore: initialHomeScore,
    awayScore: initialAwayScore,
    homeQuarterScores: homeQuarters,
    awayQuarterScores: awayQuarters,
    homeTeamFoulsByPeriod: Array.from(
      { length: Math.max(4, periodsCount) },
      () => 0
    ),
    awayTeamFoulsByPeriod: Array.from(
      { length: Math.max(4, periodsCount) },
      () => 0
    ),
    homeTimeoutsRemaining: league.ruleSetId === "NBA" ? 7 : 5,
    awayTimeoutsRemaining: league.ruleSetId === "NBA" ? 7 : 5,
    assignedRefereeIds: leagueReferees.slice(0, 4).map((r) => r.id),
    homePlayerStats: buildInitialPlayerStatsMap(homeTeam?.roster ?? []),
    awayPlayerStats: buildInitialPlayerStatsMap(awayTeam?.roster ?? []),
    homeRunningScore: {},
    awayRunningScore: {},
    playEvents: [],
    updatedAt: new Date().toISOString(),
  };
}

export function LeagueGameManagement({
  league,
  teams,
  onSwitchTab,
}: LeagueGameManagementProps) {
  const {
    userProfile,
    leagues,
    tournamentsByLeagueId,
    activeManageMatchId,
    refereesByLeagueId,
    gameSessionsByMatchId,
    setActiveManageMatchId,
    saveLeagueTournamentData,
    recordMatchScoreInLeague,
    updateMatchDetailsInLeague,
    addRefereeToLeague,
    updateRefereeInLeague,
    deleteRefereeFromLeague,
    setRefereesForLeague,
    saveGameSession,
    persistLeagueGamesToCloud,
  } = useBoxScoreStore();

  const currentLeague = leagues.find((l) => l.id === league.id) ?? league;
  const userFullName = userProfile
    ? `${userProfile.firstName || ""} ${userProfile.lastName || ""}`.trim()
    : null;

  const userRole = getUserLeagueRole(
    currentLeague,
    userProfile?.id,
    userProfile?.email,
    userProfile?.accountRoles,
    userFullName
  );
  const userCanScore = canOperateScorebook(userRole);
  const userCanClock = canOperateGameClock(userRole);
  const userCanShotClock = canOperateShotClock(userRole);

  const existingTournament = tournamentsByLeagueId[league.id] ?? null;

  useEffect(() => {
    if (!existingTournament && teams.length >= 2) {
      const initial = generateLeagueTournamentData({
        league,
        teams,
        formatId: teams.length >= 6 ? "MULTI_STAGE" : "SINGLE_ELIMINATION",
        poolsCount: teams.length >= 6 ? 2 : 1,
        advancingPerPool: 2,
        seriesBestOf: 3,
        stepladderVariant: "PAGE_MCINTYRE_TOP4",
        dailyTimeSlots: DEFAULT_DAILY_TIME_SLOTS,
      });
      saveLeagueTournamentData(league.id, initial);
    }
  }, [existingTournament, league, teams, saveLeagueTournamentData]);

  const matches = useMemo(
    () => existingTournament?.matches ?? [],
    [existingTournament]
  );

  const activeMatch: TournamentMatch | null = useMemo(() => {
    if (matches.length === 0) return null;
    if (activeManageMatchId) {
      const found = matches.find((m) => m.id === activeManageMatchId);
      if (found) return found;
    }
    const playable = matches.find((m) => m.homeTeamId && m.awayTeamId);
    return playable ?? matches[0];
  }, [matches, activeManageMatchId]);

  const teamMap = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams]
  );

  const homeTeam = activeMatch?.homeTeamId
    ? teamMap.get(activeMatch.homeTeamId) ?? null
    : null;
  const awayTeam = activeMatch?.awayTeamId
    ? teamMap.get(activeMatch.awayTeamId) ?? null
    : null;

  const leagueReferees = useMemo(
    () => refereesByLeagueId[league.id] ?? [],
    [refereesByLeagueId, league.id]
  );

  const storedSession = activeMatch
    ? gameSessionsByMatchId[activeMatch.id] ?? null
    : null;

  const session: LiveGameSession | null = useMemo(() => {
    if (!activeMatch) return null;
    if (storedSession) {
      const initialHome = buildInitialPlayerStatsMap(homeTeam?.roster ?? []);
      const initialAway = buildInitialPlayerStatsMap(awayTeam?.roster ?? []);

      // Ensure imageUrl is retained from initial roster mapping if storedSession didn't have it
      const mergedHome: Record<string, PlayerGameStats> = {};
      for (const [id, stats] of Object.entries(storedSession.homePlayerStats)) {
        mergedHome[id] = {
          ...stats,
          imageUrl: stats.imageUrl || initialHome[id]?.imageUrl,
        };
      }
      for (const [id, stats] of Object.entries(initialHome)) {
        if (!mergedHome[id]) mergedHome[id] = stats;
      }

      const mergedAway: Record<string, PlayerGameStats> = {};
      for (const [id, stats] of Object.entries(storedSession.awayPlayerStats)) {
        mergedAway[id] = {
          ...stats,
          imageUrl: stats.imageUrl || initialAway[id]?.imageUrl,
        };
      }
      for (const [id, stats] of Object.entries(initialAway)) {
        if (!mergedAway[id]) mergedAway[id] = stats;
      }
      return {
        ...storedSession,
        activeBallPossession: storedSession.activeBallPossession ?? "HOME",
        homePlayerStats: mergedHome,
        awayPlayerStats: mergedAway,
      };
    }
    return createInitialGameSession(
      league,
      activeMatch,
      homeTeam,
      awayTeam,
      leagueReferees
    );
  }, [activeMatch, storedSession, league, homeTeam, awayTeam, leagueReferees]);

  useEffect(() => {
    if (activeMatch && session && !storedSession) {
      saveGameSession(activeMatch.id, session);
    }
  }, [activeMatch, session, storedSession, saveGameSession]);

  // ===========================================================================
  // 1. COMMITTEE TABLE VISIBILITY TOGGLES (GAME CLOCK, HOME TEAM, AWAY TEAM)
  // ===========================================================================
  const [showGameClock, setShowGameClock] = useState(true);
  const [showHomeTeam, setShowHomeTeam] = useState(true);
  const [showAwayTeam, setShowAwayTeam] = useState(true);

  // Calling Referee & Substitution Target State
  const [selectedCallingRefereeId, setSelectedCallingRefereeId] =
    useState<string>("");
  const [subOutTargetBySide, setSubOutTargetBySide] = useState<{
    HOME: string;
    AWAY: string;
  }>({ HOME: "", AWAY: "" });

  // Audio Buzzer Settings & Active Timeout Countdown State
  const [isBuzzerMuted, setIsBuzzerMuted] = useState(false);
  const [activeTimeoutSide, setActiveTimeoutSide] = useState<"HOME" | "AWAY" | null>(
    null
  );
  const [timeoutSecondsRemaining, setTimeoutSecondsRemaining] = useState<number>(0);
  const [isSavingLiveGame, setIsSavingLiveGame] = useState(false);

  // Active Basketball Play State-Machine Flow
  const [activePlayFlow, setActivePlayFlow] = useState<PlayFlowState | null>(
    null
  );

  // Sync session state from external window updates (e.g., when another committee table scorer updates the game)
  const { syncFromLocalStorage } = useBoxScoreStore();
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("boxscore_game_sessions_sync");
      bc.onmessage = (evt) => {
        if (
          evt.data?.type === "GAME_SESSION_UPDATE" &&
          evt.data?.matchId === activeMatch?.id
        ) {
          syncFromLocalStorage();
        }
      };
    } catch {
      // Fallback
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "boxscore_real_game_sessions_v1") {
        syncFromLocalStorage();
      }
    };
    window.addEventListener("storage", handleStorage);

    // High-frequency poller to ensure committee operators see each other's score/foul logs in real time.
    // NOTE: If clock is running locally on this match, avoid polling from local storage to prevent overwriting active countdown ticks!
    const poller = setInterval(() => {
      const activeMatchId = activeMatch?.id;
      if (activeMatchId) {
        const currentLocal = useBoxScoreStore.getState().gameSessionsByMatchId[activeMatchId];
        if (currentLocal?.isClockRunning) {
          return;
        }
      }
      syncFromLocalStorage();
    }, 1000);

    return () => {
      if (bc) bc.close();
      window.removeEventListener("storage", handleStorage);
      clearInterval(poller);
    };
  }, [activeMatch?.id, syncFromLocalStorage]);

  const [hornAlertMessage, setHornAlertMessage] = useState<string | null>(null);
  const [syncSuccessBanner, setSyncSuccessBanner] = useState<string | null>(
    null
  );

  // Manual Clock Edit Inputs
  const [isEditingClock, setIsEditingClock] = useState(false);
  const [manualMinutesInput, setManualMinutesInput] = useState("10");
  const [manualSecondsInput, setManualSecondsInput] = useState("00");

  // Referee Management Drawer / Form State
  const [isRefPanelOpen, setIsRefPanelOpen] = useState(false);
  const [refNameInput, setRefNameInput] = useState("");
  const [refRoleInput, setRefRoleInput] = useState<RefereeRole>("Crew Chief");
  const [refNumberInput, setRefNumberInput] = useState("24");
  const [refAccreditationInput, setRefAccreditationInput] = useState(
    "FIBA / National Accredited Official"
  );
  const [refImageInput, setRefImageInput] = useState("");

  useEffect(() => {
    if (!session) return;
    if (
      session.assignedRefereeIds.length > 0 &&
      (!selectedCallingRefereeId ||
        !session.assignedRefereeIds.includes(selectedCallingRefereeId))
    ) {
      setSelectedCallingRefereeId(session.assignedRefereeIds[0]);
    }
  }, [session, selectedCallingRefereeId]);

  // Live High-Precision Game Clock & Shot Clock Countdown Timer
  // Uses delta-time tracking with 250ms interval so that background re-renders or frame variances
  // never stall the clock or skip countdown ticks.
  const isClockRunning = session?.isClockRunning ?? false;
  const matchId = activeMatch?.id;
  const periodsCount = league.rulesConfig.periodsCount;

  // Keep latest refs to avoid tearing down the timer on every state update
  const isBuzzerMutedRef = useRef(isBuzzerMuted);
  useEffect(() => {
    isBuzzerMutedRef.current = isBuzzerMuted;
  }, [isBuzzerMuted]);

  const periodsCountRef = useRef(periodsCount);
  useEffect(() => {
    periodsCountRef.current = periodsCount;
  }, [periodsCount]);

  useEffect(() => {
    if (!matchId || !isClockRunning) return;

    let lastTickTime = Date.now();
    let accumulatedMs = 0;

    const timer = setInterval(() => {
      const now = Date.now();
      const deltaMs = now - lastTickTime;
      lastTickTime = now;
      accumulatedMs += deltaMs;

      // Only step seconds when at least 1000ms has elapsed
      if (accumulatedMs < 1000) return;

      const secondsToDeduct = Math.floor(accumulatedMs / 1000);
      accumulatedMs = accumulatedMs % 1000;

      const latest = useBoxScoreStore.getState().gameSessionsByMatchId[matchId];
      if (!latest || !latest.isClockRunning) return;

      if (latest.clockSecondsRemaining <= 0) {
        saveGameSession(matchId, {
          ...latest,
          isClockRunning: false,
          clockSecondsRemaining: 0,
          updatedAt: new Date().toISOString(),
        });
        playGameClockBuzzer(isBuzzerMutedRef.current);
        setHornAlertMessage(
          `END OF ${getPeriodLabel(
            latest.currentPeriod,
            periodsCountRef.current
          )} — GAME CLOCK BUZZER SOUNDED!`
        );
        return;
      }

      const nextGameClock = Math.max(0, latest.clockSecondsRemaining - secondsToDeduct);
      const nextShotClock = Math.max(0, latest.shotClockSeconds - secondsToDeduct);

      // Increment secondsPlayed and compute minutesPlayed for all on-court players
      const updatedHomeStats = { ...latest.homePlayerStats };
      for (const [id, stat] of Object.entries(updatedHomeStats)) {
        if (stat.isOnCourt) {
          const secs = (stat.secondsPlayed ?? 0) + secondsToDeduct;
          const mins = Math.floor(secs / 60);
          const remSecs = secs % 60;
          updatedHomeStats[id] = {
            ...stat,
            secondsPlayed: secs,
            minutesPlayed: `${mins}:${String(remSecs).padStart(2, "0")}`,
          };
        }
      }

      const updatedAwayStats = { ...latest.awayPlayerStats };
      for (const [id, stat] of Object.entries(updatedAwayStats)) {
        if (stat.isOnCourt) {
          const secs = (stat.secondsPlayed ?? 0) + secondsToDeduct;
          const mins = Math.floor(secs / 60);
          const remSecs = secs % 60;
          updatedAwayStats[id] = {
            ...stat,
            secondsPlayed: secs,
            minutesPlayed: `${mins}:${String(remSecs).padStart(2, "0")}`,
          };
        }
      }

      if (
        nextShotClock === 0 &&
        latest.shotClockSeconds > 0 &&
        nextGameClock > 0
      ) {
        saveGameSession(matchId, {
          ...latest,
          clockSecondsRemaining: nextGameClock,
          shotClockSeconds: 0,
          isClockRunning: false,
          homePlayerStats: updatedHomeStats,
          awayPlayerStats: updatedAwayStats,
          updatedAt: new Date().toISOString(),
        });
        playShotClockBuzzer(isBuzzerMutedRef.current);
        setHornAlertMessage(
          "24-SECOND SHOT CLOCK VIOLATION BUZZER! Clock paused — reset shot clock to continue."
        );
        return;
      }

      saveGameSession(matchId, {
        ...latest,
        clockSecondsRemaining: nextGameClock,
        shotClockSeconds: nextShotClock,
        isClockRunning: nextGameClock > 0,
        homePlayerStats: updatedHomeStats,
        awayPlayerStats: updatedAwayStats,
        updatedAt: new Date().toISOString(),
      });
    }, 250);

    return () => clearInterval(timer);
  }, [matchId, isClockRunning, saveGameSession]);

  // Live Timeout Countdown Timer (60s official timeout countdown)
  useEffect(() => {
    if (!activeTimeoutSide || timeoutSecondsRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeoutSecondsRemaining((prev) => {
        if (prev <= 1) {
          playTimeoutBuzzer(isBuzzerMuted);
          setHornAlertMessage(
            `OFFICIAL TIMEOUT EXPIRED — TIMEOUT BUZZER SOUNDED!`
          );
          setActiveTimeoutSide(null);
          return 0;
        }
        if (prev === 11) {
          playTimeoutWarningBeep(isBuzzerMuted);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeTimeoutSide, timeoutSecondsRemaining, isBuzzerMuted]);

  if (teams.length < 2) {
    return (
      <section className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
        <Shield className="mx-auto h-12 w-12 text-slate-400" />
        <h2 className="text-xl font-black uppercase text-slate-800">
          Add At Least 2 Teams to Open Live Game Management
        </h2>
        <p className="mx-auto max-w-md text-xs text-slate-500">
          Register at least two teams in {league.name} so you can manage live
          games, official scorebooks, game clocks, and referees.
        </p>
        <button
          type="button"
          onClick={() => onSwitchTab("teams")}
          className="inline-flex items-center gap-2 rounded-xl bg-[#8B0D0E] px-5 py-3 text-xs font-black uppercase tracking-wider text-white cursor-pointer"
        >
          <Users className="h-4 w-4" />
          Go to Teams Tab
        </button>
      </section>
    );
  }

  if (!activeMatch || !session) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3">
        <ClipboardList className="mx-auto h-10 w-10 text-[#0B2F5C]" />
        <h2 className="text-lg font-black uppercase text-slate-900">
          No Scheduled Games Found
        </h2>
        <button
          type="button"
          onClick={() => onSwitchTab("schedule")}
          className="rounded-xl bg-[#0B2F5C] px-4 py-2.5 text-xs font-black uppercase text-white cursor-pointer"
        >
          Go to Games Schedule
        </button>
      </section>
    );
  }

  const regPeriodsCount = Math.max(1, league.rulesConfig.periodsCount || 4);
  const periodIdx = Math.max(0, session.currentPeriod - 1);
  const currentPeriodLabel = getPeriodLabel(
    session.currentPeriod,
    regPeriodsCount
  );
  const shotClockDefault = league.rulesConfig.shotClockSeconds || 24;
  const orebResetSeconds =
    league.rulesConfig.offensiveReboundResetSeconds || 14;
  const bonusThreshold = league.rulesConfig.teamFoulBonusThreshold || 5;
  const personalFoulLimit = league.rulesConfig.personalFoulLimit || 5;

  const homeTeamName =
    homeTeam?.name || activeMatch.homeTeamPlaceholder || "Home Team";
  const awayTeamName =
    awayTeam?.name || activeMatch.awayTeamPlaceholder || "Away Team";
  const homeColor = homeTeam?.primaryColor || "#8B0D0E";
  const awayColor = awayTeam?.primaryColor || "#0B2F5C";

  const homePeriodFouls = session.homeTeamFoulsByPeriod[periodIdx] ?? 0;
  const awayPeriodFouls = session.awayTeamFoulsByPeriod[periodIdx] ?? 0;
  const homeInBonus = homePeriodFouls >= bonusThreshold;
  const awayInBonus = awayPeriodFouls >= bonusThreshold;

  const assignedReferees = leagueReferees.filter((r) =>
    session.assignedRefereeIds.includes(r.id)
  );

  const updateSession = (
    updater: (prev: LiveGameSession) => LiveGameSession
  ) => {
    const latest =
      useBoxScoreStore.getState().gameSessionsByMatchId[activeMatch.id] ??
      session;
    const next = updater(latest);
    saveGameSession(activeMatch.id, {
      ...next,
      updatedAt: new Date().toISOString(),
    });
  };

  // ===========================================================================
  // CLOCK & PERIOD HANDLERS
  // ===========================================================================
  const handleToggleClock = () => {
    if (!userCanClock) {
      alert("Permission Denied: Only Game Timers, Table Officials, or League Admins can control the game clock.");
      return;
    }
    setHornAlertMessage(null);
    updateSession((prev) => {
      const nextRunning = !prev.isClockRunning;
      if (nextRunning && activeMatch.status === "SCHEDULED") {
        updateMatchDetailsInLeague(league.id, activeMatch.id, {
          status: "LIVE",
        });
      }
      return {
        ...prev,
        isClockRunning: nextRunning,
      };
    });
  };

  const handleAdjustGameClock = (deltaSeconds: number) => {
    if (!userCanClock) {
      alert("Permission Denied: Only Game Timers, Table Officials, or League Admins can adjust the game clock.");
      return;
    }
    updateSession((prev) => ({
      ...prev,
      clockSecondsRemaining: Math.max(
        0,
        prev.clockSecondsRemaining + deltaSeconds
      ),
    }));
  };

  const handleResetPeriodClock = () => {
    if (!userCanClock) {
      alert("Permission Denied: Only Game Timers, Table Officials, or League Admins can reset the period clock.");
      return;
    }
    const isOvertime = session.currentPeriod > regPeriodsCount;
    const mins = isOvertime
      ? league.rulesConfig.overtimeLengthMinutes || 5
      : league.rulesConfig.periodLengthMinutes || 10;
    updateSession((prev) => ({
      ...prev,
      isClockRunning: false,
      clockSecondsRemaining: mins * 60,
      shotClockSeconds: shotClockDefault,
    }));
  };

  const handleApplyManualClock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCanClock) {
      alert("Permission Denied: Only Game Timers, Table Officials, or League Admins can edit the game clock.");
      return;
    }
    const mins = Math.max(0, Number(manualMinutesInput) || 0);
    const secs = Math.min(59, Math.max(0, Number(manualSecondsInput) || 0));
    updateSession((prev) => ({
      ...prev,
      clockSecondsRemaining: mins * 60 + secs,
    }));
    setIsEditingClock(false);
  };

  const handleResetShotClock = (seconds: number) => {
    if (!userCanShotClock) {
      alert("Permission Denied: Only Shot Clock Operators, Table Officials, or League Admins can operate the shot clock.");
      return;
    }
    setHornAlertMessage(null);
    updateSession((prev) => ({
      ...prev,
      shotClockSeconds: seconds,
    }));
  };

  const handleSelectPeriod = (nextPeriod: number) => {
    const isOvertime = nextPeriod > regPeriodsCount;
    const mins = isOvertime
      ? league.rulesConfig.overtimeLengthMinutes || 5
      : league.rulesConfig.periodLengthMinutes || 10;

    updateSession((prev) => {
      const nextQHome = [...prev.homeQuarterScores];
      const nextQAway = [...prev.awayQuarterScores];
      const nextFHome = [...prev.homeTeamFoulsByPeriod];
      const nextFAway = [...prev.awayTeamFoulsByPeriod];
      while (nextQHome.length < nextPeriod) nextQHome.push(0);
      while (nextQAway.length < nextPeriod) nextQAway.push(0);
      while (nextFHome.length < nextPeriod) nextFHome.push(0);
      while (nextFAway.length < nextPeriod) nextFAway.push(0);

      return {
        ...prev,
        currentPeriod: nextPeriod,
        isClockRunning: false,
        clockSecondsRemaining: mins * 60,
        shotClockSeconds: shotClockDefault,
        homeQuarterScores: nextQHome,
        awayQuarterScores: nextQAway,
        homeTeamFoulsByPeriod: nextFHome,
        awayTeamFoulsByPeriod: nextFAway,
      };
    });
  };

  const handleTogglePossessionArrow = () => {
    updateSession((prev) => {
      const nextArrow = prev.possessionArrow === "HOME" ? "AWAY" : "HOME";
      const event: ScorebookPlayEvent = {
        id: generateUUID(),
        matchId: activeMatch.id,
        period: prev.currentPeriod,
        periodLabel: getPeriodLabel(prev.currentPeriod, regPeriodsCount),
        gameClockDisplay: formatClock(prev.clockSecondsRemaining),
        teamSide: nextArrow,
        teamId:
          nextArrow === "HOME"
            ? homeTeam?.id || "home"
            : awayTeam?.id || "away",
        teamName: nextArrow === "HOME" ? homeTeamName : awayTeamName,
        actionType: "JUMP_BALL_ARROW",
        pointsDelta: 0,
        description: `Alternating Possession Arrow switched to ${
          nextArrow === "HOME" ? homeTeamName : awayTeamName
        }`,
        homeScoreAfter: prev.homeScore,
        awayScoreAfter: prev.awayScore,
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        possessionArrow: nextArrow,
        activeBallPossession: nextArrow,
        playEvents: [event, ...prev.playEvents],
      };
    });
  };

  const handleCallTimeout = (side: "HOME" | "AWAY") => {
    if (!userCanScore && !userCanClock) {
      alert("Permission Denied: Only Table Officials, Scorers, Timers, or League Admins can call timeouts.");
      return;
    }
    // Sound official Timeout Buzzer immediately
    playTimeoutBuzzer(isBuzzerMuted);
    setActiveTimeoutSide(side);
    setTimeoutSecondsRemaining(60);
    setHornAlertMessage(
      `📢 OFFICIAL TIMEOUT CHARGED TO ${
        side === "HOME" ? homeTeamName : awayTeamName
      } — TIMEOUT BUZZER SOUNDED! (60s Countdown Active)`
    );

    updateSession((prev) => {
      const rem =
        side === "HOME"
          ? prev.homeTimeoutsRemaining
          : prev.awayTimeoutsRemaining;
      if (rem <= 0) return prev;
      const tName = side === "HOME" ? homeTeamName : awayTeamName;
      const event: ScorebookPlayEvent = {
        id: generateUUID(),
        matchId: activeMatch.id,
        period: prev.currentPeriod,
        periodLabel: getPeriodLabel(prev.currentPeriod, regPeriodsCount),
        gameClockDisplay: formatClock(prev.clockSecondsRemaining),
        teamSide: side,
        teamId:
          side === "HOME" ? homeTeam?.id || "home" : awayTeam?.id || "away",
        teamName: tName,
        actionType: "TIMEOUT",
        pointsDelta: 0,
        description: `Official Timeout charged to ${tName} (${
          rem - 1
        } remaining)`,
        homeScoreAfter: prev.homeScore,
        awayScoreAfter: prev.awayScore,
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        isClockRunning: false,
        homeTimeoutsRemaining:
          side === "HOME" ? rem - 1 : prev.homeTimeoutsRemaining,
        awayTimeoutsRemaining:
          side === "AWAY" ? rem - 1 : prev.awayTimeoutsRemaining,
        playEvents: [event, ...prev.playEvents],
      };
    });
  };

  const handleManualSoundGameClockBuzzer = () => {
    playGameClockBuzzer(isBuzzerMuted);
    setHornAlertMessage("📢 GAME CLOCK ARENA HORN SOUNDED MANUALLY!");
  };

  const handleManualSoundTimeoutBuzzer = () => {
    playTimeoutBuzzer(isBuzzerMuted);
    setHornAlertMessage("📢 OFFICIAL TIMEOUT TABLE BUZZER SOUNDED MANUALLY!");
  };

  const handleCancelTimeoutCountdown = () => {
    setActiveTimeoutSide(null);
    setTimeoutSecondsRemaining(0);
  };

  // ===========================================================================
  // REFEREE MANAGEMENT HANDLERS
  // ===========================================================================
  const handleRefereePhotoSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    cb: (url: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 320, 0.84);
      cb(compressed);
    } catch {
      // Ignore
    } finally {
      e.target.value = "";
    }
  };

  const handleAddRefereeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refNameInput.trim()) return;
    const jerseyNum = Number(refNumberInput) || 24;
    const cleanName = refNameInput.trim();
    const newRef: LeagueReferee = {
      id: generateUUID(),
      leagueId: league.id,
      name: cleanName,
      role: refRoleInput,
      accreditation:
        refAccreditationInput.trim() || "FIBA / League Accredited Referee",
      jerseyNumber: jerseyNum,
      imageUrl:
        refImageInput ||
        generatePortraitAvatarDataUrl({
          name: cleanName,
          primaryColor: "#0f172a",
          secondaryColor: "#8B0D0E",
          badgeText: `#${jerseyNum}`,
          roleLabel: refRoleInput.toUpperCase().slice(0, 10),
        }),
    };

    addRefereeToLeague(league.id, newRef);
    updateSession((prev) => ({
      ...prev,
      assignedRefereeIds: prev.assignedRefereeIds.includes(newRef.id)
        ? prev.assignedRefereeIds
        : [...prev.assignedRefereeIds, newRef.id],
    }));

    setRefNameInput("");
    setRefImageInput("");
    setRefNumberInput(String(Math.floor(10 + Math.random() * 88)));
  };

  const handleRandomizeRefereeCrew = () => {
    const randomCrew = generateRandomRefereeCrew(league.id);
    setRefereesForLeague(league.id, randomCrew);
    updateSession((prev) => ({
      ...prev,
      assignedRefereeIds: randomCrew.map((r) => r.id),
    }));
    if (randomCrew[0]) {
      setSelectedCallingRefereeId(randomCrew[0].id);
    }
  };

  const handleToggleRefereeAssignment = (refId: string) => {
    updateSession((prev) => {
      const exists = prev.assignedRefereeIds.includes(refId);
      const nextAssigned = exists
        ? prev.assignedRefereeIds.filter((id) => id !== refId)
        : [...prev.assignedRefereeIds, refId];
      return {
        ...prev,
        assignedRefereeIds: nextAssigned,
      };
    });
  };

  // ===========================================================================
  // SUBSTITUTION HANDLER
  // ===========================================================================
  const handleSubstitutePlayer = (
    side: "HOME" | "AWAY",
    benchPlayerId: string
  ) => {
    if (!userCanScore) {
      alert("Permission Denied: Only Official Scorers, Table Officials, or League Admins can process player substitutions.");
      return;
    }
    updateSession((prev) => {
      const statsMap =
        side === "HOME"
          ? { ...prev.homePlayerStats }
          : { ...prev.awayPlayerStats };
      const benchPlayer = statsMap[benchPlayerId];
      if (!benchPlayer || benchPlayer.isOnCourt) return prev;

      const onCourtList = Object.values(statsMap).filter((p) => p.isOnCourt);
      let subOutTarget: PlayerGameStats | undefined;

      const preferredSubOutId = subOutTargetBySide[side];
      if (onCourtList.length >= 5) {
        subOutTarget =
          (preferredSubOutId
            ? onCourtList.find((p) => p.playerId === preferredSubOutId)
            : undefined) ?? onCourtList[0];
      }

      if (subOutTarget) {
        statsMap[subOutTarget.playerId] = {
          ...subOutTarget,
          isOnCourt: false,
        };
      }
      statsMap[benchPlayerId] = {
        ...benchPlayer,
        isOnCourt: true,
      };

      const tName = side === "HOME" ? homeTeamName : awayTeamName;
      const event: ScorebookPlayEvent = {
        id: generateUUID(),
        matchId: activeMatch.id,
        period: prev.currentPeriod,
        periodLabel: getPeriodLabel(prev.currentPeriod, regPeriodsCount),
        gameClockDisplay: formatClock(prev.clockSecondsRemaining),
        teamSide: side,
        teamId:
          side === "HOME" ? homeTeam?.id || "home" : awayTeam?.id || "away",
        teamName: tName,
        playerId: benchPlayer.playerId,
        playerName: `${benchPlayer.firstName} ${benchPlayer.lastName}`,
        playerJersey: benchPlayer.jerseyNumber,
        subOutPlayerId: subOutTarget?.playerId,
        subOutPlayerName: subOutTarget
          ? `${subOutTarget.firstName} ${subOutTarget.lastName}`
          : undefined,
        actionType: "SUBSTITUTION",
        pointsDelta: 0,
        description: subOutTarget
          ? `SUB ${tName}: #${benchPlayer.jerseyNumber} ${benchPlayer.lastName} IN for #${subOutTarget.jerseyNumber} ${subOutTarget.lastName}`
          : `SUB ${tName}: #${benchPlayer.jerseyNumber} ${benchPlayer.lastName} entered the court`,
        homeScoreAfter: prev.homeScore,
        awayScoreAfter: prev.awayScore,
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        homePlayerStats: side === "HOME" ? statsMap : prev.homePlayerStats,
        awayPlayerStats: side === "AWAY" ? statsMap : prev.awayPlayerStats,
        playEvents: [event, ...prev.playEvents],
      };
    });
  };

  // ===========================================================================
  // CORE ATOMIC STAT LOGGER + COMPLETE 6-FLOW STATE MACHINE
  // ===========================================================================
  const commitAtomicPlayerStat = (params: {
    side: "HOME" | "AWAY";
    playerId: string;
    actionType: ScorebookActionType;
    customDescription?: string;
    refereeId?: string;
    nextPossessionSide?: "HOME" | "AWAY";
    nextShotClock?: number;
  }): { eventId: string; newPeriodFouls: number } => {
    const {
      side,
      playerId,
      actionType,
      customDescription,
      refereeId,
      nextPossessionSide,
      nextShotClock,
    } = params;

    let createdEventId = generateUUID();
    let updatedTeamPeriodFouls = 0;

    if (!userCanScore) {
      alert("Permission Denied: Only Official Scorers, Table Officials, or League Admins can log game events and points into the scorebook.");
      return { eventId: "", newPeriodFouls: 0 };
    }

    const callingRef = leagueReferees.find(
      (r) => r.id === (refereeId ?? selectedCallingRefereeId)
    );

    updateSession((prev) => {
      const sideMap =
        side === "HOME"
          ? { ...prev.homePlayerStats }
          : { ...prev.awayPlayerStats };
      const target = sideMap[playerId];
      if (!target) return prev;

      const p = { ...target };
      let pointsDelta = 0;
      let shotType: "1PT" | "2PT" | "3PT" | null = null;
      let isTeamFoul = false;
      let resolvedShotClock = nextShotClock ?? prev.shotClockSeconds;
      const pLabel = `#${p.jerseyNumber} ${p.firstName} ${p.lastName}`;
      const tName = side === "HOME" ? homeTeamName : awayTeamName;
      let desc = customDescription || "";

      switch (actionType) {
        case "MADE_2PT":
          pointsDelta = 2;
          shotType = "2PT";
          p.points += 2;
          p.fgm += 1;
          p.fga += 1;
          resolvedShotClock = nextShotClock ?? shotClockDefault;
          if (!desc)
            desc = `${pLabel} (${tName}) made 2-PT Field Goal (+2 PTS)`;
          break;
        case "MISS_2PT":
          p.fga += 1;
          if (!desc) desc = `${pLabel} (${tName}) missed 2-PT Field Goal`;
          break;
        case "MADE_3PT":
          pointsDelta = 3;
          shotType = "3PT";
          p.points += 3;
          p.fgm += 1;
          p.fga += 1;
          p.tpm += 1;
          p.tpa += 1;
          resolvedShotClock = nextShotClock ?? shotClockDefault;
          if (!desc)
            desc = `${pLabel} (${tName}) buried 3-PT Field Goal (+3 PTS)`;
          break;
        case "MISS_3PT":
          p.fga += 1;
          p.tpa += 1;
          if (!desc) desc = `${pLabel} (${tName}) missed 3-PT Field Goal`;
          break;
        case "MADE_FT":
          pointsDelta = 1;
          shotType = "1PT";
          p.points += 1;
          p.ftm += 1;
          p.fta += 1;
          if (!desc) desc = `${pLabel} (${tName}) made Free Throw (+1 PT)`;
          break;
        case "MISS_FT":
          p.fta += 1;
          if (!desc) desc = `${pLabel} (${tName}) missed Free Throw`;
          break;
        case "OFF_REB":
          p.oreb += 1;
          resolvedShotClock = nextShotClock ?? orebResetSeconds;
          if (!desc)
            desc = `OFF REB (${resolvedShotClock}S): ${pLabel} (${tName}) grabbed Offensive Rebound — maintains possession`;
          break;
        case "DEF_REB":
          p.dreb += 1;
          resolvedShotClock = nextShotClock ?? shotClockDefault;
          if (!desc)
            desc = `DEF REB (${resolvedShotClock}S): ${pLabel} (${tName}) secured Defensive Rebound — possession flips to ${tName}`;
          break;
        case "ASSIST":
          p.ast += 1;
          if (!desc)
            desc = `ASSIST (AST): ${pLabel} (${tName}) dished assist (#${p.ast})`;
          break;
        case "STEAL":
          p.stl += 1;
          if (!desc)
            desc = `STEAL (STL): ${pLabel} (${tName}) stole the ball (#${p.stl})`;
          break;
        case "BLOCK":
          p.blk += 1;
          if (!desc)
            desc = `BLOCK (BLK): ${pLabel} (${tName}) blocked shot (#${p.blk})`;
          break;
        case "TURNOVER":
          p.tov += 1;
          resolvedShotClock = nextShotClock ?? shotClockDefault;
          if (!desc)
            desc = `TURNOVER (TO): ${pLabel} (${tName}) committed turnover (#${p.tov})`;
          break;
        case "PERSONAL_FOUL":
          p.pf += 1;
          isTeamFoul = true;
          if (!desc)
            desc = `PERSONAL FOUL (PF) on ${pLabel} (${tName}) [PF #${p.pf}]${
              callingRef
                ? ` • Called by ${callingRef.name} (${callingRef.role})`
                : ""
            }`;
          break;
        case "TECHNICAL_FOUL":
          p.pf += 1;
          p.techFouls += 1;
          isTeamFoul = true;
          if (!desc)
            desc = `TECHNICAL FOUL (TF) on ${pLabel} (${tName}) [TF #${p.techFouls} / PF #${p.pf}]${
              callingRef
                ? ` • Called by ${callingRef.name} (${callingRef.role})`
                : ""
            }`;
          break;
        case "UNSPORTSMANLIKE_FOUL":
          p.pf += 1;
          isTeamFoul = true;
          if (!desc)
            desc = `UNSPORTSMANLIKE FOUL (UF) on ${pLabel} (${tName}) [PF #${p.pf}]${
              callingRef
                ? ` • Called by ${callingRef.name} (${callingRef.role})`
                : ""
            }`;
          break;
        default:
          break;
      }

      sideMap[p.playerId] = p;

      const nextHomeScore =
        side === "HOME" ? prev.homeScore + pointsDelta : prev.homeScore;
      const nextAwayScore =
        side === "AWAY" ? prev.awayScore + pointsDelta : prev.awayScore;

      const pIdx = Math.max(0, prev.currentPeriod - 1);
      const nextHomeQuarters = [...prev.homeQuarterScores];
      const nextAwayQuarters = [...prev.awayQuarterScores];
      while (nextHomeQuarters.length <= pIdx) nextHomeQuarters.push(0);
      while (nextAwayQuarters.length <= pIdx) nextAwayQuarters.push(0);

      if (side === "HOME" && pointsDelta > 0) {
        nextHomeQuarters[pIdx] = (nextHomeQuarters[pIdx] ?? 0) + pointsDelta;
      }
      if (side === "AWAY" && pointsDelta > 0) {
        nextAwayQuarters[pIdx] = (nextAwayQuarters[pIdx] ?? 0) + pointsDelta;
      }

      const nextHomeFouls = [...prev.homeTeamFoulsByPeriod];
      const nextAwayFouls = [...prev.awayTeamFoulsByPeriod];
      while (nextHomeFouls.length <= pIdx) nextHomeFouls.push(0);
      while (nextAwayFouls.length <= pIdx) nextAwayFouls.push(0);

      if (isTeamFoul) {
        if (side === "HOME") {
          nextHomeFouls[pIdx] = (nextHomeFouls[pIdx] ?? 0) + 1;
          updatedTeamPeriodFouls = nextHomeFouls[pIdx];
        } else {
          nextAwayFouls[pIdx] = (nextAwayFouls[pIdx] ?? 0) + 1;
          updatedTeamPeriodFouls = nextAwayFouls[pIdx];
        }
      } else {
        updatedTeamPeriodFouls =
          side === "HOME"
            ? nextHomeFouls[pIdx] ?? 0
            : nextAwayFouls[pIdx] ?? 0;
      }

      const nextHomeRunning = { ...prev.homeRunningScore };
      const nextAwayRunning = { ...prev.awayRunningScore };
      if (pointsDelta > 0 && shotType) {
        if (side === "HOME") {
          nextHomeRunning[nextHomeScore] = {
            pointNumber: nextHomeScore,
            period: prev.currentPeriod,
            jerseyNumber: p.jerseyNumber,
            shotType,
          };
        } else {
          nextAwayRunning[nextAwayScore] = {
            pointNumber: nextAwayScore,
            period: prev.currentPeriod,
            jerseyNumber: p.jerseyNumber,
            shotType,
          };
        }
      }

      const newEvent: ScorebookPlayEvent = {
        id: createdEventId,
        matchId: activeMatch.id,
        period: prev.currentPeriod,
        periodLabel: getPeriodLabel(prev.currentPeriod, regPeriodsCount),
        gameClockDisplay: formatClock(prev.clockSecondsRemaining),
        teamSide: side,
        teamId:
          side === "HOME" ? homeTeam?.id || "home" : awayTeam?.id || "away",
        teamName: tName,
        playerId: p.playerId,
        playerName: `${p.firstName} ${p.lastName}`,
        playerJersey: p.jerseyNumber,
        actionType,
        pointsDelta,
        description: desc,
        refereeId: isTeamFoul ? callingRef?.id : undefined,
        refereeName: isTeamFoul ? callingRef?.name : undefined,
        homeScoreAfter: nextHomeScore,
        awayScoreAfter: nextAwayScore,
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        shotClockSeconds: resolvedShotClock,
        activeBallPossession:
          nextPossessionSide ?? prev.activeBallPossession ?? side,
        homeScore: nextHomeScore,
        awayScore: nextAwayScore,
        homeQuarterScores: nextHomeQuarters,
        awayQuarterScores: nextAwayQuarters,
        homeTeamFoulsByPeriod: nextHomeFouls,
        awayTeamFoulsByPeriod: nextAwayFouls,
        homePlayerStats: side === "HOME" ? sideMap : prev.homePlayerStats,
        awayPlayerStats: side === "AWAY" ? sideMap : prev.awayPlayerStats,
        homeRunningScore: nextHomeRunning,
        awayRunningScore: nextAwayRunning,
        playEvents: [newEvent, ...prev.playEvents],
      };
    });

    return { eventId: createdEventId, newPeriodFouls: updatedTeamPeriodFouls };
  };

  const appendTeamPlayLog = (params: {
    side: "HOME" | "AWAY";
    actionType: ScorebookActionType;
    description: string;
    refereeId?: string;
    nextPossessionSide?: "HOME" | "AWAY";
    nextShotClock?: number;
  }): string => {
    const createdEventId = generateUUID();
    const callingRef = leagueReferees.find(
      (r) => r.id === (params.refereeId ?? selectedCallingRefereeId)
    );
    updateSession((prev) => {
      const tName = params.side === "HOME" ? homeTeamName : awayTeamName;
      const newEvent: ScorebookPlayEvent = {
        id: createdEventId,
        matchId: activeMatch.id,
        period: prev.currentPeriod,
        periodLabel: getPeriodLabel(prev.currentPeriod, regPeriodsCount),
        gameClockDisplay: formatClock(prev.clockSecondsRemaining),
        teamSide: params.side,
        teamId:
          params.side === "HOME"
            ? homeTeam?.id || "home"
            : awayTeam?.id || "away",
        teamName: tName,
        actionType: params.actionType,
        pointsDelta: 0,
        description: params.description,
        refereeId: callingRef?.id,
        refereeName: callingRef?.name,
        homeScoreAfter: prev.homeScore,
        awayScoreAfter: prev.awayScore,
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        activeBallPossession:
          params.nextPossessionSide ?? prev.activeBallPossession,
        shotClockSeconds: params.nextShotClock ?? prev.shotClockSeconds,
        playEvents: [newEvent, ...prev.playEvents],
      };
    });
    return createdEventId;
  };

  const handleChangeDefaultRefereeInModal = (
    refereeId: string,
    eventId?: string
  ) => {
    setSelectedCallingRefereeId(refereeId);
    if (!eventId) return;
    const callingRef = leagueReferees.find((r) => r.id === refereeId);
    updateSession((prev) => ({
      ...prev,
      playEvents: prev.playEvents.map((ev) => {
        if (ev.id !== eventId) return ev;
        const baseDesc = ev.description.replace(/\s*•\s*Called by .*$/, "");
        return {
          ...ev,
          refereeId: callingRef?.id,
          refereeName: callingRef?.name,
          description: callingRef
            ? `${baseDesc} • Called by ${callingRef.name} (${callingRef.role})`
            : baseDesc,
        };
      }),
    }));
  };

  // Entry point when a scorekeeper taps any button on a player's on-court card
  const handleTriggerPlayerCardAction = (
    side: "HOME" | "AWAY",
    player: PlayerGameStats,
    actionType: ScorebookActionType,
    refereeId?: string
  ) => {
    const oppositeSide: "HOME" | "AWAY" = side === "HOME" ? "AWAY" : "HOME";

    // 1. Made Shot Flow (+2 PTS MADE / +3 PTS MADE)
    if (actionType === "MADE_2PT" || actionType === "MADE_3PT") {
      const shotPoints: 2 | 3 = actionType === "MADE_3PT" ? 3 : 2;
      commitAtomicPlayerStat({
        side,
        playerId: player.playerId,
        actionType,
        nextPossessionSide: side,
      });
      setActivePlayFlow({
        kind: "MADE_SHOT_ASSIST",
        offenseSide: side,
        scorer: player,
        shotPoints,
      });
      return;
    }

    // 2. Missed Shot Flow (2PT MISS / 3PT MISS)
    if (actionType === "MISS_2PT" || actionType === "MISS_3PT") {
      const shotPoints: 2 | 3 = actionType === "MISS_3PT" ? 3 : 2;
      commitAtomicPlayerStat({
        side,
        playerId: player.playerId,
        actionType,
      });
      setActivePlayFlow({
        kind: "MISSED_SHOT_BLOCK_CHECK",
        offenseSide: side,
        shooter: player,
        shotPoints,
      });
      return;
    }

    // 3. Rebound Flow (Direct Action: DEF REB 24S or OFF REB 14S)
    if (actionType === "DEF_REB") {
      commitAtomicPlayerStat({
        side,
        playerId: player.playerId,
        actionType: "DEF_REB",
        nextPossessionSide: side,
        nextShotClock: shotClockDefault,
      });
      setActivePlayFlow(null);
      return;
    }
    if (actionType === "OFF_REB") {
      commitAtomicPlayerStat({
        side,
        playerId: player.playerId,
        actionType: "OFF_REB",
        nextPossessionSide: side,
        nextShotClock: orebResetSeconds,
      });
      setActivePlayFlow(null);
      return;
    }

    // 4A. Live-Ball Steal First (STEAL) -> prompts "Turnover by?"
    if (actionType === "STEAL") {
      commitAtomicPlayerStat({
        side,
        playerId: player.playerId,
        actionType: "STEAL",
        nextPossessionSide: side,
        nextShotClock: shotClockDefault,
      });
      setActivePlayFlow({
        kind: "STEAL_TURNOVER_BY",
        stealerSide: side,
        stealer: player,
      });
      return;
    }

    // 4B. Unforced / Dead-Ball Turnover First (TURNOVER) -> flips possession + optional Quick Tag
    if (actionType === "TURNOVER") {
      const oppositeTeamName =
        oppositeSide === "HOME" ? homeTeamName : awayTeamName;
      const { eventId } = commitAtomicPlayerStat({
        side,
        playerId: player.playerId,
        actionType: "TURNOVER",
        customDescription: `TURNOVER (TO) by #${player.jerseyNumber} ${player.firstName} ${player.lastName} — Possession flips to ${oppositeTeamName} for inbound pass`,
        nextPossessionSide: oppositeSide,
        nextShotClock: shotClockDefault,
      });
      setActivePlayFlow({
        kind: "TURNOVER_TAG",
        offenseSide: side,
        player,
        eventId,
      });
      return;
    }

    // 5. Foul Flows (Non-Shooting / Defense First: PERSONAL FOUL or UNSPORTSMANLIKE FOUL)
    if (
      actionType === "PERSONAL_FOUL" ||
      actionType === "UNSPORTSMANLIKE_FOUL"
    ) {
      const { eventId, newPeriodFouls } = commitAtomicPlayerStat({
        side,
        playerId: player.playerId,
        actionType,
        refereeId,
      });

      const inPenalty =
        newPeriodFouls >= bonusThreshold ||
        actionType === "UNSPORTSMANLIKE_FOUL";

      if (inPenalty) {
        setActivePlayFlow({
          kind: "BONUS_SELECT_SHOOTER",
          foulSide: side,
          offenseSide: oppositeSide,
          fouler: player,
          foulType: actionType,
          totalFreeThrows: 2,
          eventId,
        });
      } else {
        setActivePlayFlow({
          kind: "FOUL_UNDER_BONUS",
          foulSide: side,
          fouler: player,
          foulType: actionType,
          eventId,
        });
      }
      return;
    }

    // 6. Technical Foul Flow (TECHNICAL FOUL)
    if (actionType === "TECHNICAL_FOUL") {
      const { eventId } = commitAtomicPlayerStat({
        side,
        playerId: player.playerId,
        actionType: "TECHNICAL_FOUL",
        refereeId,
      });
      setActivePlayFlow({
        kind: "TECHNICAL_SELECT_SHOOTER",
        penalizedSide: side,
        shootingSide: oppositeSide,
        penalizedLabel: `#${player.jerseyNumber} ${player.firstName} ${player.lastName}`,
        eventId,
      });
      return;
    }

    // Direct +1 FT MADE / FT MISS / ASSIST / BLOCK
    commitAtomicPlayerStat({
      side,
      playerId: player.playerId,
      actionType,
      refereeId,
    });
  };

  // Coach / Bench Technical Foul Handler (Flow 6)
  const handleCoachOrBenchTechnical = (side: "HOME" | "AWAY") => {
    const oppositeSide: "HOME" | "AWAY" = side === "HOME" ? "AWAY" : "HOME";
    const tName = side === "HOME" ? homeTeamName : awayTeamName;
    const coachLabel =
      side === "HOME"
        ? homeTeam?.headCoach || `${homeTeamName} Bench`
        : awayTeam?.headCoach || `${awayTeamName} Bench`;
    const callingRef = leagueReferees.find(
      (r) => r.id === selectedCallingRefereeId
    );

    const eventId = appendTeamPlayLog({
      side,
      actionType: "TECHNICAL_FOUL",
      refereeId: selectedCallingRefereeId,
      description: `TECHNICAL FOUL (TF) on ${coachLabel} (${tName})${
        callingRef ? ` • Called by ${callingRef.name} (${callingRef.role})` : ""
      }`,
    });

    setActivePlayFlow({
      kind: "TECHNICAL_SELECT_SHOOTER",
      penalizedSide: side,
      shootingSide: oppositeSide,
      penalizedLabel: `${coachLabel} (${tName})`,
      eventId,
    });
  };

  // ===========================================================================
  // STATE-MACHINE WIZARD STEP HANDLERS
  // ===========================================================================
  const handleSelectAssistTeammate = (teammate: PlayerGameStats | null) => {
    if (!activePlayFlow || activePlayFlow.kind !== "MADE_SHOT_ASSIST") return;
    if (teammate) {
      commitAtomicPlayerStat({
        side: activePlayFlow.offenseSide,
        playerId: teammate.playerId,
        actionType: "ASSIST",
        customDescription: `ASSIST (AST) by #${teammate.jerseyNumber} ${teammate.firstName} ${teammate.lastName} on #${activePlayFlow.scorer.jerseyNumber} ${activePlayFlow.scorer.lastName}'s +${activePlayFlow.shotPoints}PT basket`,
      });
    }
    setActivePlayFlow({
      kind: "MADE_SHOT_AND1_CHECK",
      offenseSide: activePlayFlow.offenseSide,
      scorer: activePlayFlow.scorer,
      shotPoints: activePlayFlow.shotPoints,
      assistedBy: teammate,
    });
  };

  const handleResolveAnd1Prompt = (hasFoulOnPlay: boolean) => {
    if (!activePlayFlow || activePlayFlow.kind !== "MADE_SHOT_AND1_CHECK")
      return;
    const defenseSide: "HOME" | "AWAY" =
      activePlayFlow.offenseSide === "HOME" ? "AWAY" : "HOME";
    const defenseName = defenseSide === "HOME" ? homeTeamName : awayTeamName;

    if (!hasFoulOnPlay) {
      appendTeamPlayLog({
        side: defenseSide,
        actionType: "POSSESSION_CHANGE",
        description: `End of basket play — Possession flips to ${defenseName} (${shotClockDefault}s shot clock)`,
        nextPossessionSide: defenseSide,
        nextShotClock: shotClockDefault,
      });
      setActivePlayFlow(null);
      return;
    }

    setActivePlayFlow({
      kind: "AND1_DEFENDER_SELECT",
      offenseSide: activePlayFlow.offenseSide,
      scorer: activePlayFlow.scorer,
      foulType: "PERSONAL_FOUL",
      refereeId: selectedCallingRefereeId,
    });
  };

  const handleSelectAnd1Defender = (
    defender: PlayerGameStats,
    foulType: "PERSONAL_FOUL" | "UNSPORTSMANLIKE_FOUL",
    refereeId: string
  ) => {
    if (!activePlayFlow || activePlayFlow.kind !== "AND1_DEFENDER_SELECT")
      return;
    const defenseSide: "HOME" | "AWAY" =
      activePlayFlow.offenseSide === "HOME" ? "AWAY" : "HOME";

    commitAtomicPlayerStat({
      side: defenseSide,
      playerId: defender.playerId,
      actionType: foulType,
      refereeId,
      customDescription: `AND-1 ${
        foulType === "UNSPORTSMANLIKE_FOUL" ? "UNSPORTSMANLIKE" : "SHOOTING"
      } FOUL on #${defender.jerseyNumber} ${defender.firstName} ${
        defender.lastName
      } — 1 Free Throw for #${activePlayFlow.scorer.jerseyNumber} ${
        activePlayFlow.scorer.lastName
      }`,
    });

    setActivePlayFlow({
      kind: "AND1_FREE_THROW",
      offenseSide: activePlayFlow.offenseSide,
      scorer: activePlayFlow.scorer,
      foulType,
    });
  };

  const handleResolveAnd1FreeThrow = (made: boolean) => {
    if (!activePlayFlow || activePlayFlow.kind !== "AND1_FREE_THROW") return;
    const defenseSide: "HOME" | "AWAY" =
      activePlayFlow.offenseSide === "HOME" ? "AWAY" : "HOME";
    const defenseName = defenseSide === "HOME" ? homeTeamName : awayTeamName;

    if (made) {
      commitAtomicPlayerStat({
        side: activePlayFlow.offenseSide,
        playerId: activePlayFlow.scorer.playerId,
        actionType: "MADE_FT",
        customDescription: `AND-1 FREE THROW MADE (+1 PT) by #${activePlayFlow.scorer.jerseyNumber} ${activePlayFlow.scorer.firstName} ${activePlayFlow.scorer.lastName} — ${defenseName} inbounds`,
        nextPossessionSide: defenseSide,
        nextShotClock: shotClockDefault,
      });
      setActivePlayFlow(null);
    } else {
      commitAtomicPlayerStat({
        side: activePlayFlow.offenseSide,
        playerId: activePlayFlow.scorer.playerId,
        actionType: "MISS_FT",
        customDescription: `AND-1 FREE THROW MISSED by #${activePlayFlow.scorer.jerseyNumber} ${activePlayFlow.scorer.firstName} ${activePlayFlow.scorer.lastName}`,
      });
      setActivePlayFlow({
        kind: "REBOUND_RESOLUTION",
        offenseSide: activePlayFlow.offenseSide,
        reasonLabel: `Missed And-1 Free Throw by #${activePlayFlow.scorer.jerseyNumber} ${activePlayFlow.scorer.lastName}`,
      });
    }
  };

  const handleSelectShotBlocker = (blocker: PlayerGameStats | null) => {
    if (!activePlayFlow || activePlayFlow.kind !== "MISSED_SHOT_BLOCK_CHECK")
      return;
    const defenseSide: "HOME" | "AWAY" =
      activePlayFlow.offenseSide === "HOME" ? "AWAY" : "HOME";

    if (blocker) {
      commitAtomicPlayerStat({
        side: defenseSide,
        playerId: blocker.playerId,
        actionType: "BLOCK",
        customDescription: `BLOCK (BLK) by #${blocker.jerseyNumber} ${blocker.firstName} ${blocker.lastName} on #${activePlayFlow.shooter.jerseyNumber} ${activePlayFlow.shooter.lastName}'s ${activePlayFlow.shotPoints}PT attempt`,
      });
    }

    setActivePlayFlow({
      kind: "REBOUND_RESOLUTION",
      offenseSide: activePlayFlow.offenseSide,
      reasonLabel: `Missed ${activePlayFlow.shotPoints}PT Shot by #${activePlayFlow.shooter.jerseyNumber} ${activePlayFlow.shooter.lastName}`,
    });
  };

  const handleResolveRebound = (
    choice:
      | {
          type: "PLAYER_REB";
          side: "HOME" | "AWAY";
          player: PlayerGameStats;
          rebType: "OFF_REB" | "DEF_REB";
        }
      | {
          type: "TEAM_OUT_OF_BOUNDS";
          possessionToSide: "HOME" | "AWAY";
          resetClockTo: number;
          note: string;
        }
  ) => {
    if (choice.type === "PLAYER_REB") {
      commitAtomicPlayerStat({
        side: choice.side,
        playerId: choice.player.playerId,
        actionType: choice.rebType,
        nextPossessionSide: choice.side,
        nextShotClock:
          choice.rebType === "OFF_REB" ? orebResetSeconds : shotClockDefault,
      });
    } else {
      appendTeamPlayLog({
        side: choice.possessionToSide,
        actionType: "TEAM_REBOUND",
        description: choice.note,
        nextPossessionSide: choice.possessionToSide,
        nextShotClock: choice.resetClockTo,
      });
    }
    setActivePlayFlow(null);
  };

  const handleSelectTurnoverVictimFromSteal = (
    offensivePlayer: PlayerGameStats | null
  ) => {
    if (!activePlayFlow || activePlayFlow.kind !== "STEAL_TURNOVER_BY") return;
    const offenseSide: "HOME" | "AWAY" =
      activePlayFlow.stealerSide === "HOME" ? "AWAY" : "HOME";
    const stealingTeamName =
      activePlayFlow.stealerSide === "HOME" ? homeTeamName : awayTeamName;

    if (offensivePlayer) {
      commitAtomicPlayerStat({
        side: offenseSide,
        playerId: offensivePlayer.playerId,
        actionType: "TURNOVER",
        customDescription: `TURNOVER (TO) by #${offensivePlayer.jerseyNumber} ${offensivePlayer.firstName} ${offensivePlayer.lastName} (stolen by #${activePlayFlow.stealer.jerseyNumber} ${activePlayFlow.stealer.lastName}) — Possession flips to ${stealingTeamName}`,
        nextPossessionSide: activePlayFlow.stealerSide,
        nextShotClock: shotClockDefault,
      });
    }
    setActivePlayFlow(null);
  };

  const handleSelectTurnoverReasonTag = (tag: string | null) => {
    if (!activePlayFlow || activePlayFlow.kind !== "TURNOVER_TAG") return;
    if (tag) {
      updateSession((prev) => ({
        ...prev,
        playEvents: prev.playEvents.map((ev) =>
          ev.id === activePlayFlow.eventId
            ? {
                ...ev,
                description: `${ev.description} [${tag}]`,
              }
            : ev
        ),
      }));
    }
    setActivePlayFlow(null);
  };

  const handleResolveUnderBonusFoul = (
    resolution:
      | { type: "INBOUND_HOLD_CLOCK" }
      | { type: "INBOUND_RESET_14S" }
      | { type: "SHOOTING_FOUL_2FT" }
      | { type: "SHOOTING_FOUL_3FT" }
  ) => {
    if (!activePlayFlow || activePlayFlow.kind !== "FOUL_UNDER_BONUS") return;
    const offenseSide: "HOME" | "AWAY" =
      activePlayFlow.foulSide === "HOME" ? "AWAY" : "HOME";
    const offenseName = offenseSide === "HOME" ? homeTeamName : awayTeamName;

    if (resolution.type === "INBOUND_HOLD_CLOCK") {
      appendTeamPlayLog({
        side: offenseSide,
        actionType: "POSSESSION_CHANGE",
        description: `Non-Shooting Foul (Under Bonus) — ${offenseName} inbounds ball (shot clock holds)`,
        nextPossessionSide: offenseSide,
      });
      setActivePlayFlow(null);
      return;
    }

    if (resolution.type === "INBOUND_RESET_14S") {
      appendTeamPlayLog({
        side: offenseSide,
        actionType: "POSSESSION_CHANGE",
        description: `Non-Shooting Frontcourt Foul — ${offenseName} inbounds ball (shot clock reset to ${orebResetSeconds}s)`,
        nextPossessionSide: offenseSide,
        nextShotClock: orebResetSeconds,
      });
      setActivePlayFlow(null);
      return;
    }

    setActivePlayFlow({
      kind: "BONUS_SELECT_SHOOTER",
      foulSide: activePlayFlow.foulSide,
      offenseSide,
      fouler: activePlayFlow.fouler,
      foulType: activePlayFlow.foulType,
      totalFreeThrows: resolution.type === "SHOOTING_FOUL_3FT" ? 3 : 2,
    });
  };

  const handleSelectBonusFtShooter = (shooter: PlayerGameStats) => {
    if (!activePlayFlow || activePlayFlow.kind !== "BONUS_SELECT_SHOOTER")
      return;
    setActivePlayFlow({
      kind: "BONUS_FREE_THROW_SHOT",
      offenseSide: activePlayFlow.offenseSide,
      shooter,
      currentFtNumber: 1,
      totalFreeThrows: activePlayFlow.totalFreeThrows,
      foulType: activePlayFlow.foulType,
    });
  };

  const handleResolveBonusFtAttempt = (made: boolean) => {
    if (!activePlayFlow || activePlayFlow.kind !== "BONUS_FREE_THROW_SHOT")
      return;
    const {
      offenseSide,
      shooter,
      currentFtNumber,
      totalFreeThrows,
      foulType,
    } = activePlayFlow;
    const defenseSide: "HOME" | "AWAY" =
      offenseSide === "HOME" ? "AWAY" : "HOME";
    const defenseName = defenseSide === "HOME" ? homeTeamName : awayTeamName;
    const offenseName = offenseSide === "HOME" ? homeTeamName : awayTeamName;

    commitAtomicPlayerStat({
      side: offenseSide,
      playerId: shooter.playerId,
      actionType: made ? "MADE_FT" : "MISS_FT",
      customDescription: `FT ${currentFtNumber} of ${totalFreeThrows}: #${
        shooter.jerseyNumber
      } ${shooter.firstName} ${shooter.lastName} ${
        made ? "MADE Free Throw (+1 PT)" : "MISSED Free Throw"
      }`,
    });

    if (currentFtNumber < totalFreeThrows) {
      setActivePlayFlow({
        ...activePlayFlow,
        currentFtNumber: (currentFtNumber + 1) as 2 | 3,
      });
      return;
    }

    // Final FT of the sequence
    if (foulType === "UNSPORTSMANLIKE_FOUL") {
      appendTeamPlayLog({
        side: offenseSide,
        actionType: "POSSESSION_CHANGE",
        description: `Unsportsmanlike Penalty Complete — ${offenseName} retains frontcourtthrow-in (${orebResetSeconds}s shot clock)`,
        nextPossessionSide: offenseSide,
        nextShotClock: orebResetSeconds,
      });
      setActivePlayFlow(null);
      return;
    }

    if (made) {
      appendTeamPlayLog({
        side: defenseSide,
        actionType: "POSSESSION_CHANGE",
        description: `Final Free Throw Made — ${defenseName} inbounds ball (${shotClockDefault}s shot clock)`,
        nextPossessionSide: defenseSide,
        nextShotClock: shotClockDefault,
      });
      setActivePlayFlow(null);
    } else {
      setActivePlayFlow({
        kind: "REBOUND_RESOLUTION",
        offenseSide,
        reasonLabel: `Missed Final Free Throw (FT ${currentFtNumber} of ${totalFreeThrows}) by #${shooter.jerseyNumber} ${shooter.lastName}`,
      });
    }
  };

  const handleSelectTechnicalFtShooter = (shooter: PlayerGameStats) => {
    if (!activePlayFlow || activePlayFlow.kind !== "TECHNICAL_SELECT_SHOOTER")
      return;
    setActivePlayFlow({
      kind: "TECHNICAL_FREE_THROW_SHOT",
      shootingSide: activePlayFlow.shootingSide,
      shooter,
    });
  };

  const handleResolveTechnicalFtAttempt = (made: boolean) => {
    if (!activePlayFlow || activePlayFlow.kind !== "TECHNICAL_FREE_THROW_SHOT")
      return;
    const { shootingSide, shooter } = activePlayFlow;
    commitAtomicPlayerStat({
      side: shootingSide,
      playerId: shooter.playerId,
      actionType: made ? "MADE_FT" : "MISS_FT",
      customDescription: `TECHNICAL FREE THROW ${
        made ? "MADE (+1 PT)" : "MISSED"
      } by #${shooter.jerseyNumber} ${shooter.firstName} ${
        shooter.lastName
      } — Play resumes from Point of Interruption`,
    });
    setActivePlayFlow(null);
  };

  // ===========================================================================
  // UNDO LAST PLAY HANDLER
  // ===========================================================================
  const handleUndoLastPlay = () => {
    if (session.playEvents.length === 0) return;
    setActivePlayFlow(null);

    updateSession((prev) => {
      const [lastEvent, ...remainingEvents] = prev.playEvents;
      if (!lastEvent) return prev;

      const side = lastEvent.teamSide;
      const sideMap =
        side === "HOME"
          ? { ...prev.homePlayerStats }
          : { ...prev.awayPlayerStats };

      if (lastEvent.playerId && sideMap[lastEvent.playerId]) {
        const p = { ...sideMap[lastEvent.playerId] };
        switch (lastEvent.actionType) {
          case "MADE_2PT":
            p.points = Math.max(0, p.points - 2);
            p.fgm = Math.max(0, p.fgm - 1);
            p.fga = Math.max(0, p.fga - 1);
            break;
          case "MISS_2PT":
            p.fga = Math.max(0, p.fga - 1);
            break;
          case "MADE_3PT":
            p.points = Math.max(0, p.points - 3);
            p.fgm = Math.max(0, p.fgm - 1);
            p.fga = Math.max(0, p.fga - 1);
            p.tpm = Math.max(0, p.tpm - 1);
            p.tpa = Math.max(0, p.tpa - 1);
            break;
          case "MISS_3PT":
            p.fga = Math.max(0, p.fga - 1);
            p.tpa = Math.max(0, p.tpa - 1);
            break;
          case "MADE_FT":
            p.points = Math.max(0, p.points - 1);
            p.ftm = Math.max(0, p.ftm - 1);
            p.fta = Math.max(0, p.fta - 1);
            break;
          case "MISS_FT":
            p.fta = Math.max(0, p.fta - 1);
            break;
          case "OFF_REB":
            p.oreb = Math.max(0, p.oreb - 1);
            break;
          case "DEF_REB":
            p.dreb = Math.max(0, p.dreb - 1);
            break;
          case "ASSIST":
            p.ast = Math.max(0, p.ast - 1);
            break;
          case "STEAL":
            p.stl = Math.max(0, p.stl - 1);
            break;
          case "BLOCK":
            p.blk = Math.max(0, p.blk - 1);
            break;
          case "TURNOVER":
            p.tov = Math.max(0, p.tov - 1);
            break;
          case "PERSONAL_FOUL":
          case "UNSPORTSMANLIKE_FOUL":
            p.pf = Math.max(0, p.pf - 1);
            break;
          case "TECHNICAL_FOUL":
            p.pf = Math.max(0, p.pf - 1);
            p.techFouls = Math.max(0, p.techFouls - 1);
            break;
          case "SUBSTITUTION":
            p.isOnCourt = false;
            if (lastEvent.subOutPlayerId && sideMap[lastEvent.subOutPlayerId]) {
              sideMap[lastEvent.subOutPlayerId] = {
                ...sideMap[lastEvent.subOutPlayerId],
                isOnCourt: true,
              };
            }
            break;
          default:
            break;
        }
        sideMap[lastEvent.playerId] = p;
      }

      const pIdx = Math.max(0, lastEvent.period - 1);
      const nextHomeQuarters = [...prev.homeQuarterScores];
      const nextAwayQuarters = [...prev.awayQuarterScores];
      const nextHomeFouls = [...prev.homeTeamFoulsByPeriod];
      const nextAwayFouls = [...prev.awayTeamFoulsByPeriod];
      const nextHomeRunning = { ...prev.homeRunningScore };
      const nextAwayRunning = { ...prev.awayRunningScore };

      let nextHomeScore = prev.homeScore;
      let nextAwayScore = prev.awayScore;

      if (lastEvent.pointsDelta > 0) {
        if (side === "HOME") {
          delete nextHomeRunning[prev.homeScore];
          nextHomeScore = Math.max(0, prev.homeScore - lastEvent.pointsDelta);
          nextHomeQuarters[pIdx] = Math.max(
            0,
            (nextHomeQuarters[pIdx] ?? 0) - lastEvent.pointsDelta
          );
        } else {
          delete nextAwayRunning[prev.awayScore];
          nextAwayScore = Math.max(0, prev.awayScore - lastEvent.pointsDelta);
          nextAwayQuarters[pIdx] = Math.max(
            0,
            (nextAwayQuarters[pIdx] ?? 0) - lastEvent.pointsDelta
          );
        }
      }

      if (
        (lastEvent.actionType === "PERSONAL_FOUL" ||
          lastEvent.actionType === "TECHNICAL_FOUL" ||
          lastEvent.actionType === "UNSPORTSMANLIKE_FOUL") &&
        lastEvent.playerId
      ) {
        if (side === "HOME") {
          nextHomeFouls[pIdx] = Math.max(0, (nextHomeFouls[pIdx] ?? 0) - 1);
        } else {
          nextAwayFouls[pIdx] = Math.max(0, (nextAwayFouls[pIdx] ?? 0) - 1);
        }
      }

      return {
        ...prev,
        homeScore: nextHomeScore,
        awayScore: nextAwayScore,
        homeQuarterScores: nextHomeQuarters,
        awayQuarterScores: nextAwayQuarters,
        homeTeamFoulsByPeriod: nextHomeFouls,
        awayTeamFoulsByPeriod: nextAwayFouls,
        homeTimeoutsRemaining:
          lastEvent.actionType === "TIMEOUT" && side === "HOME"
            ? prev.homeTimeoutsRemaining + 1
            : prev.homeTimeoutsRemaining,
        awayTimeoutsRemaining:
          lastEvent.actionType === "TIMEOUT" && side === "AWAY"
            ? prev.awayTimeoutsRemaining + 1
            : prev.awayTimeoutsRemaining,
        possessionArrow:
          lastEvent.actionType === "JUMP_BALL_ARROW"
            ? prev.possessionArrow === "HOME"
              ? "AWAY"
              : "HOME"
            : prev.possessionArrow,
        homePlayerStats: side === "HOME" ? sideMap : prev.homePlayerStats,
        awayPlayerStats: side === "AWAY" ? sideMap : prev.awayPlayerStats,
        homeRunningScore: nextHomeRunning,
        awayRunningScore: nextAwayRunning,
        playEvents: remainingEvents,
      };
    });
  };

  const handleSaveLiveGameToCloud = async () => {
    setIsSavingLiveGame(true);
    // Ensure active match score is synced in the tournament matches
    recordMatchScoreInLeague(
      league.id,
      activeMatch.id,
      session.homeScore,
      session.awayScore
    );
    const success = await persistLeagueGamesToCloud(league.id);
    setIsSavingLiveGame(false);
    if (success) {
      setSyncSuccessBanner(
        `✓ Game #${activeMatch.gameNumber} (${homeTeamName} ${session.homeScore} - ${session.awayScore} ${awayTeamName}), current clock, and scorebook successfully saved to Cloud!`
      );
      setTimeout(() => setSyncSuccessBanner(null), 5000);
    }
  };

  const handleFinalizeAndSyncToBracket = () => {
    const finalH = session.homeScore;
    const finalA = session.awayScore;
    if (finalH === finalA) {
      setHornAlertMessage(
        "Tie Game Warning: Basketball games cannot end in a tie. Play an Overtime period (OT1) or break the tie before finalizing."
      );
      return;
    }

    updateSession((prev) => ({
      ...prev,
      isClockRunning: false,
    }));
    recordMatchScoreInLeague(league.id, activeMatch.id, finalH, finalA);
    setSyncSuccessBanner(
      `Official Final Score (${homeTeamName} ${finalH} - ${finalA} ${awayTeamName}) recorded and synced to the Tournament Schedule & Bracket!`
    );
    setTimeout(() => setSyncSuccessBanner(null), 5000);
  };

  const handleResetFullScorebook = () => {
    const fresh = createInitialGameSession(
      league,
      { ...activeMatch, homeScore: 0, awayScore: 0 },
      homeTeam,
      awayTeam,
      leagueReferees
    );
    saveGameSession(activeMatch.id, fresh);
    setActivePlayFlow(null);
    setHornAlertMessage(null);
  };

  const homePlayersList = Object.values(session.homePlayerStats).sort(
    (a, b) => a.jerseyNumber - b.jerseyNumber
  );
  const awayPlayersList = Object.values(session.awayPlayerStats).sort(
    (a, b) => a.jerseyNumber - b.jerseyNumber
  );
  const homeOnCourt = homePlayersList.filter((p) => p.isOnCourt);
  const awayOnCourt = awayPlayersList.filter((p) => p.isOnCourt);

  const renderTeamColumn = (
    side: "HOME" | "AWAY",
    teamName: string,
    teamColor: string,
    playersList: PlayerGameStats[],
    teamLogo?: string
  ) => {
    const onCourtPlayers = playersList.filter((p) => p.isOnCourt);
    const benchPlayers = playersList.filter((p) => !p.isOnCourt);
    const hasBall = (session.activeBallPossession ?? "HOME") === side;
    const selectedSubOutId =
      subOutTargetBySide[side] || onCourtPlayers[0]?.playerId || "";

    return (
      <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 shadow-xs space-y-4">
        {/* Team Column Header with Logo */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-white shadow-sm"
          style={{ backgroundColor: teamColor }}
        >
          <div className="flex items-center gap-3.5">
            {teamLogo ? (
              <img
                src={teamLogo}
                alt={teamName}
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl object-cover bg-white/20 p-1 border border-white/30 shadow-md shrink-0"
              />
            ) : (
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 border border-white/30 text-white font-black text-xl shadow-md uppercase">
                {teamName.slice(0, 2)}
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-black/30 px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-widest">
                  {side} 5-ON-5 ON-COURT LINEUP
                </span>
                {hasBall && (
                  <span className="rounded bg-amber-400 px-2 py-0.5 text-[0.62rem] font-black uppercase text-slate-950">
                    ● ACTIVE BALL POSSESSION
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-xl sm:text-2xl font-black uppercase tracking-tight">
                {teamName} ({ side === "HOME" ? session.homeScore : session.awayScore } PTS)
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleCoachOrBenchTechnical(side)}
              className="rounded-xl bg-slate-950/85 px-3 py-1.5 text-[0.65rem] font-black uppercase text-amber-300 hover:bg-slate-950 cursor-pointer"
            >
              Coach / Bench Tech (TF)
            </button>
            <span className="rounded-xl bg-white/20 px-2.5 py-1 text-xs font-black">
              {onCourtPlayers.length} on floor
            </span>
          </div>
        </div>

        {/* 5 Active On-Court Player Cards (Each embeds Image 2 controls directly) */}
        <div className="space-y-3.5">
          {onCourtPlayers.map((player) => (
            <CourtPlayerActionCard
              key={player.playerId}
              player={player}
              side={side}
              teamColor={teamColor}
              personalFoulLimit={personalFoulLimit}
              shotClockSeconds={shotClockDefault}
              orebResetSeconds={orebResetSeconds}
              referees={leagueReferees}
              selectedCallingRefereeId={selectedCallingRefereeId}
              onChangeCallingReferee={setSelectedCallingRefereeId}
              onTriggerAction={handleTriggerPlayerCardAction}
            />
          ))}
        </div>

        {/* Bench Reserves & 1-Tap Substitution Panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700">
              Bench Reserves ({benchPlayers.length}) — 1-Tap Substitution
            </span>
            <div className="flex items-center gap-1.5">
              <label
                htmlFor={`sub-out-select-${side}`}
                className="text-[0.65rem] font-bold uppercase text-slate-500"
              >
                Sub Out On-Court Player:
              </label>
              <select
                id={`sub-out-select-${side}`}
                value={selectedSubOutId}
                onChange={(e) =>
                  setSubOutTargetBySide((prev) => ({
                    ...prev,
                    [side]: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-900"
              >
                {onCourtPlayers.map((p) => (
                  <option key={p.playerId} value={p.playerId}>
                    #{p.jerseyNumber} {p.lastName} ({p.position})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {benchPlayers.map((p) => (
              <div
                key={p.playerId}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-black text-slate-800 tabular-nums">
                    #{p.jerseyNumber}
                  </span>
                  <span className="truncate font-bold uppercase text-slate-900">
                    {p.lastName}
                  </span>
                  <span className="text-[0.62rem] font-semibold text-slate-500">
                    ({p.position}, {p.points}p, {p.pf}f)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSubstitutePlayer(side, p.playerId)}
                  className="rounded-lg px-2.5 py-1 text-[0.62rem] font-black uppercase text-white hover:opacity-90 cursor-pointer shrink-0"
                  style={{ backgroundColor: teamColor }}
                >
                  Sub In
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* User Role & Permission Banner in Live Game Management */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-xs">
        <div className="flex items-center gap-2.5">
          <Shield
            className={`h-5 w-5 ${
              userRole === "OWNER"
                ? "text-amber-500"
                : userRole === "ADMIN"
                  ? "text-blue-600"
                  : userRole !== "VIEWER"
                    ? "text-emerald-600"
                    : "text-slate-400"
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                Table Assignment:
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-[0.65rem] font-black uppercase ${
                  userRole === "OWNER"
                    ? "bg-amber-100 text-amber-900"
                    : userRole === "ADMIN"
                      ? "bg-blue-100 text-blue-900"
                      : userRole !== "VIEWER"
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-slate-100 text-slate-600"
                }`}
              >
                {userRole === "OWNER"
                  ? "League Creator (Full Control)"
                  : userRole === "ADMIN"
                    ? "League Admin"
                    : userRole === "OFFICIAL_SCORER"
                      ? "Table Official • Scorer"
                      : userRole === "GAME_TIMER"
                        ? "Table Official • Game Timer"
                        : userRole === "SHOT_CLOCK"
                          ? "Table Official • Shot Clock"
                          : userRole === "TABLE_OFFICIAL"
                            ? "Table Official (All Stations)"
                            : "Spectator / Read-Only"}
              </span>
            </div>
            <p className="text-[0.68rem] text-slate-500">
              {userCanScore && userCanClock && userCanShotClock
                ? "You have full access to operate the live scorebook, game clock, shot clock, and roster substitutions."
                : userCanScore
                  ? "You are assigned to the Scorer's Table (Scorebook, play events, fouls, and substitutions enabled)."
                  : userCanClock
                    ? "You are assigned as Game Timer (Game clock, timeouts, and periods enabled)."
                    : userCanShotClock
                      ? "You are assigned as Shot Clock Operator (24s / 14s shot clock resets enabled)."
                      : "You are viewing this match in read-only mode. Contact the League Creator to get an Admin or Table Official role."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-black ${
              userCanScore
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            Scorer {userCanScore ? "✓" : "✗"}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-black ${
              userCanClock
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            Clock {userCanClock ? "✓" : "✗"}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-black ${
              userCanShotClock
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            Shot Clock {userCanShotClock ? "✓" : "✗"}
          </span>
        </div>
      </section>

      {/* 1. TOP MATCH SELECTOR, COMMITTEE TABLE VIEW TOGGLES & SCOREBOOK BAR */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8B0D0E] text-white shadow-xs">
              <ClipboardList className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#0B2F5C] px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wider text-white">
                  Official Scorebook &amp; Committee Table Control
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[0.65rem] font-black uppercase text-slate-700">
                  {league.rulesConfig.ruleSetName}
                </span>
              </div>
              <h2 className="mt-0.5 text-xl font-black uppercase tracking-tight text-slate-900">
                Live Game Management, Clocks &amp; Referees
              </h2>
            </div>
          </div>

          {/* Game Selector Dropdown + Undo + Finalize Button */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label
              htmlFor="active-game-select"
              className="text-xs font-black uppercase text-slate-600"
            >
              Active Game:
            </label>
            <select
              id="active-game-select"
              value={activeMatch.id}
              onChange={(e) => {
                setActivePlayFlow(null);
                setActiveManageMatchId(e.target.value);
              }}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-black uppercase text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
            >
              {matches.map((m) => {
                const h = m.homeTeamId
                  ? teamMap.get(m.homeTeamId)?.name || m.homeTeamPlaceholder
                  : m.homeTeamPlaceholder;
                const a = m.awayTeamId
                  ? teamMap.get(m.awayTeamId)?.name || m.awayTeamPlaceholder
                  : m.awayTeamPlaceholder;
                return (
                  <option key={m.id} value={m.id}>
                    Game #{m.gameNumber} ({m.roundLabel}): {h} vs {a}{" "}
                    {m.status === "FINAL"
                      ? `[FINAL ${m.homeScore}-${m.awayScore}]`
                      : ""}
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              disabled={session.playEvents.length === 0}
              onClick={handleUndoLastPlay}
              className="inline-flex items-center gap-1 rounded-xl bg-[#8B0D0E] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-2xs hover:opacity-95 disabled:opacity-40 cursor-pointer"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo Last Play
            </button>

            <button
              type="button"
              disabled={isSavingLiveGame}
              onClick={handleSaveLiveGameToCloud}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-xs hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              {isSavingLiveGame ? "Saving..." : "Save Game"}
            </button>

            <button
              type="button"
              onClick={handleFinalizeAndSyncToBracket}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Finalize Game &amp; Sync
            </button>

            <button
              type="button"
              onClick={handleResetFullScorebook}
              title="Reset Scorebook Session for this Game"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </button>
          </div>
        </div>

        {/* COMMITTEE TABLE ROLE & PANEL VISIBILITY CONTROLS (HIDE/SHOW GAME CLOCK, HOME TEAM, AWAY TEAM) */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-[#0B2F5C]">
              Committee Table View Toggles:
            </span>

            {/* Individual Toggle: Game Clock */}
            <button
              type="button"
              onClick={() => setShowGameClock((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black uppercase transition-all cursor-pointer ${
                showGameClock
                  ? "bg-slate-900 text-amber-400 shadow-2xs"
                  : "border border-slate-300 bg-white text-slate-500"
              }`}
            >
              {showGameClock ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              {showGameClock ? "Hide Game Clock" : "Show Game Clock"}
            </button>

            {/* Individual Toggle: Home Team */}
            <button
              type="button"
              onClick={() => setShowHomeTeam((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black uppercase transition-all cursor-pointer ${
                showHomeTeam
                  ? "bg-[#8B0D0E] text-white shadow-2xs"
                  : "border border-slate-300 bg-white text-slate-500"
              }`}
            >
              {showHomeTeam ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              {showHomeTeam
                ? `Hide Home (${homeTeamName})`
                : `Show Home (${homeTeamName})`}
            </button>

            {/* Individual Toggle: Away Team */}
            <button
              type="button"
              onClick={() => setShowAwayTeam((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black uppercase transition-all cursor-pointer ${
                showAwayTeam
                  ? "bg-[#0B2F5C] text-white shadow-2xs"
                  : "border border-slate-300 bg-white text-slate-500"
              }`}
            >
              {showAwayTeam ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              {showAwayTeam
                ? `Hide Away (${awayTeamName})`
                : `Show Away (${awayTeamName})`}
            </button>
          </div>

          {/* Quick Committee Presets */}
          <div className="flex flex-wrap items-center gap-1.5 text-[0.65rem]">
            <span className="font-bold uppercase text-slate-500 mr-1">
              Station Presets:
            </span>
            <button
              type="button"
              onClick={() => {
                setShowGameClock(true);
                setShowHomeTeam(true);
                setShowAwayTeam(true);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-black uppercase text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Show All
            </button>
            <button
              type="button"
              onClick={() => {
                setShowGameClock(true);
                setShowHomeTeam(false);
                setShowAwayTeam(false);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-black uppercase text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Clock Operator Only
            </button>
            <button
              type="button"
              onClick={() => {
                setShowGameClock(false);
                setShowHomeTeam(true);
                setShowAwayTeam(false);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-black uppercase text-[#8B0D0E] hover:bg-rose-50 cursor-pointer"
            >
              Home Scorer Only
            </button>
            <button
              type="button"
              onClick={() => {
                setShowGameClock(false);
                setShowHomeTeam(false);
                setShowAwayTeam(true);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-black uppercase text-[#0B2F5C] hover:bg-blue-50 cursor-pointer"
            >
              Away Scorer Only
            </button>
          </div>
        </div>

        {/* GAME REFEREES & TABLE OFFICIALS BAR (INSIDE THE OFFICIAL SCOREBOOK CARD) */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
            style={{ backgroundColor: "#0B2F5C" }}
          >
            <div className="flex items-center gap-2.5">
              <Award className="h-5 w-5 text-amber-400" aria-hidden="true" />
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider">
                Game Referees &amp; Table Officials ({assignedReferees.length}{" "}
                Assigned to Game #{activeMatch.gameNumber})
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRandomizeRefereeCrew}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-2xs hover:bg-amber-300 cursor-pointer"
              >
                <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
                Randomize 4-Official Referee Crew
              </button>
              <button
                type="button"
                onClick={() => setIsRefPanelOpen((prev) => !prev)}
                className="rounded-xl bg-white/15 px-3 py-1.5 text-xs font-black uppercase text-white hover:bg-white/25 cursor-pointer"
              >
                {isRefPanelOpen
                  ? "Hide Referee Manager"
                  : "Manage / Add Referees"}
              </button>
            </div>
          </div>

          {isRefPanelOpen && (
            <div className="p-4 sm:p-5 space-y-5 border-t border-slate-200">
              <form
                onSubmit={handleAddRefereeSubmit}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-[#8B0D0E]">
                    + Add New Referee or Table Official to League Pool
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end">
                  <div className="sm:col-span-2">
                    <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#0B2F5C] cursor-pointer">
                      {refImageInput ? (
                        <img
                          src={refImageInput}
                          alt="Referee preview"
                          className="h-7 w-7 rounded-lg object-cover"
                        />
                      ) : (
                        <Camera className="h-4 w-4 text-[#8B0D0E] shrink-0" />
                      )}
                      <span className="truncate">
                        {refImageInput ? "Photo Ready" : "Ref Photo"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) =>
                          handleRefereePhotoSelect(e, setRefImageInput)
                        }
                      />
                    </label>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[0.65rem] font-black uppercase text-slate-500 mb-1">
                      Referee Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={refNameInput}
                      onChange={(e) => setRefNameInput(e.target.value)}
                      placeholder="e.g. Ref. Marco Villanueva"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[0.65rem] font-black uppercase text-slate-500 mb-1">
                      Official Role
                    </label>
                    <select
                      value={refRoleInput}
                      onChange={(e) =>
                        setRefRoleInput(e.target.value as RefereeRole)
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-900"
                    >
                      {REFEREE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-[0.65rem] font-black uppercase text-slate-500 mb-1">
                      Ref #
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={refNumberInput}
                      onChange={(e) => setRefNumberInput(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-black text-slate-900 tabular-nums"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[0.65rem] font-black uppercase text-slate-500 mb-1">
                      License / Badge
                    </label>
                    <input
                      type="text"
                      value={refAccreditationInput}
                      onChange={(e) => setRefAccreditationInput(e.target.value)}
                      placeholder="FIBA Class A"
                      className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#8B0D0E] px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-xs hover:opacity-95 cursor-pointer"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Add Referee
                    </button>
                  </div>
                </div>
              </form>

              {leagueReferees.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center space-y-2">
                  <p className="text-xs font-bold text-slate-600">
                    No referees added yet. Click{" "}
                    <strong>&ldquo;Randomize 4-Official Referee Crew&rdquo;</strong>{" "}
                    to generate a full officiating crew automatically.
                  </p>
                  <button
                    type="button"
                    onClick={handleRandomizeRefereeCrew}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-4 py-2 text-xs font-black uppercase text-white cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                    Populate Random Referee Crew
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {leagueReferees.map((ref) => {
                    const isAssigned = session.assignedRefereeIds.includes(
                      ref.id
                    );
                    const avatarUrl =
                      ref.imageUrl ||
                      generatePortraitAvatarDataUrl({
                        name: ref.name,
                        primaryColor: "#0f172a",
                        secondaryColor: "#8B0D0E",
                        badgeText: `#${ref.jerseyNumber}`,
                        roleLabel: ref.role.toUpperCase().slice(0, 10),
                      });

                    return (
                      <div
                        key={ref.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-all ${
                          isAssigned
                            ? "border-[#0B2F5C] bg-slate-50 shadow-2xs"
                            : "border-slate-200 bg-white opacity-75"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <label
                            title={`Change photo for ${ref.name}`}
                            className="relative shrink-0 cursor-pointer"
                          >
                            <img
                              src={avatarUrl}
                              alt={ref.name}
                              className="h-12 w-12 rounded-xl object-cover border border-slate-300"
                            />
                            <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-900 text-white">
                              <Camera className="h-2.5 w-2.5" />
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={(e) =>
                                handleRefereePhotoSelect(e, (url) =>
                                  updateRefereeInLeague(league.id, ref.id, {
                                    imageUrl: url,
                                  })
                                )
                              }
                            />
                          </label>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-[#8B0D0E] px-1.5 py-0.5 text-[0.6rem] font-black uppercase text-white">
                                {ref.role}
                              </span>
                              <span className="text-[0.65rem] font-black text-slate-500">
                                #{ref.jerseyNumber}
                              </span>
                            </div>
                            <div className="truncate text-xs font-black uppercase text-slate-900 mt-0.5">
                              {ref.name}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleRefereeAssignment(ref.id)
                            }
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[0.62rem] font-black uppercase cursor-pointer ${
                              isAssigned
                                ? "bg-emerald-600 text-white"
                                : "border border-slate-300 bg-white text-slate-700"
                            }`}
                          >
                            <UserCheck className="h-3 w-3" />
                            {isAssigned ? "On Crew" : "Assign"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              deleteRefereeFromLeague(league.id, ref.id)
                            }
                            aria-label={`Remove ${ref.name}`}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {syncSuccessBanner && (
          <div
            role="status"
            className="flex items-center justify-between rounded-xl border border-emerald-400 bg-emerald-50 px-4 py-2.5 text-xs font-black uppercase text-emerald-950"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {syncSuccessBanner}
            </span>
            <button
              type="button"
              onClick={() => onSwitchTab("bracket")}
              className="rounded-lg bg-emerald-700 px-3 py-1 text-[0.68rem] font-black uppercase text-white cursor-pointer"
            >
              View Bracket →
            </button>
          </div>
        )}
      </section>

      {/* 2. SHOT CLOCK / GAME HORN ALERT BANNER & ACTIVE TIMEOUT HUD (POSITIONED DIRECTLY ABOVE THE GAME CLOCK) */}
      {activeTimeoutSide && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-3.5 text-xs sm:text-sm font-black uppercase text-slate-900 shadow-md animate-pulse"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 shadow-xs">
              <BellRing className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#0B2F5C] px-2 py-0.5 text-[0.62rem] font-black uppercase text-white">
                  OFFICIAL TIMEOUT
                </span>
                <span className="text-[0.72rem] font-black text-amber-700">
                  {activeTimeoutSide === "HOME" ? homeTeamName : awayTeamName}
                </span>
              </div>
              <div className="text-base sm:text-lg font-black text-slate-950 mt-0.5">
                Countdown:{" "}
                <span className="tabular-nums text-amber-600 font-black">
                  {timeoutSecondsRemaining}s
                </span>{" "}
                remaining
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualSoundTimeoutBuzzer}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-black uppercase text-slate-950 hover:bg-amber-400 cursor-pointer shadow-2xs"
            >
              <BellRing className="h-3.5 w-3.5" />
              Sound Horn
            </button>
            <button
              type="button"
              onClick={handleCancelTimeoutCountdown}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-800 hover:bg-slate-100 cursor-pointer"
            >
              End Timeout
            </button>
          </div>
        </div>
      )}

      {hornAlertMessage && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-3 text-xs sm:text-sm font-black uppercase text-slate-900 shadow-sm"
        >
          <span className="flex items-center gap-2.5">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-[#8B0D0E] shrink-0" />
            <span>{hornAlertMessage}</span>
          </span>
          <button
            type="button"
            onClick={() => setHornAlertMessage(null)}
            className="underline text-[#8B0D0E] hover:opacity-80 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3. LIGHT-MODE COURTSIDE LIVE SCOREBOARD, GAME CLOCK & SHOT CLOCK HUD (TOGGLEABLE BY COMMITTEE) */}
      {showGameClock && (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-6 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#8B0D0E] px-2.5 py-0.5 text-[0.65rem] font-black uppercase tracking-widest text-white">
                ● GAME #{activeMatch.gameNumber} • {activeMatch.roundLabel}
              </span>
              <span className="font-bold text-slate-700">
                {activeMatch.courtName} • {activeMatch.scheduledDate} (
                {activeMatch.scheduledTime})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.68rem] font-bold uppercase text-slate-500">
                Officiating Crew:
              </span>
              {assignedReferees.length === 0 ? (
                <span className="text-[0.68rem] italic text-[#8B0D0E]">
                  No Referees Assigned Yet
                </span>
              ) : (
                assignedReferees.map((r) => (
                  <span
                    key={r.id}
                    className="rounded-lg bg-white px-2.5 py-0.5 text-[0.65rem] font-black text-[#0B2F5C] border border-slate-200 shadow-2xs"
                  >
                    #{r.jerseyNumber} {r.name} ({r.role})
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-12 items-center">
            {/* HOME TEAM HUD (LIGHT MODE) */}
            <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {homeTeam?.imageUrl ? (
                    <img
                      src={homeTeam.imageUrl}
                      alt={homeTeamName}
                      className="h-14 w-14 rounded-2xl object-cover bg-white p-0.5 border border-slate-200 shrink-0 shadow-2xs"
                    />
                  ) : (
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-black uppercase text-white shadow-sm"
                      style={{ backgroundColor: homeColor }}
                    >
                      {homeTeamName.slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-[#8B0D0E] px-2 py-0.5 text-[0.6rem] font-black uppercase text-white">
                        HOME
                      </span>
                      {session.possessionArrow === "HOME" && (
                        <span className="rounded bg-amber-400 px-2 py-0.5 text-[0.6rem] font-black uppercase text-slate-950">
                          ◄ POSS ARROW
                        </span>
                      )}
                    </div>
                    <h3 className="truncate text-2xl font-black uppercase tracking-tight text-slate-900 mt-0.5">
                      {homeTeamName}
                    </h3>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-5xl sm:text-6xl font-black tabular-nums tracking-tight text-slate-900">
                    {session.homeScore}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
                <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.62rem] font-black uppercase text-slate-500">
                      {currentPeriodLabel} Team Fouls
                    </span>
                    {homeInBonus && (
                      <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-slate-950">
                        BONUS (2 FT)
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {Array.from({ length: bonusThreshold }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-3 w-4 rounded-xs ${
                          i < homePeriodFouls ? "bg-[#8B0D0E]" : "bg-slate-200"
                        }`}
                      />
                    ))}
                    <span className="ml-auto text-sm font-black tabular-nums text-slate-900">
                      {homePeriodFouls}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="block text-[0.62rem] font-black uppercase text-slate-500">
                      Timeouts Left
                    </span>
                    <strong className="text-lg font-black tabular-nums text-[#8B0D0E]">
                      {session.homeTimeoutsRemaining}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCallTimeout("HOME")}
                    disabled={session.homeTimeoutsRemaining <= 0}
                    className="rounded-lg bg-[#8B0D0E] px-2.5 py-1.5 text-[0.65rem] font-black uppercase text-white hover:opacity-90 disabled:opacity-40 cursor-pointer"
                  >
                    Call TO
                  </button>
                </div>
              </div>
            </div>

            {/* CENTER: GAME CLOCK, SHOT CLOCK, PERIOD & POSSESSION CONTROLS (LIGHT MODE) */}
            <div className="lg:col-span-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-5 space-y-4 text-center">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {[1, 2, 3, 4, 5, 6]
                  .filter((p) => p <= regPeriodsCount + 2)
                  .map((p) => {
                    const lbl = getPeriodLabel(p, regPeriodsCount);
                    const active = session.currentPeriod === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleSelectPeriod(p)}
                        className={`rounded-lg px-3 py-1 text-xs font-black uppercase transition-all cursor-pointer ${
                          active
                            ? "bg-[#0B2F5C] text-white shadow-2xs"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
              </div>

              <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-8 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
                  <div className="flex items-center justify-between text-[0.62rem] font-black uppercase text-slate-500 px-1">
                    <span>{currentPeriodLabel} GAME CLOCK</span>
                    <button
                      type="button"
                      onClick={() => {
                        setManualMinutesInput(
                          String(Math.floor(session.clockSecondsRemaining / 60))
                        );
                        setManualSecondsInput(
                          String(session.clockSecondsRemaining % 60).padStart(
                            2,
                            "0"
                          )
                        );
                        setIsEditingClock((prev) => !prev);
                      }}
                      className="text-[#8B0D0E] hover:underline cursor-pointer"
                    >
                      {isEditingClock ? "Cancel" : "Set Time"}
                    </button>
                  </div>

                  {isEditingClock ? (
                    <form
                      onSubmit={handleApplyManualClock}
                      className="mt-2 flex items-center justify-center gap-1.5"
                    >
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={manualMinutesInput}
                        onChange={(e) => setManualMinutesInput(e.target.value)}
                        className="w-14 rounded bg-slate-50 border border-slate-300 px-2 py-1 text-center text-lg font-black text-slate-900"
                      />
                      <span className="text-lg font-black text-slate-900">:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={manualSecondsInput}
                        onChange={(e) => setManualSecondsInput(e.target.value)}
                        className="w-14 rounded bg-slate-50 border border-slate-300 px-2 py-1 text-center text-lg font-black text-slate-900"
                      />
                      <button
                        type="submit"
                        className="rounded bg-[#0B2F5C] px-2.5 py-1.5 text-xs font-black uppercase text-white cursor-pointer"
                      >
                        OK
                      </button>
                    </form>
                  ) : (
                    <div
                      className={`text-5xl sm:text-6xl font-black tabular-nums tracking-wider ${
                        session.isClockRunning
                          ? "text-emerald-600"
                          : "text-[#0B2F5C]"
                      }`}
                    >
                      {formatClock(session.clockSecondsRemaining)}
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAdjustGameClock(-60)}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.62rem] font-black text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      -1m
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdjustGameClock(-1)}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.62rem] font-black text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      -1s
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdjustGameClock(1)}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.62rem] font-black text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      +1s
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdjustGameClock(60)}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.62rem] font-black text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      +1m
                    </button>
                    <button
                      type="button"
                      onClick={handleResetPeriodClock}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.62rem] font-black text-[#8B0D0E] hover:bg-rose-50 cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="col-span-4 rounded-2xl border border-rose-200 bg-white p-3 shadow-2xs">
                  <span className="block text-[0.6rem] font-black uppercase text-[#8B0D0E]">
                    SHOT CLOCK
                  </span>
                  <div
                    className={`text-4xl sm:text-5xl font-black tabular-nums ${
                      session.shotClockSeconds <= 5
                        ? "text-rose-600 animate-pulse"
                        : "text-[#8B0D0E]"
                    }`}
                  >
                    {session.shotClockSeconds}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => handleResetShotClock(shotClockDefault)}
                      className="rounded bg-[#8B0D0E] py-1 text-[0.65rem] font-black uppercase text-white hover:opacity-90 cursor-pointer"
                    >
                      {shotClockDefault}s
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetShotClock(orebResetSeconds)}
                      className="rounded bg-[#0B2F5C] py-1 text-[0.65rem] font-black uppercase text-white hover:opacity-90 cursor-pointer"
                    >
                      {orebResetSeconds}s
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleToggleClock}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-black uppercase tracking-wider shadow-xs cursor-pointer ${
                    session.isClockRunning
                      ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {session.isClockRunning ? (
                    <>
                      <Pause className="h-4 w-4" />
                      Pause Clock
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Start Clock
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleTogglePossessionArrow}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-3 text-xs font-black uppercase tracking-wider text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  <ArrowLeftRight className="h-4 w-4 text-[#0B2F5C]" />
                  Arrow:{" "}
                  {session.possessionArrow === "HOME" ? "◄ HOME" : "AWAY ►"}
                </button>
              </div>

              {/* Arena Horns & Audio Mute Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleManualSoundGameClockBuzzer}
                    title="Manual Game Clock Arena Buzzer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0D0E] px-3 py-1.5 text-[0.68rem] font-black uppercase tracking-wider text-white hover:bg-[#a31213] active:scale-95 cursor-pointer shadow-2xs"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    Horn (End Period)
                  </button>

                  <button
                    type="button"
                    onClick={handleManualSoundTimeoutBuzzer}
                    title="Manual Timeout Table Horn"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-3 py-1.5 text-[0.68rem] font-black uppercase tracking-wider text-white hover:bg-[#124077] active:scale-95 cursor-pointer shadow-2xs"
                  >
                    <BellRing className="h-3.5 w-3.5" />
                    Horn (Timeout)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBuzzerMuted((prev) => !prev)}
                  title={isBuzzerMuted ? "Unmute buzzers" : "Mute buzzers"}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[0.65rem] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    isBuzzerMuted
                      ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {isBuzzerMuted ? (
                    <>
                      <VolumeX className="h-3.5 w-3.5 text-rose-600" />
                      Muted
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
                      Sound ON
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* AWAY TEAM HUD (LIGHT MODE) */}
            <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-left">
                  <div className="text-5xl sm:text-6xl font-black tabular-nums tracking-tight text-slate-900">
                    {session.awayScore}
                  </div>
                </div>

                <div className="flex items-center gap-3 min-w-0 text-right">
                  <div className="min-w-0">
                    <div className="flex items-center justify-end gap-1.5">
                      {session.possessionArrow === "AWAY" && (
                        <span className="rounded bg-amber-400 px-2 py-0.5 text-[0.6rem] font-black uppercase text-slate-950">
                          POSS ARROW ►
                        </span>
                      )}
                      <span className="rounded bg-[#0B2F5C] px-2 py-0.5 text-[0.6rem] font-black uppercase text-white">
                        AWAY
                      </span>
                    </div>
                    <h3 className="truncate text-2xl font-black uppercase tracking-tight text-slate-900 mt-0.5">
                      {awayTeamName}
                    </h3>
                  </div>
                  {awayTeam?.imageUrl ? (
                    <img
                      src={awayTeam.imageUrl}
                      alt={awayTeamName}
                      className="h-14 w-14 rounded-2xl object-cover bg-white p-0.5 border border-slate-200 shrink-0 shadow-2xs"
                    />
                  ) : (
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-black uppercase text-white shadow-sm"
                      style={{ backgroundColor: awayColor }}
                    >
                      {awayTeamName.slice(0, 2)}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
                <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.62rem] font-black uppercase text-slate-500">
                      {currentPeriodLabel} Team Fouls
                    </span>
                    {awayInBonus && (
                      <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-slate-950">
                        BONUS (2 FT)
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {Array.from({ length: bonusThreshold }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-3 w-4 rounded-xs ${
                          i < awayPeriodFouls ? "bg-[#0B2F5C]" : "bg-slate-200"
                        }`}
                      />
                    ))}
                    <span className="ml-auto text-sm font-black tabular-nums text-slate-900">
                      {awayPeriodFouls}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="block text-[0.62rem] font-black uppercase text-slate-500">
                      Timeouts Left
                    </span>
                    <strong className="text-lg font-black tabular-nums text-[#0B2F5C]">
                      {session.awayTimeoutsRemaining}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCallTimeout("AWAY")}
                    disabled={session.awayTimeoutsRemaining <= 0}
                    className="rounded-lg bg-[#0B2F5C] px-2.5 py-1.5 text-[0.65rem] font-black uppercase text-white hover:opacity-90 disabled:opacity-40 cursor-pointer"
                  >
                    Call TO
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quarter-by-Quarter Scoring Breakdown Strip (Light Mode) */}
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-[0.65rem] font-black uppercase text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 text-left">Team</th>
                    {session.homeQuarterScores.map((_, idx) => (
                      <th key={idx} className="py-1.5 px-3 text-center">
                        {getPeriodLabel(idx + 1, regPeriodsCount)}
                      </th>
                    ))}
                    <th className="py-1.5 px-3 text-right text-[#8B0D0E]">
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-black tabular-nums">
                  <tr>
                    <td className="py-1.5 text-left uppercase text-slate-900">
                      {homeTeamName}
                    </td>
                    {session.homeQuarterScores.map((qScore, idx) => (
                      <td
                        key={idx}
                        className={`py-1.5 px-3 text-center ${
                          session.currentPeriod === idx + 1
                            ? "text-[#8B0D0E]"
                            : "text-slate-600"
                        }`}
                      >
                        {qScore}
                      </td>
                    ))}
                    <td className="py-1.5 px-3 text-right text-sm text-[#8B0D0E]">
                      {session.homeScore}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-left uppercase text-slate-900">
                      {awayTeamName}
                    </td>
                    {session.awayQuarterScores.map((qScore, idx) => (
                      <td
                        key={idx}
                        className={`py-1.5 px-3 text-center ${
                          session.currentPeriod === idx + 1
                            ? "text-[#0B2F5C]"
                            : "text-slate-600"
                        }`}
                      >
                        {qScore}
                      </td>
                    ))}
                    <td className="py-1.5 px-3 text-right text-sm text-[#0B2F5C]">
                      {session.awayScore}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 4. INTERACTIVE 6-FLOW BASKETBALL PLAY STATE-MACHINE WIZARD BANNER */}
      {activePlayFlow && (
        <PlayFlowWizardBanner
          flowState={activePlayFlow}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          homeColor={homeColor}
          awayColor={awayColor}
          homeOnCourt={homeOnCourt}
          awayOnCourt={awayOnCourt}
          shotClockDefault={shotClockDefault}
          orebResetSeconds={orebResetSeconds}
          referees={leagueReferees}
          defaultRefereeId={selectedCallingRefereeId}
          onChangeDefaultReferee={handleChangeDefaultRefereeInModal}
          onSelectAssistTeammate={handleSelectAssistTeammate}
          onResolveAnd1Prompt={handleResolveAnd1Prompt}
          onSelectAnd1Defender={handleSelectAnd1Defender}
          onResolveAnd1FreeThrow={handleResolveAnd1FreeThrow}
          onSelectShotBlocker={handleSelectShotBlocker}
          onResolveRebound={handleResolveRebound}
          onSelectTurnoverVictimFromSteal={handleSelectTurnoverVictimFromSteal}
          onSelectTurnoverReasonTag={handleSelectTurnoverReasonTag}
          onResolveUnderBonusFoul={handleResolveUnderBonusFoul}
          onSelectBonusFtShooter={handleSelectBonusFtShooter}
          onResolveBonusFtAttempt={handleResolveBonusFtAttempt}
          onSelectTechnicalFtShooter={handleSelectTechnicalFtShooter}
          onResolveTechnicalFtAttempt={handleResolveTechnicalFtAttempt}
          onDismissFlow={() => setActivePlayFlow(null)}
        />
      )}

      {/* 5. 2-COLUMN COURTSIDE STAT INPUTTING (HOME TEAM & AWAY TEAM WITH EMBEDDED IMAGE 2 CONTROLS PER PLAYER) */}
      {(showHomeTeam || showAwayTeam) && (
        <section
          className={`grid grid-cols-1 gap-6 ${
            showHomeTeam && showAwayTeam ? "lg:grid-cols-2" : "lg:grid-cols-1"
          }`}
        >
          {showHomeTeam &&
            renderTeamColumn(
              "HOME",
              homeTeamName,
              homeColor,
              homePlayersList,
              homeTeam?.imageUrl
            )}
          {showAwayTeam &&
            renderTeamColumn(
              "AWAY",
              awayTeamName,
              awayColor,
              awayPlayersList,
              awayTeam?.imageUrl
            )}
        </section>
      )}

      {/* 6. SIDE-BY-SIDE OFFICIAL SCOREBOOK (BOX SCORE / RUNNING SCORE) ALONGSIDE LIVE PLAY-BY-PLAY */}
      <ScorebookAndPlayByPlaySection
        gameNumber={activeMatch.gameNumber}
        session={session}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        homeColor={homeColor}
        awayColor={awayColor}
        homePlayersList={homePlayersList}
        awayPlayersList={awayPlayersList}
        personalFoulLimit={personalFoulLimit}
        assignedReferees={assignedReferees}
        showHomeTeam={showHomeTeam}
        showAwayTeam={showAwayTeam}
        onSubstitutePlayer={handleSubstitutePlayer}
        onUndoLastPlay={handleUndoLastPlay}
      />
    </div>
  );
}
