"use client";

import React, { useMemo, useState, useRef } from "react";
import {
  User,
  LogOut,
  Mail,
  MapPin,
  Calendar,
  Ruler,
  Weight,
  Shirt,
  Trophy,
  ShieldCheck,
  Edit3,
  Check,
  Camera,
  Activity,
  Flame,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { useBoxScoreStore } from "@/stores/useBoxScoreStore";
import { PlayerPosition } from "@/types/boxscore";
import { compressImageFile } from "@/lib/image-utils";

const ALL_POSITIONS: PlayerPosition[] = ["PG", "SG", "SF", "PF", "C"];

export function UserProfileWorkspace() {
  const {
    userProfile,
    updateUserProfile,
    signOutUser,
    leagues,
    teams,
    tournamentsByLeagueId,
    gameSessionsByMatchId,
    setActiveSection,
  } = useBoxScoreStore();

  const [activeTab, setActiveTab] = useState<"profile" | "stats">("profile");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [firstName, setFirstName] = useState(userProfile?.firstName || "");
  const [lastName, setLastName] = useState(userProfile?.lastName || "");
  const [phone, setPhone] = useState(userProfile?.phone || "");
  const [birthday, setBirthday] = useState(userProfile?.birthday || "");
  const [address, setAddress] = useState(userProfile?.address || "");
  const [heightCm, setHeightCm] = useState(userProfile?.heightCm?.toString() || "");
  const [weightKg, setWeightKg] = useState(userProfile?.weightKg?.toString() || "");
  const [jerseyNumber, setJerseyNumber] = useState(userProfile?.jerseyNumber?.toString() || "");
  const [positions, setPositions] = useState<PlayerPosition[]>(userProfile?.positions || []);
  const [bio, setBio] = useState(userProfile?.bio || "");
  const [imageUrl, setImageUrl] = useState(userProfile?.imageUrl || "");

  const fullName = userProfile
    ? `${userProfile.firstName} ${userProfile.lastName}`.trim() || userProfile.email
    : "Athlete";

  const initials = fullName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, 500, 0.88, true);
        setImageUrl(compressed);
        updateUserProfile({ imageUrl: compressed });
      } catch {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (result) {
            setImageUrl(result);
            updateUserProfile({ imageUrl: result });
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleTogglePosition = (pos: PlayerPosition) => {
    setPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    const success = await updateUserProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() || undefined,
      birthday: birthday.trim() || undefined,
      address: address.trim() || undefined,
      heightCm: heightCm.trim() || undefined,
      weightKg: weightKg.trim() || undefined,
      jerseyNumber: jerseyNumber ? Number(jerseyNumber) : undefined,
      positions,
      bio: bio.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
    });

    setIsSaving(false);
    if (success) {
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  // -------------------------------------------------------------
  // Career Stats & Game Log Aggregation
  // -------------------------------------------------------------
  const { gamesLog, careerTotals, careerAverages, associatedTeams } = useMemo(() => {
    if (!userProfile) {
      return {
        gamesLog: [],
        careerTotals: { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 },
        careerAverages: { ppg: "0.0", rpg: "0.0", apg: "0.0", spg: "0.0", bpg: "0.0", fgPct: "0.0%", tpPct: "0.0%", ftPct: "0.0%" },
        associatedTeams: [],
      };
    }

    const userFirst = (userProfile.firstName || "").trim().toLowerCase();
    const userLast = (userProfile.lastName || "").trim().toLowerCase();

    // Find all player IDs in all team rosters that correspond to this user
    const matchedPlayerIds = new Set<string>();
    const teamsList: { teamName: string; leagueName: string; jerseyNumber?: number }[] = [];

    teams.forEach((team) => {
      team.roster.forEach((player) => {
        const isIdMatch = player.userId && player.userId === userProfile.id;
        const isNameMatch =
          userFirst &&
          userLast &&
          player.firstName.trim().toLowerCase() === userFirst &&
          player.lastName.trim().toLowerCase() === userLast;

        if (isIdMatch || isNameMatch) {
          matchedPlayerIds.add(player.id);
          const league = leagues.find((l) => l.id === team.leagueId);
          teamsList.push({
            teamName: team.name,
            leagueName: league?.name || "Independent",
            jerseyNumber: player.jerseyNumber,
          });
        }
      });
    });

    // Scan all game sessions
    interface LogEntry {
      matchId: string;
      date: string;
      leagueName: string;
      matchup: string;
      teamName: string;
      pts: number;
      reb: number;
      ast: number;
      stl: number;
      blk: number;
      fgm: number;
      fga: number;
      tpm: number;
      tpa: number;
      ftm: number;
      fta: number;
      result?: string;
    }

    const log: LogEntry[] = [];

    Object.entries(gameSessionsByMatchId).forEach(([matchId, session]) => {
      let leagueName = "League Game";
      let matchup = "Matchup";
      let scheduledDate = new Date(session.updatedAt || Date.now()).toLocaleDateString();

      Object.entries(tournamentsByLeagueId).forEach(([leagueId, tournament]) => {
        const match = tournament.matches?.find((m) => m.id === matchId);
        if (match) {
          const lg = leagues.find((l) => l.id === leagueId);
          if (lg) leagueName = lg.name;
          scheduledDate = match.scheduledDate || scheduledDate;
          const homeT = teams.find((t) => t.id === match.homeTeamId)?.name || "Home";
          const awayT = teams.find((t) => t.id === match.awayTeamId)?.name || "Away";
          matchup = `${homeT} vs ${awayT}`;
        }
      });

      // Check home players
      Object.entries(session.homePlayerStats || {}).forEach(([pId, stats]) => {
        if (matchedPlayerIds.has(pId)) {
          const homeTeam = teams.find((t) => t.roster.some((p) => p.id === pId));
          log.push({
            matchId,
            date: scheduledDate,
            leagueName,
            matchup,
            teamName: homeTeam?.name || "Home Team",
            pts: stats.points || 0,
            reb: (stats.oreb || 0) + (stats.dreb || 0),
            ast: stats.ast || 0,
            stl: stats.stl || 0,
            blk: stats.blk || 0,
            fgm: stats.fgm || 0,
            fga: stats.fga || 0,
            tpm: stats.tpm || 0,
            tpa: stats.tpa || 0,
            ftm: stats.ftm || 0,
            fta: stats.fta || 0,
          });
        }
      });

      // Check away players
      Object.entries(session.awayPlayerStats || {}).forEach(([pId, stats]) => {
        if (matchedPlayerIds.has(pId)) {
          const awayTeam = teams.find((t) => t.roster.some((p) => p.id === pId));
          log.push({
            matchId,
            date: scheduledDate,
            leagueName,
            matchup,
            teamName: awayTeam?.name || "Away Team",
            pts: stats.points || 0,
            reb: (stats.oreb || 0) + (stats.dreb || 0),
            ast: stats.ast || 0,
            stl: stats.stl || 0,
            blk: stats.blk || 0,
            fgm: stats.fgm || 0,
            fga: stats.fga || 0,
            tpm: stats.tpm || 0,
            tpa: stats.tpa || 0,
            ftm: stats.ftm || 0,
            fta: stats.fta || 0,
          });
        }
      });
    });

    // Compute career totals
    const totals = log.reduce(
      (acc, curr) => ({
        gp: acc.gp + 1,
        pts: acc.pts + curr.pts,
        reb: acc.reb + curr.reb,
        ast: acc.ast + curr.ast,
        stl: acc.stl + curr.stl,
        blk: acc.blk + curr.blk,
        fgm: acc.fgm + curr.fgm,
        fga: acc.fga + curr.fga,
        tpm: acc.tpm + curr.tpm,
        tpa: acc.tpa + curr.tpa,
        ftm: acc.ftm + curr.ftm,
        fta: acc.fta + curr.fta,
      }),
      { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 }
    );

    const gp = totals.gp || 1;
    const averages = {
      ppg: (totals.pts / gp).toFixed(1),
      rpg: (totals.reb / gp).toFixed(1),
      apg: (totals.ast / gp).toFixed(1),
      spg: (totals.stl / gp).toFixed(1),
      bpg: (totals.blk / gp).toFixed(1),
      fgPct: totals.fga > 0 ? `${Math.round((totals.fgm / totals.fga) * 100)}%` : "0.0%",
      tpPct: totals.tpa > 0 ? `${Math.round((totals.tpm / totals.tpa) * 100)}%` : "0.0%",
      ftPct: totals.fta > 0 ? `${Math.round((totals.ftm / totals.fta) * 100)}%` : "0.0%",
    };

    return {
      gamesLog: log,
      careerTotals: totals,
      careerAverages: averages,
      associatedTeams: teamsList,
    };
  }, [userProfile, teams, leagues, tournamentsByLeagueId, gameSessionsByMatchId]);

  if (!userProfile) return null;

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6">
      {/* Top Breadcrumb & Sign Out Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => setActiveSection("dashboard")}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-wider cursor-pointer"
          >
            ← Back to App Dashboard
          </button>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 sm:text-3xl">
            Account & Roster Profile
          </h1>
        </div>

        {/* Prominent Sign Out Button inside Profile View (as requested) */}
        <button
          type="button"
          onClick={signOutUser}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-[#8B0D0E] hover:bg-[#8B0D0E] hover:text-white transition-all shadow-xs cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign Out of Account
        </button>
      </div>

      {/* Main Profile Card Header */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        {/* Profile Identity Bar */}
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            {/* Avatar & Info */}
            <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
              {/* Photo / Avatar */}
              <div className="relative group shrink-0">
                <div
                  className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl border-4 border-slate-100 shadow-lg overflow-hidden flex items-center justify-center font-black text-3xl sm:text-4xl text-white"
                  style={{ backgroundColor: "#8B0D0E" }}
                >
                  {imageUrl || userProfile.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl || userProfile.imageUrl}
                      alt={fullName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{initials || <User className="h-12 w-12" />}</span>
                  )}
                </div>

                {/* Change photo button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload profile portrait"
                  className="absolute bottom-1 right-1 rounded-full bg-slate-900/80 p-2 text-white shadow-md hover:bg-slate-900 transition-colors cursor-pointer border border-white/40"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarFile}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* Names, Roles & Badges */}
              <div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  {userProfile.accountRoles.map((role) => (
                    <span
                      key={role}
                      className="rounded-md bg-[#0B2F5C] px-2.5 py-0.5 text-[0.68rem] font-black uppercase tracking-wider text-white"
                    >
                      {role}
                    </span>
                  ))}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                  <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 sm:text-3xl">
                    {fullName}
                  </h2>
                  {userProfile.jerseyNumber !== undefined && (
                    <span className="flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-0.5 text-xs font-black text-amber-400">
                      <Shirt className="h-3.5 w-3.5" />#{userProfile.jerseyNumber}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs font-bold text-slate-500">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    {userProfile.email}
                  </span>
                  {userProfile.address && (
                    <span className="flex items-center gap-1">
                      • <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {userProfile.address}
                    </span>
                  )}
                </div>

                {/* Preferred Positions */}
                <div className="mt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                  {userProfile.positions.length > 0 ? (
                    userProfile.positions.map((pos) => (
                      <span
                        key={pos}
                        className="rounded-md bg-[#0B2F5C]/10 border border-[#0B2F5C]/20 px-2 py-0.5 text-[0.7rem] font-black uppercase text-[#0B2F5C]"
                      >
                        {pos}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">No position specified</span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Action: Edit Profile */}
            <div className="flex items-center justify-center sm:justify-end gap-2 shrink-0">
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit Bio & Info
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {saveSuccess && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />
              Profile details successfully saved and updated across your leagues!
            </div>
          )}
        </div>

        {/* Tab Switcher: Profile & Bio vs Career Stats */}
        <div className="flex border-t border-slate-200 bg-slate-50 px-6 sm:px-8">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`border-b-2 px-5 py-3.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "profile"
                ? "border-[#8B0D0E] text-[#8B0D0E]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Profile & Bio
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stats")}
            className={`border-b-2 px-5 py-3.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "stats"
                ? "border-[#8B0D0E] text-[#8B0D0E]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Career Stats & Game Log
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-bold text-slate-700">
              {careerTotals.gp} Games
            </span>
          </button>
        </div>
      </div>

      {/* Tab 1: Profile & Bio */}
      {activeTab === "profile" && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column: Athletic & Physical Metrics */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                <Activity className="h-4 w-4 text-[#8B0D0E]" />
                Athletic Attributes
              </h3>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
                    <Ruler className="h-3.5 w-3.5 text-[#0B2F5C]" />
                    Height
                  </span>
                  <div className="mt-1 text-lg font-black text-slate-900">
                    {userProfile.heightCm ? `${userProfile.heightCm} cm` : "—"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
                    <Weight className="h-3.5 w-3.5 text-[#0B2F5C]" />
                    Weight
                  </span>
                  <div className="mt-1 text-lg font-black text-slate-900">
                    {userProfile.weightKg ? `${userProfile.weightKg} kg` : "—"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
                    <Shirt className="h-3.5 w-3.5 text-[#0B2F5C]" />
                    Jersey #
                  </span>
                  <div className="mt-1 text-lg font-black text-slate-900">
                    {userProfile.jerseyNumber !== undefined ? `#${userProfile.jerseyNumber}` : "—"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
                    <Calendar className="h-3.5 w-3.5 text-[#0B2F5C]" />
                    Birthday
                  </span>
                  <div className="mt-1 text-sm font-black text-slate-900 truncate">
                    {userProfile.birthday || "—"}
                  </div>
                </div>
              </div>

              {/* Positions List */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <span className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
                  Primary Positions
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {userProfile.positions.map((p) => (
                    <span
                      key={p}
                      className="rounded-lg bg-[#0B2F5C] px-3 py-1 text-xs font-black text-white shadow-2xs"
                    >
                      {p}
                    </span>
                  ))}
                  {userProfile.positions.length === 0 && (
                    <span className="text-xs text-slate-400 italic">None registered</span>
                  )}
                </div>
              </div>
            </div>

            {/* Teams Affiliation */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                <Trophy className="h-4 w-4 text-amber-500" />
                Team Affiliations
              </h3>

              <div className="mt-4 space-y-2.5">
                {associatedTeams.length > 0 ? (
                  associatedTeams.map((t, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div>
                        <div className="text-xs font-black uppercase text-slate-900">
                          {t.teamName}
                        </div>
                        <div className="text-[0.68rem] font-bold text-slate-500">
                          {t.leagueName}
                        </div>
                      </div>
                      {t.jerseyNumber !== undefined && (
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-black text-slate-700">
                          #{t.jerseyNumber}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Not currently registered in any active team roster. Team managers can search and add your account!
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Bio & Detailed Info / Edit Form */}
          <div className="lg:col-span-2">
            {!isEditing ? (
              <div className="space-y-6">
                {/* Player Bio */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      Player Biography
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="text-xs font-bold text-[#8B0D0E] hover:underline uppercase tracking-wider cursor-pointer"
                    >
                      Edit Bio
                    </button>
                  </div>

                  <div className="mt-4 text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                    {userProfile.bio ? (
                      userProfile.bio
                    ) : (
                      <p className="text-slate-400 italic">
                        No player bio written yet. Click &quot;Edit Bio &amp; Info&quot; above to tell your basketball story, play style, strengths, and achievements!
                      </p>
                    )}
                  </div>
                </div>

                {/* Account & Security Summary */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Account Security &amp; Contact
                  </h3>

                  <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 text-xs">
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-slate-400">
                        Email Address
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-900">{userProfile.email}</dd>
                    </div>

                    <div>
                      <dt className="font-bold uppercase tracking-wider text-slate-400">
                        Phone Number
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-900">
                        {userProfile.phone || "Not set"}
                      </dd>
                    </div>

                    <div>
                      <dt className="font-bold uppercase tracking-wider text-slate-400">
                        Home City / Address
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-900">
                        {userProfile.address || "Not set"}
                      </dd>
                    </div>

                    <div>
                      <dt className="font-bold uppercase tracking-wider text-slate-400">
                        Account Role
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-900">
                        {userProfile.accountRoles.join(", ")}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            ) : (
              /* Profile Edit Form */
              <form
                onSubmit={handleSaveProfile}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">
                    Edit Account &amp; Player Profile
                  </h3>
                  <span className="text-xs text-slate-400">Updates sync to Supabase &amp; rosters</span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-600">
                      First Name
                    </label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0B2F5C] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-600">
                      Last Name
                    </label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0B2F5C] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-600">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0B2F5C] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-600">
                      Birthday
                    </label>
                    <input
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0B2F5C] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-600">
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="250"
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      placeholder="188"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0B2F5C] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-600">
                      Weight (kg)
                    </label>
                    <input
                      type="number"
                      min="30"
                      max="200"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      placeholder="84"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0B2F5C] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-600">
                      Jersey #
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={jerseyNumber}
                      onChange={(e) => setJerseyNumber(e.target.value)}
                      placeholder="23"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0B2F5C] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-600">
                      City / Address
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Los Angeles, CA"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0B2F5C] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Positions Selector */}
                <div>
                  <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-600 mb-2">
                    Preferred Playing Positions
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_POSITIONS.map((pos) => {
                      const selected = positions.includes(pos);
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => handleTogglePosition(pos)}
                          className={`rounded-xl px-4 py-2 text-xs font-black transition-all cursor-pointer ${
                            selected
                              ? "bg-[#0B2F5C] text-white shadow-xs"
                              : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Player Bio */}
                <div>
                  <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-600">
                    Player Bio &amp; Background
                  </label>
                  <textarea
                    rows={4}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Describe your playing background, favorite moves, achievements, and play style..."
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 focus:border-[#0B2F5C] focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold uppercase text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#8B0D0E] px-6 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-[#6c0a0b] transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Career Stats & Game Log */}
      {activeTab === "stats" && (
        <div className="mt-6 space-y-6">
          {/* Career Key Stats Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
              <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-400">
                Games (GP)
              </span>
              <div className="mt-1 text-2xl font-black text-slate-900">{careerTotals.gp}</div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm text-center">
              <span className="text-[0.68rem] font-black uppercase tracking-wider text-amber-700">
                PPG
              </span>
              <div className="mt-1 text-2xl font-black text-amber-900">{careerAverages.ppg}</div>
              <span className="text-[0.62rem] font-bold text-amber-600">
                {careerTotals.pts} PTS total
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
              <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-400">
                RPG
              </span>
              <div className="mt-1 text-2xl font-black text-slate-900">{careerAverages.rpg}</div>
              <span className="text-[0.62rem] font-bold text-slate-400">
                {careerTotals.reb} REB total
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
              <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-400">
                APG
              </span>
              <div className="mt-1 text-2xl font-black text-slate-900">{careerAverages.apg}</div>
              <span className="text-[0.62rem] font-bold text-slate-400">
                {careerTotals.ast} AST total
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
              <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-400">
                SPG
              </span>
              <div className="mt-1 text-2xl font-black text-slate-900">{careerAverages.spg}</div>
              <span className="text-[0.62rem] font-bold text-slate-400">
                {careerTotals.stl} STL total
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
              <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-400">
                BPG
              </span>
              <div className="mt-1 text-2xl font-black text-slate-900">{careerAverages.bpg}</div>
              <span className="text-[0.62rem] font-bold text-slate-400">
                {careerTotals.blk} BLK total
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
              <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-400">
                FG%
              </span>
              <div className="mt-1 text-2xl font-black text-slate-900">{careerAverages.fgPct}</div>
              <span className="text-[0.62rem] font-bold text-slate-400">
                {careerTotals.fgm}/{careerTotals.fga}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
              <span className="text-[0.68rem] font-black uppercase tracking-wider text-slate-400">
                3P%
              </span>
              <div className="mt-1 text-2xl font-black text-slate-900">{careerAverages.tpPct}</div>
              <span className="text-[0.62rem] font-bold text-slate-400">
                {careerTotals.tpm}/{careerTotals.tpa}
              </span>
            </div>
          </div>

          {/* Game-by-Game Log Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">
                  Game Log Telemetry
                </h3>
                <p className="text-xs text-slate-500">
                  Real-time statistics recorded from scorebook games
                </p>
              </div>
              <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-700">
                {gamesLog.length} Records
              </span>
            </div>

            {gamesLog.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-100/60 font-black uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">League</th>
                      <th className="px-4 py-3">Matchup</th>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3 text-right text-amber-700">PTS</th>
                      <th className="px-4 py-3 text-right">REB</th>
                      <th className="px-4 py-3 text-right">AST</th>
                      <th className="px-4 py-3 text-right">STL</th>
                      <th className="px-4 py-3 text-right">BLK</th>
                      <th className="px-4 py-3 text-right">FG</th>
                      <th className="px-4 py-3 text-right">3PT</th>
                      <th className="px-4 py-3 text-right">FT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gamesLog.map((game, i) => (
                      <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                          {game.date}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">
                          {game.leagueName}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                          {game.matchup}
                        </td>
                        <td className="px-4 py-3 font-bold text-[#0B2F5C] whitespace-nowrap">
                          {game.teamName}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-amber-900 text-sm">
                          {game.pts}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">
                          {game.reb}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">
                          {game.ast}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">
                          {game.stl}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">
                          {game.blk}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-600 whitespace-nowrap">
                          {game.fgm}/{game.fga}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-600 whitespace-nowrap">
                          {game.tpm}/{game.tpa}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-600 whitespace-nowrap">
                          {game.ftm}/{game.fta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center">
                <Flame className="mx-auto h-10 w-10 text-slate-300" />
                <h4 className="mt-3 text-sm font-black uppercase text-slate-700">
                  No Game Stats Recorded Yet
                </h4>
                <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                  When scorekeepers record live game events in games where your linked player participates, box score stats will automatically compile here!
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
