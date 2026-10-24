"use client";

import React, { useState } from "react";
import { Award, Undo2 } from "lucide-react";
import {
  LeagueReferee,
  LeagueTeam,
  LiveGameSession,
  PlayerGameStats,
  RunningScoreEntry,
} from "@/types/boxscore";

interface ScorebookAndPlayByPlaySectionProps {
  gameNumber: number;
  session: LiveGameSession;
  homeTeam: LeagueTeam | null;
  awayTeam: LeagueTeam | null;
  homeTeamName: string;
  awayTeamName: string;
  homeColor: string;
  awayColor: string;
  homePlayersList: PlayerGameStats[];
  awayPlayersList: PlayerGameStats[];
  personalFoulLimit: number;
  assignedReferees: LeagueReferee[];
  showHomeTeam: boolean;
  showAwayTeam: boolean;
  showPlayByPlayFeed?: boolean;
  onSubstitutePlayer: (side: "HOME" | "AWAY", benchPlayerId: string) => void;
  onUndoLastPlay: () => void;
}

export function ScorebookAndPlayByPlaySection({
  gameNumber,
  session,
  homeTeam,
  awayTeam,
  homeTeamName,
  awayTeamName,
  homeColor,
  awayColor,
  homePlayersList,
  awayPlayersList,
  personalFoulLimit,
  assignedReferees,
  showHomeTeam,
  showAwayTeam,
  showPlayByPlayFeed = true,
  onSubstitutePlayer,
  onUndoLastPlay,
}: ScorebookAndPlayByPlaySectionProps) {
  const [scorebookViewMode, setScorebookViewMode] = useState<
    "BOX_SCORE" | "RUNNING_SCORE"
  >("BOX_SCORE");
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<"ALL" | number>("ALL");

  const renderTeamBoxScoreTable = (
    teamObj: LeagueTeam | null,
    teamLabel: string,
    teamPrimary: string,
    players: PlayerGameStats[],
    side: "HOME" | "AWAY"
  ) => {
    const totals = players.reduce(
      (acc, p) => {
        acc.pts += p.points;
        acc.fgm += p.fgm;
        acc.fga += p.fga;
        acc.tpm += p.tpm;
        acc.tpa += p.tpa;
        acc.ftm += p.ftm;
        acc.fta += p.fta;
        acc.oreb += p.oreb;
        acc.dreb += p.dreb;
        acc.ast += p.ast;
        acc.stl += p.stl;
        acc.blk += p.blk;
        acc.tov += p.tov;
        acc.pf += p.pf;
        return acc;
      },
      {
        pts: 0,
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
      }
    );

    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-white"
          style={{ backgroundColor: teamPrimary }}
        >
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-black/30 px-2 py-0.5 text-[0.65rem] font-black uppercase">
              {side} TEAM SCOREBOOK
            </span>
            <h3 className="text-base font-black uppercase tracking-tight">
              {teamLabel}
            </h3>
          </div>
          <div className="text-xs font-bold text-white/90">
            Coach: {teamObj?.headCoach || "TBA"} • Total Fouls: {totals.pf}
          </div>
        </div>

        <div
          className="overflow-x-auto"
          role="region"
          aria-label={`${teamLabel} Official Box Score`}
          tabIndex={0}
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[0.65rem] font-black uppercase text-slate-500">
                <th className="py-2.5 px-2.5">#</th>
                <th className="py-2.5 px-3">Player</th>
                <th className="py-2.5 px-2 text-center">Floor</th>
                <th className="py-2.5 px-2.5 text-center">MIN</th>
                <th className="py-2.5 px-2.5 text-right">PTS</th>
                <th className="py-2.5 px-2.5 text-right">FG</th>
                <th className="py-2.5 px-2.5 text-right">3PT</th>
                <th className="py-2.5 px-2.5 text-right">FT</th>
                <th className="py-2.5 px-2 text-right">OR</th>
                <th className="py-2.5 px-2 text-right">DR</th>
                <th className="py-2.5 px-2 text-right">REB</th>
                <th className="py-2.5 px-2 text-right">AST</th>
                <th className="py-2.5 px-2 text-right">STL</th>
                <th className="py-2.5 px-2 text-right">BLK</th>
                <th className="py-2.5 px-2 text-right">TO</th>
                <th className="py-2.5 px-2.5 text-center">
                  PF ({personalFoulLimit})
                </th>
                <th className="py-2.5 px-2.5 text-right">EFF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {players.map((p) => {
                const reb = p.oreb + p.dreb;
                const missedFg = p.fga - p.fgm;
                const missedFt = p.fta - p.ftm;
                const eff =
                  p.points +
                  reb +
                  p.ast +
                  p.stl +
                  p.blk -
                  missedFg -
                  missedFt -
                  p.tov;
                const isFouledOut = p.pf >= personalFoulLimit;

                return (
                  <tr
                    key={p.playerId}
                    className={`transition-colors ${
                      isFouledOut ? "bg-rose-50/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="py-2 px-2.5 font-black tabular-nums text-slate-900">
                      #{p.jerseyNumber}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black uppercase text-slate-900">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.6rem] font-black text-slate-600">
                          {p.position}
                        </span>
                        {isFouledOut && (
                          <span className="rounded bg-[#8B0D0E] px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-white">
                            FOULED OUT
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      {p.isOnCourt ? (
                        <span className="inline-block rounded-md bg-emerald-600 px-2 py-0.5 text-[0.6rem] font-black uppercase text-white">
                          ON COURT
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSubstitutePlayer(side, p.playerId)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[0.6rem] font-black uppercase text-slate-700 hover:bg-[#0B2F5C] hover:text-white cursor-pointer"
                        >
                          Sub In
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-2.5 text-center font-bold text-slate-600 tabular-nums">
                      {p.minutesPlayed || (p.isOnCourt ? "10:00" : "0:00")}
                    </td>
                    <td className="py-2 px-2.5 text-right font-black tabular-nums text-sm text-slate-900">
                      {p.points}
                    </td>
                    <td className="py-2 px-2.5 text-right tabular-nums font-bold text-slate-700">
                      {p.fgm}-{p.fga}
                    </td>
                    <td className="py-2 px-2.5 text-right tabular-nums font-bold text-slate-700">
                      {p.tpm}-{p.tpa}
                    </td>
                    <td className="py-2 px-2.5 text-right tabular-nums font-bold text-slate-700">
                      {p.ftm}-{p.fta}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-600">
                      {p.oreb}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-600">
                      {p.dreb}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-black text-slate-900">
                      {reb}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold text-slate-800">
                      {p.ast}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold text-slate-800">
                      {p.stl}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold text-slate-800">
                      {p.blk}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold text-rose-700">
                      {p.tov}
                    </td>
                    <td className="py-2 px-2.5 text-center">
                      <div className="inline-flex items-center gap-1">
                        {Array.from({ length: personalFoulLimit }).map(
                          (_, fIdx) => (
                            <span
                              key={fIdx}
                              className={`h-2.5 w-2.5 rounded-full border ${
                                fIdx < p.pf
                                  ? fIdx === personalFoulLimit - 1
                                    ? "border-[#8B0D0E] bg-[#8B0D0E]"
                                    : "border-amber-500 bg-amber-400"
                                  : "border-slate-300 bg-slate-100"
                              }`}
                            />
                          )
                        )}
                        <span className="ml-1 font-black tabular-nums text-slate-800">
                          {p.pf}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2.5 text-right tabular-nums font-black text-[#0B2F5C]">
                      {eff >= 0 ? `+${eff}` : eff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100 font-black text-slate-900">
                <td colSpan={3} className="py-2.5 px-3 uppercase">
                  Team Totals
                </td>
                <td className="py-2.5 px-2.5 text-right tabular-nums text-sm">
                  {totals.pts}
                </td>
                <td className="py-2.5 px-2.5 text-right tabular-nums">
                  {totals.fgm}-{totals.fga}
                </td>
                <td className="py-2.5 px-2.5 text-right tabular-nums">
                  {totals.tpm}-{totals.tpa}
                </td>
                <td className="py-2.5 px-2.5 text-right tabular-nums">
                  {totals.ftm}-{totals.fta}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {totals.oreb}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {totals.dreb}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {totals.oreb + totals.dreb}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {totals.ast}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {totals.stl}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">
                  {totals.blk}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-rose-700">
                  {totals.tov}
                </td>
                <td className="py-2.5 px-2.5 text-center tabular-nums">
                  {totals.pf} PF
                </td>
                <td className="py-2.5 px-2.5 text-right tabular-nums">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const renderRunningScoreSheet = (
    teamLabel: string,
    teamPrimary: string,
    currentScore: number,
    runningMap: Record<number, RunningScoreEntry>
  ) => {
    const maxCells = Math.max(120, Math.ceil((currentScore + 10) / 20) * 20);
    const numbers = Array.from({ length: maxCells }, (_, i) => i + 1);

    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div
          className="flex items-center justify-between px-5 py-3 text-white"
          style={{ backgroundColor: teamPrimary }}
        >
          <span className="text-sm font-black uppercase tracking-wider">
            {teamLabel} — Official Progressive Running Score (1–{maxCells})
          </span>
          <span className="rounded-md bg-black/30 px-2.5 py-0.5 text-xs font-black tabular-nums">
            Score: {currentScore}
          </span>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-10 sm:grid-cols-20 gap-1.5">
            {numbers.map((num) => {
              const entry = runningMap[num];
              const isScored = num <= currentScore;
              return (
                <div
                  key={num}
                  className={`flex flex-col items-center justify-center rounded-lg border py-1.5 px-1 text-center tabular-nums ${
                    entry
                      ? "border-[#8B0D0E] bg-rose-50 font-black text-slate-950 shadow-2xs"
                      : isScored
                        ? "border-slate-300 bg-slate-100 text-slate-600"
                        : "border-slate-200 bg-white text-slate-300"
                  }`}
                >
                  <span className="text-[0.68rem] font-black leading-none">
                    {num}
                  </span>
                  {entry ? (
                    <span className="mt-0.5 rounded bg-[#0B2F5C] px-1 text-[0.55rem] font-black text-white">
                      #{entry.jerseyNumber} • Q{entry.period}
                    </span>
                  ) : (
                    <span className="mt-0.5 text-[0.52rem] text-transparent">
                      -
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
            Official Box Score &amp; Live Play-by-Play Feed
          </h2>
          <p className="text-xs text-slate-500">
            Side-by-side Official Box Score tables and real-time Event-Sourced
            Play-by-Play ticker with 1-click Undo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScorebookViewMode("BOX_SCORE")}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider cursor-pointer ${
              scorebookViewMode === "BOX_SCORE"
                ? "bg-[#0B2F5C] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Player Box Score &amp; Foul Sheet
          </button>
          <button
            type="button"
            onClick={() => setScorebookViewMode("RUNNING_SCORE")}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider cursor-pointer ${
              scorebookViewMode === "RUNNING_SCORE"
                ? "bg-[#8B0D0E] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            FIBA Progressive Running Score (1–160)
          </button>
        </div>
      </div>

      {/* SIDE-BY-SIDE LAYOUT: BOX SCORE ON LEFT (8 COLS or 12 COLS if showPlayByPlayFeed is false) + LIVE PLAY-BY-PLAY ON RIGHT (4 COLS) */}
      <div className={`grid grid-cols-1 gap-6 items-start ${showPlayByPlayFeed ? "xl:grid-cols-12" : "xl:grid-cols-1"}`}>
        {/* Left: Box Score or Running Score */}
        <div className={`space-y-6 ${showPlayByPlayFeed ? "xl:col-span-8" : "w-full"}`}>
          {scorebookViewMode === "BOX_SCORE" ? (
            <>
              {(showHomeTeam || !showAwayTeam) &&
                renderTeamBoxScoreTable(
                  homeTeam,
                  homeTeamName,
                  homeColor,
                  homePlayersList,
                  "HOME"
                )}
              {(showAwayTeam || !showHomeTeam) &&
                renderTeamBoxScoreTable(
                  awayTeam,
                  awayTeamName,
                  awayColor,
                  awayPlayersList,
                  "AWAY"
                )}
            </>
          ) : (
            <>
              {(showHomeTeam || !showAwayTeam) &&
                renderRunningScoreSheet(
                  homeTeamName,
                  homeColor,
                  session.homeScore,
                  session.homeRunningScore
                )}
              {(showAwayTeam || !showHomeTeam) &&
                renderRunningScoreSheet(
                  awayTeamName,
                  awayColor,
                  session.awayScore,
                  session.awayRunningScore
                )}
            </>
          )}
        </div>

        {/* Right: Live Play-by-Play Event Log alongside Box Score (4 cols) */}
        {showPlayByPlayFeed && (
        <div className="xl:col-span-4 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden xl:sticky xl:top-20">
          <div
            className="flex items-center justify-between gap-2 px-5 py-3.5 text-white"
            style={{ backgroundColor: "#0B2F5C" }}
          >
            <div>
              <span className="block text-[0.6rem] font-black uppercase tracking-widest text-amber-300">
                EVENT-SOURCED TELEMETRY
              </span>
              <h3 className="text-sm font-black uppercase tracking-wider">
                Live Play-by-Play Log ({session.playEvents.length})
              </h3>
            </div>

            <button
              type="button"
              disabled={session.playEvents.length === 0}
              onClick={onUndoLastPlay}
              className="inline-flex items-center gap-1 rounded-xl bg-[#8B0D0E] px-3 py-1.5 text-[0.68rem] font-black uppercase text-white shadow-2xs hover:opacity-95 disabled:opacity-40 cursor-pointer"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo Last Play
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Period / Quarter Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-100">
              {(["ALL", 1, 2, 3, 4, 5] as const).map((period) => {
                const label =
                  period === "ALL"
                    ? "All"
                    : period <= 4
                    ? `Q${period}`
                    : `OT${period - 4 > 1 ? period - 4 : ""}`;
                const isActive = selectedPeriodFilter === period;
                const countForPeriod =
                  period === "ALL"
                    ? session.playEvents.length
                    : session.playEvents.filter((e) => e.period === period).length;

                return (
                  <button
                    key={String(period)}
                    type="button"
                    onClick={() => setSelectedPeriodFilter(period)}
                    className={`rounded-lg px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#0B2F5C] text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label} {countForPeriod > 0 && <span className="opacity-70">({countForPeriod})</span>}
                  </button>
                );
              })}
            </div>

            {session.playEvents.length > 0 && (
              <div className="flex items-center justify-between px-4 text-[0.68rem] font-black uppercase text-slate-400 tracking-wider">
                <span>Play Event</span>
                <div className="flex items-center gap-4 pr-2">
                  <span className="w-5 text-center truncate">{homeTeamName.slice(0, 3)}</span>
                  <span className="w-5 text-center truncate">{awayTeamName.slice(0, 3)}</span>
                </div>
              </div>
            )}
            {session.playEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <p className="text-xs font-semibold text-slate-500">
                  No plays recorded yet. Tap any stat or scoring button on the
                  on-court player cards above to log live play-by-play events.
                </p>
              </div>
            ) : (
              <div
                className="max-h-[680px] overflow-y-auto divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-2xs"
                role="region"
                aria-label="Live Play-by-Play Event Feed"
                tabIndex={0}
              >
                {session.playEvents
                  .filter((ev) =>
                    selectedPeriodFilter === "ALL"
                      ? true
                      : ev.period === selectedPeriodFilter
                  )
                  .map((ev) => {
                  const isHome = ev.teamSide === "HOME";
                  const teamLogo = ev.teamLogo || (isHome ? homeTeam?.imageUrl : awayTeam?.imageUrl);
                  const isShot = ev.actionType === "MADE_2PT" || ev.actionType === "MISS_2PT" || ev.actionType === "MADE_3PT" || ev.actionType === "MISS_3PT" || ev.actionType === "MADE_FT" || ev.actionType === "MISS_FT";
                  const shotBadge = ev.actionType.includes("3PT") ? "3 PT" : ev.actionType.includes("2PT") ? "2 PT" : ev.actionType.includes("FT") ? "FT" : null;

                  return (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between gap-3.5 px-4 py-3 hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Left: Team Logo / Icon */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {teamLogo ? (
                          <img
                            src={teamLogo}
                            alt={ev.teamName}
                            className="h-7 w-7 rounded-full object-contain shrink-0 border border-slate-200 bg-white p-0.5 shadow-2xs"
                          />
                        ) : (
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-black text-white shadow-2xs uppercase"
                            style={{ backgroundColor: isHome ? homeColor : awayColor }}
                          >
                            {ev.teamName.slice(0, 2)}
                          </div>
                        )}

                        {/* Clock & Action Description */}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900 tabular-nums">
                              {ev.gameClockDisplay}
                            </span>
                            {shotBadge && (
                              <span className="text-[0.68rem] font-black uppercase text-slate-500 tracking-wider">
                                {shotBadge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-slate-800 leading-snug">
                            {ev.description}
                          </p>
                        </div>
                      </div>

                      {/* Right: Scores Column (Home | Away) */}
                      <div className="flex items-center gap-4 shrink-0 font-sans text-xs font-black tabular-nums text-slate-900 pr-2">
                        <span className="w-5 text-center">{ev.homeScoreAfter}</span>
                        <span className="w-5 text-center text-slate-600">{ev.awayScoreAfter}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Official Scorebook Verification & Referee Signatures Strip */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[0.65rem] font-black uppercase tracking-wider text-[#8B0D0E]">
              Official Scorebook Verification
            </span>
            <h3 className="text-sm font-black uppercase text-slate-900">
              Game #{gameNumber} Officiating Crew &amp; Table Sign-Off
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {assignedReferees.map((ref) => (
              <div
                key={ref.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
              >
                <Award className="h-4 w-4 text-[#0B2F5C]" />
                <div>
                  <span className="block text-[0.6rem] font-black uppercase text-slate-400">
                    {ref.role}
                  </span>
                  <strong className="font-black uppercase text-slate-900">
                    #{ref.jerseyNumber} {ref.name}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
