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
} from "lucide-react";
import { BoxScoreLogo } from "@/components/brand/BoxScoreLogo";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";

export function TopNavigation() {
  const {
    userProfile,
    activeSection,
    leagues,
    followedLeagueIds,
    notifications,
    setActiveSection,
    setSelectedLeagueId,
    signOutUser,
    acceptLeagueRoleInvitation,
    declineLeagueRoleInvitation,
    markNotificationAsRead,
  } = useBoxScoreStore();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
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

  const normalizedUserEmail = userProfile?.email?.trim().toLowerCase() ?? "";

  // Notifications belonging to the active user (by email or userId)
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

  const pendingInvitations = myNotifications.filter((n) => n.status === "PENDING");
  const unreadCount = myNotifications.filter((n) => !n.isRead || n.status === "PENDING").length;

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

            <Link
              href="/scoreboard"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Arena Scoreboard Projector in new tab"
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
            >
              <Tv className="h-4 w-4" />
              Live Scoreboard
            </Link>
          </nav>
        </div>

        {/* Right Side: Notifications & Authenticated User Profile */}
        {userProfile && (
          <div className="flex items-center gap-3">
            {/* Notification Bell Dropdown */}
            <div className="relative" ref={notifDropdownRef}>
              <button
                type="button"
                onClick={() => setIsNotifOpen((prev) => !prev)}
                className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                  isNotifOpen
                    ? "border-amber-400/60 bg-white/20 text-white"
                    : "border-white/15 bg-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
                }`}
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[0.6rem] font-black text-white shadow-xs animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover */}
              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl text-slate-800 z-50">
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

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 py-1 space-y-1">
                    {myNotifications.length === 0 ? (
                      <div className="py-8 text-center">
                        <Bell className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-2 text-xs font-bold text-slate-500">
                          No notifications yet
                        </p>
                        <p className="text-[0.68rem] text-slate-400">
                          When league creators assign you roles, invitations will appear here.
                        </p>
                      </div>
                    ) : (
                      myNotifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`rounded-xl p-3 text-xs transition-colors ${
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

                          <p className="mt-1.5 text-xs text-slate-600 leading-snug">
                            {notif.message}
                          </p>

                          {/* Action Buttons for Pending Invitations */}
                          {notif.status === "PENDING" ? (
                            <div className="mt-3 flex items-center justify-end gap-2 border-t border-amber-200/60 pt-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  await declineLeagueRoleInvitation(notif.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[0.68rem] font-black uppercase text-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                <X className="h-3 w-3 text-rose-600" />
                                Decline
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await acceptLeagueRoleInvitation(notif.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[0.68rem] font-black uppercase text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
                              >
                                <Check className="h-3 w-3" />
                                Accept Role
                              </button>
                            </div>
                          ) : (
                            <div className="mt-2 flex items-center justify-between">
                              <span
                                className={`text-[0.65rem] font-black uppercase ${
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

            {/* Profile Pill */}
            <button
              type="button"
              onClick={() => {
                setSelectedLeagueId(null);
                setActiveSection("profile");
              }}
              title="View your user profile and career stats"
              className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-1.5 transition-all text-left cursor-pointer ${
                activeSection === "profile"
                  ? "border-amber-400/60 bg-white/20 ring-1 ring-amber-400/40"
                  : "border-white/15 bg-white/10 hover:bg-white/15"
              }`}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-white shrink-0 overflow-hidden"
                style={{ backgroundColor: "#8B0D0E" }}
              >
                {userProfile.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userProfile.imageUrl}
                    alt={fullName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{initials || <User className="h-4 w-4" aria-hidden="true" />}</span>
                )}
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
          </div>
        )}
      </div>
    </header>
  );
}
