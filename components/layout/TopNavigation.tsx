"use client";

import React from "react";
import Link from "next/link";
import { LayoutDashboard, LogOut, Tv, Trophy, User } from "lucide-react";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";

export function TopNavigation() {
  const {
    userProfile,
    activeSection,
    leagues,
    followedLeagueIds,
    setActiveSection,
    setSelectedLeagueId,
    signOutUser,
  } = useBoxScoreStore();

  const fullName = userProfile
    ? `${userProfile.firstName} ${userProfile.lastName}`.trim() ||
      userProfile.email
    : "Guest";

  const initials = fullName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header
      className="sticky top-0 z-40 w-full text-white shadow-md border-b border-white/10"
      style={{ backgroundColor: "#0B2F5C" }}
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => {
              setSelectedLeagueId(null);
              setActiveSection("dashboard");
            }}
            className="text-left focus:outline-none cursor-pointer"
          >
            <BoxScoreLogo size="md" variant="dark-bg" showTagline />
          </button>

          {/* Primary Navigation: App Dashboard vs League Page */}
          <nav aria-label="Main Navigation" className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedLeagueId(null);
                setActiveSection("dashboard");
              }}
              aria-current={activeSection === "dashboard" ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeSection === "dashboard"
                  ? "bg-[#8B0D0E] text-white shadow-xs ring-1 ring-white/25"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              App Dashboard
            </button>

            <button
              type="button"
              onClick={() => setActiveSection("leagues")}
              aria-current={activeSection === "leagues" ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeSection === "leagues"
                  ? "bg-[#8B0D0E] text-white shadow-xs ring-1 ring-white/25"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Trophy className="h-4 w-4" aria-hidden="true" />
              League Page
              <span className="rounded bg-white/20 px-1.5 py-0.5 text-[0.65rem] font-black tabular-nums">
                {leagues.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedLeagueId(null);
                setActiveSection("profile");
              }}
              aria-current={activeSection === "profile" ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeSection === "profile"
                  ? "bg-[#8B0D0E] text-white shadow-xs ring-1 ring-white/25"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              <User className="h-4 w-4" aria-hidden="true" />
              User Profile
            </button>

            <Link
              href="/scoreboard"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Arena Scoreboard Projector in new tab"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/15 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-300 hover:bg-amber-400/25 transition-all cursor-pointer"
            >
              <Tv className="h-4 w-4 text-amber-300" />
              Live Scoreboard
            </Link>
          </nav>
        </div>

        {/* Right Side: Authenticated User Profile + Roles/Positions + Sign Out */}
        {userProfile && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedLeagueId(null);
                setActiveSection("profile");
              }}
              title="View your user profile and career stats"
              className={`hidden md:flex items-center gap-2.5 rounded-xl border px-3.5 py-1.5 transition-all text-left cursor-pointer ${
                activeSection === "profile"
                  ? "border-amber-400/60 bg-white/20 ring-1 ring-amber-400/40"
                  : "border-white/15 bg-white/10 hover:bg-white/15"
              }`}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-white shrink-0"
                style={{ backgroundColor: "#8B0D0E" }}
              >
                {initials || <User className="h-4 w-4" aria-hidden="true" />}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-tight text-white">
                    {fullName}
                  </span>
                  {userProfile.positions.length > 0 && (
                    <span className="rounded bg-amber-400/20 px-1.5 py-0.2 text-[0.62rem] font-black text-amber-300 border border-amber-300/30">
                      {userProfile.positions.join(" / ")}
                    </span>
                  )}
                </div>
                <span className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-300">
                  {userProfile.accountRoles.length > 0
                    ? userProfile.accountRoles.join(" • ")
                    : "Member"}{" "}
                  • Profile
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={signOutUser}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-slate-950/40 px-3 py-2 text-xs font-black uppercase tracking-wider text-rose-200 hover:bg-[#8B0D0E] hover:text-white transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
