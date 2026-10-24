"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Crown,
  Dices,
  Edit,
  GitBranch,
  Grid,
  LayoutDashboard,
  Layers,
  List,
  MapPin,
  Maximize2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Shield,
  Shuffle,
  Sparkles,
  Swords,
  Trash2,
  Trophy,
  Tv,
  Users,
  X,
} from "lucide-react";
import {
  GeminiTournamentResponse,
} from "@/app/api/gemini-tournament/route";
import { LeagueAnalyticsDashboard } from "@/components/dashboard/LeagueAnalyticsDashboard";
import {
  canManageTeamsAndSchedule,
  getUserLeagueRole,
} from "@/lib/basketball-rules";
import {
  BRACKETING_FORMATS,
  calculatePoolStandings,
  DEFAULT_DAILY_TIME_SLOTS,
  generateLeagueTournamentData,
  generateUnifiedLeagueTournamentData,
} from "@/lib/tournament-engine";
import { simulateFullBasketballGame } from "@/lib/game-simulation-engine";
import { generateUUID } from "@/lib/uuid";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import {
  BracketingFormatId,
  LeagueRecord,
  LeagueTeam,
  LeagueWorkspaceTab,
  TournamentMatch,
} from "@/types/boxscore";

interface LeagueTournamentWorkspaceProps {
  league: LeagueRecord;
  teams: LeagueTeam[];
  activeTab: LeagueWorkspaceTab;
  onSwitchTab: (tab: LeagueWorkspaceTab) => void;
  onEditLeague?: () => void;
}

export function LeagueTournamentWorkspace({
  league,
  teams,
  activeTab,
  onSwitchTab,
  onEditLeague,
}: LeagueTournamentWorkspaceProps) {
  const {
    userProfile,
    tournamentsByLeagueId,
    openMatchInGameManagement,
    saveLeagueTournamentData,
    recordMatchScoreInLeague,
    updateMatchDetailsInLeague,
    addCustomMatchInLeague,
    deleteMatchInLeague,
    reorderMatchesInLeague,
    seedPlayoffsInLeague,
    persistLeagueGamesToCloud,
    saveGameSession,
  } = useBoxScoreStore();

  const userFullName = userProfile
    ? `${userProfile.firstName || ""} ${userProfile.lastName || ""}`.trim()
    : null;
  const userRole = getUserLeagueRole(
    league,
    userProfile?.id,
    userProfile?.email,
    userProfile?.accountRoles,
    userFullName
  );
  const canManageSchedule = canManageTeamsAndSchedule(userRole);

  const existingTournament = tournamentsByLeagueId[league.id] ?? null;

  // Format Configuration State
  const [selectedFormatId, setSelectedFormatId] = useState<BracketingFormatId>(
    existingTournament?.formatId ?? "MULTI_STAGE"
  );
  const [poolsCount, setPoolsCount] = useState<1 | 2 | 4>(
    existingTournament?.poolsCount ?? 2
  );
  const [advancingPerPool, setAdvancingPerPool] = useState<2 | 4>(
    existingTournament?.advancingPerPool ?? 2
  );
  const [seriesBestOf, setSeriesBestOf] = useState<3 | 5 | 7>(
    existingTournament?.seriesBestOf ?? 3
  );
  const [stepladderVariant, setStepladderVariant] = useState<
    "PAGE_MCINTYRE_TOP4" | "STEPLADDER_CLIMB"
  >(existingTournament?.stepladderVariant ?? "PAGE_MCINTYRE_TOP4");

  // Schedule Filter, View Mode & Score Entry State
  const [scheduleViewMode, setScheduleViewMode] = useState<"list" | "calendar">("list");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>("");
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    if (league.startDate) {
      const d = new Date(league.startDate);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date();
  });
  const [isEditFormatModalOpen, setIsEditFormatModalOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL");
  const [scoreInputs, setScoreInputs] = useState<
    Record<string, { home: string; away: string }>
  >({});
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [savedScheduleBanner, setSavedScheduleBanner] = useState<string | null>(
    null
  );
  const [savedMatchRowIds, setSavedMatchRowIds] = useState<
    Record<string, boolean>
  >({});

  // Custom Match Form State
  const [isAddCustomMatchOpen, setIsAddCustomMatchOpen] = useState(false);
  const [customHomeId, setCustomHomeId] = useState<string>("");
  const [customAwayId, setCustomAwayId] = useState<string>("");
  const [customRoundLabel, setCustomRoundLabel] = useState<string>(
    "Exhibition / Tiebreaker Game"
  );
  const [customDate, setCustomDate] = useState<string>(league.startDate || "");
  const [customTime, setCustomTime] = useState<string>("04:00 PM");

  // Gemini AI Co-Pilot State
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] =
    useState<GeminiTournamentResponse | null>(null);

  // Sync local selectors when existingTournament changes
  useEffect(() => {
    if (existingTournament) {
      setSelectedFormatId(existingTournament.formatId);
      setPoolsCount(existingTournament.poolsCount);
      setAdvancingPerPool(existingTournament.advancingPerPool);
      setSeriesBestOf(existingTournament.seriesBestOf);
      setStepladderVariant(existingTournament.stepladderVariant);
    }
  }, [existingTournament]);

  // Auto-initialize tournament schedule if teams exist and none generated yet
  useEffect(() => {
    if (!existingTournament && teams.length >= 2) {
      const initial = generateUnifiedLeagueTournamentData({
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

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const getTeamDisplay = (
    teamId: string | null,
    placeholder: string
  ): {
    name: string;
    primaryColor: string;
    secondaryColor: string;
    imageUrl: string;
    isResolved: boolean;
  } => {
    if (teamId) {
      const found = teamMap.get(teamId);
      if (found) {
        return {
          name: found.name,
          primaryColor: found.primaryColor || "#8B0D0E",
          secondaryColor: found.secondaryColor || "#0B2F5C",
          imageUrl: found.imageUrl || "",
          isResolved: true,
        };
      }
    }
    return {
      name: placeholder || "TBD",
      primaryColor: "#64748b",
      secondaryColor: "#475569",
      imageUrl: "",
      isResolved: false,
    };
  };

  const handleGenerateTournament = (
    overrideFormat?: BracketingFormatId,
    shuffleSeeds = false
  ) => {
    const fmt = overrideFormat ?? selectedFormatId;
    const baseIds = teams.map((t) => t.id);
    const seedOrder = shuffleSeeds
      ? [...baseIds].sort(() => Math.random() - 0.5)
      : baseIds;

    const generated = generateUnifiedLeagueTournamentData({
      league,
      teams,
      formatId: fmt,
      poolsCount,
      advancingPerPool,
      seriesBestOf,
      stepladderVariant,
      dailyTimeSlots: DEFAULT_DAILY_TIME_SLOTS,
      seedOrderTeamIds: seedOrder,
    });
    saveLeagueTournamentData(league.id, generated);
    setScoreInputs({});
  };

  const handleAskGeminiAi = async (
    action: "recommend_format" | "analyze_bracket" | "custom_prompt"
  ) => {
    setIsAiLoading(true);
    try {
      const res = await fetch("/api/gemini-tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          leagueName: league.name,
          ruleSetId: league.ruleSetId,
          startDate: league.startDate,
          endDate: league.endDate,
          courts: league.courts.map((c) => `${c.name} (${c.surfaceType})`),
          teamNames: teams.map((t) => t.name),
          currentFormatId: selectedFormatId,
          customPrompt: aiPrompt,
        }),
      });
      const data = (await res.json()) as GeminiTournamentResponse;
      setAiResponse(data);
    } catch {
      // Handled by fallback
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleApplyAiRecommendation = () => {
    if (!aiResponse) return;
    setSelectedFormatId(aiResponse.recommendedFormatId);
    setPoolsCount(aiResponse.recommendedPoolsCount);
    setSeriesBestOf(aiResponse.recommendedSeriesBestOf);
    setStepladderVariant(aiResponse.recommendedStepladderVariant);

    const generated = generateLeagueTournamentData({
      league,
      teams,
      formatId: aiResponse.recommendedFormatId,
      poolsCount: aiResponse.recommendedPoolsCount,
      advancingPerPool,
      seriesBestOf: aiResponse.recommendedSeriesBestOf,
      stepladderVariant: aiResponse.recommendedStepladderVariant,
      dailyTimeSlots: DEFAULT_DAILY_TIME_SLOTS,
    });
    generated.aiLastSummary = aiResponse.analysisMarkdown;
    saveLeagueTournamentData(league.id, generated);
  };

  const handleSaveMatchScore = async (match: TournamentMatch) => {
    const entry = scoreInputs[match.id];
    const hasEnteredScore =
      entry?.home !== undefined &&
      entry?.away !== undefined &&
      entry.home.trim() !== "" &&
      entry.away.trim() !== "";

    if (hasEnteredScore) {
      const hVal = Number(entry.home);
      const aVal = Number(entry.away);
      let finalHome = Math.max(0, hVal);
      let finalAway = Math.max(0, aVal);
      // Basketball games cannot end in a tie
      if (finalHome === finalAway) {
        finalHome += 2;
      }
      recordMatchScoreInLeague(league.id, match.id, finalHome, finalAway);
    } else {
      await persistLeagueGamesToCloud(league.id);
    }

    setSavedMatchRowIds((prev) => ({ ...prev, [match.id]: true }));
    setTimeout(() => {
      setSavedMatchRowIds((prev) => ({ ...prev, [match.id]: false }));
    }, 3000);
  };

  const handleSaveAllOrganizerGames = async () => {
    setIsSavingSchedule(true);
    // Apply any pending score inputs across matches first
    for (const [mId, entry] of Object.entries(scoreInputs)) {
      if (
        entry.home.trim() !== "" &&
        entry.away.trim() !== ""
      ) {
        let h = Math.max(0, Number(entry.home));
        let a = Math.max(0, Number(entry.away));
        if (h === a) h += 2;
        recordMatchScoreInLeague(league.id, mId, h, a);
      }
    }

    const success = await persistLeagueGamesToCloud(league.id);
    setIsSavingSchedule(false);
    if (success) {
      setSavedScheduleBanner(
        `✓ All ${allMatches.length} Organizer Games & Schedules successfully saved to Supabase Cloud and Local Storage!`
      );
      setTimeout(() => setSavedScheduleBanner(null), 5000);
    }
  };

  const handleSimulateSingleMatch = (match: TournamentMatch) => {
    if (!match.homeTeamId || !match.awayTeamId) return;

    const homeTeam = teams.find((t) => t.id === match.homeTeamId);
    const awayTeam = teams.find((t) => t.id === match.awayTeamId);

    if (homeTeam && awayTeam && homeTeam.roster.length > 0 && awayTeam.roster.length > 0) {
      // High-fidelity AI simulation with clock, periods, subs, stats, and play-by-play
      const sim = simulateFullBasketballGame(league, match, homeTeam, awayTeam);
      saveGameSession(match.id, sim.session);
      setScoreInputs((prev) => ({
        ...prev,
        [match.id]: { home: String(sim.finalHomeScore), away: String(sim.finalAwayScore) },
      }));
      recordMatchScoreInLeague(league.id, match.id, sim.finalHomeScore, sim.finalAwayScore);
    } else {
      // Fallback random score if rosters not ready
      const is3x3 = league.ruleSetId === "FIBA_3X3";
      let hScore = is3x3
        ? 14 + Math.floor(Math.random() * 8)
        : 68 + Math.floor(Math.random() * 34);
      let aScore = is3x3
        ? 12 + Math.floor(Math.random() * 9)
        : 65 + Math.floor(Math.random() * 35);
      if (hScore === aScore) hScore += 2;

      setScoreInputs((prev) => ({
        ...prev,
        [match.id]: { home: String(hScore), away: String(aScore) },
      }));
      recordMatchScoreInLeague(league.id, match.id, hScore, aScore);
    }
  };

  const handleSimulateAllPlayableMatches = () => {
    if (!existingTournament) return;
    for (const m of existingTournament.matches) {
      if (m.status !== "FINAL" && m.homeTeamId && m.awayTeamId) {
        const homeTeam = teams.find((t) => t.id === m.homeTeamId);
        const awayTeam = teams.find((t) => t.id === m.awayTeamId);

        if (homeTeam && awayTeam && homeTeam.roster.length > 0 && awayTeam.roster.length > 0) {
          const sim = simulateFullBasketballGame(league, m, homeTeam, awayTeam);
          saveGameSession(m.id, sim.session);
          setScoreInputs((prev) => ({
            ...prev,
            [m.id]: { home: String(sim.finalHomeScore), away: String(sim.finalAwayScore) },
          }));
          recordMatchScoreInLeague(league.id, m.id, sim.finalHomeScore, sim.finalAwayScore);
        } else {
          const is3x3 = league.ruleSetId === "FIBA_3X3";
          let hScore = is3x3
            ? 15 + Math.floor(Math.random() * 7)
            : 72 + Math.floor(Math.random() * 30);
          let aScore = is3x3
            ? 13 + Math.floor(Math.random() * 8)
            : 70 + Math.floor(Math.random() * 30);
          if (hScore === aScore) hScore += 3;
          recordMatchScoreInLeague(league.id, m.id, hScore, aScore);
        }
      }
    }
  };

  const handleAddCustomMatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingTournament || !customHomeId || !customAwayId) return;
    const defaultCourt = league.courts[0] ?? {
      id: "default-court",
      name: "Main Tournament Court",
      surfaceType: "Hardwood",
    };

    const newMatch: TournamentMatch = {
      id: generateUUID(),
      leagueId: league.id,
      gameNumber: existingTournament.matches.length + 1,
      stage: "PLAYOFF",
      roundNumber: 1,
      roundLabel: customRoundLabel.trim() || "Special Matchup",
      homeTeamId: customHomeId,
      awayTeamId: customAwayId,
      homeTeamPlaceholder: "Home Team",
      awayTeamPlaceholder: "Away Team",
      homeScore: null,
      awayScore: null,
      status: "SCHEDULED",
      winnerTeamId: null,
      loserTeamId: null,
      scheduledDate: customDate || league.startDate || "2026-10-26",
      scheduledTime: customTime || "04:00 PM",
      courtId: defaultCourt.id,
      courtName: `${defaultCourt.name} (${defaultCourt.surfaceType})`,
    };

    addCustomMatchInLeague(league.id, newMatch);
    setIsAddCustomMatchOpen(false);
  };

  // ===========================================================================
  // TAB 1: COMPREHENSIVE LEAGUE DASHBOARD (ANALYTICS, STANDINGS, LEADERS & LIVE GAMES)
  // ===========================================================================
  if (activeTab === "league_dashboard") {
    return (
      <LeagueAnalyticsDashboard
        league={league}
        teams={teams}
        onSwitchTab={onSwitchTab}
        onEditLeague={onEditLeague}
      />
    );
  }

  // If fewer than 2 teams are registered, prompt user to add teams first
  if (teams.length < 2) {
    return (
      <section className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
        <Shield className="mx-auto h-12 w-12 text-slate-400" />
        <h2 className="text-xl font-black uppercase text-slate-800">
          Add At Least 2 Teams to Generate Schedule & Bracket
        </h2>
        <p className="mx-auto max-w-md text-xs text-slate-500">
          You currently have {teams.length} registered{" "}
          {teams.length === 1 ? "team" : "teams"} in {league.name}. Switch to
          the <strong>Teams</strong> tab to add teams first.
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

  const activeFormatMeta =
    BRACKETING_FORMATS.find((f) => f.id === selectedFormatId) ??
    BRACKETING_FORMATS[0];

  const allMatches = existingTournament?.matches ?? [];
  const selectedLeagueCategories = league.categories ?? [];

  const filteredMatches = allMatches.filter((m) => {
    const matchesStage = stageFilter === "ALL" || m.stage === stageFilter;
    const matchesCategory =
      selectedCategoryFilter === "ALL" || m.categoryId === selectedCategoryFilter;
    return matchesStage && matchesCategory;
  });

  const standingsByPool = existingTournament
    ? calculatePoolStandings(existingTournament, teams)
    : {};

  // ===========================================================================
  // TAB 3: GAMES SCHEDULE (TOURNAMENT FORMAT, AI ARCHITECT & MATCH SCHEDULE)
  // ===========================================================================
  
  // Render Individual Match Card
  const renderMatchCard = (match: TournamentMatch) => {
const home = getTeamDisplay(
                match.homeTeamId,
                match.homeTeamPlaceholder
              );
              const away = getTeamDisplay(
                match.awayTeamId,
                match.awayTeamPlaceholder
              );
              const scoreState = scoreInputs[match.id];
              const homeScoreVal =
                scoreState?.home !== undefined
                  ? scoreState.home
                  : match.homeScore !== null
                    ? String(match.homeScore)
                    : "";
              const awayScoreVal =
                scoreState?.away !== undefined
                  ? scoreState.away
                  : match.awayScore !== null
                    ? String(match.awayScore)
                    : "";

              const isFinal = match.status === "FINAL";
              const homeIsWinner =
                isFinal && match.winnerTeamId && match.winnerTeamId === match.homeTeamId;
              const awayIsWinner =
                isFinal && match.winnerTeamId && match.winnerTeamId === match.awayTeamId;

              return (
                <div
                  key={match.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    match.stage === "FINALS"
                      ? "border-amber-400 bg-amber-50/40"
                      : isFinal
                        ? "border-emerald-200 bg-emerald-50/20"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Left: Game #, Round Label, Date, Time, Court */}
                    <div className="space-y-1.5 lg:w-72 shrink-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-[#0B2F5C] px-2 py-0.5 text-[0.65rem] font-black uppercase text-white">
                          Game #{match.gameNumber}
                        </span>
                        {match.categoryName && (
                          <span
                            className="rounded-md px-2 py-0.5 text-[0.65rem] font-black uppercase text-white shadow-2xs"
                            style={{ backgroundColor: match.categoryColor || "#8B0D0E" }}
                          >
                            {match.categoryCode || match.categoryName}
                          </span>
                        )}
                        <span
                          className={`rounded-md px-2 py-0.5 text-[0.65rem] font-black uppercase ${
                            match.stage === "FINALS"
                              ? "bg-amber-400 text-slate-950"
                              : match.stage === "LOSERS"
                                ? "bg-rose-100 text-[#8B0D0E]"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {match.roundLabel}
                        </span>
                        {isFinal && (
                          <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[0.62rem] font-black uppercase text-white">
                            Final
                          </span>
                        )}
                      </div>

                      {/* Editable Date, Time & Court */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 pt-1">
                        <label className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-[#0B2F5C]" />
                          <input
                            type="date"
                            aria-label="Scheduled date"
                            value={match.scheduledDate}
                            onChange={(e) =>
                              updateMatchDetailsInLeague(league.id, match.id, {
                                scheduledDate: e.target.value,
                              })
                            }
                            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.7rem] font-bold text-slate-800"
                          />
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-[#8B0D0E]" />
                          <input
                            type="text"
                            aria-label="Scheduled time"
                            value={match.scheduledTime}
                            onChange={(e) =>
                              updateMatchDetailsInLeague(league.id, match.id, {
                                scheduledTime: e.target.value,
                              })
                            }
                            className="w-20 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.7rem] font-bold text-slate-800"
                          />
                        </label>
                      </div>

                      <div className="flex items-center gap-1 text-[0.7rem] font-bold text-slate-500">
                        <MapPin className="h-3.5 w-3.5 text-[#8B0D0E] shrink-0" />
                        <select
                          aria-label="Assigned court"
                          value={match.courtName}
                          onChange={(e) =>
                            updateMatchDetailsInLeague(league.id, match.id, {
                              courtName: e.target.value,
                            })
                          }
                          className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.7rem] font-bold text-slate-700"
                        >
                          {league.courts.map((c) => {
                            const label = `${c.name} (${c.surfaceType})`;
                            return (
                              <option key={c.id} value={label}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {/* Center: Matchup Teams & Score Inputs */}
                    <div className="flex-1 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 min-w-0">
                      {/* Home Team */}
                      <div
                        className={`flex-1 min-w-0 flex items-center justify-between gap-2 rounded-xl border p-2.5 ${
                          homeIsWinner
                            ? "border-emerald-500 bg-emerald-50/70"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {home.imageUrl ? (
                            <img
                              src={home.imageUrl}
                              alt={home.name}
                              className="h-8 w-8 rounded-lg object-cover bg-white p-0.5 border border-slate-200 shrink-0"
                            />
                          ) : (
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[0.65rem] font-black uppercase text-white"
                              style={{ backgroundColor: home.primaryColor }}
                            >
                              {home.name.slice(0, 2)}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black uppercase text-slate-900" title={home.name}>
                              {home.name}
                            </span>
                            <span className="block truncate text-[0.62rem] font-bold uppercase text-slate-400" title={match.homeTeamPlaceholder}>
                              {match.homeTeamPlaceholder}
                            </span>
                          </div>
                        </div>
                        {homeIsWinner && (
                          <Crown className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                      </div>

                      {/* Score Inputs */}
                      <div className="flex items-center justify-center gap-1.5 shrink-0 px-1 py-0.5">
                        <input
                          type="number"
                          min={0}
                          max={250}
                          placeholder="-"
                          aria-label={`${home.name} score`}
                          value={homeScoreVal}
                          onChange={(e) =>
                            setScoreInputs((prev) => ({
                              ...prev,
                              [match.id]: {
                                home: e.target.value,
                                away: awayScoreVal,
                              },
                            }))
                          }
                          className="w-13 rounded-xl border border-slate-300 bg-white px-1.5 py-1.5 text-center text-sm font-black text-slate-900 tabular-nums shadow-2xs"
                        />
                        <span className="text-[0.65rem] font-black uppercase text-slate-400">
                          VS
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={250}
                          placeholder="-"
                          aria-label={`${away.name} score`}
                          value={awayScoreVal}
                          onChange={(e) =>
                            setScoreInputs((prev) => ({
                              ...prev,
                              [match.id]: {
                                home: homeScoreVal,
                                away: e.target.value,
                              },
                            }))
                          }
                          className="w-13 rounded-xl border border-slate-300 bg-white px-1.5 py-1.5 text-center text-sm font-black text-slate-900 tabular-nums shadow-2xs"
                        />
                      </div>

                      {/* Away Team */}
                      <div
                        className={`flex-1 min-w-0 flex items-center justify-between gap-2 rounded-xl border p-2.5 ${
                          awayIsWinner
                            ? "border-emerald-500 bg-emerald-50/70"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {away.imageUrl ? (
                            <img
                              src={away.imageUrl}
                              alt={away.name}
                              className="h-8 w-8 rounded-lg object-cover bg-white p-0.5 border border-slate-200 shrink-0"
                            />
                          ) : (
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[0.65rem] font-black uppercase text-white"
                              style={{ backgroundColor: away.primaryColor }}
                            >
                              {away.name.slice(0, 2)}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black uppercase text-slate-900" title={away.name}>
                              {away.name}
                            </span>
                            <span className="block truncate text-[0.62rem] font-bold uppercase text-slate-400" title={match.awayTeamPlaceholder}>
                              {match.awayTeamPlaceholder}
                            </span>
                          </div>
                        </div>
                        {awayIsWinner && (
                          <Crown className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                      </div>
                    </div>

                    {/* Right: Manage Scorebook / Save Game & Score / Quick Sim / Delete */}
                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                      {/* Move Game Up/Down Order Controls */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            reorderMatchesInLeague(league.id, match.id, "up")
                          }
                          title="Move Game Up (Earlier in Schedule)"
                          aria-label={`Move Game #${match.gameNumber} Up`}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 hover:bg-slate-200 cursor-pointer transition-colors"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            reorderMatchesInLeague(league.id, match.id, "down")
                          }
                          title="Move Game Down (Later in Schedule)"
                          aria-label={`Move Game #${match.gameNumber} Down`}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 hover:bg-slate-200 cursor-pointer transition-colors"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          openMatchInGameManagement(league.id, match.id);
                          onSwitchTab("game_details");
                        }}
                        title="View In-Depth Game Details & Telemetry"
                        aria-label="View In-Depth Game Details"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white p-2.5 xl:px-3 xl:py-2 text-xs font-black uppercase tracking-wider text-slate-800 shadow-2xs hover:bg-slate-50 cursor-pointer transition-transform active:scale-95"
                      >
                        <Trophy className="h-4 w-4 text-amber-500" />
                        <span className="hidden xl:inline">Details</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openMatchInGameManagement(league.id, match.id)
                        }
                        title="Open Live Scorebook"
                        aria-label="Open Live Scorebook"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0D0E] p-2.5 xl:px-3 xl:py-2 text-xs font-black uppercase tracking-wider text-white shadow-2xs hover:opacity-95 cursor-pointer transition-transform active:scale-95"
                      >
                        <ClipboardList className="h-4 w-4" />
                        <span className="hidden xl:inline">Scorebook</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveMatchScore(match)}
                        title={homeScoreVal && awayScoreVal ? "Save Score" : "Save Game"}
                        aria-label={homeScoreVal && awayScoreVal ? "Save Score" : "Save Game"}
                        className={`inline-flex items-center gap-1.5 rounded-xl p-2.5 xl:px-3 xl:py-2 text-xs font-black uppercase tracking-wider text-white transition-all cursor-pointer active:scale-95 ${
                          savedMatchRowIds[match.id]
                            ? "bg-emerald-600 ring-2 ring-emerald-300"
                            : "bg-[#0B2F5C] hover:opacity-95"
                        }`}
                      >
                        {savedMatchRowIds[match.id] ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="hidden xl:inline">Saved</span>
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            <span className="hidden xl:inline">
                              {homeScoreVal && awayScoreVal
                                ? "Save Score"
                                : "Save Game"}
                            </span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={!match.homeTeamId || !match.awayTeamId}
                        onClick={() => handleSimulateSingleMatch(match)}
                        title="Simulate final score"
                        aria-label="Simulate final score"
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-50 p-2.5 xl:px-2.5 xl:py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer active:scale-95"
                      >
                        <Dices className="h-4 w-4 text-slate-600" />
                        <span className="hidden xl:inline">Sim</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMatchInLeague(league.id, match.id)}
                        aria-label={`Delete Game #${match.gameNumber}`}
                        title={`Delete Game #${match.gameNumber}`}
                        className="rounded-lg p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
  };


  // Render Tournament Format & Gemini AI Architect
  const renderFormatAndAiArchitect = () => {
    return (
      <div className="space-y-6">
        {/* 1. GEMINI AI TOURNAMENT ARCHITECT & FORMAT CO-PILOT */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-white"
            style={{
              background: "linear-gradient(135deg, #0B2F5C 0%, #8B0D0E 100%)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-slate-950 shadow-sm">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black uppercase tracking-tight">
                    Gemini AI Tournament Format & Schedule Co-Pilot
                  </h2>
                  <span className="rounded-md bg-emerald-500/25 border border-emerald-300/40 px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-wider text-emerald-200">
                    Gemini API Key Active
                  </span>
                </div>
                <p className="text-xs text-slate-200">
                  Analyzes your {teams.length} teams, {league.courts.length}{" "}
                  {league.courts.length === 1 ? "court" : "courts"} (
                  {league.courts.map((c) => c.name).join(", ")}), and{" "}
                  {league.ruleSetId} rules to build the optimal bracket and
                  schedule.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isAiLoading}
              onClick={() => handleAskGeminiAi("recommend_format")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-sm hover:bg-amber-300 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {isAiLoading
                ? "Gemini AI Analyzing..."
                : "Ask Gemini to Recommend Format"}
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Natural Language Prompt Bar */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ask Gemini AI (e.g., 'Split our 10 teams into Bracket A and Bracket B with Top 4 advancing to Knockout Semifinals' or 'Use Page-McIntyre Top 4')"
                className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-900 focus:border-[#0B2F5C] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                disabled={isAiLoading}
                onClick={() => handleAskGeminiAi("custom_prompt")}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B2F5C] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Ask Gemini AI
              </button>
            </div>

            {/* AI Recommendation Result Card */}
            {aiResponse && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#8B0D0E]" />
                    <h3 className="text-sm font-black uppercase text-slate-900">
                      {aiResponse.headline}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyAiRecommendation}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#8B0D0E] px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-2xs hover:opacity-95 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Apply AI Format & Generate Schedule
                  </button>
                </div>

                <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                  {aiResponse.analysisMarkdown}
                </p>

                {aiResponse.scheduleTips.length > 0 && (
                  <ul className="space-y-1 text-xs text-slate-700 list-disc pl-5">
                    {aiResponse.scheduleTips.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 2. COMMON BRACKETING TYPES SELECTOR (ALL 6 OFFICIAL FORMATS) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                1. Select Tournament Bracketing Format
              </h2>
              <p className="text-xs text-slate-500">
                Choose from the 6 official basketball bracketing structures to
                generate your league schedule and playoff tree.
              </p>
            </div>

            {canManageSchedule && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGenerateTournament(selectedFormatId, true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Shuffle Seeds &amp; Rebuild
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateTournament(selectedFormatId, false)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0D0E] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:opacity-95 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Generate Schedule &amp; Bracket
                </button>
              </div>
            )}
          </div>

          {/* 6 Bracketing Type Cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {BRACKETING_FORMATS.map((fmt) => {
              const isSelected = selectedFormatId === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => {
                    setSelectedFormatId(fmt.id);
                    handleGenerateTournament(fmt.id, false);
                  }}
                  className={`flex flex-col justify-between rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-[#0B2F5C] bg-[#0B2F5C] text-white shadow-md"
                      : "border-slate-200 bg-slate-50/70 text-slate-900 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wider ${
                          isSelected
                            ? "bg-amber-400 text-slate-950"
                            : "bg-[#8B0D0E]/10 text-[#8B0D0E]"
                        }`}
                      >
                        {fmt.subtitle}
                      </span>
                      {isSelected && (
                        <span className="text-[0.65rem] font-black uppercase text-emerald-300">
                          ● Active Format
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-black uppercase tracking-tight">
                      {fmt.title}
                    </h3>

                    <p
                      className={`text-xs leading-relaxed ${
                        isSelected ? "text-slate-200" : "text-slate-600"
                      }`}
                    >
                      {fmt.description}
                    </p>
                  </div>

                  <div
                    className={`mt-3 border-t pt-2.5 text-[0.68rem] ${
                      isSelected
                        ? "border-white/15 text-amber-200"
                        : "border-slate-200 text-slate-500"
                    }`}
                  >
                    <strong>Example:</strong> {fmt.exampleLeagues}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Format Mechanics & Sub-Options Bar */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[0.68rem] font-black uppercase tracking-wider text-[#8B0D0E]">
                  Active Format Configuration
                </span>
                <h3 className="text-base font-black uppercase text-slate-900">
                  {activeFormatMeta.title} — {activeFormatMeta.tagline}
                </h3>
              </div>

              {/* Format-Specific Controls */}
              <div className="flex flex-wrap items-center gap-3">
                {(selectedFormatId === "ROUND_ROBIN" ||
                  selectedFormatId === "MULTI_STAGE") && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="pools-count-select"
                      className="text-xs font-black uppercase text-slate-700"
                    >
                      Group Pools:
                    </label>
                    <select
                      id="pools-count-select"
                      value={poolsCount}
                      onChange={(e) => {
                        const val = Number(e.target.value) as 1 | 2 | 4;
                        setPoolsCount(val);
                        const generated = generateLeagueTournamentData({
                          league,
                          teams,
                          formatId: selectedFormatId,
                          poolsCount: val,
                          advancingPerPool,
                          seriesBestOf,
                          stepladderVariant,
                        });
                        saveLeagueTournamentData(league.id, generated);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900"
                    >
                      <option value={1}>1 Pool (Single Standings)</option>
                      <option value={2}>2 Pools (Bracket A & Bracket B)</option>
                      {teams.length >= 8 && (
                        <option value={4}>4 Pools (Brackets A, B, C, D)</option>
                      )}
                    </select>
                  </div>
                )}

                {selectedFormatId === "MULTI_STAGE" && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="advancing-select"
                      className="text-xs font-black uppercase text-slate-700"
                    >
                      Playoff Cutoff:
                    </label>
                    <select
                      id="advancing-select"
                      value={advancingPerPool}
                      onChange={(e) => {
                        const val = Number(e.target.value) as 2 | 4;
                        setAdvancingPerPool(val);
                        const generated = generateLeagueTournamentData({
                          league,
                          teams,
                          formatId: selectedFormatId,
                          poolsCount,
                          advancingPerPool: val,
                          seriesBestOf,
                          stepladderVariant,
                        });
                        saveLeagueTournamentData(league.id, generated);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900"
                    >
                      <option value={2}>
                        Top 2 per Pool → Semifinals (4-Team Knockout)
                      </option>
                      {teams.length >= 8 && (
                        <option value={4}>
                          Top 4 per Pool → Quarterfinals (8-Team Knockout)
                        </option>
                      )}
                    </select>
                  </div>
                )}

                {selectedFormatId === "SERIES_PLAYOFF" && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="series-bestof-select"
                      className="text-xs font-black uppercase text-slate-700"
                    >
                      Series Length:
                    </label>
                    <select
                      id="series-bestof-select"
                      value={seriesBestOf}
                      onChange={(e) => {
                        const val = Number(e.target.value) as 3 | 5 | 7;
                        setSeriesBestOf(val);
                        const generated = generateLeagueTournamentData({
                          league,
                          teams,
                          formatId: "SERIES_PLAYOFF",
                          poolsCount,
                          advancingPerPool,
                          seriesBestOf: val,
                          stepladderVariant,
                        });
                        saveLeagueTournamentData(league.id, generated);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900"
                    >
                      <option value={3}>Best-of-3 Series (First to 2 Wins)</option>
                      <option value={5}>Best-of-5 Series (First to 3 Wins)</option>
                      <option value={7}>Best-of-7 Series (First to 4 Wins)</option>
                    </select>
                  </div>
                )}

                {selectedFormatId === "PAGE_MCINTYRE" && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="stepladder-variant-select"
                      className="text-xs font-black uppercase text-slate-700"
                    >
                      Seeded Tree Type:
                    </label>
                    <select
                      id="stepladder-variant-select"
                      value={stepladderVariant}
                      onChange={(e) => {
                        const val = e.target.value as
                          | "PAGE_MCINTYRE_TOP4"
                          | "STEPLADDER_CLIMB";
                        setStepladderVariant(val);
                        const generated = generateLeagueTournamentData({
                          league,
                          teams,
                          formatId: "PAGE_MCINTYRE",
                          poolsCount,
                          advancingPerPool,
                          seriesBestOf,
                          stepladderVariant: val,
                        });
                        saveLeagueTournamentData(league.id, generated);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900"
                    >
                      <option value="PAGE_MCINTYRE_TOP4">
                        Page-McIntyre Top-4 System (1v2 Qualifier & 3v4 Knockout)
                      </option>
                      <option value="STEPLADDER_CLIMB">
                        Stepladder Sudden-Death Climb (#6 → #5 → #4 → #3 → #2 → #1)
                      </option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
              {activeFormatMeta.keyMechanics.map((m, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-200 bg-white p-2.5 font-semibold text-slate-700"
                >
                  • {m}
                </div>
              ))}
            </div>

            {/* Pool Breakdown Preview when Pools are active */}
            {existingTournament && existingTournament.pools.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
                {existingTournament.pools.map((pool) => (
                  <div
                    key={pool.id}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase tracking-wider text-[#0B2F5C]">
                        {pool.name} ({pool.teamIds.length} Teams)
                      </span>
                      <span className="text-[0.65rem] font-bold uppercase text-slate-400">
                        Round-Robin Group
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pool.teamIds.map((tid, idx) => {
                        const t = teamMap.get(tid);
                        if (!t) return null;
                        return (
                          <span
                            key={tid}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-800"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: t.primaryColor }}
                            />
                            #{idx + 1} {t.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  };


  // Calendar View Helpers & Calculations
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const matchesByDate = new Map<string, TournamentMatch[]>();
    allMatches.forEach((m) => {
      if (m.scheduledDate) {
        const list = matchesByDate.get(m.scheduledDate) || [];
        list.push(m);
        matchesByDate.set(m.scheduledDate, list);
      }
    });

    const days: Array<{
      dateString: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      matches: TournamentMatch[];
    }> = [];

    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, "0");
      const d = String(dayNum).padStart(2, "0");
      const ds = `${y}-${m}-${d}`;
      days.push({
        dateString: ds,
        dayNumber: dayNum,
        isCurrentMonth: false,
        matches: matchesByDate.get(ds) || [],
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const curDate = new Date(year, month, day);
      const y = curDate.getFullYear();
      const m = String(curDate.getMonth() + 1).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      const ds = `${y}-${m}-${d}`;
      days.push({
        dateString: ds,
        dayNumber: day,
        isCurrentMonth: true,
        matches: matchesByDate.get(ds) || [],
      });
    }

    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const nextDate = new Date(year, month + 1, i);
        const y = nextDate.getFullYear();
        const m = String(nextDate.getMonth() + 1).padStart(2, "0");
        const d = String(i).padStart(2, "0");
        const ds = `${y}-${m}-${d}`;
        days.push({
          dateString: ds,
          dayNumber: i,
          isCurrentMonth: false,
          matches: matchesByDate.get(ds) || [],
        });
      }
    }

    return days;
  }, [calendarMonth, allMatches]);

  const calendarSelectedMatches = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return allMatches.filter((m) => m.scheduledDate === selectedCalendarDate);
  }, [allMatches, selectedCalendarDate]);

  // ===========================================================================
  // TAB 3: GAMES SCHEDULE (TOURNAMENT FORMAT, AI ARCHITECT & MATCH SCHEDULE)
  // ===========================================================================
  if (activeTab === "schedule") {
    // If no schedule exists yet, show format selection & AI architect so user can set it up
    if (allMatches.length === 0) {
      return (
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black uppercase text-amber-900">
                No Games Scheduled Yet
              </h3>
              <p className="text-xs text-amber-800">
                Choose a bracketing format below and click &quot;Generate Schedule &amp; Bracket&quot; to build the official league schedule.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleGenerateTournament(selectedFormatId, false)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0D0E] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:opacity-95 cursor-pointer shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              Generate Schedule Now
            </button>
          </div>
          {renderFormatAndAiArchitect()}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Edit Format & Bracketing Modal Dialog */}
        {isEditFormatModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs overflow-y-auto">
            <div className="relative w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B2F5C] text-white">
                    <Pencil className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight text-slate-900">
                      Edit Bracketing Structure &amp; Schedule
                    </h3>
                    <p className="text-xs text-slate-500">
                      Reconfigure tournament format, pools, or ask Gemini AI to rebuild the schedule.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditFormatModalOpen(false)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {renderFormatAndAiArchitect()}
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-3.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditFormatModalOpen(false)}
                  className="rounded-xl bg-[#0B2F5C] px-5 py-2.5 text-xs font-black uppercase text-white hover:opacity-95 cursor-pointer shadow-xs"
                >
                  Close &amp; View Games
                </button>
              </div>
            </div>
          </div>
        )}

        {/* OFFICIAL GAMES SCHEDULE SECTION */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          {/* Header Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                  Official Games Schedule ({allMatches.length} Games)
                </h2>
                <span className="rounded-md bg-slate-100 text-slate-700 px-2 py-0.5 text-[0.65rem] font-black uppercase">
                  {activeFormatMeta.title}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                View games in List or Calendar mode, edit dates, times, courts, or enter scores to advance standings.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* View Mode Switcher: List vs Calendar */}
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setScheduleViewMode("list")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    scheduleViewMode === "list"
                      ? "bg-white text-[#0B2F5C] shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  List View
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleViewMode("calendar")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    scheduleViewMode === "calendar"
                      ? "bg-white text-[#0B2F5C] shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Calendar View
                </button>
              </div>

              {/* Edit Schedule / Format Button */}
              {canManageSchedule && (
                <button
                  type="button"
                  onClick={() => setIsEditFormatModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-black uppercase tracking-wider text-slate-800 hover:bg-slate-50 cursor-pointer shadow-2xs"
                >
                  <Pencil className="h-3.5 w-3.5 text-[#0B2F5C]" />
                  Edit Schedule / Format
                </button>
              )}

              {/* Scoreboard Screen Link */}
              <a
                href={`/scoreboard?leagueId=${league.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open Live Scoreboard Page for external monitors/projectors"
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-slate-900 hover:bg-amber-100 cursor-pointer shadow-2xs"
              >
                <Tv className="h-4 w-4 text-[#8B0D0E]" />
                Scoreboard Screen ↗
              </a>

              {canManageSchedule && (
                <>
                  <button
                    type="button"
                    onClick={handleSaveAllOrganizerGames}
                    disabled={isSavingSchedule}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer transition-transform active:scale-95"
                  >
                    <Save className="h-4 w-4" />
                    {isSavingSchedule ? "Saving..." : "Save Games"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSimulateAllPlayableMatches}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-900 hover:bg-amber-100 cursor-pointer"
                  >
                    <Dices className="h-4 w-4 text-[#8B0D0E]" />
                    Sim All
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddCustomMatchOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    + Custom Game
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => onSwitchTab("bracket")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0D0E] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white cursor-pointer"
              >
                <GitBranch className="h-4 w-4" />
                Bracket →
              </button>
            </div>
          </div>

          {savedScheduleBanner && (
            <div
              role="status"
              className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-black uppercase text-emerald-950 shadow-xs"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                {savedScheduleBanner}
              </span>
              <button
                type="button"
                onClick={() => setSavedScheduleBanner(null)}
                className="text-emerald-800 underline uppercase"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Add Custom Game Drawer */}
          {isAddCustomMatchOpen && (
            <form
              onSubmit={handleAddCustomMatchSubmit}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
            >
              <div className="text-xs font-black uppercase tracking-wider text-[#0B2F5C]">
                Schedule Custom Matchup
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                <select
                  required
                  value={customHomeId}
                  onChange={(e) => setCustomHomeId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900"
                >
                  <option value="">Select Home Team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  required
                  value={customAwayId}
                  onChange={(e) => setCustomAwayId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900"
                >
                  <option value="">Select Away Team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={customRoundLabel}
                  onChange={(e) => setCustomRoundLabel(e.target.value)}
                  placeholder="Round Label (e.g. Exhibition)"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                />
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    placeholder="04:00 PM"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[#8B0D0E] px-4 py-2 text-xs font-black uppercase text-white cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Category Filter Pills (if league has multiple categories) */}
          {selectedLeagueCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 mr-1">
                Filter by Category:
              </span>
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter("ALL")}
                className={`rounded-xl px-3 py-1 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
                  selectedCategoryFilter === "ALL"
                    ? "bg-[#0B2F5C] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All Divisions ({allMatches.length})
              </button>
              {selectedLeagueCategories.map((cat) => {
                const count = allMatches.filter(
                  (m) => m.categoryId === cat.id
                ).length;
                const isSelected = selectedCategoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={`rounded-xl px-3 py-1 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                      isSelected
                        ? "text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                    style={
                      isSelected
                        ? { backgroundColor: cat.color || "#0B2F5C" }
                        : undefined
                    }
                  >
                    {cat.name} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Stage Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
            {[
              { id: "ALL", label: `All Games (${allMatches.length})` },
              {
                id: "POOL",
                label: `Pool / Group Stage (${allMatches.filter((m) => m.stage === "POOL").length})`,
              },
              {
                id: "WINNERS",
                label: `Winners' Bracket (${allMatches.filter((m) => m.stage === "WINNERS").length})`,
              },
              {
                id: "LOSERS",
                label: `Losers' Bracket (${allMatches.filter((m) => m.stage === "LOSERS").length})`,
              },
              {
                id: "PLAYOFF",
                label: `Knockout Playoffs (${allMatches.filter((m) => m.stage === "PLAYOFF").length})`,
              },
              {
                id: "SERIES",
                label: `Series Games (${allMatches.filter((m) => m.stage === "SERIES").length})`,
              },
              {
                id: "STEPLADDER",
                label: `Page-McIntyre / Stepladder (${allMatches.filter((m) => m.stage === "STEPLADDER").length})`,
              },
              {
                id: "FINALS",
                label: `Championship Finals (${allMatches.filter((m) => m.stage === "FINALS").length})`,
              },
            ]
              .filter(
                (tab) =>
                  tab.id === "ALL" ||
                  allMatches.some((m) => m.stage === tab.id)
              )
              .map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStageFilter(tab.id)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
                    stageFilter === tab.id
                      ? "bg-[#0B2F5C] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
          </div>

          {/* SCHEDULE VIEW SWITCHER: LIST vs CALENDAR */}
          {scheduleViewMode === "calendar" ? (
            /* =========================================================
               CALENDAR VIEW: Interactive Monthly Grid with Daily Game Inspector
               ========================================================= */
            <div className="space-y-6">
              {/* Calendar Header / Month Navigator */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-[#0B2F5C]" />
                  <span className="text-base font-black uppercase tracking-tight text-slate-900">
                    {calendarMonth.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
                    {allMatches.filter((m) => {
                      if (!m.scheduledDate) return false;
                      const d = new Date(m.scheduledDate);
                      return (
                        d.getFullYear() === calendarMonth.getFullYear() &&
                        d.getMonth() === calendarMonth.getMonth()
                      );
                    }).length} Games This Month
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonth(
                        (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev Month
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonth(
                        (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs"
                  >
                    Next Month
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 7-Day Calendar Grid */}
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                {/* Days of Week Header */}
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center text-[0.68rem] font-black uppercase tracking-wider text-slate-600 py-2.5">
                  <div>Sun</div>
                  <div>Mon</div>
                  <div>Tue</div>
                  <div>Wed</div>
                  <div>Thu</div>
                  <div>Fri</div>
                  <div>Sat</div>
                </div>

                {/* Calendar Days Cells */}
                <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
                  {calendarDays.map((day, idx) => {
                    const isSelected = selectedCalendarDate === day.dateString;
                    const hasGames = day.matches.length > 0;

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (hasGames) {
                            setSelectedCalendarDate(isSelected ? "" : day.dateString);
                          }
                        }}
                        className={`min-h-[100px] p-2 transition-all ${
                          !day.isCurrentMonth
                            ? "bg-slate-50/60 text-slate-300"
                            : "bg-white text-slate-800"
                        } ${
                          isSelected
                            ? "ring-2 ring-inset ring-[#0B2F5C] bg-blue-50/40"
                            : ""
                        } ${
                          hasGames
                            ? "cursor-pointer hover:bg-slate-50"
                            : "cursor-default"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-black rounded-full h-6 w-6 flex items-center justify-center ${
                              isSelected
                                ? "bg-[#0B2F5C] text-white"
                                : hasGames
                                  ? "bg-amber-100 text-amber-950 font-black"
                                  : day.isCurrentMonth
                                    ? "text-slate-700"
                                    : "text-slate-300"
                            }`}
                          >
                            {day.dayNumber}
                          </span>
                          {hasGames && (
                            <span className="rounded-full bg-[#8B0D0E] px-1.5 py-0.2 text-[0.6rem] font-black text-white">
                              {day.matches.length} {day.matches.length === 1 ? "game" : "games"}
                            </span>
                          )}
                        </div>

                        {/* Match pills in calendar cell */}
                        <div className="mt-1.5 space-y-1">
                          {day.matches.slice(0, 3).map((m) => {
                            const hName = teams.find((t) => t.id === m.homeTeamId)?.name || m.homeTeamPlaceholder;
                            const aName = teams.find((t) => t.id === m.awayTeamId)?.name || m.awayTeamPlaceholder;
                            return (
                              <div
                                key={m.id}
                                className="truncate rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[0.62rem] font-bold text-slate-800 shadow-2xs hover:border-[#0B2F5C]"
                                title={`Game #${m.gameNumber}: ${hName} vs ${aName} (${m.scheduledTime})`}
                              >
                                <span className="text-[#0B2F5C] font-black mr-1">#{m.gameNumber}</span>
                                {hName.slice(0, 4)} vs {aName.slice(0, 4)}
                              </div>
                            );
                          })}
                          {day.matches.length > 3 && (
                            <div className="text-[0.6rem] font-bold text-slate-500 text-center">
                              +{day.matches.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Daily Game Inspector (when date is selected) */}
              {selectedCalendarDate ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-[#0B2F5C]" />
                      <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">
                        Games on {selectedCalendarDate} ({calendarSelectedMatches.length})
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCalendarDate("")}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 underline uppercase"
                    >
                      Clear Selection
                    </button>
                  </div>

                  <div className="space-y-3">
                    {calendarSelectedMatches.map((match) => renderMatchCard(match))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                  Tip: Click on any calendar day with scheduled games to inspect, edit, or enter scores for that specific day.
                </div>
              )}
            </div>
          ) : (
            /* =========================================================
               LIST VIEW: Linear Games List with Detailed Match Cards
               ========================================================= */
            <div className="space-y-3">
              {filteredMatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500">
                  No games match the selected stage or category filters.
                </div>
              ) : (
                filteredMatches.map((match) => renderMatchCard(match))
              )}
            </div>
          )}
        </section>
      </div>
    );
  }
  // ===========================================================================
  // TAB 4: BRACKET (VISUAL TOURNAMENT BRACKET, POOL STANDINGS & PLAYOFF TREE)
  // ===========================================================================
  const finalMatch = [...allMatches]
    .reverse()
    .find((m) => m.stage === "FINALS" && m.winnerTeamId);
  const tournamentChampion = finalMatch?.winnerTeamId
    ? teamMap.get(finalMatch.winnerTeamId) ?? null
    : null;

  const renderMatchBracketCard = (match: TournamentMatch) => {
    const home = getTeamDisplay(match.homeTeamId, match.homeTeamPlaceholder);
    const away = getTeamDisplay(match.awayTeamId, match.awayTeamPlaceholder);
    const isFinal = match.status === "FINAL";
    const homeWon = isFinal && match.winnerTeamId === match.homeTeamId;
    const awayWon = isFinal && match.winnerTeamId === match.awayTeamId;

    return (
      <div
        key={match.id}
        className={`rounded-2xl border bg-white shadow-xs overflow-hidden transition-all ${
          match.stage === "FINALS"
            ? "border-2 border-amber-400 ring-2 ring-amber-200/60"
            : "border-slate-200"
        }`}
      >
        <div
          className="flex items-center justify-between px-3 py-1.5 text-[0.65rem] font-black uppercase tracking-wider text-white"
          style={{
            backgroundColor:
              match.stage === "FINALS"
                ? "#8B0D0E"
                : match.stage === "LOSERS"
                  ? "#475569"
                  : "#0B2F5C",
          }}
        >
          <span>
            G{match.gameNumber} • {match.roundLabel}
          </span>
          <span className="text-amber-300">{match.scheduledDate}</span>
        </div>

        <div className="divide-y divide-slate-100 p-2.5 space-y-1.5">
          {/* Home Slot */}
          <div
            className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ${
              homeWon ? "bg-emerald-50 font-black" : "bg-slate-50/70"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {home.imageUrl ? (
                <img
                  src={home.imageUrl}
                  alt={home.name}
                  className="h-6 w-6 rounded object-cover bg-white"
                />
              ) : (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[0.6rem] font-black text-white"
                  style={{ backgroundColor: home.primaryColor }}
                >
                  {home.name.slice(0, 2)}
                </span>
              )}
              <span
                className={`truncate text-xs uppercase ${
                  home.isResolved
                    ? "font-black text-slate-900"
                    : "font-semibold italic text-slate-400"
                }`}
              >
                {home.name}
              </span>
            </div>
            <span
              className={`text-sm font-black tabular-nums ${
                homeWon ? "text-emerald-700" : "text-slate-700"
              }`}
            >
              {match.homeScore !== null ? match.homeScore : "-"}
            </span>
          </div>

          {/* Away Slot */}
          <div
            className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 pt-2 ${
              awayWon ? "bg-emerald-50 font-black" : "bg-slate-50/70"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {away.imageUrl ? (
                <img
                  src={away.imageUrl}
                  alt={away.name}
                  className="h-6 w-6 rounded object-cover bg-white"
                />
              ) : (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[0.6rem] font-black text-white"
                  style={{ backgroundColor: away.primaryColor }}
                >
                  {away.name.slice(0, 2)}
                </span>
              )}
              <span
                className={`truncate text-xs uppercase ${
                  away.isResolved
                    ? "font-black text-slate-900"
                    : "font-semibold italic text-slate-400"
                }`}
              >
                {away.name}
              </span>
            </div>
            <span
              className={`text-sm font-black tabular-nums ${
                awayWon ? "text-emerald-700" : "text-slate-700"
              }`}
            >
              {match.awayScore !== null ? match.awayScore : "-"}
            </span>
          </div>
        </div>

        {/* Quick Sim / Action Footer */}
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 flex items-center justify-between gap-2 text-[0.65rem]">
          <button
            type="button"
            onClick={() => openMatchInGameManagement(league.id, match.id)}
            className="inline-flex items-center gap-1 font-black uppercase text-[#0B2F5C] hover:underline cursor-pointer shrink-0"
          >
            <ClipboardList className="h-3 w-3 text-[#8B0D0E]" />
            Open Scorebook
          </button>
          {match.homeTeamId && match.awayTeamId && (
            <button
              type="button"
              onClick={() => handleSimulateSingleMatch(match)}
              className="font-black uppercase text-[#8B0D0E] hover:underline cursor-pointer shrink-0"
            >
              {isFinal ? "Re-Sim" : "Sim Result →"}
            </button>
          )}
        </div>
      </div>
    );
  };

  // Group knockout matches by roundNumber for visual tree columns
  const getRoundsForStages = (stages: string[]) => {
    const relevant = allMatches.filter((m) => stages.includes(m.stage));
    const roundNums = Array.from(
      new Set(relevant.map((m) => m.roundNumber))
    ).sort((a, b) => a - b);
    return roundNums.map((rNum) => ({
      roundNumber: rNum,
      matches: relevant.filter((m) => m.roundNumber === rNum),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Bracket Control Banner */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-[#8B0D0E] px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-white">
                {activeFormatMeta.title}
              </span>
              <span className="text-xs font-bold text-slate-500">
                • {allMatches.filter((m) => m.status === "FINAL").length} of{" "}
                {allMatches.length} Games Completed
              </span>
            </div>
            <h2 className="mt-1.5 text-2xl font-black uppercase tracking-tight text-slate-900">
              {league.name} — Official Tournament & Playoff Bracket
            </h2>
            <p className="text-xs text-slate-600">
              {activeFormatMeta.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedFormatId === "MULTI_STAGE" && (
              <button
                type="button"
                onClick={() => seedPlayoffsInLeague(league.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-sm hover:bg-amber-300 cursor-pointer"
              >
                <Trophy className="h-4 w-4" />
                Seed Playoff Bracket from Pool Standings
              </button>
            )}
            <button
              type="button"
              onClick={handleSimulateAllPlayableMatches}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:opacity-95 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" />
              Simulate Next Playable Round
            </button>
            <button
              type="button"
              onClick={() => onSwitchTab("schedule")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-800 hover:bg-slate-100 cursor-pointer"
            >
              Change Format / Edit Schedule
            </button>
          </div>
        </div>

        {/* Tournament Champion Banner if Crowned */}
        {tournamentChampion && (
          <div
            className="mt-5 flex items-center justify-between rounded-2xl p-4 text-white shadow-md"
            style={{
              background: `linear-gradient(135deg, ${tournamentChampion.primaryColor} 0%, ${tournamentChampion.secondaryColor} 100%)`,
            }}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow">
                <Trophy className="h-8 w-8" />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-amber-300">
                  {league.name} Tournament Champion
                </span>
                <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
                  {tournamentChampion.name}
                </h3>
                <p className="text-xs font-bold text-white/90">
                  Head Coach: {tournamentChampion.headCoach || "TBA"} • Manager:{" "}
                  {tournamentChampion.manager || "TBA"}
                </p>
              </div>
            </div>
            <Crown className="h-10 w-10 text-amber-300 hidden sm:block" />
          </div>
        )}
      </section>

      {/* =====================================================================
          STAGE 1: POOL PLAY / GROUP STAGE STANDINGS TABLES (ROUND_ROBIN & MULTI_STAGE)
         ===================================================================== */}
      {(selectedFormatId === "ROUND_ROBIN" ||
        selectedFormatId === "MULTI_STAGE") && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">
                {selectedFormatId === "MULTI_STAGE"
                  ? "Stage 1: Group Stage / Pool Play Standings"
                  : "Round-Robin Pool Standings"}
              </h3>
              <p className="text-xs text-slate-500">
                Ranked by Wins, Win %, and FIBA Point Differential (+/-). Top{" "}
                {advancingPerPool} per pool qualify for the Knockout Playoff
                Bracket.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {Object.entries(standingsByPool).map(([poolName, rows]) => (
              <div
                key={poolName}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
              >
                <div
                  className="flex items-center justify-between px-5 py-3 text-white"
                  style={{ backgroundColor: "#0B2F5C" }}
                >
                  <span className="text-sm font-black uppercase tracking-wider">
                    {poolName} Standings
                  </span>
                  <span className="text-[0.68rem] font-bold uppercase text-amber-300">
                    Top {advancingPerPool} Advance
                  </span>
                </div>

                <div
                  className="overflow-x-auto"
                  role="region"
                  aria-label={`${poolName} Standings`}
                  tabIndex={0}
                >
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[0.68rem] font-black uppercase text-slate-500">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Team</th>
                        <th className="py-2.5 px-2.5 text-right">W-L</th>
                        <th className="py-2.5 px-2.5 text-right">PCT</th>
                        <th className="py-2.5 px-2.5 text-right">PF</th>
                        <th className="py-2.5 px-2.5 text-right">PA</th>
                        <th className="py-2.5 px-2.5 text-right">DIFF</th>
                        <th className="py-2.5 px-3 text-center">STRK</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {rows.map((row, idx) => {
                        const qualifies =
                          selectedFormatId === "MULTI_STAGE" &&
                          idx < advancingPerPool;
                        const tObj = teamMap.get(row.teamId);
                        return (
                          <tr
                            key={row.teamId}
                            className={
                              qualifies ? "bg-emerald-50/50" : "bg-white"
                            }
                          >
                            <td className="py-2.5 px-3 font-black text-slate-700 tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-3 w-3 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      tObj?.primaryColor || "#8B0D0E",
                                  }}
                                />
                                <span className="font-black uppercase text-slate-900">
                                  {row.teamName}
                                </span>
                                {qualifies && (
                                  <span className="rounded bg-emerald-600 px-1.5 py-0.2 text-[0.6rem] font-black uppercase text-white">
                                    Q
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-black text-slate-900 tabular-nums">
                              {row.wins}-{row.losses}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-semibold text-slate-600 tabular-nums">
                              {(row.winPct * 100).toFixed(0)}%
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-semibold text-slate-600 tabular-nums">
                              {row.pointsFor}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-semibold text-slate-600 tabular-nums">
                              {row.pointsAgainst}
                            </td>
                            <td
                              className={`py-2.5 px-2.5 text-right font-black tabular-nums ${
                                row.pointDiff > 0
                                  ? "text-emerald-700"
                                  : row.pointDiff < 0
                                    ? "text-rose-600"
                                    : "text-slate-600"
                              }`}
                            >
                              {row.pointDiff > 0
                                ? `+${row.pointDiff}`
                                : row.pointDiff}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                              {row.streak}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =====================================================================
          SINGLE-ELIMINATION & MULTI-STAGE KNOCKOUT PLAYOFF TREE
         ===================================================================== */}
      {(selectedFormatId === "SINGLE_ELIMINATION" ||
        selectedFormatId === "MULTI_STAGE") && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">
                {selectedFormatId === "MULTI_STAGE"
                  ? "Stage 2: Knockout Playoff Bracket Tree (Quarterfinals → Semifinals → Finals)"
                  : "Single-Elimination Knockout Bracket Tree"}
              </h3>
              <p className="text-xs text-slate-500">
                &ldquo;Win or go home.&rdquo; Winners automatically advance to
                the next round column on the right.
              </p>
            </div>
            {selectedFormatId === "MULTI_STAGE" && (
              <button
                type="button"
                onClick={() => seedPlayoffsInLeague(league.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B0D0E] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync Playoff Seeds from Pool Standings
              </button>
            )}
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex gap-6 min-w-[780px]">
              {getRoundsForStages(["PLAYOFF", "FINALS"]).map((roundCol) => (
                <div
                  key={roundCol.roundNumber}
                  className="flex-1 min-w-[260px] flex flex-col justify-around space-y-4"
                >
                  <div className="rounded-xl bg-slate-100 px-3.5 py-2 text-center text-xs font-black uppercase tracking-wider text-[#0B2F5C]">
                    Round {roundCol.roundNumber} •{" "}
                    {roundCol.matches[0]?.roundLabel.split("•")[0]}
                  </div>
                  <div className="flex flex-col justify-around flex-1 gap-4">
                    {roundCol.matches.map((m) => renderMatchBracketCard(m))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          DOUBLE-ELIMINATION BRACKET (WINNERS' BRACKET + LOSERS' BRACKET + GRAND FINAL)
         ===================================================================== */}
      {selectedFormatId === "DOUBLE_ELIMINATION" && (
        <div className="space-y-6">
          {/* Winners' Bracket */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div>
              <span className="rounded bg-[#0B2F5C] px-2.5 py-0.5 text-[0.65rem] font-black uppercase text-white">
                Undefeated Path
              </span>
              <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-slate-900">
                Primary Winners&apos; Bracket
              </h3>
              <p className="text-xs text-slate-500">
                Teams that lose here are not eliminated yet — they drop into
                the Losers&apos; (Consolation) Bracket below for a second
                chance.
              </p>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="flex gap-6 min-w-[760px]">
                {getRoundsForStages(["WINNERS", "FINALS"]).map((roundCol) => (
                  <div
                    key={roundCol.roundNumber}
                    className="flex-1 min-w-[250px] flex flex-col justify-around space-y-4"
                  >
                    <div className="rounded-xl bg-slate-100 px-3 py-2 text-center text-xs font-black uppercase text-[#0B2F5C]">
                      {roundCol.matches[0]?.roundLabel.split("•")[0]}
                    </div>
                    <div className="flex flex-col justify-around flex-1 gap-4">
                      {roundCol.matches.map((m) => renderMatchBracketCard(m))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Losers' / Consolation Bracket */}
          <section className="rounded-2xl border border-rose-200 bg-white p-6 shadow-xs space-y-4">
            <div>
              <span className="rounded bg-[#8B0D0E] px-2.5 py-0.5 text-[0.65rem] font-black uppercase text-white">
                Second-Chance Path (1 Loss)
              </span>
              <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-slate-900">
                Losers&apos; Bracket (Consolation Bracket)
              </h3>
              <p className="text-xs text-slate-500">
                Teams with 1 loss battle here in sudden-death games to earn a
                berth in the Grand Championship Final. A second loss eliminates
                the team.
              </p>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="flex gap-6 min-w-[760px]">
                {getRoundsForStages(["LOSERS"]).map((roundCol) => (
                  <div
                    key={roundCol.roundNumber}
                    className="flex-1 min-w-[250px] flex flex-col justify-around space-y-4"
                  >
                    <div className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-black uppercase text-[#8B0D0E]">
                      Losers Round {roundCol.roundNumber}
                    </div>
                    <div className="flex flex-col justify-around flex-1 gap-4">
                      {roundCol.matches.map((m) => renderMatchBracketCard(m))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          SERIES PLAYOFF BRACKET (BEST-OF-3, BEST-OF-5, OR BEST-OF-7)
         ===================================================================== */}
      {selectedFormatId === "SERIES_PLAYOFF" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">
              Series Playoff Bracket (Best-of-{seriesBestOf} Format • First to{" "}
              {Math.ceil(seriesBestOf / 2)} Wins)
            </h3>
            <p className="text-xs text-slate-500">
              NBA / PBA-style multi-game series. Winning{" "}
              {Math.ceil(seriesBestOf / 2)} games clinches the series and
              advances the team to the Championship Finals Series.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {["series-sf-1", "series-sf-2", "series-finals"].map((sId) => {
              const sMatches = allMatches.filter((m) => m.seriesId === sId);
              if (sMatches.length === 0) return null;
              const firstGame = sMatches[0];
              const teamA = getTeamDisplay(
                firstGame.homeTeamId,
                firstGame.homeTeamPlaceholder
              );
              const teamB = getTeamDisplay(
                firstGame.awayTeamId,
                firstGame.awayTeamPlaceholder
              );

              let winsA = 0;
              let winsB = 0;
              for (const gm of sMatches) {
                if (gm.status === "FINAL" && gm.winnerTeamId) {
                  if (gm.winnerTeamId === firstGame.homeTeamId) winsA++;
                  else if (gm.winnerTeamId === firstGame.awayTeamId) winsB++;
                }
              }

              const winsNeeded = Math.ceil(seriesBestOf / 2);
              const isFinalsSeries = sId === "series-finals";

              return (
                <div
                  key={sId}
                  className={`rounded-2xl border p-4 space-y-4 ${
                    isFinalsSeries
                      ? "border-2 border-amber-400 bg-amber-50/30"
                      : "border-slate-200 bg-slate-50/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-[#0B2F5C] px-2.5 py-1 text-xs font-black uppercase text-white">
                      {isFinalsSeries
                        ? `Championship Finals (Best-of-${seriesBestOf})`
                        : sId === "series-sf-1"
                          ? "Semifinal Series A (#1 vs #4)"
                          : "Semifinal Series B (#2 vs #3)"}
                    </span>
                    <span className="text-xs font-black uppercase text-[#8B0D0E]">
                      Series: {winsA} - {winsB}
                    </span>
                  </div>

                  {/* Series Tally Banner */}
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between pr-2 border-r border-slate-200">
                      <span className="truncate text-xs font-black uppercase text-slate-900">
                        {teamA.name}
                      </span>
                      <span
                        className={`text-lg font-black tabular-nums ${
                          winsA >= winsNeeded
                            ? "text-emerald-600"
                            : "text-slate-900"
                        }`}
                      >
                        {winsA}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pl-2">
                      <span className="truncate text-xs font-black uppercase text-slate-900">
                        {teamB.name}
                      </span>
                      <span
                        className={`text-lg font-black tabular-nums ${
                          winsB >= winsNeeded
                            ? "text-emerald-600"
                            : "text-slate-900"
                        }`}
                      >
                        {winsB}
                      </span>
                    </div>
                  </div>

                  {/* Individual Series Games */}
                  <div className="space-y-2.5">
                    {sMatches.map((gm) => renderMatchBracketCard(gm))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* =====================================================================
          PAGE-MCINTYRE / STEPLADDER BRACKET TREE
         ===================================================================== */}
      {selectedFormatId === "PAGE_MCINTYRE" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="rounded bg-[#8B0D0E] px-2.5 py-0.5 text-[0.65rem] font-black uppercase text-white">
                {stepladderVariant === "PAGE_MCINTYRE_TOP4"
                  ? "Page-McIntyre Final Four System"
                  : "Stepladder Sudden-Death Climb"}
              </span>
              <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-slate-900">
                Page-McIntyre / Stepladder Seeded Playoff Tree
              </h3>
              <p className="text-xs text-slate-500">
                {stepladderVariant === "PAGE_MCINTYRE_TOP4"
                  ? "Seeds #1 and #2 play the Major Semifinal (Winner advances directly to the Grand Final; Loser gets a second chance in the Preliminary Final against the #3 vs #4 sudden-death winner)."
                  : "Higher-ranked seeds receive byes and wait at the top of the ladder while lower-ranked teams battle upward in sudden-death matches."}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex gap-6 min-w-[760px]">
              {getRoundsForStages(["STEPLADDER", "FINALS"]).map((roundCol) => (
                <div
                  key={roundCol.roundNumber}
                  className="flex-1 min-w-[260px] flex flex-col justify-around space-y-4"
                >
                  <div className="rounded-xl bg-slate-100 px-3.5 py-2 text-center text-xs font-black uppercase text-[#0B2F5C]">
                    Stage {roundCol.roundNumber}
                  </div>
                  <div className="flex flex-col justify-around flex-1 gap-4">
                    {roundCol.matches.map((m) => renderMatchBracketCard(m))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
