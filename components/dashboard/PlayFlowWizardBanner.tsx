"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import {
  LeagueReferee,
  PlayerGameStats,
} from "@/types/boxscore";

export type PlayFlowState =
  | {
      kind: "MADE_SHOT_ASSIST";
      offenseSide: "HOME" | "AWAY";
      scorer: PlayerGameStats;
      shotPoints: 2 | 3;
    }
  | {
      kind: "MADE_SHOT_AND1_CHECK";
      offenseSide: "HOME" | "AWAY";
      scorer: PlayerGameStats;
      shotPoints: 2 | 3;
      assistedBy?: PlayerGameStats | null;
    }
  | {
      kind: "AND1_DEFENDER_SELECT";
      offenseSide: "HOME" | "AWAY";
      scorer: PlayerGameStats;
      foulType: "PERSONAL_FOUL" | "UNSPORTSMANLIKE_FOUL";
      refereeId: string;
    }
  | {
      kind: "AND1_FREE_THROW";
      offenseSide: "HOME" | "AWAY";
      scorer: PlayerGameStats;
      foulType: "PERSONAL_FOUL" | "UNSPORTSMANLIKE_FOUL";
    }
  | {
      kind: "MISSED_SHOT_BLOCK_CHECK";
      offenseSide: "HOME" | "AWAY";
      shooter: PlayerGameStats;
      shotPoints: 2 | 3;
    }
  | {
      kind: "REBOUND_RESOLUTION";
      offenseSide: "HOME" | "AWAY";
      reasonLabel: string;
    }
  | {
      kind: "STEAL_TURNOVER_BY";
      stealerSide: "HOME" | "AWAY";
      stealer: PlayerGameStats;
    }
  | {
      kind: "TURNOVER_TAG";
      offenseSide: "HOME" | "AWAY";
      player: PlayerGameStats;
      eventId: string;
    }
  | {
      kind: "FOUL_UNDER_BONUS";
      foulSide: "HOME" | "AWAY";
      fouler: PlayerGameStats;
      foulType: "PERSONAL_FOUL" | "UNSPORTSMANLIKE_FOUL";
      eventId?: string;
    }
  | {
      kind: "BONUS_SELECT_SHOOTER";
      foulSide: "HOME" | "AWAY";
      offenseSide: "HOME" | "AWAY";
      fouler: PlayerGameStats;
      foulType: "PERSONAL_FOUL" | "UNSPORTSMANLIKE_FOUL";
      totalFreeThrows: 2 | 3;
      eventId?: string;
    }
  | {
      kind: "BONUS_FREE_THROW_SHOT";
      offenseSide: "HOME" | "AWAY";
      shooter: PlayerGameStats;
      currentFtNumber: 1 | 2 | 3;
      totalFreeThrows: 2 | 3;
      foulType: "PERSONAL_FOUL" | "UNSPORTSMANLIKE_FOUL";
    }
  | {
      kind: "TECHNICAL_SELECT_SHOOTER";
      penalizedSide: "HOME" | "AWAY";
      shootingSide: "HOME" | "AWAY";
      penalizedLabel: string;
      eventId?: string;
    }
  | {
      kind: "TECHNICAL_FREE_THROW_SHOT";
      shootingSide: "HOME" | "AWAY";
      shooter: PlayerGameStats;
    };

interface PlayFlowWizardBannerProps {
  flowState: PlayFlowState;
  homeTeamName: string;
  awayTeamName: string;
  homeColor: string;
  awayColor: string;
  homeOnCourt: PlayerGameStats[];
  awayOnCourt: PlayerGameStats[];
  shotClockDefault: number;
  orebResetSeconds: number;
  referees: LeagueReferee[];
  defaultRefereeId: string;
  onChangeDefaultReferee?: (refereeId: string, eventId?: string) => void;
  onSelectAssistTeammate: (teammate: PlayerGameStats | null) => void;
  onResolveAnd1Prompt: (hasFoulOnPlay: boolean) => void;
  onSelectAnd1Defender: (
    defender: PlayerGameStats,
    foulType: "PERSONAL_FOUL" | "UNSPORTSMANLIKE_FOUL",
    refereeId: string
  ) => void;
  onResolveAnd1FreeThrow: (made: boolean) => void;
  onSelectShotBlocker: (blocker: PlayerGameStats | null) => void;
  onResolveRebound: (
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
  ) => void;
  onSelectTurnoverVictimFromSteal: (
    offensivePlayer: PlayerGameStats | null
  ) => void;
  onSelectTurnoverReasonTag: (tag: string | null) => void;
  onResolveUnderBonusFoul: (
    resolution:
      | { type: "INBOUND_HOLD_CLOCK" }
      | { type: "INBOUND_RESET_14S" }
      | { type: "SHOOTING_FOUL_2FT" }
      | { type: "SHOOTING_FOUL_3FT" }
  ) => void;
  onSelectBonusFtShooter: (shooter: PlayerGameStats) => void;
  onResolveBonusFtAttempt: (made: boolean) => void;
  onSelectTechnicalFtShooter: (shooter: PlayerGameStats) => void;
  onResolveTechnicalFtAttempt: (made: boolean) => void;
  onDismissFlow: () => void;
}

export function PlayFlowWizardBanner({
  flowState,
  homeTeamName,
  awayTeamName,
  homeColor,
  awayColor,
  homeOnCourt,
  awayOnCourt,
  shotClockDefault,
  orebResetSeconds,
  referees,
  defaultRefereeId,
  onChangeDefaultReferee,
  onSelectAssistTeammate,
  onResolveAnd1Prompt,
  onSelectAnd1Defender,
  onResolveAnd1FreeThrow,
  onSelectShotBlocker,
  onResolveRebound,
  onSelectTurnoverVictimFromSteal,
  onSelectTurnoverReasonTag,
  onResolveUnderBonusFoul,
  onSelectBonusFtShooter,
  onResolveBonusFtAttempt,
  onSelectTechnicalFtShooter,
  onResolveTechnicalFtAttempt,
  onDismissFlow,
}: PlayFlowWizardBannerProps) {
  const [and1FoulType, setAnd1FoulType] = useState<
    "PERSONAL_FOUL" | "UNSPORTSMANLIKE_FOUL"
  >("PERSONAL_FOUL");
  const [and1RefereeId, setAnd1RefereeId] = useState<string>(defaultRefereeId);

  const getTeamName = (side: "HOME" | "AWAY") =>
    side === "HOME" ? homeTeamName : awayTeamName;
  const getTeamColor = (side: "HOME" | "AWAY") =>
    side === "HOME" ? homeColor : awayColor;
  const getOnCourt = (side: "HOME" | "AWAY") =>
    side === "HOME" ? homeOnCourt : awayOnCourt;
  const getOppositeSide = (side: "HOME" | "AWAY"): "HOME" | "AWAY" =>
    side === "HOME" ? "AWAY" : "HOME";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live Play State-Machine Prompt Dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onDismissFlow();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-6 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border-2 border-slate-200 bg-white p-4 sm:p-6 text-slate-900 shadow-2xl space-y-4">
        {/* Modal Dialog Header (Light Mode) */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3.5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B2F5C] text-amber-300 shadow-xs">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <span className="block text-[0.62rem] font-black uppercase tracking-widest text-[#8B0D0E]">
                LIVE PLAY STATE-MACHINE • GUIDED COURTSIDE RESOLUTION
              </span>
              <h3 className="mt-0.5 text-base sm:text-lg font-black uppercase tracking-tight text-slate-900 leading-snug">
                {flowState.kind === "MADE_SHOT_ASSIST" &&
                  `Made +${flowState.shotPoints} PT Basket by #${flowState.scorer.jerseyNumber} ${flowState.scorer.lastName} — Step 3: Assisted By?`}
                {flowState.kind === "MADE_SHOT_AND1_CHECK" &&
                  `Step 4: Whistle / And-1 Prompt — Foul on the Play?`}
                {flowState.kind === "AND1_DEFENDER_SELECT" &&
                  `And-1 Sequence — Select Defending Player & Foul Type`}
                {flowState.kind === "AND1_FREE_THROW" &&
                  `And-1 Free Throw Resolution — #${flowState.scorer.jerseyNumber} ${flowState.scorer.firstName} ${flowState.scorer.lastName}`}
                {flowState.kind === "MISSED_SHOT_BLOCK_CHECK" &&
                  `Missed ${flowState.shotPoints}PT Shot by #${flowState.shooter.jerseyNumber} ${flowState.shooter.lastName} — Step 3: Contest Check ("Blocked?")`}
                {flowState.kind === "REBOUND_RESOLUTION" &&
                  `Step 4: Rebound Resolution (${flowState.reasonLabel})`}
                {flowState.kind === "STEAL_TURNOVER_BY" &&
                  `Live-Ball Steal by #${flowState.stealer.jerseyNumber} ${flowState.stealer.lastName} — Quick Prompt: "Turnover By?"`}
                {flowState.kind === "TURNOVER_TAG" &&
                  `Turnover by #${flowState.player.jerseyNumber} ${flowState.player.lastName} — Quick Tag (Optional)`}
                {flowState.kind === "FOUL_UNDER_BONUS" &&
                  `Non-Shooting Foul on #${flowState.fouler.jerseyNumber} ${flowState.fouler.lastName} (Under Bonus Limit)`}
                {flowState.kind === "BONUS_SELECT_SHOOTER" &&
                  `Penalty / Bonus Active — Prompt: "Shooter? Tap Fouled Offensive Player"`}
                {flowState.kind === "BONUS_FREE_THROW_SHOT" &&
                  `Free Throw ${flowState.currentFtNumber} of ${flowState.totalFreeThrows} — Shooter: #${flowState.shooter.jerseyNumber} ${flowState.shooter.firstName} ${flowState.shooter.lastName}`}
                {flowState.kind === "TECHNICAL_SELECT_SHOOTER" &&
                  `Technical Foul on ${flowState.penalizedLabel} — Prompt: "Select Opposing FT Shooter"`}
                {flowState.kind === "TECHNICAL_FREE_THROW_SHOT" &&
                  `Technical Free Throw (1 Shot) — Shooter: #${flowState.shooter.jerseyNumber} ${flowState.shooter.firstName} ${flowState.shooter.lastName}`}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismissFlow}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-black uppercase text-slate-700 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            Close
          </button>
        </div>

        {/* =====================================================================
            FLOW 1 — STEP 3: ASSISTED BY?
           ===================================================================== */}
        {flowState.kind === "MADE_SHOT_ASSIST" && (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Tap a teammate on court to record an{" "}
              <strong className="text-[#8B0D0E]">ASSIST (AST)</strong>, or tap{" "}
              <strong className="text-slate-900">None / Solo (Unassisted)</strong>:
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {getOnCourt(flowState.offenseSide)
                .filter((p) => p.playerId !== flowState.scorer.playerId)
                .map((teammate) => (
                  <button
                    key={teammate.playerId}
                    type="button"
                    onClick={() => onSelectAssistTeammate(teammate)}
                    className="flex items-center gap-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-black uppercase text-slate-900 hover:border-[#0B2F5C] hover:bg-blue-50/70 transition-colors cursor-pointer"
                  >
                    <span
                      className="rounded-lg px-2 py-1 text-xs text-white shrink-0"
                      style={{
                        backgroundColor: getTeamColor(flowState.offenseSide),
                      }}
                    >
                      #{teammate.jerseyNumber}
                    </span>
                    <span className="truncate">
                      {teammate.firstName} {teammate.lastName} (
                      {teammate.position})
                    </span>
                  </button>
                ))}

              <button
                type="button"
                onClick={() => onSelectAssistTeammate(null)}
                className="sm:col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-xs font-black uppercase text-slate-800 hover:bg-slate-200 cursor-pointer"
              >
                None / Solo (Unassisted) →
              </button>
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 1 — STEP 4: WHISTLE / AND-1 PROMPT ("FOUL ON THE PLAY?")
           ===================================================================== */}
        {flowState.kind === "MADE_SHOT_AND1_CHECK" && (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Was there a defensive foul on{" "}
              <strong className="text-slate-900">
                #{flowState.scorer.jerseyNumber} {flowState.scorer.lastName}
              </strong>
              &apos;s made basket?
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onResolveAnd1Prompt(false)}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  No Foul — End Play (
                  {getTeamName(getOppositeSide(flowState.offenseSide))} Ball)
                </span>
              </button>

              <button
                type="button"
                onClick={() => onResolveAnd1Prompt(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#8B0D0E] px-4 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-xs hover:opacity-95 cursor-pointer"
              >
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Yes — And-1 Foul on Play!</span>
              </button>
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 1 — AND-1 SEQUENCE: SELECT FOUL TYPE, CALLING REFEREE & DEFENDER
           ===================================================================== */}
        {flowState.kind === "AND1_DEFENDER_SELECT" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
              <div className="space-y-1.5">
                <span className="block text-[0.65rem] font-black uppercase text-slate-600">
                  1. Select Foul Type:
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAnd1FoulType("PERSONAL_FOUL")}
                    className={`flex-1 rounded-lg px-2.5 py-2 text-[0.68rem] font-black uppercase cursor-pointer ${
                      and1FoulType === "PERSONAL_FOUL"
                        ? "bg-[#8B0D0E] text-white"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    PERSONAL (PF)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnd1FoulType("UNSPORTSMANLIKE_FOUL")}
                    className={`flex-1 rounded-lg px-2.5 py-2 text-[0.68rem] font-black uppercase cursor-pointer ${
                      and1FoulType === "UNSPORTSMANLIKE_FOUL"
                        ? "bg-amber-400 text-slate-950"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    UNSPORTSMANLIKE
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-[0.65rem] font-black uppercase text-slate-600">
                  2. Calling Referee:
                </span>
                <select
                  aria-label="And-1 Calling Referee"
                  value={and1RefereeId}
                  onChange={(e) => setAnd1RefereeId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-900"
                >
                  <option value="">Unassigned / Table</option>
                  {referees.map((r) => (
                    <option key={r.id} value={r.id}>
                      #{r.jerseyNumber} {r.name} ({r.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-black uppercase text-[#8B0D0E]">
                3. Tap the Defending Player (
                {getTeamName(getOppositeSide(flowState.offenseSide))}) Who
                Committed the Foul:
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {getOnCourt(getOppositeSide(flowState.offenseSide)).map(
                  (defender) => (
                    <button
                      key={defender.playerId}
                      type="button"
                      onClick={() =>
                        onSelectAnd1Defender(
                          defender,
                          and1FoulType,
                          and1RefereeId
                        )
                      }
                      className="flex items-center gap-2 rounded-xl border-2 border-rose-200 bg-rose-50/50 px-3.5 py-3 text-left text-xs font-black uppercase text-slate-900 hover:bg-[#8B0D0E] hover:text-white hover:border-[#8B0D0E] transition-colors cursor-pointer"
                    >
                      <span className="rounded bg-[#8B0D0E] px-2 py-0.5 text-xs text-white shrink-0">
                        #{defender.jerseyNumber}
                      </span>
                      <span className="truncate">
                        {defender.firstName} {defender.lastName} ({defender.pf}{" "}
                        PF)
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 1 — AND-1 FREE THROW RESOLUTION
           ===================================================================== */}
        {flowState.kind === "AND1_FREE_THROW" && (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Auto-focused on original scorer{" "}
              <strong className="text-[#0B2F5C]">
                #{flowState.scorer.jerseyNumber} {flowState.scorer.firstName}{" "}
                {flowState.scorer.lastName}
              </strong>{" "}
              for the And-1 bonus free throw:
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onResolveAnd1FreeThrow(true)}
                className="rounded-xl bg-teal-600 px-5 py-3.5 text-xs sm:text-sm font-black uppercase text-white shadow-xs hover:bg-teal-700 cursor-pointer"
              >
                +1 FT MADE (Play Ends — Defense Inbounds)
              </button>
              <button
                type="button"
                onClick={() => onResolveAnd1FreeThrow(false)}
                className="rounded-xl border border-slate-300 bg-slate-100 px-5 py-3.5 text-xs sm:text-sm font-black uppercase text-slate-800 hover:bg-slate-200 cursor-pointer"
              >
                FT MISS (Proceed to Rebound Flow →)
              </button>
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 2 — STEP 3: CONTEST CHECK ("BLOCKED?")
           ===================================================================== */}
        {flowState.kind === "MISSED_SHOT_BLOCK_CHECK" && (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Was #{flowState.shooter.jerseyNumber} {flowState.shooter.lastName}
              &apos;s missed shot{" "}
              <strong className="text-[#0B2F5C]">BLOCKED (BLK)</strong> by a
              defender?
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {getOnCourt(getOppositeSide(flowState.offenseSide)).map(
                (defender) => (
                  <button
                    key={defender.playerId}
                    type="button"
                    onClick={() => onSelectShotBlocker(defender)}
                    className="flex items-center gap-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-black uppercase text-slate-900 hover:border-[#0B2F5C] hover:bg-blue-50/70 cursor-pointer"
                  >
                    <span
                      className="rounded px-2 py-0.5 text-xs text-white shrink-0"
                      style={{
                        backgroundColor: getTeamColor(
                          getOppositeSide(flowState.offenseSide)
                        ),
                      }}
                    >
                      #{defender.jerseyNumber}
                    </span>
                    <span className="truncate">
                      BLK by {defender.firstName} {defender.lastName}
                    </span>
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => onSelectShotBlocker(null)}
                className="sm:col-span-2 rounded-xl bg-[#0B2F5C] px-4 py-3 text-xs font-black uppercase text-white hover:opacity-95 cursor-pointer"
              >
                No / Unblocked (Proceed to Rebound Resolution →)
              </button>
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 2 & 3 — STEP 4: REBOUND RESOLUTION
           ===================================================================== */}
        {flowState.kind === "REBOUND_RESOLUTION" && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Defensive Rebounders (24s) */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
                <span className="block text-xs font-black uppercase text-[#0B2F5C]">
                  Defensive Rebound —{" "}
                  {getTeamName(getOppositeSide(flowState.offenseSide))} (
                  {shotClockDefault}S)
                </span>
                <div className="flex flex-col gap-1.5">
                  {getOnCourt(getOppositeSide(flowState.offenseSide)).map(
                    (def) => (
                      <button
                        key={def.playerId}
                        type="button"
                        onClick={() =>
                          onResolveRebound({
                            type: "PLAYER_REB",
                            side: getOppositeSide(flowState.offenseSide),
                            player: def,
                            rebType: "DEF_REB",
                          })
                        }
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-900 hover:bg-[#0B2F5C] hover:text-white cursor-pointer"
                      >
                        <span>
                          <strong className="mr-1.5">
                            #{def.jerseyNumber}
                          </strong>
                          {def.lastName}
                        </span>
                        <span className="text-[0.65rem] text-emerald-700 font-black">
                          DEF REB ({shotClockDefault}S)
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Offensive Rebounders (14s) */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
                <span className="block text-xs font-black uppercase text-[#8B0D0E]">
                  Offensive Rebound — {getTeamName(flowState.offenseSide)} (
                  {orebResetSeconds}S)
                </span>
                <div className="flex flex-col gap-1.5">
                  {getOnCourt(flowState.offenseSide).map((off) => (
                    <button
                      key={off.playerId}
                      type="button"
                      onClick={() =>
                        onResolveRebound({
                          type: "PLAYER_REB",
                          side: flowState.offenseSide,
                          player: off,
                          rebType: "OFF_REB",
                        })
                      }
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-900 hover:bg-[#8B0D0E] hover:text-white cursor-pointer"
                    >
                      <span>
                        <strong className="mr-1.5">
                          #{off.jerseyNumber}
                        </strong>
                        {off.lastName}
                      </span>
                      <span className="text-[0.65rem] text-[#8B0D0E] font-black">
                        OFF REB ({orebResetSeconds}S)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Team Rebound / Out of Bounds Off the Rim */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <span className="block text-[0.68rem] font-bold uppercase text-slate-600">
                Ball Out of Bounds Off the Rim / Dead-Ball Team Rebound:
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    onResolveRebound({
                      type: "TEAM_OUT_OF_BOUNDS",
                      possessionToSide: getOppositeSide(flowState.offenseSide),
                      resetClockTo: shotClockDefault,
                      note: `Team Defensive Rebound / Out of Bounds — ${getTeamName(
                        getOppositeSide(flowState.offenseSide)
                      )} ball (${shotClockDefault}s)`,
                    })
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-[#0B2F5C] hover:bg-slate-100 cursor-pointer"
                >
                  Team Reb: {getTeamName(getOppositeSide(flowState.offenseSide))}{" "}
                  Ball ({shotClockDefault}S)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onResolveRebound({
                      type: "TEAM_OUT_OF_BOUNDS",
                      possessionToSide: flowState.offenseSide,
                      resetClockTo: orebResetSeconds,
                      note: `Team Offensive Rebound / Out of Bounds — ${getTeamName(
                        flowState.offenseSide
                      )} retains (${orebResetSeconds}s)`,
                    })
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-[#8B0D0E] hover:bg-slate-100 cursor-pointer"
                >
                  Team Reb: {getTeamName(flowState.offenseSide)} Keeps (
                  {orebResetSeconds}S)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 4 (CASE A): LIVE-BALL STEAL FIRST -> "TURNOVER BY?"
           ===================================================================== */}
        {flowState.kind === "STEAL_TURNOVER_BY" && (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Tap the{" "}
              <strong className="text-[#8B0D0E]">
                {getTeamName(getOppositeSide(flowState.stealerSide))} Offensive
                Ball Handler
              </strong>{" "}
              who committed the turnover:
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {getOnCourt(getOppositeSide(flowState.stealerSide)).map(
                (offPlayer) => (
                  <button
                    key={offPlayer.playerId}
                    type="button"
                    onClick={() => onSelectTurnoverVictimFromSteal(offPlayer)}
                    className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-xs font-black uppercase text-slate-900 hover:bg-[#8B0D0E] hover:text-white hover:border-[#8B0D0E] cursor-pointer"
                  >
                    <span className="rounded bg-[#8B0D0E] px-2 py-0.5 text-xs text-white shrink-0">
                      #{offPlayer.jerseyNumber}
                    </span>
                    <span className="truncate">
                      {offPlayer.firstName} {offPlayer.lastName} ({offPlayer.tov}{" "}
                      TO)
                    </span>
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => onSelectTurnoverVictimFromSteal(null)}
                className="sm:col-span-2 rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-xs font-black uppercase text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Skip / Team Turnover
              </button>
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 4 (CASE B): UNFORCED / DEAD-BALL TURNOVER FIRST -> QUICK TAG
           ===================================================================== */}
        {flowState.kind === "TURNOVER_TAG" && (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Possession flipped to{" "}
              <strong className="text-emerald-700">
                {getTeamName(getOppositeSide(flowState.offenseSide))}
              </strong>{" "}
              for an inbound pass. Select an optional Turnover Tag:
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                "Bad Pass",
                "Traveling",
                "Offensive 3-Sec",
                "Out of Bounds",
                "Double Dribble",
                "8-Sec Backcourt",
              ].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTurnoverReasonTag(tag)}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-black uppercase text-slate-900 hover:bg-[#8B0D0E] hover:text-white cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onSelectTurnoverReasonTag(null)}
              className="w-full rounded-xl bg-[#0B2F5C] px-4 py-2.5 text-xs font-black uppercase text-white hover:opacity-95 cursor-pointer"
            >
              Done (Skip Tag)
            </button>
          </div>
        )}

        {/* =====================================================================
            FLOW 5: FOUL UNDER BONUS LIMIT -> CALLING REFEREE + INBOUND OR SHOOTING FOUL
           ===================================================================== */}
        {flowState.kind === "FOUL_UNDER_BONUS" && (
          <div className="space-y-3.5">
            {/* Calling Referee Attribution Selector inside Dialog */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-black uppercase text-[#0B2F5C]">
                Calling Referee Attribution:
              </span>
              <select
                aria-label="Calling Referee"
                value={defaultRefereeId}
                onChange={(e) =>
                  onChangeDefaultReferee?.(e.target.value, flowState.eventId)
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900"
              >
                <option value="">Unassigned / Table Official</option>
                {referees.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.jerseyNumber} {r.name} ({r.role})
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              {getTeamName(flowState.foulSide)} is{" "}
              <strong className="text-emerald-700">
                Under the Bonus Limit
              </strong>
              . Choose how play resumes for{" "}
              <strong className="text-slate-900">
                {getTeamName(getOppositeSide(flowState.foulSide))}
              </strong>
              :
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  onResolveUnderBonusFoul({ type: "INBOUND_HOLD_CLOCK" })
                }
                className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white hover:bg-emerald-700 cursor-pointer"
              >
                Non-Shooting: Inbound (Hold Shot Clock)
              </button>
              <button
                type="button"
                onClick={() =>
                  onResolveUnderBonusFoul({ type: "INBOUND_RESET_14S" })
                }
                className="rounded-xl bg-[#0B2F5C] px-4 py-3 text-xs font-black uppercase text-white hover:opacity-95 cursor-pointer"
              >
                Frontcourt Foul: Inbound (Reset to {orebResetSeconds}S)
              </button>
              <button
                type="button"
                onClick={() =>
                  onResolveUnderBonusFoul({ type: "SHOOTING_FOUL_2FT" })
                }
                className="rounded-xl border-2 border-[#8B0D0E] bg-rose-50/70 px-4 py-3 text-xs font-black uppercase text-[#8B0D0E] hover:bg-[#8B0D0E] hover:text-white cursor-pointer"
              >
                Shooting Foul (2 Free Throws →)
              </button>
              <button
                type="button"
                onClick={() =>
                  onResolveUnderBonusFoul({ type: "SHOOTING_FOUL_3FT" })
                }
                className="rounded-xl border-2 border-[#8B0D0E] bg-rose-50/70 px-4 py-3 text-xs font-black uppercase text-[#8B0D0E] hover:bg-[#8B0D0E] hover:text-white cursor-pointer"
              >
                3PT Shooting Foul (3 Free Throws →)
              </button>
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 5: PENALTY / BONUS (OR SHOOTING FOUL) -> SELECT SHOOTER
           ===================================================================== */}
        {flowState.kind === "BONUS_SELECT_SHOOTER" && (
          <div className="space-y-3.5">
            {/* Calling Referee Attribution Selector inside Dialog */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-black uppercase text-[#0B2F5C]">
                Calling Referee Attribution:
              </span>
              <select
                aria-label="Calling Referee"
                value={defaultRefereeId}
                onChange={(e) =>
                  onChangeDefaultReferee?.(e.target.value, flowState.eventId)
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900"
              >
                <option value="">Unassigned / Table Official</option>
                {referees.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.jerseyNumber} {r.name} ({r.role})
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              <strong className="text-[#8B0D0E]">
                PENALTY / FREE THROWS ({flowState.totalFreeThrows} SHOTS):
              </strong>{" "}
              Tap the Fouled Offensive Player on{" "}
              <strong className="text-slate-900">
                {getTeamName(flowState.offenseSide)}
              </strong>{" "}
              who will shoot free throws:
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {getOnCourt(flowState.offenseSide).map((offPlayer) => (
                <button
                  key={offPlayer.playerId}
                  type="button"
                  onClick={() => onSelectBonusFtShooter(offPlayer)}
                  className="flex items-center gap-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-black uppercase text-slate-900 hover:border-[#0B2F5C] hover:bg-blue-50/70 cursor-pointer"
                >
                  <span
                    className="rounded px-2 py-0.5 text-xs text-white shrink-0"
                    style={{
                      backgroundColor: getTeamColor(flowState.offenseSide),
                    }}
                  >
                    #{offPlayer.jerseyNumber}
                  </span>
                  <span className="truncate">
                    {offPlayer.firstName} {offPlayer.lastName} (FT:{" "}
                    {offPlayer.ftm}-{offPlayer.fta})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 5: BONUS / PENALTY FREE THROW ATTEMPT (FT 1, FT 2, FT 3)
           ===================================================================== */}
        {flowState.kind === "BONUS_FREE_THROW_SHOT" && (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Record{" "}
              <strong className="text-[#8B0D0E]">
                Free Throw {flowState.currentFtNumber} of{" "}
                {flowState.totalFreeThrows}
              </strong>{" "}
              for{" "}
              <strong className="text-slate-900">
                #{flowState.shooter.jerseyNumber} {flowState.shooter.firstName}{" "}
                {flowState.shooter.lastName}
              </strong>
              :
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onResolveBonusFtAttempt(true)}
                className="rounded-xl bg-teal-600 px-5 py-3.5 text-xs sm:text-sm font-black uppercase text-white shadow-xs hover:bg-teal-700 cursor-pointer"
              >
                FT {flowState.currentFtNumber}: +1 FT MADE
              </button>
              <button
                type="button"
                onClick={() => onResolveBonusFtAttempt(false)}
                className="rounded-xl border border-slate-300 bg-slate-100 px-5 py-3.5 text-xs sm:text-sm font-black uppercase text-slate-800 hover:bg-slate-200 cursor-pointer"
              >
                FT {flowState.currentFtNumber}: FT MISS{" "}
                {flowState.currentFtNumber === flowState.totalFreeThrows &&
                flowState.foulType !== "UNSPORTSMANLIKE_FOUL"
                  ? "(To Rebound →)"
                  : ""}
              </button>
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 6: TECHNICAL FOUL -> SELECT OPPOSING FT SHOOTER
           ===================================================================== */}
        {flowState.kind === "TECHNICAL_SELECT_SHOOTER" && (
          <div className="space-y-3.5">
            {/* Calling Referee Attribution Selector inside Dialog */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-black uppercase text-[#0B2F5C]">
                Calling Referee Attribution:
              </span>
              <select
                aria-label="Calling Referee"
                value={defaultRefereeId}
                onChange={(e) =>
                  onChangeDefaultReferee?.(e.target.value, flowState.eventId)
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900"
              >
                <option value="">Unassigned / Table Official</option>
                {referees.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.jerseyNumber} {r.name} ({r.role})
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Select the designated{" "}
              <strong className="text-[#0B2F5C]">
                {getTeamName(flowState.shootingSide)} Free Throw Shooter
              </strong>{" "}
              for the Technical Foul free throw:
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {getOnCourt(flowState.shootingSide).map((shooter) => (
                <button
                  key={shooter.playerId}
                  type="button"
                  onClick={() => onSelectTechnicalFtShooter(shooter)}
                  className="flex items-center gap-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-black uppercase text-slate-900 hover:border-[#0B2F5C] hover:bg-blue-50/70 cursor-pointer"
                >
                  <span
                    className="rounded px-2 py-0.5 text-xs text-white shrink-0"
                    style={{
                      backgroundColor: getTeamColor(flowState.shootingSide),
                    }}
                  >
                    #{shooter.jerseyNumber}
                  </span>
                  <span className="truncate">
                    {shooter.firstName} {shooter.lastName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOW 6: TECHNICAL FREE THROW RESOLUTION -> PLAY RESUMES FROM POI
           ===================================================================== */}
        {flowState.kind === "TECHNICAL_FREE_THROW_SHOT" && (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm font-semibold text-slate-600">
              Technical Free Throw by{" "}
              <strong className="text-[#0B2F5C]">
                #{flowState.shooter.jerseyNumber} {flowState.shooter.firstName}{" "}
                {flowState.shooter.lastName}
              </strong>{" "}
              (Play resumes from Point of Interruption):
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onResolveTechnicalFtAttempt(true)}
                className="rounded-xl bg-teal-600 px-5 py-3.5 text-xs sm:text-sm font-black uppercase text-white shadow-xs hover:bg-teal-700 cursor-pointer"
              >
                +1 TECH FT MADE (Resume Play from POI)
              </button>
              <button
                type="button"
                onClick={() => onResolveTechnicalFtAttempt(false)}
                className="rounded-xl border border-slate-300 bg-slate-100 px-5 py-3.5 text-xs sm:text-sm font-black uppercase text-slate-800 hover:bg-slate-200 cursor-pointer"
              >
                TECH FT MISS (Resume Play from POI)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
