"use client";

import React from "react";
import {
  LeagueReferee,
  PlayerGameStats,
  ScorebookActionType,
} from "@/types/boxscore";

interface CourtPlayerActionCardProps {
  player: PlayerGameStats;
  side: "HOME" | "AWAY";
  teamColor: string;
  personalFoulLimit: number;
  shotClockSeconds: number;
  orebResetSeconds: number;
  referees: LeagueReferee[];
  selectedCallingRefereeId: string;
  onChangeCallingReferee: (refereeId: string) => void;
  onTriggerAction: (
    side: "HOME" | "AWAY",
    player: PlayerGameStats,
    actionType: ScorebookActionType,
    refereeId?: string
  ) => void;
  disabled?: boolean;
}

export function CourtPlayerActionCard({
  player,
  side,
  teamColor,
  personalFoulLimit,
  shotClockSeconds,
  orebResetSeconds,
  selectedCallingRefereeId,
  onTriggerAction,
  disabled = false,
}: CourtPlayerActionCardProps) {
  const fouledOut = player.pf >= personalFoulLimit;
  const isActionDisabled = disabled || fouledOut;
  const totalReb = player.oreb + player.dreb;

  return (
    <div
      className={`rounded-2xl border p-3.5 shadow-2xs transition-all space-y-2.5 ${
        fouledOut
          ? "border-rose-400 bg-rose-50/40"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      {/* Top Row: Player Info, Avatar & Stat Summary Pill */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {player.imageUrl ? (
            <div className="relative shrink-0">
              <img
                src={player.imageUrl}
                alt={`${player.firstName} ${player.lastName}`}
                className="h-11 w-11 rounded-xl object-cover border border-slate-200 shadow-2xs"
              />
              <span
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-md text-[0.62rem] font-black text-white tabular-nums shadow-xs"
                style={{ backgroundColor: teamColor }}
              >
                #{player.jerseyNumber}
              </span>
            </div>
          ) : (
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white tabular-nums shadow-2xs"
              style={{ backgroundColor: teamColor }}
            >
              #{player.jerseyNumber}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="truncate text-sm sm:text-base font-black uppercase tracking-tight text-slate-900">
                {player.firstName} {player.lastName}
              </h4>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.62rem] font-black uppercase text-slate-700">
                {player.position}
              </span>
              {fouledOut && (
                <span className="rounded bg-[#8B0D0E] px-1.5 py-0.5 text-[0.58rem] font-black uppercase text-white">
                  FOULED OUT
                </span>
              )}
            </div>
            <div className="text-[0.68rem] font-bold text-slate-500 tabular-nums">
              FG: {player.fgm}-{player.fga} • 3PT: {player.tpm}-{player.tpa} •
              FT: {player.ftm}-{player.fta} • STL: {player.stl} • BLK:{" "}
              {player.blk} • TO: {player.tov}
            </div>
          </div>
        </div>

        {/* Live Stat Pill Summary (Light Mode) */}
        <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.7rem] font-black text-slate-800 tabular-nums">
          <span className="text-[#8B0D0E]">{player.points} PTS</span>
          <span className="text-slate-300">•</span>
          <span>{totalReb} REB</span>
          <span className="text-slate-300">•</span>
          <span>{player.ast} AST</span>
          <span className="text-slate-300">•</span>
          <span
            className={
              fouledOut
                ? "text-[#8B0D0E]"
                : player.pf >= personalFoulLimit - 1
                  ? "text-amber-700"
                  : "text-slate-700"
            }
          >
            {player.pf}/{personalFoulLimit} PF
          </span>
        </div>
      </div>

      {/* Bottom Row: 1-Line Streamlined Action Strip with paired Made/Miss */}
      <div className={`flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin ${disabled ? "opacity-45 pointer-events-none select-none" : ""}`}>
        {/* 2PT PAIR: +2 MADE & 2PT MISS */}
        <div className="flex items-center rounded-xl bg-emerald-50/60 p-0.5 border border-emerald-200 shrink-0">
          <button
            type="button"
            disabled={isActionDisabled}
            title="+2 Points Made"
            onClick={() => onTriggerAction(side, player, "MADE_2PT")}
            className="flex h-10 w-11 flex-col items-center justify-center rounded-lg bg-emerald-600 px-1 text-white shadow-2xs hover:bg-emerald-700 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-[0.72rem] font-black leading-none">+2</span>
            <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase opacity-95">
              MADE
            </span>
          </button>
          <button
            type="button"
            disabled={isActionDisabled}
            title="2-Point Field Goal Miss"
            onClick={() => onTriggerAction(side, player, "MISS_2PT")}
            className="flex h-10 w-11 flex-col items-center justify-center rounded-lg bg-transparent px-1 text-slate-700 hover:bg-emerald-100/70 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-[0.68rem] font-black leading-none text-slate-700">2PT</span>
            <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase text-slate-500">
              MISS
            </span>
          </button>
        </div>

        {/* 3PT PAIR: +3 MADE & 3PT MISS */}
        <div className="flex items-center rounded-xl bg-blue-50/60 p-0.5 border border-blue-200 shrink-0">
          <button
            type="button"
            disabled={isActionDisabled}
            title="+3 Points Made"
            onClick={() => onTriggerAction(side, player, "MADE_3PT")}
            className="flex h-10 w-11 flex-col items-center justify-center rounded-lg bg-[#0B2F5C] px-1 text-white shadow-2xs hover:opacity-95 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-[0.72rem] font-black leading-none">+3</span>
            <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase opacity-95">
              MADE
            </span>
          </button>
          <button
            type="button"
            disabled={isActionDisabled}
            title="3-Point Field Goal Miss"
            onClick={() => onTriggerAction(side, player, "MISS_3PT")}
            className="flex h-10 w-11 flex-col items-center justify-center rounded-lg bg-transparent px-1 text-slate-700 hover:bg-blue-100/70 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-[0.68rem] font-black leading-none text-slate-700">3PT</span>
            <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase text-slate-500">
              MISS
            </span>
          </button>
        </div>

        {/* FT PAIR: +1 FT MADE & FT MISS */}
        <div className="flex items-center rounded-xl bg-teal-50/60 p-0.5 border border-teal-200 shrink-0">
          <button
            type="button"
            disabled={isActionDisabled}
            title="+1 Free Throw Made"
            onClick={() => onTriggerAction(side, player, "MADE_FT")}
            className="flex h-10 w-11 flex-col items-center justify-center rounded-lg bg-teal-600 px-1 text-white shadow-2xs hover:bg-teal-700 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-[0.68rem] font-black leading-none">+1 FT</span>
            <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase opacity-95">
              MADE
            </span>
          </button>
          <button
            type="button"
            disabled={isActionDisabled}
            title="Free Throw Miss"
            onClick={() => onTriggerAction(side, player, "MISS_FT")}
            className="flex h-10 w-11 flex-col items-center justify-center rounded-lg bg-transparent px-1 text-slate-700 hover:bg-teal-100/70 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-[0.68rem] font-black leading-none text-slate-700">FT</span>
            <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase text-slate-500">
              MISS
            </span>
          </button>
        </div>

        {/* DIVIDER */}
        <div className="h-7 w-[1px] bg-slate-200 mx-0.5 shrink-0" />

        {/* OREB (14S) */}
        <button
          type="button"
          disabled={isActionDisabled}
          title={`Offensive Rebound (${orebResetSeconds}s Reset)`}
          onClick={() => onTriggerAction(side, player, "OFF_REB")}
          className="flex h-10 min-w-[2.75rem] flex-1 flex-col items-center justify-center rounded-xl border border-[#0B2F5C] bg-blue-50/80 px-1 text-[#0B2F5C] hover:bg-blue-100 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
        >
          <span className="text-[0.62rem] font-black leading-none">OREB</span>
          <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase">
            {orebResetSeconds}S
          </span>
        </button>

        {/* DREB (24S) */}
        <button
          type="button"
          disabled={isActionDisabled}
          title={`Defensive Rebound (${shotClockSeconds}s Reset)`}
          onClick={() => onTriggerAction(side, player, "DEF_REB")}
          className="flex h-10 min-w-[2.75rem] flex-1 flex-col items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-1 text-slate-800 hover:bg-slate-100 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
        >
          <span className="text-[0.62rem] font-black leading-none">DREB</span>
          <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase text-slate-500">
            {shotClockSeconds}S
          </span>
        </button>

        {/* ASSIST */}
        <button
          type="button"
          disabled={isActionDisabled}
          title="Assist (AST)"
          onClick={() => onTriggerAction(side, player, "ASSIST")}
          className="flex h-10 min-w-[2.5rem] flex-1 flex-col items-center justify-center rounded-xl border border-amber-400 bg-amber-50/90 px-1 text-slate-900 hover:bg-amber-100 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
        >
          <span className="text-[0.65rem] font-black leading-none">AST</span>
          <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase text-amber-800">
            PASS
          </span>
        </button>

        {/* STEAL */}
        <button
          type="button"
          disabled={isActionDisabled}
          title="Steal (STL)"
          onClick={() => onTriggerAction(side, player, "STEAL")}
          className="flex h-10 min-w-[2.5rem] flex-1 flex-col items-center justify-center rounded-xl border border-slate-300 bg-white px-1 text-slate-800 hover:bg-slate-100 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
        >
          <span className="text-[0.65rem] font-black leading-none">STL</span>
          <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase text-slate-500">
            DEF
          </span>
        </button>

        {/* BLOCK */}
        <button
          type="button"
          disabled={isActionDisabled}
          title="Block (BLK)"
          onClick={() => onTriggerAction(side, player, "BLOCK")}
          className="flex h-10 min-w-[2.5rem] flex-1 flex-col items-center justify-center rounded-xl border border-slate-300 bg-white px-1 text-slate-800 hover:bg-slate-100 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
        >
          <span className="text-[0.65rem] font-black leading-none">BLK</span>
          <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase text-slate-500">
            DEF
          </span>
        </button>

        {/* TURNOVER */}
        <button
          type="button"
          disabled={isActionDisabled}
          title="Turnover (TO)"
          onClick={() => onTriggerAction(side, player, "TURNOVER")}
          className="flex h-10 min-w-[2.5rem] flex-1 flex-col items-center justify-center rounded-xl border border-rose-300 bg-rose-50 px-1 text-[#8B0D0E] hover:bg-rose-100 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
        >
          <span className="text-[0.65rem] font-black leading-none">TO</span>
          <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase">
            LOSS
          </span>
        </button>

        {/* DIVIDER */}
        <div className="h-7 w-[1px] bg-slate-200 mx-0.5 shrink-0" />

        {/* PERSONAL FOUL (PF) */}
        <button
          type="button"
          disabled={isActionDisabled}
          title="Personal Foul (PF)"
          onClick={() =>
            onTriggerAction(
              side,
              player,
              "PERSONAL_FOUL",
              selectedCallingRefereeId
            )
          }
          className="flex h-10 min-w-[2.5rem] flex-1 flex-col items-center justify-center rounded-xl bg-[#8B0D0E] px-1 text-white shadow-2xs hover:opacity-95 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
        >
          <span className="text-[0.65rem] font-black leading-none">PF</span>
          <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase opacity-90">
            FOUL
          </span>
        </button>

        {/* TECHNICAL FOUL (TF) */}
        <button
          type="button"
          disabled={isActionDisabled}
          title="Technical Foul (TF)"
          onClick={() =>
            onTriggerAction(
              side,
              player,
              "TECHNICAL_FOUL",
              selectedCallingRefereeId
            )
          }
          className="flex h-10 min-w-[2.5rem] flex-1 flex-col items-center justify-center rounded-xl bg-slate-900 px-1 text-amber-400 hover:bg-slate-800 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
        >
          <span className="text-[0.65rem] font-black leading-none">TF</span>
          <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase text-amber-300">
            TECH
          </span>
        </button>

        {/* UNSPORTSMANLIKE FOUL (UF) */}
        <button
          type="button"
          disabled={isActionDisabled}
          title="Unsportsmanlike Foul (UF)"
          onClick={() =>
            onTriggerAction(
              side,
              player,
              "UNSPORTSMANLIKE_FOUL",
              selectedCallingRefereeId
            )
          }
          className="flex h-10 min-w-[2.5rem] flex-1 flex-col items-center justify-center rounded-xl border border-[#8B0D0E] bg-white px-1 text-[#8B0D0E] hover:bg-rose-100 active:scale-95 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
        >
          <span className="text-[0.65rem] font-black leading-none">UF</span>
          <span className="mt-0.5 text-[0.48rem] font-extrabold uppercase">
            FLAG
          </span>
        </button>
      </div>
    </div>
  );
}
