"use client";

import React, { useState } from "react";
import {
  Menu,
  ArrowLeft,
  Trophy,
  LayoutDashboard,
  User,
  Shield,
  LogOut,
  Calendar,
  Users,
  BarChart3,
  GitBranch,
} from "lucide-react";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";

interface TopHeaderBarProps {
  onOpenMobileMenu: () => void;
}

export function TopHeaderBar({ onOpenMobileMenu }: TopHeaderBarProps) {
  const {
    activeSection,
    selectedLeagueId,
    selectedLeagueTab,
    leagues,
    userProfile,
    setActiveSection,
    setSelectedLeagueId,
    setSelectedLeagueTab,
    signOutUser,
  } = useBoxScoreStore();

  const activeLeague = leagues.find((l) => l.id === selectedLeagueId);

  // Friendly title calculation
  const getContextInfo = () => {
    if (activeSection === "profile") {
      return {
        title: "Account & Profile Settings",
        category: "User Profile",
        canBack: true,
        backLabel: "Back to Dashboard",
        onBack: () => setActiveSection("dashboard"),
      };
    }

    if (activeSection === "leagues" && activeLeague) {
      const tabLabels: Record<string, string> = {
        league_dashboard: "League Overview",
        teams: "Teams & Rosters",
        schedule: "Games & Fixtures",
        bracket: "Tournament Brackets",
        game_management: "Live Game Scoring",
        game_details: "Match Telemetry",
        categories: "Age & Division Categories",
      };

      const currentTabName = tabLabels[selectedLeagueTab] || "League Management";

      return {
        title: `${activeLeague.name} — ${currentTabName}`,
        category: "League Workspace",
        canBack: true,
        backLabel: "Back to All Leagues",
        onBack: () => setSelectedLeagueId(null),
      };
    }

    if (activeSection === "leagues") {
      return {
        title: "Basketball Leagues & Tournaments",
        category: "Leagues Hub",
        canBack: false,
        backLabel: "",
        onBack: () => {},
      };
    }

    return {
      title: "App Executive Dashboard",
      category: "Box Score HQ",
      canBack: false,
      backLabel: "",
      onBack: () => {},
    };
  };

  const context = getContextInfo();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md shadow-2xs sm:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 lg:hidden cursor-pointer"
          title="Open Navigation Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Global Contextual Back Button */}
        {context.canBack && (
          <button
            type="button"
            onClick={context.onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-800 hover:bg-slate-100 hover:border-slate-400 transition-all cursor-pointer shadow-2xs shrink-0"
            title={context.backLabel}
          >
            <ArrowLeft className="h-4 w-4 text-[#8B0D0E]" />
            <span className="hidden sm:inline">{context.backLabel}</span>
            <span className="sm:hidden">Back</span>
          </button>
        )}

        {/* Context Breadcrumbs */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[0.62rem] font-black uppercase tracking-widest text-[#0B2F5C]">
              {context.category}
            </span>
            {activeLeague && selectedLeagueId && (
              <span className="hidden md:inline-flex items-center gap-1 text-[0.65rem] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                Active League
              </span>
            )}
          </div>
          <h2 className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-900 truncate max-w-[280px] sm:max-w-md lg:max-w-xl">
            {context.title}
          </h2>
        </div>
      </div>

      {/* Right Action Icons & Badges */}
      <div className="flex items-center gap-2.5">
        {/* Quick League Switcher if more than 1 league */}
        {leagues.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1">
            <Trophy className="h-3.5 w-3.5 text-[#0B2F5C]" />
            <select
              aria-label="Quick League Switcher"
              value={selectedLeagueId || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setSelectedLeagueId(null);
                  setActiveSection("leagues");
                } else {
                  setSelectedLeagueId(val);
                  setActiveSection("leagues");
                }
              }}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="">-- All Leagues Overview --</option>
              {leagues.map((lg) => (
                <option key={lg.id} value={lg.id}>
                  {lg.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Direct Account Shortcut */}
        {userProfile && (
          <button
            type="button"
            onClick={() => {
              setSelectedLeagueId(null);
              setActiveSection("profile");
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 sm:px-2.5 sm:py-1 text-xs font-black uppercase text-slate-700 hover:bg-slate-100 cursor-pointer"
            title="Profile & Settings"
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[0.65rem] font-black text-white shrink-0 overflow-hidden"
              style={{ backgroundColor: "#8B0D0E" }}
            >
              {userProfile.imageUrl ? (
                <img
                  src={userProfile.imageUrl}
                  alt={userProfile.firstName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{userProfile.firstName?.[0] || "U"}</span>
              )}
            </div>
            <span className="hidden sm:inline truncate max-w-[120px]">
              {userProfile.firstName} {userProfile.lastName}
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
