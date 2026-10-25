"use client";

import { create } from "zustand";
import {
  mapAuthUserToProfile,
  mapDbLeagueRow,
  mapDbTeamRow,
  supabase,
} from "@/lib/supabase-client";
import { idbGet, idbSet, idbRemove } from "@/lib/idb-storage";
import {
  recordMatchResultAndAdvance,
  seedMultiStagePlayoffsFromStandings,
} from "@/lib/tournament-engine";
import { generateUUID } from "@/lib/uuid";
import {
  AppNotification,
  AppSection,
  AssistantCoachMember,
  BracketingFormatId,
  LeagueCategory,
  LeagueCourt,
  LeagueMember,
  LeagueMemberRole,
  LeagueRecord,
  LeagueReferee,
  LeagueRulesConfig,
  LeagueTeam,
  LeagueTournamentData,
  LeagueWorkspaceTab,
  LiveGameSession,
  RosterPlayer,
  RuleSetId,
  TournamentMatch,
  UserProfile,
} from "@/types/boxscore";

const STORAGE_KEYS = {
  PROFILE: "boxscore_cached_profile_v1",
  LEAGUES: "boxscore_real_leagues_v1",
  FOLLOWS: "boxscore_real_follows_v1",
  TEAMS: "boxscore_real_teams_v1",
  TOURNAMENTS: "boxscore_real_tournaments_v1",
  REFEREES: "boxscore_real_referees_v1",
  GAME_SESSIONS: "boxscore_real_game_sessions_v1",
  IMAGE_VAULT: "boxscore_image_vault_v1",
  DELETED_LEAGUES: "boxscore_deleted_league_ids_v1",
  PROFILE_OVERRIDES: "boxscore_profile_overrides_v1",
  NOTIFICATIONS: "boxscore_notifications_v1",
};

export interface TeamUpsertInput {
  leagueId: string;
  categoryId?: string | null;
  categoryName?: string;
  name: string;
  imageUrl: string;
  primaryColor: string;
  secondaryColor: string;
  headCoach: string;
  headCoachImageUrl?: string;
  assistantCoaches: string[];
  assistantCoachStaff?: AssistantCoachMember[];
  manager: string;
  managerImageUrl?: string;
  captainPlayerId: string | null;
  roster: RosterPlayer[];
}

interface BoxScoreState {
  isAuthLoading: boolean;
  isDataLoading: boolean;
  userProfile: UserProfile | null;
  activeSection: AppSection;
  selectedLeagueId: string | null;
  selectedLeagueTab: LeagueWorkspaceTab;
  activeManageMatchId: string | null;
  schemaStatus: "checking" | "ready" | "missing_tables";
  errorBanner: string | null;

  leagues: LeagueRecord[];
  followedLeagueIds: string[];
  teams: LeagueTeam[];
  tournamentsByLeagueId: Record<string, LeagueTournamentData>;
  refereesByLeagueId: Record<string, LeagueReferee[]>;
  gameSessionsByMatchId: Record<string, LiveGameSession>;
  notifications: AppNotification[];

  setActiveSection: (section: AppSection) => void;
  setSelectedLeagueId: (leagueId: string | null) => void;
  setSelectedLeagueTab: (tab: LeagueWorkspaceTab) => void;
  setActiveManageMatchId: (matchId: string | null) => void;
  openMatchInGameManagement: (leagueId: string, matchId: string) => void;
  clearError: () => void;

  addRefereeToLeague: (leagueId: string, referee: LeagueReferee) => void;
  updateRefereeInLeague: (
    leagueId: string,
    refereeId: string,
    updates: Partial<LeagueReferee>
  ) => void;
  deleteRefereeFromLeague: (leagueId: string, refereeId: string) => void;
  setRefereesForLeague: (leagueId: string, referees: LeagueReferee[]) => void;
  saveGameSession: (matchId: string, session: LiveGameSession) => void;
  syncFromLocalStorage: () => void;

  saveLeagueTournamentData: (
    leagueId: string,
    data: LeagueTournamentData
  ) => void;
  recordMatchScoreInLeague: (
    leagueId: string,
    matchId: string,
    homeScore: number,
    awayScore: number
  ) => void;
  updateMatchDetailsInLeague: (
    leagueId: string,
    matchId: string,
    updates: Partial<TournamentMatch>
  ) => void;
  addCustomMatchInLeague: (leagueId: string, match: TournamentMatch) => void;
  deleteMatchInLeague: (leagueId: string, matchId: string) => void;
  reorderMatchesInLeague: (
    leagueId: string,
    matchId: string,
    direction: "up" | "down"
  ) => void;
  seedPlayoffsInLeague: (leagueId: string) => void;
  persistLeagueGamesToCloud: (leagueId: string) => Promise<boolean>;

  initializeSession: () => Promise<void>;
  refreshProfileFromSession: () => Promise<void>;
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<boolean>;
  searchRegisteredProfiles: (query: string) => Promise<UserProfile[]>;
  signOutUser: () => Promise<void>;
  resetAllLocalData: () => void;

  fetchLeaguesAndTeams: () => Promise<void>;
  setupRealtimeSubscriptions: () => () => void;
  createLeague: (input: {
    name: string;
    imageUrl: string;
    startDate: string;
    endDate: string;
    courts: LeagueCourt[];
    ruleSetId: RuleSetId;
    rulesConfig: LeagueRulesConfig;
  }) => Promise<LeagueRecord | null>;
  updateLeague: (
    leagueId: string,
    input: {
      name: string;
      imageUrl: string;
      startDate: string;
      endDate: string;
      courts: LeagueCourt[];
      ruleSetId: RuleSetId;
      rulesConfig: LeagueRulesConfig;
    }
  ) => Promise<LeagueRecord | null>;
  deleteLeague: (leagueId: string) => Promise<boolean>;

  updateLeagueImage: (leagueId: string, imageUrl: string) => Promise<void>;

  addCategoryToLeague: (
    leagueId: string,
    category: {
      name: string;
      code?: string;
      color?: string;
      ageGroup?: string;
      ruleSetId: RuleSetId;
      rulesConfig: LeagueRulesConfig;
      formatId: BracketingFormatId;
      poolsCount?: 1 | 2 | 4;
      advancingPerPool?: 2 | 4;
      seriesBestOf?: 3 | 5 | 7;
      stepladderVariant?: "PAGE_MCINTYRE_TOP4" | "STEPLADDER_CLIMB";
    }
  ) => Promise<LeagueCategory | null>;
  updateCategoryInLeague: (
    leagueId: string,
    categoryId: string,
    input: Partial<LeagueCategory>
  ) => Promise<void>;
  deleteCategoryFromLeague: (
    leagueId: string,
    categoryId: string
  ) => Promise<void>;

  addLeagueMember: (
    leagueId: string,
    member: {
      email: string;
      displayName: string;
      role: LeagueMemberRole;
    }
  ) => Promise<LeagueMember | null>;
  removeLeagueMember: (leagueId: string, memberId: string) => Promise<void>;
  updateLeagueMemberRole: (
    leagueId: string,
    memberId: string,
    role: LeagueMemberRole
  ) => Promise<void>;

  acceptLeagueRoleInvitation: (notificationId: string) => Promise<boolean>;
  declineLeagueRoleInvitation: (notificationId: string) => Promise<boolean>;
  markNotificationAsRead: (notificationId: string) => void;

  toggleFollowLeague: (leagueId: string) => Promise<void>;

  createTeamInLeague: (input: TeamUpsertInput) => Promise<LeagueTeam | null>;
  bulkCreateTeamsInLeague: (
    leagueId: string,
    teamsInput: TeamUpsertInput[]
  ) => Promise<number>;
  updateTeamInLeague: (
    teamId: string,
    input: TeamUpsertInput
  ) => Promise<LeagueTeam | null>;
  deleteTeamFromLeague: (teamId: string) => Promise<void>;

  updateTeamLogo: (teamId: string, imageUrl: string) => Promise<void>;
  updateTeamStaffPhoto: (
    teamId: string,
    role: "headCoach" | "manager" | "assistant",
    imageUrl: string,
    assistantId?: string
  ) => Promise<void>;
  updateRosterPlayerPhoto: (
    teamId: string,
    playerId: string,
    imageUrl: string
  ) => Promise<void>;
  updateRosterPlayerJersey: (
    teamId: string,
    playerId: string,
    jerseyNumber: number
  ) => Promise<void>;
  revertRosterPlayerToAccount: (
    teamId: string,
    playerId: string
  ) => Promise<boolean>;
  getLinkedAccountForPlayer: (
    player: RosterPlayer
  ) => Promise<UserProfile | null>;

  setTeamCaptain: (teamId: string, playerId: string) => Promise<void>;
  addPlayerToExistingTeam: (
    teamId: string,
    player: RosterPlayer
  ) => Promise<void>;
  bulkAddPlayersToTeam: (
    teamId: string,
    players: RosterPlayer[]
  ) => Promise<number>;
}

function readLocalCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    // Mirror to IndexedDB as high-capacity backing store
    void idbSet(key, value);
  } catch {
    // If quota is exceeded in localStorage, save to IndexedDB and prune large cache items from localStorage
    try {
      void idbSet(key, value);
      // Prune image vault or heavy tournaments from localStorage to free space for auth tokens
      if (key === STORAGE_KEYS.IMAGE_VAULT) {
        window.localStorage.removeItem(STORAGE_KEYS.IMAGE_VAULT);
      }
    } catch {
      // Ignore
    }
  }
}

function removeLocalCache(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
  try {
    void idbRemove(key);
  } catch {
    // Ignore
  }
}

// In-memory fallback image vault in case storage is constrained
const memoryImageVault: Record<string, string> = {};

function saveToImageVault(entityKey: string, imageUrl?: string) {
  if (typeof window === "undefined") return;
  if (imageUrl) {
    memoryImageVault[entityKey] = imageUrl;
  } else {
    delete memoryImageVault[entityKey];
  }

  // Also persist to IndexedDB asynchronously so images never get lost
  if (imageUrl) {
    void idbSet(`vault:${entityKey}`, imageUrl);
  } else {
    void idbRemove(`vault:${entityKey}`);
  }

  // For small images (<15KB), store in localStorage vault; if larger or quota tight, keep in memory/IDB
  if (imageUrl && imageUrl.length < 15_000) {
    const vault = readLocalCache<Record<string, string>>(
      STORAGE_KEYS.IMAGE_VAULT,
      {}
    );
    vault[entityKey] = imageUrl;
    writeLocalCache(STORAGE_KEYS.IMAGE_VAULT, vault);
  } else if (!imageUrl) {
    const vault = readLocalCache<Record<string, string>>(
      STORAGE_KEYS.IMAGE_VAULT,
      {}
    );
    delete vault[entityKey];
    writeLocalCache(STORAGE_KEYS.IMAGE_VAULT, vault);
  }
}

function getFromImageVault(entityKey: string): string {
  if (memoryImageVault[entityKey]) {
    return memoryImageVault[entityKey];
  }
  const vault = readLocalCache<Record<string, string>>(
    STORAGE_KEYS.IMAGE_VAULT,
    {}
  );
  return vault[entityKey] ?? "";
}

function hydrateTeamImagesFromVault(team: LeagueTeam): LeagueTeam {
  const rawAssistants = team.assistantCoaches ?? [];
  const staffList: AssistantCoachMember[] =
    team.assistantCoachStaff && team.assistantCoachStaff.length > 0
      ? team.assistantCoachStaff
      : rawAssistants.map((name, i) => ({
          id: `${team.id}-ac-${i}`,
          name,
          imageUrl: "",
        }));

  return {
    ...team,
    imageUrl: team.imageUrl || getFromImageVault(`team:${team.id}`),
    headCoachImageUrl:
      team.headCoachImageUrl || getFromImageVault(`hc:${team.id}`),
    managerImageUrl: team.managerImageUrl || getFromImageVault(`mgr:${team.id}`),
    assistantCoachStaff: staffList.map((ac) => ({
      ...ac,
      imageUrl: ac.imageUrl || getFromImageVault(`ac:${team.id}:${ac.id}`),
    })),
    roster: (team.roster ?? []).map((p) => ({
      ...p,
      imageUrl: p.imageUrl || getFromImageVault(`player:${p.id}`),
    })),
  };
}

function hydrateLeagueImageFromVault(league: LeagueRecord): LeagueRecord {
  return {
    ...league,
    imageUrl: league.imageUrl || getFromImageVault(`league:${league.id}`),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallbackValue), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallbackValue);
      });
  });
}

async function syncTeamsToUserMetadata(_teams: LeagueTeam[]) {
  // Do NOT write team rosters or league data to auth.users user_metadata.
  // user_metadata is encoded directly inside the Supabase JWT access token.
  // Storing team arrays in user_metadata bloats the JWT and crashes auth with 400 Bad Request.
}

export const useBoxScoreStore = create<BoxScoreState>((set, get) => ({
  isAuthLoading: true,
  isDataLoading: false,
  userProfile: null,
  activeSection: "leagues",
  selectedLeagueId: null,
  selectedLeagueTab: "teams",
  activeManageMatchId: null,
  schemaStatus: "checking",
  errorBanner: null,

  leagues: [],
  followedLeagueIds: [],
  teams: [],
  tournamentsByLeagueId: {},
  refereesByLeagueId: {},
  gameSessionsByMatchId: {},
  notifications: [],

  setActiveSection: (section) => set({ activeSection: section }),
  setSelectedLeagueId: (leagueId) =>
    set({
      selectedLeagueId: leagueId,
      selectedLeagueTab: "teams",
      activeManageMatchId: null,
    }),
  setSelectedLeagueTab: (tab) => set({ selectedLeagueTab: tab }),
  setActiveManageMatchId: (matchId) => set({ activeManageMatchId: matchId }),
  openMatchInGameManagement: (leagueId, matchId) =>
    set({
      selectedLeagueId: leagueId,
      selectedLeagueTab: "game_management",
      activeManageMatchId: matchId,
    }),
  clearError: () => set({ errorBanner: null }),

  addRefereeToLeague: (leagueId, referee) => {
    if (referee.imageUrl) {
      saveToImageVault(`ref:${referee.id}`, referee.imageUrl);
    }
    const existing = get().refereesByLeagueId[leagueId] ?? [];
    const nextList = [...existing, referee];
    const nextMap = {
      ...get().refereesByLeagueId,
      [leagueId]: nextList,
    };
    set({ refereesByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.REFEREES, nextMap);
  },

  updateRefereeInLeague: (leagueId, refereeId, updates) => {
    if (updates.imageUrl) {
      saveToImageVault(`ref:${refereeId}`, updates.imageUrl);
    }
    const existing = get().refereesByLeagueId[leagueId] ?? [];
    const nextList = existing.map((r) =>
      r.id === refereeId ? { ...r, ...updates } : r
    );
    const nextMap = {
      ...get().refereesByLeagueId,
      [leagueId]: nextList,
    };
    set({ refereesByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.REFEREES, nextMap);
  },

  deleteRefereeFromLeague: (leagueId, refereeId) => {
    const existing = get().refereesByLeagueId[leagueId] ?? [];
    const nextList = existing.filter((r) => r.id !== refereeId);
    const nextMap = {
      ...get().refereesByLeagueId,
      [leagueId]: nextList,
    };
    set({ refereesByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.REFEREES, nextMap);
  },

  setRefereesForLeague: (leagueId, referees) => {
    for (const ref of referees) {
      if (ref.imageUrl) {
        saveToImageVault(`ref:${ref.id}`, ref.imageUrl);
      }
    }
    const nextMap = {
      ...get().refereesByLeagueId,
      [leagueId]: referees,
    };
    set({ refereesByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.REFEREES, nextMap);
  },

  saveGameSession: (matchId, session) => {
    const nextSessions = {
      ...get().gameSessionsByMatchId,
      [matchId]: session,
    };
    set({ gameSessionsByMatchId: nextSessions });
    writeLocalCache(STORAGE_KEYS.GAME_SESSIONS, nextSessions);

    // Broadcast across browser tabs and windows via BroadcastChannel
    if (typeof window !== "undefined") {
      try {
        const bc = new BroadcastChannel("boxscore_game_sessions_sync");
        bc.postMessage({ type: "GAME_SESSION_UPDATE", matchId, session });
        bc.close();
      } catch {
        // Fallback to localStorage events
      }
    }
  },

  syncFromLocalStorage: () => {
    const deletedIds = readLocalCache<string[]>(STORAGE_KEYS.DELETED_LEAGUES, []);
    const cachedSessions = readLocalCache<Record<string, LiveGameSession>>(
      STORAGE_KEYS.GAME_SESSIONS,
      {}
    );
    const cachedTournaments = readLocalCache<
      Record<string, LeagueTournamentData>
    >(STORAGE_KEYS.TOURNAMENTS, {});
    const cachedLeagues = readLocalCache<LeagueRecord[]>(
      STORAGE_KEYS.LEAGUES,
      []
    )
      .filter((l) => !deletedIds.includes(l.id))
      .map(hydrateLeagueImageFromVault);
    const cachedTeams = readLocalCache<LeagueTeam[]>(
      STORAGE_KEYS.TEAMS,
      []
    )
      .filter((t) => !deletedIds.includes(t.leagueId))
      .map(hydrateTeamImagesFromVault);

    set({
      gameSessionsByMatchId: {
        ...get().gameSessionsByMatchId,
        ...cachedSessions,
      },
      tournamentsByLeagueId: {
        ...get().tournamentsByLeagueId,
        ...cachedTournaments,
      },
      leagues: cachedLeagues.length > 0 ? cachedLeagues : get().leagues,
      teams: cachedTeams.length > 0 ? cachedTeams : get().teams,
    });
  },

  saveLeagueTournamentData: (leagueId, data) => {
    const nextMap = {
      ...get().tournamentsByLeagueId,
      [leagueId]: data,
    };
    set({ tournamentsByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.TOURNAMENTS, nextMap);
    void get().persistLeagueGamesToCloud(leagueId);
  },

  recordMatchScoreInLeague: (leagueId, matchId, homeScore, awayScore) => {
    const current = get().tournamentsByLeagueId[leagueId];
    if (!current) return;
    const updated = recordMatchResultAndAdvance(
      current,
      matchId,
      homeScore,
      awayScore
    );
    const nextMap = {
      ...get().tournamentsByLeagueId,
      [leagueId]: updated,
    };
    set({ tournamentsByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.TOURNAMENTS, nextMap);
    void get().persistLeagueGamesToCloud(leagueId);
  },

  updateMatchDetailsInLeague: (leagueId, matchId, updates) => {
    const current = get().tournamentsByLeagueId[leagueId];
    if (!current) return;
    const updatedMatches = current.matches.map((m) =>
      m.id === matchId ? { ...m, ...updates } : m
    );
    const updated: LeagueTournamentData = {
      ...current,
      matches: updatedMatches,
      updatedAt: new Date().toISOString(),
    };
    const nextMap = {
      ...get().tournamentsByLeagueId,
      [leagueId]: updated,
    };
    set({ tournamentsByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.TOURNAMENTS, nextMap);
    void get().persistLeagueGamesToCloud(leagueId);
  },

  addCustomMatchInLeague: (leagueId, match) => {
    const current = get().tournamentsByLeagueId[leagueId];
    if (!current) return;
    const updated: LeagueTournamentData = {
      ...current,
      matches: [...current.matches, match],
      updatedAt: new Date().toISOString(),
    };
    const nextMap = {
      ...get().tournamentsByLeagueId,
      [leagueId]: updated,
    };
    set({ tournamentsByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.TOURNAMENTS, nextMap);
    void get().persistLeagueGamesToCloud(leagueId);
  },

  deleteMatchInLeague: (leagueId, matchId) => {
    const current = get().tournamentsByLeagueId[leagueId];
    if (!current) return;
    const updated: LeagueTournamentData = {
      ...current,
      matches: current.matches.filter((m) => m.id !== matchId),
      updatedAt: new Date().toISOString(),
    };
    const nextMap = {
      ...get().tournamentsByLeagueId,
      [leagueId]: updated,
    };
    set({ tournamentsByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.TOURNAMENTS, nextMap);
    void get().persistLeagueGamesToCloud(leagueId);
  },

  reorderMatchesInLeague: (leagueId, matchId, direction) => {
    const current = get().tournamentsByLeagueId[leagueId];
    if (!current || !current.matches) return;
    const matches = [...current.matches];
    const index = matches.findIndex((m) => m.id === matchId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= matches.length) return;

    // Swap matches
    const temp = matches[index];
    matches[index] = matches[targetIndex];
    matches[targetIndex] = temp;

    // Renumber gameNumber and preserve/re-sequence slots if desirable, but keep schedule times aligned
    const renumbered = matches.map((m, idx) => ({
      ...m,
      gameNumber: idx + 1,
    }));

    const updated: LeagueTournamentData = {
      ...current,
      matches: renumbered,
      updatedAt: new Date().toISOString(),
    };
    const nextMap = {
      ...get().tournamentsByLeagueId,
      [leagueId]: updated,
    };
    set({ tournamentsByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.TOURNAMENTS, nextMap);
    void get().persistLeagueGamesToCloud(leagueId);
  },

  seedPlayoffsInLeague: (leagueId) => {
    const current = get().tournamentsByLeagueId[leagueId];
    if (!current) return;
    const leagueTeams = get().teams.filter((t) => t.leagueId === leagueId);
    const updated = seedMultiStagePlayoffsFromStandings(current, leagueTeams);
    const nextMap = {
      ...get().tournamentsByLeagueId,
      [leagueId]: updated,
    };
    set({ tournamentsByLeagueId: nextMap });
    writeLocalCache(STORAGE_KEYS.TOURNAMENTS, nextMap);
    void get().persistLeagueGamesToCloud(leagueId);
  },

  persistLeagueGamesToCloud: async (leagueId) => {
    const state = get();
    const league = state.leagues.find((l) => l.id === leagueId);
    const tournament = state.tournamentsByLeagueId[leagueId];
    const referees = (state.refereesByLeagueId[leagueId] ?? []).map((r) => ({
      ...r,
      imageUrl: "", // keep cloud payload compact; portraits are in Image Vault or generated
    }));
    const leagueGameSessions: Record<string, LiveGameSession> = {};
    for (const [mId, sess] of Object.entries(state.gameSessionsByMatchId)) {
      if (sess.leagueId === leagueId) {
        leagueGameSessions[mId] = sess;
      }
    }

    // 1. Always write to local storage
    writeLocalCache(STORAGE_KEYS.TOURNAMENTS, state.tournamentsByLeagueId);
    writeLocalCache(STORAGE_KEYS.REFEREES, state.refereesByLeagueId);
    writeLocalCache(STORAGE_KEYS.GAME_SESSIONS, state.gameSessionsByMatchId);

    if (!league) return true;

    const enrichedRulesConfig = {
      ...league.rulesConfig,
      _persistedTournament: tournament ?? null,
      _persistedReferees: referees,
      _persistedGameSessions: leagueGameSessions,
    } as LeagueRulesConfig & Record<string, unknown>;

    const nextLeagues = state.leagues.map((l) =>
      l.id === leagueId ? { ...l, rulesConfig: enrichedRulesConfig } : l
    );
    set({ leagues: nextLeagues });
    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);

    // 2. Sync to Supabase `public.leagues.rules_config` JSONB or user_metadata
    if (state.schemaStatus === "ready") {
      try {
        const { error } = await supabase
          .from("leagues")
          .update({ rules_config: enrichedRulesConfig })
          .eq("id", leagueId);
        if (error && error.code !== "PGRST205") {
          return false;
        }
      } catch {
        return false;
      }
    }
    return true;
  },

  initializeSession: async () => {
    // If localStorage was jammed previously by large base64/SVG blobs, safely clear the old huge image vault
    if (typeof window !== "undefined") {
      try {
        const rawVault = window.localStorage.getItem(STORAGE_KEYS.IMAGE_VAULT);
        if (rawVault && rawVault.length > 500_000) {
          // Large image vault in localStorage is what exhausts quota for Supabase auth tokens
          window.localStorage.removeItem(STORAGE_KEYS.IMAGE_VAULT);
        }
      } catch {
        // Ignore
      }
    }

    // Immediately hydrate cached profile + local leagues/teams/tournaments so UI never hangs
    const cachedProfile = readLocalCache<UserProfile | null>(
      STORAGE_KEYS.PROFILE,
      null
    );
    const cachedLeagues = readLocalCache<LeagueRecord[]>(
      STORAGE_KEYS.LEAGUES,
      []
    ).map(hydrateLeagueImageFromVault);
    const cachedFollows = readLocalCache<string[]>(STORAGE_KEYS.FOLLOWS, []);
    const cachedTeams = readLocalCache<LeagueTeam[]>(
      STORAGE_KEYS.TEAMS,
      []
    ).map(hydrateTeamImagesFromVault);
    const cachedTournaments = readLocalCache<
      Record<string, LeagueTournamentData>
    >(STORAGE_KEYS.TOURNAMENTS, {});
    const rawReferees = readLocalCache<Record<string, LeagueReferee[]>>(
      STORAGE_KEYS.REFEREES,
      {}
    );
    const cachedReferees: Record<string, LeagueReferee[]> = {};
    for (const [lid, list] of Object.entries(rawReferees)) {
      cachedReferees[lid] = (list ?? []).map((r) => ({
        ...r,
        imageUrl: r.imageUrl || getFromImageVault(`ref:${r.id}`),
      }));
    }
    const cachedGameSessions = readLocalCache<Record<string, LiveGameSession>>(
      STORAGE_KEYS.GAME_SESSIONS,
      {}
    );
    const cachedNotifications = readLocalCache<AppNotification[]>(
      STORAGE_KEYS.NOTIFICATIONS,
      []
    );

    if (cachedProfile) {
      set({
        userProfile: cachedProfile,
        leagues: cachedLeagues,
        followedLeagueIds: cachedFollows,
        teams: cachedTeams,
        tournamentsByLeagueId: cachedTournaments,
        refereesByLeagueId: cachedReferees,
        gameSessionsByMatchId: cachedGameSessions,
        notifications: cachedNotifications,
        isAuthLoading: false,
      });
    } else {
      set({
        tournamentsByLeagueId: cachedTournaments,
        refereesByLeagueId: cachedReferees,
        gameSessionsByMatchId: cachedGameSessions,
        notifications: cachedNotifications,
        isAuthLoading: true,
      });
    }

    try {
      const sessionRes = await withTimeout(
        supabase.auth.getSession(),
        3500,
        { data: { session: null }, error: null } as Awaited<
          ReturnType<typeof supabase.auth.getSession>
        >
      );
      const session = sessionRes?.data?.session ?? null;

      if (session?.user) {
        let dbProfileRow: Record<string, unknown> | null = null;
        try {
          const profRes = await withTimeout(
            Promise.resolve(
              supabase
                .from("profiles")
                .select("*")
                .eq("id", session.user.id)
                .maybeSingle()
            ),
            2500,
            null
          );

          if (profRes && !profRes.error && profRes.data) {
            dbProfileRow = profRes.data as Record<string, unknown>;
          }
        } catch {
          // Table may not exist yet
        }

        const overridesMap = readLocalCache<Record<string, Partial<UserProfile>>>(
          STORAGE_KEYS.PROFILE_OVERRIDES,
          {}
        );
        const userOverrides = overridesMap[session.user.id] ?? {};
        const profile: UserProfile = {
          ...mapAuthUserToProfile(session.user, dbProfileRow),
          ...userOverrides,
        };
        writeLocalCache(STORAGE_KEYS.PROFILE, profile);
        set({ userProfile: profile, isAuthLoading: false });
        await get().fetchLeaguesAndTeams();
      } else {
        if (!cachedProfile) {
          set({ userProfile: null, isAuthLoading: false });
        } else {
          set({ isAuthLoading: false });
        }
        // Even if session is not yet loaded or cached, fetch public leagues & notifications
        await get().fetchLeaguesAndTeams();
      }
    } catch (err) {
      set({
        isAuthLoading: false,
        errorBanner:
          err instanceof Error ? err.message : "Failed to initialize session.",
      });
    }
  },

  refreshProfileFromSession: async () => {
    try {
      const sessionRes = await withTimeout(
        supabase.auth.getSession(),
        2500,
        { data: { session: null }, error: null } as Awaited<
          ReturnType<typeof supabase.auth.getSession>
        >
      );
      const sessionUser = sessionRes?.data?.session?.user ?? null;
      if (!sessionUser) {
        return;
      }

      let dbProfileRow: Record<string, unknown> | null = null;
      try {
        const { data: profData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionUser.id)
          .maybeSingle();
        dbProfileRow = (profData as Record<string, unknown>) ?? null;
      } catch {
        // Ignore if table doesn't exist yet
      }

      const overridesMap = readLocalCache<Record<string, Partial<UserProfile>>>(
        STORAGE_KEYS.PROFILE_OVERRIDES,
        {}
      );
      const userOverrides = overridesMap[sessionUser.id] ?? {};
      const profile: UserProfile = {
        ...mapAuthUserToProfile(sessionUser, dbProfileRow),
        ...userOverrides,
      };
      writeLocalCache(STORAGE_KEYS.PROFILE, profile);
      set({ userProfile: profile, isAuthLoading: false });
      await get().fetchLeaguesAndTeams();
    } catch {
      set({ isAuthLoading: false });
    }
  },

  updateUserProfile: async (updates: Partial<UserProfile>) => {
    const current = get().userProfile;
    if (!current) return false;

    if (updates.imageUrl) {
      saveToImageVault(`user:${current.id}`, updates.imageUrl);
    }

    const updatedProfile: UserProfile = {
      ...current,
      ...updates,
      positions: updates.positions ?? current.positions,
      accountRoles: updates.accountRoles ?? current.accountRoles,
    };

    set({ userProfile: updatedProfile });
    writeLocalCache(STORAGE_KEYS.PROFILE, updatedProfile);

    // Persist user-specific overrides so refreshing or token re-decoding retains the latest edits
    const currentOverridesMap = readLocalCache<Record<string, Partial<UserProfile>>>(
      STORAGE_KEYS.PROFILE_OVERRIDES,
      {}
    );
    writeLocalCache(STORAGE_KEYS.PROFILE_OVERRIDES, {
      ...currentOverridesMap,
      [current.id]: {
        ...(currentOverridesMap[current.id] ?? {}),
        ...updates,
      },
    });

    // Keep all teams and roster players that correspond to this user account in sync
    const nextTeams = get().teams.map((t) => {
      let changed = false;
      const nextRoster = t.roster.map((p) => {
        const isMatched =
          p.userId === updatedProfile.id ||
          (!p.userId &&
            p.firstName.trim().toLowerCase() === current.firstName.trim().toLowerCase() &&
            p.lastName.trim().toLowerCase() === current.lastName.trim().toLowerCase());

        if (isMatched) {
          changed = true;
          return {
            ...p,
            userId: updatedProfile.id,
            firstName: updatedProfile.firstName,
            lastName: updatedProfile.lastName,
            // If user updated jerseyNumber in profile, sync as default unless overridden
            jerseyNumber:
              updates.jerseyNumber !== undefined
                ? updates.jerseyNumber
                : p.jerseyNumber,
            // If user updated avatar image in profile, sync to roster
            imageUrl:
              updates.imageUrl !== undefined
                ? updates.imageUrl
                : p.imageUrl || updatedProfile.imageUrl,
          };
        }
        return p;
      });

      return changed ? { ...t, roster: nextRoster } : t;
    });

    set({ teams: nextTeams });
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);

    try {
      // 1. Update Supabase auth user_metadata (strictly text scalars only, no large images or arrays)
      await supabase.auth.updateUser({
        data: {
          first_name: updatedProfile.firstName,
          last_name: updatedProfile.lastName,
          birthday: updatedProfile.birthday,
          address: updatedProfile.address,
          height_cm: updatedProfile.heightCm,
          weight_kg: updatedProfile.weightKg,
          positions: updatedProfile.positions,
          account_roles: updatedProfile.accountRoles,
          bio: updatedProfile.bio,
          jersey_number: updatedProfile.jerseyNumber,
          phone: updatedProfile.phone,
        },
      });

      // 2. Also update profiles table if available
      if (get().schemaStatus === "ready") {
        await supabase
          .from("profiles")
          .update({
            first_name: updatedProfile.firstName,
            last_name: updatedProfile.lastName,
            birthday: updatedProfile.birthday,
            address: updatedProfile.address,
            height_cm: updatedProfile.heightCm,
            weight_kg: updatedProfile.weightKg,
            positions: updatedProfile.positions,
            account_roles: updatedProfile.accountRoles,
            image_url: updatedProfile.imageUrl,
            bio: updatedProfile.bio,
            jersey_number: updatedProfile.jerseyNumber,
            phone: updatedProfile.phone,
          })
          .eq("id", current.id);
      }
      return true;
    } catch {
      return true; // Still persisted in local storage & memory
    }
  },

  searchRegisteredProfiles: async (query: string): Promise<UserProfile[]> => {
    const trimmed = query.trim().toLowerCase();
    const results: UserProfile[] = [];
    const seenIds = new Set<string>();

    // 1. Check current logged-in user
    const cur = get().userProfile;
    if (cur) {
      const matchName = `${cur.firstName} ${cur.lastName}`.toLowerCase().includes(trimmed);
      const matchEmail = cur.email.toLowerCase().includes(trimmed);
      if (!trimmed || matchName || matchEmail) {
        results.push(cur);
        seenIds.add(cur.id);
      }
    }

    // 2. Query Supabase profiles table if ready
    try {
      if (get().schemaStatus === "ready") {
        let q = supabase.from("profiles").select("*").limit(20);
        if (trimmed) {
          q = q.or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`);
        }
        const { data, error } = await q;
        if (!error && data) {
          for (const row of data as Record<string, unknown>[]) {
            const id = String(row.id || "");
            if (!seenIds.has(id)) {
              results.push({
                id,
                email: String(row.email || ""),
                firstName: String(row.first_name || ""),
                lastName: String(row.last_name || ""),
                birthday: String(row.birthday || ""),
                address: String(row.address || ""),
                heightCm: String(row.height_cm || ""),
                weightKg: String(row.weight_kg || ""),
                positions: (row.positions as any) || [],
                accountRoles: (row.account_roles as any) || ["PLAYER"],
                imageUrl: String(row.image_url || row.avatar_url || ""),
                bio: String(row.bio || ""),
                jerseyNumber: row.jersey_number != null ? Number(row.jersey_number) : undefined,
                phone: String(row.phone || ""),
                createdAt: String(row.created_at || ""),
              });
              seenIds.add(id);
            }
          }
        }
      }
    } catch {
      // Ignore query errors, fallback to known users
    }

    return results;
  },

  signOutUser: async () => {
    removeLocalCache(STORAGE_KEYS.PROFILE);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network error on sign out
    }
    set({
      userProfile: null,
      selectedLeagueId: null,
      activeSection: "dashboard",
    });
  },

  resetAllLocalData: () => {
    for (const key of Object.values(STORAGE_KEYS)) {
      removeLocalCache(key);
    }
    set({
      leagues: [],
      teams: [],
      followedLeagueIds: [],
      tournamentsByLeagueId: {},
      refereesByLeagueId: {},
      gameSessionsByMatchId: {},
      selectedLeagueId: null,
    });
  },

  fetchLeaguesAndTeams: async () => {
    set({ isDataLoading: true });

    try {
      const { data: leaguesData, error: leaguesErr } = await supabase
        .from("leagues")
        .select("*")
        .order("created_at", { ascending: false });

      if (leaguesErr && leaguesErr.code === "PGRST205") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const meta = user?.user_metadata ?? {};

        const deletedIds = readLocalCache<string[]>(STORAGE_KEYS.DELETED_LEAGUES, []);
        const rawLeagues = readLocalCache<LeagueRecord[]>(
          STORAGE_KEYS.LEAGUES,
          Array.isArray(meta.boxscore_leagues) ? meta.boxscore_leagues : []
        ).filter((l) => !deletedIds.includes(l.id));
        const cachedFollows = readLocalCache<string[]>(
          STORAGE_KEYS.FOLLOWS,
          Array.isArray(meta.boxscore_follows) ? meta.boxscore_follows : []
        ).filter((id) => !deletedIds.includes(id));
        const rawTeams = readLocalCache<LeagueTeam[]>(
          STORAGE_KEYS.TEAMS,
          Array.isArray(meta.boxscore_teams) ? meta.boxscore_teams : []
        ).filter((t) => !deletedIds.includes(t.leagueId));

        const hydratedLeagues = rawLeagues.map(hydrateLeagueImageFromVault);
        const hydratedTeams = rawTeams.map(hydrateTeamImagesFromVault);

        const nextTournaments: Record<string, LeagueTournamentData> = {
          ...(meta.boxscore_tournaments &&
          typeof meta.boxscore_tournaments === "object"
            ? (meta.boxscore_tournaments as Record<string, LeagueTournamentData>)
            : {}),
          ...get().tournamentsByLeagueId,
        };

        writeLocalCache(STORAGE_KEYS.LEAGUES, hydratedLeagues);
        writeLocalCache(STORAGE_KEYS.TEAMS, hydratedTeams);
        writeLocalCache(STORAGE_KEYS.TOURNAMENTS, nextTournaments);

        set({
          schemaStatus: "missing_tables",
          leagues: hydratedLeagues,
          followedLeagueIds: cachedFollows,
          teams: hydratedTeams,
          tournamentsByLeagueId: nextTournaments,
          isDataLoading: false,
        });
        return;
      }

      if (leaguesErr) {
        // If there is an error fetching from remote Supabase (network failure or quota), gracefully fallback to local cache
        const deletedIds = readLocalCache<string[]>(STORAGE_KEYS.DELETED_LEAGUES, []);
        const cachedLg = readLocalCache<LeagueRecord[]>(STORAGE_KEYS.LEAGUES, []).filter(
          (l) => !deletedIds.includes(l.id)
        );
        const cachedFoll = readLocalCache<string[]>(STORAGE_KEYS.FOLLOWS, []).filter(
          (id) => !deletedIds.includes(id)
        );
        const cachedTm = readLocalCache<LeagueTeam[]>(STORAGE_KEYS.TEAMS, []).filter(
          (t) => !deletedIds.includes(t.leagueId)
        );
        if (cachedLg.length > 0) {
          set({
            leagues: cachedLg,
            followedLeagueIds: cachedFoll,
            teams: cachedTm,
            isDataLoading: false,
          });
          return;
        }

        set({
          errorBanner: leaguesErr.message,
          isDataLoading: false,
        });
        return;
      }

      // Safely query auxiliary tables without crashing if any table (like league_members) is missing
      const profile = get().userProfile;
      const [followsRes, teamsRes, membersRes] = await Promise.all([
        profile?.id
          ? Promise.resolve(
              supabase
                .from("league_follows")
                .select("league_id")
                .eq("user_id", profile.id)
            ).catch(() => ({ data: [], error: null }))
          : Promise.resolve({ data: [], error: null }),
        Promise.resolve(
          supabase
            .from("teams")
            .select("*")
            .order("created_at", { ascending: true })
        ).catch(() => ({ data: [], error: null })),
        Promise.resolve(
          supabase
            .from("league_members")
            .select("*")
        ).catch(() => ({ data: [], error: null })),
      ]);

      const followsData = followsRes?.data ?? [];
      const teamsData = teamsRes?.data ?? [];
      const membersData = membersRes?.data ?? [];

      const deletedIds = readLocalCache<string[]>(STORAGE_KEYS.DELETED_LEAGUES, []);

      const mappedLeagues = (leaguesData ?? [])
        .map((r) => mapDbLeagueRow(r as Record<string, unknown>))
        .filter((l) => !deletedIds.includes(l.id))
        .map(hydrateLeagueImageFromVault);
      const mappedFollows = (followsData ?? []).map((r) =>
        String((r as Record<string, unknown>).league_id)
      );
      const mappedTeams = (teamsData ?? [])
        .map((r) => mapDbTeamRow(r as Record<string, unknown>))
        .map(hydrateTeamImagesFromVault);

      // Hydrate cloud-saved tournaments, referees, and game sessions from active leagues only
      const nextTournaments: Record<string, LeagueTournamentData> = {};
      const nextReferees: Record<string, LeagueReferee[]> = {};
      const nextGameSessions: Record<string, LiveGameSession> = {};

      for (const lg of mappedLeagues) {
        const rawConfig = lg.rulesConfig as LeagueRulesConfig & {
          _persistedTournament?: LeagueTournamentData | null;
          _persistedReferees?: LeagueReferee[];
          _persistedGameSessions?: Record<string, LiveGameSession>;
          _persistedMembers?: LeagueMember[];
          _persistedCategories?: LeagueCategory[];
        };

        if (Array.isArray(rawConfig?._persistedCategories) && rawConfig._persistedCategories.length > 0) {
          lg.categories = rawConfig._persistedCategories;
        }

        const dbMembers = (membersData ?? [])
          .filter(
            (m: Record<string, unknown>) => String(m.league_id) === lg.id
          )
          .map((m: Record<string, unknown>) => ({
            id: String(m.id),
            leagueId: String(m.league_id),
            userId: m.user_id ? String(m.user_id) : undefined,
            email: String(m.email),
            displayName: String(m.display_name ?? m.email),
            role: m.role as LeagueMemberRole,
            addedBy: String(m.added_by),
            createdAt: String(m.created_at ?? new Date().toISOString()),
          }));

        if (dbMembers.length > 0) {
          lg.members = dbMembers;
        } else if (Array.isArray(rawConfig?._persistedMembers) && rawConfig._persistedMembers.length > 0) {
          lg.members = rawConfig._persistedMembers;
        }
        if (rawConfig?._persistedTournament) {
          const localT = nextTournaments[lg.id];
          const cloudT = rawConfig._persistedTournament;
          if (
            !localT ||
            new Date(cloudT.updatedAt || 0).getTime() >=
              new Date(localT.updatedAt || 0).getTime()
          ) {
            nextTournaments[lg.id] = cloudT;
          }
        }
        if (
          Array.isArray(rawConfig?._persistedReferees) &&
          rawConfig._persistedReferees.length > 0 &&
          (!nextReferees[lg.id] || nextReferees[lg.id].length === 0)
        ) {
          nextReferees[lg.id] = rawConfig._persistedReferees.map((r) => ({
            ...r,
            imageUrl: r.imageUrl || getFromImageVault(`ref:${r.id}`),
          }));
        }
        if (
          rawConfig?._persistedGameSessions &&
          typeof rawConfig._persistedGameSessions === "object"
        ) {
          for (const [mId, cloudSess] of Object.entries(
            rawConfig._persistedGameSessions
          )) {
            const localSess = nextGameSessions[mId];
            if (
              !localSess ||
              new Date(cloudSess.updatedAt || 0).getTime() >=
                new Date(localSess.updatedAt || 0).getTime()
            ) {
              nextGameSessions[mId] = cloudSess;
            }
          }
        }
      }

      // Synthesize notifications from all leagues' persisted members
      const existingNotifs = readLocalCache<AppNotification[]>(
        STORAGE_KEYS.NOTIFICATIONS,
        get().notifications ?? []
      );
      const notifMap = new Map<string, AppNotification>();
      for (const n of existingNotifs) {
        notifMap.set(n.id, n);
      }

      for (const lg of mappedLeagues) {
        const members = lg.members ?? [];
        for (const m of members) {
          const notifId = `inv-${m.id}`;
          const currentExisting = notifMap.get(notifId);
          const memberStatus = m.status ?? "PENDING";
          const roleLabel =
            m.role === "ADMIN"
              ? "League Admin"
              : m.role === "OFFICIAL_SCORER"
                ? "Official Scorer"
                : m.role === "GAME_TIMER"
                  ? "Game Timer"
                  : m.role === "SHOT_CLOCK"
                    ? "Shot Clock Operator"
                    : "Table Official";

          const synthesized: AppNotification = {
            id: notifId,
            recipientEmail: m.email.trim().toLowerCase(),
            recipientUserId: m.userId,
            senderUserId: m.addedBy || lg.ownerId,
            senderName: lg.ownerName || "League Creator",
            type: "LEAGUE_ROLE_ASSIGNMENT",
            title: "League Role Invitation",
            message: `${lg.ownerName || "League Creator"} invited you to be ${roleLabel} for ${lg.name}. Accept to gain access.`,
            leagueId: lg.id,
            leagueName: lg.name,
            assignedRole: m.role,
            memberId: m.id,
            status: memberStatus,
            isRead: currentExisting ? currentExisting.isRead : false,
            createdAt: m.createdAt || lg.createdAt,
          };
          notifMap.set(notifId, synthesized);
        }
      }

      const mergedNotifications = Array.from(notifMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      writeLocalCache(STORAGE_KEYS.LEAGUES, mappedLeagues);
      writeLocalCache(STORAGE_KEYS.FOLLOWS, mappedFollows);
      writeLocalCache(STORAGE_KEYS.TEAMS, mappedTeams);
      writeLocalCache(STORAGE_KEYS.TOURNAMENTS, nextTournaments);
      writeLocalCache(STORAGE_KEYS.REFEREES, nextReferees);
      writeLocalCache(STORAGE_KEYS.GAME_SESSIONS, nextGameSessions);
      writeLocalCache(STORAGE_KEYS.NOTIFICATIONS, mergedNotifications);

      set({
        schemaStatus: "ready",
        leagues: mappedLeagues,
        followedLeagueIds: mappedFollows,
        teams: mappedTeams,
        tournamentsByLeagueId: nextTournaments,
        refereesByLeagueId: nextReferees,
        gameSessionsByMatchId: nextGameSessions,
        notifications: mergedNotifications,
        isDataLoading: false,
      });
    } catch (err) {
      // If network fetch fails (e.g., TypeError: Failed to fetch on cold start or offline), fallback gracefully to cached leagues
      const deletedIds = readLocalCache<string[]>(STORAGE_KEYS.DELETED_LEAGUES, []);
      const cachedLg = readLocalCache<LeagueRecord[]>(STORAGE_KEYS.LEAGUES, []).filter(
        (l) => !deletedIds.includes(l.id)
      );
      const cachedFoll = readLocalCache<string[]>(STORAGE_KEYS.FOLLOWS, []).filter(
        (id) => !deletedIds.includes(id)
      );
      const cachedTm = readLocalCache<LeagueTeam[]>(STORAGE_KEYS.TEAMS, []).filter(
        (t) => !deletedIds.includes(t.leagueId)
      );
      const cachedTourn = readLocalCache<Record<string, LeagueTournamentData>>(STORAGE_KEYS.TOURNAMENTS, {});

      if (cachedLg.length > 0) {
        set({
          leagues: cachedLg,
          followedLeagueIds: cachedFoll,
          teams: cachedTm,
          tournamentsByLeagueId: cachedTourn,
          isDataLoading: false,
          errorBanner: null,
        });
      } else {
        set({
          isDataLoading: false,
          errorBanner: err instanceof Error ? err.message : "Failed to load leagues.",
        });
      }
    }
  },

  setupRealtimeSubscriptions: () => {
    // 1. Supabase Realtime Postgres Changes on `leagues` table
    const leaguesChannel = supabase
      .channel("boxscore_leagues_realtime_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leagues" },
        () => {
          // Whenever a league is updated (e.g. member added/updated/removed), refresh leagues and notifications immediately
          void get().fetchLeaguesAndTeams();
        }
      )
      .on("broadcast", { event: "NOTIFICATION_EVENT" }, () => {
        void get().fetchLeaguesAndTeams();
      })
      .subscribe();

    // 2. BroadcastChannel for fast intra-browser tab communication
    let localBc: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        localBc = new BroadcastChannel("boxscore_notifications_sync");
        localBc.onmessage = () => {
          void get().fetchLeaguesAndTeams();
        };
      } catch {
        // Ignore
      }
    }

    // 3. Periodic fallback poll every 8 seconds to ensure seamless sync even if WebSocket reconnects
    const pollInterval = setInterval(() => {
      void get().fetchLeaguesAndTeams();
    }, 8000);

    return () => {
      clearInterval(pollInterval);
      try {
        leaguesChannel.unsubscribe();
      } catch {
        // Ignore
      }
      try {
        localBc?.close();
      } catch {
        // Ignore
      }
    };
  },

  createLeague: async (input) => {
    const profile = get().userProfile;
    if (!profile) return null;

    const ownerName =
      `${profile.firstName} ${profile.lastName}`.trim() || profile.email;

    const { data, error } = await supabase
      .from("leagues")
      .insert({
        owner_id: profile.id,
        owner_name: ownerName,
        name: input.name.trim(),
        image_url: input.imageUrl,
        start_date: input.startDate,
        end_date: input.endDate,
        courts: input.courts,
        rule_set_id: input.ruleSetId,
        rules_config: input.rulesConfig,
      })
      .select("*")
      .single();

    if (error && error.code === "PGRST205") {
      const fallbackLeague: LeagueRecord = {
        id: generateUUID(),
        ownerId: profile.id,
        ownerName,
        name: input.name.trim(),
        imageUrl: input.imageUrl,
        startDate: input.startDate,
        endDate: input.endDate,
        courts: input.courts,
        ruleSetId: input.ruleSetId,
        rulesConfig: input.rulesConfig,
        createdAt: new Date().toISOString(),
      };

      if (input.imageUrl) {
        saveToImageVault(`league:${fallbackLeague.id}`, input.imageUrl);
      }

      const nextLeagues = [fallbackLeague, ...get().leagues];
      writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
      set({
        leagues: nextLeagues,
        selectedLeagueId: fallbackLeague.id,
      });

      return fallbackLeague;
    }

    if (error || !data) {
      set({ errorBanner: error?.message ?? "Failed to create league." });
      return null;
    }

    const created = mapDbLeagueRow(data as Record<string, unknown>);
    if (input.imageUrl) {
      saveToImageVault(`league:${created.id}`, input.imageUrl);
    }
    const nextLeagues = [created, ...get().leagues];
    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
    set({
      leagues: nextLeagues,
      selectedLeagueId: created.id,
    });
    return created;
  },

  updateLeague: async (leagueId, input) => {
    const existing = get().leagues.find((l) => l.id === leagueId);
    if (!existing) return null;

    // Check permissions: Only league owner or assigned admin can edit the league
    const profile = get().userProfile;
    if (profile) {
      const isOwner = existing.ownerId === profile.id;
      const isAdmin = (existing.members ?? []).some(
        (m) =>
          ((m.userId && m.userId === profile.id) ||
            m.email.toLowerCase() === profile.email.toLowerCase()) &&
          m.role === "ADMIN"
      );
      if (!isOwner && !isAdmin) {
        set({
          errorBanner:
            "Permission Denied: Only the League Creator or League Admins can edit this league.",
        });
        return null;
      }
    }

    saveToImageVault(`league:${leagueId}`, input.imageUrl);

    const prevRulesRaw = existing.rulesConfig as LeagueRulesConfig &
      Record<string, unknown>;
    const mergedRulesConfig = {
      ...input.rulesConfig,
      _persistedTournament:
        get().tournamentsByLeagueId[leagueId] ??
        prevRulesRaw?._persistedTournament ??
        null,
      _persistedReferees:
        prevRulesRaw?._persistedReferees ??
        (get().refereesByLeagueId[leagueId] ?? []).map((r) => ({
          ...r,
          imageUrl: "",
        })),
      _persistedGameSessions: prevRulesRaw?._persistedGameSessions ?? {},
      _persistedMembers: existing.members ?? prevRulesRaw?._persistedMembers ?? [],
    } as LeagueRulesConfig;

    const updatedLeague: LeagueRecord = {
      ...existing,
      name: input.name.trim(),
      imageUrl: input.imageUrl,
      startDate: input.startDate,
      endDate: input.endDate,
      courts: input.courts,
      ruleSetId: input.ruleSetId,
      rulesConfig: mergedRulesConfig,
      members: existing.members ?? [],
    };

    const nextLeagues = get().leagues.map((l) =>
      l.id === leagueId ? updatedLeague : l
    );
    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
    set({ leagues: nextLeagues });

    if (get().schemaStatus === "ready") {
      const { error } = await supabase
        .from("leagues")
        .update({
          name: updatedLeague.name,
          image_url: updatedLeague.imageUrl,
          start_date: updatedLeague.startDate,
          end_date: updatedLeague.endDate,
          courts: updatedLeague.courts,
          rule_set_id: updatedLeague.ruleSetId,
          rules_config: updatedLeague.rulesConfig,
        })
        .eq("id", leagueId);

      if (error && error.code !== "PGRST205") {
        set({ errorBanner: error.message });
      }
    }

    return updatedLeague;
  },

  deleteLeague: async (leagueId) => {
    const existing = get().leagues.find((l) => l.id === leagueId);
    if (!existing) return false;

    // Strict Permission: Only the league creator/owner can delete the league
    const profile = get().userProfile;
    if (!profile || existing.ownerId !== profile.id) {
      set({
        errorBanner:
          "Permission Denied: Only the original League Creator can delete this league.",
      });
      return false;
    }

    // Persist deleted league ID tombstone to ensure it never resurrects upon reload or cache rehydration
    const deletedIds = readLocalCache<string[]>(STORAGE_KEYS.DELETED_LEAGUES, []);
    if (!deletedIds.includes(leagueId)) {
      const nextDeletedIds = [...deletedIds, leagueId];
      writeLocalCache(STORAGE_KEYS.DELETED_LEAGUES, nextDeletedIds);
    }

    const nextLeagues = get().leagues.filter((l) => l.id !== leagueId);
    const nextTeams = get().teams.filter((t) => t.leagueId !== leagueId);
    const nextFollows = get().followedLeagueIds.filter((id) => id !== leagueId);

    const nextTournaments = { ...get().tournamentsByLeagueId };
    delete nextTournaments[leagueId];

    const nextReferees = { ...get().refereesByLeagueId };
    delete nextReferees[leagueId];

    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);
    writeLocalCache(STORAGE_KEYS.FOLLOWS, nextFollows);
    writeLocalCache(STORAGE_KEYS.TOURNAMENTS, nextTournaments);
    writeLocalCache(STORAGE_KEYS.REFEREES, nextReferees);

    set({
      leagues: nextLeagues,
      teams: nextTeams,
      followedLeagueIds: nextFollows,
      tournamentsByLeagueId: nextTournaments,
      refereesByLeagueId: nextReferees,
      selectedLeagueId:
        get().selectedLeagueId === leagueId
          ? nextLeagues[0]?.id ?? null
          : get().selectedLeagueId,
    });

    // 1. Attempt server-side delete API first (clean headers without large cookies/bearer tokens)
    try {
      const res = await fetch("/api/league/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId, ownerId: profile.id }),
      });
      if (res.ok) {
        return true;
      }
    } catch {
      // Fall through to direct Supabase client fallback
    }

    // 2. Direct Supabase client fallback
    try {
      await supabase.from("leagues").delete().eq("id", leagueId);
    } catch {
      // Ignore
    }

    return true;
  },

  updateLeagueImage: async (leagueId, imageUrl) => {
    const existing = get().leagues.find((l) => l.id === leagueId);
    const profile = get().userProfile;
    if (existing && profile) {
      const isOwner = existing.ownerId === profile.id;
      const isAdmin = (existing.members ?? []).some(
        (m) =>
          ((m.userId && m.userId === profile.id) ||
            m.email.toLowerCase() === profile.email.toLowerCase()) &&
          m.role === "ADMIN"
      );
      if (!isOwner && !isAdmin) {
        set({
          errorBanner:
            "Permission Denied: Only the League Creator or League Admins can update the league logo.",
        });
        return;
      }
    }

    saveToImageVault(`league:${leagueId}`, imageUrl);
    const nextLeagues = get().leagues.map((l) =>
      l.id === leagueId ? { ...l, imageUrl } : l
    );
    set({ leagues: nextLeagues });
    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);

    if (get().schemaStatus === "ready") {
      await supabase
        .from("leagues")
        .update({ image_url: imageUrl })
        .eq("id", leagueId);
    }
  },

  addLeagueMember: async (leagueId, input) => {
    const existing = get().leagues.find((l) => l.id === leagueId);
    if (!existing) return null;

    const profile = get().userProfile;
    if (!profile || existing.ownerId !== profile.id) {
      set({
        errorBanner:
          "Permission Denied: Only the League Creator can add admins or officials to this league.",
      });
      return null;
    }

    const cleanEmail = input.email.trim().toLowerCase();
    const cleanDisplayName = input.displayName.trim() || cleanEmail;

    const newMember: LeagueMember = {
      id: generateUUID(),
      leagueId,
      email: cleanEmail,
      displayName: cleanDisplayName,
      role: input.role,
      status: "PENDING",
      addedBy: profile.id,
      createdAt: new Date().toISOString(),
    };

    const currentMembers = existing.members ?? [];
    // Replace if email already exists or append
    const nextMembers = currentMembers.some(
      (m) => m.email.toLowerCase() === newMember.email.toLowerCase()
    )
      ? currentMembers.map((m) =>
          m.email.toLowerCase() === newMember.email.toLowerCase() ? newMember : m
        )
      : [...currentMembers, newMember];

    const updatedRulesConfig = {
      ...existing.rulesConfig,
      _persistedMembers: nextMembers,
    } as LeagueRulesConfig;

    const updatedLeague: LeagueRecord = {
      ...existing,
      rulesConfig: updatedRulesConfig,
      members: nextMembers,
    };

    const nextLeagues = get().leagues.map((l) =>
      l.id === leagueId ? updatedLeague : l
    );
    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);

    // Create Notification Invitation for the invited user
    const senderName =
      `${profile.firstName} ${profile.lastName}`.trim() || profile.email;
    const roleLabel =
      input.role === "ADMIN"
        ? "League Admin"
        : input.role === "OFFICIAL_SCORER"
          ? "Official Scorer"
          : input.role === "GAME_TIMER"
            ? "Game Timer"
            : input.role === "SHOT_CLOCK"
              ? "Shot Clock Operator"
              : "Table Official";

    const newNotification: AppNotification = {
      id: generateUUID(),
      recipientEmail: cleanEmail,
      senderUserId: profile.id,
      senderName,
      type: "LEAGUE_ROLE_ASSIGNMENT",
      title: "League Role Invitation",
      message: `${senderName} invited you to be ${roleLabel} for ${existing.name}. Accept to gain access.`,
      leagueId,
      leagueName: existing.name,
      assignedRole: input.role,
      memberId: newMember.id,
      status: "PENDING",
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    const existingNotifications = readLocalCache<AppNotification[]>(
      STORAGE_KEYS.NOTIFICATIONS,
      get().notifications ?? []
    );
    const updatedNotifications = [
      newNotification,
      ...existingNotifications.filter((n) => n.id !== newNotification.id),
    ];
    writeLocalCache(STORAGE_KEYS.NOTIFICATIONS, updatedNotifications);
    set({
      leagues: nextLeagues,
      notifications: updatedNotifications,
    });

    // Broadcast notification update across tabs
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        const bc = new BroadcastChannel("boxscore_notifications_sync");
        bc.postMessage({ type: "NOTIFICATION_ADDED", notification: newNotification });
        bc.close();
      } catch {
        // Ignore
      }
    }

    // Persist to Supabase if available
    try {
      // 1. Try upserting to dedicated league_members table if schema exists
      const { error: memberTableErr } = await supabase
        .from("league_members")
        .upsert({
          id: newMember.id,
          league_id: leagueId,
          email: newMember.email,
          display_name: newMember.displayName,
          role: newMember.role,
          added_by: newMember.addedBy,
        });

      // 2. Also persist in leagues.rules_config._persistedMembers for zero-migration resilience
      await supabase
        .from("leagues")
        .update({
          rules_config: updatedRulesConfig,
        })
        .eq("id", leagueId);

      if (memberTableErr && memberTableErr.code !== "PGRST205") {
        // Log or silent fallback
      }
    } catch {
      // Offline or local mode fallback
    }

    return newMember;
  },

  removeLeagueMember: async (leagueId, memberId) => {
    const existing = get().leagues.find((l) => l.id === leagueId);
    if (!existing) return;

    const profile = get().userProfile;
    if (!profile || existing.ownerId !== profile.id) {
      set({
        errorBanner:
          "Permission Denied: Only the League Creator can remove members from this league.",
      });
      return;
    }

    const nextMembers = (existing.members ?? []).filter((m) => m.id !== memberId);
    const updatedRulesConfig = {
      ...existing.rulesConfig,
      _persistedMembers: nextMembers,
    } as LeagueRulesConfig;

    const updatedLeague: LeagueRecord = {
      ...existing,
      rulesConfig: updatedRulesConfig,
      members: nextMembers,
    };

    const nextLeagues = get().leagues.map((l) =>
      l.id === leagueId ? updatedLeague : l
    );
    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
    set({ leagues: nextLeagues });

    try {
      await supabase.from("league_members").delete().eq("id", memberId);
      await supabase
        .from("leagues")
        .update({ rules_config: updatedRulesConfig })
        .eq("id", leagueId);
    } catch {
      // Ignore
    }
  },

  addCategoryToLeague: async (leagueId, input) => {
    const existing = get().leagues.find((l) => l.id === leagueId);
    if (!existing) return null;

    const profile = get().userProfile;
    // Check permission: Owner or Admin
    if (profile) {
      const isOwner = existing.ownerId === profile.id;
      const isAdmin = (existing.members ?? []).some(
        (m) =>
          ((m.userId && m.userId === profile.id) ||
            m.email.toLowerCase() === profile.email.toLowerCase()) &&
          m.role === "ADMIN"
      );
      if (!isOwner && !isAdmin) {
        set({
          errorBanner:
            "Permission Denied: Only the League Creator or League Admins can manage categories.",
        });
        return null;
      }
    }

    const newCategory: LeagueCategory = {
      id: generateUUID(),
      leagueId,
      name: input.name.trim(),
      code: input.code?.trim().toUpperCase() || input.name.trim().slice(0, 3).toUpperCase(),
      color: input.color || "#0B2F5C",
      ageGroup: input.ageGroup?.trim() || undefined,
      ruleSetId: input.ruleSetId,
      rulesConfig: input.rulesConfig,
      formatId: input.formatId,
      poolsCount: input.poolsCount ?? 2,
      advancingPerPool: input.advancingPerPool ?? 2,
      seriesBestOf: input.seriesBestOf ?? 3,
      stepladderVariant: input.stepladderVariant ?? "PAGE_MCINTYRE_TOP4",
      createdAt: new Date().toISOString(),
    };

    const currentCats = existing.categories ?? [];
    const nextCats = [...currentCats, newCategory];

    const updatedRulesConfig = {
      ...existing.rulesConfig,
      _persistedCategories: nextCats,
    } as LeagueRulesConfig;

    const updatedLeague: LeagueRecord = {
      ...existing,
      rulesConfig: updatedRulesConfig,
      categories: nextCats,
    };

    const nextLeagues = get().leagues.map((l) =>
      l.id === leagueId ? updatedLeague : l
    );
    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
    set({ leagues: nextLeagues });

    try {
      await supabase
        .from("leagues")
        .update({ rules_config: updatedRulesConfig })
        .eq("id", leagueId);
    } catch {
      // Ignore
    }

    return newCategory;
  },

  updateCategoryInLeague: async (leagueId, categoryId, input) => {
    const existing = get().leagues.find((l) => l.id === leagueId);
    if (!existing) return;

    const currentCats = existing.categories ?? [];
    const nextCats = currentCats.map((c) =>
      c.id === categoryId ? { ...c, ...input } : c
    );

    const updatedRulesConfig = {
      ...existing.rulesConfig,
      _persistedCategories: nextCats,
    } as LeagueRulesConfig;

    const updatedLeague: LeagueRecord = {
      ...existing,
      rulesConfig: updatedRulesConfig,
      categories: nextCats,
    };

    const nextLeagues = get().leagues.map((l) =>
      l.id === leagueId ? updatedLeague : l
    );
    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
    set({ leagues: nextLeagues });

    try {
      await supabase
        .from("leagues")
        .update({ rules_config: updatedRulesConfig })
        .eq("id", leagueId);
    } catch {
      // Ignore
    }
  },

  deleteCategoryFromLeague: async (leagueId, categoryId) => {
    const existing = get().leagues.find((l) => l.id === leagueId);
    if (!existing) return;

    const currentCats = existing.categories ?? [];
    const nextCats = currentCats.filter((c) => c.id !== categoryId);

    const updatedRulesConfig = {
      ...existing.rulesConfig,
      _persistedCategories: nextCats,
    } as LeagueRulesConfig;

    const updatedLeague: LeagueRecord = {
      ...existing,
      rulesConfig: updatedRulesConfig,
      categories: nextCats,
    };

    const nextLeagues = get().leagues.map((l) =>
      l.id === leagueId ? updatedLeague : l
    );
    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
    set({ leagues: nextLeagues });

    try {
      await supabase
        .from("leagues")
        .update({ rules_config: updatedRulesConfig })
        .eq("id", leagueId);
    } catch {
      // Ignore
    }
  },

  updateLeagueMemberRole: async (leagueId, memberId, role) => {
    const existing = get().leagues.find((l) => l.id === leagueId);
    if (!existing) return;

    const profile = get().userProfile;
    if (!profile || existing.ownerId !== profile.id) {
      set({
        errorBanner:
          "Permission Denied: Only the League Creator can update roles for this league.",
      });
      return;
    }

    const nextMembers = (existing.members ?? []).map((m) =>
      m.id === memberId ? { ...m, role } : m
    );
    const updatedRulesConfig = {
      ...existing.rulesConfig,
      _persistedMembers: nextMembers,
    } as LeagueRulesConfig;

    const updatedLeague: LeagueRecord = {
      ...existing,
      rulesConfig: updatedRulesConfig,
      members: nextMembers,
    };

    const nextLeagues = get().leagues.map((l) =>
      l.id === leagueId ? updatedLeague : l
    );
    writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
    set({ leagues: nextLeagues });

    try {
      await supabase
        .from("league_members")
        .update({ role })
        .eq("id", memberId);
      await supabase
        .from("leagues")
        .update({ rules_config: updatedRulesConfig })
        .eq("id", leagueId);
    } catch {
      // Ignore
    }
  },

  acceptLeagueRoleInvitation: async (notificationId: string) => {
    const notifications = readLocalCache<AppNotification[]>(
      STORAGE_KEYS.NOTIFICATIONS,
      get().notifications ?? []
    );
    // Find notification by direct id or by memberId (e.g. inv-5b927c...)
    const targetNotif = notifications.find(
      (n) =>
        n.id === notificationId ||
        `inv-${n.memberId}` === notificationId ||
        n.id === `inv-${notificationId}`
    );
    if (!targetNotif) return false;

    const profile = get().userProfile;
    const targetLeague = get().leagues.find((l) => l.id === targetNotif.leagueId);

    // 1. Update notification status to ACCEPTED
    const updatedNotifications = notifications.map((n) =>
      n.id === targetNotif.id || n.memberId === targetNotif.memberId
        ? { ...n, status: "ACCEPTED" as const, isRead: true }
        : n
    );
    writeLocalCache(STORAGE_KEYS.NOTIFICATIONS, updatedNotifications);
    set({ notifications: updatedNotifications });

    // 2. Update league member status to ACCEPTED and link profile.id if available
    if (targetLeague) {
      const currentMembers = targetLeague.members ?? [];
      const updatedMembers = currentMembers.map((m) => {
        if (
          m.id === targetNotif.memberId ||
          m.email.toLowerCase() === targetNotif.recipientEmail.toLowerCase()
        ) {
          return {
            ...m,
            status: "ACCEPTED" as const,
            userId: profile?.id || m.userId,
          };
        }
        return m;
      });

      const updatedRulesConfig = {
        ...targetLeague.rulesConfig,
        _persistedMembers: updatedMembers,
      } as LeagueRulesConfig;

      const updatedLeague: LeagueRecord = {
        ...targetLeague,
        rulesConfig: updatedRulesConfig,
        members: updatedMembers,
      };

      const nextLeagues = get().leagues.map((l) =>
        l.id === targetLeague.id ? updatedLeague : l
      );
      writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
      set({ leagues: nextLeagues });

      // Sync to Supabase
      try {
        await supabase
          .from("league_members")
          .update({
            user_id: profile?.id,
          })
          .eq("id", targetNotif.memberId);

        await supabase
          .from("leagues")
          .update({ rules_config: updatedRulesConfig })
          .eq("id", targetLeague.id);
      } catch {
        // Fallback local ok
      }
    }

    // Broadcast update across tabs
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        const bc = new BroadcastChannel("boxscore_notifications_sync");
        bc.postMessage({ type: "NOTIFICATION_ACCEPTED", notificationId: targetNotif.id });
        bc.close();
      } catch {
        // Ignore
      }
    }

    return true;
  },

  declineLeagueRoleInvitation: async (notificationId: string) => {
    const notifications = readLocalCache<AppNotification[]>(
      STORAGE_KEYS.NOTIFICATIONS,
      get().notifications ?? []
    );
    const targetNotif = notifications.find(
      (n) =>
        n.id === notificationId ||
        `inv-${n.memberId}` === notificationId ||
        n.id === `inv-${notificationId}`
    );
    if (!targetNotif) return false;

    // 1. Update notification status to DECLINED
    const updatedNotifications = notifications.map((n) =>
      n.id === targetNotif.id || n.memberId === targetNotif.memberId
        ? { ...n, status: "DECLINED" as const, isRead: true }
        : n
    );
    writeLocalCache(STORAGE_KEYS.NOTIFICATIONS, updatedNotifications);
    set({ notifications: updatedNotifications });

    // 2. Update league member status to DECLINED
    const targetLeague = get().leagues.find((l) => l.id === targetNotif.leagueId);
    if (targetLeague) {
      const currentMembers = targetLeague.members ?? [];
      const updatedMembers = currentMembers.map((m) => {
        if (
          m.id === targetNotif.memberId ||
          m.email.toLowerCase() === targetNotif.recipientEmail.toLowerCase()
        ) {
          return {
            ...m,
            status: "DECLINED" as const,
          };
        }
        return m;
      });

      const updatedRulesConfig = {
        ...targetLeague.rulesConfig,
        _persistedMembers: updatedMembers,
      } as LeagueRulesConfig;

      const updatedLeague: LeagueRecord = {
        ...targetLeague,
        rulesConfig: updatedRulesConfig,
        members: updatedMembers,
      };

      const nextLeagues = get().leagues.map((l) =>
        l.id === targetLeague.id ? updatedLeague : l
      );
      writeLocalCache(STORAGE_KEYS.LEAGUES, nextLeagues);
      set({ leagues: nextLeagues });

      try {
        await supabase
          .from("leagues")
          .update({ rules_config: updatedRulesConfig })
          .eq("id", targetLeague.id);
      } catch {
        // Fallback local ok
      }
    }

    // Broadcast update across tabs
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        const bc = new BroadcastChannel("boxscore_notifications_sync");
        bc.postMessage({ type: "NOTIFICATION_DECLINED", notificationId: targetNotif.id });
        bc.close();
      } catch {
        // Ignore
      }
    }

    return true;
  },

  markNotificationAsRead: (notificationId: string) => {
    const notifications = readLocalCache<AppNotification[]>(
      STORAGE_KEYS.NOTIFICATIONS,
      get().notifications ?? []
    );
    const updatedNotifications = notifications.map((n) =>
      n.id === notificationId ? { ...n, isRead: true } : n
    );
    writeLocalCache(STORAGE_KEYS.NOTIFICATIONS, updatedNotifications);
    set({ notifications: updatedNotifications });
  },


  toggleFollowLeague: async (leagueId) => {
    const profile = get().userProfile;
    if (!profile) return;

    const currentlyFollowing = get().followedLeagueIds.includes(leagueId);
    const nextFollows = currentlyFollowing
      ? get().followedLeagueIds.filter((id) => id !== leagueId)
      : [...get().followedLeagueIds, leagueId];

    set({ followedLeagueIds: nextFollows });
    writeLocalCache(STORAGE_KEYS.FOLLOWS, nextFollows);

    if (currentlyFollowing) {
      await supabase
        .from("league_follows")
        .delete()
        .eq("user_id", profile.id)
        .eq("league_id", leagueId);
    } else {
      await supabase.from("league_follows").insert({
        user_id: profile.id,
        league_id: leagueId,
      });
    }
  },

  createTeamInLeague: async (input) => {
    const profile = get().userProfile;
    if (!profile) return null;

    const staffObjects: AssistantCoachMember[] =
      input.assistantCoachStaff && input.assistantCoachStaff.length > 0
        ? input.assistantCoachStaff
        : input.assistantCoaches.map((name, i) => ({
            id: `ac-${Date.now()}-${i}`,
            name,
            imageUrl: "",
          }));

    let res = await supabase
      .from("teams")
      .insert({
        league_id: input.leagueId,
        category_id: input.categoryId ?? null,
        category_name: input.categoryName ?? "",
        created_by: profile.id,
        name: input.name.trim(),
        image_url: input.imageUrl,
        primary_color: input.primaryColor,
        secondary_color: input.secondaryColor,
        head_coach: input.headCoach.trim(),
        head_coach_image_url: input.headCoachImageUrl ?? "",
        assistant_coaches: input.assistantCoaches,
        assistant_coach_staff: staffObjects,
        manager: input.manager.trim(),
        manager_image_url: input.managerImageUrl ?? "",
        captain_player_id: input.captainPlayerId,
        roster: input.roster,
      })
      .select("*")
      .single();

    // If Supabase schema lacks the new category_id/category_name columns (PGRST204), retry insert without them
    if (res.error && (res.error.code === "PGRST204" || res.error.message?.includes("category_id") || res.error.message?.includes("category_name"))) {
      res = await supabase
        .from("teams")
        .insert({
          league_id: input.leagueId,
          created_by: profile.id,
          name: input.name.trim(),
          image_url: input.imageUrl,
          primary_color: input.primaryColor,
          secondary_color: input.secondaryColor,
          head_coach: input.headCoach.trim(),
          head_coach_image_url: input.headCoachImageUrl ?? "",
          assistant_coaches: input.assistantCoaches,
          assistant_coach_staff: staffObjects,
          manager: input.manager.trim(),
          manager_image_url: input.managerImageUrl ?? "",
          captain_player_id: input.captainPlayerId,
          roster: input.roster,
        })
        .select("*")
        .single();
    }

    const { data, error } = res;

    if (error && error.code === "PGRST205") {
      const teamId = generateUUID();
      saveToImageVault(`team:${teamId}`, input.imageUrl);
      saveToImageVault(`hc:${teamId}`, input.headCoachImageUrl);
      saveToImageVault(`mgr:${teamId}`, input.managerImageUrl);
      for (const ac of staffObjects) {
        saveToImageVault(`ac:${teamId}:${ac.id}`, ac.imageUrl);
      }
      for (const p of input.roster) {
        saveToImageVault(`player:${p.id}`, p.imageUrl);
      }

      const fallbackTeam: LeagueTeam = {
        id: teamId,
        leagueId: input.leagueId,
        categoryId: input.categoryId ?? null,
        categoryName: input.categoryName,
        createdBy: profile.id,
        name: input.name.trim(),
        imageUrl: input.imageUrl,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        headCoach: input.headCoach.trim(),
        headCoachImageUrl: input.headCoachImageUrl ?? "",
        assistantCoaches: input.assistantCoaches,
        assistantCoachStaff: staffObjects,
        manager: input.manager.trim(),
        managerImageUrl: input.managerImageUrl ?? "",
        captainPlayerId: input.captainPlayerId,
        roster: input.roster,
        createdAt: new Date().toISOString(),
      };

      const nextTeams = [...get().teams, fallbackTeam];
      writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);
      set({ teams: nextTeams });
      await syncTeamsToUserMetadata(nextTeams);

      return fallbackTeam;
    }

    if (error || !data) {
      set({ errorBanner: error?.message ?? "Failed to create team." });
      return null;
    }

    const createdTeam = mapDbTeamRow(data as Record<string, unknown>);
    saveToImageVault(`team:${createdTeam.id}`, input.imageUrl);
    saveToImageVault(`hc:${createdTeam.id}`, input.headCoachImageUrl);
    saveToImageVault(`mgr:${createdTeam.id}`, input.managerImageUrl);
    for (const ac of staffObjects) {
      saveToImageVault(`ac:${createdTeam.id}:${ac.id}`, ac.imageUrl);
    }
    for (const p of input.roster) {
      saveToImageVault(`player:${p.id}`, p.imageUrl);
    }

    const nextTeams = [...get().teams, createdTeam];
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);
    set({ teams: nextTeams });
    return createdTeam;
  },

  bulkCreateTeamsInLeague: async (leagueId, teamsInput) => {
    let count = 0;
    for (const input of teamsInput) {
      const res = await get().createTeamInLeague({
        ...input,
        leagueId,
      });
      if (res) count++;
    }
    return count;
  },

  updateTeamInLeague: async (teamId, input) => {
    const existing = get().teams.find((t) => t.id === teamId);
    if (!existing) return null;

    const staffObjects: AssistantCoachMember[] =
      input.assistantCoachStaff && input.assistantCoachStaff.length > 0
        ? input.assistantCoachStaff
        : input.assistantCoaches.map((name, i) => ({
            id: `${teamId}-ac-${i}`,
            name,
            imageUrl: "",
          }));

    saveToImageVault(`team:${teamId}`, input.imageUrl);
    saveToImageVault(`hc:${teamId}`, input.headCoachImageUrl);
    saveToImageVault(`mgr:${teamId}`, input.managerImageUrl);
    for (const ac of staffObjects) {
      saveToImageVault(`ac:${teamId}:${ac.id}`, ac.imageUrl);
    }
    for (const p of input.roster) {
      saveToImageVault(`player:${p.id}`, p.imageUrl);
    }

    const updatedTeam: LeagueTeam = {
      ...existing,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      categoryName: input.categoryName !== undefined ? input.categoryName : existing.categoryName,
      name: input.name.trim(),
      imageUrl: input.imageUrl,
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      headCoach: input.headCoach.trim(),
      headCoachImageUrl: input.headCoachImageUrl ?? "",
      assistantCoaches: staffObjects.map((ac) => ac.name),
      assistantCoachStaff: staffObjects,
      manager: input.manager.trim(),
      managerImageUrl: input.managerImageUrl ?? "",
      captainPlayerId: input.captainPlayerId,
      roster: input.roster,
    };

    const nextTeams = get().teams.map((t) =>
      t.id === teamId ? updatedTeam : t
    );
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);
    set({ teams: nextTeams });

    if (get().schemaStatus === "ready") {
      let updateRes = await supabase
        .from("teams")
        .update({
          name: updatedTeam.name,
          category_id: updatedTeam.categoryId ?? null,
          category_name: updatedTeam.categoryName ?? "",
          image_url: updatedTeam.imageUrl,
          primary_color: updatedTeam.primaryColor,
          secondary_color: updatedTeam.secondaryColor,
          head_coach: updatedTeam.headCoach,
          head_coach_image_url: updatedTeam.headCoachImageUrl,
          assistant_coaches: updatedTeam.assistantCoaches,
          assistant_coach_staff: updatedTeam.assistantCoachStaff,
          manager: updatedTeam.manager,
          manager_image_url: updatedTeam.managerImageUrl,
          captain_player_id: updatedTeam.captainPlayerId,
          roster: updatedTeam.roster,
        })
        .eq("id", teamId);

      if (updateRes.error && (updateRes.error.code === "PGRST204" || updateRes.error.message?.includes("category_id") || updateRes.error.message?.includes("category_name"))) {
        updateRes = await supabase
          .from("teams")
          .update({
            name: updatedTeam.name,
            image_url: updatedTeam.imageUrl,
            primary_color: updatedTeam.primaryColor,
            secondary_color: updatedTeam.secondaryColor,
            head_coach: updatedTeam.headCoach,
            head_coach_image_url: updatedTeam.headCoachImageUrl,
            assistant_coaches: updatedTeam.assistantCoaches,
            assistant_coach_staff: updatedTeam.assistantCoachStaff,
            manager: updatedTeam.manager,
            manager_image_url: updatedTeam.managerImageUrl,
            captain_player_id: updatedTeam.captainPlayerId,
            roster: updatedTeam.roster,
          })
          .eq("id", teamId);
      }

      if (updateRes.error && updateRes.error.code !== "PGRST205") {
        set({ errorBanner: updateRes.error.message });
      }
    } else {
      await syncTeamsToUserMetadata(nextTeams);
    }

    return updatedTeam;
  },

  deleteTeamFromLeague: async (teamId) => {
    const nextTeams = get().teams.filter((t) => t.id !== teamId);
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);
    set({ teams: nextTeams });

    if (get().schemaStatus === "ready") {
      await supabase.from("teams").delete().eq("id", teamId);
    } else {
      await syncTeamsToUserMetadata(nextTeams);
    }
  },

  updateTeamLogo: async (teamId, imageUrl) => {
    saveToImageVault(`team:${teamId}`, imageUrl);
    const nextTeams = get().teams.map((t) =>
      t.id === teamId ? { ...t, imageUrl } : t
    );
    set({ teams: nextTeams });
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);

    if (get().schemaStatus === "ready") {
      await supabase
        .from("teams")
        .update({ image_url: imageUrl })
        .eq("id", teamId);
    }
  },

  updateTeamStaffPhoto: async (teamId, role, imageUrl, assistantId) => {
    const target = get().teams.find((t) => t.id === teamId);
    if (!target) return;

    if (role === "headCoach") {
      saveToImageVault(`hc:${teamId}`, imageUrl);
    } else if (role === "manager") {
      saveToImageVault(`mgr:${teamId}`, imageUrl);
    } else if (role === "assistant" && assistantId) {
      saveToImageVault(`ac:${teamId}:${assistantId}`, imageUrl);
    }

    const nextTeams = get().teams.map((t) => {
      if (t.id !== teamId) return t;
      if (role === "headCoach") {
        return { ...t, headCoachImageUrl: imageUrl };
      }
      if (role === "manager") {
        return { ...t, managerImageUrl: imageUrl };
      }
      const nextStaff = (t.assistantCoachStaff ?? []).map((ac) =>
        ac.id === assistantId ? { ...ac, imageUrl } : ac
      );
      return { ...t, assistantCoachStaff: nextStaff };
    });

    set({ teams: nextTeams });
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);

    if (get().schemaStatus === "ready") {
      const updated = nextTeams.find((t) => t.id === teamId);
      if (updated) {
        await supabase
          .from("teams")
          .update({
            head_coach_image_url: updated.headCoachImageUrl,
            manager_image_url: updated.managerImageUrl,
            assistant_coach_staff: updated.assistantCoachStaff,
          })
          .eq("id", teamId);
      }
    }
  },

  updateRosterPlayerPhoto: async (teamId, playerId, imageUrl) => {
    saveToImageVault(`player:${playerId}`, imageUrl);
    const nextTeams = get().teams.map((t) => {
      if (t.id !== teamId) return t;
      return {
        ...t,
        roster: t.roster.map((p) =>
          p.id === playerId ? { ...p, imageUrl } : p
        ),
      };
    });

    set({ teams: nextTeams });
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);

    if (get().schemaStatus === "ready") {
      const updated = nextTeams.find((t) => t.id === teamId);
      if (updated) {
        await supabase
          .from("teams")
          .update({ roster: updated.roster })
          .eq("id", teamId);
      }
    } else {
      await syncTeamsToUserMetadata(nextTeams);
    }
  },

  updateRosterPlayerJersey: async (teamId, playerId, jerseyNumber) => {
    const nextTeams = get().teams.map((t) => {
      if (t.id !== teamId) return t;
      return {
        ...t,
        roster: t.roster.map((p) =>
          p.id === playerId ? { ...p, jerseyNumber } : p
        ),
      };
    });

    set({ teams: nextTeams });
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);

    if (get().schemaStatus === "ready") {
      const updated = nextTeams.find((t) => t.id === teamId);
      if (updated) {
        await supabase
          .from("teams")
          .update({ roster: updated.roster })
          .eq("id", teamId);
      }
    } else {
      await syncTeamsToUserMetadata(nextTeams);
    }
  },

  getLinkedAccountForPlayer: async (player: RosterPlayer): Promise<UserProfile | null> => {
    const current = get().userProfile;
    if (
      current &&
      (player.userId === current.id ||
        (player.firstName.trim().toLowerCase() === current.firstName.trim().toLowerCase() &&
          player.lastName.trim().toLowerCase() === current.lastName.trim().toLowerCase()))
    ) {
      return current;
    }

    if (player.userId) {
      const allUsers = await get().searchRegisteredProfiles("");
      const found = allUsers.find((u) => u.id === player.userId);
      if (found) return found;
    }

    const byName = await get().searchRegisteredProfiles(`${player.firstName} ${player.lastName}`);
    return (
      byName.find(
        (u) =>
          u.firstName.trim().toLowerCase() === player.firstName.trim().toLowerCase() &&
          u.lastName.trim().toLowerCase() === player.lastName.trim().toLowerCase()
      ) ?? null
    );
  },

  revertRosterPlayerToAccount: async (teamId, playerId) => {
    const targetTeam = get().teams.find((t) => t.id === teamId);
    if (!targetTeam) return false;
    const player = targetTeam.roster.find((p) => p.id === playerId);
    if (!player) return false;

    const account = await get().getLinkedAccountForPlayer(player);
    if (!account) return false;

    const defaultJersey = account.jerseyNumber !== undefined ? account.jerseyNumber : player.jerseyNumber;
    const defaultImage = account.imageUrl || getFromImageVault(`user:${account.id}`) || "";

    // Clear custom image in vault for this player so it falls back to account photo
    if (defaultImage) {
      saveToImageVault(`player:${playerId}`, defaultImage);
    } else {
      saveToImageVault(`player:${playerId}`, "");
    }

    const nextTeams = get().teams.map((t) => {
      if (t.id !== teamId) return t;
      return {
        ...t,
        roster: t.roster.map((p) => {
          if (p.id !== playerId) return p;
          return {
            ...p,
            userId: account.id,
            firstName: account.firstName,
            lastName: account.lastName,
            jerseyNumber: defaultJersey,
            imageUrl: defaultImage,
          };
        }),
      };
    });

    set({ teams: nextTeams });
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);

    if (get().schemaStatus === "ready") {
      const updated = nextTeams.find((t) => t.id === teamId);
      if (updated) {
        await supabase
          .from("teams")
          .update({ roster: updated.roster })
          .eq("id", teamId);
      }
    } else {
      await syncTeamsToUserMetadata(nextTeams);
    }

    return true;
  },

  setTeamCaptain: async (teamId, playerId) => {
    const targetTeam = get().teams.find((t) => t.id === teamId);
    if (!targetTeam) return;

    const updatedRoster = targetTeam.roster.map((p) => ({
      ...p,
      isCaptain: p.id === playerId,
    }));

    const nextTeams = get().teams.map((t) =>
      t.id === teamId
        ? { ...t, captainPlayerId: playerId, roster: updatedRoster }
        : t
    );

    set({ teams: nextTeams });
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);

    if (get().schemaStatus === "ready") {
      await supabase
        .from("teams")
        .update({
          captain_player_id: playerId,
          roster: updatedRoster,
        })
        .eq("id", teamId);
    } else {
      await syncTeamsToUserMetadata(nextTeams);
    }
  },

  addPlayerToExistingTeam: async (teamId, player) => {
    const targetTeam = get().teams.find((t) => t.id === teamId);
    if (!targetTeam) return;

    if (player.imageUrl) {
      saveToImageVault(`player:${player.id}`, player.imageUrl);
    }

    const updatedRoster = [
      ...targetTeam.roster.map((p) =>
        player.isCaptain ? { ...p, isCaptain: false } : p
      ),
      player,
    ];
    const nextCaptainId = player.isCaptain
      ? player.id
      : targetTeam.captainPlayerId ??
        (updatedRoster.length === 1 ? player.id : null);

    const finalRoster = updatedRoster.map((p) => ({
      ...p,
      isCaptain: p.id === nextCaptainId,
    }));

    const nextTeams = get().teams.map((t) =>
      t.id === teamId
        ? { ...t, captainPlayerId: nextCaptainId, roster: finalRoster }
        : t
    );

    set({ teams: nextTeams });
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);

    if (get().schemaStatus === "ready") {
      await supabase
        .from("teams")
        .update({
          captain_player_id: nextCaptainId,
          roster: finalRoster,
        })
        .eq("id", teamId);
    } else {
      await syncTeamsToUserMetadata(nextTeams);
    }
  },

  bulkAddPlayersToTeam: async (teamId, newPlayers) => {
    const targetTeam = get().teams.find((t) => t.id === teamId);
    if (!targetTeam || newPlayers.length === 0) return 0;

    for (const player of newPlayers) {
      if (player.imageUrl) {
        saveToImageVault(`player:${player.id}`, player.imageUrl);
      }
    }

    const updatedRoster = [...targetTeam.roster];
    let hasCaptainAssigned = Boolean(
      updatedRoster.some((p) => p.isCaptain) || targetTeam.captainPlayerId
    );

    for (const player of newPlayers) {
      // If player marked captain and captain wasn't set, or player marked captain:
      if (player.isCaptain) {
        updatedRoster.forEach((p) => (p.isCaptain = false));
        hasCaptainAssigned = true;
      }
      updatedRoster.push(player);
    }

    const nextCaptainId =
      updatedRoster.find((p) => p.isCaptain)?.id ??
      targetTeam.captainPlayerId ??
      updatedRoster[0]?.id ??
      null;

    const finalRoster = updatedRoster.map((p) => ({
      ...p,
      isCaptain: p.id === nextCaptainId,
    }));

    const nextTeams = get().teams.map((t) =>
      t.id === teamId
        ? { ...t, captainPlayerId: nextCaptainId, roster: finalRoster }
        : t
    );

    set({ teams: nextTeams });
    writeLocalCache(STORAGE_KEYS.TEAMS, nextTeams);

    if (get().schemaStatus === "ready") {
      await supabase
        .from("teams")
        .update({
          captain_player_id: nextCaptainId,
          roster: finalRoster,
        })
        .eq("id", teamId);
    } else {
      await syncTeamsToUserMetadata(nextTeams);
    }

    return newPlayers.length;
  },
}));
