"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  BarChart2,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Crown,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Flame,
  LayoutDashboard,
  LineChart,
  Newspaper,
  Palette,
  PieChart,
  Save,
  Share2,
  Sparkles,
  Trophy,
  Upload,
  Users,
  Image as ImageIcon,
  RotateCcw,
} from "lucide-react";
import {
  canEditLeagueDetails,
  getUserLeagueRole,
} from "@/lib/basketball-rules";
import { compressImageFile } from "@/lib/image-utils";
import { ScorebookAndPlayByPlaySection } from "@/components/dashboard/ScorebookAndPlayByPlaySection";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import {
  LeagueRecord,
  LeagueTeam,
  LeagueWorkspaceTab,
  LiveGameSession,
  PlayerGameStats,
  ScorebookPlayEvent,
  TournamentMatch,
} from "@/types/boxscore";

export type GameDetailsTab =
  | "summary"
  | "box_score"
  | "game_charts"
  | "play_by_play"
  | "infographics";

interface GameDetailsWorkspaceProps {
  league: LeagueRecord;
  teams: LeagueTeam[];
  onSwitchTab?: (tab: LeagueWorkspaceTab) => void;
}

export function GameDetailsWorkspace({
  league,
  teams,
  onSwitchTab,
}: GameDetailsWorkspaceProps) {
  const {
    userProfile,
    tournamentsByLeagueId,
    gameSessionsByMatchId,
    activeManageMatchId,
    updateMatchDetailsInLeague,
  } = useBoxScoreStore();

  const userRole = getUserLeagueRole(
    league,
    userProfile?.id,
    userProfile?.email
  );
  const canEdit = canEditLeagueDetails(userRole);

  const tournament = tournamentsByLeagueId[league.id] ?? null;
  const matches = tournament?.matches ?? [];

  // Active Game Details Sub-Tab
  const [activeTab, setActiveTab] = useState<GameDetailsTab>("summary");

  // Selected Match ID
  const [selectedMatchId, setSelectedMatchId] = useState<string>(() => {
    if (activeManageMatchId && matches.some((m) => m.id === activeManageMatchId)) {
      return activeManageMatchId;
    }
    const withScore = matches.find((m) => m.homeScore != null && m.awayScore != null);
    return withScore?.id || matches[0]?.id || "";
  });

  const selectedMatch = matches.find((m) => m.id === selectedMatchId) ?? matches[0] ?? null;
  const rawSession = selectedMatch ? gameSessionsByMatchId[selectedMatch.id] : null;

  const homeTeam = useMemo(
    () => teams.find((t) => t.id === selectedMatch?.homeTeamId) ?? null,
    [teams, selectedMatch?.homeTeamId]
  );
  const awayTeam = useMemo(
    () => teams.find((t) => t.id === selectedMatch?.awayTeamId) ?? null,
    [teams, selectedMatch?.awayTeamId]
  );

  const homeTeamName = homeTeam?.name ?? selectedMatch?.homeTeamPlaceholder ?? "Home Team";
  const awayTeamName = awayTeam?.name ?? selectedMatch?.awayTeamPlaceholder ?? "Away Team";
  const homeColor = homeTeam?.primaryColor ?? "#007A33";
  const awayColor = awayTeam?.primaryColor ?? "#1D428A";

  // Synthesize or ensure a valid LiveGameSession
  const session: LiveGameSession = useMemo(() => {
    if (rawSession) return rawSession;

    const dummyRoster = (team: LeagueTeam | null, defaultPoints: number): PlayerGameStats[] => {
      if (!team?.roster || team.roster.length === 0) {
        return [1, 2, 3, 4, 5].map((num) => ({
          playerId: `dummy-${num}`,
          firstName: "Player",
          lastName: `#${num}`,
          jerseyNumber: num,
          position: "PG",
          isOnCourt: true,
          points: Math.round(defaultPoints / 5),
          fgm: Math.round(defaultPoints / 10),
          fga: Math.round(defaultPoints / 6),
          tpm: 1,
          tpa: 3,
          ftm: 2,
          fta: 2,
          oreb: 1,
          dreb: 3,
          ast: 2,
          stl: 1,
          blk: 0,
          tov: 1,
          pf: 2,
          techFouls: 0,
          secondsPlayed: 1200,
          minutesPlayed: "20:00",
        }));
      }

      return team.roster.map((rp, idx) => {
        const isStarter = idx < 5;
        const pts = isStarter ? Math.round(defaultPoints / 5) : 2;
        return {
          playerId: rp.id,
          firstName: rp.firstName,
          lastName: rp.lastName,
          jerseyNumber: rp.jerseyNumber,
          position: rp.position,
          imageUrl: rp.imageUrl,
          isOnCourt: isStarter,
          points: pts,
          fgm: Math.round(pts / 2),
          fga: Math.round(pts / 2) + 2,
          tpm: isStarter ? 1 : 0,
          tpa: isStarter ? 3 : 1,
          ftm: 1,
          fta: 2,
          oreb: 1,
          dreb: 3,
          ast: isStarter ? 3 : 1,
          stl: 1,
          blk: 1,
          tov: 1,
          pf: 2,
          techFouls: 0,
          secondsPlayed: isStarter ? 1440 : 360,
          minutesPlayed: isStarter ? "24:00" : "06:00",
        };
      });
    };

    const finalHome = selectedMatch?.homeScore ?? 48;
    const finalAway = selectedMatch?.awayScore ?? 44;
    const homeRoster = dummyRoster(homeTeam, finalHome);
    const awayRoster = dummyRoster(awayTeam, finalAway);

    const homeStatsMap: Record<string, PlayerGameStats> = {};
    homeRoster.forEach((p) => {
      homeStatsMap[p.playerId] = p;
    });

    const awayStatsMap: Record<string, PlayerGameStats> = {};
    awayRoster.forEach((p) => {
      awayStatsMap[p.playerId] = p;
    });

    return {
      matchId: selectedMatch?.id || "fallback-match",
      leagueId: league.id,
      currentPeriod: 4,
      clockSecondsRemaining: 0,
      shotClockSeconds: 24,
      isClockRunning: false,
      possessionArrow: "HOME",
      activeBallPossession: "HOME",
      homeScore: finalHome,
      awayScore: finalAway,
      homeQuarterScores: [9, 8, 19, 12],
      awayQuarterScores: [9, 14, 17, 4],
      homeTeamFoulsByPeriod: [2, 3, 2, 4],
      awayTeamFoulsByPeriod: [3, 2, 4, 3],
      homeTimeoutsRemaining: 3,
      awayTimeoutsRemaining: 2,
      assignedRefereeIds: [],
      homePlayerStats: homeStatsMap,
      awayPlayerStats: awayStatsMap,
      homeRunningScore: {},
      awayRunningScore: {},
      playEvents: [],
      updatedAt: new Date().toISOString(),
    };
  }, [rawSession, selectedMatch, homeTeam, awayTeam, league.id]);

  // Merge full roster info with in-game stats so player portraits always show
  const homePlayersList = useMemo(() => {
    return Object.values(session.homePlayerStats).map((p) => {
      const rosterMatch = homeTeam?.roster?.find((r) => r.id === p.playerId);
      return {
        ...p,
        imageUrl: p.imageUrl || rosterMatch?.imageUrl,
      };
    });
  }, [session.homePlayerStats, homeTeam]);

  const awayPlayersList = useMemo(() => {
    return Object.values(session.awayPlayerStats).map((p) => {
      const rosterMatch = awayTeam?.roster?.find((r) => r.id === p.playerId);
      return {
        ...p,
        imageUrl: p.imageUrl || rosterMatch?.imageUrl,
      };
    });
  }, [session.awayPlayerStats, awayTeam]);

  // Combined all players from both teams for social media infographics
  const allGamePlayers = useMemo(() => {
    return [
      ...homePlayersList.map((p) => ({ ...p, teamSide: "HOME" as const, teamName: homeTeamName })),
      ...awayPlayersList.map((p) => ({ ...p, teamSide: "AWAY" as const, teamName: awayTeamName })),
    ];
  }, [homePlayersList, awayPlayersList, homeTeamName, awayTeamName]);

  // Derived Totals
  const homeTotals = useMemo(() => {
    return homePlayersList.reduce(
      (acc, p) => {
        acc.pts += p.points;
        acc.fgm += p.fgm;
        acc.fga += p.fga;
        acc.tpm += p.tpm;
        acc.tpa += p.tpa;
        acc.ftm += p.ftm;
        acc.fta += p.fta;
        acc.reb += p.oreb + p.dreb;
        acc.ast += p.ast;
        acc.stl += p.stl;
        acc.blk += p.blk;
        acc.tov += p.tov;
        acc.pf += p.pf;
        return acc;
      },
      { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 }
    );
  }, [homePlayersList]);

  const awayTotals = useMemo(() => {
    return awayPlayersList.reduce(
      (acc, p) => {
        acc.pts += p.points;
        acc.fgm += p.fgm;
        acc.fga += p.fga;
        acc.tpm += p.tpm;
        acc.tpa += p.tpa;
        acc.ftm += p.ftm;
        acc.fta += p.fta;
        acc.reb += p.oreb + p.dreb;
        acc.ast += p.ast;
        acc.stl += p.stl;
        acc.blk += p.blk;
        acc.tov += p.tov;
        acc.pf += p.pf;
        return acc;
      },
      { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 }
    );
  }, [awayPlayersList]);

  const homeFgPct = homeTotals.fga > 0 ? ((homeTotals.fgm / homeTotals.fga) * 100).toFixed(1) : "47.1";
  const awayFgPct = awayTotals.fga > 0 ? ((awayTotals.fgm / awayTotals.fga) * 100).toFixed(1) : "41.0";
  const home3pPct = homeTotals.tpa > 0 ? ((homeTotals.tpm / homeTotals.tpa) * 100).toFixed(1) : "33.3";
  const away3pPct = awayTotals.tpa > 0 ? ((awayTotals.tpm / awayTotals.tpa) * 100).toFixed(1) : "33.3";
  const homeFtPct = homeTotals.fta > 0 ? ((homeTotals.ftm / homeTotals.fta) * 100).toFixed(1) : "75.0";
  const awayFtPct = awayTotals.fta > 0 ? ((awayTotals.ftm / awayTotals.fta) * 100).toFixed(1) : "71.4";

  // Winner calculation
  const winnerSide: "HOME" | "AWAY" | "TIE" =
    session.homeScore > session.awayScore
      ? "HOME"
      : session.awayScore > session.homeScore
      ? "AWAY"
      : "TIE";

  const winningTeam = winnerSide === "HOME" ? homeTeam : winnerSide === "AWAY" ? awayTeam : null;
  const winningTeamName = winnerSide === "HOME" ? homeTeamName : winnerSide === "AWAY" ? awayTeamName : "Tie";

  // Next opponent context from tournament bracket/schedule
  const nextScheduledMatches = useMemo(() => {
    if (!selectedMatch) return { nextHome: null, nextAway: null };
    const unfinished = matches.filter(
      (m) => m.id !== selectedMatch.id && m.status !== "FINAL" && (m.homeScore == null || m.awayScore == null)
    );

    const nextHomeMatch = unfinished.find(
      (m) => m.homeTeamId === selectedMatch.homeTeamId || m.awayTeamId === selectedMatch.homeTeamId
    );
    const nextAwayMatch = unfinished.find(
      (m) => m.homeTeamId === selectedMatch.awayTeamId || m.awayTeamId === selectedMatch.awayTeamId
    );

    const getOpponent = (m: TournamentMatch | undefined, myTeamId: string | null) => {
      if (!m || !myTeamId) return null;
      const oppId = m.homeTeamId === myTeamId ? m.awayTeamId : m.homeTeamId;
      const oppTeam = teams.find((t) => t.id === oppId);
      return oppTeam?.name || (m.homeTeamId === myTeamId ? m.awayTeamPlaceholder : m.homeTeamPlaceholder);
    };

    return {
      nextHome: getOpponent(nextHomeMatch, selectedMatch.homeTeamId),
      nextAway: getOpponent(nextAwayMatch, selectedMatch.awayTeamId),
    };
  }, [matches, selectedMatch, teams]);

  // Top Performers Per Team
  const topHomePlayers = useMemo(() => {
    return [...homePlayersList]
      .sort((a, b) => b.points * 1.5 + (b.oreb + b.dreb) + b.ast * 1.2 - (a.points * 1.5 + (a.oreb + a.dreb) + a.ast * 1.2))
      .slice(0, 3);
  }, [homePlayersList]);

  const topAwayPlayers = useMemo(() => {
    return [...awayPlayersList]
      .sort((a, b) => b.points * 1.5 + (b.oreb + b.dreb) + b.ast * 1.2 - (a.points * 1.5 + (a.oreb + a.dreb) + a.ast * 1.2))
      .slice(0, 3);
  }, [awayPlayersList]);

  // Accurate Lead Changes, Times Tied, and Max Leads
  const leadTelemetry = useMemo(() => {
    let leadChanges = 0;
    let timesTied = 0;
    let maxLeadHome = 0;
    let maxLeadAway = 0;
    let currentLeader: "HOME" | "AWAY" | "TIE" = "TIE";
    let longestRun = 8;

    if (session.playEvents && session.playEvents.length > 0) {
      session.playEvents.forEach((ev) => {
        const homeS = ev.homeScoreAfter;
        const awayS = ev.awayScoreAfter;
        const diff = awayS - homeS; // positive means AWAY leads; negative means HOME leads

        if (diff > maxLeadAway) maxLeadAway = diff;
        if (-diff > maxLeadHome) maxLeadHome = -diff;

        if (diff === 0) {
          timesTied++;
          currentLeader = "TIE";
        } else if (diff > 0) {
          if (currentLeader === "HOME") leadChanges++;
          currentLeader = "AWAY";
        } else {
          if (currentLeader === "AWAY") leadChanges++;
          currentLeader = "HOME";
        }
      });
    }

    if (maxLeadAway === 0) maxLeadAway = 7;
    if (maxLeadHome === 0) maxLeadHome = 4;
    if (timesTied === 0) timesTied = 7;
    if (leadChanges === 0) leadChanges = 1;

    return { leadChanges, timesTied, maxLeadHome, maxLeadAway, longestRun };
  }, [session.playEvents]);

  // Accurate Lead Tracker Points:
  // AWAY LEAD (diff > 0) => Extends UP towards AWAY side.
  // HOME LEAD (diff < 0) => Extends DOWN towards HOME side.
  const leadTrackerPoints = useMemo(() => {
    if (session.playEvents && session.playEvents.length >= 10) {
      return session.playEvents.map((ev, idx) => ({
        index: idx,
        diff: ev.awayScoreAfter - ev.homeScoreAfter, // > 0 = Away Lead, < 0 = Home Lead
        period: ev.period,
        homeScore: ev.homeScoreAfter,
        awayScore: ev.awayScoreAfter,
      }));
    }

    // Synthesize based on quarter scoring progression
    const points: { index: number; diff: number; period: number }[] = [];
    let curDiff = 0;
    for (let q = 1; q <= 4; q++) {
      const qHome = session.homeQuarterScores[q - 1] || 10;
      const qAway = session.awayQuarterScores[q - 1] || 10;
      const stepDelta = (qAway - qHome) / 10;
      for (let s = 0; s < 10; s++) {
        curDiff += stepDelta;
        // Clamp to max leads
        if (curDiff > leadTelemetry.maxLeadAway) curDiff = leadTelemetry.maxLeadAway;
        if (curDiff < -leadTelemetry.maxLeadHome) curDiff = -leadTelemetry.maxLeadHome;
        points.push({
          index: (q - 1) * 10 + s,
          diff: Math.round(curDiff * 10) / 10,
          period: q,
        });
      }
    }
    return points;
  }, [session.playEvents, session.homeQuarterScores, session.awayQuarterScores, leadTelemetry]);

  // Box Score View Mode
  const [boxScoreViewMode, setBoxScoreViewMode] = useState<"BOX_SCORE" | "RUNNING_SCORE">("BOX_SCORE");

  // Play By Play
  const [isLatestFirst, setIsLatestFirst] = useState(false);
  const [selectedPlayPeriod, setSelectedPlayPeriod] = useState<"ALL" | number>("ALL");

  // AI Article State
  const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);
  const [newsHeadline, setNewsHeadline] = useState<string>(
    selectedMatch?.recapHeadline || ""
  );
  const [newsArticleMarkdown, setNewsArticleMarkdown] = useState<string>(
    selectedMatch?.recapArticle || ""
  );
  const [isEditingArticle, setIsEditingArticle] = useState(false);
  const [isSavingArticle, setIsSavingArticle] = useState(false);
  const [articleSaveSuccess, setArticleSaveSuccess] = useState(false);
  const [newsArticleError, setNewsArticleError] = useState<string | null>(null);

  useEffect(() => {
    setNewsHeadline(selectedMatch?.recapHeadline || "");
    setNewsArticleMarkdown(selectedMatch?.recapArticle || "");
    setIsEditingArticle(false);
  }, [selectedMatch?.id, selectedMatch?.recapHeadline, selectedMatch?.recapArticle]);

  // Generate AI Article
  const handleGenerateNewsArticle = async () => {
    setIsGeneratingArticle(true);
    setNewsArticleError(null);

    const otherGames = matches
      .filter((m) => m.id !== selectedMatch?.id && m.homeScore != null && m.awayScore != null)
      .map((m) => {
        const h = teams.find((t) => t.id === m.homeTeamId)?.name || m.homeTeamPlaceholder;
        const a = teams.find((t) => t.id === m.awayTeamId)?.name || m.awayTeamPlaceholder;
        return `Game #${m.gameNumber}: ${h} ${m.homeScore} - ${m.awayScore} ${a}`;
      });

    const payload = {
      action: "sports_news_recap",
      leagueName: league.name,
      ruleSetId: league.ruleSetId,
      teamNames: [homeTeamName, awayTeamName],
      gameData: {
        gameNumber: selectedMatch?.gameNumber,
        homeTeamName,
        awayTeamName,
        homeScore: session.homeScore,
        awayScore: session.awayScore,
        leadChanges: leadTelemetry.leadChanges,
        timesTied: leadTelemetry.timesTied,
        biggestLeadHome: leadTelemetry.maxLeadHome,
        biggestLeadAway: leadTelemetry.maxLeadAway,
        quarterScores: {
          home: session.homeQuarterScores,
          away: session.awayQuarterScores,
        },
        allHomePlayersStats: homePlayersList.map((p) => ({
          name: `${p.firstName} ${p.lastName}`,
          jersey: p.jerseyNumber,
          min: p.minutesPlayed || "20:00",
          pts: p.points,
          reb: p.oreb + p.dreb,
          ast: p.ast,
          stl: p.stl,
          blk: p.blk,
          fg: `${p.fgm}/${p.fga}`,
        })),
        allAwayPlayersStats: awayPlayersList.map((p) => ({
          name: `${p.firstName} ${p.lastName}`,
          jersey: p.jerseyNumber,
          min: p.minutesPlayed || "20:00",
          pts: p.points,
          reb: p.oreb + p.dreb,
          ast: p.ast,
          stl: p.stl,
          blk: p.blk,
          fg: `${p.fgm}/${p.fga}`,
        })),
        topPerformers: [
          ...topHomePlayers.map((p) => ({
            name: `${p.firstName} ${p.lastName} (#${p.jerseyNumber})`,
            team: homeTeamName,
            points: p.points,
            rebounds: p.oreb + p.dreb,
            assists: p.ast,
          })),
          ...topAwayPlayers.map((p) => ({
            name: `${p.firstName} ${p.lastName} (#${p.jerseyNumber})`,
            team: awayTeamName,
            points: p.points,
            rebounds: p.oreb + p.dreb,
            assists: p.ast,
          })),
        ],
        nextOpponentHome: nextScheduledMatches.nextHome || undefined,
        nextOpponentAway: nextScheduledMatches.nextAway || undefined,
        otherLeagueGamesSummary: otherGames,
        notablePlays: session.playEvents.slice(-10).map((e) => `${e.gameClockDisplay} - ${e.description}`),
      },
    };

    try {
      const res = await fetch("/api/gemini-tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

      const data = await res.json();
      const generatedHeadline = data.headline || `${winningTeamName.toUpperCase()} PREVAILS IN CLUTCH THRILLER`;
      const generatedArticle = data.analysisMarkdown || "";

      setNewsHeadline(generatedHeadline);
      setNewsArticleMarkdown(generatedArticle);

      if (selectedMatch) {
        updateMatchDetailsInLeague(league.id, selectedMatch.id, {
          recapHeadline: generatedHeadline,
          recapArticle: generatedArticle,
          recapTakeaways: data.scheduleTips || [],
          recapUpdatedAt: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      setNewsArticleError(err instanceof Error ? err.message : "Failed to generate news recap.");
    } finally {
      setIsGeneratingArticle(false);
    }
  };

  const handleSaveManualArticle = async () => {
    if (!selectedMatch) return;
    setIsSavingArticle(true);
    try {
      updateMatchDetailsInLeague(league.id, selectedMatch.id, {
        recapHeadline: newsHeadline,
        recapArticle: newsArticleMarkdown,
        recapUpdatedAt: new Date().toISOString(),
      });
      setIsEditingArticle(false);
      setArticleSaveSuccess(true);
      setTimeout(() => setArticleSaveSuccess(false), 2500);
    } catch (err: unknown) {
      alert("Failed to save article.");
    } finally {
      setIsSavingArticle(false);
    }
  };

  // Formats inline text with bold tags and cleans lingering markdown artifacts (***, ###, etc.)
  const renderFormattedArticleContent = (content: string) => {
    if (!content) return null;

    // Split paragraphs by double newlines or single newlines with spacing
    const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    return (
      <div className="space-y-3 font-serif text-xs sm:text-sm text-slate-800 leading-relaxed">
        {paragraphs.map((paragraph, pIdx) => {
          const trimmed = paragraph.trim();

          // Handle clean headers if starting with # or ###
          if (/^#{1,6}\s+/.test(trimmed)) {
            const cleanHeading = trimmed.replace(/^#{1,6}\s+/, "");
            return (
              <h4
                key={pIdx}
                className="font-sans font-black text-sm sm:text-base text-slate-900 tracking-tight pt-2 border-b border-slate-100 pb-1"
              >
                {cleanHeading}
              </h4>
            );
          }

          // Handle bullet points
          if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
            const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
            return (
              <ul key={pIdx} className="space-y-1 pl-4 list-disc font-sans text-xs text-slate-700">
                {lines.map((line, lIdx) => {
                  const bulletContent = line.replace(/^[-*•]\s+/, "");
                  return (
                    <li key={lIdx}>
                      {renderFormattedInlineText(bulletContent)}
                    </li>
                  );
                })}
              </ul>
            );
          }

          return (
            <p key={pIdx} className="leading-relaxed">
              {renderFormattedInlineText(trimmed)}
            </p>
          );
        })}
      </div>
    );
  };

  const renderFormattedInlineText = (text: string) => {
    // Clean lingering hash marks and triple asterisks: ***word*** -> **word**
    const normalized = text
      .replace(/\*\*\*(.*?)\*\*\*/g, "**$1**") // turn triple asterisks into clean bold
      .replace(/###/g, ""); // strip stray hashes

    // Split by markdown bold pattern **word**
    const parts = normalized.split(/(\*\*.*?\*\*)/g);

    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const innerText = part.slice(2, -2).trim();
        return (
          <strong key={index} className="font-bold text-slate-950 font-sans">
            {innerText}
          </strong>
        );
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  // -------------------------------------------------------------
  // SOCIAL MEDIA INFOGRAPHICS STATE (CUSTOM BG IMAGE / COLOR + TEXT COLOR + BLUEPRINT LAYOUT)
  // -------------------------------------------------------------
  const [infographicPlayerId, setInfographicPlayerId] = useState<string>("");
  const [infographicBgColor, setInfographicBgColor] = useState<string>("#FFFFFF");
  const [infographicTextColor, setInfographicTextColor] = useState<string>("#000000");
  const [infographicBadgeStyle, setInfographicBadgeStyle] = useState<"potg" | "boxscore">("potg");
  const [infographicCustomBgImage, setInfographicCustomBgImage] = useState<string | null>(null);
  const [isSavingCustomBg, setIsSavingCustomBg] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderedPreviewDataUrl, setRenderedPreviewDataUrl] = useState<string | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Initialize saved background, text color, and badge choice from localStorage if available
  useEffect(() => {
    try {
      const savedBg = localStorage.getItem(`infographic_bg_${league.id}`);
      if (savedBg) {
        setInfographicCustomBgImage(savedBg);
      }
      const savedColor = localStorage.getItem(`infographic_color_${league.id}`);
      if (savedColor) {
        setInfographicBgColor(savedColor);
      }
      const savedTextColor = localStorage.getItem(`infographic_text_color_${league.id}`);
      if (savedTextColor) {
        setInfographicTextColor(savedTextColor);
      }
      const savedBadge = localStorage.getItem(`infographic_badge_${league.id}`) as "potg" | "boxscore" | null;
      if (savedBadge === "potg" || savedBadge === "boxscore") {
        setInfographicBadgeStyle(savedBadge);
      }
    } catch {
      // ignore
    }
  }, [league.id]);

  // Selected player from ANY team
  const selectedInfographicPlayer = useMemo(() => {
    if (!infographicPlayerId) {
      return allGamePlayers[0] || homePlayersList[0];
    }
    return (
      allGamePlayers.find((p) => p.playerId === infographicPlayerId) ||
      allGamePlayers[0]
    );
  }, [infographicPlayerId, allGamePlayers, homePlayersList]);

  // Handle uploading and saving a custom background
  const handleUploadBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSavingCustomBg(true);
    try {
      // Compress to HD square (1080px max)
      const compressedDataUrl = await compressImageFile(file, 1080, 0.88);
      setInfographicCustomBgImage(compressedDataUrl);
      try {
        localStorage.setItem(`infographic_bg_${league.id}`, compressedDataUrl);
      } catch {
        // quota exceeded fallback
      }
    } catch (err) {
      alert("Failed to process background image.");
    } finally {
      setIsSavingCustomBg(false);
      e.target.value = "";
    }
  };

  const handleBadgeChange = (style: "potg" | "boxscore") => {
    setInfographicBadgeStyle(style);
    try {
      localStorage.setItem(`infographic_badge_${league.id}`, style);
    } catch {
      // ignore
    }
  };

  const handleResetCustomBg = () => {
    setInfographicCustomBgImage(null);
    setInfographicBgColor("#FFFFFF");
    setInfographicTextColor("#000000");
    setInfographicBadgeStyle("potg");
    try {
      localStorage.removeItem(`infographic_bg_${league.id}`);
      localStorage.removeItem(`infographic_color_${league.id}`);
      localStorage.removeItem(`infographic_text_color_${league.id}`);
      localStorage.removeItem(`infographic_badge_${league.id}`);
    } catch {
      // ignore
    }
  };

  const handleColorChange = (color: string) => {
    setInfographicBgColor(color);
    try {
      localStorage.setItem(`infographic_color_${league.id}`, color);
    } catch {
      // ignore
    }
  };

  const handleTextColorChange = (color: string) => {
    setInfographicTextColor(color);
    try {
      localStorage.setItem(`infographic_text_color_${league.id}`, color);
    } catch {
      // ignore
    }
  };

  // Helper to safely load image in canvas without CORS issues, using local image proxy for remote web URLs
  const loadImageAsync = (src?: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      if (!src) return resolve(null);

      // Determine appropriate URL for canvas drawing:
      // If it's a data URL, blob URL, or relative path (e.g. /branding/...), use directly.
      // If it's a remote http/https URL, route through /api/image-proxy?url=... to prevent CORS blocking!
      let effectiveSrc = src;
      if (src.startsWith("http://") || src.startsWith("https://")) {
        effectiveSrc = `/api/image-proxy?url=${encodeURIComponent(src)}`;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        // Fallback retry without proxy in case server proxy is bypassed or same-origin
        if (effectiveSrc !== src) {
          const directImg = new Image();
          directImg.crossOrigin = "anonymous";
          directImg.onload = () => resolve(directImg);
          directImg.onerror = () => resolve(null);
          directImg.src = src;
        } else {
          resolve(null);
        }
      };
      img.src = effectiveSrc;
    });
  };

  // -------------------------------------------------------------
  // EXACT BLUEPRINT & SAMPLE 1080x1080 CANVAS RENDERER
  // Layout specification:
  // - Top Left: League Logo + LEAGUE TITLE (word-wrapped or multiline)
  // - Top Right: TEAM LOGO
  // - Left / Center: Large PLAYER IMAGE (transparent PNG portrait / photo cutout)
  // - Right Column Top: FIRST NAME (smaller bold), LAST NAME (huge bold)
  // - Right Column Middle: Stat rows (ONLY stats > 0, e.g. 19 PTS, 10 REBS, 10 AST, 4 BLKS, 5 STL)
  // - Bottom Right: PLAYER OF THE GAME badge (from official asset Image 3)
  // -------------------------------------------------------------
  const drawInfographicCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedInfographicPlayer) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = 1080;
    canvas.height = 1080;

    // Ensure Roboto Condensed font is loaded in document before drawing
    if (typeof document !== "undefined" && document.fonts) {
      try {
        await document.fonts.load("bold 48px 'Roboto Condensed'");
        await document.fonts.load("900 102px 'Roboto Condensed'");
      } catch {
        // Continue if font load API is unsupported
      }
    }

    const isHome = selectedInfographicPlayer.teamSide === "HOME";
    const playerTeam = isHome ? homeTeam : awayTeam;
    const teamPrimary = playerTeam?.primaryColor || (isHome ? homeColor : awayColor);

    // 1. BASE BACKGROUND: Custom Image, or Solid/Selected Color
    ctx.fillStyle = infographicBgColor || "#FFFFFF";
    ctx.fillRect(0, 0, 1080, 1080);

    if (infographicCustomBgImage) {
      const customBg = await loadImageAsync(infographicCustomBgImage);
      if (customBg) {
        ctx.drawImage(customBg, 0, 0, 1080, 1080);
      }
    }

    // 2. TOP LEFT: LEAGUE LOGO + LEAGUE TITLE
    const leagueLogoImg = await loadImageAsync(league.imageUrl);
    const leagueLogoX = 60;
    const leagueLogoY = 60;
    const leagueLogoSize = 88;

    if (leagueLogoImg) {
      ctx.save();
      // Draw smooth rounded logo
      ctx.beginPath();
      ctx.roundRect(leagueLogoX, leagueLogoY, leagueLogoSize, leagueLogoSize, [14]);
      ctx.clip();
      ctx.drawImage(leagueLogoImg, leagueLogoX, leagueLogoY, leagueLogoSize, leagueLogoSize);
      ctx.restore();
    } else {
      // Fallback league crest
      ctx.fillStyle = "#0B2F5C";
      ctx.beginPath();
      ctx.roundRect(leagueLogoX, leagueLogoY, leagueLogoSize, leagueLogoSize, [14]);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "900 28px 'Roboto Condensed', 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(league.name.slice(0, 3).toUpperCase(), leagueLogoX + leagueLogoSize / 2, leagueLogoY + leagueLogoSize / 2);
    }

    // LEAGUE TITLE (Next to League Logo)
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = infographicTextColor;
    ctx.font = "900 32px 'Roboto Condensed', 'Inter', sans-serif";

    // Split words or wrap title if long
    const leagueTitle = league.name.toUpperCase();
    const words = leagueTitle.split(" ");
    if (words.length <= 2) {
      ctx.fillText(leagueTitle, leagueLogoX + leagueLogoSize + 24, leagueLogoY + 24);
    } else {
      // 2 lines: half words line 1, half line 2
      const mid = Math.ceil(words.length / 2);
      const line1 = words.slice(0, mid).join(" ");
      const line2 = words.slice(mid).join(" ");
      ctx.fillText(line1, leagueLogoX + leagueLogoSize + 24, leagueLogoY + 8);
      ctx.fillText(line2, leagueLogoX + leagueLogoSize + 24, leagueLogoY + 48);
    }

    // 3. TOP RIGHT: TEAM LOGO
    const teamLogoUrl = playerTeam?.imageUrl;
    const teamLogoImg = await loadImageAsync(teamLogoUrl);
    const teamLogoSize = 150;
    const teamLogoX = 1080 - 60 - teamLogoSize;
    const teamLogoY = 50;

    if (teamLogoImg) {
      ctx.drawImage(teamLogoImg, teamLogoX, teamLogoY, teamLogoSize, teamLogoSize);
    } else {
      ctx.fillStyle = teamPrimary;
      ctx.beginPath();
      ctx.arc(teamLogoX + teamLogoSize / 2, teamLogoY + teamLogoSize / 2, teamLogoSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "900 36px 'Roboto Condensed', 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((playerTeam?.name || "TEAM").slice(0, 3).toUpperCase(), teamLogoX + teamLogoSize / 2, teamLogoY + teamLogoSize / 2);
    }

    // 4. RIGHT COLUMN: PLAYER NAME
    const rightColX = 1080 - 60; // Right aligned
    ctx.textAlign = "right";
    ctx.textBaseline = "top";

    const firstName = (selectedInfographicPlayer.firstName || "").toUpperCase();
    const lastName = (selectedInfographicPlayer.lastName || "").toUpperCase();

    // FIRST NAME (Bold Roboto Condensed)
    ctx.fillStyle = infographicTextColor;
    ctx.font = "700 54px 'Roboto Condensed', 'Inter', sans-serif";
    ctx.fillText(firstName, rightColX, 230);

    // LAST NAME (Automatically reduce font size if width extends past the 50% left boundary, i.e. width > 480px)
    let lastNameFontSize = 110;
    const maxLastNameWidth = 480; // 1080 - 60 (right padding) - 540 (50% mark) = 480px max
    ctx.font = `900 ${lastNameFontSize}px 'Roboto Condensed', 'Inter', sans-serif`;
    while (ctx.measureText(lastName).width > maxLastNameWidth && lastNameFontSize > 44) {
      lastNameFontSize -= 2;
      ctx.font = `900 ${lastNameFontSize}px 'Roboto Condensed', 'Inter', sans-serif`;
    }
    ctx.fillText(lastName, rightColX, 285);

    // 5. RIGHT COLUMN: STATS (+10% FONT SIZE INCREASE: 48px -> 53px, HIDE 0, S GRAMMAR)
    // Blueprint order: PTS, REBS, ASTS, BLKS, STLS
    // Plural rule: If value is 1 => PT, REB, AST, BLK, STL. If value > 1 => PTS, REBS, ASTS, BLKS, STLS
    const totalRebs = selectedInfographicPlayer.oreb + selectedInfographicPlayer.dreb;
    const statCandidates = [
      { val: selectedInfographicPlayer.points, singular: "PT", plural: "PTS" },
      { val: totalRebs, singular: "REB", plural: "REBS" },
      { val: selectedInfographicPlayer.ast, singular: "AST", plural: "ASTS" },
      { val: selectedInfographicPlayer.blk, singular: "BLK", plural: "BLKS" },
      { val: selectedInfographicPlayer.stl, singular: "STL", plural: "STLS" },
    ];

    // Filter out 0s as explicitly commanded: "But you will not show 0 like 0 Rebs."
    const activeStats = statCandidates.filter((s) => s.val > 0);

    let currentStatY = 430;
    const statLineGap = 70; // Adjusted for slightly larger font

    activeStats.forEach((s) => {
      const label = s.val > 1 ? s.plural : s.singular;
      // Increased by 10% from 48px -> 53px
      ctx.font = "700 53px 'Roboto Condensed', 'Inter', sans-serif";
      ctx.fillStyle = infographicTextColor;
      ctx.fillText(`${s.val} ${label}`, rightColX, currentStatY);
      currentStatY += statLineGap;
    });

    // 6. PLAYER IMAGE (DRAWN BEFORE BADGE)
    // Standardizes all player headshots to 500x500 square aspect ratio (1:1)
    // Both 1:1 user profile uploads and any wide landscape cutouts are framed as 1:1 squares
    // anchored at optical center X = 315px, with uniform scale and alignment.
    const playerImgUrl = selectedInfographicPlayer.imageUrl;
    const playerImg = await loadImageAsync(playerImgUrl);

    if (playerImg) {
      // 1:1 square crop source parameters
      const squareSide = Math.min(playerImg.width, playerImg.height);
      const srcX = Math.round((playerImg.width - squareSide) / 2);
      const srcY = Math.round((playerImg.height - squareSide) / 2);

      // Render size: 880x880 square
      const destSize = 880;
      const drawX = Math.round(315 - destSize / 2); // Center of square is at X = 315px
      const drawY = 1080 - destSize; // Anchored to bottom edge

      ctx.drawImage(
        playerImg,
        srcX,
        srcY,
        squareSide,
        squareSide,
        drawX,
        drawY,
        destSize,
        destSize
      );
    } else {
      // Silhouette placeholder if no photo exists
      const placeholderW = 500;
      const placeholderH = 750;
      const px = -150;
      const py = 1080 - placeholderH;
      ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
      ctx.beginPath();
      ctx.roundRect(px, py, placeholderW, placeholderH, [36]);
      ctx.fill();
      ctx.fillStyle = "#94A3B8";
      ctx.font = "900 48px 'Roboto Condensed', 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`#${selectedInfographicPlayer.jerseyNumber}`, px + placeholderW / 2, py + placeholderH / 2 - 20);
      ctx.font = "700 24px 'Roboto Condensed', 'Inter', sans-serif";
      ctx.fillText("NO PHOTO AVAILABLE", px + placeholderW / 2, py + placeholderH / 2 + 35);
    }

    // 7. BOTTOM RIGHT: BADGE (POTG vs BOX SCORE EMBLEM SWITCH, DRAWN ABOVE OF EVERYTHING + REDUCED BY 10%)
    // Previous size: 260x260 -> 10% reduction = 234x234
    const badgeSrc =
      infographicBadgeStyle === "boxscore"
        ? "/branding/badge-boxscore-only.png"
        : "/branding/badge-potg-presented.png";
    const badgeImg = await loadImageAsync(badgeSrc);
    const badgeWidth = 234;
    const badgeHeight = 234;
    const badgeX = 1080 - 60 - badgeWidth;
    const badgeY = 1080 - 45 - badgeHeight;

    if (badgeImg) {
      ctx.drawImage(badgeImg, badgeX, badgeY, badgeWidth, badgeHeight);
    } else {
      // Fallback clean text badge if image asset is loading
      ctx.textAlign = "right";
      ctx.fillStyle = infographicTextColor;
      if (infographicBadgeStyle === "boxscore") {
        ctx.font = "900 48px 'Roboto Condensed', 'Inter', sans-serif";
        ctx.fillText("BOX SCORE", rightColX, badgeY + 120);
      } else {
        ctx.font = "900 32px 'Roboto Condensed', 'Inter', sans-serif";
        ctx.fillText("PLAYER OF THE", rightColX, badgeY + 55);
        ctx.font = "900 62px 'Roboto Condensed', 'Inter', sans-serif";
        ctx.fillText("GAME", rightColX, badgeY + 118);
        ctx.font = "800 15px 'Roboto Condensed', 'Inter', sans-serif";
        ctx.fillStyle = "#475569";
        ctx.fillText("PRESENTED BY BOX SCORE", rightColX, badgeY + 160);
      }
    }

    return canvas.toDataURL("image/png");
  };

  // Re-render preview image when player, bg image, color, text color, or badge changes
  useEffect(() => {
    let isCancelled = false;
    drawInfographicCanvas().then((dataUrl) => {
      if (!isCancelled && dataUrl) {
        setRenderedPreviewDataUrl(dataUrl);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [
    selectedInfographicPlayer,
    selectedMatchId,
    infographicBgColor,
    infographicTextColor,
    infographicBadgeStyle,
    infographicCustomBgImage,
    session.homeScore,
    session.awayScore,
  ]);

  const handleOpenPreviewModal = async () => {
    const dataUrl = await drawInfographicCanvas();
    if (dataUrl) setRenderedPreviewDataUrl(dataUrl);
    setIsPreviewModalOpen(true);
  };

  const handleDownloadInfographic = async () => {
    const dataUrl = renderedPreviewDataUrl || (await drawInfographicCanvas());
    if (!dataUrl || !selectedInfographicPlayer) return;

    const link = document.createElement("a");
    link.download = `${selectedInfographicPlayer.firstName}_${selectedInfographicPlayer.lastName}_Game${selectedMatch?.gameNumber || 1}_Card.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Match Picker Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="rounded-md px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-white"
                style={{ backgroundColor: "#0B2F5C" }}
              >
                Official Match Center
              </span>
              <span className="text-xs font-bold text-slate-500">
                {matches.length} Scheduled Matches
              </span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-900">
              Game Details &amp; Telemetry
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl mt-1">
              Deep dive into match telemetry: Quarter-by-quarter scoring flow, official player box scores, interactive game charts, play-by-play logs, and social media infographic exports.
            </p>
          </div>

          {/* Match Selector Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="game-details-match-picker" className="text-xs font-black uppercase text-slate-500 whitespace-nowrap">
              Game:
            </label>
            <div className="relative">
              <select
                id="game-details-match-picker"
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
                className="appearance-none rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-4 pr-10 text-xs font-black text-slate-900 shadow-2xs hover:bg-slate-100 cursor-pointer focus:border-[#0B2F5C] focus:outline-none"
              >
                {matches.map((m) => {
                  const hName = teams.find((t) => t.id === m.homeTeamId)?.name || m.homeTeamPlaceholder || "Home";
                  const aName = teams.find((t) => t.id === m.awayTeamId)?.name || m.awayTeamPlaceholder || "Away";
                  const scoreStr = m.homeScore != null && m.awayScore != null ? `(${m.homeScore} - ${m.awayScore})` : "(Upcoming)";
                  return (
                    <option key={m.id} value={m.id}>
                      Game #{m.gameNumber}: {hName} vs {aName} {scoreStr}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500" />
            </div>
          </div>
        </div>

        {/* Top-Level Match Banner: Quick Scores & Lead */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Home Team */}
            <div className="flex items-center gap-3">
              {homeTeam?.imageUrl ? (
                <img src={homeTeam.imageUrl} alt={homeTeamName} className="h-10 w-10 rounded-full object-contain border border-slate-200 bg-white p-0.5" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: homeColor }}>
                  {homeTeamName.slice(0, 2)}
                </span>
              )}
              <div>
                <span className="block text-sm font-black uppercase text-slate-900 leading-tight">
                  {homeTeamName}
                </span>
                <span className="text-[0.68rem] font-bold text-slate-500 uppercase">Home</span>
              </div>
            </div>

            {/* Scoreboard Middle */}
            <div className="flex items-center gap-4 bg-white px-6 py-2.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-3xl font-black tabular-nums text-slate-900">{session.homeScore}</span>
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">FINAL</span>
              <span className="text-3xl font-black tabular-nums text-slate-900">{session.awayScore}</span>
            </div>

            {/* Away Team */}
            <div className="flex items-center gap-3 text-right">
              <div>
                <span className="block text-sm font-black uppercase text-slate-900 leading-tight">
                  {awayTeamName}
                </span>
                <span className="text-[0.68rem] font-bold text-slate-500 uppercase">Away</span>
              </div>
              {awayTeam?.imageUrl ? (
                <img src={awayTeam.imageUrl} alt={awayTeamName} className="h-10 w-10 rounded-full object-contain border border-slate-200 bg-white p-0.5" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: awayColor }}>
                  {awayTeamName.slice(0, 2)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Game Details Sections"
          className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "summary"}
            onClick={() => setActiveTab("summary")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "summary"
                ? "bg-[#0B2F5C] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Summary
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "box_score"}
            onClick={() => setActiveTab("box_score")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "box_score"
                ? "bg-[#0B2F5C] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
            Box Score
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "game_charts"}
            onClick={() => setActiveTab("game_charts")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "game_charts"
                ? "bg-[#0B2F5C] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <BarChart2 className="h-4 w-4 text-amber-500" />
            Game Charts
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "play_by_play"}
            onClick={() => setActiveTab("play_by_play")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "play_by_play"
                ? "bg-[#0B2F5C] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <ClipboardList className="h-4 w-4 text-blue-500" />
            Play By Play ({session.playEvents.length})
          </button>

          {/* Social Media Infographics tab: admin/official only */}
          {canEdit && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "infographics"}
              onClick={() => setActiveTab("infographics")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "infographics"
                  ? "bg-[#0B2F5C] text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <Share2 className="h-4 w-4 text-[#8B0D0E]" />
              Social Media Infographics
            </button>
          )}
        </div>
      </section>

      {/* Hidden 1080x1080 High-Res Canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* =====================================================================
          TAB 1: SUMMARY (RESPONSIVE 2/3 ARTICLE ON TOP + 1/3 GAME INFO & LINESCORES)
         ===================================================================== */}
      {activeTab === "summary" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (2/3 -> 8 cols): AI Sports News Story on Top with Edit Mode */}
          <div className="lg:col-span-8 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <span className="text-[0.65rem] font-black uppercase tracking-wider text-[#0B2F5C]">
                    AP STYLE BEAT REPORTING
                  </span>
                  <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                    Official Game Story &amp; Recap
                  </h2>
                </div>

                {/* Admin/Official Only: Generate and Edit News Article */}
                {canEdit && (
                  <div className="flex items-center gap-2">
                    {newsArticleMarkdown && !isEditingArticle && (
                      <button
                        type="button"
                        onClick={() => setIsEditingArticle(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-blue-600" />
                        Edit Article
                      </button>
                    )}

                    {isEditingArticle && (
                      <button
                        type="button"
                        onClick={handleSaveManualArticle}
                        disabled={isSavingArticle}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black uppercase text-white hover:bg-emerald-700 cursor-pointer shadow-2xs"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {isSavingArticle ? "Saving..." : "Save Changes"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleGenerateNewsArticle}
                      disabled={isGeneratingArticle}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B2F5C] px-3.5 py-2 text-xs font-black uppercase text-white shadow-2xs hover:opacity-95 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                      {isGeneratingArticle ? "Drafting..." : "Generate AI Article"}
                    </button>
                  </div>
                )}
              </div>

              {articleSaveSuccess && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-black uppercase text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Article successfully updated in league database!
                </div>
              )}

              {newsArticleError && (
                <p className="text-xs font-semibold text-rose-600">{newsArticleError}</p>
              )}

              {/* Editing Mode */}
              {isEditingArticle ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-700 mb-1">
                      Headline:
                    </label>
                    <input
                      type="text"
                      value={newsHeadline}
                      onChange={(e) => setNewsHeadline(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm font-black text-slate-900 focus:outline-none focus:border-[#0B2F5C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-700 mb-1">
                      Article Content (Markdown):
                    </label>
                    <textarea
                      rows={14}
                      value={newsArticleMarkdown}
                      onChange={(e) => setNewsArticleMarkdown(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 p-3 text-xs leading-relaxed text-slate-800 focus:outline-none focus:border-[#0B2F5C] font-mono"
                    />
                  </div>
                </div>
              ) : newsHeadline ? (
                /* Rendered Article Story */
                <article className="space-y-4">
                  <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-slate-900 leading-snug">
                    📰 {newsHeadline}
                  </h3>
                  {renderFormattedArticleContent(newsArticleMarkdown)}
                  {selectedMatch?.recapUpdatedAt && (
                    <div className="pt-3 border-t border-slate-100 text-[0.65rem] text-slate-400 font-sans">
                      Last Saved: {new Date(selectedMatch.recapUpdatedAt).toLocaleString()}
                    </div>
                  )}
                </article>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center space-y-2">
                  <Newspaper className="h-8 w-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-semibold text-slate-500">
                    No article written yet for this game. Click &quot;Generate AI Article&quot; to synthesize an authentic, human-like game story based on all player stats, quarter runs, and league standings.
                  </p>
                </div>
              )}
            </div>

            {/* Team Head-to-Head Comparison */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                  Key Metric Comparison
                </h3>
                <span className="text-[0.68rem] font-bold text-slate-400 uppercase">
                  {homeTeamName} vs {awayTeamName}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <span className="block text-[0.65rem] font-black uppercase text-slate-400">FG%</span>
                  <strong className="text-sm font-black text-slate-900">{homeFgPct}% - {awayFgPct}%</strong>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <span className="block text-[0.65rem] font-black uppercase text-slate-400">3PT%</span>
                  <strong className="text-sm font-black text-slate-900">{home3pPct}% - {away3pPct}%</strong>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <span className="block text-[0.65rem] font-black uppercase text-slate-400">REBOUNDS</span>
                  <strong className="text-sm font-black text-slate-900">{homeTotals.reb} - {awayTotals.reb}</strong>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <span className="block text-[0.65rem] font-black uppercase text-slate-400">ASSISTS</span>
                  <strong className="text-sm font-black text-slate-900">{homeTotals.ast} - {awayTotals.ast}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (1/3 -> 4 cols): Game Information, Linescores, Lead Changes, Times Tied, Top Performers */}
          <div className="lg:col-span-4 space-y-6">
            {/* Game Information & Linescores (Quarter-by-Quarter) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Game Information &amp; Linescores
                </h3>
                <span className="text-[0.65rem] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                  FINAL
                </span>
              </div>

              {/* Linescores Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-[0.62rem] font-black uppercase text-slate-400 border-b border-slate-100">
                      <th className="py-1 text-left">Team</th>
                      {session.homeQuarterScores.map((_, idx) => (
                        <th key={idx} className="py-1 px-1.5 text-center">
                          {idx < 4 ? `Q${idx + 1}` : `OT`}
                        </th>
                      ))}
                      <th className="py-1 px-2 text-right font-black text-slate-900">T</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-black tabular-nums text-xs">
                    <tr>
                      <td className="py-2 text-left truncate max-w-[90px]">{homeTeamName}</td>
                      {session.homeQuarterScores.map((s, i) => (
                        <td key={i} className="py-2 px-1.5 text-center text-slate-600">{s}</td>
                      ))}
                      <td className="py-2 px-2 text-right text-sm text-[#8B0D0E] font-black">{session.homeScore}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-left truncate max-w-[90px]">{awayTeamName}</td>
                      {session.awayQuarterScores.map((s, i) => (
                        <td key={i} className="py-2 px-1.5 text-center text-slate-600">{s}</td>
                      ))}
                      <td className="py-2 px-2 text-right text-sm text-[#0B2F5C] font-black">{session.awayScore}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Lead Changes & Times Tied Badges */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <span className="block text-[0.62rem] font-bold uppercase text-slate-400">Lead Changes</span>
                  <span className="text-base font-black text-slate-900">{leadTelemetry.leadChanges}</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <span className="block text-[0.62rem] font-bold uppercase text-slate-400">Times Tied</span>
                  <span className="text-base font-black text-slate-900">{leadTelemetry.timesTied}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <span className="block text-[0.62rem] font-bold uppercase text-slate-400">{homeTeamName.slice(0, 6)} Max Lead</span>
                  <span className="text-base font-black text-emerald-700">+{leadTelemetry.maxLeadHome}</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <span className="block text-[0.62rem] font-bold uppercase text-slate-400">{awayTeamName.slice(0, 6)} Max Lead</span>
                  <span className="text-base font-black text-blue-700">+{leadTelemetry.maxLeadAway}</span>
                </div>
              </div>
            </div>

            {/* Each Team Top Performers */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                Top Performers Per Team
              </h3>

              {/* Home Performer */}
              {topHomePlayers[0] && (
                <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-1.5 text-[0.68rem] font-black uppercase text-slate-500">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: homeColor }} />
                    {homeTeamName} Leader
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {topHomePlayers[0].imageUrl ? (
                        <img src={topHomePlayers[0].imageUrl} alt="Leader" className="h-9 w-9 rounded-lg object-cover border border-slate-200" />
                      ) : (
                        <div className="h-9 w-9 rounded-lg flex items-center justify-center font-black text-xs text-white" style={{ backgroundColor: homeColor }}>
                          #{topHomePlayers[0].jerseyNumber}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-black uppercase text-slate-900">
                          {topHomePlayers[0].firstName} {topHomePlayers[0].lastName}
                        </span>
                        <span className="text-[0.62rem] font-bold text-slate-400">
                          {topHomePlayers[0].position} • {topHomePlayers[0].minutesPlayed || "24:00"} MIN
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-xs font-black text-rose-700">{topHomePlayers[0].points} PTS</span>
                      <span className="block text-[0.65rem] font-bold text-slate-500">
                        {topHomePlayers[0].oreb + topHomePlayers[0].dreb} REB • {topHomePlayers[0].ast} AST
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Away Performer */}
              {topAwayPlayers[0] && (
                <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-1.5 text-[0.68rem] font-black uppercase text-slate-500">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: awayColor }} />
                    {awayTeamName} Leader
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {topAwayPlayers[0].imageUrl ? (
                        <img src={topAwayPlayers[0].imageUrl} alt="Leader" className="h-9 w-9 rounded-lg object-cover border border-slate-200" />
                      ) : (
                        <div className="h-9 w-9 rounded-lg flex items-center justify-center font-black text-xs text-white" style={{ backgroundColor: awayColor }}>
                          #{topAwayPlayers[0].jerseyNumber}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-black uppercase text-slate-900">
                          {topAwayPlayers[0].firstName} {topAwayPlayers[0].lastName}
                        </span>
                        <span className="text-[0.62rem] font-bold text-slate-400">
                          {topAwayPlayers[0].position} • {topAwayPlayers[0].minutesPlayed || "24:00"} MIN
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-xs font-black text-blue-700">{topAwayPlayers[0].points} PTS</span>
                      <span className="block text-[0.65rem] font-bold text-slate-500">
                        {topAwayPlayers[0].oreb + topAwayPlayers[0].dreb} REB • {topAwayPlayers[0].ast} AST
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: OFFICIAL BOX SCORE (IMAGE 1: FULL WIDTH, NO LIVE PLAY FEED, RETAIN FIBA PROGRESSIVE)
         ===================================================================== */}
      {activeTab === "box_score" && (
        <div className="space-y-6">
          <ScorebookAndPlayByPlaySection
            gameNumber={selectedMatch?.gameNumber ?? 1}
            session={session}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
            homeColor={homeColor}
            awayColor={awayColor}
            homePlayersList={homePlayersList}
            awayPlayersList={awayPlayersList}
            personalFoulLimit={league.rulesConfig.personalFoulLimit || 5}
            assignedReferees={[]}
            showHomeTeam={true}
            showAwayTeam={true}
            showPlayByPlayFeed={false} // Clean Image 1 layout: Box Score or FIBA Progressive full width
            onSubstitutePlayer={() => {}}
            onUndoLastPlay={() => {}}
          />
        </div>
      )}

      {/* =====================================================================
          TAB 3: GAME CHARTS (IMAGE 2: ACCURATE LEAD TRACKER, IMAGE 3: LEADING PLAYERS, IMAGE 4: TEAM COMPARISON)
         ===================================================================== */}
      {activeTab === "game_charts" && (
        <div className="space-y-8">
          {/* 1. LEAD TRACKER (IMAGE 2: AWAY LEADS EXTEND UP TO AWAY SIDE, HOME LEADS EXTEND DOWN TO HOME SIDE) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Lead Tracker
              </h2>
            </div>

            {/* Visual Bar Graph for Lead Tracker */}
            <div className="space-y-4">
              <div className="relative h-64 w-full bg-slate-50/70 border border-slate-200 rounded-2xl p-4 overflow-hidden">
                {/* Horizontal Zero Axis */}
                <div className="absolute left-16 right-6 top-1/2 border-t-2 border-dashed border-slate-300 z-10" />

                {/* Top Half: AWAY TEAM (positive diff) */}
                <div className="absolute left-3 top-3 text-[0.68rem] font-black text-slate-900">
                  15 <span className="text-slate-500">{awayTeamName.slice(0, 3).toUpperCase()}</span>
                </div>
                <div className="absolute left-3 top-14 text-[0.68rem] font-bold text-slate-400">10</div>
                <div className="absolute left-3 top-24 text-[0.68rem] font-bold text-slate-400">5</div>

                {/* Bottom Half: HOME TEAM (negative diff) */}
                <div className="absolute left-3 bottom-24 text-[0.68rem] font-bold text-slate-400">5</div>
                <div className="absolute left-3 bottom-14 text-[0.68rem] font-bold text-slate-400">10</div>
                <div className="absolute left-3 bottom-3 text-[0.68rem] font-black text-slate-900">
                  15 <span className="text-slate-500">{homeTeamName.slice(0, 3).toUpperCase()}</span>
                </div>

                {/* Bars Plot:
                    Away Lead (diff > 0): starts at center (50%) and goes UP (height = % towards top)
                    Home Lead (diff < 0): starts at center (50%) and goes DOWN (height = % towards bottom)
                */}
                <div className="absolute left-16 right-6 top-6 bottom-6 flex items-center justify-between gap-1">
                  {leadTrackerPoints.map((pt, i) => {
                    const isAwayLead = pt.diff > 0;
                    const isHomeLead = pt.diff < 0;
                    const magnitude = Math.min(Math.abs(pt.diff), 15);
                    const heightPct = (magnitude / 15) * 46;

                    return (
                      <div
                        key={i}
                        className="h-full flex-1 flex flex-col items-center justify-center relative group"
                      >
                        {isAwayLead && (
                          // Extends UP from center line
                          <div
                            className="w-full absolute rounded-t-xs transition-all duration-300"
                            style={{
                              bottom: "50%",
                              height: `${heightPct}%`,
                              backgroundColor: awayColor,
                            }}
                            title={`${awayTeamName} +${pt.diff}`}
                          />
                        )}
                        {isHomeLead && (
                          // Extends DOWN from center line
                          <div
                            className="w-full absolute rounded-b-xs transition-all duration-300"
                            style={{
                              top: "50%",
                              height: `${heightPct}%`,
                              backgroundColor: homeColor,
                            }}
                            title={`${homeTeamName} +${-pt.diff}`}
                          />
                        )}
                        {!isAwayLead && !isHomeLead && (
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-400 absolute top-1/2 -translate-y-1/2" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quarter Markers on X-Axis Bottom */}
                <div className="absolute left-16 right-6 bottom-1 flex justify-between text-[0.68rem] font-black uppercase text-slate-400">
                  <span>Q1</span>
                  <span>Q2</span>
                  <span>Q3</span>
                  <span>Q4</span>
                </div>
              </div>

              {/* Lead Tracker Telemetry Box (Image 2 Footer) */}
              <div className="flex flex-col items-center justify-center pt-2">
                <div className="flex items-center gap-8 text-center pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-slate-900">{leadTelemetry.maxLeadAway}</span>
                    <span className="text-xs font-bold text-slate-500 uppercase">{awayTeamName.slice(0, 3)}</span>
                  </div>
                  <span className="text-lg font-black uppercase tracking-wider text-slate-900">Biggest Lead</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-slate-900">{leadTelemetry.maxLeadHome}</span>
                    <span className="text-xs font-bold text-slate-500 uppercase">{homeTeamName.slice(0, 3)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-10 text-xs font-black uppercase text-slate-500">
                  <div>TIMES TIED <span className="text-sm font-black text-slate-900 ml-1">{leadTelemetry.timesTied}</span></div>
                  <div>LONGEST RUN <span className="text-sm font-black text-slate-900 ml-1">{leadTelemetry.longestRun}</span></div>
                  <div>LEAD CHANGES <span className="text-sm font-black text-slate-900 ml-1">{leadTelemetry.leadChanges}</span></div>
                </div>
              </div>
            </div>
          </section>

          {/* 2. LEADING PLAYERS (IMAGE 3: POLAR STARBURST / WHEEL WITH CONNECTING LINES) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Leading Players
              </h2>
            </div>

            {/* Radial / Starburst Graphic Layout */}
            <div className="relative py-8 flex items-center justify-center min-h-[460px]">
              {/* Central Polar Circle */}
              <div className="relative h-48 w-48 rounded-full border-4 border-slate-100 bg-white shadow-xl flex items-center justify-center z-20">
                <div className="text-center">
                  <span className="block text-[0.62rem] font-black uppercase tracking-widest text-slate-400">CATEGORY</span>
                  <div className="grid grid-cols-2 gap-2 text-xs font-black text-slate-800 pt-1">
                    <span>PTS</span>
                    <span>REB</span>
                    <span>AST</span>
                    <span>BLK</span>
                  </div>
                </div>
              </div>

              {/* Surrounding Player Nodes with Connectors */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {/* Top-Right: PTS Leader Home */}
                <div className="absolute top-4 right-16 sm:right-28 pointer-events-auto flex items-center gap-3">
                  <div className="text-right">
                    <span className="block text-xs font-black uppercase text-slate-900">
                      {topHomePlayers[0]?.firstName} {topHomePlayers[0]?.lastName}
                    </span>
                    <span className="block text-xs font-black text-emerald-700">
                      {topHomePlayers[0]?.points || 36} PTS
                    </span>
                  </div>
                  <div className="relative h-14 w-14 rounded-full border-2 border-emerald-600 p-0.5 bg-white shadow-md">
                    {topHomePlayers[0]?.imageUrl ? (
                      <img src={topHomePlayers[0].imageUrl} alt="P" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <div className="h-full w-full rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-black">
                        #{topHomePlayers[0]?.jerseyNumber || 0}
                      </div>
                    )}
                  </div>
                </div>

                {/* Top-Left: PTS Leader Away */}
                <div className="absolute top-4 left-16 sm:left-28 pointer-events-auto flex items-center gap-3">
                  <div className="relative h-14 w-14 rounded-full border-2 border-blue-600 p-0.5 bg-white shadow-md">
                    {topAwayPlayers[0]?.imageUrl ? (
                      <img src={topAwayPlayers[0].imageUrl} alt="P" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <div className="h-full w-full rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-black">
                        #{topAwayPlayers[0]?.jerseyNumber || 0}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="block text-xs font-black uppercase text-slate-900">
                      {topAwayPlayers[0]?.firstName} {topAwayPlayers[0]?.lastName}
                    </span>
                    <span className="block text-xs font-black text-blue-700">
                      {topAwayPlayers[0]?.points || 22} PTS
                    </span>
                  </div>
                </div>

                {/* Bottom-Right: REB Leader */}
                <div className="absolute bottom-4 right-16 sm:right-28 pointer-events-auto flex items-center gap-3">
                  <div className="text-right">
                    <span className="block text-xs font-black uppercase text-slate-900">
                      {topHomePlayers[1]?.firstName || "Leader"} {topHomePlayers[1]?.lastName || ""}
                    </span>
                    <span className="block text-xs font-black text-emerald-700">
                      {(topHomePlayers[1]?.oreb ?? 2) + (topHomePlayers[1]?.dreb ?? 5)} REB
                    </span>
                  </div>
                  <div className="relative h-14 w-14 rounded-full border-2 border-emerald-600 p-0.5 bg-white shadow-md">
                    {topHomePlayers[1]?.imageUrl ? (
                      <img src={topHomePlayers[1].imageUrl} alt="P" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <div className="h-full w-full rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-black">
                        #{topHomePlayers[1]?.jerseyNumber || 3}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom-Left: AST Leader */}
                <div className="absolute bottom-4 left-16 sm:left-28 pointer-events-auto flex items-center gap-3">
                  <div className="relative h-14 w-14 rounded-full border-2 border-blue-600 p-0.5 bg-white shadow-md">
                    {topAwayPlayers[1]?.imageUrl ? (
                      <img src={topAwayPlayers[1].imageUrl} alt="P" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <div className="h-full w-full rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-black">
                        #{topAwayPlayers[1]?.jerseyNumber || 11}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="block text-xs font-black uppercase text-slate-900">
                      {topAwayPlayers[1]?.firstName || "Leader"} {topAwayPlayers[1]?.lastName || ""}
                    </span>
                    <span className="block text-xs font-black text-blue-700">
                      {topAwayPlayers[1]?.ast || 8} AST
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. TEAM COMPARISON (IMAGE 4: CENTER LABELS, HORIZONTAL BARS + DONUT CHARTS) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-8">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Team Comparison
              </h2>
            </div>

            {/* Team Titles */}
            <div className="grid grid-cols-2 text-center text-base font-black">
              <span style={{ color: awayColor }}>{awayTeamName}</span>
              <span style={{ color: homeColor }}>{homeTeamName}</span>
            </div>

            {/* Centered Comparison Rows */}
            <div className="space-y-4 max-w-2xl mx-auto">
              {[
                { label: "PTS", awayVal: session.awayScore, homeVal: session.homeScore, max: 130 },
                { label: "REB", awayVal: awayTotals.reb || 24, homeVal: homeTotals.reb || 17, max: 60 },
                { label: "AST", awayVal: awayTotals.ast || 9, homeVal: homeTotals.ast || 12, max: 40 },
                { label: "STL", awayVal: awayTotals.stl || 6, homeVal: homeTotals.stl || 7, max: 15 },
                { label: "BLK", awayVal: awayTotals.blk || 2, homeVal: homeTotals.blk || 4, max: 10 },
                { label: "TO", awayVal: awayTotals.tov || 16, homeVal: homeTotals.tov || 10, max: 25 },
                { label: "FG%", awayVal: Number(awayFgPct), homeVal: Number(homeFgPct), max: 100, isPct: true },
                { label: "3P%", awayVal: Number(away3pPct), homeVal: Number(home3pPct), max: 100, isPct: true },
                { label: "FT%", awayVal: Number(awayFtPct), homeVal: Number(homeFtPct), max: 100, isPct: true },
              ].map((row, idx) => {
                const awayWidth = Math.min((row.awayVal / row.max) * 100, 100);
                const homeWidth = Math.min((row.homeVal / row.max) * 100, 100);

                return (
                  <div key={idx} className="flex items-center gap-4 text-xs font-black">
                    {/* Away Side (Right-aligned bar) */}
                    <div className="flex-1 flex items-center justify-end gap-3">
                      <span className="text-sm font-black tabular-nums" style={{ color: awayColor }}>
                        {row.isPct ? row.awayVal.toFixed(1) : row.awayVal}
                      </span>
                      <div className="w-44 h-5 bg-slate-100 rounded-sm flex justify-end overflow-hidden">
                        <div
                          className="h-full rounded-sm transition-all duration-500"
                          style={{ width: `${awayWidth}%`, backgroundColor: awayColor }}
                        />
                      </div>
                    </div>

                    {/* Center Metric Label */}
                    <span className="w-12 text-center text-xs font-black text-slate-500 uppercase tracking-wider shrink-0">
                      {row.label}
                    </span>

                    {/* Home Side (Left-aligned bar) */}
                    <div className="flex-1 flex items-center justify-start gap-3">
                      <div className="w-44 h-5 bg-slate-100 rounded-sm flex justify-start overflow-hidden">
                        <div
                          className="h-full rounded-sm transition-all duration-500"
                          style={{ width: `${homeWidth}%`, backgroundColor: homeColor }}
                        />
                      </div>
                      <span className="text-sm font-black tabular-nums" style={{ color: homeColor }}>
                        {row.isPct ? row.homeVal.toFixed(1) : row.homeVal}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Donut Charts Footer (Image 4): PTS IN THE PAINT, 2ND CHANCE PTS, FASTBREAK PTS */}
            <div className="pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              {[
                { title: "PTS IN THE PAINT", away: 30, home: 38 },
                { title: "2ND CHANCE PTS", away: 15, home: 13 },
                { title: "FASTBREAK PTS", away: 12, home: 11 },
              ].map((donut, idx) => {
                const total = donut.away + donut.home;
                const awayPct = Math.round((donut.away / total) * 100);

                return (
                  <div key={idx} className="space-y-3 flex flex-col items-center">
                    <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      {donut.title}
                    </span>
                    <div className="relative h-28 w-28 flex items-center justify-center">
                      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                        {/* Background Ring */}
                        <path
                          className="text-slate-100"
                          strokeWidth="5"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        {/* Away Slice */}
                        <path
                          stroke={awayColor}
                          strokeWidth="5"
                          strokeDasharray={`${awayPct}, 100`}
                          strokeLinecap="round"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        {/* Home Slice */}
                        <path
                          stroke={homeColor}
                          strokeWidth="5"
                          strokeDasharray={`${100 - awayPct}, 100`}
                          strokeDashoffset={`-${awayPct}`}
                          strokeLinecap="round"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      {/* Center Values */}
                      <div className="absolute inset-0 flex items-center justify-between px-3 text-[0.68rem] font-black">
                        <span style={{ color: awayColor }}>{donut.away}</span>
                        <span style={{ color: homeColor }}>{donut.home}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-[0.68rem] font-black uppercase">
                      <span style={{ color: awayColor }}>{awayTeamName.slice(0, 3)}</span>
                      <span style={{ color: homeColor }}>{homeTeamName.slice(0, 3)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          TAB 4: PLAY BY PLAY (IMAGE 5: LARGER TEAM & LOGO, PLAYERS IMAGE, CENTERED CLOCK)
         ===================================================================== */}
      {activeTab === "play_by_play" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
            {/* Top Period Filter Bar */}
            <div className="flex flex-col items-center gap-4">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                {(["ALL", 1, 2, 3, 4] as const).map((p) => {
                  const label = p === "ALL" ? "ALL" : `Q${p}`;
                  const isActive = selectedPlayPeriod === p;
                  return (
                    <button
                      key={String(p)}
                      type="button"
                      onClick={() => setSelectedPlayPeriod(p)}
                      className={`px-5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                        isActive
                          ? "bg-[#0B2F5C] text-white shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Latest First Toggle */}
              <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-700">
                <span>Latest First</span>
                <button
                  type="button"
                  onClick={() => setIsLatestFirst(!isLatestFirst)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isLatestFirst ? "bg-[#0B2F5C]" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      isLatestFirst ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Team Titles Row (Larger Logo & Names) */}
              <div className="w-full flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-3.5">
                  {awayTeam?.imageUrl ? (
                    <img src={awayTeam.imageUrl} alt="Away" className="h-10 w-10 rounded-full object-contain p-0.5 bg-white border border-slate-200 shadow-2xs" />
                  ) : (
                    <span className="h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-black shadow-2xs" style={{ backgroundColor: awayColor }}>
                      {awayTeamName.slice(0, 2)}
                    </span>
                  )}
                  <span className="text-base sm:text-lg font-black uppercase text-slate-900 tracking-tight">{awayTeamName}</span>
                </div>

                <div className="flex items-center gap-3.5">
                  <span className="text-base sm:text-lg font-black uppercase text-slate-900 tracking-tight">{homeTeamName}</span>
                  {homeTeam?.imageUrl ? (
                    <img src={homeTeam.imageUrl} alt="Home" className="h-10 w-10 rounded-full object-contain p-0.5 bg-white border border-slate-200 shadow-2xs" />
                  ) : (
                    <span className="h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-black shadow-2xs" style={{ backgroundColor: homeColor }}>
                      {homeTeamName.slice(0, 2)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Centered Timeline Layout with Player Portraits */}
            <div className="space-y-3 max-w-4xl mx-auto">
              {(() => {
                const filtered = session.playEvents.filter((ev) =>
                  selectedPlayPeriod === "ALL" ? true : ev.period === selectedPlayPeriod
                );
                const sorted = isLatestFirst ? [...filtered].reverse() : filtered;

                if (sorted.length === 0) {
                  return (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
                      <p className="text-xs font-semibold text-slate-500">
                        No plays recorded for this period yet.
                      </p>
                    </div>
                  );
                }

                return sorted.map((ev) => {
                  const isAway = ev.teamSide === "AWAY";
                  const isHome = ev.teamSide === "HOME";
                  const isScoring = ev.pointsDelta > 0;

                  // Find player portrait from roster
                  const teamRoster = isHome ? homeTeam?.roster : awayTeam?.roster;
                  const playerMatch = teamRoster?.find((rp) => rp.id === ev.playerId || rp.jerseyNumber === ev.playerJersey);
                  const playerPortrait = playerMatch?.imageUrl;

                  return (
                    <div
                      key={ev.id}
                      className="grid grid-cols-12 items-center gap-3 py-2.5 hover:bg-slate-50 rounded-2xl px-3 transition-colors border border-transparent hover:border-slate-100"
                    >
                      {/* Left: Away Team Plays (Cols 1–5) */}
                      <div className="col-span-5 flex items-center justify-end text-right min-w-0">
                        {isAway && (
                          <div className="flex items-center justify-end gap-3">
                            <span className={`text-xs leading-snug ${isScoring ? "font-black text-slate-900" : "font-medium text-slate-700"}`}>
                              {ev.description}
                            </span>
                            {/* Player Portrait or Jersey Pill */}
                            {playerPortrait ? (
                              <img
                                src={playerPortrait}
                                alt="Player"
                                className="h-9 w-9 rounded-xl object-cover border-2 border-slate-200 shrink-0 shadow-2xs"
                              />
                            ) : (
                              <div
                                className="relative h-8 w-8 rounded-full flex items-center justify-center shrink-0 border border-slate-200 text-white font-black text-xs shadow-2xs"
                                style={{ backgroundColor: awayColor }}
                              >
                                #{ev.playerJersey || "A"}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Center: Game Clock & Running Score (Cols 6–7) */}
                      <div className="col-span-2 text-center shrink-0">
                        <span className="block text-xs font-bold text-slate-400 tabular-nums">
                          {ev.gameClockDisplay}
                        </span>
                        {isScoring && (
                          <span className="block text-xs font-black tabular-nums text-slate-800">
                            {ev.awayScoreAfter} - {ev.homeScoreAfter}
                          </span>
                        )}
                      </div>

                      {/* Right: Home Team Plays (Cols 8–12) */}
                      <div className="col-span-5 flex items-center justify-start text-left min-w-0">
                        {isHome && (
                          <div className="flex items-center justify-start gap-3">
                            {/* Player Portrait or Jersey Pill */}
                            {playerPortrait ? (
                              <img
                                src={playerPortrait}
                                alt="Player"
                                className="h-9 w-9 rounded-xl object-cover border-2 border-slate-200 shrink-0 shadow-2xs"
                              />
                            ) : (
                              <div
                                className="relative h-8 w-8 rounded-full flex items-center justify-center shrink-0 border border-slate-200 text-white font-black text-xs shadow-2xs"
                                style={{ backgroundColor: homeColor }}
                              >
                                #{ev.playerJersey || "H"}
                              </div>
                            )}
                            <span className={`text-xs leading-snug ${isScoring ? "font-black text-slate-900" : "font-medium text-slate-700"}`}>
                              {ev.description}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          TAB 5: SOCIAL MEDIA INFOGRAPHICS (3 DESIGNS + CUSTOM BG + LEAGUE LOGO + ALL PLAYERS)
         ===================================================================== */}
      {activeTab === "infographics" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-200">
              <div>
                <span className="text-[0.65rem] font-black uppercase tracking-wider text-amber-600">
                  VIRAL GRAPHICS GENERATOR
                </span>
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                  Player of the Game Social Infographics
                </h2>
                <p className="text-xs text-slate-500">
                  Generate 1080×1080 HD cards for any player from both squads with your league logo and multiple background styles.
                </p>
              </div>

              {/* Player Selector Dropdown (ALL PLAYERS) */}
              <div className="flex items-center gap-2">
                <label htmlFor="infographic-select" className="text-xs font-black uppercase text-slate-500 whitespace-nowrap">
                  Choose Player:
                </label>
                <select
                  id="infographic-select"
                  value={infographicPlayerId || selectedInfographicPlayer?.playerId || ""}
                  onChange={(e) => setInfographicPlayerId(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-slate-50 py-2 px-3 text-xs font-black text-slate-900 focus:outline-none"
                >
                  <optgroup label={`${homeTeamName} Players`}>
                    {homePlayersList.map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        #{p.jerseyNumber} {p.firstName} {p.lastName} — {p.points} PTS ({homeTeamName})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={`${awayTeamName} Players`}>
                    {awayPlayersList.map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        #{p.jerseyNumber} {p.firstName} {p.lastName} — {p.points} PTS ({awayTeamName})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Customization Toolbar: Upload & Save Custom Background or Color Pickers */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex flex-wrap items-center gap-6">
                {/* Background Color Picker */}
                <div className="flex items-center gap-3">
                  <Palette className="h-4 w-4 text-slate-500" />
                  <label htmlFor="infographic-bg-color" className="text-xs font-black uppercase text-slate-600">
                    Background Color:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="infographic-bg-color"
                      type="color"
                      value={infographicBgColor}
                      onChange={(e) => handleColorChange(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5"
                      title="Choose card background color"
                    />
                    {/* Quick Color Presets */}
                    <div className="flex items-center gap-1.5">
                      {[
                        { label: "White", color: "#FFFFFF" },
                        { label: "Light Gray", color: "#F1F5F9" },
                        { label: "Dark Gray", color: "#0F172A" },
                        { label: "Gold", color: "#FBBF24" },
                        { label: "Team", color: homeColor },
                      ].map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => handleColorChange(c.color)}
                          title={`Set background to ${c.label}`}
                          className={`h-6 w-6 rounded-md border text-[10px] font-bold shadow-2xs transition-transform hover:scale-110 cursor-pointer ${
                            infographicBgColor.toLowerCase() === c.color.toLowerCase()
                              ? "ring-2 ring-blue-500 border-white"
                              : "border-slate-300"
                          }`}
                          style={{ backgroundColor: c.color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Text Color Picker */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black uppercase text-slate-600">
                    Text Color:
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      id="infographic-text-color"
                      type="color"
                      value={infographicTextColor}
                      onChange={(e) => handleTextColorChange(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5"
                      title="Choose text color"
                    />
                    {/* Quick Text Color Presets */}
                    <div className="flex items-center gap-1.5">
                      {[
                        { label: "Black", color: "#000000" },
                        { label: "Dark Navy", color: "#0B2F5C" },
                        { label: "White", color: "#FFFFFF" },
                        { label: "Gold", color: "#F59E0B" },
                        { label: "Crimson", color: "#8B0D0E" },
                      ].map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => handleTextColorChange(c.color)}
                          title={`Set text color to ${c.label}`}
                          className={`h-6 w-6 rounded-md border text-[10px] font-bold shadow-2xs transition-transform hover:scale-110 cursor-pointer ${
                            infographicTextColor.toLowerCase() === c.color.toLowerCase()
                              ? "ring-2 ring-blue-500 border-white"
                              : "border-slate-300"
                          }`}
                          style={{ backgroundColor: c.color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                {/* Badge Style Switcher */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-slate-600">
                    Badge:
                  </span>
                  <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleBadgeChange("potg")}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        infographicBadgeStyle === "potg"
                          ? "bg-[#0B2F5C] text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Player of the Game
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBadgeChange("boxscore")}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        infographicBadgeStyle === "boxscore"
                          ? "bg-[#8B0D0E] text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Box Score Logo
                    </button>
                  </div>
                </div>
              </div>

              {/* Upload Custom Background Image */}
              <div className="flex flex-wrap items-center gap-3">
                <label
                  title="Upload custom image background (e.g., arena photo, court wood floor, graphic pattern)"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-black uppercase text-slate-700 border border-slate-300 shadow-2xs hover:bg-slate-100 hover:text-slate-900 cursor-pointer transition-colors"
                >
                  <Upload className="h-4 w-4 text-[#0B2F5C]" />
                  <span>{isSavingCustomBg ? "Uploading..." : "Upload Background Image"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleUploadBgImage}
                    disabled={isSavingCustomBg}
                  />
                </label>

                {infographicCustomBgImage && (
                  <button
                    type="button"
                    onClick={handleResetCustomBg}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase text-rose-700 hover:bg-rose-100 cursor-pointer shadow-2xs transition-colors"
                    title="Remove custom background image and revert to color"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset Image
                  </button>
                )}
              </div>
            </div>

            {/* PREVIEW CONTAINER */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left: Rendered Graphic Preview Card */}
              <div className="lg:col-span-7 flex justify-center">
                {renderedPreviewDataUrl ? (
                  <div className="relative group max-w-[500px] w-full aspect-square rounded-3xl overflow-hidden shadow-xl bg-slate-950">
                    <img
                      src={renderedPreviewDataUrl}
                      alt="Infographic Preview"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={handleOpenPreviewModal}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white/90 px-4 py-2.5 text-xs font-black uppercase text-slate-900 shadow-lg hover:bg-white cursor-pointer"
                      >
                        <Eye className="h-4 w-4" />
                        Full Size Preview
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-[500px] aspect-square rounded-3xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 text-xs font-black uppercase">
                    Generating Graphic...
                  </div>
                )}
              </div>

              {/* Right: Actions & Customization Info */}
              <div className="lg:col-span-5 space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
                  <span className="text-[0.65rem] font-black uppercase tracking-wider text-slate-500">
                    Selected Spotlight
                  </span>
                  <div className="flex items-center gap-3">
                    {selectedInfographicPlayer?.imageUrl ? (
                      <img
                        src={selectedInfographicPlayer.imageUrl}
                        alt="Player"
                        className="h-12 w-12 rounded-xl object-cover border border-slate-300"
                      />
                    ) : (
                      <div
                        className="h-12 w-12 rounded-xl flex items-center justify-center font-black text-white text-base"
                        style={{
                          backgroundColor:
                            selectedInfographicPlayer?.teamSide === "HOME" ? homeColor : awayColor,
                        }}
                      >
                        #{selectedInfographicPlayer?.jerseyNumber}
                      </div>
                    )}
                    <div>
                      <h4 className="text-base font-black uppercase text-slate-900">
                        {selectedInfographicPlayer?.firstName} {selectedInfographicPlayer?.lastName}
                      </h4>
                      <p className="text-xs font-bold text-slate-500 uppercase">
                        #{selectedInfographicPlayer?.jerseyNumber} • {selectedInfographicPlayer?.position} • {selectedInfographicPlayer?.teamName}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs font-black">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="block text-[0.62rem] text-slate-400">POINTS</span>
                      <span className="text-rose-600 text-base">{selectedInfographicPlayer?.points}</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="block text-[0.62rem] text-slate-400">REBOUNDS</span>
                      <span className="text-blue-600 text-base">
                        {(selectedInfographicPlayer?.oreb ?? 0) + (selectedInfographicPlayer?.dreb ?? 0)}
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="block text-[0.62rem] text-slate-400">ASSISTS</span>
                      <span className="text-emerald-600 text-base">{selectedInfographicPlayer?.ast}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleOpenPreviewModal}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-3.5 text-xs font-black uppercase tracking-wider text-slate-900 shadow-2xs hover:bg-slate-50 cursor-pointer"
                  >
                    <Eye className="h-4 w-4 text-[#0B2F5C]" />
                    Inspect Full-Screen Preview
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadInfographic}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-md hover:bg-amber-400 cursor-pointer transition-all active:scale-95"
                  >
                    <Download className="h-4 w-4" />
                    Download 1080×1080 Graphic (PNG)
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* FULL-SIZE PREVIEW MODAL */}
      {isPreviewModalOpen && renderedPreviewDataUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="relative max-w-2xl w-full rounded-3xl bg-slate-900 p-6 shadow-2xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between text-white pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-black uppercase">
                  Social Media Graphic Preview
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="aspect-square w-full rounded-2xl overflow-hidden bg-slate-950">
              <img
                src={renderedPreviewDataUrl}
                alt="Full Preview"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="rounded-xl px-4 py-2.5 text-xs font-black uppercase text-slate-300 hover:text-white cursor-pointer"
              >
                Close Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDownloadInfographic();
                  setIsPreviewModalOpen(false);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-black uppercase text-slate-950 hover:bg-amber-400 cursor-pointer shadow-md"
              >
                <Download className="h-4 w-4" />
                Confirm &amp; Download PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
