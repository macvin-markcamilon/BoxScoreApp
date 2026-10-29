"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Tv,
  Trophy,
  User,
  Bell,
  Check,
  X,
  Shield,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Layers,
  ArrowLeft,
  Menu,
  ChevronDown,
  Radio,
  Video,
} from "lucide-react";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";

interface AppSidebarProps {
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
}

export function AppSidebar({
  isMobileOpen,
  setIsMobileOpen,
  isCollapsed: controlledCollapsed,
  setIsCollapsed: setControlledCollapsed,
}: AppSidebarProps) {
  const {
    userProfile,
    activeSection,
    leagues,
    selectedLeagueId,
    selectedLeagueTab,
    notifications,
    setActiveSection,
    setSelectedLeagueId,
    setSelectedLeagueTab,
    signOutUser,
    acceptLeagueRoleInvitation,
    declineLeagueRoleInvitation,
  } = useBoxScoreStore();

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed ?? internalCollapsed;
  const setIsCollapsed = setControlledCollapsed ?? setInternalCollapsed;
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isLeaguesExpanded, setIsLeaguesExpanded] = useState(true);
  const notifDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close notifications popover on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notifDropdownRef.current &&
        !notifDropdownRef.current.contains(event.target as Node)
      ) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Auto-expand league submenu if a league is selected
  useEffect(() => {
    if (selectedLeagueId) {
      setIsLeaguesExpanded(true);
    }
  }, [selectedLeagueId]);

  const normalizedUserEmail = userProfile?.email?.trim().toLowerCase() ?? "";

  const myNotifications = notifications.filter((n) => {
    if (userProfile?.id && n.recipientUserId === userProfile.id) return true;
    if (
      normalizedUserEmail &&
      n.recipientEmail.trim().toLowerCase() === normalizedUserEmail
    ) {
      return true;
    }
    return false;
  });

  const unreadCount = myNotifications.filter(
    (n) => !n.isRead || n.status === "PENDING"
  ).length;

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

  const activeLeague = leagues.find((l) => l.id === selectedLeagueId);

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col border-r border-white/10 text-white shadow-2xl transition-all duration-300 ease-in-out ${
          isCollapsed ? "w-20" : "w-72"
        } ${
          isMobileOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0"
        }`}
        style={{ backgroundColor: "#0B2F5C" }}
      >
        {/* Header / Brand */}
        <div
          className={`flex h-20 items-center justify-between border-b border-white/10 ${
            isCollapsed ? "px-2 gap-1" : "px-4"
          }`}
        >
          {!isCollapsed ? (
            <button
              type="button"
              onClick={() => {
                setSelectedLeagueId(null);
                setActiveSection("dashboard");
                setIsMobileOpen(false);
              }}
              className="text-left focus:outline-none cursor-pointer overflow-hidden"
              title="Go to App Dashboard"
            >
              <BoxScoreLogo size="sm" variant="dark-bg" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSelectedLeagueId(null);
                setActiveSection("dashboard");
                setIsMobileOpen(false);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8B0D0E] text-xs font-black text-white shadow-md cursor-pointer"
              title="Box Score App"
            >
              BS
            </button>
          )}

          {/* Desktop Collapse / Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white transition-colors cursor-pointer"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="flex lg:hidden h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-slate-300 hover:text-white cursor-pointer"
            title="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Global Back Navigation Pill (When inside a specific league or profile) */}
        {(selectedLeagueId || activeSection === "profile") && !isCollapsed && (
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => {
                if (selectedLeagueId) {
                  setSelectedLeagueId(null);
                  setActiveSection("leagues");
                } else if (activeSection === "profile") {
                  setActiveSection("dashboard");
                }
              }}
              className="flex w-full items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer shadow-xs"
              title={selectedLeagueId ? "Exit current league and back to all leagues" : "Back to dashboard"}
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {selectedLeagueId ? "← Back to All Leagues" : "← Back to Dashboard"}
              </span>
            </button>
          </div>
        )}

        {/* Primary Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 custom-scrollbar">
          {/* Section: Main Menu */}
          {!isCollapsed && (
            <p className="px-3 pb-1 text-[0.65rem] font-black uppercase tracking-widest text-slate-400">
              Main Menu
            </p>
          )}

          {/* 1. App Dashboard */}
          <button
            type="button"
            onClick={() => {
              setSelectedLeagueId(null);
              setActiveSection("dashboard");
              setIsMobileOpen(false);
            }}
            title="App Dashboard"
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeSection === "dashboard" && !selectedLeagueId
                ? "bg-[#8B0D0E] text-white shadow-sm ring-1 ring-white/20"
                : "text-slate-200 hover:bg-white/10 hover:text-white"
            } ${isCollapsed ? "justify-center" : ""}`}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>App Dashboard</span>}
          </button>

          {/* 2. League Page (Hub & Selection) */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setActiveSection("leagues");
                if (isCollapsed) {
                  setIsCollapsed(false);
                }
                setIsLeaguesExpanded(!isLeaguesExpanded);
              }}
              title="Leagues Workspace"
              className={`flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeSection === "leagues"
                  ? "bg-white/15 text-white ring-1 ring-white/25"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              } ${isCollapsed ? "justify-center" : ""}`}
            >
              <div className="flex items-center gap-3">
                <Trophy className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span>League Page</span>}
              </div>
              {!isCollapsed && (
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-white/20 px-1.5 py-0.5 text-[0.65rem] font-black tabular-nums">
                    {leagues.length}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                      isLeaguesExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>
              )}
            </button>

            {/* Sub-menu: League Workspace Tabs when a league is active */}
            {!isCollapsed && isLeaguesExpanded && (
              <div className="ml-4 pl-3 border-l border-white/15 space-y-1 py-1 animate-in fade-in duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLeagueId(null);
                    setActiveSection("leagues");
                    setIsMobileOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.72rem] font-black uppercase tracking-wide transition-colors cursor-pointer ${
                    activeSection === "leagues" && !selectedLeagueId
                      ? "text-amber-300 font-black bg-white/10"
                      : "text-slate-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Layers className="h-3 w-3 shrink-0" />
                  <span>All Leagues List ({leagues.length})</span>
                </button>

                {/* If a league is currently selected, show its internal workspaces */}
                {activeLeague && (
                  <div className="pt-2 space-y-1">
                    <div className="flex items-center justify-between px-2 pb-1">
                      <span className="text-[0.62rem] font-black uppercase text-amber-300 truncate max-w-[150px]">
                        ★ {activeLeague.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedLeagueId(null)}
                        className="text-[0.62rem] font-bold uppercase text-slate-400 hover:text-white cursor-pointer"
                        title="Close active league workspace"
                      >
                        [Exit]
                      </button>
                    </div>

                    {[
                      { id: "league_dashboard", label: "Dashboard" },
                      { id: "teams", label: "Teams & Roster" },
                      { id: "schedule", label: "Games Schedule" },
                      { id: "bracket", label: "Tournament Bracket" },
                      { id: "game_management", label: "Live Game Scoring" },
                      { id: "game_details", label: "Match Telemetry" },
                      { id: "categories", label: "Categories" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setSelectedLeagueTab(tab.id as any);
                          setActiveSection("leagues");
                          setIsMobileOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.7rem] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                          activeSection === "leagues" &&
                          selectedLeagueId === activeLeague.id &&
                          selectedLeagueTab === tab.id
                            ? "bg-[#8B0D0E] text-white shadow-xs font-black"
                            : "text-slate-300 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Live Scoreboard External Launcher */}
          <Link
            href="/scoreboard"
            target="_blank"
            rel="noopener noreferrer"
            title="Open Arena Scoreboard Projector in new tab"
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-white/10 hover:text-white transition-all cursor-pointer ${
              isCollapsed ? "justify-center" : ""
            }`}
          >
            <Tv className="h-4 w-4 shrink-0 text-amber-400" />
            {!isCollapsed && (
              <div className="flex items-center justify-between flex-1">
                <span>Live Scoreboard</span>
                <ExternalLink className="h-3 w-3 text-slate-400" />
              </div>
            )}
          </Link>

          {/* 4. OBS Live Broadcast Studio (Facebook/YouTube Live & Slow-Mo) */}
          <Link
            href={selectedLeagueId ? `/studio?leagueId=${selectedLeagueId}` : "/studio"}
            target="_blank"
            rel="noopener noreferrer"
            title="Open OBS Live Broadcast Studio with camera, scoreboard overlay & slow-mo replay"
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-white/10 hover:text-white transition-all cursor-pointer ${
              isCollapsed ? "justify-center" : ""
            }`}
          >
            <Radio className="h-4 w-4 shrink-0 text-rose-500 animate-pulse" />
            {!isCollapsed && (
              <div className="flex items-center justify-between flex-1">
                <span className="flex items-center gap-1.5">
                  <span>OBS Studio</span>
                  <span className="rounded bg-rose-500/20 px-1.5 py-0.2 text-[0.6rem] font-black text-rose-400 border border-rose-500/30">
                    LIVE
                  </span>
                </span>
                <ExternalLink className="h-3 w-3 text-slate-400" />
              </div>
            )}
          </Link>

          {/* 5. User Profile */}
          <button
            type="button"
            onClick={() => {
              setSelectedLeagueId(null);
              setActiveSection("profile");
              setIsMobileOpen(false);
            }}
            title="View user profile and career stats"
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeSection === "profile"
                ? "bg-[#8B0D0E] text-white shadow-sm ring-1 ring-white/20"
                : "text-slate-200 hover:bg-white/10 hover:text-white"
            } ${isCollapsed ? "justify-center" : ""}`}
          >
            <User className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>My Profile</span>}
          </button>
        </div>

        {/* Notifications Popover Trigger & User Profile Footer */}
        <div className="border-t border-white/10 p-3 space-y-2">
          {/* Notification Button */}
          <div className="relative" ref={notifDropdownRef}>
            <button
              type="button"
              onClick={() => setIsNotifOpen((prev) => !prev)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold transition-all cursor-pointer border ${
                isNotifOpen
                  ? "border-amber-400/60 bg-white/20 text-white"
                  : "border-white/15 bg-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
              } ${isCollapsed ? "justify-center" : ""}`}
              title="Notifications"
            >
              <div className="relative shrink-0">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[0.58rem] font-black text-white shadow-xs animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <div className="flex items-center justify-between flex-1">
                  <span className="uppercase tracking-wider">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="rounded bg-rose-500/30 px-1.5 py-0.2 text-[0.65rem] font-black text-rose-300 border border-rose-400/40">
                      {unreadCount} new
                    </span>
                  )}
                </div>
              )}
            </button>

            {/* Notification Dropdown Box */}
            {isNotifOpen && (
              <div
                className={`absolute bottom-full mb-2 w-80 sm:w-88 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl text-slate-800 z-50 ${
                  isCollapsed ? "left-12" : "left-0"
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-[#0B2F5C]">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[0.62rem] font-black text-rose-700">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {myNotifications.length > 0 && (
                    <span className="text-[0.65rem] text-slate-400">
                      {myNotifications.length} total
                    </span>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 py-1 space-y-1">
                  {myNotifications.length === 0 ? (
                    <div className="py-6 text-center">
                      <Bell className="mx-auto h-7 w-7 text-slate-300" />
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        No notifications yet
                      </p>
                      <p className="text-[0.68rem] text-slate-400">
                        Invitations to teams and leagues will appear here.
                      </p>
                    </div>
                  ) : (
                    myNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`rounded-xl p-2.5 text-xs transition-colors ${
                          notif.status === "PENDING"
                            ? "bg-amber-50/70 border border-amber-200/80"
                            : notif.isRead
                            ? "bg-white hover:bg-slate-50"
                            : "bg-blue-50/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[#0B2F5C] text-white">
                              <Shield className="h-3 w-3" />
                            </span>
                            <span className="font-black text-slate-900 text-xs">
                              {notif.title}
                            </span>
                          </div>
                          <span className="text-[0.65rem] text-slate-400 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {new Date(notif.createdAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-slate-600 leading-snug">
                          {notif.message}
                        </p>

                        {/* Actions */}
                        {notif.status === "PENDING" ? (
                          <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-amber-200/60 pt-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await declineLeagueRoleInvitation(notif.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[0.65rem] font-black uppercase text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              <X className="h-3 w-3 text-rose-600" />
                              Decline
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await acceptLeagueRoleInvitation(notif.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[0.65rem] font-black uppercase text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
                            >
                              <Check className="h-3 w-3" />
                              Accept Role
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1.5 flex items-center justify-between">
                            <span
                              className={`text-[0.62rem] font-black uppercase ${
                                notif.status === "ACCEPTED"
                                  ? "text-emerald-600"
                                  : "text-slate-500"
                              }`}
                            >
                              {notif.status === "ACCEPTED" ? "✓ Accepted" : "Declined"}
                            </span>
                            {notif.status === "ACCEPTED" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLeagueId(notif.leagueId);
                                  setActiveSection("leagues");
                                  setIsNotifOpen(false);
                                  setIsMobileOpen(false);
                                }}
                                className="text-[0.65rem] font-bold text-[#0B2F5C] hover:underline flex items-center gap-0.5 cursor-pointer"
                              >
                                Open League <ExternalLink className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Footer Card */}
          {userProfile && (
            <div
              className={`flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 p-2.5 transition-all ${
                isCollapsed ? "justify-center" : "justify-between"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedLeagueId(null);
                  setActiveSection("profile");
                  setIsMobileOpen(false);
                }}
                className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer flex-1"
                title="View Account Profile"
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-black text-white shrink-0 overflow-hidden"
                  style={{ backgroundColor: "#8B0D0E" }}
                >
                  {userProfile.imageUrl ? (
                    <img
                      src={userProfile.imageUrl}
                      alt={fullName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{initials || <User className="h-4 w-4" />}</span>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-black uppercase tracking-tight text-white truncate">
                      {fullName}
                    </span>
                    <span className="text-[0.65rem] font-semibold text-slate-300 truncate">
                      {userProfile.email}
                    </span>
                  </div>
                )}
              </button>

              {!isCollapsed && (
                <button
                  type="button"
                  onClick={signOutUser}
                  title="Sign out of Box Score"
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
