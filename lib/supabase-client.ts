import { createClient, User } from "@supabase/supabase-js";
import { BASKETBALL_RULEBOOK_PRESETS } from "@/lib/basketball-rules";
import { idbGet, idbSet, idbRemove } from "@/lib/idb-storage";
import {
  AssistantCoachMember,
  LeagueCategory,
  LeagueCourt,
  LeagueMember,
  LeagueRecord,
  LeagueRulesConfig,
  LeagueTeam,
  PlayerPosition,
  RosterPlayer,
  RuleSetId,
  UserAccountRole,
  UserProfile,
} from "@/types/boxscore";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://sbqnrxqgahfhbmlevtgf.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_0bvxzS5v5zv2x64iKgFLsQ_Prmyjy3f";

/**
 * Custom robust storage adapter for Supabase Auth.
 * Automatically tries window.localStorage first. If localStorage throws a QuotaExceededError
 * or is full, it seamlessly falls back to IndexedDB so authentication sessions NEVER fail.
 */
const customAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    try {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    } catch {
      // localStorage read error or blocked
    }
    // Fallback to IndexedDB
    try {
      const idbVal = await idbGet<string>(key);
      return idbVal ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
      // Also mirror to IndexedDB for safety
      void idbSet(key, value);
    } catch (err) {
      // Quota exceeded in localStorage! Safely save to IndexedDB
      try {
        await idbSet(key, value);
      } catch {
        // Ignore if both blocked
      }
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
    try {
      await idbRemove(key);
    } catch {
      // Ignore
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: customAuthStorage,
  },
});

export function mapAuthUserToProfile(
  user: User,
  dbRow?: Record<string, unknown> | null
): UserProfile {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? "",
    firstName: String(dbRow?.first_name ?? meta.first_name ?? ""),
    lastName: String(dbRow?.last_name ?? meta.last_name ?? ""),
    birthday: String(dbRow?.birthday ?? meta.birthday ?? ""),
    address: String(dbRow?.address ?? meta.address ?? ""),
    heightCm: String(dbRow?.height_cm ?? meta.height_cm ?? ""),
    weightKg: String(dbRow?.weight_kg ?? meta.weight_kg ?? ""),
    positions: Array.isArray(dbRow?.positions)
      ? (dbRow.positions as PlayerPosition[])
      : Array.isArray(meta.positions)
        ? (meta.positions as PlayerPosition[])
        : [],
    accountRoles: Array.isArray(dbRow?.account_roles)
      ? (dbRow.account_roles as UserAccountRole[])
      : Array.isArray(meta.account_roles)
        ? (meta.account_roles as UserAccountRole[])
        : [],
    imageUrl: String(dbRow?.image_url ?? meta.image_url ?? dbRow?.avatar_url ?? meta.avatar_url ?? ""),
    bio: String(dbRow?.bio ?? meta.bio ?? ""),
    jerseyNumber: dbRow?.jersey_number != null ? Number(dbRow.jersey_number) : meta.jersey_number != null ? Number(meta.jersey_number) : undefined,
    phone: String(dbRow?.phone ?? meta.phone ?? ""),
    createdAt: user.created_at ?? new Date().toISOString(),
  };
}

export function mapDbLeagueRow(row: Record<string, unknown>): LeagueRecord {
  const ruleSetId = (row.rule_set_id as RuleSetId) || "FIBA";
  const rulesConfig =
    row.rules_config && typeof row.rules_config === "object"
      ? (row.rules_config as LeagueRulesConfig)
      : BASKETBALL_RULEBOOK_PRESETS[ruleSetId] ??
        BASKETBALL_RULEBOOK_PRESETS.FIBA;

  const rawRules = rulesConfig as unknown as Record<string, unknown>;
  const members = Array.isArray(row.members)
    ? (row.members as LeagueMember[])
    : Array.isArray(rawRules?._persistedMembers)
      ? (rawRules._persistedMembers as LeagueMember[])
      : [];

  const categories = Array.isArray(row.categories)
    ? (row.categories as LeagueCategory[])
    : Array.isArray(rawRules?._persistedCategories)
      ? (rawRules._persistedCategories as LeagueCategory[])
      : [];

  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    ownerName: String(row.owner_name ?? "League Commissioner"),
    name: String(row.name),
    imageUrl: String(row.image_url ?? ""),
    startDate: String(row.start_date ?? ""),
    endDate: String(row.end_date ?? ""),
    courts: Array.isArray(row.courts) ? (row.courts as LeagueCourt[]) : [],
    ruleSetId,
    rulesConfig,
    members,
    categories,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export function mapDbTeamRow(row: Record<string, unknown>): LeagueTeam {
  const rawAssistants = Array.isArray(row.assistant_coaches)
    ? (row.assistant_coaches as string[])
    : [];
  const rawStaff = Array.isArray(row.assistant_coach_staff)
    ? (row.assistant_coach_staff as AssistantCoachMember[])
    : rawAssistants.map((name, i) => ({
        id: `ac-${i}`,
        name,
        imageUrl: "",
      }));

  return {
    id: String(row.id),
    leagueId: String(row.league_id),
    categoryId: row.category_id ? String(row.category_id) : null,
    categoryName: row.category_name ? String(row.category_name) : undefined,
    createdBy: String(row.created_by),
    name: String(row.name),
    initials: row.initials ? String(row.initials) : undefined,
    imageUrl: String(row.image_url ?? ""),
    primaryColor: String(row.primary_color ?? "#8B0D0E"),
    secondaryColor: String(row.secondary_color ?? "#0B2F5C"),
    headCoach: String(row.head_coach ?? ""),
    headCoachImageUrl: String(row.head_coach_image_url ?? ""),
    assistantCoaches: rawAssistants,
    assistantCoachStaff: rawStaff,
    manager: String(row.manager ?? ""),
    managerImageUrl: String(row.manager_image_url ?? ""),
    captainPlayerId: row.captain_player_id
      ? String(row.captain_player_id)
      : null,
    roster: Array.isArray(row.roster) ? (row.roster as RosterPlayer[]) : [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}
